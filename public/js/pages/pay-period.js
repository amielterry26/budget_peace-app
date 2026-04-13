// ============================================================
// Pay Period — Operational Budget View
// ============================================================

let _pd    = null; // { periods, expenses, cards, banks }
let _pdIdx = 0;

Router.register('pay-period', async (params) => {
  document.getElementById('page-title').textContent = 'Pay Period';
  setActivePage('pay-period');
  showBottomNav(true);
  showFab(true);
  setupPdFab();

  document.getElementById('main-content').innerHTML = `
    <div class="page">
      <div class="text-muted text-sm text-center" style="padding:64px 0;">Loading…</div>
    </div>`;

  try {
    const [periods, expenses, cards, banks] = await Promise.all([
      Store.get('periods'),
      Store.get('expenses'),
      Store.get('cards').catch(() => []),
      Store.get('banks').catch(() => []),
    ]);

    if (!periods.length) {
      document.getElementById('main-content').innerHTML = `
        <div class="page text-center" style="padding-top:64px;">
          <p class="text-muted text-sm">No budget periods found.</p>
        </div>`;
      return;
    }

    _pd = { periods, expenses, cards, banks };

    let idx;
    if (params.idx != null) {
      idx = Number(params.idx);
    } else {
      const today = effectiveToday();
      idx = periods.findIndex(p => today >= p.startDate && today <= p.endDate);
      if (idx === -1) {
        // Prefer most recent past period over first future period
        const pastIdx = [...periods].map((p, i) => [p, i]).reverse().find(([p]) => p.endDate <= today);
        idx = pastIdx ? pastIdx[1] : 0;
      }
    }

    renderPeriod(idx);
  } catch (err) {
    console.error(err);
    document.getElementById('main-content').innerHTML = `
      <div class="page text-center" style="padding-top:64px;">
        <p class="text-muted text-sm">Failed to load.</p>
        <button class="btn btn--ghost" style="margin-top:var(--space-3);" onclick="Router.navigate('pay-period')">Try Again</button>
      </div>`;
  }
});

// ---- Render ------------------------------------------------

function renderPeriod(idx) {
  if (!_pd) return;
  _pdIdx = idx;

  const { periods, expenses, cards = [], banks = [] } = _pd;
  const period = periods[idx];

  const pd      = calcPdExpenses(expenses, period);
  const remColor = pd.remaining < 0 ? 'color:var(--color-danger)' : '';
  const isOver   = pd.remaining < 0;
  const spendPct = period.income > 0
    ? Math.min(100, Math.round(pd.total / period.income * 100))
    : 0;

  document.getElementById('main-content').innerHTML = `
    <div class="page">

      <!-- Mode switch -->
      <div class="home-mode-switch" aria-label="Home view switch">
        <button class="home-mode-switch__btn" id="go-financial-health" type="button">Financial Health</button>
        <button class="home-mode-switch__btn is-active" type="button">Current Pay Period</button>
      </div>

      <!-- Period nav — unified pill -->
      <div class="period-nav">
        <button class="period-nav__arrow" id="prev-period"
          ${idx === 0 ? 'disabled' : ''}>&#8592;</button>
        <span class="period-nav__label">${fmtRange(period)}</span>
        <button class="period-nav__arrow" id="next-period"
          ${idx === periods.length - 1 ? 'disabled' : ''}>&#8594;</button>
      </div>

      <!-- Period card -->
      <div class="card">
        <div class="pd-remaining-tile${isOver ? ' pd-remaining-tile--danger' : ''}">
          <div class="hero-label">Left this period</div>
          <div class="dash-remaining" style="${remColor}">${pdMoney(pd.remaining)}</div>
        </div>
        <div class="divider"></div>
        <div class="stat-row">
          <span class="stat-row__label">Income</span>
          <span class="stat-row__value">${pdMoney(period.income)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-row__label">Expenses</span>
          <span class="stat-row__value">${pdMoney(pd.total)}</span>
        </div>
        <div class="spend-bar">
          <div class="spend-bar__fill${isOver ? ' is-over' : ''}" style="width:${spendPct}%;"></div>
        </div>
        <div class="spend-bar__label">${spendPct}% of income spent</div>
        <button class="breakdown-toggle" id="breakdown-toggle">
          Hide breakdown <span id="bd-chevron">▲</span>
        </button>
        <div id="period-breakdown" class="period-breakdown">
          <div class="divider" style="margin-top:var(--space-3);"></div>
          ${buildPdBreakdown(pd, cards, banks)}
          <button class="btn btn--ghost btn--full"
            style="margin-top:var(--space-4);font-size:var(--font-size-sm);" id="view-all-btn">
            View all budgets →
          </button>
        </div>
      </div>

    </div>`;

  document.getElementById('go-financial-health').addEventListener('click', () => Router.navigate('home'));
  document.getElementById('prev-period').addEventListener('click', () => renderPeriod(idx - 1));
  document.getElementById('next-period').addEventListener('click', () => renderPeriod(idx + 1));

  document.getElementById('breakdown-toggle').addEventListener('click', () => {
    const bd      = document.getElementById('period-breakdown');
    const chevron = document.getElementById('bd-chevron');
    const btn     = document.getElementById('breakdown-toggle');
    const isOpen  = bd.style.display !== 'none';
    bd.style.display    = isOpen ? 'none' : 'block';
    chevron.textContent = isOpen ? '▼' : '▲';
    btn.childNodes[0].textContent = isOpen ? 'See full breakdown ' : 'Hide breakdown ';
  });

  document.getElementById('view-all-btn')?.addEventListener('click', () => Router.navigate('budgets'));

  // Bill mini-card click handlers
  document.querySelectorAll('.pd-bill-card').forEach(card => {
    card.addEventListener('click', () => {
      const idx = Number(card.dataset.pdBillIdx);
      if (_pdBreakdownItems[idx]) openBillDetailModal(_pdBreakdownItems[idx], payPeriodRefresh);
    });
  });
}

