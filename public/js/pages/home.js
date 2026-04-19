// ============================================================
// Home — Financial Health Dashboard
// ============================================================

let _healthData    = null; // { scenario, periods, expenses, goals, cards, banks }
let _healthHorizon = parseInt(localStorage.getItem('bp_health_horizon')) || 6; // persisted
let _homePeriodOffset  = 0;    // 0=current, 1=next, 2=period after; >2 → navigate to pay-period
let _homeViewIdx       = 0;    // actual period index of the currently displayed period
let _periodItems       = [];   // cached for bill card click handlers
let _recurringExpenses = [];   // cached for overview-row click handlers
let _homePdSort        = 'amount-desc';
let _homePdSearch      = '';
let _homePdReorder     = false;

Router.register('home', async () => {
  _homePeriodOffset = 0;
  document.getElementById('page-title').textContent = 'Home';
  setActivePage('home');
  showBottomNav(true);
  showFab(true);
  setupSpeedDial();

  document.getElementById('main-content').innerHTML = `
    <div class="page">
      <div class="text-muted text-sm text-center" style="padding:64px 0;">Loading…</div>
    </div>`;

  try {
    const [scenario, periods, expenses, goals, cards, banks] = await Promise.all([
      Store.get('scenario'),
      Store.get('periods'),
      Store.get('expenses'),
      Store.get('goals'),
      Store.get('cards').catch(() => []),
      Store.get('banks').catch(() => []),
    ]);

    _healthData = { scenario, periods, expenses, goals, cards, banks };
    renderHealth(_healthHorizon);
  } catch (err) {
    console.error(err);
    document.getElementById('main-content').innerHTML = `
      <div class="page text-center" style="padding-top:64px;">
        <p class="text-muted text-sm">Failed to load.</p>
        <button class="btn btn--ghost" style="margin-top:var(--space-3);" onclick="Router.navigate('home')">Try Again</button>
      </div>`;
  }
});

// ---- Render ------------------------------------------------

