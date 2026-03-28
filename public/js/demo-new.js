// ============================================================
// Budget Peace — Standalone Demo Experience
// Route: /demo
// Self-contained: no Supabase, no auth, no shared.js, no router.
// Each step renders ONE concept. Nothing else.
// ============================================================

// ---- Section 1: Utilities -----------------------------------
// Self-contained copies — no dependency on shared.js

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

/** Get today as YYYY-MM-DD. */
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

// ---- Section 2: Demo Engine ---------------------------------

const DemoEngine = (() => {
  // ---- State ------------------------------------------------
  // Central state shared across all steps.
  const state = {
    name: '',
    income: 0,
    cadence: 'biweekly', // 'biweekly' or 'monthly'
    userExpense: null,    // { name, amount } — the single expense from Step 2
  };

  let currentStep = 0;
  const completedConcepts = []; // help system: unlocked concept IDs

  // Step definitions — each has an id and a render function.
  const STEPS = [
    { id: 'setup',        render: renderStep0_Setup },
    { id: 'snapshot',     render: renderStep1_Snapshot },
    { id: 'add-expense',  render: renderStep2_AddExpense },
    { id: 'cause-effect', render: renderStep3_CauseEffect },
    { id: 'pay-period',   render: renderStep4_PayPeriod },
    { id: 'meaning',      render: renderStep5_Meaning },
  ];

  const TOTAL_STEPS = STEPS.length;

  // ---- Navigation -------------------------------------------

  /** Navigate to a specific step by index. */
  function goTo(index) {
    if (index < 0 || index >= TOTAL_STEPS) return;
    currentStep = index;
    renderCurrentStep();
    updateProgress();
    updateHelpVisibility();
  }

  /** Advance to the next step. */
  function next() {
    goTo(currentStep + 1);
  }

  /** Reset all state and go back to Step 0. */
  function reset() {
    state.name = '';
    state.income = 0;
    state.cadence = 'biweekly';
    state.userExpense = null;
    completedConcepts.length = 0;
    goTo(0);
  }

  // ---- Rendering --------------------------------------------

  /** Render the current step into #demo-stage with a fade transition. */
  function renderCurrentStep() {
    const stage = document.getElementById('demo-stage');
    const step = STEPS[currentStep];

    // Fade out existing content
    const existing = stage.querySelector('.demo-step');
    if (existing) {
      existing.classList.remove('is-active');
    }

    // After fade-out, replace content and fade in
    setTimeout(() => {
      const wrapper = document.createElement('div');
      wrapper.className = 'demo-step';
      step.render(wrapper);
      stage.innerHTML = '';
      stage.appendChild(wrapper);

      // Trigger reflow, then activate
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          wrapper.classList.add('is-active');
        });
      });
    }, existing ? 200 : 0);
  }

  // ---- Progress Dots ----------------------------------------

  /** Update the progress dot indicators in the header. */
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

  // ---- Help Visibility --------------------------------------

  /** Show the help button only after Step 0. */
  function updateHelpVisibility() {
    const btn = document.getElementById('demo-help-btn');
    if (currentStep > 0) {
      btn.classList.add('is-visible');
    } else {
      btn.classList.remove('is-visible');
    }
  }

  // ---- Concept Tracking (for help system) -------------------

  /** Mark a concept as unlocked for the help panel. */
  function unlockConcept(id) {
    if (!completedConcepts.includes(id)) {
      completedConcepts.push(id);
    }
  }

  function getCompletedConcepts() {
    return [...completedConcepts];
  }

  // ---- Public API -------------------------------------------

  function init() {
    goTo(0);
    // Wire help button
    document.getElementById('demo-help-btn').addEventListener('click', HelpSystem.open);
  }

  function getState() { return state; }

  return { init, next, goTo, reset, getState, getCompletedConcepts: getCompletedConcepts, unlockConcept };
})();


// ---- Section 3: Step Renderers ------------------------------
// Each function receives a container element and renders into it.
// ONE concept per step. Nothing extra.

