// ============================================================
// Budget Peace — Cinematic Demo Walkthrough (Real Renderers)
// Route: /demo
//
// 9 steps (0–8) + sandbox mode. Uses REAL page renderers
// (home.js, expenses.js, pay-period.js, cards.js, scenarios.js)
// via demo-shim.js stubs and injected fake data.
//
// Left pane: concept/teaching content
// Right pane: real app renderer output
// ============================================================

// ---- Section 1: Utilities (concept pane only) -----------------

function formatMoney(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatShortDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}


// ---- Section 2: Fake Data Factories ---------------------------

function buildDemoPeriods(state) {
  const today = new Date();
  const isBiweekly = state.cadence === 'biweekly';
  const periods = [];

  for (let i = 0; i < 4; i++) {
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
    periods.push({
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
      income: state.income,
    });
  }
  return periods;
}

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

function buildDemoExpense(state) {
  if (!state.userExpense) return null;
  const periods = buildDemoPeriods(state);
  const startD = new Date(periods[0].startDate + 'T00:00:00');
  const dueDay = startD.getDate() + 5;
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
    cardId: 'demo-card-1',
    scenarioId: 'demo',
    userId: 'demo-user',
  };
}

function buildDemoCards(state) {
  return [
    {
      cardId: 'demo-card-1',
      name: 'Chase Checking',
      lastFour: '4821',
      type: 'Debit',
      colorIndex: 0,
      userId: 'demo-user',
    },
    {
      cardId: 'demo-card-2',
      name: 'Amex Platinum',
      lastFour: '9012',
      type: 'Credit',
      colorIndex: 3,
      userId: 'demo-user',
    },
  ];
}

function buildDemoScenarios(state) {
  const main = buildDemoScenario(state);
  const alt = {
    scenarioId: 'demo-alt',
    name: 'Side Hustle',
    cadence: state.cadence,
    income: Math.round(state.income * 1.3),
    firstPayDate: effectiveToday(),
    durationMonths: 2,
    isPrimary: false,
    notes: [],
  };
  return [main, alt];
}


// ---- Section 3: App Pane Helpers ------------------------------

function showAppPane(page) {
  const shell = document.getElementById('demo-app');
  shell.classList.remove('is-hidden');
  document.getElementById('demo-stage').classList.remove('is-single');

  shell.querySelectorAll('.bottom-nav__item').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.page === page);
  });

  const titles = {
    home: 'Home', expenses: 'Expenses', 'pay-period': 'Pay Period',
    cards: 'Cards', scenarios: 'Scenarios',
  };
  document.getElementById('page-title').textContent = titles[page] || '';

  const fab = document.getElementById('fab');
  fab.classList.remove('demo-fab-pulse');
  fab.classList.toggle('is-hidden', page === 'home');

  // Remove leftover overlays
  shell.querySelectorAll('.demo-sheet-preview').forEach(el => el.remove());

  // Remove leftover highlights
  shell.querySelectorAll('.demo-highlight, .demo-highlight-strong, .demo-nav-highlight').forEach(el => {
    el.classList.remove('demo-highlight', 'demo-highlight-strong', 'demo-nav-highlight');
  });
}

function hideAppPane() {
  document.getElementById('demo-app').classList.add('is-hidden');
  document.getElementById('demo-stage').classList.add('is-single');
}

/** Clear all demo highlight classes from app pane */
function clearHighlights() {
  const shell = document.getElementById('demo-app');
  shell.querySelectorAll('.demo-highlight, .demo-highlight-strong, .demo-nav-highlight').forEach(el => {
    el.classList.remove('demo-highlight', 'demo-highlight-strong', 'demo-nav-highlight');
  });
}

/** Highlight a bottom-nav item by data-page */
function highlightNavItem(page) {
  const shell = document.getElementById('demo-app');
  shell.querySelectorAll('.bottom-nav__item').forEach(btn => {
    btn.classList.toggle('demo-nav-highlight', btn.dataset.page === page);
  });
}


// ---- Section 4: Demo Framing Helpers --------------------------
// Each helper: injects fake data -> calls real renderer -> scrolls/highlights