function renderHealth(months) {
  if (!_healthData) return;
  _healthHorizon = months;

  const { scenario, periods, expenses, goals = [], cards = [], banks = [] } = _healthData;

  function expBankMeta(e) {
    const card = e.cardId ? cards.find(c => c.cardId === e.cardId) : null;
    const bank = card?.bankId ? banks.find(b => b.bankId === card.bankId) : null;
    if (!bank && !card) return '';
    const dot = bank ? `<span style="width:5px;height:5px;border-radius:50%;background:${bank.color || '#6B7280'};display:inline-block;flex-shrink:0;margin-right:3px;vertical-align:middle;"></span>` : '';
    const parts = [bank ? esc(bank.name) : '', card ? `${esc(card.name)} ···· ${esc(card.lastFour)}` : ''].filter(Boolean).join(' · ');
    return `<div class="period-bill-card__note" style="font-size:11px;">${dot}${parts}</div>`;
  }
  const today = effectiveToday();

  // Filter expenses: exclude expired and not-yet-started for monthly overview calculations
  const liveExpenses = expenses.filter(e => {
    if (e.endDate && e.endDate < today) return false;
    const activeFrom = e.recurrence === 'recurring'
      ? (e.recurrenceStartDate || '1970-01-01')
      : (e.startDate || '1970-01-01');
    return activeFrom <= today;
  });

  // Monthly structure
  const monthlyIncome = scenario.cadence === 'biweekly' ? scenario.income * 2 : scenario.income;
  const monthlyBills  = calcMonthlyExp(liveExpenses, today);
  const monthlyLeft   = Math.round((monthlyIncome - monthlyBills) * 100) / 100;
  const monthlyLeftColor = monthlyLeft < 0 ? 'var(--color-danger)' : 'var(--color-accent)';

  // Financial health over horizon
  const healthIncome    = Math.round(monthlyIncome * months * 100) / 100;
  const healthBills     = Math.round(monthlyBills * months * 100) / 100;
  const healthRemaining = Math.round(monthlyLeft * months * 100) / 100;
  const healthRemColor  = healthRemaining < 0 ? 'var(--color-danger)' : 'var(--color-accent)';

  // Current period shortcut — prefer most recent past period over first future period
  const currentPeriod = periods.find(p => today >= p.startDate && today <= p.endDate)
    || [...periods].reverse().find(p => p.endDate <= today)
    || periods[0];

  // Period nav: find base index and apply offset
  let _periodBaseIdx = periods.findIndex(p => today >= p.startDate && today <= p.endDate);
  if (_periodBaseIdx === -1) {
    _periodBaseIdx = 0;
    for (let i = periods.length - 1; i >= 0; i--) {
      if (periods[i].endDate <= today) { _periodBaseIdx = i; break; }
    }
  }
  const _viewIdx    = Math.max(0, Math.min(_periodBaseIdx + _homePeriodOffset, periods.length - 1));
  _homeViewIdx = _viewIdx;
  const viewPeriod  = periods[_viewIdx] || currentPeriod;
  const periodCardTitle = _homePeriodOffset === 0 ? 'Current Pay Period'
                        : _homePeriodOffset === 1 ? 'Next Pay Period'
                        : 'Upcoming Pay Period';
  const canGoBack   = _homePeriodOffset > 0;

  let currentPeriodCard = '';
  if (viewPeriod) {
    const pd = calcPeriodExp(expenses, viewPeriod, scenario.cadence);
    const remColor = pd.remaining < 0 ? 'color:var(--color-danger)' : '';
    const spendPct = viewPeriod.income > 0
      ? Math.min(100, Math.round((pd.total / viewPeriod.income) * 100)) : 0;
    _periodItems = getPeriodItems(expenses, viewPeriod, scenario.cadence);
    currentPeriodCard = `
      <div class="dash-section home-section-period">
        <div class="period-nav">
          <button class="period-nav__arrow" id="home-period-prev" ${canGoBack ? '' : 'disabled'}>&#8592;</button>
          <div class="period-nav__center">
            <span class="period-nav__label">${fmtRange(viewPeriod)}</span>
            <span class="period-nav__payday">${fmtPayday(viewPeriod.startDate, today)}</span>
          </div>
          <button class="period-nav__arrow" id="home-period-next">&#8594;</button>
        </div>
        <div class="card period-shortcut-card" id="period-shortcut" style="cursor:pointer;padding:var(--space-3) var(--space-4);">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:var(--space-3);">
            <div>
              <div class="card-header" style="margin-bottom:2px;">${periodCardTitle}</div>
              <div class="text-muted text-sm">${fmtRange(viewPeriod)}</div>
            </div>
            <div style="text-align:right;">
              <div class="text-muted text-sm">Left</div>
              <div class="period-remaining" style="font-weight:var(--font-weight-bold);font-size:var(--font-size-lg);letter-spacing:-0.02em;${remColor};">${money(pd.remaining)}</div>
            </div>
          </div>
          <div class="period-detail">
            <div class="period-detail__metrics">
              <div class="period-detail__metric">
                <span class="period-detail__label">Income</span>
                <span class="period-detail__value">${money(viewPeriod.income)}</span>
              </div>
              <div class="period-detail__metric">
                <span class="period-detail__label">Expenses</span>
                <span class="period-detail__value">${money(pd.total)}</span>
              </div>
            </div>
            <div class="period-detail__bar-track">
              <div class="period-detail__bar-fill" style="width:${spendPct}%"></div>
            </div>
            <div class="period-detail__bar-label">${spendPct}% of income spent</div>
            <div id="home-pd-bills" onclick="event.stopPropagation()"></div>
          </div>
          <div class="period-shortcut__action" style="margin-top:var(--space-2);">Review pay period →</div>
        </div>
      </div>`;
  }

  // Recurring expenses for structural view (live only — excludes expired/future-dated)
  const recurringActive = liveExpenses.filter(e =>
    e.recurrence === 'recurring' &&
    (!e.recurrenceStartDate || e.recurrenceStartDate <= today)
  );
  _recurringExpenses = recurringActive;

  document.getElementById('main-content').innerHTML = `
    <div class="page home-page">

      <div class="home-welcome">
        <div class="home-welcome__heading">
          Welcome back.
          <span class="plan-badge plan-badge--${Plans.getTier() === 'pro' ? 'pro' : 'basic'}">${Plans.getTier() === 'pro' ? 'Pro' : 'Basic'} Plan</span>
        </div>
        <div class="home-welcome__sub">Here's where your budget stands right now. &middot; ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</div>
      </div>

      <div class="home-mode-switch" aria-label="Home view switch">
        <button class="home-mode-switch__btn is-active" type="button">Financial Health</button>
        <button class="home-mode-switch__btn" id="go-pay-period" type="button">Current Pay Period</button>
      </div>

      <!-- Desktop 3-column shell: transparent on mobile via display:contents -->
      <div class="home-desktop-grid">

        <!-- LEFT utility column: Notes · Horizon · Structure -->
        <div class="home-col-left">

          ${notesCardHtml('home')}

          <div class="dash-section home-section-health">
            <div class="rail-title">Financial Health</div>
            ${Plans.canUse('financialHealth') ? `
            <div class="card home-card--side health-card">
              <div class="health-card__toggle" id="health-card-toggle">
                <div class="card-header" style="margin:0;">3 / 6 / 12 month horizon</div>
                <span class="health-card__chevron" id="health-card-chevron">&#9662;</span>
              </div>
              <div id="health-card-body">
                <div class="home-supporting-copy">
                  If nothing changes, this is what your current financial structure looks like over the selected horizon.
                </div>

                <div class="health-toolbar">
                  <div class="health-horizon-label">${months} month horizon</div>
                  <div class="horizon-selector">
                    <button class="horizon-btn ${months === 3  ? 'is-active' : ''}" data-months="3">3 mo</button>
                    <button class="horizon-btn ${months === 6  ? 'is-active' : ''}" data-months="6">6 mo</button>
                    <button class="horizon-btn ${months === 12 ? 'is-active' : ''}" data-months="12">12 mo</button>
                  </div>
                </div>

                <div class="proj-grid home-proj-grid">
                  <div class="proj-tile">
                    <div class="proj-tile__label">Income</div>
                    <div class="proj-tile__value">${money(healthIncome)}</div>
                  </div>
                  <div class="proj-tile">
                    <div class="proj-tile__label">Obligations</div>
                    <div class="proj-tile__value">${money(healthBills)}</div>
                  </div>
                  <div class="proj-tile">
                    <div class="proj-tile__label">Remaining</div>
                    <div class="proj-tile__value" style="color:${healthRemColor};">${money(healthRemaining)}</div>
                  </div>
                </div>
              </div>
            </div>
            ` : `
            <div class="card home-card--side" style="text-align:center;padding:var(--space-5) var(--space-4);">
              <div class="card-header">Financial Health</div>
              <p class="text-muted text-sm" style="margin:var(--space-2) 0 var(--space-4);">Financial health projections are available on Budget Peace Pro.</p>
              <button class="btn btn--primary" id="health-upgrade">Upgrade to Pro</button>
            </div>
            `}
          </div>

          <div class="dash-section home-section-structure">
            <div class="card home-card--center">
              <div class="health-card__toggle" id="structure-card-toggle">
                <div class="card-header" style="margin:0;">Your Financial Structure</div>
                <span class="health-card__chevron" id="structure-card-chevron">&#9662;</span>
              </div>
              <div id="structure-card-body">
                <div class="home-supporting-copy">
                  Based on your currently active expenses only. Upcoming or future-dated expenses are not included until their start date.
                </div>

                <div class="metric-grid home-metric-grid">
                  <div class="metric-tile">
                    <div class="metric-tile__label">Monthly income</div>
                    <div class="metric-tile__value">${money(monthlyIncome)}</div>
                  </div>
                  <div class="metric-tile">
                    <div class="metric-tile__label">Monthly bills</div>
                    <div class="metric-tile__value">${money(monthlyBills)}</div>
                  </div>
                  <div class="metric-tile">
                    <div class="metric-tile__label">Monthly leftover</div>
                    <div class="metric-tile__value" style="color:${monthlyLeftColor};">${money(monthlyLeft)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div><!-- /.home-col-left -->

        <!-- CENTER: Current Pay Period -->
        <div class="home-col-center">
          ${currentPeriodCard}
        </div><!-- /.home-col-center -->

        <!-- RIGHT: Monthly Expenses + Goals -->
        <div class="home-col-right">

          <div class="dash-section home-section-bills">
            <div class="rail-title">Recurring Bills</div>
            <div class="card home-card--side">
              <div class="bills-toggle" id="bills-card-toggle">
                <div class="card-header" style="margin:0;">Recurring Bills</div>
                <span class="bills-chevron" id="bills-card-chevron">&#9662;</span>
              </div>
              <div id="bills-card-body">
                <div class="bills-internal-title">Monthly Expenses</div>
                <div class="home-supporting-copy" style="margin-top:var(--space-1);margin-bottom:var(--space-3);">
                  Your baseline monthly obligations, including due dates.
                </div>
                ${buildMonthlyBills(recurringActive)}
              </div>
            </div>
          </div>

          <div class="dash-section home-section-goals">
            <div class="rail-title">Goals</div>
            ${buildHomeGoalsCard(goals)}
          </div>

        </div><!-- /.home-col-right -->

      </div><!-- /.home-desktop-grid -->

    </div>`;

  mountNotesWidget('home', scenario.scenarioId, scenario.notes);
  renderHomePdBills();

  document.querySelectorAll('.horizon-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const months = Number(btn.dataset.months);
      localStorage.setItem('bp_health_horizon', months);
      renderHealth(months);
    });
  });

  document.getElementById('structure-card-toggle')?.addEventListener('click', () => {
    const body = document.getElementById('structure-card-body');
    const chev = document.getElementById('structure-card-chevron');
    if (!body || !chev) return;
    const isHidden = body.classList.toggle('is-hidden');
    chev.innerHTML = isHidden ? '&#9656;' : '&#9662;';
    localStorage.setItem('bp_collapse_structure', isHidden ? '1' : '0');
  });

  document.getElementById('health-card-toggle')?.addEventListener('click', () => {
    const body = document.getElementById('health-card-body');
    const chev = document.getElementById('health-card-chevron');
    if (!body || !chev) return;
    const isHidden = body.classList.toggle('is-hidden');
    chev.innerHTML = isHidden ? '&#9656;' : '&#9662;';
    localStorage.setItem('bp_collapse_health', isHidden ? '1' : '0');
  });

  // Structure: collapsed by default on desktop; restore from localStorage on mobile
  if (window.innerWidth >= 1200) {
    if (localStorage.getItem('bp_collapse_structure') !== '0') {
      document.getElementById('structure-card-body')?.classList.add('is-hidden');
      const chev = document.getElementById('structure-card-chevron');
      if (chev) chev.innerHTML = '&#9656;';
    }
  } else if (localStorage.getItem('bp_collapse_structure') === '1') {
    document.getElementById('structure-card-body')?.classList.add('is-hidden');
    const chev = document.getElementById('structure-card-chevron');
    if (chev) chev.innerHTML = '&#9656;';
  }
  if (localStorage.getItem('bp_collapse_health') === '1') {
    document.getElementById('health-card-body')?.classList.add('is-hidden');
    const chev = document.getElementById('health-card-chevron');
    if (chev) chev.innerHTML = '&#9656;';
  }
  if (window.innerWidth < 1200 && localStorage.getItem('bp_collapse_bills') === '1') {
    document.getElementById('bills-card-body')?.classList.add('is-hidden');
    const chev = document.getElementById('bills-card-chevron');
    if (chev) chev.innerHTML = '&#9656;';
  }

  document.getElementById('health-upgrade')?.addEventListener('click', () => Plans.showUpgradeModal(Plans.UPGRADE_CONTEXT.financialHealth));
  document.getElementById('home-goals-card')?.addEventListener('click', () => Router.navigate('goals'));
  document.getElementById('go-pay-period')?.addEventListener('click', () => Router.navigate('pay-period', { idx: _homeViewIdx }));
  document.getElementById('period-shortcut')?.addEventListener('click', () => Router.navigate('pay-period', { idx: _homeViewIdx }));

  document.getElementById('home-period-prev')?.addEventListener('click', e => {
    e.stopPropagation();
    if (_homePeriodOffset > 0) {
      _homePeriodOffset--;
      _homePdSearch = '';
      _homePdReorder = false;
      renderHealth(_healthHorizon);
    }
  });
  document.getElementById('home-period-next')?.addEventListener('click', e => {
    e.stopPropagation();
    if (_homePeriodOffset >= 2) {
      Router.navigate('pay-period', { idx: _homeViewIdx });
    } else {
      _homePeriodOffset++;
      _homePdSearch = '';
      _homePdReorder = false;
      renderHealth(_healthHorizon);
    }
  });

  document.getElementById('bills-expand')?.addEventListener('click', () => {
    const hidden = document.getElementById('bills-hidden');
    const btn    = document.getElementById('bills-expand');
    if (!hidden || !btn) return;
    const isOpen = hidden.style.display !== 'none';
    hidden.style.display = isOpen ? 'none' : 'block';
    const count = hidden.querySelectorAll('.overview-row').length;
    btn.innerHTML = isOpen ? `View ${count} more ▼` : 'Show less ▲';
  });

  document.getElementById('bills-card-toggle')?.addEventListener('click', () => {
    if (window.innerWidth >= 1200) return;
    const body = document.getElementById('bills-card-body');
    const chev = document.getElementById('bills-card-chevron');
    if (!body || !chev) return;
    const isHidden = body.classList.toggle('is-hidden');
    chev.innerHTML = isHidden ? '&#9656;' : '&#9662;';
    localStorage.setItem('bp_collapse_bills', isHidden ? '1' : '0');
  });

  // Monthly bills overview-row click handlers
  document.querySelectorAll('.bills-rows-scroll .overview-row[data-expid]').forEach(row => {
    row.addEventListener('click', () => {
      const exp = _recurringExpenses.find(e => e.expenseId === row.dataset.expid);
      if (exp) openBillDetailModal(exp, homeRefresh);
    });
  });
}

