# AGENT HANDOFF — Budget Peace
**Last updated: 2026-04-22**
**Purpose:** Complete context document for any agent (or resumed session) working on this codebase. Read this before writing a single line of code.

---

## 0. Who Is the Engineer

**Name:** Amiel Terry
**Role:** Product-minded developer, non-traditional engineering background, builds product-quality apps.
**Working style:**
- Gives high-level feature requests; expects the agent to make smart design decisions independently.
- Prefers concise communication — no lengthy preambles, no restating the request.
- Appreciates when the agent voices opinions (e.g., "I'd suggest X instead because…").
- Reviews output critically and will ask for adjustments when something doesn't look right.
- Strongly dislikes over-engineering; "simplest solution always" is the house rule.
- Deploys frequently; work is always live on a real domain (budgetpeace.app).
- Does not want backward-compatibility hacks, unused variables, or dead code left in.
- Does not want CSS/layout changes unless blocking a feature.

---

## 1. Project Overview

**Budget Peace** is a personal finance app for managing pay periods, recurring bills, one-time expenses, savings goals, bank accounts, and cards. It supports "what-if" financial scenarios, time-travel (view finances on any date), dark mode, and a Pro tier with advanced features.

**Live URL:** https://budgetpeace.app
**Stack:** Node.js/Express backend · Vanilla JS SPA frontend · AWS DynamoDB · AWS Elastic Beanstalk (us-west-2) · Supabase Auth

**The mood of the app:** Calm, premium, dark-first. Warm and grounded — not corporate, not playful. The core green is deep forest `#1B5E3B`. The feeling is stillness, control, breathing room — like you've got your finances handled and you're not stressed about them.

---

## 2. Repository Structure

```
budget-peace/
├── server.js                   # Express entry point
├── routes/
│   ├── users.js                # Profile setup, period regeneration
│   ├── expenses.js             # Recurring + one-time expense CRUD
│   ├── cards.js                # Wallet cards + bulk reorder
│   ├── banks.js                # Bank groupings + cascade delete
│   ├── budgets.js              # Period listing (read-only by users)
│   ├── goals.js                # Savings goals + contribution history + milestone emails
│   ├── scenarios.js            # Scenario CRUD, notes, expense cloning, email-prefs
│   ├── purchases.js            # One-time purchases (soft archive)
│   └── stripe.js               # Checkout sessions, webhooks, plan entitlements
├── middleware/
│   └── auth.js                 # requireAuth, verifyOwner
├── config/
│   └── dynamo.js               # AWS DynamoDB DocumentClient setup
├── lib/
│   ├── generatePeriods.js      # Period generation logic
│   ├── planLimits.js           # Server-side plan enforcement
│   └── periodUtils.js          # Backend port of all period expense math (NEW)
├── services/
│   ├── email.js                # Resend-based email templates + send functions
│   └── cron.js                 # Daily email notification scheduler
├── scripts/
│   └── setup-dynamo.js         # DynamoDB table definitions (run once)
├── public/
│   ├── index.html              # SPA shell
│   ├── landing.html            # Public marketing landing page
│   ├── demo.html               # Demo mode shell
│   ├── css/
│   │   └── main.css            # Entire design system + component styles
│   └── js/
│       ├── theme.js            # Dark mode toggle (loads first)
│       ├── supabase-client.js  # Supabase client init (fetches /api/config)
│       ├── auth.js             # Supabase auth service
│       ├── plans.js            # Frontend plan limits + upgrade modal
│       ├── auth-ui.js          # Login/signup UI for unauthenticated users
│       ├── shared.js           # Store cache, math helpers, esc(), authFetch()
│       ├── router.js           # Hash router
│       ├── app.js              # Nav bindings, scenario selector, time-travel UI
│       ├── profile.js          # Slide-out profile panel
│       ├── demo.js             # Demo mode with localStorage mock data
│       └── pages/
│           ├── home.js         # Dashboard: health projection + current period
│           ├── pay-period.js   # Pay period detail view
│           ├── budgets.js      # Period list / summary
│           ├── expenses.js     # Expense management + sort
│           ├── cards.js        # Wallet (cards + banks + accounts)
│           ├── goals.js        # Savings goals
│           ├── notes.js        # Notes (Pro) + one-time purchases
│           ├── scenarios.js    # Scenario management
│           ├── compare.js      # Scenario comparison (Pro)
│           └── settings.js     # User setup / onboarding + email prefs
├── AGENT_HANDOFF.md            # This file
└── package.json
```

---

## 3. Tech Stack Details

| Layer | Choice | Notes |
|-------|--------|-------|
| Runtime | Node.js | Express 4.x |
| Database | AWS DynamoDB | SDK v3 (`@aws-sdk/lib-dynamodb`); DocumentClient with `removeUndefinedValues: true` |
| Auth | Supabase | JWT verified server-side only; never trusted on frontend alone |
| Hosting | AWS Elastic Beanstalk | Environment: `budget-peace-prod`, region: `us-west-2` |
| Payments | Stripe | Monthly + lifetime plans; checkout-first flow supported |
| Email | Resend | `RESEND_API_KEY` env var; used by `services/email.js` + `services/cron.js` |
| Frontend | Vanilla JS | No framework. No React, Vue, Svelte, Angular. |
| CSS | Custom design system | Single `main.css` with CSS custom properties |
| Fonts | Plus Jakarta Sans | Via Google Fonts CDN |
| Drag & Drop | SortableJS | CDN, loaded via `<script>` in index.html |

