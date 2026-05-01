# AGENT HANDOFF — Budget Peace
**Last updated: 2026-04-30**
**Purpose:** Complete context document for any agent (or resumed session) working on this codebase. Read this entire file before writing a single line of code. If anything is unclear, ask clarifying questions before proceeding. You have permission to do a full logic pass on any feature if you feel it's warranted.

---

## 0. Who Is the Engineer

**Name:** Amiel Terry
**Role:** Product-minded developer, non-traditional engineering background, builds product-quality apps.
**Working style:**
- Gives high-level feature requests; expects the agent to make smart design decisions independently.
- Prefers concise communication — no lengthy preambles, no restating the request back.
- Appreciates when the agent voices opinions (e.g., "I'd suggest X instead because…").
- Reviews output critically and will ask for adjustments when something doesn't look right.
- Strongly dislikes over-engineering; "simplest solution always" is the house rule.
- Deploys frequently; work is always live on a real domain (budgetpeace.app).
- Does not want backward-compatibility hacks, unused variables, or dead code left in.
- Does not want CSS/layout changes unless blocking a feature — except on the landing page, which is explicitly a design surface.

---

## 1. Project Overview

**Budget Peace** is a personal finance app for managing pay periods, recurring bills, one-time expenses, savings goals, bank accounts, and cards. It supports "what-if" financial scenarios, time-travel (view finances on any date), dark mode, and a Pro tier with advanced features.

