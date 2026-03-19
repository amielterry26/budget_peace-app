# Budget Peace — Full Project Assessment

**Date:** 2026-03-13
**Status:** NOT RUNNABLE — multiple blockers exist before the app can start

---

## Project Overview

**What it is:** A personal finance SPA for tracking pay periods, expenses, and cards.
**Stack:** Node.js/Express backend, vanilla JS frontend (no framework), AWS DynamoDB, plain CSS.
**Deployment target:** Heroku (Procfile present).

---

## Architecture Summary

```
public/index.html  →  SPA shell (nav, main content, FAB)
public/js/router.js →  Minimal hash-based router
public/js/app.js    →  Nav setup, auth check, route init
public/js/pages/*   →  6 page modules (home, pay-period, budgets, expenses, cards, onboarding)
server.js           →  Express static server + 4 API route files
routes/*            →  users, budgets, expenses, cards (DynamoDB CRUD)
lib/generatePeriods →  Budget period generation logic
config/dynamo.js    →  DynamoDB client setup
```

### Directory Structure

```
/budget-peace/
├── config/
│   └── dynamo.js              # DynamoDB client configuration
├── lib/
│   └── generatePeriods.js     # Budget period generation logic
├── public/
│   ├── index.html             # Single Page App shell
│   ├── css/
│   │   └── main.css           # 39KB design system + UI styles
│   └── js/
│       ├── app.js             # App shell & navigation setup
│       ├── router.js          # Minimal hash-based router
│       └── pages/
│           ├── home.js        # Financial health dashboard
│           ├── pay-period.js  # Operational budget view
│           ├── budgets.js     # All periods list
│           ├── expenses.js    # Expense management
│           ├── cards.js       # Card management
│           └── onboarding.js  # 4-step setup wizard
├── routes/
│   ├── users.js               # User onboarding & profile
│   ├── budgets.js             # Budget periods queries
│   ├── expenses.js            # Expense CRUD operations
│   └── cards.js               # Card CRUD operations
├── scripts/
│   └── setup-dynamo.js        # DynamoDB table creation script
├── package.json
├── package-lock.json
├── server.js                  # Express server entry point
├── Procfile                   # Heroku deployment config
└── .gitignore
```

### Tech Stack Details

**Backend:**
- Node.js + Express.js
- AWS DynamoDB for database
- AWS SDK v3 for DynamoDB operations
- dotenv for environment configuration
- Nodemon for dev server

**Frontend:**
- Vanilla JavaScript (no framework)
- Minimal hash-based router (custom implementation)
- Single Page Application (SPA)
- localStorage for user session persistence (only stores userId)
- Fetch API for HTTP requests

