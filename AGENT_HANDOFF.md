# AGENT HANDOFF — Budget Peace
**Last updated: 2026-04-12**
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
│   ├── goals.js                # Savings goals + contribution history
│   ├── scenarios.js            # Scenario CRUD, notes, expense cloning
│   ├── purchases.js            # One-time purchases (soft archive)
│   └── stripe.js               # Checkout sessions, webhooks, plan entitlements
├── middleware/
│   └── auth.js                 # requireAuth, verifyOwner
├── config/
│   └── dynamo.js               # AWS DynamoDB DocumentClient setup
├── lib/
│   ├── generatePeriods.js      # Period generation logic
│   └── planLimits.js           # Server-side plan enforcement
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
│           └── settings.js     # User setup / onboarding
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
**EB CLI alert:** Always warns about platform version update — this is safe to ignore for now.

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
| `bp_scenarios` | `scenarioId` | Financial scenarios + notes |
| `bp_pending_entitlements` | — | Checkout-first payment staging (partition key: `stripeSessionId`; email GSI) |

### Key Fields Per Table

**bp_users:**
```
userId, email, fullName, authProvider
accessLevel: 'none' | 'budget' | 'pro' | 'full' (legacy)
cadence, firstPayDate, durationMonths, incomeAmount  ← user's pay setup (legacy; per-user)
activeScenarioId                                      ← which scenario is active
stripeCustomerId, stripeSubscriptionId, paidAt, entitlementStatus
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
dueDay?                             ← day-of-month for monthly recurring
allocationMethod?                   ← 'split' | 'first' | 'second' | 'due-date'
splitBiweekly?: boolean             ← legacy field; prefer allocationMethod
category?, notes?, tags?            ← optional metadata (added 2026-04-12)
createdAt, updatedAt
```

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

**bp_purchases:**
```
userId, purchaseId
name, price?, note?, link?, targetDate?
scenarioId
archivedAt?                     ← soft archive; filtered out in GET
createdAt, updatedAt
```

**bp_goals:**
```
userId, goalId
name, targetAmount, targetDate
currentSaved                    ← sum of all contributionEntries amounts
plannedContribution?
contributionEntries: [{ id, amount, date, note? }]  ← full audit trail
scenarioId
createdAt, updatedAt
```

**bp_scenarios:**
```
userId, scenarioId
name, income, cadence, firstPayDate, durationMonths
isPrimary: boolean              ← exactly one per user should be true
notes: [{ id, text, createdAt, pinned? }]
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

**Profile Sync (on every login):**
- POST `/api/auth/profile` → creates/updates bp_users row
- Checks for pending entitlements (checkout-first flow)
- Returns user profile with accessLevel + plan state

**Checkout-First Flow:**
- User can pay via Stripe before signing up
- Pending entitlement staged in `bp_pending_entitlements` (by stripeSessionId + email GSI)
- On next login, profile sync claims pending entitlement

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

**Server-side gating:** `lib/planLimits.js` — `canAddExpense()`, `canCreateScenario()`, `canUseProjectionMonths()`, `canUseNotes()`
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
| PUT | `/api/expenses/:userId/:expenseId` | Update expense (includes category, notes, tags) |
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
| POST | `/api/goals/:userId/:goalId/contribute` | Log contribution entry |
| PUT | `/api/goals/:userId/:goalId/contributions/:entryId` | Edit contribution (delta applied to currentSaved) |
| DELETE | `/api/goals/:userId/:goalId/contributions/:entryId` | Delete contribution (subtracted from currentSaved) |
| DELETE | `/api/goals/:userId/:goalId` | Delete goal |

### Scenarios (`routes/scenarios.js`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/scenarios/:userId` | List non-deleted scenarios |
| GET | `/api/scenarios/:userId/:scenarioId` | Fetch single scenario |
| POST | `/api/scenarios` | Create scenario (optionally clone expenses) |
| PUT | `/api/scenarios/:userId/:scenarioId` | Update scenario + regenerate periods |
| PATCH | `/api/scenarios/:userId/:scenarioId/promote` | Make primary (demotes others) |
| POST | `/api/scenarios/:userId/:scenarioId/notes` | Add note (Pro-only, max 10) |
| PATCH | `/api/scenarios/:userId/:scenarioId/notes/:noteId` | Edit note text/pinned |
| DELETE | `/api/scenarios/:userId/:scenarioId/notes/:noteId` | Delete note |
| DELETE | `/api/scenarios/:userId/:scenarioId/expenses` | Clear all expenses in scenario |
| DELETE | `/api/scenarios/:userId/:scenarioId` | Soft-delete scenario |