---

## 4. Deployment Workflow

```bash
# All deploys from dev branch:
git add <files>
git commit -m "message"
git push origin dev           # Push to GitHub
eb deploy budget-peace-prod   # Deploy to Elastic Beanstalk (us-west-2)
```

**Auto-deploy convention:** Push to origin/dev → immediately run `eb deploy`. No PR, no CI gate, no separate approval.

**Branch strategy:**
- `dev` — active development, deployed to prod
- `main` — periodically merged from dev to snapshot stable versions
- `origin/main` is NOT kept in sync with every deploy; only merged when the engineer says so

**EB environment:** `budget-peace-prod` (us-west-2), Health: Green
**EB CLI alert:** Always warns about platform version update — safe to ignore for now.

**Current git state (2026-04-22):**
- `dev` branch: `83a0fc4` (deployed to budgetpeace.app)
- `origin/main`: behind dev

---

## 5. DynamoDB Tables

All tables use `PAY_PER_REQUEST` billing. All tables use `userId` as the partition key (single-user owner model). Sort keys listed below:

| Table | Sort Key | Purpose |
|-------|----------|---------|
| `bp_users` | — | User profile, plan state, active scenario |
| `bp_budget_periods_v2` | `periodKey` (`scenarioId#startDate`) | Pay periods per scenario |
| `bp_expenses` | `expenseId` | Recurring + one-time expenses |
| `bp_cards` | `cardId` | Wallet cards, debit, savings accounts |
| `bp_banks` | `bankId` | Bank groupings for cards |
| `bp_purchases` | `purchaseId` | One-time purchase wishlist/tracking |
| `bp_goals` | `goalId` | Savings goals + contribution history |
| `bp_scenarios` | `scenarioId` | Financial scenarios + notes + emailPrefs |
| `bp_pending_entitlements` | — | Checkout-first payment staging |

### Key Fields Per Table

**bp_users:**
```
userId, email, fullName, authProvider
accessLevel: 'none' | 'budget' | 'pro' | 'full' (legacy)
cadence, firstPayDate, durationMonths, incomeAmount  ← user's pay setup (legacy; per-user)
activeScenarioId                                      ← which scenario is active
stripeCustomerId, stripeSubscriptionId, paidAt, entitlementStatus
emailPrefs: { paydaySummary, billReminders, overBudget, goalMilestones }  ← user-level fallback
createdAt, lastLoginAt, updatedAt
```

**bp_expenses:**
```
userId, expenseId
name, amount
recurrence: 'once' | 'recurring'
scenarioId                          ← defaults to 'main' for legacy rows
cardId?                             ← links to bp_cards
recurrenceFrequency: 'weekly' | 'biweekly' | 'monthly'
recurrenceStartDate                 ← when recurring expense begins
dueDay?                             ← day-of-month for monthly recurring (INTEGER 1–31)
allocationMethod?                   ← 'split' | 'first' | 'second' | 'due-date'
splitBiweekly?: boolean             ← legacy field; prefer allocationMethod
category?, notes?, tags?            ← optional metadata
createdAt, updatedAt
```

**IMPORTANT:** For recurring expenses, `dueDay` is an integer (e.g. `15`). One-time expenses use `dueDate` (full date string e.g. `"2026-05-15"`). Never confuse these two fields.

**bp_cards:**
```
userId, cardId
name, type: 'Credit' | 'Debit' | 'Savings'
lastFour                            ← last 4 digits
colorIndex                          ← 0–7, maps to CARD_PALETTES gradient array
bankId?                             ← links to bp_banks
scenarioId                          ← defaults to 'main'
sortOrder                           ← numeric; defaults to Date.now() on create
createdAt, updatedAt
```

**bp_banks:**
```
userId, bankId
name, note?, color              ← hex color (e.g., '#3B82F6')
scenarioId                      ← defaults to 'main'
createdAt, updatedAt
```

**bp_goals:**
```
userId, goalId
name, targetAmount, targetDate
currentSaved                    ← ⚠ CRITICAL: this is the field name, NOT currentAmount
plannedContribution?
contributionEntries: [{ id, amount, date, note? }]  ← full audit trail
lastMilestone?                  ← last milestone % emailed (25/50/75/100); prevents duplicates
scenarioId
createdAt, updatedAt
```

**bp_scenarios:**
```
userId, scenarioId
name, income, cadence, firstPayDate, durationMonths
isPrimary: boolean              ← exactly one per user should be true
notes: [{ id, text, createdAt, pinned? }]
emailPrefs?: { paydaySummary, billReminders, overBudget, goalMilestones }  ← per-scenario overrides
deletedAt?                      ← soft delete marker
createdAt, updatedAt
```

---

## 6. Scenario Isolation Pattern

**CRITICAL:** All data tables are scenario-scoped. This is enforced via a DynamoDB FilterExpression:

```javascript
FilterExpression: 'scenarioId = :sid OR (attribute_not_exists(scenarioId) AND :sid = :main)'
ExpressionAttributeValues: { ':uid': userId, ':sid': scenarioId, ':main': 'main' }
```