**Design & Styling:**
- Pure CSS (no preprocessor)
- Custom Design System with CSS Variables
- Mobile-first responsive design
- System fonts: Inter from Google Fonts
- Color palette: Sage green (#4A7C59) primary, Light gray (#F4F6F8) bg, Navy (#0F172A) text

### API Routes

```
POST   /api/users                    — User onboarding (creates user + all budget periods)
GET    /api/users/:userId            — Fetch user profile
GET    /api/budgets/:userId          — Fetch all periods
GET    /api/expenses/:userId         — Fetch user expenses
POST   /api/expenses                 — Create expense
PUT    /api/expenses/:userId/:expenseId — Update expense
DELETE /api/expenses/:userId/:expenseId — Delete expense
GET    /api/cards/:userId            — Fetch user cards
POST   /api/cards                    — Create card
PUT    /api/cards/:userId/:cardId    — Update card
DELETE /api/cards/:userId/:cardId    — Delete card
```

### DynamoDB Tables (4 tables, PAY_PER_REQUEST billing)

1. **bp_users** — PK: `userId` (stores user profile, cadence, income)
2. **bp_budget_periods** — PK: `userId`, SK: `startDate` (stores pay periods)
3. **bp_cards** — PK: `userId`, SK: `cardId` (stores payment cards)
4. **bp_expenses** — PK: `userId`, SK: `expenseId` (stores expenses)

### Key Business Logic

- **Period Generation (lib/generatePeriods.js):** Generates budget periods from start date. Supports biweekly (14 days) and monthly cadences. Creates up to 500 periods.
- **Expense Calculations:** Monthly amounts convert weekly/biweekly to monthly equivalent. Recurring expenses apply to all periods after start date. One-time expenses apply only to assigned period.
- **Onboarding:** 4-step wizard — budget duration (3/6/12 months), pay frequency (biweekly/monthly), first pay date, income amount. Creates user + generates all budget periods in one POST.

---

## Current Status: NOT RUNNABLE

| Blocker | Status |
|---------|--------|
| No `.env` file | Missing — AWS credentials required |
| `node_modules/` not installed | `npm install` never run |
| Not a git repo | No version control initialized |
| No DynamoDB tables created | `setup-dynamo.js` never run |

---

## CRITICAL ISSUES (Must Fix)

### 1. No State Management — The Core Problem

Every page module stores its data in file-scoped globals (`_healthData`, `_pd`, `_expenses`, `_cards`, etc.) that are **never cleared** between page visits. This causes:

- **Stale data flash** — navigating back to a page briefly shows old data before the fetch completes
- **Race conditions** — fast navigation triggers concurrent fetches that overwrite each other unpredictably
- **Cross-page communication via `window._jumpToPeriod`** — a fragile global variable used to pass the selected period from budgets.js to pay-period.js, which breaks on browser back/forward
- **No single source of truth** — expenses are fetched independently in home.js, pay-period.js, budgets.js, and expenses.js, with no shared cache

### 2. Router Loses Parameters on Back/Forward

The router passes params as JS objects (`Router.navigate('page', {idx: 3})`) but the `hashchange` listener calls `render({})` — empty params. Browser history navigation loses all context.

### 3. Event Listener Memory Leaks (Every Page)

Every page adds `addEventListener` to dynamically created elements on each render, but **never removes them**. After a few page navigations, dozens of duplicate listeners accumulate, causing:
- Memory leaks in long sessions
- Duplicate handler fires (e.g., double saves, double deletes)
- Performance degradation

### 4. Expense Math is Wrong in budgets.js

When calculating period totals, `budgets.js` sums all recurring expense amounts as-is, **ignoring frequency**. A $100/week expense shows as $100 per period instead of being multiplied by the correct number of weeks in that period. This makes every period's "remaining" balance wrong.

### 5. No Authentication / Authorization

- User identity is a `localStorage` string (`bp_userId`)
- **No auth on the API** — anyone can read/write any user's data by guessing/knowing their userId
- No login, no sessions, no tokens

### 6. PUT Routes Destroy Data

Both `routes/expenses.js` and `routes/cards.js` use `PutCommand` for updates, which **overwrites the entire item**. The `createdAt` timestamp is lost on every edit because it's not included in the PUT body.

### 7. No Error Handling on POST /api/users

The user creation route (which also batch-writes all budget periods) has **no try-catch**. If DynamoDB is down or credentials are wrong, the server crashes. If the batch write partially fails, the user exists but has incomplete periods — no rollback.

---

## HIGH PRIORITY ISSUES

### 8. Promise.all Fails Everything

Every page uses `Promise.all([fetch1, fetch2, fetch3])`. If **any** fetch fails, the entire page shows a generic "Failed to load" message. No partial rendering, no retry.

### 9. No Response Validation

Fetch calls don't check `res.ok` before calling `.json()`. If the server returns a 500, the code tries to parse the error HTML as JSON and crashes.

### 10. Date/Timezone Inconsistencies

- `today` is calculated as `new Date().toISOString().split('T')[0]` — this is UTC, not the user's local timezone
- Period comparisons (`startDate <= today`) use string comparison which only works with `YYYY-MM-DD` format
- If user is in PST at 11 PM, "today" is already tomorrow in UTC — wrong period shown

### 11. Month Boundary Bug in generatePeriods.js

`addMonths()` uses `setUTCMonth()` which has known JavaScript edge cases around month boundaries (e.g., Jan 31 + 1 month = Mar 3 instead of Feb 28).

### 12. Missing Input Validation (Onboarding)

- Income amount: only checks truthiness, not that it's a valid positive number
- Date: no validation that it's a real date or in a reasonable range
- Cadence: no validation against allowed values

### 13. XSS Risk via innerHTML

All pages use `.innerHTML` with an `esc()` helper for escaping. This is fragile — if `esc()` misses edge cases (and it likely does for attribute contexts), user-controlled data could execute scripts.

---

## MEDIUM PRIORITY ISSUES

| Issue | Details |
|-------|---------|
| **Hardcoded `localStorage` key** | `'bp_userId'` appears in 6+ files. If the key changes, all break. |
| **No loading states** | Pages show nothing while fetching. No skeletons or spinners. |
| **No empty states** | If user has 0 expenses or 0 cards, no guidance shown. |
| **FAB handler conflicts** | home.js, pay-period.js, and expenses.js all set `fab.onclick` — last write wins. |
| **Table names hardcoded per file** | `'bp_users'`, `'bp_expenses'`, etc. duplicated in every route file. |
| **No API error envelope** | Success returns `{ items }`, errors return `{ error }` — inconsistent shapes. |
| **Monthly calc wrong for weekly** | `home.js` only handles `biweekly` and `monthly`. Weekly cadence would give wrong monthly income. |
| **No pagination on DynamoDB queries** | All queries return unbounded results. At scale, this becomes a performance issue. |
| **Batch write partial failure** | `users.js` doesn't handle `UnprocessedItems` from `BatchWriteCommand`. |
| **`openSheet()` coupling** | `home.js` calls `openSheet()` defined in `expenses.js` via global scope. If load order changes, it crashes. |

---

## DETAILED BACKEND ISSUES BY FILE

### server.js
- No global Express error handler — unhandled route errors crash the server
- No error handler on `app.listen()` — port-in-use fails silently

### config/dynamo.js
- No validation that AWS credentials are set
- No retry configuration on DynamoDB client
- No connection validation on startup

### routes/users.js
- **POST / has no try-catch** — server crashes on any DynamoDB error
- No validation of input types (durationMonths, incomeAmount, cadence, firstPayDate)
- Partial batch write failure leaves database in inconsistent state (user exists, periods missing)
- `GetCommand` imported inside route handler instead of at top of file
- Inconsistent field naming: `firstPayDate` on user vs `startDate` on periods

### routes/budgets.js
- No pagination on query results
- No input validation on userId format
- Generic error messages with no debugging info

### routes/expenses.js
- **PUT uses PutCommand (overwrites entire item)** — `createdAt` is lost on every update
- Inconsistent field handling: `periodStart` vs `recurrenceStartDate` vs `dueDay` vs `dueDate`
- No validation of recurrence values, amount positivity, or date formats
- DELETE doesn't verify item exists before deleting

### routes/cards.js
- Same PUT/PutCommand issue as expenses — `createdAt` lost on update
- No validation of `type`, `lastFour` format (should be exactly 4 digits), or `colorIndex` range
- No pagination on query results

### lib/generatePeriods.js
- `addMonths()` has JavaScript month boundary bugs (Jan 31 + 1 month issue)
- No cadence validation — invalid cadence silently treated as monthly
- Date parsing assumes YYYY-MM-DD format with no validation
- Safety limit of 500 periods is hardcoded with no feedback if exceeded
- Off-by-one boundary condition: `while (periodStart < boundary)` may exclude final period

### scripts/setup-dynamo.js
- Silent catch block in `tableExists()` — network errors treated same as "table doesn't exist"
- No wait for table to become ACTIVE after creation — immediate writes can fail
- No AWS credentials validation before attempting operations

---

## DETAILED FRONTEND ISSUES BY FILE

### router.js
- **Race condition on hash change:** `navigate()` sets hash AND calls `render()`, but hashchange listener also calls `render()` — double render possible
- **Params lost on back/forward:** hashchange listener calls `render({})` with empty params
- No route parameter serialization into URL
- No error handling if registered route handler crashes

### app.js
- Event listeners on nav items never removed — leak on re-render
- Hardcoded `'bp_userId'` localStorage key
- `window.onRouteChange` hook has no completion guarantee before page renders
- No fallback if `Router.init()` fails

### pages/home.js
- `_healthData` and `_healthHorizon` globals never cleared between visits — stale data flash
- Race condition: two quick visits cause concurrent fetches overwriting `_healthData`
- Event listeners (horizon buttons, go-pay-period, bills-expand) accumulate on each render
- No API response validation — assumes arrays, correct schema
- No `res.ok` check before `.json()`
- `today` uses UTC not local timezone — wrong period shown in some timezones
- `openSheet(null)` references function from expenses.js via global scope — fragile coupling
- Monthly calculation only handles biweekly/monthly — weekly cadence gives wrong result
- Missing null check: if `periods` array is empty, accessing `periods[0]` throws

### pages/pay-period.js
- `_pd` and `_pdIdx` globals persist between navigations — wrong period on return visit
- Uses `window._jumpToPeriod` global set by budgets.js — fragile, breaks on back/forward
- FAB onclick handler duplicated (also set in home.js)
- No bounds checking on `periods[idx]`
- Same timezone issue as home.js
- Event listeners on nav buttons accumulate on each `renderPeriod()` call

### pages/budgets.js
- **Expense math is wrong** — sums recurring expense amounts without accounting for frequency (weekly expense of $100 shows as $100 instead of correct per-period amount)
- Sets `window._jumpToPeriod` global — fragile cross-page communication
- No null check before `.map()` on periods
- Event listeners on period items accumulate
- Hardcoded money formatter duplicated across files

### pages/expenses.js
- `_expenses` and `_periods` globals never cleared — stale data between visits
- Race condition: concurrent `loadExpenses()` calls overwrite each other
- Event listeners on expense items accumulate on every `renderExpensesList()` call
- `_cards` referenced but might be undefined (loaded lazily in `openSheet()`)
- Race condition in `openSheet()` — two quick opens cause concurrent card fetches
- Period lookup `_periods.find(p => p.startDate === e.periodStart)` can return undefined — crash on `.textContent`
- No `res.ok` check on any fetch call
- Delete updates `_expenses` array in `.then()` without confirming delete succeeded
- Sheet event listeners not cleaned up (relies on fragile `transitionend` event)

### pages/cards.js
- `_cards`, `_cardExpenses`, `_selectedCard` globals persist between visits
- Race condition in `loadCards()` — concurrent calls overwrite globals
- No error handling in `loadCards()`
- `_selectedCard` can be null if cards array is empty — downstream crash
- Full re-render on card selection (should just update detail view)
- Event listeners accumulate on each `renderCardsPage()` call
- No `res.ok` check before `.json()` on any fetch
- Color swatch rapid-click race condition

### pages/onboarding.js
- Income amount validation only checks truthiness — "abc" passes validation
- Date input not validated as real date or reasonable range
- No persistence of onboarding state — closing browser mid-wizard loses all progress
- No API response structure validation
- No `res.ok` check with detailed error message
- Hardcoded paycheck frequency labels ("26 paychecks / year") don't adjust to selected duration
- Event listeners not removed between step renders
- No accessibility: option cards missing ARIA roles, no keyboard navigation

---

## CROSS-FILE CONSISTENCY ISSUES

### State Management
- No centralized store — each page has its own globals
- Data fetched independently in every page (expenses fetched in home.js, pay-period.js, budgets.js, AND expenses.js)
- No shared cache — same API called repeatedly across pages
- Global variable communication pattern (`window._jumpToPeriod`) is fragile

### Code Duplication
- `esc()` function duplicated in every page file
- Money formatting logic duplicated in every page file
- `'bp_userId'` localStorage key hardcoded in 6+ files
- Table name strings hardcoded in every route file
- Error handling patterns (or lack thereof) repeated everywhere

### API Contract
- No documented contract between frontend and backend
- Frontend assumes: arrays are never null, recurrence is 'recurring' or 'once', frequency is 'weekly'/'biweekly'/'monthly', periods array is sorted by date
- None of these assumptions are validated on either side

---

## WHAT NEEDS TO HAPPEN TO MAKE THIS WORK

### Phase 1: Get It Running
1. `git init` and initial commit
2. Create `.env` with AWS credentials (or switch to local DynamoDB / SQLite for dev)
3. `npm install`
4. Run `node scripts/setup-dynamo.js` (or set up local alternative)
5. `npm run dev`

### Phase 2: Fix Critical Bugs
1. Add try-catch to all route handlers
2. Fix expense math in `budgets.js` (account for frequency)
3. Fix PUT routes to preserve `createdAt` (use `UpdateCommand` or fetch-then-put)
4. Add `res.ok` checks on all fetch calls
5. Fix `generatePeriods` month boundary bug
6. Fix router to serialize params into URL hash

### Phase 3: State & Persistence
1. Create a simple central store (`store.js`) that caches fetched data
2. Add page lifecycle hooks (cleanup listeners on unmount)
3. Use event delegation instead of per-element listeners
4. Implement proper loading/error/empty states in the UI
5. Fix timezone handling with consistent local date usage

### Phase 4: Security & Robustness
1. Add authentication (even simple JWT)
2. Add input validation middleware on the backend
3. Switch from `innerHTML` to `textContent` + DOM API for user data
4. Add rate limiting on API routes
5. Validate all API response shapes on the frontend

---

## Summary

The app has a **clean design system** and a **well-thought-out UX flow** (onboarding wizard, period navigation, expense sheets). The core concept is solid. But the codebase has fundamental issues in three areas:

1. **State management** — no central store, globals everywhere, stale data between pages, race conditions on every navigation
2. **Data integrity** — wrong expense math, PUT routes that destroy fields, no error handling on writes, partial batch failures unhandled
3. **No persistence layer for frontend** — all state is in-memory JS variables that reset on page refresh (only `userId` survives in `localStorage`)

The architecture is simple enough that these can be fixed incrementally without a rewrite. The backend routes need error handling and validation. The frontend needs a small state manager and proper cleanup lifecycle.
