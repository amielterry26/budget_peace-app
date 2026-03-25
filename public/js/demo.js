// ============================================================
// Budget Peace — Guided Demo Mode
// Loaded after all page scripts, before app.js.
// ============================================================

const DEMO_OWNER_ID = 'demo-user';

// ---- State --------------------------------------------------

let _demoData = {};
let _demoActions = { expensesAdded: 0, expensesDeleted: 0, scenariosCreated: 0 };
let _demoNextId = 100;
let _demoUserName = '';
let _guidedMode = false;
let _coachSlide = 0;
let _coachActionCallback = null;
let _coachExpectedEvent = null;
let _coachRAF = null;
let _coachResizeObs = null;
let _coachMutationObs = null;
let _cachedTargetRect = null;

const DEMO_LIMITS = {
  expensesAdded: 1,
  expensesDeleted: 1,
  scenariosCreated: 1,
};

const DEMO_MSG_LIMIT = "You've explored the demo. Unlock Budget Peace to keep building your real budget.";
const DEMO_MSG_VIEW_ONLY = 'This section is viewable in demo mode. Unlock Budget Peace to make changes.';

const DEMO_HIDDEN_PAGES = ['goals', 'cards', 'notes', 'settings', 'scenarios'];

// ---- Date Helpers -------------------------------------------

function _demoRecentFriday() {
  const d = new Date();
  const day = d.getDay();
  const diff = (day + 2) % 7;
  d.setDate(d.getDate() - diff - 14);
  return d.toISOString().split('T')[0];
}

function _demoMonthStart() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-01';
}

function _demoToday() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function _demoGenPeriods(firstPayDate, income, count, cadence) {
  const periods = [];
  let start = new Date(firstPayDate + 'T00:00:00Z');
  for (let i = 0; i < count; i++) {
    let end;
    if (cadence === 'monthly') {
      end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
    } else {
      end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 13);
    }
    periods.push({
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
      income: income,
    });
    if (cadence === 'monthly') {
      start = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    } else {
      start = new Date(end);
      start.setUTCDate(start.getUTCDate() + 1);
    }
  }
  return periods;
}

// ---- Starter Expenses ---------------------------------------

function _buildStarterExpenses(cadence) {
  const isBiweekly = cadence === 'biweekly';
  return [
    {
      expenseId: 'e1', userId: DEMO_OWNER_ID, scenarioId: 'main',
      name: 'Rent', amount: 1450, recurrence: 'recurring',
      recurrenceFrequency: 'monthly', dueDay: 1,
      recurrenceStartDate: '2025-01-01',
    },
    {
      expenseId: 'e2', userId: DEMO_OWNER_ID, scenarioId: 'main',
      name: 'Groceries', amount: isBiweekly ? 125 : 250, recurrence: 'recurring',
      recurrenceFrequency: isBiweekly ? 'biweekly' : 'monthly',
      ...(isBiweekly ? {} : { dueDay: 15 }),
      recurrenceStartDate: '2025-01-01',
    },
    {
      expenseId: 'e3', userId: DEMO_OWNER_ID, scenarioId: 'main',
      name: 'Phone', amount: 45, recurrence: 'recurring',
      recurrenceFrequency: 'monthly', dueDay: 22,
      recurrenceStartDate: '2025-01-22',
    },
    {
      expenseId: 'e4', userId: DEMO_OWNER_ID, scenarioId: 'main',
      name: 'Internet', amount: 65, recurrence: 'recurring',
      recurrenceFrequency: 'monthly', dueDay: 5,
      recurrenceStartDate: '2025-01-05',
    },
    {
      expenseId: 'e5', userId: DEMO_OWNER_ID, scenarioId: 'main',
      name: 'Transportation', amount: isBiweekly ? 50 : 100, recurrence: 'recurring',
      recurrenceFrequency: isBiweekly ? 'biweekly' : 'monthly',
      ...(isBiweekly ? {} : { dueDay: 10 }),
      recurrenceStartDate: '2025-01-01',
    },
  ];
}

// ---- Prebuilt Scenario Templates ----------------------------

