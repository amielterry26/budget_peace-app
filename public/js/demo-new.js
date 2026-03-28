// ============================================================
// Budget Peace — Standalone Demo Experience (Dual-Pane)
// Route: /demo
// Self-contained: no Supabase, no auth, no shared.js, no router.
//
// Layout: concept pane (left/top) + app mock pane (right/bottom)
// Each step teaches ONE concept and shows where it lives in the app.
// ============================================================

// ---- Section 1: Utilities -----------------------------------

/** Escape HTML entities to prevent XSS in template literals. */
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/** Format a number as US currency. */
function formatMoney(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Format a date string as "Mon DD" (e.g., "Mar 14"). */
function formatShortDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}


// ---- Section 2: Demo Engine ---------------------------------

const DemoEngine = (() => {
  const state = {
    name: '',
    income: 0,
    cadence: 'biweekly',
    userExpense: null,    // { name, amount }
  };

  let currentStep = 0;
  const completedConcepts = [];

  const STEPS = [
    { id: 'setup',        render: renderStep0_Setup },
    { id: 'snapshot',     render: renderStep1_Snapshot },
    { id: 'add-expense',  render: renderStep2_AddExpense },
    { id: 'cause-effect', render: renderStep3_CauseEffect },
    { id: 'pay-period',   render: renderStep4_PayPeriod },
    { id: 'meaning',      render: renderStep5_Meaning },
  ];

  const TOTAL_STEPS = STEPS.length;

  function goTo(index) {
    if (index < 0 || index >= TOTAL_STEPS) return;
    currentStep = index;
    renderCurrentStep();
    updateProgress();
    updateHelpVisibility();
    // Scroll to top on step change
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function next() { goTo(currentStep + 1); }

  function reset() {
    state.name = '';
    state.income = 0;
    state.cadence = 'biweekly';
    state.userExpense = null;
    completedConcepts.length = 0;
    goTo(0);
  }

  function renderCurrentStep() {
    const stage = document.getElementById('demo-stage');
    const step = STEPS[currentStep];
    const existing = stage.querySelector('.demo-step');
    if (existing) existing.classList.remove('is-active');

    setTimeout(() => {
      const wrapper = document.createElement('div');
      wrapper.className = 'demo-step';
      step.render(wrapper);
      stage.innerHTML = '';
      stage.appendChild(wrapper);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => wrapper.classList.add('is-active'));
      });
    }, existing ? 200 : 0);
  }

  function updateProgress() {
    const container = document.getElementById('demo-progress');
    let html = '';
    for (let i = 0; i < TOTAL_STEPS; i++) {
      let cls = 'demo-progress__dot';
      if (i === currentStep) cls += ' is-active';
      else if (i < currentStep) cls += ' is-completed';
      html += `<div class="${cls}"></div>`;
    }
    container.innerHTML = html;
  }

  function updateHelpVisibility() {
    const btn = document.getElementById('demo-help-btn');
    btn.classList.toggle('is-visible', currentStep > 0);
  }

  function unlockConcept(id) {
    if (!completedConcepts.includes(id)) completedConcepts.push(id);
  }

  function getCompletedConcepts() { return [...completedConcepts]; }

  function init() {
    goTo(0);
    document.getElementById('demo-help-btn').addEventListener('click', HelpSystem.open);
  }

  function getState() { return state; }

  return { init, next, goTo, reset, getState, getCompletedConcepts, unlockConcept };
})();


// ---- Section 3: Mock UI Builders ----------------------------
// Reusable builders for the simplified app mock panels.

/** Build a mock top bar. */
function mockTopBar(title) {
  return `
    <div class="mock-topbar">
      <div class="mock-topbar__hamburger"><span></span><span></span><span></span></div>
      <div class="mock-topbar__title">${esc(title)}</div>
    </div>`;
}