// ---- Builders ----------------------------------------------

const BILLS_PREVIEW = 3;

function buildMonthlyBills(recurring) {
  if (!recurring.length) {
    return `<p class="text-muted text-sm text-center" style="padding:var(--space-3) 0;">No recurring bills yet.</p>`;
  }

  recurring = recurring.slice().sort((a, b) => calcMonthlyAmt(b) - calcMonthlyAmt(a));

  const buildRow = e => {
    const amt = calcMonthlyAmt(e);
    return `
      <div class="overview-row" data-expid="${e.expenseId}" style="cursor:pointer;">
        <div style="flex:1;min-width:0;">
          <span class="overview-row__name">${esc(e.name)}</span>
          ${(() => { const _a = getEffectiveAllocation(e); const _s = _a === 'split' ? 'Split across both' : _a === 'first' ? '1st paycheck' : _a === 'second' ? '2nd paycheck' : null; return _s ? `<div class="overview-row__sub">${_s}</div>` : e.dueDay && (!e.allocationMethod || e.allocationMethod === 'due-date') ? `<div class="overview-row__sub">Due ${e.dueDay}</div>` : ''; })()}
        </div>
        <span class="overview-row__amount">${money(amt)}<span style="font-size:10px;color:var(--color-text-secondary);">/mo</span></span>
      </div>`;
  };

  const shown  = recurring.slice(0, BILLS_PREVIEW);
  const hidden = recurring.slice(BILLS_PREVIEW);
  const total  = Math.round(recurring.reduce((s, e) => s + calcMonthlyAmt(e), 0) * 100) / 100;

  const hiddenHtml = hidden.length ? `
    <div id="bills-hidden" style="display:none; border-top:1px solid var(--color-border);">
      ${hidden.map(buildRow).join('')}
    </div>
    <button class="breakdown-toggle" id="bills-expand" style="margin-top:var(--space-1);">
      View ${hidden.length} more ▼
    </button>` : '';

  return `
    <div class="bills-rows-scroll">
      ${shown.map(buildRow).join('')}
      ${hiddenHtml}
    </div>
    <div class="monthly-bills-total">
      <span class="monthly-bills-total__label">Total monthly bills</span>
      <span class="monthly-bills-total__value">${money(total)}</span>
    </div>`;
}