This means:
- Legacy rows (no `scenarioId` field) are treated as belonging to 'main'
- New rows always get `scenarioId` set explicitly
- Every page reads data scoped to `activeScenario()`
- Changing scenarios invalidates ALL Store caches and re-renders the current page

**Tables that are scenario-scoped:** expenses, cards, banks, goals, purchases, budget_periods_v2
**Tables that are NOT scenario-scoped:** users, scenarios, pending_entitlements

---

## 7. Auth Architecture

**Supabase JWT flow:**
1. User signs in via Google OAuth or email magic link
2. Supabase issues JWT access token
3. Frontend stores token in localStorage (Supabase handles this)
4. Every API call includes `Authorization: Bearer <token>` header
5. `requireAuth` middleware verifies token server-side via Supabase admin client
6. `req.userId` and `req.userEmail` are set after verification
7. `verifyOwner` checks `req.params.userId === req.userId` (403 if mismatch)

---

## 8. Plan System

Two tiers enforced on BOTH frontend and backend:

| Feature | Basic (budget) | Pro |
|---------|---------------|-----|
| Scenarios | 1 | Unlimited |
| Expenses per scenario | 8 | Unlimited |
| Projection months | 3 | Unlimited |
| Scenario comparison | ✗ | ✓ |
| Financial health projection | ✗ | ✓ |
| Scenario notes | ✗ | ✓ |
| AI features | ✗ | ✓ |
| Widgets | ✗ | ✓ |

**Plans offered via Stripe:**
- `budget-monthly` → subscription → tier: budget
- `budget-lifetime` → one-time payment → tier: budget
- `pro-monthly` → subscription → tier: pro
- `pro-lifetime` → one-time payment → tier: pro

**Server-side gating:** `lib/planLimits.js`
**Frontend gating:** `public/js/plans.js` — `Plans.canUse(feature)`, `Plans.getLimit(feature)`, `Plans.showUpgradeModal(context)`

---

## 9. API Routes Reference

### Users (`routes/users.js`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/users/:userId` | Fetch profile |
| PUT | `/api/users/:userId` | Update income/cadence/firstPayDate/duration; triggers period regeneration if structure changes |
| PATCH | `/api/users/:userId/active-scenario` | Persist active scenario choice |
| POST | `/api/users/:userId/regenerate-periods` | Force delete + regenerate all periods |

### Expenses (`routes/expenses.js`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/expenses/:userId?scenario=main` | List expenses for scenario |
| POST | `/api/expenses` | Create expense |
| PUT | `/api/expenses/:userId/:expenseId` | Update expense |
| DELETE | `/api/expenses/:userId/:expenseId` | Delete expense |

### Cards (`routes/cards.js`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/cards/:userId?scenario=main` | List cards |
| POST | `/api/cards` | Create card |
| PUT | `/api/cards/:userId/order` | **⚠ REGISTERED BEFORE /:cardId** — batch reorder by sortOrder |
| PUT | `/api/cards/:userId/:cardId` | Update card |
| PUT | `/api/cards/:userId/:cardId/expenses` | Bulk-assign expenses to card |
| DELETE | `/api/cards/:userId/:cardId` | Delete card |

### Banks (`routes/banks.js`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/banks/:userId?scenario=main` | List banks |
| POST | `/api/banks` | Create bank |
| PUT | `/api/banks/:userId/:bankId` | Update bank |
| DELETE | `/api/banks/:userId/:bankId` | Delete bank + cascade unassign bankId from all cards in same scenario |

### Budgets (`routes/budgets.js`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/budgets/:userId?scenario=main` | List periods (read-only; generated server-side) |

### Goals (`routes/goals.js`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/goals/:userId?scenario=main` | List goals |
| POST | `/api/goals` | Create goal |
| PUT | `/api/goals/:userId/:goalId` | Update goal metadata |
| POST | `/api/goals/:userId/:goalId/contribute` | Log contribution entry + fires milestone email |
| PUT | `/api/goals/:userId/:goalId/contributions/:entryId` | Edit contribution |
| DELETE | `/api/goals/:userId/:goalId/contributions/:entryId` | Delete contribution |
| DELETE | `/api/goals/:userId/:goalId` | Delete goal |

### Scenarios (`routes/scenarios.js`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/scenarios/:userId` | List non-deleted scenarios |
| GET | `/api/scenarios/:userId/:scenarioId` | Fetch single scenario |
| POST | `/api/scenarios` | Create scenario (optionally clone expenses) |
| PUT | `/api/scenarios/:userId/:scenarioId` | Update scenario + regenerate periods |
| PATCH | `/api/scenarios/:userId/:scenarioId/promote` | Make primary |
| PATCH | `/api/scenarios/:userId/:scenarioId/email-prefs` | Save per-scenario email preferences |
| POST | `/api/scenarios/:userId/:scenarioId/notes` | Add note (Pro-only, max 10) |
| PATCH | `/api/scenarios/:userId/:scenarioId/notes/:noteId` | Edit note |
| DELETE | `/api/scenarios/:userId/:scenarioId/notes/:noteId` | Delete note |
| DELETE | `/api/scenarios/:userId/:scenarioId/expenses` | Clear all expenses |
| DELETE | `/api/scenarios/:userId/:scenarioId` | Soft-delete scenario |