/** Build a mock bottom nav with optional active index and FAB. */
function mockBottomNav(activeIndex, showFab) {
  let items = '';
  for (let i = 0; i < 5; i++) {
    items += `<div class="mock-bottomnav__item ${i === activeIndex ? 'is-active' : ''}"></div>`;
  }
  const fab = showFab ? '<div class="mock-fab mock-fab--pulse">+</div>' : '';
  return `<div class="mock-bottomnav">${fab}${items}</div>`;
}

/** Build a muted placeholder block. */
function mockPlaceholder(variant, style) {
  return `<div class="mock-placeholder mock-placeholder--${variant}" ${style ? 'style="' + style + '"' : ''}></div>`;
}

/** Build mock metric tiles (mini version for app mock). */
function mockMetricTiles(income, bills, leftover, highlightLeftover) {
  const leftoverColor = leftover >= 0 ? 'var(--color-accent)' : 'var(--color-danger)';
  const leftoverBorder = highlightLeftover ? 'border-color:var(--color-accent);' : '';
  return `
    <div class="mock-metrics">
      <div class="mock-metric-tile">
        <div class="mock-metric-tile__label">Income</div>
        <div class="mock-metric-tile__value" style="color:var(--color-accent);">${formatMoney(income)}</div>
      </div>
      <div class="mock-metric-tile">
        <div class="mock-metric-tile__label">Bills</div>
        <div class="mock-metric-tile__value">${formatMoney(bills)}</div>
      </div>
      <div class="mock-metric-tile" style="${leftoverBorder}">
        <div class="mock-metric-tile__label">Leftover</div>
        <div class="mock-metric-tile__value" style="color:${leftoverColor};">${formatMoney(leftover)}</div>
      </div>
    </div>`;
}


// ---- Section 4: Step Renderers ------------------------------

// ============================================================
// Step 0 — Setup (single pane, centered)
// ============================================================
function renderStep0_Setup(container) {
  const state = DemoEngine.getState();

  container.innerHTML = `
    <div class="demo-single">
      <div style="text-align:center;margin-bottom:var(--space-8);">
        <div class="demo-logo">Budget <span>Peace</span></div>
        <h1 class="demo-title" style="text-align:center;">Let's understand your budget</h1>
        <p class="demo-subtitle" style="text-align:center;">A quick guided walkthrough. No account needed.</p>
      </div>

      <div class="demo-form-group">
        <label class="demo-label" for="demo-name">Your name</label>
        <input class="demo-input" id="demo-name" type="text"
          placeholder="e.g. Alex" maxlength="30" autocomplete="given-name"
          value="${esc(state.name)}" />
      </div>

      <div class="demo-form-group">
        <label class="demo-label">How often do you get paid?</label>
        <div class="demo-toggle-grid">
          <div class="demo-toggle-card ${state.cadence === 'biweekly' ? 'is-selected' : ''}" data-cadence="biweekly">
            <div class="demo-toggle-card__title">Every 2 weeks</div>
            <div class="demo-toggle-card__sub">Bi-weekly paycheck</div>
          </div>
          <div class="demo-toggle-card ${state.cadence === 'monthly' ? 'is-selected' : ''}" data-cadence="monthly">
            <div class="demo-toggle-card__title">Monthly</div>
            <div class="demo-toggle-card__sub">Once a month</div>
          </div>
        </div>
      </div>

      <div class="demo-form-group">
        <label class="demo-label" for="demo-income">Net income per paycheck</label>
        <div class="demo-input-money">
          <input class="demo-input" id="demo-income" type="number"
            placeholder="0.00" min="0" step="0.01" inputmode="decimal"
            ${state.income ? 'value="' + state.income + '"' : ''} />
        </div>
      </div>

      <button class="demo-btn demo-btn--primary" id="demo-continue" style="margin-top:var(--space-4);">
        Continue
      </button>
    </div>
  `;

  // Wire cadence toggle
  let selectedCadence = state.cadence;
  container.querySelectorAll('.demo-toggle-card').forEach(card => {
    card.addEventListener('click', () => {
      container.querySelectorAll('.demo-toggle-card').forEach(c => c.classList.remove('is-selected'));
      card.classList.add('is-selected');
      selectedCadence = card.dataset.cadence;
    });
  });

  // Submit
  container.querySelector('#demo-continue').addEventListener('click', () => {
    const name = container.querySelector('#demo-name').value.trim();
    const income = parseFloat(container.querySelector('#demo-income').value);
    if (!name) { container.querySelector('#demo-name').focus(); return; }
    if (!income || income <= 0) { container.querySelector('#demo-income').focus(); return; }
    state.name = name;
    state.income = income;
    state.cadence = selectedCadence;
    DemoEngine.next();
  });

  container.querySelector('#demo-income').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); container.querySelector('#demo-continue').click(); }
  });
}