function _buildPrebuiltScenarios(userIncome) {
  return {
    'new-job-offer': {
      scenarioId: 'new-job-offer',
      name: 'New Job Offer',
      description: `Higher salary — $${(userIncome + 600).toLocaleString()}/check`,
      income: userIncome + 600,
      cadence: 'biweekly',
      durationMonths: 2,
      expenses: [
        { name: 'Rent', amount: 1450, recurrence: 'recurring', recurrenceFrequency: 'monthly', dueDay: 1, recurrenceStartDate: '2025-01-01' },
        { name: 'Groceries', amount: 150, recurrence: 'recurring', recurrenceFrequency: 'biweekly', recurrenceStartDate: '2025-01-01' },
        { name: 'Phone', amount: 45, recurrence: 'recurring', recurrenceFrequency: 'monthly', dueDay: 22, recurrenceStartDate: '2025-01-22' },
        { name: 'Internet', amount: 65, recurrence: 'recurring', recurrenceFrequency: 'monthly', dueDay: 5, recurrenceStartDate: '2025-01-05' },
        { name: 'Transportation', amount: 50, recurrence: 'recurring', recurrenceFrequency: 'biweekly', recurrenceStartDate: '2025-01-01' },
        { name: 'Parking', amount: 80, recurrence: 'recurring', recurrenceFrequency: 'monthly', dueDay: 1, recurrenceStartDate: '2025-01-01' },
      ],
    },
    'move-to-new-city': {
      scenarioId: 'move-to-new-city',
      name: 'Move to a New City',
      description: 'Same job, different city — rent $1,850/mo',
      income: userIncome,
      cadence: 'biweekly',
      durationMonths: 2,
      expenses: [
        { name: 'Rent', amount: 1850, recurrence: 'recurring', recurrenceFrequency: 'monthly', dueDay: 1, recurrenceStartDate: '2025-01-01' },
        { name: 'Groceries', amount: 100, recurrence: 'recurring', recurrenceFrequency: 'biweekly', recurrenceStartDate: '2025-01-01' },
        { name: 'Phone', amount: 45, recurrence: 'recurring', recurrenceFrequency: 'monthly', dueDay: 22, recurrenceStartDate: '2025-01-22' },
        { name: 'Internet', amount: 55, recurrence: 'recurring', recurrenceFrequency: 'monthly', dueDay: 5, recurrenceStartDate: '2025-01-05' },
        { name: 'Transportation', amount: 40, recurrence: 'recurring', recurrenceFrequency: 'biweekly', recurrenceStartDate: '2025-01-01' },
      ],
    },
  };
}

// ============================================================
// STEP 0 — Entry
// ============================================================

function initDemoGuided() {
  _demoMode = true;
  _guidedMode = true;
  _ownerId = DEMO_OWNER_ID;
  _serverToday = _demoToday();
  _activeScenario = 'main';

  // Hide chrome during onboarding
  showBottomNav(false);
  showFab(false);
  document.querySelector('.top-bar').style.display = 'none';

  renderOnboardingCard();
}

// ============================================================
// STEP 1 — Personalized Onboarding
// ============================================================

function renderOnboardingCard() {
  document.getElementById('main-content').innerHTML = `
    <div class="demo-onboarding">
      <div class="demo-onboarding__card card">
        <div class="demo-onboarding__logo">Budget <span>Peace</span></div>
        <h1 class="demo-onboarding__title">Build your demo budget</h1>
        <p class="demo-onboarding__sub">This quick demo builds a sample budget using your numbers so you can feel how Budget Peace works.</p>

        <div class="stack--4" style="margin-top:var(--space-6);">
          <div class="form-group">
            <label class="form-label" for="demo-name">Your name</label>
            <input class="form-input" id="demo-name" type="text" placeholder="e.g. Alex" maxlength="30" autocomplete="given-name" />
          </div>

          <div class="form-group">
            <label class="form-label">How often do you get paid?</label>
            <div class="option-grid option-grid--2">
              <div class="option-card is-selected" data-cadence="biweekly" id="demo-cad-bw">
                <div class="option-card__title">Every 2 weeks</div>
                <div class="option-card__sub">Bi-weekly paycheck</div>
              </div>
              <div class="option-card" data-cadence="monthly" id="demo-cad-mo">
                <div class="option-card__title">Monthly</div>
                <div class="option-card__sub">Once a month</div>
              </div>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="demo-income">Net income per paycheck</label>
            <div class="ob-input-money">
              <input class="form-input" id="demo-income" type="number" placeholder="0.00" min="0" step="0.01" style="padding-left:28px;" inputmode="decimal" />
            </div>
          </div>

          <button class="btn btn--primary btn--full" id="demo-submit" style="margin-top:var(--space-4);">Build My Budget</button>
        </div>
      </div>
    </div>`;

  // Cadence toggle
  let selectedCadence = 'biweekly';
  document.querySelectorAll('.demo-onboarding .option-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.demo-onboarding .option-card').forEach(c => c.classList.remove('is-selected'));
      card.classList.add('is-selected');
      selectedCadence = card.dataset.cadence;
    });
  });

  // Submit
  document.getElementById('demo-submit').addEventListener('click', () => {
    const name = document.getElementById('demo-name').value.trim();
    const income = parseFloat(document.getElementById('demo-income').value);

    if (!name) { alert('Please enter your name.'); return; }
    if (!income || income <= 0) { alert('Please enter your income.'); return; }

    submitOnboarding({ name, cadence: selectedCadence, income });
  });
}