// ============================================================
// Step 0 — Setup
// Collect name, income, pay frequency. Calm and minimal.
// ============================================================
function renderStep0_Setup(container) {
  const state = DemoEngine.getState();

  container.innerHTML = `
    <div style="text-align:center;margin-bottom:var(--space-8);">
      <div class="demo-logo">Budget <span>Peace</span></div>
      <h1 class="demo-title">Let's understand your budget</h1>
      <p class="demo-subtitle">A quick guided walkthrough. No account needed.</p>
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

  // ---- Wire events ----

  // Cadence toggle
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

    if (!name) {
      container.querySelector('#demo-name').focus();
      return;
    }
    if (!income || income <= 0) {
      container.querySelector('#demo-income').focus();
      return;
    }

    // Populate state
    state.name = name;
    state.income = income;
    state.cadence = selectedCadence;

    DemoEngine.next();
  });

  // Enter key on income field triggers continue
  container.querySelector('#demo-income').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      container.querySelector('#demo-continue').click();
    }
  });
}


// ============================================================
// Step 1 — Financial Snapshot
// Show ONLY: income, bills ($0), leftover (= income).
// No expense list. No dashboard. Just three numbers.
// ============================================================
function renderStep1_Snapshot(container) {
  const state = DemoEngine.getState();
  const income = state.income;
  const bills = 0;          // starting from empty
  const leftover = income;  // no expenses yet

  container.innerHTML = `
    <h1 class="demo-title">Here's your snapshot, ${esc(state.name)}</h1>
    <p class="demo-subtitle">This is your financial picture at a glance.</p>

    <div class="demo-metrics">
      <div class="demo-metric">
        <div class="demo-metric__label">Income</div>
        <div class="demo-metric__value demo-metric__value--accent" id="dm-income">${formatMoney(income)}</div>
      </div>
      <div class="demo-metric">
        <div class="demo-metric__label">Bills</div>
        <div class="demo-metric__value" id="dm-bills">${formatMoney(bills)}</div>
      </div>
      <div class="demo-metric">
        <div class="demo-metric__label">Leftover</div>
        <div class="demo-metric__value demo-metric__value--accent" id="dm-leftover">${formatMoney(leftover)}</div>
      </div>
    </div>

    <div class="demo-teach">
      This is your financial picture. Money in, money out, what remains.
    </div>

    <button class="demo-btn demo-btn--primary" id="demo-continue" style="margin-top:var(--space-6);">
      Continue
    </button>
  `;

  // Unlock "Snapshot" concept for help system
  DemoEngine.unlockConcept('snapshot');

  container.querySelector('#demo-continue').addEventListener('click', () => {
    DemoEngine.next();
  });
}


// ============================================================
// Step 2 — Add an Expense
// Minimal: name (prefilled) + amount. That's it.
// The user creates a signal, then sees the effect in Step 3.
// ============================================================
function renderStep2_AddExpense(container) {
  container.innerHTML = `
    <h1 class="demo-title">Let's add your first expense</h1>
    <p class="demo-subtitle">Start with anything — this is just to see how it works.</p>

    <div class="demo-form-group">
      <label class="demo-label" for="demo-exp-name">Name</label>
      <input class="demo-input" id="demo-exp-name" type="text"
        value="Expense" maxlength="40" />
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

  // Unlock "Adding expenses" concept for help system
  DemoEngine.unlockConcept('adding-expenses');

  container.querySelector('#demo-add').addEventListener('click', () => {
    const name = container.querySelector('#demo-exp-name').value.trim() || 'Expense';
    const amount = parseFloat(container.querySelector('#demo-exp-amount').value);

    if (!amount || amount <= 0) {
      container.querySelector('#demo-exp-amount').focus();
      return;
    }

    // Store the user's expense
    DemoEngine.getState().userExpense = { name, amount };

    DemoEngine.next();
  });

  // Enter key on amount triggers add
  container.querySelector('#demo-exp-amount').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      container.querySelector('#demo-add').click();
    }
  });

  // Auto-focus the amount field since name is prefilled
  setTimeout(() => {
    container.querySelector('#demo-exp-amount').focus();
  }, 400);
}


