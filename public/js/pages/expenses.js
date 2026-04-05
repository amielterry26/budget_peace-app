// ============================================================
// Expenses page
// ============================================================

let _expenses    = [];
let _periods     = [];
let _expScenario = null;
let _expFilter   = 'current'; // 'current' or 'upcoming'
let _expCards    = [];
let _expBanks    = [];
let _expSort     = 'amount-desc'; // persists across filter toggles

Router.register('expenses', async () => {
  document.getElementById('page-title').textContent = 'Expenses';
  setActivePage('expenses');
  showBottomNav(true);
  showFab(true);

  document.getElementById('main-content').innerHTML = `
    <div class="page">
      <div class="text-muted text-sm text-center" style="padding:64px 0;">Loading…</div>
    </div>`;

  try {
    const [expenses, periods, scenario, expCards, expBanks] = await Promise.all([
      Store.get('expenses'),
      Store.get('periods'),
      Store.get('scenario'),
      Store.get('cards').catch(() => []),
      Store.get('banks').catch(() => []),
    ]);
    _expenses    = expenses;
    _periods     = periods;
    _expScenario = scenario;
    _expCards    = expCards;
    _expBanks    = expBanks;
    renderExpensesList();
    bindExpensesFab();
  } catch (err) {
    console.error(err);
    document.getElementById('main-content').innerHTML = `
      <div class="page text-center" style="padding-top:64px;">
        <p class="text-muted text-sm">Failed to load expenses.</p>
        <button class="btn btn--ghost" style="margin-top:var(--space-3);" onclick="Router.navigate('expenses')">Try Again</button>
      </div>`;
  }
});

function bindExpensesFab() {
  document.getElementById('fab').onclick = () => openSheet(null, expensesPageRefresh);
}

// ---- Refresh -----------------------------------------------

async function expensesPageRefresh() {
  _expenses = await Store.get('expenses');
  if (_currentPage !== 'expenses') return;
  renderExpensesList();
  bindExpensesFab();
}

// ---- List --------------------------------------------------

function renderExpensesList() {
  const content = document.getElementById('main-content');
  const today = effectiveToday();

  const current  = _expenses.filter(e => isExpenseActive(e, today));
  const upcoming = _expenses.filter(e => !isExpenseActive(e, today));
  const filtered = _expFilter === 'current' ? current : upcoming;

  const hasUpcoming = upcoming.length > 0;

  let toggleHtml = '';
  if (hasUpcoming || _expFilter === 'upcoming') {
    toggleHtml = `
      <div class="home-mode-switch" aria-label="Expense filter">
        <button class="home-mode-switch__btn ${_expFilter === 'current' ? 'is-active' : ''}" id="exp-filter-current" type="button">Current</button>
        <button class="home-mode-switch__btn ${_expFilter === 'upcoming' ? 'is-active' : ''}" id="exp-filter-upcoming" type="button">Upcoming (${upcoming.length})</button>
      </div>`;
  }

  const filteredTotal = expMonthlyTotal(filtered);
  const maxExp = Plans.getLimit('maxExpensesPerScenario');
  const isExpLimited = typeof maxExp === 'number' && maxExp !== Infinity;
  const expUsage = isExpLimited
    ? `${_expenses.length} of ${maxExp} expenses used · ${money(filteredTotal)}/mo`
    : `${filtered.length} expense${filtered.length !== 1 ? 's' : ''} · ${money(filteredTotal)}/mo`;
  const summaryHtml = `
    <div class="exp-sort-bar">
      <span class="text-muted text-sm">${expUsage}${isExpLimited && _expenses.length >= maxExp ? ' · <a href="javascript:void(0)" class="exp-usage-upgrade" style="color:var(--color-accent);font-weight:600;">Upgrade for more</a>' : ''}</span>
      <select class="exp-sort-select" id="exp-sort">
        <option value="amount-desc" ${_expSort === 'amount-desc' ? 'selected' : ''}>Highest</option>
        <option value="amount-asc"  ${_expSort === 'amount-asc'  ? 'selected' : ''}>Lowest</option>
        <option value="name-asc"    ${_expSort === 'name-asc'    ? 'selected' : ''}>A–Z</option>
        <option value="newest"      ${_expSort === 'newest'      ? 'selected' : ''}>Newest</option>
        <option value="oldest"      ${_expSort === 'oldest'      ? 'selected' : ''}>Oldest</option>
      </select>
    </div>`;

  const notesHtml = _expScenario ? notesCardHtml('exp') : '';

  if (!filtered.length) {
    const emptyMsg = _expFilter === 'current'
      ? 'No active expenses. Tap + to add one.'
      : 'No upcoming expenses.';
    content.innerHTML = `
      <div class="page">
        ${notesHtml}
        ${toggleHtml}
        <div class="text-muted text-sm text-center" style="padding:64px 0;">
          ${emptyMsg}
        </div>
      </div>`;
    if (_expScenario) mountNotesWidget('exp', _expScenario.scenarioId, _expScenario.notes);
    bindFilterToggle();
    return;
  }

  content.innerHTML = `
    <div class="page">
      ${notesHtml}
      ${toggleHtml}
      ${summaryHtml}
      <div class="stack--3">${sortExpenses(filtered).map(buildPill).join('')}</div>
    </div>`;

  if (_expScenario) mountNotesWidget('exp', _expScenario.scenarioId, _expScenario.notes);
  bindFilterToggle();

  // Wire sort select
  document.getElementById('exp-sort')?.addEventListener('change', ev => {
    _expSort = ev.target.value;
    renderExpensesList();
    bindExpensesFab();
  });

  // Wire usage upgrade link
  document.querySelectorAll('.exp-usage-upgrade').forEach(el => {
    el.addEventListener('click', () => Plans.showUpgradeModal(Plans.UPGRADE_CONTEXT.expenses));
  });

  filtered.forEach(e => {
    const el = document.getElementById(`pill-${e.expenseId}`);
    if (!el) return;
    el.querySelector('.expense-pill__header').addEventListener('click', () => {
      el.classList.toggle('is-expanded');
    });
    el.querySelector('.btn-edit').addEventListener('click', ev => {
      ev.stopPropagation(); openSheet(e, expensesPageRefresh);
    });
    el.querySelector('.btn-delete').addEventListener('click', ev => {
      ev.stopPropagation(); confirmDelete(e);
    });
  });
}