// ============================================================
// Step 1 — Financial Snapshot (dual pane)
// Concept: income / bills / leftover
// Mock: home screen with Financial Structure highlighted
// ============================================================
function renderStep1_Snapshot(container) {
  const state = DemoEngine.getState();
  const income = state.income;

  container.innerHTML = `
    <div class="demo-panes">
      <!-- Concept Pane -->
      <div class="demo-pane--concept">
        <h1 class="demo-title">Here's your snapshot, ${esc(state.name)}</h1>
        <p class="demo-subtitle">This is your financial picture at a glance.</p>

        <div class="demo-metrics">
          <div class="demo-metric">
            <div class="demo-metric__label">Income</div>
            <div class="demo-metric__value demo-metric__value--accent">${formatMoney(income)}</div>
          </div>
          <div class="demo-metric">
            <div class="demo-metric__label">Bills</div>
            <div class="demo-metric__value">${formatMoney(0)}</div>
          </div>
          <div class="demo-metric">
            <div class="demo-metric__label">Leftover</div>
            <div class="demo-metric__value demo-metric__value--accent">${formatMoney(income)}</div>
          </div>
        </div>

        <div class="demo-teach">
          This is your financial picture. Money in, money out, what remains.
        </div>

        <button class="demo-btn demo-btn--primary" id="demo-continue" style="margin-top:var(--space-6);">
          Continue
        </button>
      </div>

      <!-- App Mock Pane -->
      <div class="demo-pane--mock">
        <div class="mock-frame__label">Where this lives in the app</div>
        <div class="mock-frame">
          ${mockTopBar('Home')}
          <div class="mock-content">
            <!-- Muted: pay period card -->
            <div class="mock-section mock-section--muted">
              <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                ${mockPlaceholder('med')}
                ${mockPlaceholder('short')}
              </div>
              ${mockPlaceholder('block')}
            </div>

            <!-- Highlighted: Financial Structure -->
            <div class="mock-section mock-section--highlight">
              ${mockMetricTiles(income, 0, income, false)}
            </div>

            <!-- Muted: expense list -->
            <div class="mock-section mock-section--muted">
              ${mockPlaceholder('wide', 'margin-bottom:6px')}
              ${mockPlaceholder('block', 'margin-bottom:4px')}
              ${mockPlaceholder('block')}
            </div>
          </div>
          ${mockBottomNav(0, false)}
        </div>
      </div>
    </div>
  `;

  DemoEngine.unlockConcept('snapshot');
  container.querySelector('#demo-continue').addEventListener('click', () => DemoEngine.next());
}


