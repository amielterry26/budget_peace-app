// ============================================================
// Budget Peace — Standalone Demo Experience (Real Renderers)
// Route: /demo
//
// Loads the REAL page scripts (home.js, expenses.js, pay-period.js)
// via demo-shim.js stubs, then injects fake data and calls real
// render functions to display actual app UI in the right pane.
//
// Left pane: concept/teaching content (built here)
// Right pane: real app renderer output (renderHealth, renderPeriod, etc.)
// ============================================================

// ---- Section 1: Utilities (concept pane only) -----------------

/** Format a number as US currency (plain text, no HTML spans). */
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


// ---- Section 2: Fake Data Factories ---------------------------

/** Generate 4 pay periods rooted around today. */
function buildDemoPeriods(state) {
  const today = new Date();
  const isBiweekly = state.cadence === 'biweekly';
  const periods = [];

  for (let i = 0; i < 4; i++) {
    let start, end;
    if (isBiweekly) {
      // Period 0 starts ~14 days before today, period 1 includes today, etc.
      start = new Date(today);
      start.setDate(start.getDate() - 14 + (i * 14));
      end = new Date(start);
      end.setDate(end.getDate() + 13);
    } else {
      start = new Date(today.getFullYear(), today.getMonth() - 1 + i, 1);
      end = new Date(today.getFullYear(), today.getMonth() + i, 0);
    }

    periods.push({
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
      income: state.income,
    });
  }

  return periods;
}

/** Build a fake scenario object matching the real schema. */
function buildDemoScenario(state) {
  return {
    scenarioId: 'demo',
    name: 'Main',
    cadence: state.cadence,
    income: state.income,
    firstPayDate: effectiveToday(),
    durationMonths: 2,
    isPrimary: true,
    notes: [],
  };
}

/** Build a fake expense object matching the real schema. */
function buildDemoExpense(state) {
  if (!state.userExpense) return null;

  // Pick a dueDay that falls within the first demo period
  const periods = buildDemoPeriods(state);
  const firstPeriod = periods[0];
  const startD = new Date(firstPeriod.startDate + 'T00:00:00');
  const dueDay = startD.getDate() + 5; // 5 days into first period

  return {
    expenseId: 'demo-exp-1',
    name: state.userExpense.name,
    amount: state.userExpense.amount,
    recurrence: 'recurring',
    recurrenceFrequency: 'monthly',
    recurrenceStartDate: '2025-01-01',
    dueDay: Math.min(dueDay, 28),
    dueDate: null,
    periodStart: null,
    cardId: null,
    scenarioId: 'demo',
    userId: 'demo-user',
  };
}


// ---- Section 3: App Pane Helpers ------------------------------

/** Show the app pane, highlight correct nav item, set page title. */
function showAppPane(page) {
  const shell = document.getElementById('demo-app');
  shell.classList.remove('is-hidden');
  document.getElementById('demo-stage').classList.remove('is-single');

  // Highlight correct bottom-nav item
  shell.querySelectorAll('.bottom-nav__item').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.page === page);
  });

  // Set page title
  const titles = { home: 'Home', expenses: 'Expenses', 'pay-period': 'Pay Period' };
  document.getElementById('page-title').textContent = titles[page] || '';

  // Show FAB for non-home pages
  const fab = document.getElementById('fab');
  fab.classList.remove('demo-fab-pulse');
  fab.classList.toggle('is-hidden', page === 'home');

  // Remove any leftover sheet previews
  shell.querySelectorAll('.demo-sheet-preview').forEach(el => el.remove());
}

/** Hide the app pane, switch to single-pane mode. */
function hideAppPane() {
  document.getElementById('demo-app').classList.add('is-hidden');
  document.getElementById('demo-stage').classList.add('is-single');
}


// ---- Section 4: Demo Framing Helpers --------------------------
// Each helper: injects fake data → calls real renderer → scrolls/highlights

