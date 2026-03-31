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

// Format a Date as YYYY-MM-DD using LOCAL time (not UTC).
// Avoids the UTC-shift bug where toISOString() returns a different
// calendar date than effectiveToday() in western time zones.
function fmtLocalDate(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

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
      startDate: fmtLocalDate(start),
      endDate: fmtLocalDate(end),
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
  // dueDay = today's day-of-month. The current biweekly period always
  // includes today, so dueDayInPeriod() is guaranteed to match.
  const today = new Date();
  const dueDay = today.getDate();
  return {
    expenseId: 'demo-exp-1',
    name: state.userExpense.name,
    amount: state.userExpense.amount,
    recurrence: 'recurring',
    recurrenceFrequency: 'monthly',
    recurrenceStartDate: '2025-01-01',
    dueDay: dueDay,
    dueDate: null,
    periodStart: null,
    cardId: 'demo-card-1',
    scenarioId: 'demo',
    userId: 'demo-user',
  };
}

function buildDemoCards() {
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
  clearHighlights();
}

function hideAppPane() {
  document.getElementById('demo-app').classList.add('is-hidden');
  document.getElementById('demo-stage').classList.add('is-single');
}

function clearHighlights() {
  const shell = document.getElementById('demo-app');
  shell.querySelectorAll('.demo-highlight, .demo-highlight-strong, .demo-nav-highlight').forEach(el => {
    el.classList.remove('demo-highlight', 'demo-highlight-strong', 'demo-nav-highlight');
  });
}

function highlightNavItem(page) {
  const shell = document.getElementById('demo-app');
  shell.querySelectorAll('.bottom-nav__item').forEach(btn => {
    btn.classList.toggle('demo-nav-highlight', btn.dataset.page === page);
  });
}

/**
 * Scroll #main-content so `selector` is visible near the top.
 * Uses getBoundingClientRect for accuracy inside CSS-grid / absolute containers.
 */
function scrollToSection(selector) {
  const mainEl = document.getElementById('main-content');
  const target = mainEl.querySelector(selector);
  if (target) {
    const mainRect = mainEl.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    mainEl.scrollTop += (targetRect.top - mainRect.top) - 16;
  }
  return target;
}

/**
 * Transition to a new page with visual flow:
 * 1. Highlight target nav item
 * 2. Fade content out
 * 3. Call renderer
 * 4. Fade content in
 */
function transitionToPage(toPage, renderFn) {
  const mainEl = document.getElementById('main-content');
  highlightNavItem(toPage);
  mainEl.classList.add('is-transitioning');
  setTimeout(() => {
    renderFn();
    requestAnimationFrame(() => {
      mainEl.classList.remove('is-transitioning');
    });
  }, 350);
}


// ---- Section 4: Demo Framing Helpers --------------------------

// Home screen with optional highlight
function renderDemoHomeSnapshot(state, highlightSelector) {
  showAppPane('home');
  _healthData = {
    scenario: buildDemoScenario(state),
    periods: buildDemoPeriods(state),
    expenses: state.userExpense ? [buildDemoExpense(state)] : [],
  };
  renderHealth(6);

  // setTimeout(0) lets the browser finish layout after innerHTML before we measure
  setTimeout(() => {
    const mainEl = document.getElementById('main-content');
    if (highlightSelector) {
      const target = mainEl.querySelector(highlightSelector);
      if (target) {
        const mainRect = mainEl.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        mainEl.scrollTop = mainEl.scrollTop + (targetRect.top - mainRect.top) - 16;
        target.classList.add('demo-highlight');
      }
    } else {
      mainEl.scrollTop = 0;
    }
  }, 50);
}

// Home + looping FAB pulse → sheet slide-up animation
// Returns a cleanup function to stop the loop when leaving Step 2.
let _expenseLoopTimer = null;

function renderDemoAddExpenseContext(state) {
  // Clear any previous loop
  if (_expenseLoopTimer) { clearTimeout(_expenseLoopTimer); _expenseLoopTimer = null; }

  showAppPane('home');
  _healthData = {
    scenario: buildDemoScenario(state),
    periods: buildDemoPeriods(state),
    expenses: [],
  };
  renderHealth(6);

  const shell = document.getElementById('demo-app');
  const fab = document.getElementById('fab');

  function runCycle() {
    // Phase 1: FAB pulses
    fab.classList.remove('is-hidden');
    fab.classList.add('demo-fab-pulse');
    shell.querySelectorAll('.demo-sheet-preview').forEach(el => el.remove());

    // Phase 2: Sheet slides up at 1200ms
    _expenseLoopTimer = setTimeout(() => {
      shell.insertAdjacentHTML('beforeend', `
        <div class="demo-sheet-preview">
          <div class="demo-sheet-preview__handle"></div>
          <div class="demo-sheet-preview__title">New Expense</div>
          <div class="demo-sheet-preview__field">Expense name</div>
          <div class="demo-sheet-preview__field">$0.00</div>
          <div class="demo-sheet-preview__field">Monthly</div>
          <div class="demo-sheet-preview__btn"></div>
        </div>
      `);

      // Phase 3: Hold sheet visible, then reset and loop
      _expenseLoopTimer = setTimeout(() => {
        shell.querySelectorAll('.demo-sheet-preview').forEach(el => el.remove());
        fab.classList.remove('demo-fab-pulse');
        // Brief pause before next cycle
        _expenseLoopTimer = setTimeout(runCycle, 600);
      }, 2200);
    }, 1200);
  }

  runCycle();
}