function buildHomeGoalsCard(goals) {
  if (!goals || !goals.length) {
    return `
      <div class="card home-card--side home-goals-card" id="home-goals-card" style="cursor:pointer;">
        <div class="home-goals-empty">
          <div class="home-goals-empty__text">No goals yet</div>
          <div class="home-goals-empty__hint">Tap to set your first target.</div>
        </div>
      </div>`;
  }
  const gFmt = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const sorted = goals.slice().sort((a, b) => a.targetDate.localeCompare(b.targetDate));
  return `
    <div class="card home-card--side home-goals-card" id="home-goals-card" style="cursor:pointer;">
      ${sorted.map(g => {
        const pct = g.targetAmount > 0
          ? Math.min(100, Math.round((g.currentSaved || 0) / g.targetAmount * 100))
          : 0;
        return `
          <div class="home-goal-item">
            <div class="home-goal-item__header">
              <span class="home-goal-item__name">${esc(g.name)}</span>
              <span class="home-goal-item__pct">${pct}%</span>
            </div>
            <div class="home-goal-item__bar-track">
              <div class="home-goal-item__bar-fill" style="width:${pct}%"></div>
            </div>
            <div class="home-goal-item__meta">${gFmt(g.currentSaved || 0)} / ${gFmt(g.targetAmount)}</div>
          </div>`;
      }).join('')}
    </div>`;
}

// ---- Math --------------------------------------------------
// ---- Home Period Bills (search / sort / reorder) -----------

const HOME_PD_PREVIEW = 5;

function sortHomePdItems(arr) {
  const { cards = [], banks = [] } = _healthData || {};
  const s = arr.slice();
  switch (_homePdSort) {
    case 'amount-desc': return s.sort((a, b) => b.periodAmount - a.periodAmount);
    case 'amount-asc':  return s.sort((a, b) => a.periodAmount - b.periodAmount);
    case 'by-bank': return s.sort((a, b) => {
      const cA = a.cardId ? cards.find(c => c.cardId === a.cardId) : null;
      const bA = cA?.bankId ? banks.find(b => b.bankId === cA.bankId) : null;
      const cB = b.cardId ? cards.find(c => c.cardId === b.cardId) : null;
      const bB = cB?.bankId ? banks.find(b => b.bankId === cB.bankId) : null;
      return (bA?.name || '\uffff').localeCompare(bB?.name || '\uffff') || a.name.localeCompare(b.name);
    });
    case 'by-card': return s.sort((a, b) => {
      const cA = a.cardId ? cards.find(c => c.cardId === a.cardId) : null;
      const cB = b.cardId ? cards.find(c => c.cardId === b.cardId) : null;
      return (cA?.name || '\uffff').localeCompare(cB?.name || '\uffff') || a.name.localeCompare(b.name);
    });
    case 'manual': return s.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    default: return s;
  }
}