### Purchases (`routes/purchases.js`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/purchases/:userId?scenario=main` | List non-archived purchases |
| POST | `/api/purchases` | Create purchase |
| PUT | `/api/purchases/:userId/:purchaseId` | Update or archive purchase |

---

## 10. Frontend Architecture

### Navigation Structure

**Bottom nav (mobile):** Home · Period · Budgets · Expenses · Wallet
**Top nav (desktop):** Home · Period · Budgets · Expenses · Goals · Wallet
**Side nav (hamburger):** Home · Pay Period · Budgets · Expenses · Wallet | Tools: Goals · Compare · Notes & Purchases · Scenarios · Settings | Footer: Go Pro · Sign Out

**NOT in any nav:** Banks (accessed via Wallet page chip row only)

### Router

Hash-based: `#pageName;key=value;key2=value2`

```javascript
Router.register('cards', async () => { ... }); // register page
Router.navigate('cards', { bankId: 'abc' });    // navigate
Router.buildHash('cards', { bankId: 'abc' });   // → '#cards;bankId=abc'
Router.parseHash('#cards;bankId=abc');          // → { page: 'cards', params: { bankId: 'abc' } }
```

Page names: `home`, `pay-period`, `budgets`, `expenses`, `cards`, `goals`, `notes`, `scenarios`, `compare`, `settings`

### Store (Cache Layer)

**Cache keys and their endpoints:**
```javascript
user       → GET /api/users/:userId
periods    → GET /api/budgets/:userId?scenario={activeScenario}
expenses   → GET /api/expenses/:userId?scenario={activeScenario}
cards      → GET /api/cards/:userId?scenario={activeScenario}
banks      → GET /api/banks/:userId?scenario={activeScenario}
purchases  → GET /api/purchases/:userId?scenario={activeScenario}
goals      → GET /api/goals/:userId?scenario={activeScenario}
scenarios  → GET /api/scenarios/:userId
scenario   → GET /api/scenarios/:userId/:activeScenario
```

**CRITICAL:** Always `Store.invalidate(key)` after any POST/PUT/DELETE. No auto-invalidation. Cache has no TTL.

After bank delete: must invalidate BOTH `'banks'` AND `'cards'` (cascade strips bankId from cards).

### Key Global Functions (shared.js)

```javascript
userId()              // Current Supabase user ID
isDemoMode()          // True if in demo mode
authFetch(url, opts)  // fetch() with Authorization header; auto-reload on 401
effectiveToday()      // Current date accounting for time-travel
isTimeTraveling()     // Whether user is viewing a past/future date
setViewDate(dateStr)  // Time-travel to a date
clearViewDate()       // Return to today
activeScenario()      // Current active scenario ID
setScenario(id)       // Change scenario + invalidate cache + re-render
esc(str)              // HTML-escape (use everywhere in innerHTML templates)
calcMonthlyAmt(exp)   // Canonical monthly amount: weekly×4, biweekly×2, monthly×1
expMultiplier(expFreq, periodCadence)  // multiplier within a period
dueDayInPeriod(dueDay, period)         // does dueDay fall in this period?
getEffectiveAllocation(expense)        // resolve allocation method (handles legacy splitBiweekly)
fmtRange(period)      // Format period as "Jan 1 – Jan 15, 2026"
fmtPayday(dateStr, today)  // "Payday Mon, Apr 28" or "Paid Fri, Apr 15" (used in period nav)
inferCadence(period)  // 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' from period.cadence field or day-count heuristic
```

**`inferCadence` heuristic (when `period.cadence` is not stored):**
```javascript
if (days <= 8)  return 'weekly';
if (days <= 17) return 'biweekly';  // ⚠ threshold is 17, not 16; semimonthly 15th–31st = 17 days
return 'monthly';
```
The safe path is `period.cadence` (stored by `generatePeriods.js`). The heuristic only fires for pre-existing periods without the field.

### money() — Two Variants (Page-Local)

**IMPORTANT:** `money()` is NOT in shared.js. It is defined locally in each page that needs it. Two variants exist:

```javascript
// Plain (expenses.js, goals.js, etc.)
const money = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// With cents span (home.js)
const money = n => {
  const [dollars, cents] = Number(n).toFixed(2).split('.');
  return `$${Number(dollars).toLocaleString()}<span class="cents">.${cents}</span>`;
};
```

Do NOT move money() to shared.js. Keep it page-local.

### Script Loading Order (index.html)
1. `theme.js` — dark mode (must be first; prevents flash)
2. `sortablejs@1.15.3` CDN
3. `@supabase/supabase-js@2` CDN
4. `supabase-client.js`
5. `auth.js`
6. `plans.js`
7. `auth-ui.js`
8. `shared.js`
9. `router.js`
10. Page scripts (home, pay-period, budgets, expenses, goals, cards, compare, scenarios, notes, settings)
11. `demo.js`
12. `app.js`

---

## 11. Design System

### Brand Colors (exact hex values for logo/design work)

| Role | Hex | Notes |
|------|-----|-------|
| **Primary Green** | `#1B5E3B` | Deep forest green — main brand color, buttons, active states |
| **Vivid Green** | `#2D9A64` | Progress bars, highlights |
| **Light Green Tint** | `#E5F4EC` | Card backgrounds, subtle wash |
| **Dark Green** | `#134530` | Hover states, darkest green |
| **Dark Mode Green** | `#4E9E6A` | Muted forest green in dark mode — calm, not neon |
| Light mode background | `#EFEEE8` | Warm linen |
| Dark mode background | `#18181A` | Warm charcoal, zero blue cast |
| Dark mode surface | `#222224` | |
| Dark mode text | `#E8E6E1` | Warm off-white, not cold blue-white |