function bindFilterToggle() {
  document.getElementById('exp-filter-current')?.addEventListener('click', () => {
    _expFilter = 'current';
    renderExpensesList();
    bindExpensesFab();
  });
  document.getElementById('exp-filter-upcoming')?.addEventListener('click', () => {
    _expFilter = 'upcoming';
    renderExpensesList();
    bindExpensesFab();
  });
}

function isExpenseActive(expense, today) {
  if (expense.recurrence === 'recurring') {
    const start = expense.recurrenceStartDate || '1970-01-01';
    return start <= today;
  }
  // One-time: active if its period hasn't ended, or no period assigned
  if (expense.periodStart) {
    const period = _periods.find(p => p.startDate === expense.periodStart);
    return period ? period.endDate >= today : true;
  }
  return true;
}

function buildPill(e) {
  const isRecurring = e.recurrence === 'recurring';

  let recurrenceLabel;
  if (isRecurring) {
    const freqMap = { weekly: 'Weekly', biweekly: 'Bi-weekly', monthly: 'Monthly' };
    recurrenceLabel = freqMap[e.recurrenceFrequency] || 'Recurring';
  } else {
    recurrenceLabel = 'One time';
  }

  const periodLabel = isRecurring
    ? 'All periods'
    : (e.periodStart
        ? (_periods.find(p => p.startDate === e.periodStart)
            ? fmtRange(_periods.find(p => p.startDate === e.periodStart)) : e.periodStart)
        : 'Unassigned');

  const linkedCard = e.cardId ? _expCards.find(c => c.cardId === e.cardId) : null;
  const linkedBank = linkedCard?.bankId ? _expBanks.find(b => b.bankId === linkedCard.bankId) : null;
  const bankColor  = linkedBank?.color || '#6B7280';
  const bankTag    = linkedBank
    ? `<span class="exp-bank-tag"><span class="exp-bank-dot" style="background:${bankColor}"></span>${esc(linkedBank.name)}</span>`
    : '';
  const cardLabel  = linkedCard ? `${esc(linkedCard.name)} •••• ${esc(linkedCard.lastFour)}` : '—';

  let moHint = '';
  if (isRecurring) {
    const freq = e.recurrenceFrequency;
    if (freq === 'weekly')         moHint = `<span class="expense-pill__mo-hint">· ×4/mo</span>`;
    else if (freq === 'biweekly')  moHint = `<span class="expense-pill__mo-hint">· ×2/mo</span>`;
    else if (e.splitBiweekly)     moHint = `<span class="expense-pill__mo-hint">· ÷2/period</span>`;
  }

  let dueMeta = '';
  if (isRecurring && e.dueDay && !e.splitBiweekly) {
    dueMeta = `<div class="expense-pill__meta-item">
      <div class="expense-pill__meta-label">Due</div>
      <div class="expense-pill__meta-value">Day ${e.dueDay}</div>
    </div>`;
  } else if (!isRecurring && e.dueDate) {
    const d = new Date(e.dueDate + 'T00:00:00Z');
    dueMeta = `<div class="expense-pill__meta-item">
      <div class="expense-pill__meta-label">Due</div>
      <div class="expense-pill__meta-value">${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}</div>
    </div>`;
  }

  let startMeta = '';
  if (isRecurring && e.recurrenceStartDate) {
    const d = new Date(e.recurrenceStartDate + 'T00:00:00Z');
    startMeta = `<div class="expense-pill__meta-item">
      <div class="expense-pill__meta-label">Starts</div>
      <div class="expense-pill__meta-value">${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</div>
    </div>`;
  }

  return `
    <div class="expense-pill" id="pill-${e.expenseId}">
      <div class="expense-pill__header">
        <div class="expense-pill__name">${esc(e.name)}${bankTag}</div>
        <div class="expense-pill__amount-wrap">
          <span class="expense-pill__amount">${money(e.amount)}</span>
          ${moHint}
        </div>
        <span class="expense-pill__chevron">▼</span>
      </div>
      <div class="expense-pill__details">
        <div class="expense-pill__meta">
          <div class="expense-pill__meta-item">
            <div class="expense-pill__meta-label">Recurrence</div>
            <div class="expense-pill__meta-value">${recurrenceLabel}</div>
          </div>
          <div class="expense-pill__meta-item">
            <div class="expense-pill__meta-label">Period</div>
            <div class="expense-pill__meta-value">${periodLabel}</div>
          </div>
          ${linkedBank ? `
          <div class="expense-pill__meta-item">
            <div class="expense-pill__meta-label">Bank</div>
            <div class="expense-pill__meta-value" style="display:flex;align-items:center;gap:5px;">
              <span style="width:8px;height:8px;border-radius:50%;background:${bankColor};display:inline-block;flex-shrink:0;"></span>${esc(linkedBank.name)}
            </div>
          </div>` : ''}
          <div class="expense-pill__meta-item">
            <div class="expense-pill__meta-label">Card</div>
            <div class="expense-pill__meta-value">${cardLabel}</div>
          </div>
          ${startMeta}
          ${dueMeta}
        </div>
        <div class="expense-pill__actions">
          <button class="btn btn--ghost btn-edit"   style="font-size:13px;padding:8px 16px;">Edit</button>
          <button class="btn btn--danger btn-delete" style="font-size:13px;padding:8px 16px;">Delete</button>
        </div>
      </div>
    </div>`;
}