function submitOnboarding({ name, cadence, income }) {
  _demoUserName = name;
  const durationMonths = 2;

  const isBiweekly = cadence === 'biweekly';
  const firstPayDate = isBiweekly ? _demoRecentFriday() : _demoMonthStart();

  const scenario = {
    userId: DEMO_OWNER_ID,
    scenarioId: 'main',
    name: 'Main',
    cadence: cadence,
    income: income,
    firstPayDate: firstPayDate,
    durationMonths: durationMonths,
    isPrimary: true,
    notes: [],
  };

  _demoData = {
    user: { userId: DEMO_OWNER_ID, activeScenarioId: 'main' },
    scenarios: [scenario],
    expenses: _buildStarterExpenses(cadence),
    cards: [],
    goals: [],
    _prebuiltScenarios: _buildPrebuiltScenarios(income),
  };

  _overrideDemoStore();
  _overrideDemoFetch();
  _installDemoUIInterception();
  _overrideDemoGlobals();
  _hideDemoNavItems();

  // Show chrome
  document.querySelector('.top-bar').style.display = '';
  showBottomNav(true);

  initTimeTravelStrip();
  updateScenarioSelector();
  Router.init();

  // Start walkthrough after dashboard renders
  setTimeout(() => startCoachWalkthrough(), 600);
}

// ============================================================
// STEP 2 — Coach Walkthrough
// ============================================================

const COACH_STEPS = [
  {
    id: 'welcome',
    page: 'home',
    target: '.home-metric-grid',
    title: () => `Welcome, ${esc(_demoUserName)}!`,
    text: 'This is your budget dashboard — income, expenses, and what\'s left over each period.',
    advance: { type: 'button', label: 'Next' },
  },
  {
    id: 'add-expense',
    page: 'home',
    target: '#fab',
    title: () => 'Add a real expense',
    text: 'Tap the + button to add an expense — like your electric bill or a subscription.',
    advance: { type: 'action', event: 'expensesAdded' },
    spotlightClickThrough: true,
  },
  {
    id: 'leftover',
    page: 'home',
    target: '.metric-grid .metric-tile:nth-child(3)',
    title: () => 'Your leftover updated',
    text: 'See how that expense changed your leftover. Every dollar is accounted for.',
    advance: { type: 'button', label: 'Next' },
  },
  {
    id: 'pay-periods',
    page: 'pay-period',
    target: '.period-nav',
    title: () => 'Explore your pay periods',
    text: 'Each paycheck is a separate period. Use the arrows to see how expenses flow across pay periods.',
    advance: { type: 'button', label: 'Finish Tour' },
  },
];

function startCoachWalkthrough() {
  _coachSlide = 0;
  _guidedMode = true;
  showCoachSlide(0);
}

function showCoachSlide(index) {
  _coachSlide = index;
  const slide = COACH_STEPS[index];
  if (!slide) { endWalkthrough(); return; }

  // Remove previous coach elements
  _removeCoachOverlay();

  // Navigate to correct page if needed
  const { page } = Router.parseHash(location.hash);
  if (page !== slide.page) {
    Router.navigate(slide.page);
    // Wait for page to render before showing overlay
    setTimeout(() => _renderCoachOverlay(slide, index), 400);
  } else {
    setTimeout(() => _renderCoachOverlay(slide, index), 200);
  }
}

// ---- Dynamic positioning for coach overlay --------------------

function _positionCoachElements(targetEl) {
  const spotlight = document.getElementById('demo-coach-spotlight');
  const card = document.getElementById('demo-coach-card');
  const arrow = document.getElementById('demo-coach-arrow');
  if (!spotlight || !card || !targetEl) return;

  const rect = targetEl.getBoundingClientRect();
  const pad = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Spotlight
  spotlight.style.top = (rect.top - pad) + 'px';
  spotlight.style.left = (rect.left - pad) + 'px';
  spotlight.style.width = (rect.width + pad * 2) + 'px';
  spotlight.style.height = (rect.height + pad * 2) + 'px';

  // Card sizing
  const cardWidth = Math.min(320, vw - 32);
  card.style.width = cardWidth + 'px';

  // Above/below decision
  const spaceBelow = vh - rect.bottom;
  const spaceAbove = rect.top;
  const placeAbove = spaceAbove > spaceBelow && spaceAbove > 160;

  // Reset both directions before setting one
  card.style.top = '';
  card.style.bottom = '';
  card.classList.remove('demo-coach-card--above', 'demo-coach-card--below');

  if (placeAbove) {
    card.style.bottom = (vh - rect.top + pad + 16) + 'px';
    card.classList.add('demo-coach-card--above');
  } else {
    card.style.top = (rect.bottom + pad + 16) + 'px';
    card.classList.add('demo-coach-card--below');
  }

  // Horizontal: center on target, clamp to viewport
  const targetCenterX = rect.left + rect.width / 2;
  let cardLeft = targetCenterX - cardWidth / 2;
  cardLeft = Math.max(16, Math.min(cardLeft, vw - cardWidth - 16));
  card.style.left = cardLeft + 'px';

  // Arrow
  if (arrow) {
    arrow.style.top = '';
    arrow.style.bottom = '';
    arrow.className = placeAbove
      ? 'demo-coach-arrow demo-coach-arrow--down is-visible'
      : 'demo-coach-arrow demo-coach-arrow--up is-visible';
    const arrowLeft = Math.max(cardLeft + 20, Math.min(targetCenterX - 8, cardLeft + cardWidth - 36));
    arrow.style.left = arrowLeft + 'px';
    if (placeAbove) {
      arrow.style.bottom = (vh - rect.top + pad) + 'px';
    } else {
      arrow.style.top = (rect.bottom + pad) + 'px';
    }
  }
}