function stopExpenseLoop() {
  if (_expenseLoopTimer) { clearTimeout(_expenseLoopTimer); _expenseLoopTimer = null; }
}

// Multi-stage impact: bills -> structure -> period (tight timing)
function renderDemoImpactMultiStage(state) {
  showAppPane('home');
  _healthData = {
    scenario: buildDemoScenario(state),
    periods: buildDemoPeriods(state),
    expenses: [buildDemoExpense(state)],
  };
  renderHealth(6);

  /** Scroll mainEl so target is visible, using getBoundingClientRect */
  function scrollTo(mainEl, target) {
    const mainRect = mainEl.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    mainEl.scrollTop += (targetRect.top - mainRect.top) - 16;
  }

  const mainEl = document.getElementById('main-content');

  // Stage A (50ms — after layout): Highlight bills section
  setTimeout(() => {
    const bills = mainEl.querySelector('.home-section-bills');
    if (bills) {
      scrollTo(mainEl, bills);
      bills.classList.add('demo-highlight');
    }
  }, 50);

  // Stage B (1500ms): Scroll to structure metrics
  setTimeout(() => {
    clearHighlights();
    const structure = mainEl.querySelector('.home-section-structure');
    if (structure) {
      scrollTo(mainEl, structure);
      structure.classList.add('demo-highlight-strong');
    }
  }, 1500);

  // Stage C (3000ms): Scroll to period card
  setTimeout(() => {
    clearHighlights();
    const period = mainEl.querySelector('.home-section-period')
                || mainEl.querySelector('.period-shortcut-card');
    if (period) {
      scrollTo(mainEl, period);
      period.classList.add('demo-highlight');
    }
  }, 3000);
}

// Financial health section highlighted
function renderDemoFinancialHealth(state) {
  showAppPane('home');
  _healthData = {
    scenario: buildDemoScenario(state),
    periods: buildDemoPeriods(state),
    expenses: state.userExpense ? [buildDemoExpense(state)] : [],
  };
  renderHealth(6);

  // Health is the LAST section in single-column layout — needs full layout
  // before measuring. Use 80ms to ensure all preceding sections are painted.
  setTimeout(() => {
    const mainEl = document.getElementById('main-content');
    // Target the projection grid inside health section for focused highlight
    const projGrid = mainEl.querySelector('.home-section-health .proj-grid');
    const health = projGrid || mainEl.querySelector('.home-section-health');
    if (health) {
      const mainRect = mainEl.getBoundingClientRect();
      const targetRect = health.getBoundingClientRect();
      mainEl.scrollTop += (targetRect.top - mainRect.top) - 16;
      health.classList.add('demo-highlight');
    }
  }, 80);
}

// Expenses page with at least 1 visible expense
function renderDemoExpenses(state) {
  showAppPane('expenses');
  const expense = buildDemoExpense(state);
  const today = new Date();
  const dueDay = Math.min(today.getDate() + 2, 28);
  const extras = [
    { expenseId: 'demo-exp-2', name: 'Spotify', amount: 10.99, recurrence: 'recurring',
      recurrenceFrequency: 'monthly', recurrenceStartDate: '2025-01-01',
      dueDay: dueDay, dueDate: null, periodStart: null,
      cardId: 'demo-card-2', scenarioId: 'demo', userId: 'demo-user' },
    { expenseId: 'demo-exp-3', name: 'Car Insurance', amount: 145, recurrence: 'recurring',
      recurrenceFrequency: 'monthly', recurrenceStartDate: '2025-01-01',
      dueDay: dueDay, dueDate: null, periodStart: null,
      cardId: 'demo-card-1', scenarioId: 'demo', userId: 'demo-user' },
  ];
  _expenses = expense ? [expense, ...extras] : extras;
  _periods = buildDemoPeriods(state);
  _expScenario = buildDemoScenario(state);
  _expFilter = 'current';
  renderExpensesList();

  setTimeout(() => {
    const mainEl = document.getElementById('main-content');
    const pill = mainEl.querySelector('.expense-pill');
    if (pill) {
      const mainRect = mainEl.getBoundingClientRect();
      const pillRect = pill.getBoundingClientRect();
      mainEl.scrollTop += (pillRect.top - mainRect.top) - 60;
      pill.classList.add('demo-highlight');
    }
  }, 50);
}