// ---- Sheet (Add / Edit) ------------------------------------

async function openSheet(expense, onSave) {
  const editing = !!expense;

  // Demo: gate new expense adds; block edits entirely
  if (isDemoMode()) {
    if (editing) { showDemoPaywall('viewOnly'); return; }
    if (!demoGate('expensesAdded')) return;
  }

  // Plan gate: check expense limit (only for new expenses, not edits)
  if (!editing && !isDemoMode()) {
    const maxExpenses = Plans.getLimit('maxExpensesPerScenario');
    if (typeof maxExpenses === 'number' && _expenses.length >= maxExpenses) {
      Plans.showUpgradeModal(Plans.UPGRADE_CONTEXT.expenses);
      return;
    }
  }

  // Read periods and cards from Store
  let periods, sheetCards;
  try {
    [periods, sheetCards] = await Promise.all([
      Store.get('periods'),
      Store.get('cards').catch(() => []),
    ]);
  } catch {
    periods = _periods.length ? _periods : [];
    sheetCards = [];
  }

  const today = effectiveToday();

  const periodOpts = [
    `<option value="">— Unassigned —</option>`,
    ...periods.map(p =>
      `<option value="${p.startDate}" ${expense?.periodStart === p.startDate ? 'selected' : ''}>${fmtRange(p)}</option>`
    ),
  ].join('');

  const cardOpts = [
    `<option value="">— No card —</option>`,
    ...sheetCards.map(c =>
      `<option value="${c.cardId}" ${expense?.cardId === c.cardId ? 'selected' : ''}>${esc(c.name)} ••${esc(c.lastFour)}</option>`
    ),
  ].join('');

  const isRecurring = !editing || expense.recurrence === 'recurring';
  const initFreq    = editing ? (expense.recurrenceFrequency || 'monthly') : 'monthly';
  const initStart   = editing ? (expense.recurrenceStartDate || today) : today;
  const initDueDay  = editing ? (expense.dueDay || (expense.recurrenceFrequency === 'monthly' ? new Date().getDate() : '')) : '';
  const initDueDate = editing ? (expense.dueDate || '') : '';
  const initSplit   = editing ? !!expense.splitBiweekly : false;

  // Determine if user is on biweekly pay cadence (split option only relevant then)
  const isBiweekly = _periods.length > 0 && inferCadence(_periods[0]) === 'biweekly';

  // Due day label depends on frequency
  const dueDayRequired = initFreq === 'monthly' && !initSplit;

  document.body.insertAdjacentHTML('beforeend', `
    <div id="sheet-overlay" class="sheet-overlay"></div>
    <div id="expense-sheet" class="sheet">
      <div class="sheet__handle"></div>
      <div class="sheet__title">${editing ? 'Edit Expense' : 'New Expense'}</div>
      <div class="stack--4">

        <div class="form-group">
          <label class="form-label" for="sh-name">Name</label>
          <input class="form-input" id="sh-name" type="text" placeholder="e.g. Rent"
            value="${editing ? esc(expense.name) : ''}" />
        </div>

        <div class="form-group">
          <label class="form-label" for="sh-amount">Amount</label>
          <div class="ob-input-money">
            <input class="form-input" id="sh-amount" type="number" placeholder="0.00"
              min="0" step="0.01" style="padding-left:28px;"
              value="${editing ? expense.amount : ''}" />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Recurrence</label>
          <div class="option-grid option-grid--2">
            <div class="option-card ${isRecurring ? 'is-selected' : ''}" data-val="recurring">
              <div class="option-card__title">Recurring</div>
              <div class="option-card__sub">Rent, subscriptions</div>
            </div>
            <div class="option-card ${!isRecurring ? 'is-selected' : ''}" data-val="once">
              <div class="option-card__title">One time</div>
              <div class="option-card__sub">Single expense</div>
            </div>
          </div>
        </div>

        <!-- Recurring fields -->
        <div id="sh-recurring-fields" style="display:${isRecurring ? 'contents' : 'none'}">
          <div class="form-group">
            <label class="form-label">Frequency</label>
            <div class="option-grid option-grid--3">
              <div class="option-card freq-card ${initFreq === 'weekly'    ? 'is-selected' : ''}" data-freq="weekly">
                <div class="option-card__title">Weekly</div>
              </div>
              <div class="option-card freq-card ${initFreq === 'biweekly'  ? 'is-selected' : ''}" data-freq="biweekly">
                <div class="option-card__title">Bi-weekly</div>
              </div>
              <div class="option-card freq-card ${initFreq === 'monthly'   ? 'is-selected' : ''}" data-freq="monthly">
                <div class="option-card__title">Monthly</div>
              </div>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="sh-start-date">Start date</label>
            <input class="form-input" id="sh-start-date" type="date" value="${initStart}" />
          </div>
          <div class="form-group" id="sh-due-day-group" style="display:${initSplit ? 'none' : 'block'}">
            <label class="form-label" for="sh-due-day" id="sh-due-day-label">Due date ${dueDayRequired ? '' : '<span class="text-muted">(optional, 1–31)</span>'}</label>
            <input class="form-input" id="sh-due-day" type="number" min="1" max="31"
              placeholder="e.g. 15" value="${initDueDay}" />
          </div>
          <div class="form-group" id="sh-split-row" style="display:${isBiweekly && initFreq === 'monthly' ? 'flex' : 'none'};align-items:center;gap:var(--space-3);">
            <input type="checkbox" id="sh-split" style="width:18px;height:18px;cursor:pointer;flex-shrink:0;" ${initSplit ? 'checked' : ''} />
            <label for="sh-split" style="cursor:pointer;margin:0;">
              <span class="form-label" style="margin:0;">Split across both pay periods</span>
              <div class="text-muted text-xs" style="margin-top:2px;">Show ½ amount each biweekly period</div>
            </label>
          </div>
        </div>

        <!-- One-time fields -->
        <div id="sh-once-fields" style="display:${!isRecurring ? 'contents' : 'none'}">
          <div class="form-group">
            <label class="form-label" for="sh-due-date">Due date <span class="text-muted">(optional)</span></label>
            <input class="form-input" id="sh-due-date" type="date" value="${initDueDate}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="sh-period">Assign to period <span class="text-muted">(optional)</span></label>
            <select class="form-input form-select" id="sh-period">${periodOpts}</select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="sh-card">Card <span class="text-muted">(optional)</span></label>
          <select class="form-input form-select" id="sh-card">${cardOpts}</select>
        </div>

        <div style="display:flex;gap:12px;padding-top:8px;">
          <button class="btn btn--ghost btn--full" id="sh-cancel">Cancel</button>
          <button class="btn btn--primary btn--full" id="sh-save">${editing ? 'Save Changes' : 'Add Expense'}</button>
        </div>

      </div>
    </div>`);

  requestAnimationFrame(() => {
    document.getElementById('sheet-overlay').classList.add('is-open');
    document.getElementById('expense-sheet').classList.add('is-open');
  });

  let selectedRecurrence = isRecurring ? 'recurring' : 'once';
  let selectedFreq       = initFreq;

  function updateDueDayVisibility() {
    const label    = document.getElementById('sh-due-day-label');
    const splitRow = document.getElementById('sh-split-row');
    const dueDayGrp = document.getElementById('sh-due-day-group');
    const splitChk = document.getElementById('sh-split');
    if (!label) return;

    const isMonthly = selectedFreq === 'monthly';
    const isSplitNow = splitChk?.checked || false;

    // Show split toggle only for monthly on biweekly schedule
    if (splitRow) splitRow.style.display = (isBiweekly && isMonthly) ? 'flex' : 'none';

    // Show dueDay group when not split
    if (dueDayGrp) dueDayGrp.style.display = isSplitNow ? 'none' : 'block';

    // Update dueDay label
    if (isMonthly && !isSplitNow) {
      label.innerHTML = 'Due date';
    } else {
      label.innerHTML = 'Due date <span class="text-muted">(optional, 1–31)</span>';
    }
  }

  // Recurrence type toggle
  document.querySelectorAll('#expense-sheet .option-card:not(.freq-card)').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('#expense-sheet .option-card:not(.freq-card)').forEach(c => c.classList.remove('is-selected'));
      card.classList.add('is-selected');
      selectedRecurrence = card.dataset.val;
      document.getElementById('sh-recurring-fields').style.display = selectedRecurrence === 'recurring' ? 'contents' : 'none';
      document.getElementById('sh-once-fields').style.display      = selectedRecurrence === 'once'      ? 'contents' : 'none';
    });
  });

  // Frequency toggle
  document.querySelectorAll('#expense-sheet .freq-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('#expense-sheet .freq-card').forEach(c => c.classList.remove('is-selected'));
      card.classList.add('is-selected');
      selectedFreq = card.dataset.freq;
      updateDueDayVisibility();
    });
  });

  // Split checkbox toggle
  document.getElementById('sh-split')?.addEventListener('change', updateDueDayVisibility);

  const closeSheet = () => {
    document.getElementById('sheet-overlay').classList.remove('is-open');
    const sheet = document.getElementById('expense-sheet');
    sheet.classList.remove('is-open');
    sheet.addEventListener('transitionend', () => {
      document.getElementById('sheet-overlay')?.remove();
      document.getElementById('expense-sheet')?.remove();
    }, { once: true });
  };

  document.getElementById('sheet-overlay').addEventListener('click', closeSheet);
  document.getElementById('sh-cancel').addEventListener('click', closeSheet);

  document.getElementById('sh-save').addEventListener('click', async () => {
    const name   = document.getElementById('sh-name').value.trim();
    const amount = document.getElementById('sh-amount').value;
    const cardId = document.getElementById('sh-card').value;

    if (!name)   { alert('Enter a name.'); return; }
    if (!amount) { alert('Enter an amount.'); return; }

    const payload = {
      userId: userId(), name, amount: Number(amount),
      recurrence: selectedRecurrence,
      scenarioId: _activeScenario,
      ...(cardId && { cardId }),
    };

    if (selectedRecurrence === 'recurring') {
      payload.recurrenceFrequency = selectedFreq;
      const startDate = document.getElementById('sh-start-date').value;
      if (!startDate) { alert('Enter a start date.'); return; }
      payload.recurrenceStartDate = startDate;
      const splitChecked = document.getElementById('sh-split')?.checked || false;
      if (splitChecked && selectedFreq === 'monthly') {
        payload.splitBiweekly = true;
      } else {
        const dueDay = document.getElementById('sh-due-day').value;
        if (selectedFreq === 'monthly' && !dueDay) { alert('Monthly expenses require a due date (1–31).'); return; }
        if (dueDay) payload.dueDay = Number(dueDay);
      }
    } else {
      const dueDate = document.getElementById('sh-due-date').value;
      if (dueDate) payload.dueDate = dueDate;
      const period = document.getElementById('sh-period').value;
      if (period) payload.periodStart = period;
    }

    const btn = document.getElementById('sh-save');
    btn.textContent = 'Saving…';
    btn.disabled = true;

    try {
      if (isDemoMode()) {
        payload.expenseId = 'de' + (_demoNextId++);
        _demoData.expenses.push(payload);
        demoTrack('expensesAdded');
        Store.invalidate('expenses');
        closeSheet();
        if (typeof onSave === 'function') onSave();
        return;
      }

      if (editing) {
        const res = await authFetch(`/api/expenses/${userId()}/${expense.expenseId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Save failed');
      } else {
        const res = await authFetch('/api/expenses', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Save failed');
      }
      Store.invalidate('expenses');
      closeSheet();
      if (typeof onSave === 'function') onSave();
    } catch (err) {
      console.error(err);
      btn.textContent = 'Try Again';
      btn.disabled = false;
    }
  });
}

// ---- Delete ------------------------------------------------

async function confirmDelete(expense) {
  if (isDemoMode()) {
    if (!demoGate('expensesDeleted')) return;
    if (!confirm(`Delete "${expense.name}"?`)) return;
    _demoData.expenses = _demoData.expenses.filter(e => e.expenseId !== expense.expenseId);
    demoTrack('expensesDeleted');
    _expenses = await Store.get('expenses');
    renderExpensesList();
    bindExpensesFab();
    return;
  }

  if (!confirm(`Delete "${expense.name}"? This can't be undone.`)) return;
  try {
    const res = await authFetch(`/api/expenses/${userId()}/${expense.expenseId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
    Store.invalidate('expenses');
    _expenses = await Store.get('expenses');
    renderExpensesList();
    bindExpensesFab();
  } catch (err) {
    console.error(err);
    alert('Delete failed. Try again.');
  }
}

// ---- Helpers -----------------------------------------------
// localToday(), esc(), fmtRange(), userId(), dueDayInPeriod(), Store, expMultiplier() provided by shared.js

function sortExpenses(arr) {
  const s = arr.slice();
  switch (_expSort) {
    case 'amount-desc': return s.sort((a, b) => b.amount - a.amount);
    case 'amount-asc':  return s.sort((a, b) => a.amount - b.amount);
    case 'name-asc':    return s.sort((a, b) => a.name.localeCompare(b.name));
    case 'newest':      return s.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    case 'oldest':      return s.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    default:            return s;
  }
}

function expMonthlyTotal(expenses) {
  let total = 0;
  for (const e of expenses) {
    if (e.recurrence === 'recurring') {
      const freq = e.recurrenceFrequency || 'monthly';
      const mult = freq === 'weekly' ? 4 : freq === 'biweekly' ? 2 : 1;
      total += e.amount * mult;
    } else {
      total += e.amount;
    }
  }
  return Math.round(total * 100) / 100;
}

function money(n) {
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