### Light Mode Tokens
```css
--color-bg:            #EFEEE8   /* warm linen */
--color-surface:       #FFFFFF
--color-surface-alt:   #F6F4EF   /* warm cream */
--color-border:        rgba(15,23,42,0.13)
--color-text-primary:   #111827
--color-text-secondary: #4A5568
--color-text-tertiary:  #6B7280
--color-accent:         #1B5E3B  /* deep forest green */
--color-accent-vivid:   #2D9A64
--color-accent-light:   #E5F4EC
--color-accent-dark:    #134530
--color-warn:           #D97706
--color-danger:         #DC2626
```

**Dark mode:** `html[data-theme="dark"]` — warm charcoal, no blue/cold tones. Applied by `theme.js` which loads first.

### Typography
- **Font:** Plus Jakarta Sans (400 · 500 · 600 · 700 · 800)
- **Scale:** xs(12) · sm(14) · md(15) · lg(18) · xl(24) · 2xl(32) · 3xl(48)

### Spacing
`--space-1` = 4px · `--space-2` = 8px · `--space-3` = 12px · `--space-4` = 16px · `--space-5` = 20px · `--space-6` = 24px · `--space-8` = 32px

### Radius
`--radius-sm` = 8px · `--radius-md` = 14px · `--radius-lg` = 20px · `--radius-xl` = 28px · `--radius-pill` = 999px

### Stack Layout Utility

```css
.stack { display: flex; flex-direction: column; }
.stack--2 { gap: 8px; }
.stack--3 { gap: 12px; }
.stack--4 { gap: 16px; }
.stack--6 { gap: 24px; }
```

**⚠ IMPORTANT:** Always use BOTH classes together: `class="stack stack--3"`. The `stack--N` classes only set `gap`; without `display:flex` from `.stack`, the gap has no effect. Using `stack--3` alone is a common bug.

---

## 12. Pay Cadence System — CRITICAL

Three supported pay cadences. Semimonthly was added later and required a full logic audit.

| Cadence | Period length | Description |
|---------|--------------|-------------|
| `biweekly` | ~14 days | Every 2 weeks; period start varies |
| `semimonthly` | ~15–17 days | Fixed: 1st–14th and 15th–end of month |
| `monthly` | ~28–31 days | Once per month |

### The `isHalfMonth` Pattern

Both biweekly and semimonthly are "half-month" cadences. Any code that routes monthly expenses across periods must handle BOTH:

```javascript
const isHalfMonth = cadence === 'biweekly' || cadence === 'semimonthly';
```

This condition appears in: `home.js` → `calcPeriodExp` + `getPeriodItems`, `pay-period.js` → `calcPdExpenses`, `budgets.js` → `expenses.reduce`, `lib/periodUtils.js` → `calcPeriodExpenses`. **If you add new period math, always handle both.**

### Allocation Methods (for monthly expenses in half-month periods)

| Value | Meaning | Routing |
|-------|---------|---------|
| `'due-date'` | Default | Expense appears in whichever period contains its `dueDay` |
| `'split'` | Split evenly | Half the amount in each period |
| `'first'` / `'paycheck1'` | Paycheck A | Routes to period containing day 1 (1st–14th) |
| `'second'` / `'paycheck2'` | Paycheck B | Routes to period containing day 16 (15th–end) |
| `splitBiweekly: true` | Legacy | Treated as `'split'`; normalize via `getEffectiveAllocation()` |

**UI labels (expenses.js):**
- Biweekly schedule: "Paycheck A" / "Paycheck B"
- Semimonthly schedule: "Paycheck A (1st–14th)" / "Paycheck B (15th–end)"
- Default for new expenses: `'due-date'` (safest; requires intentional override to split/paycheck)

**Monthly cadence:** Allocation dropdown is hidden entirely (`isHalfMonth = false`). All monthly expenses just show every period.

### lib/periodUtils.js (backend)

Backend port of all frontend period math. Required because cron.js needs server-side period calculations without access to the browser environment.

```javascript
const { calcPeriodExpenses } = require('../lib/periodUtils');
const { items, total } = calcPeriodExpenses(expenses, period);
// Returns: items with displayAmount field, total
```

Used by: `services/cron.js`, `routes/migrate.js` (test emails)

### Expense Math Rules

```javascript
// Monthly normalization
calcMonthlyAmt(expense):
  weekly   → amount × 4
  biweekly → amount × 2
  monthly  → amount × 1

// Period multiplier (how many times expense occurs in a period)
expMultiplier(expenseFreq, periodCadence):
  ('weekly',   'weekly')    = 1
  ('weekly',   'biweekly')  = 2
  ('weekly',   'monthly')   = 4
  ('biweekly', 'biweekly')  = 1
  ('biweekly', 'monthly')   = 2
  ('monthly',  anything)    = 1  // routing handled separately for half-month
```

---

## 13. Email Notification System

### Services