// ============================================================
// Step 3 — Cause and Effect
// Show updated snapshot with the user's expense.
// Highlight the delta: "you created this → here's what happened."
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
        <div class="demo-metric__delta">-${formatMoney(bills)}</div>
      </div>
    </div>

    <div class="demo-teach">
      Every dollar you commit changes your leftover. No guessing — Budget Peace shows this instantly.
    </div>

    <button class="demo-btn demo-btn--primary" id="demo-continue" style="margin-top:var(--space-6);">
      Continue
    </button>
  `;

  container.querySelector('#demo-continue').addEventListener('click', () => {
    DemoEngine.next();
  });
}


// ============================================================
// Step 4 — Pay Periods
// Show 2-3 simplified period cards with the user's expense
// mapped to a specific period. Isolated concept.
// ============================================================
function renderStep4_PayPeriod(container) {
  const state = DemoEngine.getState();
  const income = state.income;
  const expense = state.userExpense;
  const isBiweekly = state.cadence === 'biweekly';

  // Generate 3 simplified periods starting from a recent date
  const periods = buildSimplePeriods(isBiweekly, income, expense);

  let periodsHtml = '';
  periods.forEach(p => {
    const expenseRows = p.expenses.map(e => {
      const highlight = e.isUser ? ' demo-period__highlight' : '';
      return `
        <div class="demo-period__row demo-period__row--expense">
          <span class="${highlight}">${esc(e.name)}</span>
          <span class="${highlight}">${formatMoney(e.amount)}</span>
        </div>`;
    }).join('');

    const noExpenses = p.expenses.length === 0
      ? '<div class="demo-period__row demo-period__row--expense" style="color:var(--color-text-secondary);font-style:italic;">No expenses this period</div>'
      : '';

    const leftoverClass = p.leftover >= 0 ? 'demo-metric__value--accent' : 'demo-metric__value--danger';

    periodsHtml += `
      <div class="demo-period">
        <div class="demo-period__header">
          <span class="demo-period__dates">${formatShortDate(p.start)} — ${formatShortDate(p.end)}</span>
          <span class="demo-period__income">${formatMoney(p.income)}</span>
        </div>
        ${expenseRows}
        ${noExpenses}
        <div class="demo-period__row demo-period__row--leftover">
          <span>Leftover</span>
          <span class="${leftoverClass}">${formatMoney(p.leftover)}</span>
        </div>
      </div>`;
  });

  container.innerHTML = `
    <h1 class="demo-title">Your money flows in pay periods</h1>
    <p class="demo-subtitle">${isBiweekly ? 'Each two-week paycheck has its own budget.' : 'Each month has its own budget.'}</p>

    <div class="demo-periods">
      ${periodsHtml}
    </div>

    <div class="demo-teach">
      You get paid on a schedule, not all at once. Budget Peace helps you see which paycheck covers which expense.
    </div>

    <button class="demo-btn demo-btn--primary" id="demo-continue" style="margin-top:var(--space-6);">
      Continue
    </button>
  `;

  // Unlock "Pay periods" concept for help system
  DemoEngine.unlockConcept('pay-periods');

  container.querySelector('#demo-continue').addEventListener('click', () => {
    DemoEngine.next();
  });
}

/**
 * Build 3 simplified pay periods for the demo.
 * Places the user's expense in the first period only.
 */
function buildSimplePeriods(isBiweekly, income, expense) {
  const today = new Date();
  const periods = [];

  for (let i = 0; i < 3; i++) {
    let start, end;

    if (isBiweekly) {
      // Create bi-weekly periods starting ~2 weeks before today
      start = new Date(today);
      start.setDate(start.getDate() - 14 + (i * 14));
      end = new Date(start);
      end.setDate(end.getDate() + 13);
    } else {
      // Monthly periods
      start = new Date(today.getFullYear(), today.getMonth() - 1 + i, 1);
      end = new Date(today.getFullYear(), today.getMonth() + i, 0); // last day of month
    }

    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];

    // Place the user's expense in the first period only
    const expenses = [];
    if (i === 0 && expense) {
      expenses.push({ name: expense.name, amount: expense.amount, isUser: true });
    }

    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

    periods.push({
      start: startStr,
      end: endStr,
      income: income,
      expenses: expenses,
      leftover: income - totalExpenses,
    });
  }

  return periods;
}


// ============================================================
// Step 5 — Meaning
// Philosophy screen. Calm, spacious, intentional.
// CTAs: Start for real, Replay, Review concepts.
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
        <a href="/" class="demo-btn demo-btn--primary" style="text-decoration:none;">
          Start for real
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

  container.querySelector('#demo-replay').addEventListener('click', () => {
    DemoEngine.reset();
  });

  container.querySelector('#demo-review').addEventListener('click', () => {
    HelpSystem.open();
  });
}


// ---- Section 4: Help System ---------------------------------
// Progressive concept review panel.

const HelpSystem = (() => {
  // Concept definitions — content shown when reviewing
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

  /** Open the help panel and render unlocked concepts. */
  function open() {
    const overlay = document.getElementById('demo-help-overlay');
    const panel = document.getElementById('demo-help-panel');
    const unlocked = DemoEngine.getCompletedConcepts();

    renderCards(panel, unlocked);

    overlay.classList.add('is-open');
    panel.classList.add('is-open');

    // Close on overlay click
    overlay.onclick = close;
  }

  /** Close the help panel. */
  function close() {
    document.getElementById('demo-help-overlay').classList.remove('is-open');
    document.getElementById('demo-help-panel').classList.remove('is-open');
  }

  /** Render the concept card list. */
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

    // Wire close button
    panel.querySelector('#help-close').addEventListener('click', close);

    // Wire concept cards to show detail
    panel.querySelectorAll('.demo-help-card').forEach(card => {
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => {
        const id = card.dataset.concept;
        renderDetail(panel, id);
      });
    });
  }

  /** Render a single concept detail view in the panel. */
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


// ---- Section 5: Boot ----------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  DemoEngine.init();
});
