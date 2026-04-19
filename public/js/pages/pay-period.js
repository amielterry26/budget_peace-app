// ============================================================
// Pay Period — Operational Budget View
// ============================================================

let _pd              = null; // { periods, expenses, cards, banks }
let _pdIdx           = 0;
let _pdSort          = 'amount-desc';
let _pdSearch        = '';
let _pdReorder       = false;
let _pdBreakdownOpen = true;

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
        <div class="period-nav__center">
          <span class="period-nav__label">${fmtRange(period)}</span>
          <span class="period-nav__payday">${fmtPayday(period.startDate, effectiveToday())}</span>
        </div>
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

  // Restore breakdown open/close state after re-render
  if (!_pdBreakdownOpen) {
    const bd = document.getElementById('period-breakdown');
    if (bd) bd.style.display = 'none';
    const ch = document.getElementById('bd-chevron');
    if (ch) ch.textContent = '▼';
    const bt = document.getElementById('breakdown-toggle');
    if (bt) bt.childNodes[0].textContent = 'See full breakdown ';
  }

  document.getElementById('go-financial-health').addEventListener('click', () => Router.navigate('home'));
  document.getElementById('prev-period').addEventListener('click', () => { _pdSearch = ''; _pdReorder = false; renderPeriod(idx - 1); });
  document.getElementById('next-period').addEventListener('click', () => { _pdSearch = ''; _pdReorder = false; renderPeriod(idx + 1); });

  document.getElementById('breakdown-toggle').addEventListener('click', () => {
    const bd      = document.getElementById('period-breakdown');
    const chevron = document.getElementById('bd-chevron');
    const btn     = document.getElementById('breakdown-toggle');
    const isOpen  = bd.style.display !== 'none';
    _pdBreakdownOpen    = !isOpen;
    bd.style.display    = isOpen ? 'none' : 'block';
    chevron.textContent = isOpen ? '▼' : '▲';
    btn.childNodes[0].textContent = isOpen ? 'See full breakdown ' : 'Hide breakdown ';
  });

  document.getElementById('view-all-btn')?.addEventListener('click', () => Router.navigate('budgets'));

  document.getElementById('pd-sort')?.addEventListener('change', ev => {
    _pdSort = ev.target.value;
    renderPeriod(_pdIdx);
  });

  // Search
  document.getElementById('pd-search')?.addEventListener('input', ev => {
    const cursor = ev.target.selectionStart;
    _pdSearch = ev.target.value;
    renderPeriod(_pdIdx);
    const el = document.getElementById('pd-search');
    if (el) { el.focus(); el.setSelectionRange(cursor, cursor); }
  });

  // Enter reorder mode
  document.getElementById('pd-reorder-btn')?.addEventListener('click', () => {
    _pdReorder = true;
    _pdSort = 'manual';
    _pdBreakdownOpen = true;
    renderPeriod(_pdIdx);
    const list = document.getElementById('pd-reorder-list');
    if (list && typeof Sortable !== 'undefined') {
      new Sortable(list, {
        animation:  150,
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        filter: '.section-title',
        draggable: '.pd-bill-card',
      });
    }
  });

  // Done reordering — save sortOrder to API
  document.getElementById('pd-reorder-done')?.addEventListener('click', async () => {
    const list = document.getElementById('pd-reorder-list');
    const items = list
      ? Array.from(list.querySelectorAll('[data-expense-id]')).map((el, i) => ({
          expenseId: el.dataset.expenseId,
          sortOrder: (i + 1) * 1000,
        }))
      : [];
    if (_pd) {
      items.forEach(({ expenseId, sortOrder }) => {
        const e = _pd.expenses.find(x => x.expenseId === expenseId);
        if (e) e.sortOrder = sortOrder;
      });
    }
    _pdReorder = false;
    renderPeriod(_pdIdx);
    if (!items.length) return;
    try {
      await authFetch(`/api/expenses/${userId()}/order`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ items }),
      });
      Store.invalidate('expenses');
      if (_pd) _pd.expenses = await Store.get('expenses');
      renderPeriod(_pdIdx);
    } catch (err) {
      console.error('Failed to save expense order:', err);
    }
  });

  // Bill mini-card click handlers
  document.querySelectorAll('.pd-bill-card').forEach(card => {
    card.addEventListener('click', () => {
      if (_pdReorder) return;
      const idx = Number(card.dataset.pdBillIdx);
      if (_pdBreakdownItems[idx]) openBillDetailModal(_pdBreakdownItems[idx], payPeriodRefresh);
    });
  });
}

// ---- Builders ----------------------------------------------

let _pdBreakdownItems = []; // cached for bill card click handlers

function sortPdItems(arr, cards, banks) {
  const s = arr.slice();
  switch (_pdSort) {
    case 'amount-desc': return s.sort((a, b) => (b.displayAmount || b.amount) - (a.displayAmount || a.amount));
    case 'amount-asc':  return s.sort((a, b) => (a.displayAmount || a.amount) - (b.displayAmount || b.amount));
    case 'by-bank': return s.sort((a, b) => {
      const cardA = a.cardId ? cards.find(c => c.cardId === a.cardId) : null;
      const bankA = cardA?.bankId ? banks.find(b => b.bankId === cardA.bankId) : null;
      const cardB = b.cardId ? cards.find(c => c.cardId === b.cardId) : null;
      const bankB = cardB?.bankId ? banks.find(b => b.bankId === cardB.bankId) : null;
      return (bankA?.name || '\uffff').localeCompare(bankB?.name || '\uffff') || a.name.localeCompare(b.name);
    });
    case 'by-card': return s.sort((a, b) => {
      const cardA = a.cardId ? cards.find(c => c.cardId === a.cardId) : null;
      const cardB = b.cardId ? cards.find(c => c.cardId === b.cardId) : null;
      return (cardA?.name || '\uffff').localeCompare(cardB?.name || '\uffff') || a.name.localeCompare(b.name);
    });
    case 'manual': return s.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    default: return s;
  }
}