function applyHomePdSearch(arr) {
  const q = _homePdSearch.toLowerCase().trim();
  if (!q) return arr;
  const { cards = [], banks = [] } = _healthData || {};
  return arr.filter(e => {
    const name = (e.name || '').toLowerCase();
    const card = e.cardId ? cards.find(c => c.cardId === e.cardId) : null;
    const bank = card?.bankId ? banks.find(b => b.bankId === card.bankId) : null;
    const cardName = (card?.name || '').toLowerCase();
    const bankName = (bank?.name || '').toLowerCase();
    return name.includes(q) || cardName.includes(q) || bankName.includes(q) || String(e.amount).includes(q);
  });
}

function renderHomePdBills() {
  const container = document.getElementById('home-pd-bills');
  if (!container) return;
  if (!_periodItems.length) { container.innerHTML = ''; return; }

  const { cards = [], banks = [] } = _healthData || {};

  function itemMeta(e) {
    const card = e.cardId ? cards.find(c => c.cardId === e.cardId) : null;
    const bank = card?.bankId ? banks.find(b => b.bankId === card.bankId) : null;
    if (!bank && !card) return '';
    const dot = bank ? `<span style="width:5px;height:5px;border-radius:50%;background:${bank.color || '#6B7280'};display:inline-block;flex-shrink:0;margin-right:3px;vertical-align:middle;"></span>` : '';
    const parts = [bank ? esc(bank.name) : '', card ? `${esc(card.name)} ···· ${esc(card.lastFour)}` : ''].filter(Boolean).join(' · ');
    return `<div class="period-bill-card__note" style="font-size:11px;">${dot}${parts}</div>`;
  }

  let items = sortHomePdItems(_periodItems);
  if (!_homePdReorder) items = applyHomePdSearch(items);

  const q = _homePdSearch.trim();

  const controlsHtml = _homePdReorder ? `
    <div class="exp-sort-bar">
      <span class="text-muted text-sm">Drag to reorder. Tap Done to save.</span>
      <button class="btn btn--primary" id="home-pd-reorder-done" style="font-size:12px;padding:5px 14px;">Done</button>
    </div>` : `
    <div style="display:flex;justify-content:flex-end;margin-bottom:var(--space-2);">
      <div class="exp-search-wrap">
        <svg class="exp-search-icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input class="exp-search-input" id="home-pd-search" type="search" placeholder="Search…" value="${esc(_homePdSearch)}" />
      </div>
    </div>
    <div class="exp-sort-bar">
      <span class="text-muted text-sm">Bills this period</span>
      <div class="exp-sort-ctrl">
        <select class="exp-sort-select" id="home-pd-sort">
          <option value="amount-desc" ${_homePdSort === 'amount-desc' ? 'selected' : ''}>Highest</option>
          <option value="amount-asc"  ${_homePdSort === 'amount-asc'  ? 'selected' : ''}>Lowest</option>
          <option value="by-bank"     ${_homePdSort === 'by-bank'     ? 'selected' : ''}>By Bank</option>
          <option value="by-card"     ${_homePdSort === 'by-card'     ? 'selected' : ''}>By Card</option>
          <option value="manual"      ${_homePdSort === 'manual'      ? 'selected' : ''}>My Order</option>
        </select>
        <button class="exp-reorder-btn" id="home-pd-reorder-btn" type="button">≡ Reorder</button>
      </div>
    </div>`;

  let billsHtml = '';
  if (!items.length) {
    billsHtml = q
      ? `<p class="text-muted text-sm text-center" style="padding:var(--space-3) 0;">No results for &ldquo;${esc(q)}&rdquo;.</p>`
      : `<p class="text-muted text-sm text-center" style="padding:var(--space-3) 0;">No expenses this period.</p>`;
  } else {
    const buildCard = (it, idx) => `
      <div class="period-bill-card home-pd-bill-card" data-home-bill-idx="${idx}" data-expense-id="${it.expenseId}">
        <div>
          <span class="period-bill-card__name">${esc(it.name)}</span>
          ${it.note ? `<div class="period-bill-card__note">${it.note}</div>` : it.dueDay && (!it.allocationMethod || it.allocationMethod === 'due-date') ? `<div class="period-bill-card__note">Due ${it.dueDay}</div>` : ''}
          ${itemMeta(it)}
        </div>
        <span class="period-bill-card__amount">${money(it.periodAmount)}</span>
      </div>`;

    if (_homePdReorder) {
      billsHtml = `<div id="home-pd-reorder-list">${items.map(buildCard).join('')}</div>`;
    } else {
      const shown  = items.slice(0, HOME_PD_PREVIEW);
      const hidden = items.slice(HOME_PD_PREVIEW);
      billsHtml = shown.map(buildCard).join('');
      if (hidden.length) {
        billsHtml += `
          <div id="home-pd-more" style="display:none;">${hidden.map((it, i) => buildCard(it, HOME_PD_PREVIEW + i)).join('')}</div>
          <button class="breakdown-toggle" id="home-pd-expand" style="margin-top:var(--space-2);">View ${hidden.length} more ▼</button>`;
      }
    }
  }

  container.innerHTML = `
    <div class="period-bills-preview" style="margin-top:var(--space-3);">
      ${controlsHtml}
      ${billsHtml}
    </div>`;

  // Wire events
  document.getElementById('home-pd-search')?.addEventListener('input', ev => {
    ev.stopPropagation();
    const cursor = ev.target.selectionStart;
    _homePdSearch = ev.target.value;
    renderHomePdBills();
    const el = document.getElementById('home-pd-search');
    if (el) { el.focus(); el.setSelectionRange(cursor, cursor); }
  });

  document.getElementById('home-pd-sort')?.addEventListener('change', ev => {
    ev.stopPropagation();
    _homePdSort = ev.target.value;
    renderHomePdBills();
  });

  document.getElementById('home-pd-reorder-btn')?.addEventListener('click', ev => {
    ev.stopPropagation();
    _homePdReorder = true;
    _homePdSort = 'manual';
    renderHomePdBills();
    const list = document.getElementById('home-pd-reorder-list');
    if (list && typeof Sortable !== 'undefined') {
      new Sortable(list, {
        animation:  150,
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        draggable: '.home-pd-bill-card',
      });
    }
  });

  document.getElementById('home-pd-reorder-done')?.addEventListener('click', async ev => {
    ev.stopPropagation();
    const list = document.getElementById('home-pd-reorder-list');
    const orderItems = list
      ? Array.from(list.querySelectorAll('[data-expense-id]')).map((el, i) => ({
          expenseId: el.dataset.expenseId,
          sortOrder: (i + 1) * 1000,
        }))
      : [];
    if (_healthData) {
      orderItems.forEach(({ expenseId, sortOrder }) => {
        const e = _healthData.expenses.find(x => x.expenseId === expenseId);
        if (e) e.sortOrder = sortOrder;
      });
    }
    _homePdReorder = false;
    renderHomePdBills();
    if (!orderItems.length) return;
    try {
      await authFetch(`/api/expenses/${userId()}/order`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ items: orderItems }),
      });
      Store.invalidate('expenses');
      if (_healthData) _healthData.expenses = await Store.get('expenses');
      _periodItems = getPeriodItems(_healthData.expenses, _healthData.periods[_homeViewIdx], _healthData.scenario.cadence);
      renderHomePdBills();
    } catch (err) {
      console.error('Failed to save expense order:', err);
    }
  });

  document.getElementById('home-pd-expand')?.addEventListener('click', ev => {
    ev.stopPropagation();
    const more = document.getElementById('home-pd-more');
    const btn  = document.getElementById('home-pd-expand');
    if (!more || !btn) return;
    const isOpen = more.style.display !== 'none';
    more.style.display = isOpen ? 'none' : 'block';
    const count = more.querySelectorAll('.home-pd-bill-card').length;
    btn.innerHTML = isOpen ? `View ${count} more ▼` : 'Show less ▲';
  });

  document.querySelectorAll('.home-pd-bill-card').forEach((card, i) => {
    card.addEventListener('click', ev => {
      ev.stopPropagation();
      if (_homePdReorder) return;
      const idx = Number(card.dataset.homeBillIdx);
      if (items[idx]) openBillDetailModal(items[idx], homeRefresh);
    });
  });
}