/** Step 1: Real Home screen with Financial Structure highlighted. */
function renderDemoHomeSnapshot(state) {
  showAppPane('home');
  _healthData = {
    scenario: buildDemoScenario(state),
    periods: buildDemoPeriods(state),
    expenses: [],
  };
  renderHealth(6);

  // Post-render: scroll to Financial Structure section and highlight
  requestAnimationFrame(() => {
    const mainEl = document.getElementById('main-content');
    const section = mainEl.querySelector('.home-section-bills')
                 || mainEl.querySelector('.metric-grid')
                 || mainEl.querySelector('.card');
    if (section) {
      section.classList.add('demo-highlight');
      section.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  });
}

/** Step 2: Real Home screen + FAB pulse + expense-entry sheet preview. */
function renderDemoAddExpenseContext(state) {
  showAppPane('home');
  _healthData = {
    scenario: buildDemoScenario(state),
    periods: buildDemoPeriods(state),
    expenses: [],
  };
  renderHealth(6);

  // Show FAB with pulse animation
  const fab = document.getElementById('fab');
  fab.classList.remove('is-hidden');
  fab.classList.add('demo-fab-pulse');

  // Overlay a simplified expense-entry sheet preview
  requestAnimationFrame(() => {
    const shell = document.getElementById('demo-app');
    shell.insertAdjacentHTML('beforeend', `
      <div class="demo-sheet-preview">
        <div class="demo-sheet-preview__handle"></div>
        <div class="demo-sheet-preview__title">New Expense</div>
        <div class="demo-sheet-preview__field">Name</div>
        <div class="demo-sheet-preview__field">Amount</div>
        <div class="demo-sheet-preview__field">Frequency</div>
        <div class="demo-sheet-preview__btn"></div>
      </div>
    `);
  });
}

/** Step 3: Real Home screen with the user's expense, showing impact. */
function renderDemoImpact(state) {
  showAppPane('home');
  _healthData = {
    scenario: buildDemoScenario(state),
    periods: buildDemoPeriods(state),
    expenses: [buildDemoExpense(state)],
  };
  renderHealth(6);

  // Post-render: scroll to Financial Structure and highlight
  requestAnimationFrame(() => {
    const mainEl = document.getElementById('main-content');
    const section = mainEl.querySelector('.home-section-bills')
                 || mainEl.querySelector('.metric-grid')
                 || mainEl.querySelector('.card');
    if (section) {
      section.classList.add('demo-highlight');
      section.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  });
}

/** Step 4: Real Pay Period screen with expense mapped to correct period. */
function renderDemoPayPeriodContext(state) {
  showAppPane('pay-period');
  const periods = buildDemoPeriods(state);
  _pd = {
    periods: periods,
    expenses: [buildDemoExpense(state)],
  };
  // Force period index 0 (has the expense)
  renderPeriod(0);

  // Post-render: scroll so expense breakdown is visible, highlight bill cards
  requestAnimationFrame(() => {
    const mainEl = document.getElementById('main-content');
    const breakdown = mainEl.querySelector('.period-breakdown');
    const billCards = mainEl.querySelectorAll('.pd-bill-card');
    if (breakdown) {
      breakdown.style.display = 'block'; // ensure breakdown is visible
      breakdown.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    billCards.forEach(card => card.classList.add('demo-highlight'));
  });
}


// ---- Section 5: Demo Engine -----------------------------------

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
    { id: 'setup',        render: renderStep0_Setup,      single: true },
    { id: 'snapshot',     render: renderStep1_Snapshot,    single: false },
    { id: 'add-expense',  render: renderStep2_AddExpense,  single: false },
    { id: 'cause-effect', render: renderStep3_CauseEffect, single: false },
    { id: 'pay-period',   render: renderStep4_PayPeriod,   single: false },
    { id: 'meaning',      render: renderStep5_Meaning,     single: true },
  ];

  const TOTAL_STEPS = STEPS.length;

  function goTo(index) {
    if (index < 0 || index >= TOTAL_STEPS) return;
    currentStep = index;
    renderCurrentStep();
    updateProgress();
    updateHelpVisibility();
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
    const concept = document.getElementById('demo-concept');
    const step = STEPS[currentStep];

    // Fade out
    const existing = concept.querySelector('.demo-step');
    if (existing) existing.classList.remove('is-active');

    setTimeout(() => {
      // For single-pane steps, hide app pane
      if (step.single) hideAppPane();

      // Create concept wrapper
      const wrapper = document.createElement('div');
      wrapper.className = 'demo-step';

      // Render step (writes concept content + may call framing helper)
      step.render(wrapper);

      // Replace concept pane content
      concept.innerHTML = '';
      concept.appendChild(wrapper);

      // Fade in
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


// ---- Section 6: Step Renderers --------------------------------

// ============================================================
// Step 0 — Setup (single pane, centered)
// ============================================================
function renderStep0_Setup(container) {
  const state = DemoEngine.getState();

  container.innerHTML = `
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
// App pane: REAL Home renderer with Financial Structure highlighted
// ============================================================
function renderStep1_Snapshot(container) {
  const state = DemoEngine.getState();
  const income = state.income;

  container.innerHTML = `
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
  `;

  // Render REAL Home screen in app pane
  renderDemoHomeSnapshot(state);

  DemoEngine.unlockConcept('snapshot');
  container.querySelector('#demo-continue').addEventListener('click', () => DemoEngine.next());
}


// ============================================================
// Step 2 — Add an Expense (dual pane)
// Concept: name + amount form
// App pane: REAL Home screen with FAB highlighted + sheet preview
// ============================================================
function renderStep2_AddExpense(container) {
  const state = DemoEngine.getState();

  container.innerHTML = `
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
  `;

  // Render REAL Home screen + FAB + sheet preview in app pane
  renderDemoAddExpenseContext(state);

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
  setTimeout(() => container.querySelector('#demo-exp-amount')?.focus(), 400);
}


// ============================================================
// Step 3 — Cause and Effect (dual pane)
// Concept: updated metrics with delta
// App pane: REAL Home renderer with expense showing impact
// ============================================================
function renderStep3_CauseEffect(container) {
  const state = DemoEngine.getState();
  const income = state.income;
  const expense = state.userExpense;
  const bills = expense ? expense.amount : 0;
  const leftover = income - bills;
  const leftoverClass = leftover >= 0 ? 'demo-metric__value--accent' : 'demo-metric__value--danger';

  container.innerHTML = `
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
  `;

  // Render REAL Home screen with expense in app pane
  renderDemoImpact(state);

  container.querySelector('#demo-continue').addEventListener('click', () => DemoEngine.next());
}


// ============================================================
// Step 4 — Pay Periods (dual pane)
// Concept: paycheck-based budgeting
// App pane: REAL Pay Period renderer with expense mapped
// ============================================================
function renderStep4_PayPeriod(container) {
  const state = DemoEngine.getState();
  const expense = state.userExpense;
  const isBiweekly = state.cadence === 'biweekly';

  container.innerHTML = `
    <h1 class="demo-title">Your money flows in pay periods</h1>
    <p class="demo-subtitle">${isBiweekly ? 'Each two-week paycheck has its own budget.' : 'Each month has its own budget.'}</p>

    <div class="demo-teach">
      You get paid on a schedule, not all at once. Budget Peace helps you see
      which paycheck covers which expense.
      ${expense ? `<br><br>Notice how <strong>${esc(expense.name)}</strong> appears in the first period
      but not the second — each period only shows what's actually due.` : ''}
    </div>

    <button class="demo-btn demo-btn--primary" id="demo-continue" style="margin-top:var(--space-6);">
      Continue
    </button>
  `;

  // Render REAL Pay Period screen in app pane
  renderDemoPayPeriodContext(state);

  DemoEngine.unlockConcept('pay-periods');
  container.querySelector('#demo-continue').addEventListener('click', () => DemoEngine.next());
}


// ============================================================
// Step 5 — Meaning (single pane, centered)
// ============================================================
function renderStep5_Meaning(container) {
  container.innerHTML = `
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
  `;

  container.querySelector('#demo-replay').addEventListener('click', () => DemoEngine.reset());
  container.querySelector('#demo-review').addEventListener('click', () => HelpSystem.open());
}


// ---- Section 7: Help System -----------------------------------

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


// ---- Section 8: Boot ------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  // Set globals declared by shared.js
  _ownerId = 'demo-user';
  _demoMode = true;
  _serverToday = new Date().toISOString().split('T')[0];
  _activeScenario = 'demo';

  DemoEngine.init();
});