function _startPositionTracking(targetEl, targetSelector) {
  let _trackedEl = targetEl;

  // Reposition using current tracked element
  const reposition = () => _positionCoachElements(_trackedEl);

  // ResizeObserver on target + body
  if (typeof ResizeObserver !== 'undefined') {
    _coachResizeObs = new ResizeObserver(reposition);
    _coachResizeObs.observe(_trackedEl);
    _coachResizeObs.observe(document.body);
  }

  // Window resize (orientation changes, etc.)
  window.addEventListener('resize', reposition);
  // Store reference for cleanup
  _startPositionTracking._resizeHandler = reposition;

  // MutationObserver on main-content for DOM reflows
  const mainContent = document.getElementById('main-content');
  if (mainContent) {
    _coachMutationObs = new MutationObserver(reposition);
    _coachMutationObs.observe(mainContent, { childList: true, subtree: true });
  }

  // rAF polling — repositions on change, stops if target is removed from DOM
  _cachedTargetRect = null;
  function tick() {
    // Dead-node check: if element is detached, try to re-query
    if (!_trackedEl.isConnected) {
      const fresh = document.querySelector(targetSelector);
      if (fresh) {
        _trackedEl = fresh;
        // Re-observe with ResizeObserver if active
        if (_coachResizeObs) {
          _coachResizeObs.disconnect();
          _coachResizeObs.observe(_trackedEl);
          _coachResizeObs.observe(document.body);
        }
        reposition();
      } else {
        // Target gone and not re-queryable — stop tracking, hide overlay
        const spotlight = document.getElementById('demo-coach-spotlight');
        const card = document.getElementById('demo-coach-card');
        const arrow = document.getElementById('demo-coach-arrow');
        if (spotlight) spotlight.style.opacity = '0';
        if (card) card.style.opacity = '0';
        if (arrow) arrow.style.opacity = '0';
        _coachRAF = requestAnimationFrame(tick); // keep checking in case it returns
        return;
      }
    }

    const rect = _trackedEl.getBoundingClientRect();
    if (_cachedTargetRect &&
        (rect.top !== _cachedTargetRect.top ||
         rect.left !== _cachedTargetRect.left ||
         rect.width !== _cachedTargetRect.width ||
         rect.height !== _cachedTargetRect.height)) {
      reposition();
    }
    _cachedTargetRect = { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
    _coachRAF = requestAnimationFrame(tick);
  }
  _coachRAF = requestAnimationFrame(tick);
}

function _stopPositionTracking() {
  if (_coachResizeObs) { _coachResizeObs.disconnect(); _coachResizeObs = null; }
  if (_coachMutationObs) { _coachMutationObs.disconnect(); _coachMutationObs = null; }
  if (_startPositionTracking._resizeHandler) {
    window.removeEventListener('resize', _startPositionTracking._resizeHandler);
    _startPositionTracking._resizeHandler = null;
  }
  if (_coachRAF) { cancelAnimationFrame(_coachRAF); _coachRAF = null; }
  _cachedTargetRect = null;
}

// ---- Sheet open/close detection -------------------------------
// Hides the coach overlay while an expense/card/goal sheet is open,
// then restores + repositions when the sheet closes.

let _coachSheetObserver = null;

function _startSheetDetection() {
  let wasHidden = false;

  _coachSheetObserver = new MutationObserver(() => {
    const sheetOpen = !!document.querySelector('.sheet-overlay.is-open');

    if (sheetOpen && !wasHidden) {
      // Hide coach overlay while sheet is open
      wasHidden = true;
      const spotlight = document.getElementById('demo-coach-spotlight');
      const card = document.getElementById('demo-coach-card');
      const arrow = document.getElementById('demo-coach-arrow');
      if (spotlight) spotlight.style.opacity = '0';
      if (card) card.style.opacity = '0';
      if (arrow) arrow.style.opacity = '0';
    } else if (!sheetOpen && wasHidden) {
      // Sheet closed — restore and reposition
      wasHidden = false;
      const spotlight = document.getElementById('demo-coach-spotlight');
      const card = document.getElementById('demo-coach-card');
      const arrow = document.getElementById('demo-coach-arrow');
      if (spotlight) spotlight.style.opacity = '';
      if (card) card.style.opacity = '';
      if (arrow) arrow.style.opacity = '';
    }
  });

  _coachSheetObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['class'],
    subtree: true,
  });
}

function _stopSheetDetection() {
  if (_coachSheetObserver) { _coachSheetObserver.disconnect(); _coachSheetObserver = null; }
}

// ---- Coach overlay rendering ----------------------------------