// calcMonthlyAmt() provided by shared.js

function calcMonthlyExp(expenses, today) {
  return Math.round(
    expenses
      .filter(e => e.recurrence === 'recurring' && (!e.recurrenceStartDate || e.recurrenceStartDate <= today))
      .reduce((s, e) => s + calcMonthlyAmt(e), 0)
    * 100) / 100;
}

function calcPeriodExp(expenses, period, cadence) {
  let total = 0;
  for (const e of expenses) {
    if (e.recurrence === 'once') {
      if (e.periodStart === period.startDate) total += e.amount;
    } else if (e.recurrence === 'recurring') {
      const startDate = e.recurrenceStartDate || '1970-01-01';
      if (startDate > period.endDate) continue;
      if (e.endDate && e.endDate < period.startDate) continue;
      const freq = e.recurrenceFrequency || 'monthly';
      // Monthly expense in biweekly or semimonthly period: route by allocation/dueDay
      if (freq === 'monthly' && (cadence === 'biweekly' || cadence === 'semimonthly')) {
        const alloc = getEffectiveAllocation(e);
        if (alloc === 'split') {
          total += e.amount / 2;
        } else if (alloc === 'first') {
          if (dueDayInPeriod(1, period)) total += e.amount;
        } else if (alloc === 'second') {
          if (dueDayInPeriod(16, period)) total += e.amount;
        } else {
          if (dueDayInPeriod(e.dueDay || 1, period)) total += e.amount;
        }
      } else if (freq === 'biweekly' && (cadence === 'biweekly' || cadence === 'semimonthly') && e.allocationMethod) {
        const alloc = getEffectiveAllocation(e);
        if (alloc === 'first') {
          if (dueDayInPeriod(1, period)) total += e.amount;
        } else if (alloc === 'second') {
          if (dueDayInPeriod(16, period)) total += e.amount;
        } else if (alloc === 'due-date') {
          if (dueDayInPeriod(e.dueDay || 1, period)) total += e.amount;
        } else {
          total += e.amount; // 'split' = every period
        }
      } else {
        total += e.amount * expMultiplier(freq, cadence);
      }
    }
  }
  total = Math.round(total * 100) / 100;
  return { total, remaining: Math.round((period.income - total) * 100) / 100 };
}