**Live URL:** https://budgetpeace.app
**Landing page (v2):** https://budgetpeace.app/landing-v2
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
│   ├── budgets.js              # Period listing + PATCH paidExpenses
│   ├── goals.js                # Savings goals + contribution history + milestone emails
│   ├── scenarios.js            # Scenario CRUD, notes, expense cloning, wallet cloning, email-prefs
│   ├── purchases.js            # One-time purchases (soft archive)
│   └── stripe.js               # Checkout sessions, webhooks, plan entitlements
├── middleware/
│   └── auth.js                 # requireAuth, verifyOwner
├── config/
│   └── dynamo.js               # AWS DynamoDB DocumentClient setup
├── lib/
│   ├── generatePeriods.js      # Period generation logic
│   ├── planLimits.js           # Server-side plan enforcement
│   └── periodUtils.js          # Backend port of all period expense math
├── services/
│   ├── email.js                # Resend-based email templates + send functions
│   └── cron.js                 # Daily email notification scheduler (fixed: uses bp_budget_periods_v2)
├── scripts/
│   └── setup-dynamo.js         # DynamoDB table definitions (run once)
├── public/
│   ├── index.html              # SPA shell
│   ├── landing.html            # Old landing page (legacy, superseded by landing-v2.html)
│   ├── landing-v2.html         # ★ PRIMARY MARKETING PAGE — see Section 25 for full details
│   ├── demo.html               # Demo mode shell
│   ├── css/
│   │   └── main.css            # Entire design system + component styles
│   └── js/
│       ├── theme.js            # Dark mode toggle (loads first)
│       ├── supabase-client.js  # Supabase client init
│       ├── auth.js             # Supabase auth service
│       ├── plans.js            # Frontend plan limits + upgrade modal
│       ├── auth-ui.js          # Login/signup UI
│       ├── shared.js           # Store cache, math helpers, esc(), authFetch()
│       ├── router.js           # Hash router
│       ├── app.js              # Nav bindings, scenario selector, time-travel UI
│       ├── profile.js          # Slide-out profile panel
│       ├── demo.js             # Demo mode with localStorage mock data
│       └── pages/
│           ├── home.js         # Dashboard: health projection + current period
│           ├── pay-period.js   # Pay period detail view + paidExpenses checklist
│           ├── budgets.js      # Period list / summary
│           ├── expenses.js     # Expense management + sort
│           ├── cards.js        # Wallet (cards + banks + accounts)
│           ├── goals.js        # Savings goals
│           ├── notes.js        # Notes (Pro) + one-time purchases
│           ├── scenarios.js    # Scenario management + wallet clone UI
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
git add <specific files>
git commit -m "message"
git push origin dev           # Push to GitHub
eb deploy budget-peace-prod   # Deploy to Elastic Beanstalk (us-west-2)
```

**Auto-deploy convention:** Push to `origin/dev` → immediately run `eb deploy`. No PR, no CI gate, no separate approval needed.

**Branch strategy:**
- `dev` — active development, deployed to prod
- `main` — periodically merged from dev to snapshot stable versions
- `origin/main` is NOT kept in sync with every deploy

**EB environment:** `budget-peace-prod` (us-west-2), Health: Green
**EB CLI alerts:** Always warns about platform version update + CLI update — safe to ignore for now.

**Current git state (2026-04-30):**
- `dev` branch: `7059650` — deployed to budgetpeace.app
- `origin/main`: behind dev (not merged this session)

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

> ⚠️ **OLD TABLE NAME:** `bp_budget_periods` (no `_v2`) is the OLD table. Always use `bp_budget_periods_v2`. The cron was fixed for this — double-check any new server-side code that references period tables.

### Key Fields Per Table

**bp_users:**
```
userId, email, fullName, authProvider
accessLevel: 'none' | 'budget' | 'pro' | 'full' (legacy)
cadence, firstPayDate, durationMonths, incomeAmount
activeScenarioId
stripeCustomerId, stripeSubscriptionId, paidAt, entitlementStatus
emailPrefs: { paydaySummary, billReminders, overBudget, goalMilestones }
createdAt, lastLoginAt, updatedAt
```

**bp_budget_periods_v2:**
```
userId, periodKey (scenarioId#startDate)
startDate, endDate, income, cadence, scenarioId
paidExpenses: [expenseId, ...]   ← NEW: array of checked-off expense IDs
```

**bp_expenses:**
```
userId, expenseId
name, amount
recurrence: 'once' | 'recurring'
scenarioId                          ← defaults to 'main' for legacy rows
cardId?                             ← links to bp_cards
recurrenceFrequency: 'weekly' | 'biweekly' | 'monthly'
recurrenceStartDate
dueDay?                             ← INTEGER 1–31 (monthly recurring only)
allocationMethod?                   ← 'split' | 'first' | 'second' | 'due-date'
splitBiweekly?: boolean             ← legacy; prefer allocationMethod
category?, notes?, tags?
createdAt, updatedAt
```

**IMPORTANT:** `dueDay` is an INTEGER (recurring). One-time expenses use `dueDate` (full date string). Never confuse these.

**bp_cards:**
```
userId, cardId
name, type: 'Credit' | 'Debit' | 'Savings'
lastFour
colorIndex                          ← 0–7, maps to CARD_PALETTES gradient array
bankId?                             ← links to bp_banks
scenarioId
sortOrder                           ← numeric; defaults to Date.now() on create
createdAt, updatedAt
```

**bp_banks:**
```
userId, bankId
name, note?, color              ← hex color (e.g., '#3B82F6')
scenarioId
createdAt, updatedAt
```

**bp_goals:**
```
userId, goalId
name, targetAmount, targetDate
currentSaved                    ← ⚠ CRITICAL: this is the field name, NOT currentAmount
plannedContribution?
contributionEntries: [{ id, amount, date, note? }]
lastMilestone?                  ← last milestone % emailed (25/50/75/100)
scenarioId
createdAt, updatedAt
```

**bp_scenarios:**
```
userId, scenarioId
name, income, cadence, firstPayDate, durationMonths
isPrimary: boolean
notes: [{ id, text, createdAt, pinned? }]
emailPrefs?: { paydaySummary, billReminders, overBudget, goalMilestones }
deletedAt?                      ← soft delete marker
createdAt, updatedAt
```

---

## 6. Scenario Isolation Pattern

**CRITICAL:** All data tables are scenario-scoped. Enforced via DynamoDB FilterExpression:

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
3. Frontend stores token in localStorage
4. Every API call includes `Authorization: Bearer <token>` header
5. `requireAuth` middleware verifies token server-side via Supabase admin client
6. `req.userId` and `req.userEmail` set after verification
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
**Frontend gating:** `public/js/plans.js`

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
| GET | `/api/budgets/:userId?scenario=main` | List periods |
| PATCH | `/api/budgets/:userId/:periodKey` | ★ NEW: Update `paidExpenses` array on period record |

### Goals (`routes/goals.js`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/goals/:userId?scenario=main` | List goals |
| POST | `/api/goals` | Create goal |
| PUT | `/api/goals/:userId/:goalId` | Update goal metadata |
| POST | `/api/goals/:userId/:goalId/contribute` | Log contribution + fires milestone email |
| PUT | `/api/goals/:userId/:goalId/contributions/:entryId` | Edit contribution |
| DELETE | `/api/goals/:userId/:goalId/contributions/:entryId` | Delete contribution |
| DELETE | `/api/goals/:userId/:goalId` | Delete goal |

### Scenarios (`routes/scenarios.js`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/scenarios/:userId` | List non-deleted scenarios |
| GET | `/api/scenarios/:userId/:scenarioId` | Fetch single scenario |
| POST | `/api/scenarios` | Create scenario (optionally clone expenses + wallet) |
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
getEffectiveAllocation(expense)        // resolve allocation method
fmtRange(period)      // Format period as "Jan 1 – Jan 15, 2026"
fmtPayday(dateStr, today)  // "Payday Mon, Apr 28" or "Paid Fri, Apr 15"
inferCadence(period)  // 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'
```

**`inferCadence` heuristic:**
```javascript
if (days <= 8)  return 'weekly';
if (days <= 17) return 'biweekly';  // ⚠ threshold is 17, not 16
return 'monthly';
```
The safe path is `period.cadence` (stored by `generatePeriods.js`). The heuristic only fires for pre-existing periods without the field.

### money() — Two Variants (Page-Local)

**IMPORTANT:** `money()` is NOT in shared.js. Defined locally per page. Two variants:

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

---

## 11. Design System

### Brand Colors

| Role | Hex | Notes |
|------|-----|-------|
| **Primary Green** | `#1B5E3B` | Deep forest green — main brand color |
| **Vivid Green** | `#2D9A64` | Progress bars, highlights |
| **Light Green Tint** | `#E5F4EC` | Card backgrounds, subtle wash |
| **Dark Green** | `#134530` | Hover states |
| **Dark Mode Green** | `#4E9E6A` | Muted forest green in dark mode |
| Light mode background | `#EFEEE8` | Warm linen |
| Dark mode background | `#18181A` | Warm charcoal |

### Light Mode Tokens
```css
--color-bg:            #EFEEE8
--color-surface:       #FFFFFF
--color-surface-alt:   #F6F4EF
--color-border:        rgba(15,23,42,0.13)
--color-text-primary:   #111827
--color-text-secondary: #4A5568
--color-accent:         #1B5E3B
--color-accent-vivid:   #2D9A64
--color-accent-light:   #E5F4EC
--color-accent-dark:    #134530
--color-warn:           #D97706
--color-danger:         #DC2626
```

### Typography
- **Font:** Plus Jakarta Sans (400 · 500 · 600 · 700 · 800)
- **Scale:** xs(12) · sm(14) · md(15) · lg(18) · xl(24) · 2xl(32) · 3xl(48)

### Spacing
`--space-1` = 4px · `--space-2` = 8px · `--space-3` = 12px · `--space-4` = 16px · `--space-5` = 20px · `--space-6` = 24px · `--space-8` = 32px

### Radius
`--radius-sm` = 8px · `--radius-md` = 14px · `--radius-lg` = 20px · `--radius-xl` = 28px · `--radius-pill` = 999px

### Stack Layout Utility
**⚠ IMPORTANT:** Always use BOTH classes: `class="stack stack--3"`. `stack--N` only sets gap; without `.stack`'s `display:flex`, the gap has no effect.

---

## 12. Pay Cadence System — CRITICAL

Three supported pay cadences:

| Cadence | Period length | Description |
|---------|--------------|-------------|
| `biweekly` | ~14 days | Every 2 weeks |
| `semimonthly` | ~15–17 days | Fixed: 1st–14th and 15th–end of month |
| `monthly` | ~28–31 days | Once per month |

### The `isHalfMonth` Pattern

```javascript
const isHalfMonth = cadence === 'biweekly' || cadence === 'semimonthly';
```

Appears in: `home.js`, `pay-period.js`, `budgets.js`, `lib/periodUtils.js`. **Always handle both cadences when adding period math.**

### Allocation Methods (monthly expenses in half-month periods)

| Value | Meaning |
|-------|---------|
| `'due-date'` | Default — appears in period containing its `dueDay` |
| `'split'` | Half amount in each period |
| `'first'` / `'paycheck1'` | Period containing day 1 |
| `'second'` / `'paycheck2'` | Period containing day 16 |
| `splitBiweekly: true` | Legacy — treated as `'split'` |

**Default for new expenses:** `'due-date'` (requires intentional override to split/paycheck)
**Monthly cadence:** Allocation dropdown hidden entirely.

---

## 13. New Feature: Pay Period Checklist (paidExpenses)

Added in this session. Allows users to check off bills as paid within a pay period.

### How It Works

**Data model:** `paidExpenses: [expenseId, ...]` — array stored on each `bp_budget_periods_v2` record.

**Backend (`routes/budgets.js`):**
```javascript
// PATCH /api/budgets/:userId/:periodKey
// Body: { paidExpenses: ['exp1', 'exp2', ...] }
// Updates the period record's paidExpenses array
```

**Frontend (`pay-period.js`):**
```javascript
pdTogglePaid(period, expenseId)   // mutates period.paidExpenses, fires PATCH, updates progress
pdUpdateProgress()                // updates progress bar without re-render
buildPdBreakdown()                // renders checkboxes + progress bar
```

The progress bar shows "X of N bills paid" — lives inside the pay period breakdown UI.

**Persistence:** Saved to DynamoDB immediately on check/uncheck. Survives page reload, device changes, etc.

---

## 14. New Feature: Wallet Clone for Scenarios

Added in this session. When creating a new scenario, user can clone wallet (banks + cards) from an existing scenario — separate from expenses clone.

### How It Works

**Backend (`routes/scenarios.js`):**
- `POST /api/scenarios` now accepts optional `cloneWalletFrom` body param (a scenarioId)
- If provided: clones banks first (new bankIds generated), builds `bankIdMap`, then clones cards with remapped `bankId` references
- Uses existing `queryByScenario()` helper for both `BANKS_TABLE` and `CARDS_TABLE`
- If `cloneFrom` AND `cloneWalletFrom` both provided: both happen independently

**Frontend (`scenarios.js`):**
```javascript
openNewScenarioSheet()  // has two dropdowns: "Copy expenses from" and "Copy wallet from"
// cloneWalletFromVal || undefined  sent in POST body (omitted if not selected)
```

**Logic notes:**
- Bank IDs are remapped (new UUIDs), not reused
- Card `bankId` references are updated to new IDs via `bankIdMap`
- After creation: Store must invalidate `'scenarios'`, `'banks'`, `'cards'` on new scenario load

---

## 15. Email Notification System

### Services

**`services/email.js`** — All email sending via Resend API
- `sendPaydaySummary(toEmail, { period, expenses, cards, banks, totalBills, remaining })`
- `sendBillDueReminder(toEmail, { expenses, period, daysAway })`
- `sendOverBudget(toEmail, { period, totalBills, income, overage })`
- `sendGoalMilestone(toEmail, { goal, milestonePercent })`

Email templates use **table-based HTML** (Gmail strips CSS flexbox).

**`services/cron.js`** — Runs once per day
- `runPaydaySummary()` — sends night before payday
- `runBillDueReminders()` — 3 days before bill dueDay
- `runOverBudgetAlerts()` — fires on payday if bills > income

**Fixed cron bugs:**
1. Was querying `bp_budget_periods` (old) — fixed to `bp_budget_periods_v2`
2. `getPeriodsForUser` had no `scenarioId` param — fixed to pass active scenario + FilterExpression
3. Bill reminders were checking `e.dueDate === targetDate` — fixed to compare `e.dueDay` (integer) vs day-of-month

### Email Preferences

Per-scenario email prefs in `bp_scenarios.emailPrefs` (overrides user-level `bp_users.emailPrefs`):
```javascript
{ paydaySummary, billReminders, overBudget, goalMilestones }
```
UI in Settings page. Saves via `PATCH /api/scenarios/:userId/:scenarioId/email-prefs`.

### Test Email Console Commands

To trigger test emails manually (server console access required):
```bash
# See routes/migrate.js (or equivalent test route) for test email endpoints
# Check AGENT_HANDOFF for any test commands documented from prior sessions
```

### Goal Milestone Emails

Fired from `routes/goals.js` on contribution — NOT from cron. Milestones: 25/50/75/100%. `lastMilestone` prevents duplicates.

⚠ **Use `goal.currentSaved` — NOT `goal.currentAmount`** (that field doesn't exist).

---

## 16. Landing Page v2 (`public/landing-v2.html`)

The main marketing page. Served at `/landing-v2`. **This is a design surface — CSS/layout changes are expected and welcome here.**

### Architecture

- **Standalone HTML file** (not the SPA shell)
- Pulls `main.css` for design tokens and dark mode
- All CSS in `<style>` block at top
- All JS at bottom of `<body>`
- No JS framework, no build step

### Sections (top to bottom)

1. **Nav** — Brand + Features/Pricing/Demo links + Open App CTA + dark mode toggle
2. **Hero** — Headline + CTAs + trust badges + 3-phone interactive mockup
3. **Features** — Tab bar + desktop browser mockup (full-width dark stage) + text below
4. **No Tricks callout** — Promise section (no surprise charges, full access, no spam)
5. **Pricing** — Monthly/Lifetime toggle + plan cards
6. **How It Works** — 3-step cards
7. **Final CTA** — Bottom CTA section
8. **Footer**

### Hero Section: 3-Phone Layout

**Structure:**
```html
.hero__phones
  .mock-phone.mock-phone--ghost.mock-phone--ghost-l  ← Left: Expenses page
  .mock-phone.mock-phone--hero  ← Center: Interactive (Pay Period)
  .mock-phone.mock-phone--ghost.mock-phone--ghost-r  ← Right: Budgets + Goals
```

**Current CSS state (as of 2026-04-30):**
```css
.hero__phones {
  gap: 28px;
  max-width: 1040px;
  overflow: visible;
}
.mock-phone--ghost {
  opacity: 1;              /* NOT greyed out */
  pointer-events: none;
  animation: mockFloat 5.8s ease-in-out 1.4s infinite;
}
.mock-phone--ghost-l { transform: translateY(60px) scale(0.90); }
.mock-phone--ghost-r { transform: translateY(36px) scale(0.90); }
.mock-phone--hero { width: 368px; border-radius: 56px; }  /* bigger than default 296px */
.mock-phone { width: 296px; /* base width for ghost phones */ }
```

**Center phone** is interactive — JS tabs at top (`Financial Health` / `Current Pay Period`) switch the screen content. Default active: `Current Pay Period`.

**Ghost phones** show static content — left shows Expenses, right shows Budgets/Goals.

### Features Section: Desktop Mockup

**Layout:** Full-width dark gradient stage (Raycast-style), mockup inside, text below.

```css
.feat-panel--desktop { display: block; }  /* stacked, not 2-col grid */
.feat-panel--desktop .feat-panel__img {
  background: linear-gradient(160deg, #0e0e10 0%, #1a1a1d 55%, #0e0e10 100%);
  border-radius: 20px;
  padding: 44px 44px 0;
  margin-bottom: 52px;
}
.mock-desk-screen { height: 468px; }
.mock-desk-sidebar { width: 196px; }
```

**4 tabs + screens:**
| Tab | Screen ID | Sidebar Nav Highlight |
|-----|-----------|----------------------|
| Pay Period | `fd-period` | `desk-nav-period` |
| Financial Health | `fd-health` | `desk-nav-home` |
| What-Ifs | `fd-whatif` | `desk-nav-budgets` |
| Wallet | `fd-wallet` | `desk-nav-wallet` |

**Feature text below mockup:** Centered, max-width 720px. Checklist in 2-column grid on desktop.

**JS function:** `switchTab(idx)` — swaps `.mock-ds` active screen + sidebar nav active state + updates text in `.feat-panel__text`.

**Font sizes inside mockup (after scale-up):**
- Nav items: 13px, Brand: 15px, Scenario chips: 11px, Topbar: 14px
- Content rows: 13px, Bills: 13px, Section headers: 11px
- Remaining amount: 34px, Progress label: 11px

### Key Landing Page CSS Classes

| Class | Purpose |
|-------|---------|
| `.mock-phone` | Base phone frame (296px, dark chrome) |
| `.mock-phone--hero` | Center hero phone override (368px, 56px radius) |
| `.mock-phone--ghost` | Side phone (opacity 1, pointer-events none, floats) |
| `.mock-inner` | Phone inner content container |
| `.mock-s` | Phone screen (show/hide via `is-active`) |
| `.mock-desktop` | Browser chrome + screen container |
| `.mock-desk-chrome` | Top bar with traffic lights + URL bar |
| `.mock-desk-screen` | Flex container: sidebar + main |
| `.mock-desk-sidebar` | Left nav area (196px wide) |
| `.mock-desk-main` | Scrollable content area |
| `.mock-ds` | Desktop screen content (show/hide via `is-active`) |
| `.mock-desk-topbar` | Sticky page title bar (uses negative margin to span full width) |
| `.feat-panel--desktop` | Block layout override for desktop mockup section |
| `.feat-tabs` | Tab bar (pill-style, centered) |
| `.feat-tab` | Individual tab button |

### Landing Page Pending / Known Issues

- **None critical** as of last deploy — page is live and functional
- Further polish may be requested (spacing tweaks, additional screens, animation)
- The `landing.html` (old page) is still live — not actively maintained

---

## 17. Pay Cadence System (continued)

### lib/periodUtils.js (backend)

Backend port of all frontend period math. Required because cron.js needs server-side period calculations.

```javascript
const { calcPeriodExpenses } = require('../lib/periodUtils');
const { items, total } = calcPeriodExpenses(expenses, period);
```

---

## 18. Time Travel

- `effectiveToday()` returns `_viewDate` || `_serverToday` || `localToday()`
- `_viewDate` persisted to localStorage as `'bp_viewDate'`
- UI: inline button in top bar (desktop), FAB-like panel on mobile

---

## 19. Dark Mode

- CSS tokens in `html[data-theme="dark"]` block in `main.css`
- `theme.js` loads first to prevent flash
- Persisted to localStorage as `'bp_theme'`
- Falls back to system preference on first visit
- No blue/cold tones in dark mode — warm charcoal aesthetic

---

## 20. Demo Mode

- `/demo` → `demo.html` — no auth required
- All mutations intercepted by `demo.js`, applied to localStorage
- Data in localStorage keys prefixed `bp_demo_`

---

## 21. What Has Been Built (Complete Feature List)

- [x] Pay period generation (biweekly, semimonthly, monthly cadences)
- [x] Recurring expenses with frequency, start date, due day, allocation method
- [x] One-time expenses
- [x] Expense metadata: category, notes, tags
- [x] Expense sorting (5 modes, client-side)
- [x] Expense allocation: Paycheck A/B labels, default due-date
- [x] **Pay period expense checklist** — paidExpenses array, persisted to DynamoDB, progress bar
- [x] Wallet: credit/debit/savings cards with gradient backgrounds
- [x] Wallet: 2-column card grid + compact mode (persistent)
- [x] Wallet: drag-to-reorder (SortableJS) for cards + savings accounts
- [x] Wallet: bank grouping + filter chips + color dots
- [x] Wallet: all-banks overview + per-bank stats
- [x] Wallet: inline accordion expand + card detail sheet
- [x] Savings goals with contribution history + edit/delete
- [x] Goal milestone emails (25/50/75/100%)
- [x] Notes (Pro-only) in dashboard + scenario detail
- [x] One-time purchases (wishlist, soft archive)
- [x] Scenarios: create, clone expenses, **clone wallet (banks+cards)**, edit, promote, soft-delete
- [x] Scenario isolation (all data scoped to active scenario)
- [x] Scenario comparison (Pro-only)
- [x] Financial health projection (configurable horizon)
- [x] Time travel (view finances on any date)
- [x] Dark mode (system preference + manual toggle, no flash)
- [x] Settings page with cadence-aware period regeneration
- [x] Pro plan with Stripe (monthly + lifetime)
- [x] Demo mode
- [x] Bill detail modal
- [x] Email notifications: payday summary, bill reminders (3 days), over-budget alerts
- [x] Per-scenario email preferences
- [x] Profile panel: identity card layout, stat pills, save + settings row
- [x] lib/periodUtils.js — backend period math
- [x] **Landing page v2** — 3-phone hero, desktop mockup features section, dark stage layout, pricing, how-it-works

---

## 22. What Is NOT Built Yet (Planned / Discussed)

| Feature | Status | Notes |
|---------|--------|-------|
| Expense sort Stage 2 | Planned | `sortOrder` field on expenses, batch PUT `/api/expenses/:userId/order` |
| Expense sort Stage 3 | Planned | SortableJS drag-drop on expenses page (library already approved) |
| Goals V2 | Design exists | Auto-prompts when nearing/missing goals |
| Scenario Mode | Design exists | Deeper "what-if" tooling — design doc discussed with Amiel |
| Bank-specific notes | Discussed | Multi-note system per bank |
| Multi-select bank filter | Discussed | Toggle chips independently |
| AI-powered budget insights | Planned | Pro feature; not started |
| Custom widgets | Planned | Pro feature; not started |
| Weekly email cadence | UI placeholder | Shown as "coming soon" in email prefs |
| Landing page `/landing-v2` → `/` | Pending | Old landing.html still at root; v2 not yet promoted |

---

## 23. Critical Constraints — Read Before Changing Anything

1. **No visual/CSS redesign of the SPA** unless directly blocking a function. The landing page is different — design work is expected there.
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
13. **`stack stack--3` — both classes required** for gap to work.
14. **`dueDay` vs `dueDate`** — recurring expenses use `dueDay` (integer 1–31); one-time expenses use `dueDate` (full date string). Never mix these up.
15. **DynamoDB table is `bp_budget_periods_v2`** — not `bp_budget_periods`. The old table may still exist but is not used.

---

## 24. Deploy Checklist

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

## 25. Environment Variables

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

## 26. Common Patterns & Gotchas

### Adding a new optional field to an expense/card/goal
1. Add to POST handler: `...(fieldValue && { fieldName: fieldValue })`
2. Add to PUT handler: destructure + set in item spread
3. Add to frontend form: new `<input>` in the sheet
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

### paidExpenses PATCH pattern (pay-period.js)
```javascript
// Toggle a paid expense:
period.paidExpenses = period.paidExpenses.includes(expenseId)
  ? period.paidExpenses.filter(id => id !== expenseId)
  : [...period.paidExpenses, expenseId];

// Persist:
authFetch(`/api/budgets/${userId()}/${period.periodKey}`, {
  method: 'PATCH',
  body: JSON.stringify({ paidExpenses: period.paidExpenses })
});
// NOTE: Do NOT invalidate 'periods' here — update in-memory only for performance
```

---

## 27. Session History Summary (What Changed and Why)

### This session (2026-04-30):

**Pay Period Checklist**
- Goal: let users check off bills as paid within a pay period, persisted across sessions
- Added `paidExpenses` array to period records in DynamoDB
- `PATCH /api/budgets/:userId/:periodKey` handles the mutation
- Frontend: checkboxes in pay-period breakdown, progress bar, immediate persistence

**Scenario Wallet Clone**
- Goal: when creating a scenario, user can clone cards+banks from another scenario (not just expenses)
- Backend: `cloneWalletFrom` body param on `POST /api/scenarios`; clones banks first (new IDs), remaps bankId references in cloned cards
- Frontend: second dropdown "Copy wallet from" in new scenario sheet

**Cron Fixes**
- cron.js was querying wrong table (`bp_budget_periods` → `bp_budget_periods_v2`)
- `getPeriodsForUser` had no scenarioId filter — fixed to use active scenario with FilterExpression

**Landing Page v2 — Major Work**
- Added 3-phone hero: left ghost (Expenses), interactive center (Pay Period/Home), right ghost (Budgets/Goals)
- Added desktop browser mockup for features section with 4 tab-switched screens
- Redesigned features layout to full-width dark stage (Raycast-inspired)
- Scaled up all mockup font sizes (~1.3× everywhere)
- Wallet mockup redesigned with bank groups + colored dots + SAVINGS badges
- Fixed hero phone layout: removed grey opacity, enlarged center phone (368px), spaced apart
- Added content to Financial Health (Net Surplus card) and What-Ifs (Impact Summary) screens to fill height

---

*Document updated: 2026-04-30. Run `git log --oneline -10` for commits since this date.*