### Purchases (`routes/purchases.js`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/purchases/:userId?scenario=main` | List non-archived purchases |
| POST | `/api/purchases` | Create purchase |
| PUT | `/api/purchases/:userId/:purchaseId` | Update purchase or archive it (set archivedAt) |

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

**Usage pattern:**
```javascript
const expenses = await Store.get('expenses');  // fetch or return cached
Store.invalidate('expenses');                  // clear cache after mutation
Store.invalidateAll();                         // clear everything (on scenario change)
```

**CRITICAL:** Always `Store.invalidate(key)` after any POST/PUT/DELETE — there is no automatic invalidation. The cache has no TTL; it persists until explicitly cleared.

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
inferCadence(period)  // 'biweekly' or 'monthly' from period length
```

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
2. `sortablejs@1.15.3` CDN — drag-to-reorder library
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

### Colors (Light Mode)
```css
--color-bg:            #EFEEE8   /* warm linen */
--color-surface:       #FFFFFF
--color-surface-alt:   #F6F4EF   /* warm cream */
--color-border:        rgba(15,23,42,0.08)
--color-border-strong: rgba(15,23,42,0.14)
--color-text-primary:   #111827
--color-text-secondary: #5C6B80
--color-text-tertiary:  #8B96A8
--color-accent:         #1B5E3B  /* deep forest green */
--color-accent-vivid:   #2D9A64  /* bright green for progress bars */
--color-accent-light:   #E5F4EC
--color-warn:           #D97706
--color-danger:         #DC2626
```

**Dark mode:** Warm charcoal (`--color-bg: #18181A`, `--color-surface: #222224`, `--color-surface-alt: #2C2C2E`). Applied via `html[data-theme="dark"]`. No blue/cold tones in dark mode.

### Typography
- **Font:** Plus Jakarta Sans (400 · 500 · 600 · 700 · 800)
- **Scale:** xs(12) · sm(14) · md(15) · lg(18) · xl(24) · 2xl(32) · 3xl(48)

### Spacing
- `--space-1` = 4px, `--space-2` = 8px, `--space-3` = 12px, `--space-4` = 16px, `--space-5` = 20px, `--space-6` = 24px, `--space-8` = 32px, `--space-10` = 40px

### Radius
- `--radius-sm` = 8px, `--radius-md` = 14px, `--radius-lg` = 20px, `--radius-xl` = 28px, `--radius-pill` = 999px

### Layout
- `--top-bar-height` = 56px, `--bottom-nav-clearance` = 92px, `--max-content` = 760px, `--nav-width` = 260px

### Card Palettes (CARD_PALETTES in cards.js — 8 gradients)
```javascript
[0] 'linear-gradient(135deg, #1C1C2E 0%, #2D3561 100%)'   // Dark navy
[1] 'linear-gradient(135deg, #0F4C75 0%, #1B262C 100%)'   // Ocean
[2] 'linear-gradient(135deg, #375C42 0%, #1E3A24 100%)'   // Forest green
[3] 'linear-gradient(135deg, #6B3FA0 0%, #3D1B6E 100%)'   // Purple
[4] 'linear-gradient(135deg, #B5451B 0%, #7A1A0E 100%)'   // Bronze/rust
[5] 'linear-gradient(135deg, #1B4B82 0%, #0A2647 100%)'   // Blue
[6] 'linear-gradient(135deg, #111111 0%, #2C2C2C 100%)'   // Black
[7] 'linear-gradient(135deg, #C0C0C0 0%, #8A9BA8 100%)'   // Silver
```