// Step 1 & 5A: Home screen with structure highlighted
function renderDemoHomeSnapshot(state, highlightSection) {
  showAppPane('home');
  _healthData = {
    scenario: buildDemoScenario(state),
    periods: buildDemoPeriods(state),
    expenses: [],
  };
  renderHealth(6);

  if (highlightSection) {
    requestAnimationFrame(() => {
      const mainEl = document.getElementById('main-content');
      const section = mainEl.querySelector(highlightSection);
      if (section) {
        section.classList.add('demo-highlight');
        section.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    });
  }
}

// Step 2: Home + FAB pulse + sheet preview
function renderDemoAddExpenseContext(state) {
  showAppPane('home');
  _healthData = {
    scenario: buildDemoScenario(state),
    periods: buildDemoPeriods(state),
    expenses: [],
  };
  renderHealth(6);

  const fab = document.getElementById('fab');
  fab.classList.remove('is-hidden');
  fab.classList.add('demo-fab-pulse');

  requestAnimationFrame(() => {
    document.getElementById('demo-app').insertAdjacentHTML('beforeend', `
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

// Step 3 multi-stage: Home with expense, sequential highlight stages
function renderDemoImpactMultiStage(state) {
  showAppPane('home');
  _healthData = {
    scenario: buildDemoScenario(state),
    periods: buildDemoPeriods(state),
    expenses: [buildDemoExpense(state)],
  };
  renderHealth(6);

  const mainEl = document.getElementById('main-content');

  // Stage 1: highlight bills section (immediate)
  requestAnimationFrame(() => {
    const bills = mainEl.querySelector('.home-section-bills') || mainEl.querySelector('.card');
    if (bills) {
      bills.classList.add('demo-highlight');
      bills.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  });

  // Stage 2: scroll to structure metrics (after delay)
  setTimeout(() => {
    clearHighlights();
    const structure = mainEl.querySelector('.home-section-structure')
                   || mainEl.querySelector('.metric-grid');
    if (structure) {
      structure.classList.add('demo-highlight-strong');
      structure.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, 2000);

  // Stage 3: scroll to period shortcut cards
  setTimeout(() => {
    clearHighlights();
    const periods = mainEl.querySelector('.home-section-period')
                 || mainEl.querySelector('.period-shortcut-card');
    if (periods) {
      periods.classList.add('demo-highlight');
      periods.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, 4000);
}

// Step 4: Home with financial health section highlighted
function renderDemoFinancialHealth(state) {
  showAppPane('home');
  _healthData = {
    scenario: buildDemoScenario(state),
    periods: buildDemoPeriods(state),
    expenses: [buildDemoExpense(state)],
  };
  renderHealth(6);

  requestAnimationFrame(() => {
    const mainEl = document.getElementById('main-content');
    const health = mainEl.querySelector('.home-section-health')
                || mainEl.querySelector('.proj-grid');
    if (health) {
      health.classList.add('demo-highlight');
      health.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  });
}

// Step 5B: Expenses list
function renderDemoExpenses(state) {
  showAppPane('expenses');
  const expense = buildDemoExpense(state);
  _expenses = expense ? [expense] : [];
  _periods = buildDemoPeriods(state);
  _expScenario = buildDemoScenario(state);
  _expFilter = 'active';
  renderExpensesList();

  requestAnimationFrame(() => {
    const mainEl = document.getElementById('main-content');
    const pill = mainEl.querySelector('.expense-pill');
    if (pill) {
      pill.classList.add('demo-highlight');
    }
  });
}

// Step 5C: Pay Period
function renderDemoPayPeriod(state) {
  showAppPane('pay-period');
  _pd = {
    periods: buildDemoPeriods(state),
    expenses: [buildDemoExpense(state)],
  };
  renderPeriod(0);

  requestAnimationFrame(() => {
    const mainEl = document.getElementById('main-content');
    mainEl.querySelectorAll('.pd-bill-card').forEach(card => {
      card.classList.add('demo-highlight');
    });
  });
}

// Step 5D: Cards
function renderDemoCards(state) {
  showAppPane('cards');
  const cards = buildDemoCards(state);
  _cards = cards;
  _cardExpenses = buildDemoExpense(state) ? [buildDemoExpense(state)] : [];
  _selectedCard = cards[0].cardId;
  renderCardsPage();

  requestAnimationFrame(() => {
    const mainEl = document.getElementById('main-content');
    const walletRow = mainEl.querySelector('.wallet-row');
    if (walletRow) {
      walletRow.classList.add('demo-highlight');
    }
  });
}

// Step 6: Scenarios
function renderDemoScenarios(state) {
  showAppPane('scenarios');
  const scenarios = buildDemoScenarios(state);
  renderScenarios(scenarios);

  requestAnimationFrame(() => {
    const mainEl = document.getElementById('main-content');
    const cards = mainEl.querySelectorAll('.sc-card');
    if (cards.length > 1) {
      cards[1].classList.add('demo-highlight');
    }
  });
}


// ---- Section 5: Demo Engine -----------------------------------

const DemoEngine = (() => {
  const state = {
    name: '',
    income: 0,
    cadence: 'biweekly',
    userExpense: null,
  };

  let currentStep = 0;
  let currentSubStep = null; // for nav tour sub-steps
  const completedConcepts = [];

  const STEPS = [
    { id: 'setup',            render: renderStep0_Setup,           single: true  },
    { id: 'snapshot',         render: renderStep1_Snapshot,        single: false },
    { id: 'add-expense',      render: renderStep2_AddExpense,      single: false },
    { id: 'see-impact',       render: renderStep3_SeeImpact,       single: false },
    { id: 'financial-health', render: renderStep4_FinancialHealth, single: false },
    { id: 'nav-tour',         render: renderStep5_NavTour,         single: false },
    { id: 'scenarios',        render: renderStep6_Scenarios,       single: false },
    { id: 'understanding',    render: renderStep7_Understanding,   single: true  },
    { id: 'final',            render: renderStep8_Final,           single: true  },
  ];

  const TOTAL_STEPS = STEPS.length;

  function goTo(index) {
    if (index < 0 || index >= TOTAL_STEPS) return;
    currentStep = index;
    currentSubStep = null;
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
    exitSandbox();
    goTo(0);
  }

  function renderCurrentStep() {
    const concept = document.getElementById('demo-concept');
    const step = STEPS[currentStep];

    const existing = concept.querySelector('.demo-step');
    if (existing) existing.classList.remove('is-active');

    setTimeout(() => {
      if (step.single) hideAppPane();

      const wrapper = document.createElement('div');
      wrapper.className = 'demo-step';
      step.render(wrapper);

      concept.innerHTML = '';
      concept.appendChild(wrapper);

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
    document.getElementById('demo-help-btn').classList.toggle('is-visible', currentStep > 0);
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
  function getCurrentStep() { return currentStep; }
  function getSubStep() { return currentSubStep; }
  function setSubStep(s) { currentSubStep = s; }

  // Sandbox mode
  let sandboxActive = false;

  function enterSandbox() {
    sandboxActive = true;
    const shell = document.getElementById('demo-app');
    shell.classList.add('is-sandbox');

    // Add banner
    if (!shell.querySelector('.demo-sandbox-banner')) {
      shell.insertAdjacentHTML('afterbegin',
        '<div class="demo-sandbox-banner">Preview Mode — data won\'t be saved</div>');
    }

    // Wire bottom-nav clicks for page switching
    shell.querySelectorAll('.bottom-nav__item').forEach(btn => {
      btn.addEventListener('click', handleSandboxNav);
    });

    // Wire FAB for sheet preview
    const fab = document.getElementById('fab');
    fab.addEventListener('click', handleSandboxFab);
  }

  function exitSandbox() {
    sandboxActive = false;
    const shell = document.getElementById('demo-app');
    shell.classList.remove('is-sandbox');
    const banner = shell.querySelector('.demo-sandbox-banner');
    if (banner) banner.remove();

    shell.querySelectorAll('.bottom-nav__item').forEach(btn => {
      btn.removeEventListener('click', handleSandboxNav);
    });
    document.getElementById('fab').removeEventListener('click', handleSandboxFab);
  }

  function handleSandboxNav(e) {
    const page = e.currentTarget.dataset.page;
    if (!page) return;
    const s = DemoEngine.getState();
    switch (page) {
      case 'home':
        renderDemoHomeSnapshot(s, null);
        break;
      case 'expenses':
        renderDemoExpenses(s);
        break;
      case 'pay-period':
        renderDemoPayPeriod(s);
        break;
      case 'cards':
        renderDemoCards(s);
        break;
    }
  }

  function handleSandboxFab(e) {
    e.stopPropagation();
    const shell = document.getElementById('demo-app');
    // Remove existing sheet preview if present
    shell.querySelectorAll('.demo-sheet-preview').forEach(el => el.remove());
    // Show sheet preview
    shell.insertAdjacentHTML('beforeend', `
      <div class="demo-sheet-preview" style="cursor:default;">
        <div class="demo-sheet-preview__handle" style="cursor:pointer;" onclick="this.closest('.demo-sheet-preview').remove()"></div>
        <div class="demo-sheet-preview__title">New Expense</div>
        <div class="demo-sheet-preview__field">Name</div>
        <div class="demo-sheet-preview__field">Amount</div>
        <div class="demo-sheet-preview__field">Frequency</div>
        <div class="demo-sheet-preview__btn"></div>
      </div>
    `);
  }

  function isSandbox() { return sandboxActive; }

  return {
    init, next, goTo, reset, getState, getCompletedConcepts, unlockConcept,
    getCurrentStep, getSubStep, setSubStep,
    enterSandbox, exitSandbox, isSandbox,
  };
})();


// ---- Section 6: Step Renderers --------------------------------

// ============================================================
// Step 0 — Setup (single pane)
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

  let selectedCadence = state.cadence;
  container.querySelectorAll('.demo-toggle-card').forEach(card => {
    card.addEventListener('click', () => {
      container.querySelectorAll('.demo-toggle-card').forEach(c => c.classList.remove('is-selected'));
      card.classList.add('is-selected');
      selectedCadence = card.dataset.cadence;
    });
  });

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

  renderDemoHomeSnapshot(state, '.home-section-structure, .metric-grid');

  DemoEngine.unlockConcept('snapshot');
  container.querySelector('#demo-continue').addEventListener('click', () => DemoEngine.next());
}


// ============================================================
// Step 2 — Add Expense (dual pane)
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

  setTimeout(() => container.querySelector('#demo-exp-amount')?.focus(), 400);
}


// ============================================================
// Step 3 — See Impact (dual pane, multi-stage highlights)
// ============================================================
function renderStep3_SeeImpact(container) {
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
      Watch the app pane — Budget Peace highlights each section that changed.
      Bills, structure, and period cards all update in real time.
    </div>

    <button class="demo-btn demo-btn--primary" id="demo-continue" style="margin-top:var(--space-6);">
      Continue
    </button>
  `;

  renderDemoImpactMultiStage(state);

  container.querySelector('#demo-continue').addEventListener('click', () => DemoEngine.next());
}


// ============================================================
// Step 4 — Financial Health (dual pane)
// ============================================================
function renderStep4_FinancialHealth(container) {
  const state = DemoEngine.getState();
  const expense = state.userExpense;

  container.innerHTML = `
    <h1 class="demo-title">Financial health at a glance</h1>
    <p class="demo-subtitle">Budget Peace projects your finances forward so you can see around corners.</p>

    <div class="demo-teach">
      The health section shows projections — how your balance trends over the coming months.
      ${expense ? `With <strong>${esc(expense.name)}</strong> factored in, you can see exactly how it affects your trajectory.` : ''}
    </div>

    <button class="demo-btn demo-btn--primary" id="demo-continue" style="margin-top:var(--space-6);">
      Continue
    </button>
  `;

  renderDemoFinancialHealth(state);

  DemoEngine.unlockConcept('financial-health');
  container.querySelector('#demo-continue').addEventListener('click', () => DemoEngine.next());
}


// ============================================================
// Step 5 — Navigation Tour (dual pane, sub-steps 5A–5D)
// ============================================================
function renderStep5_NavTour(container) {
  const sub = DemoEngine.getSubStep() || 'home';
  DemoEngine.setSubStep(sub);

  const state = DemoEngine.getState();
  const subSteps = ['home', 'expenses', 'pay-period', 'cards'];
  const subIndex = subSteps.indexOf(sub);

  const descriptions = {
    home: {
      title: 'Home — your command center',
      body: 'Everything starts here. Income, bills, leftover, health projections, and period shortcuts — all on one screen.',
    },
    expenses: {
      title: 'Expenses — every bill tracked',
      body: 'See all your recurring and one-time expenses. Filter, sort, and track what\'s active. Each one feeds into your budget automatically.',
    },
    'pay-period': {
      title: 'Pay Period — paycheck-level clarity',
      body: 'Each paycheck has its own budget. You can see exactly which bills come out of which check — no more guessing at the end of the month.',
    },
    cards: {
      title: 'Cards — your wallet, organized',
      body: 'Link expenses to specific cards. See at a glance what each card is carrying and how your spending is distributed.',
    },
  };

  const desc = descriptions[sub];
  const isLast = subIndex === subSteps.length - 1;

  // Progress dots for sub-steps
  const subDots = subSteps.map((s, i) =>
    `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${i === subIndex ? 'var(--color-accent)' : 'var(--color-border)'};margin:0 3px;"></span>`
  ).join('');

  container.innerHTML = `
    <div style="margin-bottom:var(--space-3);font-size:var(--font-size-xs);color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">
      Navigation Tour ${subDots}
    </div>
    <h1 class="demo-title">${esc(desc.title)}</h1>
    <p class="demo-subtitle">${desc.body}</p>

    <div class="demo-teach">
      Look at the bottom navigation bar — the highlighted tab shows where you are.
    </div>

    <div style="display:flex;gap:var(--space-3);margin-top:var(--space-6);">
      ${subIndex > 0 ? '<button class="demo-btn demo-btn--ghost" id="demo-sub-prev" style="flex:1;">Back</button>' : ''}
      <button class="demo-btn demo-btn--primary" id="demo-sub-next" style="flex:1;">
        ${isLast ? 'Continue' : 'Next page'}
      </button>
    </div>
  `;

  // Render the appropriate page in app pane
  switch (sub) {
    case 'home':
      renderDemoHomeSnapshot(state, null);
      highlightNavItem('home');
      break;
    case 'expenses':
      renderDemoExpenses(state);
      highlightNavItem('expenses');
      break;
    case 'pay-period':
      renderDemoPayPeriod(state);
      highlightNavItem('pay-period');
      break;
    case 'cards':
      renderDemoCards(state);
      highlightNavItem('cards');
      break;
  }

  DemoEngine.unlockConcept('pay-periods');
  DemoEngine.unlockConcept('cards');

  // Wire sub-step navigation
  function goToSubStep(newSub) {
    DemoEngine.setSubStep(newSub);
    const concept = document.getElementById('demo-concept');
    const wrapper = document.createElement('div');
    wrapper.className = 'demo-step is-active';
    renderStep5_NavTour(wrapper);
    concept.innerHTML = '';
    concept.appendChild(wrapper);
  }

  container.querySelector('#demo-sub-next')?.addEventListener('click', () => {
    if (isLast) {
      DemoEngine.next();
    } else {
      goToSubStep(subSteps[subIndex + 1]);
    }
  });

  container.querySelector('#demo-sub-prev')?.addEventListener('click', () => {
    goToSubStep(subSteps[subIndex - 1]);
  });
}


// ============================================================
// Step 6 — Scenarios (dual pane, focused)
// ============================================================
function renderStep6_Scenarios(container) {
  const state = DemoEngine.getState();
  const altIncome = Math.round(state.income * 1.3);

  container.innerHTML = `
    <h1 class="demo-title">What if your income changed?</h1>
    <p class="demo-subtitle">Scenarios let you model different financial realities without affecting your main budget.</p>

    <div class="demo-teach">
      Here you see two scenarios: your <strong>Main</strong> setup, and a <strong>"Side Hustle"</strong>
      scenario with ${formatMoney(altIncome)} income. You can create as many as you need — then compare them side by side.
    </div>

    <button class="demo-btn demo-btn--primary" id="demo-continue" style="margin-top:var(--space-6);">
      Continue
    </button>
  `;

  renderDemoScenarios(state);

  DemoEngine.unlockConcept('scenarios');
  container.querySelector('#demo-continue').addEventListener('click', () => DemoEngine.next());
}


// ============================================================
// Step 7 — System Understanding (single pane)
// ============================================================
function renderStep7_Understanding(container) {
  const state = DemoEngine.getState();

  container.innerHTML = `
    <div style="text-align:center;padding-top:var(--space-6);">
      <h1 class="demo-title">The whole system, connected</h1>
      <p class="demo-subtitle" style="max-width:440px;margin:0 auto var(--space-6);">
        Here's how it all fits together, ${esc(state.name)}.
      </p>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);margin-bottom:var(--space-6);">
      <div class="demo-metric" style="text-align:left;">
        <div class="demo-metric__label">Income</div>
        <div style="font-size:var(--font-size-sm);color:var(--color-text-secondary);line-height:1.5;margin-top:4px;">
          Your paycheck anchors everything.
        </div>
      </div>
      <div class="demo-metric" style="text-align:left;">
        <div class="demo-metric__label">Expenses</div>
        <div style="font-size:var(--font-size-sm);color:var(--color-text-secondary);line-height:1.5;margin-top:4px;">
          Every bill gets tracked and mapped.
        </div>
      </div>
      <div class="demo-metric" style="text-align:left;">
        <div class="demo-metric__label">Pay Periods</div>
        <div style="font-size:var(--font-size-sm);color:var(--color-text-secondary);line-height:1.5;margin-top:4px;">
          Each paycheck covers its own bills.
        </div>
      </div>
      <div class="demo-metric" style="text-align:left;">
        <div class="demo-metric__label">Scenarios</div>
        <div style="font-size:var(--font-size-sm);color:var(--color-text-secondary);line-height:1.5;margin-top:4px;">
          Model any "what if" without risk.
        </div>
      </div>
    </div>

    <div class="demo-teach" style="text-align:center;">
      No spreadsheets. No guesswork. Every piece connects — change one thing, see the ripple everywhere.
    </div>

    <button class="demo-btn demo-btn--primary" id="demo-continue" style="margin-top:var(--space-6);">
      Continue
    </button>
  `;

  container.querySelector('#demo-continue').addEventListener('click', () => DemoEngine.next());
}


// ============================================================
// Step 8 — Final CTA + Sandbox (single pane -> sandbox)
// ============================================================
function renderStep8_Final(container) {
  const state = DemoEngine.getState();

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
        <button class="demo-btn demo-btn--ghost" id="demo-explore">
          Explore the app
        </button>
        <button class="demo-btn demo-btn--link" id="demo-replay">
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

  container.querySelector('#demo-explore').addEventListener('click', () => {
    // Switch to dual-pane and enter sandbox
    showAppPane('home');
    renderDemoHomeSnapshot(state, null);
    DemoEngine.enterSandbox();

    // Update concept pane to sandbox message
    const concept = document.getElementById('demo-concept');
    concept.innerHTML = `
      <div class="demo-step is-active">
        <h1 class="demo-title">Explore freely</h1>
        <p class="demo-subtitle">
          Tap the bottom navigation to switch pages. Tap + to see the expense form.
          Nothing is saved — this is your sandbox.
        </p>

        <div style="margin-top:var(--space-6);display:flex;flex-direction:column;gap:var(--space-3);">
          <a href="/landing#pricing" class="demo-btn demo-btn--primary" style="text-decoration:none;">
            See pricing
          </a>
          <button class="demo-btn demo-btn--ghost" id="sandbox-exit">
            Back to walkthrough
          </button>
        </div>
      </div>
    `;

    concept.querySelector('#sandbox-exit').addEventListener('click', () => {
      DemoEngine.exitSandbox();
      DemoEngine.goTo(8);
    });
  });
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
    'financial-health': {
      title: 'Financial Health',
      summary: 'Projections show you where your money is heading over the coming months.',
      detail: 'The financial health section projects your income and expenses forward. You can see trends, spot shortfalls early, and make adjustments before problems arrive.',
    },
    'cards': {
      title: 'Cards & Wallet',
      summary: 'Link expenses to specific cards to see how your spending is distributed.',
      detail: 'By assigning expenses to cards, you get a clear view of what each card carries. This helps you manage payment methods and avoid surprises on any single card.',
    },
    'scenarios': {
      title: 'Scenarios',
      summary: 'Model different financial realities without affecting your main budget.',
      detail: 'Scenarios let you ask "what if?" — what if you got a raise, took on a new expense, or changed your cadence? Each scenario is independent, so you can explore freely and compare side by side.',
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
  _ownerId = 'demo-user';
  _demoMode = true;
  _serverToday = new Date().toISOString().split('T')[0];
  _activeScenario = 'demo';

  DemoEngine.init();
});