function _renderCoachOverlay(slide, index) {
  const targetEl = document.querySelector(slide.target);

  // Build button / action hint HTML
  let buttonHtml = '';
  if (slide.advance.type === 'button') {
    buttonHtml = `<button class="btn btn--primary" id="demo-coach-btn" style="margin-top:var(--space-3);">${slide.advance.label}</button>`;
  } else {
    buttonHtml = `<div class="text-muted text-sm" style="margin-top:var(--space-2);">Complete the action to continue</div>`;
  }

  // --- Fallback: target not found → centered card, no spotlight ---
  if (!targetEl) {
    console.warn('Coach target not found:', slide.target);
    const card = document.createElement('div');
    card.id = 'demo-coach-card';
    card.className = 'demo-coach-card demo-coach-card--centered';
    card.innerHTML = `
      <div class="demo-coach-card__step">${index + 1} of ${COACH_STEPS.length}</div>
      <div class="demo-coach-card__title">${slide.title()}</div>
      <div class="demo-coach-card__text">${slide.text}</div>
      ${buttonHtml}`;
    document.body.appendChild(card);
    requestAnimationFrame(() => card.classList.add('is-visible'));
    if (slide.advance.type === 'button') {
      document.getElementById('demo-coach-btn').addEventListener('click', advanceCoach);
    }
    return;
  }

  // Create spotlight
  const spotlight = document.createElement('div');
  spotlight.id = 'demo-coach-spotlight';
  spotlight.className = 'demo-coach-spotlight';
  if (slide.spotlightClickThrough) {
    spotlight.style.pointerEvents = 'none';
  }
  document.body.appendChild(spotlight);

  // Create card
  const card = document.createElement('div');
  card.id = 'demo-coach-card';
  card.className = 'demo-coach-card';
  card.innerHTML = `
    <div class="demo-coach-card__step">${index + 1} of ${COACH_STEPS.length}</div>
    <div class="demo-coach-card__title">${slide.title()}</div>
    <div class="demo-coach-card__text">${slide.text}</div>
    ${buttonHtml}`;
  document.body.appendChild(card);

  // Create arrow
  const arrow = document.createElement('div');
  arrow.id = 'demo-coach-arrow';
  document.body.appendChild(arrow);

  // Initial position + start tracking
  _positionCoachElements(targetEl);
  _startPositionTracking(targetEl, slide.target);
  _startSheetDetection();

  // Animate in
  requestAnimationFrame(() => {
    spotlight.classList.add('is-visible');
    card.classList.add('is-visible');
    arrow.classList.add('is-visible');
  });

  // Button handler
  if (slide.advance.type === 'button') {
    document.getElementById('demo-coach-btn').addEventListener('click', advanceCoach);
  }

  // Action handler — set generic callback
  if (slide.advance.type === 'action') {
    _coachExpectedEvent = slide.advance.event;
    _coachActionCallback = () => {
      _coachActionCallback = null;
      _coachExpectedEvent = null;
      setTimeout(advanceCoach, 400);
    };
  }
}

function advanceCoach() {
  _removeCoachOverlay();
  const next = _coachSlide + 1;
  if (next >= COACH_STEPS.length) {
    endWalkthrough();
  } else {
    showCoachSlide(next);
  }
}

function _removeCoachOverlay() {
  _stopPositionTracking();
  _stopSheetDetection();
  document.getElementById('demo-coach-spotlight')?.remove();
  document.getElementById('demo-coach-card')?.remove();
  document.getElementById('demo-coach-arrow')?.remove();
  _coachActionCallback = null;
  _coachExpectedEvent = null;
}

function resetDemoWalkthrough() {
  _removeCoachOverlay();
  _guidedMode = true;
  _coachSlide = 0;
  _demoActions = { expensesAdded: 0, expensesDeleted: 0, scenariosCreated: 0 };

  // Remove completion card and suggestion strip if visible
  document.getElementById('demo-completion')?.remove();
  document.querySelector('.demo-suggestion')?.remove();
  _demoSuggestionShown = false;
  _demoShowSuggestionOnHome = false;

  // Navigate to home and restart
  Router.navigate('home');
  setTimeout(() => startCoachWalkthrough(), 600);
}

function endWalkthrough() {
  _guidedMode = false;
  _removeCoachOverlay();

  // Reset action counters so free roam gets fresh limits
  _demoActions = { expensesAdded: 0, expensesDeleted: 0, scenariosCreated: 0 };

  // Inject personalized banner
  _injectDemoBanner();

  // Show completion card
  _showCompletionCard();
}

