// ============================================================
// Expenses page
// ============================================================

let _expenses = [];
let _periods  = [];
let _expScenario = null;
let _expFilter = 'current'; // 'current' or 'upcoming'

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
    const [expenses, periods, scenario] = await Promise.all([
      Store.get('expenses'),
      Store.get('periods'),
      Store.get('scenario'),
    ]);
    _expenses = expenses;
    _periods = periods;
    _expScenario = scenario;
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
  const summaryHtml = `
    <div class="text-muted text-sm" style="text-align:center;padding:var(--space-2) 0;">
      ${filtered.length} expense${filtered.length !== 1 ? 's' : ''} · ${money(filteredTotal)}/mo
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
      <div class="stack--3">${filtered.map(buildPill).join('')}</div>
    </div>`;

  if (_expScenario) mountNotesWidget('exp', _expScenario.scenarioId, _expScenario.notes);
  bindFilterToggle();

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

  const cardLabel = e.cardId
    ? (typeof _cards !== 'undefined' ? (_cards.find(c => c.cardId === e.cardId)?.name ?? '—') : '—')
    : '—';

  let dueMeta = '';
  if (isRecurring && e.dueDay) {
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
        <span class="expense-pill__name">${esc(e.name)}</span>
        <span class="expense-pill__amount">${money(e.amount)}</span>
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
          <div class="expense-pill__meta-item">
            <div class="expense-pill__meta-label">Card</div>
            <div class="expense-pill__meta-value">${esc(cardLabel)}</div>
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

  // Due day label depends on frequency
  const dueDayRequired = initFreq === 'monthly';

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
          <div class="form-group">
            <label class="form-label" for="sh-due-day" id="sh-due-day-label">Due day ${dueDayRequired ? '' : '<span class="text-muted">(optional, 1–31)</span>'}</label>
            <input class="form-input" id="sh-due-day" type="number" min="1" max="31"
              placeholder="e.g. 15" value="${initDueDay}" />
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

  function updateDueDayLabel() {
    const label = document.getElementById('sh-due-day-label');
    if (!label) return;
    if (selectedFreq === 'monthly') {
      label.innerHTML = 'Due day';
    } else {
      label.innerHTML = 'Due day <span class="text-muted">(optional, 1–31)</span>';
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
      updateDueDayLabel();
    });
  });

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
      const dueDay = document.getElementById('sh-due-day').value;
      if (selectedFreq === 'monthly' && !dueDay) { alert('Monthly expenses require a due day (1–31).'); return; }
      if (dueDay) payload.dueDay = Number(dueDay);
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
        const res = await fetch(`/api/expenses/${userId()}/${expense.expenseId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Save failed');
      } else {
        const res = await fetch('/api/expenses', {
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
    const res = await fetch(`/api/expenses/${userId()}/${expense.expenseId}`, { method: 'DELETE' });
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