### Bank Colors (BANK_COLORS in cards.js — 6 presets)
```javascript
{ label: 'Blue',   value: '#3B82F6' }
{ label: 'Green',  value: '#22C55E' }
{ label: 'Purple', value: '#8B5CF6' }
{ label: 'Orange', value: '#F97316' }
{ label: 'Red',    value: '#EF4444' }
{ label: 'Gray',   value: '#6B7280' }  ← BANK_COLOR_DEFAULT
```

---

## 12. Feature Inventory

### Home Page
- Financial health projection (horizon selector: 3/6/12 months; persisted to localStorage)
- Current period card: income, expenses, remaining, progress bar, bills list (first 5 expandable)
- `openBillDetailModal(expense, refreshFn)` — bottom sheet with full expense details
- Notes widget (Pro-only) embedded in dashboard
- Clicking a bill in the period card → `openBillDetailModal()`

### Pay Period Page
- Period selector dropdown
- Per-period breakdown: income, all expenses in period, remaining
- Progress bar for spending % of income

### Budgets Page
- List of all budget periods
- Per-period summary (income, obligations, remaining)

### Expenses Page
- Filter toggle: Current / Upcoming
- Sort dropdown: Highest Amount · Lowest Amount · A–Z · Newest · Oldest (client-side; persists across toggle; resets on page reload)
- Per-expense row: inline expand with bank color dot, card info, amount
- Edit/delete inline
- Plan limit badge (e.g., "5 of 8 expenses")
- `openSheet(expense?, onSave)` — add/edit form
- **Form fields as of 2026-04-12:**
  - Name, Amount
  - Recurrence: Once / Recurring
  - If recurring: Start Date, Frequency (Weekly/Biweekly/Monthly)
  - If monthly: Due Day (1–31), Allocation Method (when biweekly cadence: Paycheck 1/Paycheck 2/Split/Due Date)
  - Card / Account selector
  - **Category (optional text)**
  - **Notes (optional textarea)**
  - **Tags (optional comma-separated text)**
- `openBillDetailModal()` shows category/notes/tags if set (hidden when empty)

### Wallet (Cards) Page — `cards.js`

This is the most complex page. Read carefully.

**Overview section (top):**
- "All Banks" view: total cards+accounts count, # banks, total monthly spend on cards
- Bank overview rows (clickable → filter to that bank): bank color dot, name, card/account count sub-line, monthly spend
- Unassigned cards row (if any cards have no bankId)
- Per-bank filtered view: 3 stats (total cards+accounts, card count, monthly spend)

**Bank filter chips:**
- Row of chips at top: "All Banks" + one per bank + "+ Add Bank" button
- Click selected chip → opens edit sheet for that bank
- Click "All Banks" when already selected → opens bank management
- Click different chip → switches filter

**Accounts section (Savings cards):**
- Separate section labeled "Accounts (N)"
- Savings pills: bank color dot · name · lastFour · bank name · monthly spend badge
- Reorder button (shows when ≥2 savings accounts): SortableJS drag-drop, saves to DynamoDB via `PUT /api/cards/:userId/order`
- Click savings pill → inline accordion expand (toggleItemExpand)

**Cards section (Credit/Debit):**
- Section header: label · chevron compact toggle · Reorder button
- **Expanded mode (default):** 2-column grid of visual cards (`wallet-cards-grid`)
  - ISO 7810 aspect ratio (1.586:1) via `aspect-ratio: 1.586 / 1`
  - Card shows: type, bank name (float right), card number `••XXXX`, name
  - Click card → bottom sheet detail view (`openCardDetailSheet()`)
- **Compact mode (persisted to localStorage `bp_wallet_compact`):** Pill rows (`wallet-cards-list`)
  - Color swatch · name · lastFour · type badge · monthly total in green
  - Click compact row → inline accordion expand
- **Reorder mode:** SortableJS drag-drop on `#wallet-cards-grid` OR `#wallet-cards-list` (whichever is active)
  - "Done Reordering" → saves sortOrder to DynamoDB via `PUT /api/cards/:userId/order`
  - sortOrder defaults to `Date.now()` on create; updated as `(i + 1) * 1000` on save