// Pay Period with expense visibly mapped
function renderDemoPayPeriod(state) {
  showAppPane('pay-period');
  _pd = {
    periods: buildDemoPeriods(state),
    expenses: state.userExpense ? [buildDemoExpense(state)] : [],
  };
  renderPeriod(0);

  setTimeout(() => {
    const mainEl = document.getElementById('main-content');
    const billCard = mainEl.querySelector('.pd-bill-card');
    if (billCard) {
      const mainRect = mainEl.getBoundingClientRect();
      const cardRect = billCard.getBoundingClientRect();
      mainEl.scrollTop += (cardRect.top - mainRect.top) - 100;
      billCard.classList.add('demo-highlight');
    }
  }, 50);
}

// Cards page
function renderDemoCards(state) {
  showAppPane('cards');
  _cards = buildDemoCards();
  _cardExpenses = state.userExpense ? [buildDemoExpense(state)] : [];
  _selectedCard = _cards[0].cardId;
  renderCardsPage();

  setTimeout(() => {
    const mainEl = document.getElementById('main-content');
    const walletRow = mainEl.querySelector('.wallet-row');
    if (walletRow) {
      mainEl.scrollTop = 0;
      walletRow.classList.add('demo-highlight');
    }
  }, 50);
}

// Scenarios page with delayed highlight on alternate
function renderDemoScenarios(state) {
  showAppPane('scenarios');
  renderScenarios(buildDemoScenarios(state));

  setTimeout(() => {
    const mainEl = document.getElementById('main-content');
    const cards = mainEl.querySelectorAll('.sc-card');
    if (cards.length > 1) {
      cards[1].classList.add('demo-highlight');
    }
  }, 1500);
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
  let currentSubStep = null;
  const completedConcepts = [];

  // Store step renderer for concept review restore
  let _preReviewRestoreFn = null;

  const STEPS = [
    { id: 'setup',            render: renderStep0_Setup,           single: true  },
    { id: 'snapshot',         render: renderStep1_Snapshot,        single: false },
    { id: 'add-expense',      render: renderStep2_AddExpense,      single: false },
    { id: 'see-impact',       render: renderStep3_SeeImpact,       single: false },
    { id: 'financial-health', render: renderStep4_FinancialHealth, single: false },
    { id: 'nav-tour',         render: renderStep5_NavTour,         single: false },
    { id: 'cards-deep',       render: renderStep6_Cards,           single: false },
    { id: 'scenarios',        render: renderStep7_Scenarios,       single: false },
    { id: 'understanding',    render: renderStep8_Understanding,   single: true  },
    { id: 'final',            render: renderStep9_Final,           single: true  },
  ];

  const TOTAL_STEPS = STEPS.length;

  function goTo(index) {
    if (index < 0 || index >= TOTAL_STEPS) return;
    stopExpenseLoop(); // Clean up Step 2 animation loop if active
    // Hide bottom nav unless entering nav tour (step 5) or sandbox
    document.getElementById('demo-app').classList.remove('show-nav');
    document.getElementById('demo-app').classList.remove('nav-focus-mode');
    document.getElementById('demo-app').classList.remove('health-focus');
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
      // Completed dots are clickable to go back
      if (i < currentStep) {
        html += `<button class="${cls}" data-step="${i}" aria-label="Go to step ${i + 1}" style="cursor:pointer;border:none;padding:0;"></button>`;
      } else {
        html += `<div class="${cls}"></div>`;
      }
    }
    container.innerHTML = html;

    // Wire click handlers on completed dots
    container.querySelectorAll('button[data-step]').forEach(btn => {
      btn.addEventListener('click', () => {
        goTo(parseInt(btn.dataset.step, 10));
      });
    });
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

  // Pre-review state for restoring app pane after concept review
  function setPreReviewRestore(fn) { _preReviewRestoreFn = fn; }
  function restorePreReview() {
    if (_preReviewRestoreFn) {
      _preReviewRestoreFn();
      _preReviewRestoreFn = null;
    }
  }
  function getCurrentStepData() { return STEPS[currentStep]; }

  // Sandbox mode
  let sandboxActive = false;

  function enterSandbox() {
    sandboxActive = true;
    const shell = document.getElementById('demo-app');
    shell.classList.add('is-sandbox');
    shell.classList.add('show-nav');

    if (!shell.querySelector('.demo-sandbox-banner')) {
      shell.insertAdjacentHTML('afterbegin',
        '<div class="demo-sandbox-banner">Preview Mode — data won\'t be saved</div>');
    }

    shell.querySelectorAll('.bottom-nav__item').forEach(btn => {
      btn.addEventListener('click', handleSandboxNav);
    });

    document.getElementById('fab').addEventListener('click', handleSandboxFab);
  }

  function exitSandbox() {
    sandboxActive = false;
    const shell = document.getElementById('demo-app');
    shell.classList.remove('is-sandbox');
    shell.classList.remove('show-nav');
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
    shell.querySelectorAll('.demo-sheet-preview').forEach(el => el.remove());
    shell.insertAdjacentHTML('beforeend', `
      <div class="demo-sheet-preview" style="cursor:default;">
        <div class="demo-sheet-preview__handle" style="cursor:pointer;" onclick="this.closest('.demo-sheet-preview').remove()"></div>
        <div class="demo-sheet-preview__title">New Expense</div>
        <div class="demo-sheet-preview__field">Expense name</div>
        <div class="demo-sheet-preview__field">$0.00</div>
        <div class="demo-sheet-preview__field">Monthly</div>
        <div class="demo-sheet-preview__btn"></div>
      </div>
    `);
  }

  function isSandbox() { return sandboxActive; }

  return {
    init, next, goTo, reset, getState, getCompletedConcepts, unlockConcept,
    getCurrentStep, getSubStep, setSubStep, getCurrentStepData,
    enterSandbox, exitSandbox, isSandbox,
    setPreReviewRestore, restorePreReview,
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
// Step 1 — Snapshot (dual pane, paycheck-based framing)
// ============================================================
function renderStep1_Snapshot(container) {
  const state = DemoEngine.getState();
  const income = state.income;
  const cadenceLabel = state.cadence === 'biweekly' ? 'per paycheck' : 'per month';

  container.innerHTML = `
    <h1 class="demo-title">Here's your snapshot, ${esc(state.name)}</h1>
    <p class="demo-subtitle">Your financial picture ${cadenceLabel}, at a glance.</p>

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
      This is your financial structure: money in, money out, what remains.
      The app shows this on the Home screen — look at the highlighted section.
    </div>

    <button class="demo-btn demo-btn--primary" id="demo-continue" style="margin-top:var(--space-6);">
      Continue
    </button>
  `;

  // Show Home with NO expenses, highlight Financial Structure
  renderDemoHomeSnapshot(state, '.home-section-structure');

  DemoEngine.unlockConcept('snapshot');
  container.querySelector('#demo-continue').addEventListener('click', () => DemoEngine.next());
}


// ============================================================
// Step 2 — Add Expense (dual pane, 2-phase visual flow)
// ============================================================
function renderStep2_AddExpense(container) {
  const state = DemoEngine.getState();

  container.innerHTML = `
    <h1 class="demo-title">Let's add your first expense</h1>
    <p class="demo-subtitle">
      In the app, you tap the <strong>+</strong> button to add an expense.
      Watch the app pane — the sheet slides up.
    </p>

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

  // Phase 1: Home screen + FAB pulse. Phase 2: sheet slides up (1200ms delay)
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
// Step 3 — See Impact (dual pane, 3 stages with manual controls)
// ============================================================
function renderStep3_SeeImpact(container) {
  const state = DemoEngine.getState();
  const income = state.income;
  const expense = state.userExpense;
  const bills = expense ? expense.amount : 0;
  const leftover = income - bills;
  const leftoverClass = leftover >= 0 ? 'demo-metric__value--accent' : 'demo-metric__value--danger';

  const stages = [
    { label: 'Bills', selector: '.home-section-bills', cls: 'demo-highlight',
      desc: 'Your new expense appears in <strong>Recurring Bills</strong>.' },
    { label: 'Structure', selector: '.home-section-structure', cls: 'demo-highlight-strong',
      desc: 'The <strong>Financial Structure</strong> now reflects the deduction.' },
    { label: 'Pay Period', selector: '.home-section-period', cls: 'demo-highlight',
      desc: 'Your <strong>Current Pay Period</strong> shows the expense mapped to this paycheck.' },
  ];
  let stageIdx = 0;

  function renderConceptPane() {
    const s = stages[stageIdx];
    const isLast = stageIdx === stages.length - 1;
    const dots = stages.map((_, i) =>
      `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${i === stageIdx ? 'var(--color-accent)' : 'var(--color-border)'};margin:0 3px;"></span>`
    ).join('');

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
        ${s.desc} ${dots}
      </div>

      <div style="display:flex;gap:var(--space-3);margin-top:var(--space-6);">
        ${stageIdx > 0 ? '<button class="demo-btn demo-btn--ghost" id="impact-prev" style="flex:1;">&larr; Back</button>' : ''}
        <button class="demo-btn demo-btn--primary" id="impact-next" style="flex:1;">
          ${isLast ? 'Continue' : 'Next &rarr;'}
        </button>
      </div>
    `;

    container.querySelector('#impact-next')?.addEventListener('click', () => {
      if (isLast) {
        DemoEngine.next();
      } else {
        stageIdx++;
        renderConceptPane();
        showStage();
      }
    });

    container.querySelector('#impact-prev')?.addEventListener('click', () => {
      stageIdx--;
      renderConceptPane();
      showStage();
    });
  }

  function showStage() {
    const mainEl = document.getElementById('main-content');
    clearHighlights();
    const s = stages[stageIdx];
    setTimeout(() => {
      const target = mainEl.querySelector(s.selector)
                  || mainEl.querySelector('.period-shortcut-card');
      if (target) {
        const mainRect = mainEl.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        mainEl.scrollTop += (targetRect.top - mainRect.top) - 16;
        target.classList.add(s.cls);
      }
    }, 50);
  }

  // Render home with expense data, then show first stage
  showAppPane('home');
  _healthData = {
    scenario: buildDemoScenario(state),
    periods: buildDemoPeriods(state),
    expenses: [buildDemoExpense(state)],
  };
  renderHealth(6);

  renderConceptPane();
  showStage();
}


// ============================================================
// Step 4 — Financial Health (dual pane, 3→6→12 month horizons)
// ============================================================
function renderStep4_FinancialHealth(container) {
  const state = DemoEngine.getState();

  const horizons = [
    { months: 3, label: '3 months',
      desc: 'Start with a <strong>3-month view</strong>. See how your income and expenses trend over the next quarter.' },
    { months: 6, label: '6 months',
      desc: 'Now expand to <strong>6 months</strong>. Patterns emerge — you can spot seasonal shortfalls or surpluses.' },
    { months: 12, label: '12 months',
      desc: 'The full <strong>12-month projection</strong>. See your financial trajectory for the entire year ahead.' },
  ];
  let horizonIdx = 0;

  function renderConceptPane() {
    const h = horizons[horizonIdx];
    const isLast = horizonIdx === horizons.length - 1;
    const dots = horizons.map((_, i) =>
      `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${i === horizonIdx ? 'var(--color-accent)' : 'var(--color-border)'};margin:0 3px;"></span>`
    ).join('');

    container.innerHTML = `
      <h1 class="demo-title">See around corners</h1>
      <p class="demo-subtitle">Budget Peace projects your finances forward — not just this paycheck, but months ahead.</p>

      <div class="demo-teach">
        ${h.desc} ${dots}
      </div>

      <div style="display:flex;gap:var(--space-3);margin-top:var(--space-6);">
        ${horizonIdx > 0 ? '<button class="demo-btn demo-btn--ghost" id="health-prev" style="flex:1;">&larr; Back</button>' : ''}
        <button class="demo-btn demo-btn--primary" id="health-next" style="flex:1;">
          ${isLast ? 'Continue' : 'Next &rarr;'}
        </button>
      </div>
    `;

    container.querySelector('#health-next')?.addEventListener('click', () => {
      if (isLast) {
        DemoEngine.next();
      } else {
        horizonIdx++;
        renderConceptPane();
        showHorizon();
      }
    });

    container.querySelector('#health-prev')?.addEventListener('click', () => {
      horizonIdx--;
      renderConceptPane();
      showHorizon();
    });
  }

  function showHorizon() {
    const h = horizons[horizonIdx];
    showAppPane('home');
    // Hide all sections except Financial Health so it's at the top and fully visible
    document.getElementById('demo-app').classList.add('health-focus');
    _healthData = {
      scenario: buildDemoScenario(state),
      periods: buildDemoPeriods(state),
      expenses: state.userExpense ? [buildDemoExpense(state)] : [],
    };
    renderHealth(h.months);

    setTimeout(() => {
      const mainEl = document.getElementById('main-content');
      mainEl.scrollTop = 0;
      const health = mainEl.querySelector('.home-section-health');
      if (health) health.classList.add('demo-highlight');
    }, 80);
  }

  renderConceptPane();
  showHorizon();
  DemoEngine.unlockConcept('financial-health');
}