// ---- Builders ----------------------------------------------

let _pdBreakdownItems = []; // cached for bill card click handlers

function buildPdBreakdown(pd, cards = [], banks = []) {
  let html = '';
  _pdBreakdownItems = [];

  function expMeta(e) {
    const card = e.cardId ? cards.find(c => c.cardId === e.cardId) : null;
    const bank = card?.bankId ? banks.find(b => b.bankId === card.bankId) : null;
    if (!bank && !card) return '';
    const dot = bank ? `<span style="width:6px;height:6px;border-radius:50%;background:${bank.color || '#6B7280'};display:inline-block;flex-shrink:0;margin-right:3px;vertical-align:middle;"></span>` : '';
    const bankLabel = bank ? esc(bank.name) : '';
    const cardLabel = card ? `${esc(card.name)} ···· ${esc(card.lastFour)}` : '';
    const parts = [bankLabel, cardLabel].filter(Boolean).join(' · ');
    return `<div class="period-bill-card__note">${dot}${parts}</div>`;
  }

  if (pd.recurringItems.length) {
    html += `<div class="section-title" style="margin:var(--space-3) 0 var(--space-1);">Recurring</div>`;
    html += pd.recurringItems.map(e => {
      const idx = _pdBreakdownItems.length;
      _pdBreakdownItems.push(e);
      return `
      <div class="period-bill-card pd-bill-card" data-pd-bill-idx="${idx}">
        <div>
          <span class="period-bill-card__name">${esc(e.name)}</span>
          ${e.note ? `<div class="period-bill-card__note">${esc(e.note)}</div>` : e.dueDay && (!e.allocationMethod || e.allocationMethod === 'due-date') ? `<div class="period-bill-card__note">Due ${e.dueDay}</div>` : ''}
          ${expMeta(e)}
        </div>
        <span class="period-bill-card__amount">${pdMoney(e.displayAmount)}</span>
      </div>`;
    }).join('');
  }

  if (pd.onceItems.length) {
    html += `<div class="section-title" style="margin:var(--space-4) 0 var(--space-1);">One-time</div>`;
    html += pd.onceItems.map(e => {
      const idx = _pdBreakdownItems.length;
      _pdBreakdownItems.push(e);
      return `
      <div class="period-bill-card pd-bill-card" data-pd-bill-idx="${idx}">
        <div>
          <span class="period-bill-card__name">${esc(e.name)}</span>
          ${e.dueDate ? `<div class="period-bill-card__note">${e.dueDate}</div>` : ''}
          ${expMeta(e)}
        </div>
        <span class="period-bill-card__amount">${pdMoney(e.amount)}</span>
      </div>`;
    }).join('');
  }

  if (!pd.recurringItems.length && !pd.onceItems.length) {
    html = `<p class="text-muted text-sm text-center" style="padding:var(--space-4) 0;">No expenses this period.</p>`;
  }

  return html;
}