// ============================================================
// Step 2 — Add an Expense (dual pane)
// Concept: name + amount fields
// Mock: app with FAB highlighted + expense entry sheet preview
// ============================================================
function renderStep2_AddExpense(container) {
  container.innerHTML = `
    <div class="demo-panes">
      <!-- Concept Pane -->
      <div class="demo-pane--concept">
        <h1 class="demo-title">Let's add your first expense</h1>
        <p class="demo-subtitle">Start with anything — this is just to see how it works.</p>

        <div class="demo-form-group">
          <label class="demo-label" for="demo-exp-name">Name</label>
          <input class="demo-input" id="demo-exp-name" type="text" value="Expense" maxlength="40" />
        </div>

        <div class="demo-form-group">
          <label class="demo-label" for="demo-exp-amount">Amount</label>
          <div class="demo-input-money">
            <input class="demo-input" id="demo-exp-amount" type="number"
              placeholder="0.00" min="0" step="0.01" inputmode="decimal" />
          </div>
        </div>

        <div class="demo-teach">
          Every bill you track gets accounted for automatically.
        </div>

        <button class="demo-btn demo-btn--primary" id="demo-add" style="margin-top:var(--space-6);">
          Add to budget
        </button>
      </div>

      <!-- App Mock Pane -->
      <div class="demo-pane--mock">
        <div class="mock-frame__label">How you add expenses in the app</div>
        <div class="mock-frame">
          ${mockTopBar('Expenses')}
          <div class="mock-content" style="min-height:140px;">
            <!-- Empty expense list -->
            <div class="mock-section mock-section--muted" style="text-align:center;padding:var(--space-6) var(--space-4);">
              <div style="font-size:var(--font-size-xs);color:var(--color-text-secondary);opacity:0.6;">No expenses yet</div>
            </div>
          </div>

          <!-- Sheet overlay with expense entry form preview -->
          <div class="mock-sheet-overlay">
            <div class="mock-sheet">
              <div class="mock-sheet__handle"></div>
              <div class="mock-sheet__title">Add Expense</div>
              <div class="mock-sheet__field"></div>
              <div class="mock-sheet__field"></div>
              <div class="mock-sheet__field" style="width:50%;"></div>
              <div class="mock-sheet__btn"></div>
            </div>
          </div>

          ${mockBottomNav(3, true)}
        </div>
        <div style="font-size:var(--font-size-xs);color:var(--color-text-secondary);margin-top:var(--space-2);text-align:center;">
          Tap <strong>+</strong> to open the expense form
        </div>
      </div>
    </div>
  `;

  DemoEngine.unlockConcept('adding-expenses');

  container.querySelector('#demo-add').addEventListener('click', () => {
    const name = container.querySelector('#demo-exp-name').value.trim() || 'Expense';
    const amount = parseFloat(container.querySelector('#demo-exp-amount').value);
    if (!amount || amount <= 0) { container.querySelector('#demo-exp-amount').focus(); return; }
    DemoEngine.getState().userExpense = { name, amount };
    DemoEngine.next();
  });

  container.querySelector('#demo-exp-amount').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); container.querySelector('#demo-add').click(); }
  });

  // Auto-focus amount since name is prefilled
  setTimeout(() => container.querySelector('#demo-exp-amount').focus(), 400);
}