**`services/email.js`** — All email sending via Resend API
- `sendPaydaySummary(toEmail, { period, expenses, cards, banks, totalBills, remaining })`
- `sendBillDueReminder(toEmail, { expenses, period, daysAway })`
- `sendOverBudget(toEmail, { period, totalBills, income, overage })`
- `sendGoalMilestone(toEmail, { goal, milestonePercent })`

Email templates use **table-based HTML** (Gmail strips CSS flexbox).
Brand colors: bg `#F0FDF4`, accent `#16A34A`, header `#0F172A`, logo green `#63E2A3`.

**`services/cron.js`** — Runs once per day (checks every hour, fires within 1-hour window)
- `runPaydaySummary(users, today)` — sends night before payday (period.startDate === tomorrow)
- `runBillDueReminders(users, today)` — 3 days before bill dueDay
- `runOverBudgetAlerts(users, today)` — fires on payday if total bills > income

**Critical cron bug history (both already fixed):**
1. Bill reminders were checking `e.dueDate === targetDate` — wrong field. Recurring expenses use `e.dueDay` (integer), not `e.dueDate` (string, one-time only). Fixed to extract day-of-month from targetDate and compare `Number(e.dueDay) === targetDay`.
2. Payday email was summing raw `e.amount` instead of using period-math amounts. Fixed to use `calcPeriodExpenses()`.

### Email Preferences

**Per-scenario email prefs** (checked first) stored in `bp_scenarios.emailPrefs`:
```javascript
{
  paydaySummary: boolean,
  billReminders: boolean,
  overBudget:    boolean,
  goalMilestones: boolean
}
```
Falls back to `bp_users.emailPrefs` if no scenario-level prefs.

UI in Settings page (`settings.js` → `renderEmailPrefsCard()`). Saves via:
`PATCH /api/scenarios/:userId/:scenarioId/email-prefs`

Weekly cadence email option is shown as `is-disabled` in the UI (disabled, not removed — "coming soon").

### Goal Milestone Emails

Fired from `routes/goals.js` (NOT from cron — fires immediately on contribution).

Milestones: 25%, 50%, 75%, 100%

`lastMilestone` field on goal record prevents duplicate emails. Logic:
```javascript
const GOAL_MILESTONES = [25, 50, 75, 100];
// After save: check which milestone was crossed, compare against goal.lastMilestone
// Fire email fire-and-forget (does not block API response)
```