// ---- Math --------------------------------------------------

function calcPdExpenses(expenses, period) {
  const cadence = inferCadence(period);

  let total = 0;
  const recurringItems = [];
  const onceItems      = [];

  for (const e of expenses) {
    if (e.recurrence === 'once') {
      if (e.periodStart && e.periodStart === period.startDate) {
        total += e.amount;
        onceItems.push({ ...e, displayAmount: e.amount, note: null });
      }
    } else if (e.recurrence === 'recurring') {
      const startDate = e.recurrenceStartDate || '1970-01-01';
      if (startDate > period.endDate) continue;
      if (e.endDate && e.endDate < period.startDate) continue;

      const freq = e.recurrenceFrequency || 'monthly';
      let mult;
      let isSplit = false;
      // Monthly expense in biweekly period: route by allocation method
      if (freq === 'monthly' && cadence === 'biweekly') {
        const alloc = getEffectiveAllocation(e);
        if (alloc === 'split') {
          isSplit = true;
          mult = 0.5;
        } else if (alloc === 'first') {
          mult = dueDayInPeriod(1, period) ? 1 : 0;
        } else if (alloc === 'second') {
          mult = dueDayInPeriod(16, period) ? 1 : 0;
        } else {
          // 'due-date': full amount if dueDay falls in this period
          mult = dueDayInPeriod(e.dueDay || 1, period) ? 1 : 0;
        }
      } else if (freq === 'biweekly' && cadence === 'biweekly' && e.allocationMethod) {
        // Biweekly expense with explicit paycheck allocation
        const alloc = getEffectiveAllocation(e);
        if (alloc === 'first') {
          mult = dueDayInPeriod(1, period) ? 1 : 0;
        } else if (alloc === 'second') {
          mult = dueDayInPeriod(16, period) ? 1 : 0;
        } else if (alloc === 'due-date') {
          mult = dueDayInPeriod(e.dueDay || 1, period) ? 1 : 0;
        } else {
          mult = 1; // 'split' = every period (same as default biweekly behavior)
        }
      } else {
        mult = expMultiplier(freq, cadence);
      }
      const dispAmt = Math.round(e.amount * mult * 100) / 100;
      total += dispAmt;

      let note = null;
      if (isSplit) {
        note = 'Split across both';
      } else if (freq === 'monthly' && cadence === 'biweekly' && mult === 0) {
        note = 'Due in other period';
      } else if (mult !== 1) {
        note = `${mult} payments this period`;
      }

      if (mult > 0) recurringItems.push({ ...e, displayAmount: dispAmt, note });
    }
  }

  total = Math.round(total * 100) / 100;
  return { total, remaining: Math.round((period.income - total) * 100) / 100, recurringItems, onceItems };
}

// ---- Speed Dial / Refresh ----------------------------------

function setupPdFab() {
  const fab = document.getElementById('fab');
  fab.textContent = '+';
  fab.onclick = () => openSheet(null, payPeriodRefresh);
}

async function payPeriodRefresh() {
  try {
    const [periods, expenses, cards, banks] = await Promise.all([
      Store.get('periods'),
      Store.get('expenses'),
      Store.get('cards').catch(() => []),
      Store.get('banks').catch(() => []),
    ]);
    if (_currentPage !== 'pay-period') return;
    _pd = { periods, expenses, cards, banks };
    renderPeriod(_pdIdx);
    setupPdFab();
  } catch (err) {
    console.error('payPeriodRefresh error:', err);
  }
}

// ---- Helpers -----------------------------------------------
// localToday(), esc(), fmtRange(), dueDayInPeriod() provided by shared.js

function pdMoney(n) {
  const str = '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dot = str.lastIndexOf('.');
  return str.slice(0, dot) + '<span class="cents">' + str.slice(dot) + '</span>';
}