// ============================================================
// Step 3 — Cause and Effect (dual pane)
// Concept: updated metrics with delta
// Mock: home screen with updated Financial Structure + expense pill
// ============================================================
function renderStep3_CauseEffect(container) {
  const state = DemoEngine.getState();
  const income = state.income;
  const expense = state.userExpense;
  const bills = expense ? expense.amount : 0;
  const leftover = income - bills;
  const leftoverClass = leftover >= 0 ? 'demo-metric__value--accent' : 'demo-metric__value--danger';

  container.innerHTML = `
    <div class="demo-panes">
      <!-- Concept Pane -->
      <div class="demo-pane--concept">
        <h1 class="demo-title">See the impact</h1>
        <p class="demo-subtitle">You added <strong>${esc(expense ? expense.name : 'an expense')}</strong> for <strong>${formatMoney(bills)}</strong>.</p>

        <div class="demo-metrics">
          <div class="demo-metric">
            <div class="demo-metric__label">Income</div>
            <div class="demo-metric__value demo-metric__value--accent">${formatMoney(income)}</div>
          </div>
          <div class="demo-metric">
            <div class="demo-metric__label">Bills</div>
            <div class="demo-metric__value">${formatMoney(bills)}</div>
          </div>
          <div class="demo-metric">
            <div class="demo-metric__label">Leftover</div>
            <div class="demo-metric__value ${leftoverClass}">${formatMoney(leftover)}</div>
            <div class="demo-metric__delta">&minus;${formatMoney(bills)}</div>
          </div>
        </div>

        <div class="demo-teach">
          Every dollar you commit changes your leftover. No guessing — Budget Peace shows this instantly.
        </div>

        <button class="demo-btn demo-btn--primary" id="demo-continue" style="margin-top:var(--space-6);">
          Continue
        </button>
      </div>

      <!-- App Mock Pane -->
      <div class="demo-pane--mock">
        <div class="mock-frame__label">Your dashboard updates instantly</div>
        <div class="mock-frame">
          ${mockTopBar('Home')}
          <div class="mock-content">
            <!-- Muted: pay period card -->
            <div class="mock-section mock-section--muted">
              <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                ${mockPlaceholder('med')}
                ${mockPlaceholder('short')}
              </div>
              ${mockPlaceholder('block')}
            </div>

            <!-- Highlighted: updated Financial Structure -->
            <div class="mock-section mock-section--highlight">
              ${mockMetricTiles(income, bills, leftover, true)}
            </div>

            <!-- User's expense pill -->
            <div class="mock-section" style="padding-top:0;">
              <div class="mock-expense-pill mock-expense-pill--highlight">
                <span style="font-weight:500;">${esc(expense ? expense.name : 'Expense')}</span>
                <span style="font-weight:600;">${formatMoney(bills)}</span>
              </div>
            </div>

            <!-- Muted: more content -->
            <div class="mock-section mock-section--muted">
              ${mockPlaceholder('block')}
            </div>
          </div>
          ${mockBottomNav(0, false)}
        </div>
      </div>
    </div>
  `;

  container.querySelector('#demo-continue').addEventListener('click', () => DemoEngine.next());
}


// ============================================================
// Step 4 — Pay Periods (dual pane)
// Concept: paycheck-based budgeting
// Mock: pay period screen with two contrasting periods
// ============================================================
function renderStep4_PayPeriod(container) {
  const state = DemoEngine.getState();
  const income = state.income;
  const expense = state.userExpense;
  const isBiweekly = state.cadence === 'biweekly';
  const periods = buildSimplePeriods(isBiweekly, income, expense);

  // Build concept-pane period cards (detailed, left side)
  let periodsHtml = '';
  periods.forEach(p => {
    const expenseRows = p.expenses.map(e => `
      <div class="demo-period__row demo-period__row--expense">
        <span class="${e.isUser ? 'demo-period__highlight' : ''}">${esc(e.name)}</span>
        <span class="${e.isUser ? 'demo-period__highlight' : ''}">${formatMoney(e.amount)}</span>
      </div>`).join('');

    const noExpenses = p.expenses.length === 0
      ? '<div class="demo-period__row demo-period__row--expense" style="font-style:italic;">No expenses this period</div>'
      : '';

    const leftoverColor = p.leftover >= 0 ? 'demo-metric__value--accent' : 'demo-metric__value--danger';

    periodsHtml += `
      <div class="demo-period">
        <div class="demo-period__header">
          <span class="demo-period__dates">${formatShortDate(p.start)} — ${formatShortDate(p.end)}</span>
          <span class="demo-period__income">${formatMoney(p.income)}</span>
        </div>
        ${expenseRows}${noExpenses}
        <div class="demo-period__row demo-period__row--leftover">
          <span>Leftover</span>
          <span class="${leftoverColor}">${formatMoney(p.leftover)}</span>
        </div>
      </div>`;
  });

  // Build mock-pane period cards (mini, right side)
  let mockPeriodsHtml = '';
  periods.forEach((p, i) => {
    const hasExpense = p.expenses.length > 0;
    const borderStyle = hasExpense ? 'border-color:var(--color-accent);' : '';
    const expRow = hasExpense
      ? `<div class="mock-period-card__row" style="color:var(--color-accent);">
           <span>${esc(p.expenses[0].name)}</span><span>${formatMoney(p.expenses[0].amount)}</span>
         </div>`
      : `<div class="mock-period-card__row" style="font-style:italic;opacity:0.5;">
           <span>No expenses</span><span>—</span>
         </div>`;
    const leftoverColor = hasExpense ? 'var(--color-accent)' : 'var(--color-text-secondary)';

    mockPeriodsHtml += `
      <div class="mock-period-card" style="${borderStyle}">
        <div class="mock-period-card__header">
          <span>${formatShortDate(p.start)} — ${formatShortDate(p.end)}</span>
          <span style="color:var(--color-accent);">${formatMoney(p.income)}</span>
        </div>
        ${expRow}
        <div class="mock-period-card__row" style="font-weight:600;border-top:1px solid var(--color-border);padding-top:4px;margin-top:4px;">
          <span>Leftover</span>
          <span style="color:${leftoverColor};">${formatMoney(p.leftover)}</span>
        </div>
      </div>`;
  });

  container.innerHTML = `
    <div class="demo-panes">
      <!-- Concept Pane -->
      <div class="demo-pane--concept">
        <h1 class="demo-title">Your money flows in pay periods</h1>
        <p class="demo-subtitle">${isBiweekly ? 'Each two-week paycheck has its own budget.' : 'Each month has its own budget.'}</p>

        <div class="demo-periods">${periodsHtml}</div>

        <div class="demo-teach">
          You get paid on a schedule, not all at once. Budget Peace helps you see which paycheck covers which expense.
        </div>

        <button class="demo-btn demo-btn--primary" id="demo-continue" style="margin-top:var(--space-6);">
          Continue
        </button>
      </div>

      <!-- App Mock Pane -->
      <div class="demo-pane--mock">
        <div class="mock-frame__label">The pay period view in the app</div>
        <div class="mock-frame">
          ${mockTopBar('Pay Period')}
          <div class="mock-content">
            <div style="padding:var(--space-2) var(--space-3);">
              ${mockPeriodsHtml}
            </div>
          </div>
          ${mockBottomNav(1, false)}
        </div>
      </div>
    </div>
  `;

  DemoEngine.unlockConcept('pay-periods');
  container.querySelector('#demo-continue').addEventListener('click', () => DemoEngine.next());
}