**Inline accordion expand (`wallet-item-expand`):**
- Injected with `insertAdjacentHTML('afterend', ...)` immediately after the triggering element
- Shows: "Monthly total" header + amount, expense rows with borders between them, Edit + Delete buttons
- Expense rows are clickable → `openBillDetailModal(expense, null)`
- One expand open at a time (closes others before opening new)
- Expense row delineation: `border-top: 1px solid var(--color-border)` via CSS `+` selector

**Bottom sheet card detail (`openCardDetailSheet()`):**
- Shows full card visual, card number `••XXXX`, type, bank
- Stack of associated expenses (clickable → `openBillDetailModal`)
- Edit + Delete buttons

**State variables (module-level):**
```javascript
let _cards         = [];        // all cards for current scenario
let _cardExpenses  = [];        // all expenses for current scenario
let _selectedCard  = null;
let _banks         = [];        // all banks for current scenario
let _selectedBank  = null;      // null = All Banks
let _walletCompact = localStorage.getItem('bp_wallet_compact') === '1';
let _walletReorder = false;     // cards reorder mode
let _accountsReorder = false;   // savings accounts reorder mode
```

### Goals Page
- Goal cards with progress bar (% toward target)
- Log contribution: date, amount, optional note
- Contribution history: full audit trail with edit/delete
- Delete goal with confirmation

### Notes & Purchases Page
- **Notes (Pro-only):** Scenario notes; pinned first; max 10; max 500 chars each; add/edit/delete; plan-gated
- **Purchases:** One-time purchase wishlist; expand for details (price, link, target date); soft archive; add/edit

### Scenarios Page
- List all active scenarios with primary indicator
- Expand scenario: financial snapshot (income, expenses, monthly obligations, remaining)
- Create from scratch or clone from existing scenario (with/without copying expenses)
- Edit scenario: name + financial setup (triggers period regeneration)
- Promote to primary
- Soft-delete (cannot delete primary or only remaining scenario)
- Notes per scenario (Pro-only)

### Compare Page (Pro-only)
- Side-by-side scenario comparison
- Gated behind Plans.canUse('scenarioComparison')

### Settings Page
- Income amount, pay frequency (Biweekly/Monthly), first pay date, duration months
- Structure change (cadence/firstPayDate/duration) → full period regeneration
- Income-only change → update period incomes (no regeneration)

---

## 13. Expense Math — Canonical Rules

```javascript
// Monthly normalization
calcMonthlyAmt(expense):
  weekly   → amount × 4
  biweekly → amount × 2
  monthly  → amount × 1

// Period multiplier (how many times expense occurs in a period)
expMultiplier(expenseFreq, periodCadence):
  ('weekly',   'biweekly') = 2   // 2 weeks per biweekly period
  ('weekly',   'monthly')  = 4   // ~4 weeks per month
  ('biweekly', 'monthly')  = 2   // 2 biweekly cycles per month
  (anything,   'monthly')  = 1   // monthly expense in monthly period
  ('weekly',   'weekly')   = 1   // weekly expense in weekly period

// Allocation methods for monthly expenses in biweekly periods
'due-date'  → expense falls in whichever period contains its due day
'first'     → (formerly 'paycheck1') always in first period of month
'second'    → (formerly 'paycheck2') always in second period of month
'split'     → half in each period
splitBiweekly: true → legacy; treated as 'split'

// getEffectiveAllocation(expense) resolves all variants to canonical names
```

---

## 14. Time Travel

Users can view their finances on any past or future date:

- `effectiveToday()` returns `_viewDate` || `_serverToday` || `localToday()`
- `_viewDate` persisted to localStorage as `'bp_viewDate'`
- All page renders use `effectiveToday()` for period filtering, health projection, etc.
- UI: inline button in top bar (desktop), FAB-like panel on mobile
- Time-travel strip shows when active: "Viewing as: Jan 15, 2026" with [Change] and [Back to Today] buttons
- `setViewDate(dateStr)` → updates `_viewDate`, re-renders current page
- `clearViewDate()` → removes `_viewDate`, re-renders

---

## 15. Dark Mode