// ============================================================
// Step 5 — Navigation Tour (dual pane, sub-steps with transitions)
// ============================================================
function renderStep5_NavTour(container) {
  const sub = DemoEngine.getSubStep() || 'home';
  DemoEngine.setSubStep(sub);

  const state = DemoEngine.getState();
  const subSteps = ['home', 'pay-period', 'budgets', 'expenses', 'cards'];
  const subIndex = subSteps.indexOf(sub);

  const descriptions = {
    home: {
      title: 'Home — your command center',
      body: 'Everything starts here. Your financial structure, current pay period, health projections, and recurring bills — all on one screen.',
    },
    'pay-period': {
      title: 'Pay Period — paycheck-level clarity',
      body: 'Each paycheck has its own budget. You can see exactly which bills come out of which check — this is where your expense shows up mapped to a specific paycheck.',
    },
    budgets: {
      title: 'Budgets — every paycheck planned',
      body: 'Each pay period gets its own budget. See income, expenses, and what\'s remaining for every paycheck at a glance.',
    },
    expenses: {
      title: 'Expenses — every bill tracked',
      body: 'See all your recurring and one-time expenses at a glance. Each one feeds into your budget structure and pay periods automatically.',
    },
    cards: {
      title: 'Cards — your wallet, organized',
      body: 'Link expenses to specific cards. See at a glance what each card carries and how your spending is distributed across payment methods.',
    },
  };

  const desc = descriptions[sub];
  const isLast = subIndex === subSteps.length - 1;

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
      Watch the bottom navigation bar — the highlighted tab shows where you are.
    </div>

    <div style="display:flex;gap:var(--space-3);margin-top:var(--space-6);">
      ${subIndex > 0 ? '<button class="demo-btn demo-btn--ghost" id="demo-sub-prev" style="flex:1;">Back</button>' : ''}
      <button class="demo-btn demo-btn--primary" id="demo-sub-next" style="flex:1;">
        ${isLast ? 'Continue' : 'Next page'}
      </button>
    </div>
  `;

  // Show bottom nav for the nav tour
  const shell = document.getElementById('demo-app');
  shell.classList.add('show-nav');

  // No nav-focus-mode — show full page content on all sub-steps
  shell.classList.remove('nav-focus-mode');

  // Render the current sub-step page directly (first visit or already on this page)
  renderNavSubStep(sub, state);

  DemoEngine.unlockConcept('pay-periods');
  DemoEngine.unlockConcept('cards');

  // Sub-step navigation with visual transition
  function goToSubStep(newSub, useTransition) {
    DemoEngine.setSubStep(newSub);

    if (useTransition) {
      // Show the navigation flow: highlight nav -> fade -> render
      transitionToPage(newSub, () => {
        renderNavSubStep(newSub, state);
      });
    }

    // Re-render concept pane
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
      goToSubStep(subSteps[subIndex + 1], true);
    }
  });

  container.querySelector('#demo-sub-prev')?.addEventListener('click', () => {
    goToSubStep(subSteps[subIndex - 1], true);
  });
}

/** Render a nav tour sub-step's page in the app pane */
function renderNavSubStep(sub, state) {
  switch (sub) {
    case 'home':
      renderDemoHomeSnapshot(state, null);
      highlightNavItem('home');
      break;
    case 'pay-period':
      renderDemoPayPeriod(state);
      highlightNavItem('pay-period');
      break;
    case 'budgets': {
      showAppPane('budgets');
      highlightNavItem('budgets');
      const periods = buildDemoPeriods(state);
      const expAmt = state.userExpense ? state.userExpense.amount : 0;
      const today = effectiveToday();
      const periodCards = periods.map((p, i) => {
        const isCurrent = p.startDate <= today && p.endDate >= today;
        const totalExp = isCurrent ? expAmt : 0;
        const remaining = p.income - totalExp;
        const isNeg = remaining < 0;
        const startD = new Date(p.startDate + 'T00:00:00');
        const endD = new Date(p.endDate + 'T00:00:00');
        const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `
          <div style="background:var(--color-surface);border:1px solid ${isCurrent ? 'var(--color-accent)' : 'var(--color-border)'};border-radius:var(--radius-md);padding:var(--space-4);margin-bottom:var(--space-3);${isCurrent ? 'box-shadow:0 0 0 2px var(--color-accent-light);' : ''}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-3);">
              <span style="font-weight:600;font-size:var(--font-size-sm);">${fmt(startD)} – ${fmt(endD)}</span>
              ${isCurrent ? '<span style="font-size:var(--font-size-xs);font-weight:600;color:var(--color-accent);background:var(--color-accent-light);padding:2px 8px;border-radius:var(--radius-pill);">Current</span>' : ''}
            </div>
            <div style="display:flex;justify-content:space-between;font-size:var(--font-size-sm);margin-bottom:4px;">
              <span style="color:var(--color-text-secondary);">Income</span>
              <span>${formatMoney(p.income)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:var(--font-size-sm);margin-bottom:4px;">
              <span style="color:var(--color-text-secondary);">Expenses</span>
              <span>${formatMoney(totalExp)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:var(--font-size-sm);font-weight:600;padding-top:var(--space-2);border-top:1px solid var(--color-border);">
              <span>Remaining</span>
              <span style="${isNeg ? 'color:var(--color-danger);' : 'color:var(--color-accent);'}">${formatMoney(remaining)}</span>
            </div>
          </div>`;
      }).join('');
      document.getElementById('main-content').innerHTML = `
        <div style="padding:var(--space-4);">
          <div style="font-size:var(--font-size-xs);color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.05em;font-weight:600;margin-bottom:var(--space-3);">Pay Period Budgets</div>
          ${periodCards}
        </div>`;
      break;
    }
    case 'expenses':
      renderDemoExpenses(state);
      highlightNavItem('expenses');
      break;
    case 'cards':
      renderDemoCards(state);
      highlightNavItem('cards');
      break;
  }
}


// ============================================================
// Step 6 — Cards Deep Dive (dual pane, 3 stages)
// ============================================================
function renderStep6_Cards(container) {
  const state = DemoEngine.getState();
  const expName = state.userExpense ? state.userExpense.name : 'Rent';
  const expAmt  = state.userExpense ? state.userExpense.amount : 1200;

  const stages = [
    { desc: 'These are your payment methods — debit and credit cards in your wallet.' },
    { desc: 'Fill in the details — card name, last four digits, and type — then save.' },
    { desc: 'Card saved! Your new <strong>Apple Card</strong> now appears in the wallet.' },
    { desc: 'Tap a card to select it and see its details.' },
    { desc: `Now link your <strong>${esc(expName)}</strong> expense to this card.` },
    { desc: `Done — <strong>${esc(expName)}</strong> is now assigned to <strong>Apple Card</strong>.` },
  ];
  let stageIdx = 0;

  // Extra card that "appears" after the add-card form
  const newCard = {
    cardId: 'demo-card-3', name: 'Apple Card', lastFour: '5555',
    type: 'Credit', colorIndex: 5, userId: 'demo-user',
  };

  function renderConceptPane() {
    const s = stages[stageIdx];
    const isLast = stageIdx === stages.length - 1;
    const dots = stages.map((_, i) =>
      `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${i === stageIdx ? 'var(--color-accent)' : 'var(--color-border)'};margin:0 3px;"></span>`
    ).join('');

    container.innerHTML = `
      <h1 class="demo-title">Your wallet, organized</h1>
      <p class="demo-subtitle">Link expenses to specific cards so you always know what each card carries.</p>

      <div class="demo-teach">
        ${s.desc} ${dots}
      </div>

      <div style="display:flex;gap:var(--space-3);margin-top:var(--space-6);">
        ${stageIdx > 0 ? '<button class="demo-btn demo-btn--ghost" id="cards-prev" style="flex:1;">&larr; Back</button>' : ''}
        <button class="demo-btn demo-btn--primary" id="cards-next" style="flex:1;">
          ${isLast ? 'Continue' : 'Next &rarr;'}
        </button>
      </div>
    `;

    container.querySelector('#cards-next')?.addEventListener('click', () => {
      if (isLast) {
        DemoEngine.next();
      } else {
        stageIdx++;
        renderConceptPane();
        showStage();
      }
    });

    container.querySelector('#cards-prev')?.addEventListener('click', () => {
      stageIdx--;
      renderConceptPane();
      showStage();
    });
  }

  function showStage() {
    const shell = document.getElementById('demo-app');
    shell.querySelectorAll('.demo-sheet-preview').forEach(el => el.remove());
    document.getElementById('fab').classList.remove('demo-fab-pulse');

    if (stageIdx === 0) {
      // Stage A: Show 2 existing cards, highlight wallet row
      _cards = buildDemoCards();
      _cardExpenses = [];
      _selectedCard = _cards[0].cardId;
      showAppPane('cards');
      renderCardsPage();
      setTimeout(() => {
        const walletRow = document.getElementById('main-content').querySelector('.wallet-row');
        if (walletRow) walletRow.classList.add('demo-highlight');
      }, 50);

    } else if (stageIdx === 1) {
      // Stage B: Add-card sheet with PREFILLED realistic values
      _cards = buildDemoCards();
      _cardExpenses = [];
      _selectedCard = _cards[0].cardId;
      showAppPane('cards');
      renderCardsPage();
      const fab = document.getElementById('fab');
      fab.classList.remove('is-hidden');
      fab.classList.add('demo-fab-pulse');
      setTimeout(() => {
        shell.insertAdjacentHTML('beforeend', `
          <div class="demo-sheet-preview">
            <div class="demo-sheet-preview__handle"></div>
            <div class="demo-sheet-preview__title">New Card</div>
            <div class="demo-sheet-preview__field" style="color:var(--color-text);font-weight:500;">Apple Card</div>
            <div class="demo-sheet-preview__field" style="color:var(--color-text);font-weight:500;">5555</div>
            <div class="demo-sheet-preview__field" style="color:var(--color-text);font-weight:500;">Credit</div>
            <div class="demo-sheet-preview__btn" style="display:flex;align-items:center;justify-content:center;color:#fff;font-size:var(--font-size-xs);font-weight:600;">Add Card</div>
          </div>
        `);
      }, 800);

    } else if (stageIdx === 2) {
      // Stage C: Card saved — new card appears in wallet, highlighted
      _cards = [...buildDemoCards(), newCard];
      _cardExpenses = [];
      _selectedCard = newCard.cardId;
      showAppPane('cards');
      renderCardsPage();
      setTimeout(() => {
        const allCards = document.getElementById('main-content').querySelectorAll('.wallet-card');
        const last = allCards[allCards.length - 1];
        if (last) last.classList.add('demo-highlight');
      }, 50);

    } else if (stageIdx === 3) {
      // Stage D: Select the new card — highlight it, show empty detail
      _cards = [...buildDemoCards(), newCard];
      _cardExpenses = [];
      _selectedCard = newCard.cardId;
      showAppPane('cards');
      renderCardsPage();
      setTimeout(() => {
        const allCards = document.getElementById('main-content').querySelectorAll('.wallet-card');
        const last = allCards[allCards.length - 1];
        if (last) last.classList.add('demo-highlight');
      }, 50);

    } else if (stageIdx === 4) {
      // Stage E: "Link expense" sheet — simulated assignment
      _cards = [...buildDemoCards(), newCard];
      _cardExpenses = [];
      _selectedCard = newCard.cardId;
      showAppPane('cards');
      renderCardsPage();
      setTimeout(() => {
        shell.insertAdjacentHTML('beforeend', `
          <div class="demo-sheet-preview">
            <div class="demo-sheet-preview__handle"></div>
            <div class="demo-sheet-preview__title">Link Expense to Card</div>
            <div style="padding:var(--space-2) var(--space-3);margin-bottom:var(--space-2);background:var(--color-surface-alt);border:1px solid var(--color-border);border-radius:var(--radius-sm);">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                  <div style="font-size:var(--font-size-sm);font-weight:600;">${esc(expName)}</div>
                  <div style="font-size:var(--font-size-xs);color:var(--color-text-secondary);">Monthly · recurring</div>
                </div>
                <div style="font-size:var(--font-size-sm);font-weight:700;">${formatMoney(expAmt)}</div>
              </div>
            </div>
            <div style="font-size:var(--font-size-xs);color:var(--color-text-secondary);margin-bottom:var(--space-2);text-align:center;">Assign to <strong style="color:var(--color-text);">Apple Card •••• 5555</strong></div>
            <div class="demo-sheet-preview__btn" style="display:flex;align-items:center;justify-content:center;color:#fff;font-size:var(--font-size-xs);font-weight:600;">Link Expense</div>
          </div>
        `);
      }, 600);

    } else if (stageIdx === 5) {
      // Stage F: Linked — show card detail with expense, highlight detail area
      _cards = [...buildDemoCards(), newCard];
      const linkedExp = buildDemoExpense(state);
      if (linkedExp) linkedExp.cardId = newCard.cardId;
      _cardExpenses = linkedExp ? [linkedExp] : [];
      _selectedCard = newCard.cardId;
      showAppPane('cards');
      renderCardsPage();
      setTimeout(() => {
        const mainEl = document.getElementById('main-content');
        const detail = mainEl.querySelector('#card-detail-area');
        if (detail) {
          const mainRect = mainEl.getBoundingClientRect();
          const detailRect = detail.getBoundingClientRect();
          mainEl.scrollTop += (detailRect.top - mainRect.top) - 60;
          detail.classList.add('demo-highlight');
        }
      }, 80);
    }
  }

  renderConceptPane();
  showStage();
  DemoEngine.unlockConcept('cards');
}