/**
 * Build 2 simplified pay periods for the demo.
 * Places the user's expense in the first period only.
 * Second period has no expenses — creates clear contrast.
 */
function buildSimplePeriods(isBiweekly, income, expense) {
  const today = new Date();
  const periods = [];

  for (let i = 0; i < 2; i++) {
    let start, end;
    if (isBiweekly) {
      start = new Date(today);
      start.setDate(start.getDate() - 14 + (i * 14));
      end = new Date(start);
      end.setDate(end.getDate() + 13);
    } else {
      start = new Date(today.getFullYear(), today.getMonth() - 1 + i, 1);
      end = new Date(today.getFullYear(), today.getMonth() + i, 0);
    }

    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];
    const expenses = [];
    if (i === 0 && expense) {
      expenses.push({ name: expense.name, amount: expense.amount, isUser: true });
    }
    const totalExp = expenses.reduce((sum, e) => sum + e.amount, 0);

    periods.push({
      start: startStr,
      end: endStr,
      income: income,
      expenses: expenses,
      leftover: income - totalExp,
    });
  }

  return periods;
}


// ============================================================
// Step 5 — Meaning (single pane, centered)
// ============================================================
function renderStep5_Meaning(container) {
  container.innerHTML = `
    <div class="demo-single">
      <div class="demo-meaning">
        <div class="demo-meaning__title">That's Budget Peace.</div>
        <div class="demo-meaning__body">
          No spreadsheets. No guilt. Just clarity about where your money goes
          and what's left. Every paycheck, you'll know exactly where you stand.
        </div>

        <div class="demo-meaning__ctas">
          <a href="/landing#pricing" class="demo-btn demo-btn--primary" style="text-decoration:none;">
            See pricing
          </a>
          <button class="demo-btn demo-btn--ghost" id="demo-replay">
            Replay the demo
          </button>
          <button class="demo-btn demo-btn--link" id="demo-review">
            Review concepts
          </button>
        </div>
      </div>
    </div>
  `;

  container.querySelector('#demo-replay').addEventListener('click', () => DemoEngine.reset());
  container.querySelector('#demo-review').addEventListener('click', () => HelpSystem.open());
}