function getPeriodItems(expenses, period, cadence) {
  const items = [];
  for (const e of expenses) {
    if (e.recurrence === 'once') {
      if (e.periodStart === period.startDate) {
        items.push({ ...e, periodAmount: e.amount });
      }
    } else if (e.recurrence === 'recurring') {
      const startDate = e.recurrenceStartDate || '1970-01-01';
      if (startDate > period.endDate) continue;
      if (e.endDate && e.endDate < period.startDate) continue;
      const freq = e.recurrenceFrequency || 'monthly';
      if (freq === 'monthly' && (cadence === 'biweekly' || cadence === 'semimonthly')) {
        const alloc = getEffectiveAllocation(e);
        if (alloc === 'split') {
          items.push({ ...e, periodAmount: Math.round(e.amount / 2 * 100) / 100, note: 'Split across both' });
        } else if (alloc === 'first') {
          if (dueDayInPeriod(1, period)) items.push({ ...e, periodAmount: e.amount, note: '1st paycheck' });
        } else if (alloc === 'second') {
          if (dueDayInPeriod(16, period)) items.push({ ...e, periodAmount: e.amount, note: '2nd paycheck' });
        } else {
          if (dueDayInPeriod(e.dueDay || 1, period)) items.push({ ...e, periodAmount: e.amount });
        }
      } else if (freq === 'biweekly' && (cadence === 'biweekly' || cadence === 'semimonthly') && e.allocationMethod) {
        const alloc = getEffectiveAllocation(e);
        if (alloc === 'first') {
          if (dueDayInPeriod(1, period)) items.push({ ...e, periodAmount: e.amount, note: '1st paycheck' });
        } else if (alloc === 'second') {
          if (dueDayInPeriod(16, period)) items.push({ ...e, periodAmount: e.amount, note: '2nd paycheck' });
        } else if (alloc === 'due-date') {
          if (dueDayInPeriod(e.dueDay || 1, period)) items.push({ ...e, periodAmount: e.amount });
        } else {
          items.push({ ...e, periodAmount: e.amount }); // 'split' = every period
        }
      } else {
        items.push({ ...e, periodAmount: Math.round(e.amount * expMultiplier(freq, cadence) * 100) / 100 });
      }
    }
  }
  return items.sort((a, b) => b.periodAmount - a.periodAmount);
}

// ---- Note Detail Modal -------------------------------------