function _showCompletionCard() {
  const content = document.getElementById('main-content');
  const existingPage = content.querySelector('.page');

  const completionHtml = `
    <div class="demo-completion card" id="demo-completion">
      <div style="text-align:center;">
        <div style="font-size:var(--font-size-xl);font-weight:var(--font-weight-bold);letter-spacing:-0.02em;margin-bottom:var(--space-2);">
          You're all set, ${esc(_demoUserName)}.
        </div>
        <div class="text-muted" style="font-size:var(--font-size-md);margin-bottom:var(--space-5);">
          Explore your budget, add expenses, and see how your money flows across pay periods.
        </div>
        <div style="display:flex;flex-direction:column;gap:var(--space-3);max-width:280px;margin:0 auto;">
          <button class="btn btn--primary btn--full" id="demo-continue">Continue Exploring</button>
          <a href="/landing#pricing" class="btn btn--ghost btn--full" style="text-decoration:none;text-align:center;">See Pricing</a>
        </div>
      </div>
    </div>`;

  if (existingPage) {
    existingPage.insertAdjacentHTML('afterbegin', completionHtml);
  } else {
    content.innerHTML = `<div class="page">${completionHtml}</div>`;
  }

  document.getElementById('demo-continue')?.addEventListener('click', () => {
    document.getElementById('demo-completion')?.remove();
    // Show suggestion strip on next home visit
    _demoShowSuggestionOnHome = true;
  });
}

// ============================================================
// STEP 3 — Free Roam
// ============================================================

let _demoShowSuggestionOnHome = false;
let _demoSuggestionShown = false;

function showDemoSuggestionStrip() {
  if (_demoSuggestionShown) return;
  _demoSuggestionShown = true;

  const existing = document.getElementById('demo-suggestion');
  if (existing) return;

  const strip = document.createElement('div');
  strip.id = 'demo-suggestion';
  strip.className = 'demo-suggestion';
  strip.innerHTML = `
    <span>Want to compare a different income?</span>
    <button class="demo-suggestion__btn" id="demo-suggestion-btn">Create a scenario →</button>
    <button class="demo-suggestion__close" id="demo-suggestion-close" aria-label="Dismiss">×</button>`;

  const main = document.getElementById('main-content');
  main.appendChild(strip);

  document.getElementById('demo-suggestion-btn').addEventListener('click', () => {
    strip.remove();
    openDemoScenarioPicker();
  });
  document.getElementById('demo-suggestion-close').addEventListener('click', () => {
    strip.remove();
  });
}

// ============================================================
// Store Override
// ============================================================

function _overrideDemoStore() {
  Store.get = async function(key) {
    if (key === 'user') return _demoData.user;
    if (key === 'expenses') return _demoData.expenses.filter(e => e.scenarioId === _activeScenario);
    if (key === 'scenario') {
      const sc = _demoData.scenarios.find(s => s.scenarioId === _activeScenario);
      return sc || _demoData.scenarios[0];
    }
    if (key === 'periods') {
      const sc = _demoData.scenarios.find(s => s.scenarioId === _activeScenario);
      if (sc) {
        // Compute period count from durationMonths and cadence
        const months = sc.durationMonths || 2;
        const count = sc.cadence === 'monthly' ? months : Math.ceil(months * 2.17);
        return _demoGenPeriods(sc.firstPayDate, sc.income, count, sc.cadence);
      }
      return [];
    }
    if (key === 'scenarios') return _demoData.scenarios;
    if (key === 'cards') return _demoData.cards;
    if (key === 'goals') return _demoData.goals;
    return [];
  };

  Store.set = function() {};
  Store.invalidate = function() {};
  Store.invalidateAll = function() {};
}

// ============================================================
// Fetch Intercept (safety net)
// ============================================================

function _overrideDemoFetch() {
  const _realFetch = window.fetch;
  window.fetch = function(url, opts) {
    if (!isDemoMode()) return _realFetch.apply(this, arguments);

    const method = (opts?.method || 'GET').toUpperCase();
    if (method === 'GET') return _realFetch.apply(this, arguments);

    // Mutating request in demo mode — block it
    showDemoPaywall('viewOnly');
    return Promise.resolve({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ error: 'Demo mode' }),
    });
  };
}

// ============================================================
// UI Interception
// ============================================================

const DEMO_LOCKED_SELECTORS = [
  '.goal-contribute-btn', '.goal-edit-btn', '.goal-delete-btn',
  '#edit-card-btn', '#del-card-btn', '.wallet-empty', '#add-card-tile',
  '.sc-rename-btn', '.sc-clear-btn', '.sc-promote-btn', '.sc-delete-btn',
  '#settings-save',
  '#np-add-btn', '.notes-item__edit', '.notes-item__del',
  '[id$="-notes-add-btn"]',
];

function _installDemoUIInterception() {
  document.addEventListener('click', (e) => {
    if (!isDemoMode()) return;

    for (const sel of DEMO_LOCKED_SELECTORS) {
      if (e.target.closest(sel)) {
        e.stopImmediatePropagation();
        e.preventDefault();
        showDemoPaywall('viewOnly');
        return;
      }
    }
  }, true);

  // Override FAB + handle hidden pages on route change
  const _origOnRouteChange = window.onRouteChange;
  window.onRouteChange = function(page) {
    if (_origOnRouteChange) _origOnRouteChange(page);
    if (!isDemoMode()) return;

    // During guided mode, restrict navigation
    if (_guidedMode && COACH_STEPS[_coachSlide]) {
      const allowedPage = COACH_STEPS[_coachSlide].page;
      if (page !== allowedPage) {
        setTimeout(() => Router.navigate(allowedPage), 0);
        return;
      }
    }

    // Suggestion strip on home
    if (page === 'home' && !_guidedMode && _demoShowSuggestionOnHome && !_demoSuggestionShown) {
      _demoShowSuggestionOnHome = false;
      setTimeout(showDemoSuggestionStrip, 800);
    }

    requestAnimationFrame(() => {
      const fab = document.getElementById('fab');
      if (!fab) return;
      if (page === 'goals' || page === 'cards') {
        fab.onclick = (e) => {
          e.stopPropagation();
          showDemoPaywall('viewOnly');
        };
      }
      if (page === 'scenarios') {
        fab.onclick = (e) => {
          e.stopPropagation();
          openDemoScenarioPicker();
        };
      }
    });
  };
}