// ---- Section 5: Help System ---------------------------------

const HelpSystem = (() => {
  const CONCEPTS = {
    'snapshot': {
      title: 'Financial Snapshot',
      summary: 'Your snapshot shows income minus expenses. The leftover is what you can save, spend freely, or put toward goals.',
      detail: 'Budget Peace gives you one clear picture: money in, money out, what remains. Every time you add or change an expense, your snapshot updates instantly.',
    },
    'adding-expenses': {
      title: 'Adding Expenses',
      summary: 'Every recurring cost gets tracked. Budget Peace calculates the impact on your leftover automatically.',
      detail: 'When you add an expense, Budget Peace immediately recalculates your financial picture. You always know exactly how much room you have left.',
    },
    'pay-periods': {
      title: 'Pay Periods',
      summary: 'Each paycheck has its own budget. You always know if a specific check covers its bills.',
      detail: 'Instead of thinking in months, Budget Peace maps your expenses to the paycheck that covers them. This means you always know whether a given paycheck can handle its bills — no more end-of-month surprises.',
    },
  };

  function open() {
    const overlay = document.getElementById('demo-help-overlay');
    const panel = document.getElementById('demo-help-panel');
    renderCards(panel, DemoEngine.getCompletedConcepts());
    overlay.classList.add('is-open');
    panel.classList.add('is-open');
    overlay.onclick = close;
  }

  function close() {
    document.getElementById('demo-help-overlay').classList.remove('is-open');
    document.getElementById('demo-help-panel').classList.remove('is-open');
  }

  function renderCards(panel, unlocked) {
    let cardsHtml = '';
    if (unlocked.length === 0) {
      cardsHtml = '<p style="color:var(--color-text-secondary);font-size:var(--font-size-sm);text-align:center;">Complete more steps to unlock concepts.</p>';
    } else {
      unlocked.forEach(id => {
        const c = CONCEPTS[id];
        if (!c) return;
        cardsHtml += `
          <div class="demo-help-card" data-concept="${id}">
            <div class="demo-help-card__title">${esc(c.title)}</div>
            <div class="demo-help-card__summary">${esc(c.summary)}</div>
          </div>`;
      });
    }

    panel.innerHTML = `
      <div class="demo-help-panel__header">
        <div class="demo-help-panel__title">Concepts</div>
        <button class="demo-help-panel__close" id="help-close">&times;</button>
      </div>
      ${cardsHtml}
    `;

    panel.querySelector('#help-close').addEventListener('click', close);
    panel.querySelectorAll('.demo-help-card').forEach(card => {
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => renderDetail(panel, card.dataset.concept));
    });
  }

  function renderDetail(panel, id) {
    const c = CONCEPTS[id];
    if (!c) return;
    panel.innerHTML = `
      <div class="demo-help-panel__header">
        <div class="demo-help-panel__title">${esc(c.title)}</div>
        <button class="demo-help-panel__close" id="help-close">&times;</button>
      </div>
      <div style="font-size:var(--font-size-md);line-height:1.7;color:var(--color-text-primary);margin-bottom:var(--space-5);">
        ${esc(c.detail)}
      </div>
      <button class="demo-btn demo-btn--ghost" id="help-back" style="font-size:var(--font-size-sm);">
        &larr; All concepts
      </button>
    `;
    panel.querySelector('#help-close').addEventListener('click', close);
    panel.querySelector('#help-back').addEventListener('click', () => {
      renderCards(panel, DemoEngine.getCompletedConcepts());
    });
  }

  return { open, close };
})();


// ---- Section 6: Boot ----------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  DemoEngine.init();
});