- CSS tokens in `html[data-theme="dark"]` block in `main.css`
- `theme.js` loads first (before any other script) to prevent flash
- Persisted to localStorage as `'bp_theme'`
- Falls back to system preference (`prefers-color-scheme`) on first visit
- Toggle button in top bar (`.top-bar__theme-toggle`)
- Flash prevention: inline `<script>` in `<head>` of landing.html and demo.html reads localStorage before paint

---

## 16. Demo Mode

- Accessible via `/demo` → `demo.html`
- No auth required
- Mock Supabase session injected
- All mutations (POST/PUT/DELETE) intercepted by `demo.js` and applied to localStorage
- Data stored as JSON in localStorage keys prefixed with `bp_demo_`
- Works with all pages transparently (no page-level code changes needed for demo)

---

## 17. What Has Been Built (Completed Features)

- [x] Pay period generation (biweekly + monthly cadences)
- [x] Recurring expenses with frequency, start date, due day, allocation method
- [x] One-time expenses
- [x] Expense metadata: category, notes, tags
- [x] Expense sorting (5 modes, client-side)
- [x] Wallet: credit/debit/savings cards with gradient backgrounds
- [x] Wallet: ISO 7810 card aspect ratio
- [x] Wallet: 2-column card grid
- [x] Wallet: compact mode (pill rows, persistent)
- [x] Wallet: drag-to-reorder cards + savings accounts (sortOrder → DynamoDB)
- [x] Wallet: bank grouping + filter chips
- [x] Wallet: bank color dots on expense rows
- [x] Wallet: all-banks overview stats + per-bank stats
- [x] Wallet: overview bank rows clickable → navigate to bank filter
- [x] Wallet: inline accordion expand (savings pills + compact card rows)
- [x] Wallet: expense rows in expand + bottom sheet → openBillDetailModal
- [x] Wallet: monthly spend totals on compact card rows and savings pills
- [x] Savings goals with contribution history + edit/delete entries
- [x] Notes (Pro-only) embedded in dashboard + scenario detail
- [x] One-time purchases (wishlist/tracking, soft archive)
- [x] Scenarios: create, clone, edit, promote, soft-delete
- [x] Scenario isolation: all data scoped to active scenario
- [x] Scenario comparison (Pro-only)
- [x] Financial health projection (configurable horizon, localStorage-persisted)
- [x] Time travel (view finances on any date)
- [x] Dark mode (system preference + manual toggle, no flash)
- [x] Dark mode on landing.html and demo.html
- [x] Settings page (income, cadence, period generation)
- [x] Pro plan with Stripe (monthly + lifetime, checkout-first flow)
- [x] Demo mode
- [x] Bill detail modal (amount, frequency, due, card, category, notes, tags)

---

## 18. What Is NOT Built Yet (Planned / Discussed)

| Feature | Status | Notes |
|---------|--------|-------|
| Expense sort Stage 2 | Planned | `sortOrder` field on expenses, batch PUT `/api/expenses/:userId/order` |
| Expense sort Stage 3 | Planned | SortableJS drag-drop on expenses page |
| Goals V2 | Design exists | Auto-prompts when nearing/missing goals; design doc discussed |
| Scenario Mode | Design exists | Deeper "what-if" tooling; full design doc discussed with engineer |
| Bank-specific notes | Discussed | Multi-note system per bank (same UX as scenario notes); architecture not decided (array on bank item vs new table) |
| Multi-select bank filter | Discussed | Toggle chips independently; "All Banks" resets; overview + card list scoped to selected banks |
| AI-powered budget insights | Planned | Pro feature; not started |
| Custom widgets | Planned | Pro feature; not started |
| Advanced adjustments | Planned | Pro feature; not started |

---

## 19. Critical Constraints — Read Before Changing Anything