function openNoteDetailModal(note, scenarioId, notesArray, renderCallback) {
  const createdDate = note.createdAt
    ? new Date(note.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  document.body.insertAdjacentHTML('beforeend', `
    <div id="note-detail-overlay" class="sheet-overlay"></div>
    <div id="note-detail-sheet" class="sheet note-detail-sheet">
      <div class="sheet__handle"></div>
      <div class="note-detail__header">
        <div class="note-detail__title">Note</div>
        ${createdDate ? `<div class="note-detail__date">${createdDate}</div>` : ''}
      </div>
      <div class="note-detail__text" id="note-detail-text">${esc(note.text)}</div>
      <div class="note-detail__actions">
        <button class="btn btn--ghost" id="note-detail-edit">Edit</button>
        <button class="btn btn--ghost note-detail__delete-btn" id="note-detail-delete">Delete</button>
        <button class="btn btn--ghost" id="note-detail-close">Close</button>
      </div>
    </div>`);

  requestAnimationFrame(() => {
    document.getElementById('note-detail-overlay').classList.add('is-open');
    document.getElementById('note-detail-sheet').classList.add('is-open');
  });

  const closeModal = () => {
    const overlay = document.getElementById('note-detail-overlay');
    const sheet = document.getElementById('note-detail-sheet');
    if (!overlay || !sheet) return;
    overlay.classList.remove('is-open');
    sheet.classList.remove('is-open');
    sheet.addEventListener('transitionend', () => {
      overlay?.remove();
      sheet?.remove();
    }, { once: true });
  };

  document.getElementById('note-detail-overlay').addEventListener('click', closeModal);
  document.getElementById('note-detail-close').addEventListener('click', closeModal);

  document.getElementById('note-detail-edit').addEventListener('click', () => {
    const textEl = document.getElementById('note-detail-text');
    const actionsEl = document.querySelector('.note-detail__actions');
    textEl.innerHTML = `<textarea class="note-detail__textarea" id="note-edit-textarea" maxlength="500">${esc(note.text)}</textarea>`;
    actionsEl.innerHTML = `
      <button class="btn btn--primary" id="note-edit-save">Save</button>
      <button class="btn btn--ghost" id="note-edit-cancel">Cancel</button>`;

    const textarea = document.getElementById('note-edit-textarea');
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    document.getElementById('note-edit-cancel').addEventListener('click', closeModal);
    document.getElementById('note-edit-save').addEventListener('click', async () => {
      const newText = textarea.value.trim();
      if (!newText) { alert('Note cannot be empty.'); return; }
      if (newText.length > 500) { alert('Note must be 500 characters or less.'); return; }
      try {
        const res = await authFetch(`/api/scenarios/${encodeURIComponent(userId())}/${encodeURIComponent(scenarioId)}/notes/${encodeURIComponent(note.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: newText }),
        });
        if (!res.ok) throw new Error('Edit note failed');
        note.text = newText;
        Store.invalidate('scenario');
        if (typeof renderCallback === 'function') renderCallback();
        closeModal();
      } catch (err) {
        console.error(err);
        alert('Failed to update note.');
      }
    });
  });

  document.getElementById('note-detail-delete').addEventListener('click', async () => {
    if (!confirm('Delete this note? This can\'t be undone.')) return;
    try {
      const res = await authFetch(`/api/scenarios/${encodeURIComponent(userId())}/${encodeURIComponent(scenarioId)}/notes/${encodeURIComponent(note.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Delete note failed');
      const idx = notesArray.findIndex(n => n.id === note.id);
      if (idx !== -1) notesArray.splice(idx, 1);
      Store.invalidate('scenario');
      if (typeof renderCallback === 'function') renderCallback();
      closeModal();
    } catch (err) {
      console.error(err);
      alert('Failed to delete note.');
    }
  });
}

// ---- Bill Detail Modal -------------------------------------

async function openBillDetailModal(expense, refreshFn) {
  const cards = await Store.get('cards').catch(() => []);
  const card = cards.find(c => c.cardId === expense.cardId);

  const freqLabels = { weekly: 'Weekly', biweekly: 'Bi-weekly', monthly: 'Monthly' };
  const freq = expense.recurrenceFrequency || 'monthly';
  const isRecurring = expense.recurrence === 'recurring';
  const frequency = isRecurring ? (freqLabels[freq] || freq) : 'One time';

  let dueValue = '—';
  if (isRecurring && expense.dueDay) dueValue = `Day ${expense.dueDay}`;
  else if (!isRecurring && expense.dueDate) dueValue = expense.dueDate;

  const cardValue = card ? `${esc(card.name)} ••${esc(card.lastFour)}` : '— No card';
  const sinceValue = isRecurring && expense.recurrenceStartDate ? expense.recurrenceStartDate : null;

  const detailMoney = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  document.body.insertAdjacentHTML('beforeend', `
    <div id="bill-detail-overlay" class="sheet-overlay"></div>
    <div id="bill-detail-sheet" class="sheet bill-detail-sheet">
      <div class="sheet__handle"></div>
      <div class="bill-detail__title">${esc(expense.name)}</div>
      <div class="bill-detail__rows">
        <div class="bill-detail__row">
          <span class="bill-detail__label">Amount</span>
          <span class="bill-detail__value">${detailMoney(expense.amount)}</span>
        </div>
        <div class="bill-detail__row">
          <span class="bill-detail__label">Frequency</span>
          <span class="bill-detail__value">${frequency}</span>
        </div>
        <div class="bill-detail__row">
          <span class="bill-detail__label">Due</span>
          <span class="bill-detail__value">${dueValue}</span>
        </div>
        <div class="bill-detail__row">
          <span class="bill-detail__label">Card</span>
          <span class="bill-detail__value">${cardValue}</span>
        </div>
        ${sinceValue ? `
        <div class="bill-detail__row">
          <span class="bill-detail__label">Since</span>
          <span class="bill-detail__value">${sinceValue}</span>
        </div>` : ''}
        ${(expense.category || expense.notes || expense.tags) ? `
        <div class="bill-detail__separator"></div>
        ${expense.category ? `
        <div class="bill-detail__row">
          <span class="bill-detail__label">Category</span>
          <span class="bill-detail__value">${esc(expense.category)}</span>
        </div>` : ''}
        ${expense.notes ? `
        <div class="bill-detail__row">
          <span class="bill-detail__label">Notes</span>
          <span class="bill-detail__value" style="white-space:pre-wrap;word-break:break-word;">${esc(expense.notes)}</span>
        </div>` : ''}
        ${expense.tags ? `
        <div class="bill-detail__row">
          <span class="bill-detail__label">Tags</span>
          <span class="bill-detail__value">${esc(expense.tags)}</span>
        </div>` : ''}` : ''}
      </div>
      <div class="bill-detail__actions">
        <button class="btn btn--ghost" id="bill-detail-edit">Edit</button>
        <button class="btn btn--ghost bill-detail__delete-btn" id="bill-detail-delete">Delete</button>
        <button class="btn btn--ghost" id="bill-detail-close">Close</button>
      </div>
    </div>`);

  requestAnimationFrame(() => {
    document.getElementById('bill-detail-overlay').classList.add('is-open');
    document.getElementById('bill-detail-sheet').classList.add('is-open');
  });

  const closeModal = () => {
    const overlay = document.getElementById('bill-detail-overlay');
    const sheet = document.getElementById('bill-detail-sheet');
    if (!overlay || !sheet) return;
    overlay.classList.remove('is-open');
    sheet.classList.remove('is-open');
    sheet.addEventListener('transitionend', () => {
      overlay?.remove();
      sheet?.remove();
    }, { once: true });
  };

  document.getElementById('bill-detail-overlay').addEventListener('click', closeModal);
  document.getElementById('bill-detail-close').addEventListener('click', closeModal);

  document.getElementById('bill-detail-edit').addEventListener('click', () => {
    closeModal();
    setTimeout(() => openSheet(expense, refreshFn), 250);
  });

  document.getElementById('bill-detail-delete').addEventListener('click', async () => {
    if (!confirm(`Delete "${expense.name}"? This can't be undone.`)) return;
    try {
      const res = await authFetch(`/api/expenses/${userId()}/${expense.expenseId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      Store.invalidate('expenses');
      closeModal();
      if (typeof refreshFn === 'function') refreshFn();
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete. Please try again.');
    }
  });
}

// ---- Speed Dial --------------------------------------------

function setupSpeedDial() {
  const fab = document.getElementById('fab');
  fab.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="11" y1="4" x2="11" y2="18"/><line x1="4" y1="11" x2="18" y2="11"/></svg>';
  fab.onclick = () => openSheet(null, homeRefresh);
}

async function homeRefresh() {
  try {
    const [scenario, periods, expenses, goals, cards, banks] = await Promise.all([
      Store.get('scenario'),
      Store.get('periods'),
      Store.get('expenses'),
      Store.get('goals'),
      Store.get('cards').catch(() => []),
      Store.get('banks').catch(() => []),
    ]);
    if (_currentPage !== 'home') return;
    _healthData = { scenario, periods, expenses, goals, cards, banks };
    renderHealth(_healthHorizon);
    setupSpeedDial();
  } catch (err) {
    console.error('homeRefresh error:', err);
  }
}

// ---- Helpers -----------------------------------------------
// localToday(), esc(), fmtRange() provided by shared.js

function money(n) {
  const str = '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dot = str.lastIndexOf('.');
  return str.slice(0, dot) + '<span class="cents">' + str.slice(dot) + '</span>';
}