⚠ **Use `goal.currentSaved` — NOT `goal.currentAmount`** (that field doesn't exist).

---

## 14. Feature Inventory

### Home Page (`home.js`)
- Financial health projection (horizon: 3/6/12 months; persisted to localStorage `bp_health_horizon`)
- Period nav with prev/next arrows: shows current, next, period after next
  - At offset ≥ 2 (3rd next press): navigates to pay-period page **passing `{ idx: _homeViewIdx }`** so it lands on the correct period (not the current one)
  - Period nav shows date range + payday label (`fmtPayday()`)
- Current period card: income, expenses, remaining, progress bar, expandable bills list
- `openBillDetailModal(expense, refreshFn)` — bottom sheet with full expense details
- Notes widget (Pro-only) embedded in dashboard

### Pay Period Page (`pay-period.js`)
- Period selector (accepts `?idx=N` param from home page nav)
- Per-period breakdown: income, expenses, remaining
- Period nav: period-nav__center div with label + payday sub-line
- `calcPdExpenses()` — handles biweekly AND semimonthly routing

### Budgets Page (`budgets.js`)
- List of all budget periods; per-period summary (income, obligations, remaining)
- Uses same `isHalfMonth` routing logic

### Expenses Page (`expenses.js`)
- Filter toggle: Current / Upcoming
- Sort: Highest · Lowest · A–Z · Newest · Oldest (client-side; persists across toggle; resets on page reload)
- Expense form sheet:
  - Recurring: Start Date, Frequency, Due Day (monthly), Allocation (half-month + monthly only)
  - Allocation options are shown/hidden via `isHalfMonth` (biweekly OR semimonthly)
  - Monthly cadence: allocation dropdown hidden entirely
  - Default allocation for new expenses: `'due-date'`
  - Card/Account selector, Category, Notes, Tags
- `openBillDetailModal()` shows category/notes/tags if set

### Wallet (Cards) Page — `cards.js`

This is the most complex page. Read carefully.

**State variables:**
```javascript
let _cards         = [];
let _cardExpenses  = [];
let _selectedCard  = null;
let _banks         = [];
let _selectedBank  = null;      // null = All Banks
let _walletCompact = localStorage.getItem('bp_wallet_compact') === '1';
let _walletReorder = false;
let _accountsReorder = false;
```

**Sections:**
- Overview: "All Banks" stats or per-bank stats; bank filter chips (All Banks | bank1 | ... | + Add Bank)
- Accounts (Savings cards): pill rows with reorder; click → inline accordion
- Cards (Credit/Debit): 2-col grid (default) or compact pill list; drag-to-reorder via SortableJS
- Inline accordion `wallet-item-expand`: injected with `insertAdjacentHTML('afterend', ...)`; one open at a time
- Card detail sheet `openCardDetailSheet()`: full card visual + associated expenses

### Goals Page (`goals.js`)
- Goal cards with progress bar
- `class="stack stack--3"` — both classes required for 12px gap to work
- Log contribution: date, amount, optional note
- Contribution history with edit/delete
- Milestone emails fire on contribute

### Profile Panel (`profile.js`)
- Slide-out from right; opened via avatar button in top bar
- Layout: identity card (64px avatar left + name/plan/member-since/stats right), editable fields below, action row (Save + Settings) at bottom
- **Stat pills** (4 total): Expenses → navigates to `expenses`; Banks → navigates to `cards`; Goals → navigates to `goals`; Scenarios → navigates to `scenarios`
  - Pills with a route get class `profile-stat--link` (green border + tint on hover)
  - Click closes panel, then navigates

### Settings Page (`settings.js`)
- Collapsed accordion sections: Financial Setup, Email Notifications, Notes
- `margin-bottom: var(--space-4)` on `.settings-setup-card` for proper spacing between sections
- Email prefs save to scenario-level via `PATCH /api/scenarios/:userId/:scenarioId/email-prefs`
- Cadence options: Weekly (disabled/coming soon), Biweekly, Semimonthly (Beta badge), Monthly (Beta badge)

### Notes & Purchases Page
- Notes (Pro-only): pinned first, max 10, max 500 chars
- Purchases: wishlist, soft archive, add/edit

### Scenarios Page
- Create from scratch or clone with/without expenses
- Edit triggers period regeneration
- Notes per scenario (Pro-only)
- Soft-delete (cannot delete primary or last remaining)

### Compare Page (Pro-only)
- Side-by-side scenario comparison

---

## 15. Semimonthly Cadence — History & Known Bug Fixes

Semimonthly (paid on 1st and 15th) was added as a third cadence type. Several bugs were found and fixed during a full audit:

**Bug 1 — inferCadence misclassified semimonthly:** Threshold was `<= 16` days, but the 15th–31st period is 17 days. Fixed to `<= 17`.

**Bug 2 — Allocation dropdown hidden for semimonthly:** The dropdown was only shown when `isBiweekly`. Semimonthly users couldn't set allocation. Fixed to `isHalfMonth = biweekly || semimonthly`.

**Bug 3 — All expenses showing every period for semimonthly:** Monthly expense routing only checked `cadence === 'biweekly'`. Semimonthly fell through to `expMultiplier('monthly', 'semimonthly') = 1` and showed every period. Fixed to `(cadence === 'biweekly' || cadence === 'semimonthly')` in all four locations.

**Bug 4 — Bill reminders never firing:** `getExpensesDueOn()` in cron.js checked `e.dueDate === targetDate`. Recurring expenses have `dueDay` (integer), not `dueDate`. Fixed to compare day-of-month integers.

---

## 16. Time Travel

- `effectiveToday()` returns `_viewDate` || `_serverToday` || `localToday()`
- `_viewDate` persisted to localStorage as `'bp_viewDate'`
- UI: inline button in top bar (desktop), FAB-like panel on mobile
- `setViewDate(dateStr)` → updates, re-renders; `clearViewDate()` → returns to today

---

## 17. Dark Mode

- CSS tokens in `html[data-theme="dark"]` block in `main.css`
- `theme.js` loads first to prevent flash
- Persisted to localStorage as `'bp_theme'`
- Falls back to system preference on first visit
- No blue/cold tones in dark mode — warm charcoal aesthetic

---

## 18. Demo Mode

- `/demo` → `demo.html` — no auth required
- All mutations intercepted by `demo.js`, applied to localStorage
- Data in localStorage keys prefixed `bp_demo_`
- No page-level code changes needed

---

## 19. What Has Been Built (Complete Feature List)

- [x] Pay period generation (biweekly, semimonthly, monthly cadences)
- [x] Recurring expenses with frequency, start date, due day, allocation method
- [x] One-time expenses
- [x] Expense metadata: category, notes, tags
- [x] Expense sorting (5 modes, client-side)
- [x] Expense allocation: Paycheck A/B labels (semimonthly gets date ranges), default due-date
- [x] Wallet: credit/debit/savings cards with gradient backgrounds (ISO 7810 aspect ratio)
- [x] Wallet: 2-column card grid + compact mode (persistent)
- [x] Wallet: drag-to-reorder (SortableJS) for cards + savings accounts
- [x] Wallet: bank grouping + filter chips + color dots
- [x] Wallet: all-banks overview + per-bank stats
- [x] Wallet: inline accordion expand + card detail sheet
- [x] Wallet: monthly spend totals on compact rows and savings pills
- [x] Savings goals with contribution history + edit/delete
- [x] Goal milestone emails (25/50/75/100% triggers, dedup via lastMilestone)
- [x] Notes (Pro-only) in dashboard + scenario detail
- [x] One-time purchases (wishlist, soft archive)
- [x] Scenarios: create, clone, edit, promote, soft-delete
- [x] Scenario isolation (all data scoped to active scenario)
- [x] Scenario comparison (Pro-only)
- [x] Financial health projection (configurable horizon)
- [x] Time travel (view finances on any date)
- [x] Dark mode (system preference + manual toggle, no flash)
- [x] Settings page with cadence-aware period regeneration
- [x] Pro plan with Stripe (monthly + lifetime, checkout-first flow)
- [x] Demo mode
- [x] Bill detail modal (amount, frequency, due, card, category, notes, tags)
- [x] Email notifications: payday summary, bill reminders (3 days), over-budget alerts
- [x] Per-scenario email preferences (overrides user-level)
- [x] Profile panel: identity card layout, stat pills linked to pages, save + settings row
- [x] Home page period nav passes correct period index to pay-period page
- [x] lib/periodUtils.js — backend period math (used by cron + test route)

---

## 20. What Is NOT Built Yet (Planned / Discussed)

| Feature | Status | Notes |
|---------|--------|-------|
| Expense sort Stage 2 | Planned | `sortOrder` field, batch PUT `/api/expenses/:userId/order` |
| Expense sort Stage 3 | Planned | SortableJS drag-drop on expenses page |
| Goals V2 | Design exists | Auto-prompts when nearing/missing goals |
| Scenario Mode | Design exists | Deeper "what-if" tooling; design doc discussed |
| Bank-specific notes | Discussed | Multi-note system per bank |
| Multi-select bank filter | Discussed | Toggle chips independently |
| AI-powered budget insights | Planned | Pro feature; not started |
| Custom widgets | Planned | Pro feature; not started |
| Weekly email cadence | UI placeholder only | Shown as "coming soon" in email prefs |

---

## 21. Critical Constraints — Read Before Changing Anything

1. **No visual/CSS redesign** unless directly blocking a function.
2. **money() stays page-local.** Two variants exist. Do not consolidate into shared.js.
3. **No over-engineering.** Simplest solution always. No premature abstractions.
4. **No backward-compat hacks.** Delete unused code entirely.
5. **Vanilla JS only.** No frameworks, no transpilation, no bundler.
6. **Never trust userId from request body** — always use `req.userId` (from verified JWT).
7. **DynamoDB FilterExpression for scenario isolation** — every scenario-scoped query needs the scenarioId filter with legacy fallback.
8. **PUT /api/cards/:userId/order must be registered BEFORE PUT /api/cards/:userId/:cardId** — Express route conflict.
9. **Store.invalidate() after every mutation.** No auto-invalidation.
10. **Stripe webhook uses raw body** — registered before `express.json()` middleware.
11. **Deploy from `dev` branch.** `eb deploy budget-peace-prod` after `git push origin dev`.
12. **`goal.currentSaved` — not `goal.currentAmount`.** The latter does not exist in DynamoDB.
13. **`stack stack--3` — both classes required** for gap to work. `stack--N` alone has no display:flex.
14. **`dueDay` vs `dueDate`** — recurring expenses use `dueDay` (integer 1–31); one-time expenses use `dueDate` (full date string). Never mix these up in cron or email logic.

---

## 22. Deploy Checklist

```bash
# 1. Commit to dev
git add <specific files>
git commit -m "Brief description of what and why"

# 2. Push to GitHub
git push origin dev

# 3. Deploy to EB
eb deploy budget-peace-prod

# 4. Verify EB output ends with:
#    INFO    Environment update completed successfully.

# 5. (Periodically) Merge to main when stable
git checkout main
git merge dev --no-ff -m "Merge dev → main: <description>"
git push origin main
git checkout dev
```

---

## 23. Environment Variables

```
PORT                      (optional; defaults to 3000)
AWS_REGION                us-west-2
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
RESEND_API_KEY            (email notifications; cron disabled if not set)
```

---

## 24. Common Patterns & Gotchas

### Adding a new optional field to an expense/card/goal
1. Add to POST handler: `...(fieldValue && { fieldName: fieldValue })` in the item spread
2. Add to PUT handler: include in destructuring + set in item spread
3. Add to frontend form: new `<input>` or `<textarea>` in the sheet
4. Add to save payload: `...(value && { fieldName: value })`
5. Add to detail modal: show if set, hide otherwise
6. No migration needed (DynamoDB stores only what's provided)

### Adding a new page
1. Create `public/js/pages/newpage.js`
2. Add `<script src="/js/pages/newpage.js"></script>` to index.html (before app.js)
3. Add nav button(s) with `data-page="newpage"`
4. Register route: `Router.register('newpage', async () => { ... })`

### Inline accordion expand pattern (used in cards.js)
```javascript
function toggleItemExpand(el, id) {
  const existing = el.nextElementSibling;
  if (existing?.classList.contains('wallet-item-expand')) {
    existing.remove(); el.classList.remove('is-expanded'); return;
  }
  document.querySelectorAll('.wallet-item-expand').forEach(e => e.remove());
  document.querySelectorAll('.is-expanded').forEach(e => e.classList.remove('is-expanded'));
  el.classList.add('is-expanded');
  el.insertAdjacentHTML('afterend', buildItemExpand(id));
  wireItemExpand(id);
}
```

### SortableJS reorder + save pattern
```javascript
// Capture order BEFORE re-render (container reference goes stale)
const items = Array.from(container.querySelectorAll('[data-id]')).map((el, i) => ({
  id: el.dataset.id, sortOrder: (i + 1) * 1000
}));
items.forEach(({ id, sortOrder }) => {
  const obj = _data.find(d => d.id === id);
  if (obj) obj.sortOrder = sortOrder; // optimistic update
});
renderPage();
await authFetch(`/api/endpoint/${userId()}/order`, { method: 'PUT', body: JSON.stringify({ items }) });
Store.invalidate('key');
_data = await Store.get('key');
```

---

*Document last updated: 2026-04-22. Check `git log --oneline -10` for any commits since this date.*