// ============================================================
// Step 7 — Scenarios (dual pane, focused)
// ============================================================
function renderStep7_Scenarios(container) {
  const state = DemoEngine.getState();
  const altIncome = Math.round(state.income * 1.3);

  container.innerHTML = `
    <h1 class="demo-title">What if your income changed?</h1>
    <p class="demo-subtitle">Scenarios let you model different financial realities without affecting your main budget.</p>

    <div class="demo-teach">
      Here you see two scenarios: your <strong>Main</strong> setup, and a <strong>"Side Hustle"</strong>
      scenario with ${formatMoney(altIncome)} per paycheck. Test a different income or situation —
      compare without damaging your main plan.
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
// Step 8 — System Understanding (single pane)
// ============================================================
function renderStep8_Understanding(container) {
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
// Step 9 — Final CTA + Sandbox
// ============================================================
function renderStep9_Final(container) {
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
    showAppPane('home');
    renderDemoHomeSnapshot(state, null);
    DemoEngine.enterSandbox();

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
      DemoEngine.goTo(9);
    });
  });
}


// ---- Section 7: Help System (with visual context on review) ----

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

  // Map concepts to app pane renderers for visual context
  const CONCEPT_RENDERERS = {
    'snapshot': (s) => renderDemoHomeSnapshot(s, '.home-section-structure'),
    'adding-expenses': (s) => renderDemoAddExpenseContext(s),
    'pay-periods': (s) => renderDemoPayPeriod(s),
    'financial-health': (s) => renderDemoFinancialHealth(s),
    'cards': (s) => renderDemoCards(s),
    'scenarios': (s) => renderDemoScenarios(s),
  };

  function open() {
    const overlay = document.getElementById('demo-help-overlay');
    const panel = document.getElementById('demo-help-panel');

    // Store restore function for current step's app pane
    const step = DemoEngine.getCurrentStepData();
    if (step && !step.single) {
      DemoEngine.setPreReviewRestore(() => {
        step.render(document.getElementById('demo-concept').querySelector('.demo-step') || document.createElement('div'));
      });
    }

    renderCards(panel, DemoEngine.getCompletedConcepts());
    overlay.classList.add('is-open');
    panel.classList.add('is-open');
    overlay.onclick = close;
  }

  function close() {
    document.getElementById('demo-help-overlay').classList.remove('is-open');
    document.getElementById('demo-help-panel').classList.remove('is-open');

    // Restore previous step's app pane state
    DemoEngine.restorePreReview();
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

    // Show visual context in app pane
    const renderer = CONCEPT_RENDERERS[id];
    if (renderer) {
      const shell = document.getElementById('demo-app');
      shell.classList.remove('is-hidden');
      document.getElementById('demo-stage').classList.remove('is-single');
      renderer(DemoEngine.getState());
    }

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