function applyPdSearch(items, q, cards, banks) {
  if (!q) return items;
  const lq = q.toLowerCase().trim();
  return items.filter(e => {
    const name = (e.name || '').toLowerCase();
    const card = e.cardId ? cards.find(c => c.cardId === e.cardId) : null;
    const bank = card?.bankId ? banks.find(b => b.bankId === card.bankId) : null;
    const cardName = (card?.name || '').toLowerCase();
    const bankName = (bank?.name || '').toLowerCase();
    return name.includes(lq) || cardName.includes(lq) || bankName.includes(lq) || String(e.amount).includes(lq);
  });
}

function buildPdBreakdown(pd, cards = [], banks = []) {
  const q = _pdSearch.trim();

  const totalItems = pd.recurringItems.length + pd.onceItems.length;
  const sortBar = _pdReorder ? `
    <div class="exp-sort-bar">
      <span class="text-muted text-sm">Drag to reorder. Tap Done to save.</span>
      <button class="btn btn--primary" id="pd-reorder-done" style="font-size:12px;padding:5px 14px;">Done</button>
    </div>` : `
    <div style="display:flex;justify-content:flex-end;margin-bottom:var(--space-2);">
      <div class="exp-search-wrap">
        <svg class="exp-search-icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input class="exp-search-input" id="pd-search" type="search" placeholder="Search…" value="${esc(q)}" />
      </div>
    </div>
    <div class="exp-sort-bar">
      <span class="text-muted text-sm">${totalItems} bill${totalItems !== 1 ? 's' : ''} this period</span>
      <div class="exp-sort-ctrl">
        <select class="exp-sort-select" id="pd-sort">
          <option value="amount-desc" ${_pdSort === 'amount-desc' ? 'selected' : ''}>Highest</option>
          <option value="amount-asc"  ${_pdSort === 'amount-asc'  ? 'selected' : ''}>Lowest</option>
          <option value="by-bank"     ${_pdSort === 'by-bank'     ? 'selected' : ''}>By Bank</option>
          <option value="by-card"     ${_pdSort === 'by-card'     ? 'selected' : ''}>By Card</option>
          <option value="manual"      ${_pdSort === 'manual'      ? 'selected' : ''}>My Order</option>
        </select>
        <button class="exp-reorder-btn" id="pd-reorder-btn" type="button">≡ Reorder</button>
      </div>
    </div>`;

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

  let sortedRecurring = sortPdItems(pd.recurringItems, cards, banks);
  let sortedOnce      = sortPdItems(pd.onceItems, cards, banks);

  if (!_pdReorder && q) {
    sortedRecurring = applyPdSearch(sortedRecurring, q, cards, banks);
    sortedOnce      = applyPdSearch(sortedOnce, q, cards, banks);
  }

  if (sortedRecurring.length) {
    html += `<div class="section-title" style="margin:var(--space-3) 0 var(--space-1);">Recurring</div>`;
    html += sortedRecurring.map(e => {
      const idx = _pdBreakdownItems.length;
      _pdBreakdownItems.push(e);
      return `
      <div class="period-bill-card pd-bill-card" data-pd-bill-idx="${idx}" data-expense-id="${e.expenseId}">
        <div>
          <span class="period-bill-card__name">${esc(e.name)}</span>
          ${e.note ? `<div class="period-bill-card__note">${esc(e.note)}</div>` : e.dueDay && (!e.allocationMethod || e.allocationMethod === 'due-date') ? `<div class="period-bill-card__note">Due ${e.dueDay}</div>` : ''}
          ${expMeta(e)}
        </div>
        <span class="period-bill-card__amount">${pdMoney(e.displayAmount)}</span>
      </div>`;
    }).join('');
  }

  if (sortedOnce.length) {
    html += `<div class="section-title" style="margin:var(--space-4) 0 var(--space-1);">One-time</div>`;
    html += sortedOnce.map(e => {
      const idx = _pdBreakdownItems.length;
      _pdBreakdownItems.push(e);
      return `
      <div class="period-bill-card pd-bill-card" data-pd-bill-idx="${idx}" data-expense-id="${e.expenseId}">
        <div>
          <span class="period-bill-card__name">${esc(e.name)}</span>
          ${e.dueDate ? `<div class="period-bill-card__note">${e.dueDate}</div>` : ''}
          ${expMeta(e)}
        </div>
        <span class="period-bill-card__amount">${pdMoney(e.amount)}</span>
      </div>`;
    }).join('');
  }

  if (!sortedRecurring.length && !sortedOnce.length) {
    if (q) return sortBar + `<p class="text-muted text-sm text-center" style="padding:var(--space-4) 0;">No results for &ldquo;${esc(q)}&rdquo;.</p>`;
    return `<p class="text-muted text-sm text-center" style="padding:var(--space-4) 0;">No expenses this period.</p>`;
  }

  const listHtml = _pdReorder ? `<div id="pd-reorder-list">${html}</div>` : html;
  return sortBar + listHtml;
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
  fab.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="11" y1="4" x2="11" y2="18"/><line x1="4" y1="11" x2="18" y2="11"/></svg>';
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

function fmtPayday(dateStr, today) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const isPast = dateStr < today;
  return isPast ? `Paid ${label}` : `Payday ${label}`;
}

function pdMoney(n) {
  const str = '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dot = str.lastIndexOf('.');
  return str.slice(0, dot) + '<span class="cents">' + str.slice(dot) + '</span>';
}