function _renderLockedPage(page) {
  const pageNames = {
    goals: 'Goals', cards: 'Cards', notes: 'Notes',
    settings: 'Settings', scenarios: 'Scenarios',
  };
  const pageName = pageNames[page] || page;

  document.getElementById('page-title').textContent = pageName;
  showFab(false);

  document.getElementById('main-content').innerHTML = `
    <div class="page">
      <div class="demo-locked-card card" style="text-align:center;padding:var(--space-8) var(--space-5);">
        <div style="font-size:var(--font-size-lg);font-weight:var(--font-weight-bold);letter-spacing:-0.02em;margin-bottom:var(--space-3);">
          This section is available in Budget Peace Pro.
        </div>
        <div class="text-muted" style="font-size:var(--font-size-md);margin-bottom:var(--space-6);max-width:320px;margin-left:auto;margin-right:auto;">
          Unlock the full app to manage your ${pageName.toLowerCase()} and more.
        </div>
        <div style="display:flex;flex-direction:column;gap:var(--space-3);max-width:280px;margin:0 auto;">
          <button class="btn btn--primary btn--full" onclick="Router.navigate('home')">Back to Demo</button>
          <a href="/landing#pricing" class="btn btn--ghost btn--full" style="text-decoration:none;text-align:center;">See Pricing</a>
        </div>
      </div>
    </div>`;
}

// ============================================================
// Nav Hiding
// ============================================================

function _hideDemoNavItems() {
  // Mark hidden pages in all navs
  DEMO_HIDDEN_PAGES.forEach(page => {
    document.querySelectorAll(`[data-page="${page}"]`).forEach(el => {
      el.setAttribute('data-demo-hidden', '');
    });
    // Re-register route to show locked page instead of real page
    Router.register(page, () => _renderLockedPage(page));
  });
}

// ============================================================
// Global Function Overrides
// ============================================================

function _overrideDemoGlobals() {
  if (typeof fetchScenarioExpenses === 'function') {
    const _real = fetchScenarioExpenses;
    window.fetchScenarioExpenses = function(scenarioId) {
      if (!isDemoMode()) return _real(scenarioId);
      return Promise.resolve(_demoData.expenses.filter(e => e.scenarioId === scenarioId));
    };
  }

  if (typeof openNewScenarioSheet === 'function') {
    const _real = openNewScenarioSheet;
    window.openNewScenarioSheet = function() {
      if (!isDemoMode()) return _real();
      openDemoScenarioPicker();
    };
  }
}

// ============================================================
// Gate & Track
// ============================================================

function demoGate(action) {
  if (!isDemoMode()) return true;
  // During guided mode, always allow (walkthrough actions don't count)
  if (_guidedMode) return true;
  if (_demoActions[action] >= DEMO_LIMITS[action]) {
    showDemoPaywall('limit');
    return false;
  }
  return true;
}

function demoTrack(action) {
  if (!isDemoMode()) return;
  // During guided mode, don't count against limits
  if (_guidedMode) {
    // Notify coach if it's waiting for this action
    if (action === _coachExpectedEvent && _coachActionCallback) {
      _coachActionCallback();
    }
    return;
  }
  _demoActions[action]++;
}

// ============================================================
// Paywall Modal
// ============================================================

function showDemoPaywall(type) {
  document.getElementById('demo-paywall-overlay')?.remove();
  document.getElementById('demo-paywall')?.remove();

  const message = type === 'limit' ? DEMO_MSG_LIMIT : DEMO_MSG_VIEW_ONLY;

  document.body.insertAdjacentHTML('beforeend', `
    <div id="demo-paywall-overlay" class="sheet-overlay"></div>
    <div id="demo-paywall" class="sheet" style="max-width:420px;">
      <div class="sheet__handle"></div>
      <div style="text-align:center;padding:var(--space-5) 0 var(--space-2);">
        <div style="font-size:20px;font-weight:var(--font-weight-bold);letter-spacing:-0.02em;margin-bottom:var(--space-3);line-height:1.3;">
          ${type === 'limit' ? 'Demo limit reached' : 'View-only in demo'}
        </div>
        <div class="text-muted" style="font-size:var(--font-size-md);line-height:1.5;max-width:320px;margin:0 auto;">
          ${message}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:var(--space-3);padding:var(--space-5) 0 var(--space-2);">
        <a href="/landing#pricing" class="btn btn--primary btn--full" style="text-decoration:none;text-align:center;">
          See pricing
        </a>
        <button class="btn btn--ghost btn--full" id="demo-paywall-close">
          Keep exploring
        </button>
      </div>
    </div>`);

  requestAnimationFrame(() => {
    document.getElementById('demo-paywall-overlay').classList.add('is-open');
    document.getElementById('demo-paywall').classList.add('is-open');
  });

  const close = () => {
    document.getElementById('demo-paywall-overlay')?.classList.remove('is-open');
    const sheet = document.getElementById('demo-paywall');
    if (sheet) {
      sheet.classList.remove('is-open');
      sheet.addEventListener('transitionend', () => {
        document.getElementById('demo-paywall-overlay')?.remove();
        document.getElementById('demo-paywall')?.remove();
      }, { once: true });
    }
  };

  document.getElementById('demo-paywall-overlay').addEventListener('click', close);
  document.getElementById('demo-paywall-close').addEventListener('click', close);
}