1. **No visual/CSS redesign** unless directly blocking a function. Do not touch layout, spacing, colors, or typography unless the feature requires it.
2. **money() stays page-local.** Two variants exist (plain vs. cents-span). Do not consolidate into shared.js.
3. **No over-engineering.** If you can solve it in 10 lines, do not write 50. No premature abstractions. No helper functions for one-off operations.
4. **No backward-compat hacks.** If old code is unused, delete it. No `_oldName` variables, no re-exports, no `// removed` comments.
5. **Vanilla JS only.** No frameworks, no transpilation, no bundler.
6. **Never trust userId from the request body** — always use `req.userId` (from verified JWT) for ownership checks.
7. **DynamoDB FilterExpression for scenario isolation** — every query against scenario-scoped tables must include the scenarioId filter with legacy fallback.
8. **PUT /api/cards/:userId/order must be registered BEFORE PUT /api/cards/:userId/:cardId** in routes/cards.js — Express route conflict prevention.
9. **Store.invalidate() after every mutation.** No auto-invalidation. Cache is indefinite.
10. **Stripe webhook uses raw body** — must be registered before `express.json()` middleware.
11. **Deploy from `dev` branch.** Never deploy from `main` directly. `eb deploy budget-peace-prod` after push to origin/dev.

---

## 20. Deploy Checklist

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

## 21. Environment Variables

The following environment variables are expected on the Elastic Beanstalk instance (set via EB console or `.env`):

```
PORT                      (optional; defaults to 3000)
AWS_REGION                us-west-2
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY (for admin operations in server-side auth verification)
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
```

---

## 22. Common Patterns & Gotchas

### Adding a new optional field to an expense/card/goal
1. Add to POST handler: `...(fieldValue && { fieldName: fieldValue })` in the item spread
2. Add to PUT handler: include in destructuring + set `fieldName: value || undefined` in item spread
3. Add to frontend form: new `<input>` or `<textarea>` in the sheet
4. Add to save payload: `...(value && { fieldName: value })`
5. Add to detail modal: show if set, hide otherwise
6. No migration needed (DynamoDB stores only what's provided; missing = undefined)

### Adding a new page
1. Create `public/js/pages/newpage.js`
2. Add `<script src="/js/pages/newpage.js"></script>` to index.html (before app.js)
3. Add nav button(s) to index.html (side nav, bottom nav, top nav as appropriate)
4. Register route: `Router.register('newpage', async () => { ... })`
5. Add `data-page="newpage"` to nav button(s)

### Adding a new DynamoDB table
1. Add table definition to `scripts/setup-dynamo.js`
2. Run `node scripts/setup-dynamo.js` once against the real AWS account
3. Add route file in `routes/`
4. Register route in `server.js`
5. Add Store key + endpoint in `shared.js`

### Inline accordion expand pattern (used in cards.js)
```javascript
function buildItemExpand(cardId) {
  return `<div class="wallet-item-expand" data-forcardid="${cardId}">...</div>`;
}
function wireItemExpand(cardId) {
  // attach event listeners after DOM injection
}
function toggleItemExpand(el) {
  const existing = el.nextElementSibling;
  if (existing?.classList.contains('wallet-item-expand')) {
    existing.remove(); el.classList.remove('is-expanded'); return;
  }
  document.querySelectorAll('.wallet-item-expand').forEach(e => e.remove());
  document.querySelectorAll('.is-expanded').forEach(e => e.classList.remove('is-expanded'));
  el.classList.add('is-expanded');
  el.insertAdjacentHTML('afterend', buildItemExpand(cardId));
  wireItemExpand(cardId);
}
```

### SortableJS reorder + save pattern
```javascript
// Enter reorder mode
new Sortable(container, { animation: 150, ghostClass: 'sortable-ghost', chosenClass: 'sortable-chosen' });

// On "Done" click — capture BEFORE re-render (container reference goes stale after renderPage())
const items = Array.from(container.querySelectorAll('[data-id]')).map((el, i) => ({
  id: el.dataset.id, sortOrder: (i + 1) * 1000
}));
items.forEach(({ id, sortOrder }) => {
  const obj = _data.find(d => d.id === id);
  if (obj) obj.sortOrder = sortOrder; // optimistic update in local array
});
// Re-render, THEN save to backend
renderPage();
await authFetch(`/api/endpoint/${userId()}/order`, { method: 'PUT', body: JSON.stringify({ items }) });
Store.invalidate('key');
_data = await Store.get('key'); // sync with server after save
```

---

*Document generated: 2026-04-12. If this document feels stale, check git log for recent commits and update accordingly.*
