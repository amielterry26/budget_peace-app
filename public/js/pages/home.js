// ============================================================
// Home — Financial Health Dashboard
// ============================================================

let _healthData    = null; // { user, periods, expenses }
let _healthHorizon = 6;    // default 6-month horizon

Router.register('home', async () => {
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
    const [scenario, periods, expenses] = await Promise.all([
      Store.get('scenario'),
      Store.get('periods'),
      Store.get('expenses'),
    ]);

    _healthData = { scenario, periods, expenses };
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

  const { scenario, periods, expenses } = _healthData;
  const today = effectiveToday();

  // Monthly structure
  const monthlyIncome = scenario.cadence === 'biweekly' ? scenario.income * 2 : scenario.income;
  const monthlyBills  = calcMonthlyExp(expenses, today);
  const monthlyLeft   = Math.round((monthlyIncome - monthlyBills) * 100) / 100;
  const monthlyLeftColor = monthlyLeft < 0 ? 'var(--color-danger)' : 'var(--color-accent)';

  // Financial health over horizon
  const healthIncome    = Math.round(monthlyIncome * months * 100) / 100;
  const healthBills     = Math.round(monthlyBills * months * 100) / 100;
  const healthRemaining = Math.round(monthlyLeft * months * 100) / 100;
  const healthRemColor  = healthRemaining < 0 ? 'var(--color-danger)' : 'var(--color-accent)';

  // Current period shortcut
  const currentPeriod = periods.find(p => today >= p.startDate && today <= p.endDate)
    || (today < periods[0]?.startDate ? periods[0] : periods[periods.length - 1]);

  let currentPeriodCard = '';
  if (currentPeriod) {
    const pd = calcPeriodExp(expenses, currentPeriod, scenario.cadence);
    const remColor = pd.remaining < 0 ? 'color:var(--color-danger)' : '';
    currentPeriodCard = `
      <div class="dash-section">
        <div class="card period-shortcut-card" id="period-shortcut" style="cursor:pointer;padding:var(--space-3) var(--space-4);">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:var(--space-3);">
            <div>
              <div class="card-header" style="margin-bottom:2px;">Current Pay Period</div>
              <div class="text-muted text-sm">${fmtRange(currentPeriod)}</div>
            </div>
            <div style="text-align:right;">
              <div class="text-muted text-sm">Left</div>
              <div style="font-weight:var(--font-weight-bold);font-size:var(--font-size-lg);letter-spacing:-0.02em;${remColor};">${money(pd.remaining)}</div>
            </div>
          </div>
          <div class="period-shortcut__action" style="margin-top:var(--space-2);">View pay period →</div>
        </div>
      </div>`;
  }

  // Recurring expenses for structural view
  const recurringActive = expenses.filter(e =>
    e.recurrence === 'recurring' &&
    (!e.recurrenceStartDate || e.recurrenceStartDate <= today)
  );

  document.getElementById('main-content').innerHTML = `
    <div class="page">

      <div class="home-mode-switch" aria-label="Home view switch">
        <button class="home-mode-switch__btn is-active" type="button">Financial Health</button>
        <button class="home-mode-switch__btn" id="go-pay-period" type="button">Current Pay Period</button>
      </div>

      ${currentPeriodCard}

      ${notesCardHtml('home')}

      <div class="dash-section">
        <div class="card">
          <div class="card-header">Your Financial Structure</div>
          <div class="home-supporting-copy">
            Based on your currently active expenses only. Upcoming or future-dated expenses are not included until their start date.
          </div>

          <div class="metric-grid">
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

          <div style="margin-top:var(--space-4);padding-top:var(--space-4);border-top:1px solid var(--color-border);">
            <div class="card-header" style="margin-bottom:4px;">Monthly Bills</div>
            <div class="home-supporting-copy" style="margin-bottom:var(--space-3);">
              The recurring things creating your current financial structure.
            </div>
            ${buildMonthlyBills(recurringActive)}
          </div>
        </div>
      </div>

      <div class="dash-section">
        <div class="card">
          <div class="card-header">Financial Health</div>
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

    </div>`;

  mountNotesWidget('home', scenario.scenarioId, scenario.notes);

  document.querySelectorAll('.horizon-btn').forEach(btn => {
    btn.addEventListener('click', () => renderHealth(Number(btn.dataset.months)));
  });

  document.getElementById('go-pay-period')?.addEventListener('click', () => Router.navigate('pay-period'));
  document.getElementById('period-shortcut')?.addEventListener('click', () => Router.navigate('pay-period'));

  document.getElementById('bills-expand')?.addEventListener('click', () => {
    const hidden = document.getElementById('bills-hidden');
    const btn    = document.getElementById('bills-expand');
    if (!hidden || !btn) return;
    const isOpen = hidden.style.display !== 'none';
    hidden.style.display = isOpen ? 'none' : 'block';
    const count = hidden.querySelectorAll('.overview-row').length;
    btn.innerHTML = isOpen ? `View ${count} more ▼` : 'Show less ▲';
  });
}

// ---- Builders ----------------------------------------------

const BILLS_PREVIEW = 3;

function buildMonthlyBills(recurring) {
  if (!recurring.length) {
    return `<p class="text-muted text-sm text-center" style="padding:var(--space-3) 0;">No recurring bills yet.</p>`;
  }

  recurring = recurring.slice().sort((a, b) => calcMonthlyAmt(b) - calcMonthlyAmt(a));

  const uniqueFreqs = [...new Set(recurring.map(e => e.recurrenceFrequency || 'monthly'))];
  const showFreq = uniqueFreqs.length > 1;

  const freqLabel = { weekly: 'weekly', biweekly: 'bi-weekly', monthly: 'monthly' };

  const buildRow = e => {
    const freq = e.recurrenceFrequency || 'monthly';
    const amt  = calcMonthlyAmt(e);
    return `
      <div class="overview-row">
        <span class="overview-row__name">${esc(e.name)}</span>
        ${showFreq ? `<span class="overview-row__freq">${freqLabel[freq] || freq}</span>` : ''}
        <span class="overview-row__amount">${money(amt)}<span style="font-size:10px;color:var(--color-text-secondary);">/mo</span></span>
      </div>`;
  };

  const shown  = recurring.slice(0, BILLS_PREVIEW);
  const hidden = recurring.slice(BILLS_PREVIEW);
  const total  = Math.round(recurring.reduce((s, e) => s + calcMonthlyAmt(e), 0) * 100) / 100;

  const hiddenHtml = hidden.length ? `
    <div id="bills-hidden" style="display:none;">
      ${hidden.map(buildRow).join('')}
    </div>
    <button class="breakdown-toggle" id="bills-expand" style="margin-top:var(--space-1);">
      View ${hidden.length} more ▼
    </button>` : '';

  return `
    ${shown.map(buildRow).join('')}
    ${hiddenHtml}
    <div class="monthly-bills-total">
      <span class="monthly-bills-total__label">Total monthly bills</span>
      <span class="monthly-bills-total__value">${money(total)}</span>
    </div>`;
}

// ---- Math --------------------------------------------------

function calcMonthlyAmt(expense) {
  const freq = expense.recurrenceFrequency || 'monthly';
  const mult = freq === 'weekly' ? 4 : freq === 'biweekly' ? 2 : 1;
  return Math.round(expense.amount * mult * 100) / 100;
}

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
      const freq = e.recurrenceFrequency || 'monthly';
      // Monthly expense in biweekly period: only count if dueDay falls in this period
      if (freq === 'monthly' && cadence === 'biweekly') {
        if (dueDayInPeriod(e.dueDay || 1, period)) total += e.amount;
      } else {
        total += e.amount * expMultiplier(freq, cadence);
      }
    }
  }
  total = Math.round(total * 100) / 100;
  return { total, remaining: Math.round((period.income - total) * 100) / 100 };
}

// ---- Speed Dial --------------------------------------------

function setupSpeedDial() {
  const fab = document.getElementById('fab');
  fab.textContent = '+';
  fab.onclick = () => openSheet(null, homeRefresh);
}

async function homeRefresh() {
  try {
    const [scenario, periods, expenses] = await Promise.all([
      Store.get('scenario'),
      Store.get('periods'),
      Store.get('expenses'),
    ]);
    if (_currentPage !== 'home') return;
    _healthData = { scenario, periods, expenses };
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