// ============================================================
// Demo Scenario Picker
// ============================================================

function openDemoScenarioPicker() {
  if (!demoGate('scenariosCreated')) return;

  const templates = _demoData._prebuiltScenarios || {};
  const options = Object.values(templates).map(s => `
    <div class="card dsc-option" data-sid="${s.scenarioId}" style="padding:var(--space-3) var(--space-4);cursor:pointer;transition:box-shadow 0.15s;">
      <div style="font-weight:var(--font-weight-semi);margin-bottom:2px;">${s.name}</div>
      <div class="text-muted text-sm">${s.description}</div>
    </div>`).join('');

  document.body.insertAdjacentHTML('beforeend', `
    <div id="dsc-overlay" class="sheet-overlay"></div>
    <div id="dsc-sheet" class="sheet">
      <div class="sheet__handle"></div>
      <div class="sheet__title">Add a Scenario</div>
      <div class="text-muted text-sm" style="margin-bottom:var(--space-4);">
        Choose a pre-built scenario to compare against your current setup.
      </div>
      <div class="stack--3">${options}</div>
      <div style="padding-top:var(--space-4);">
        <button class="btn btn--ghost btn--full" id="dsc-cancel">Cancel</button>
      </div>
    </div>`);

  requestAnimationFrame(() => {
    document.getElementById('dsc-overlay').classList.add('is-open');
    document.getElementById('dsc-sheet').classList.add('is-open');
  });

  const closeSheet = () => {
    document.getElementById('dsc-overlay')?.classList.remove('is-open');
    const sheet = document.getElementById('dsc-sheet');
    if (sheet) {
      sheet.classList.remove('is-open');
      sheet.addEventListener('transitionend', () => {
        document.getElementById('dsc-overlay')?.remove();
        document.getElementById('dsc-sheet')?.remove();
      }, { once: true });
    }
  };

  document.getElementById('dsc-overlay').addEventListener('click', closeSheet);
  document.getElementById('dsc-cancel').addEventListener('click', closeSheet);

  document.querySelectorAll('.dsc-option').forEach(card => {
    card.addEventListener('click', () => {
      const template = templates[card.dataset.sid];
      if (!template) return;

      const payStart = _demoRecentFriday();
      const newScenario = {
        userId: DEMO_OWNER_ID,
        scenarioId: template.scenarioId,
        name: template.name,
        cadence: template.cadence,
        income: template.income,
        firstPayDate: payStart,
        durationMonths: template.durationMonths,
        isPrimary: false,
        notes: [],
      };

      _demoData.scenarios.push(newScenario);

      template.expenses.forEach(e => {
        _demoData.expenses.push({
          ...e,
          userId: DEMO_OWNER_ID,
          scenarioId: template.scenarioId,
          expenseId: 'de' + (_demoNextId++),
        });
      });

      demoTrack('scenariosCreated');
      closeSheet();

      _activeScenario = template.scenarioId;
      const { page, params } = Router.parseHash(location.hash);
      Router.render(page, params);
      updateScenarioSelector();
      Router.navigate('compare');
    });
  });
}

// ============================================================
// Demo Banner
// ============================================================

function _injectDemoBanner() {
  document.getElementById('demo-banner')?.remove();

  const banner = document.createElement('div');
  banner.id = 'demo-banner';
  banner.className = 'demo-banner';
  banner.innerHTML = `Welcome, ${esc(_demoUserName)} &middot; <a href="#" id="demo-restart-tour" style="color:var(--color-accent-dark);font-weight:600;text-decoration:underline;">Restart tour</a> &middot; <a href="/landing#pricing" style="color:var(--color-accent-dark);font-weight:600;text-decoration:underline;">Unlock full version</a>`;
  const topBar = document.querySelector('.top-bar');
  if (topBar) topBar.insertAdjacentElement('afterend', banner);
  document.body.classList.add('has-demo-banner');

  document.getElementById('demo-restart-tour')?.addEventListener('click', (e) => {
    e.preventDefault();
    resetDemoWalkthrough();
  });
}
