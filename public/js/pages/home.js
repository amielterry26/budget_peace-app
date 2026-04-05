// ============================================================
// Home — Financial Health Dashboard
// ============================================================

let _healthData    = null; // { user, periods, expenses }
let _healthHorizon = 6;    // default 6-month horizon
let _periodItems   = [];   // cached for bill card click handlers

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

  // Current period shortcut — prefer most recent past period over first future period
  const currentPeriod = periods.find(p => today >= p.startDate && today <= p.endDate)
    || [...periods].reverse().find(p => p.endDate <= today)
    || periods[0];

  let currentPeriodCard = '';
  if (currentPeriod) {
    const pd = calcPeriodExp(expenses, currentPeriod, scenario.cadence);
    const remColor = pd.remaining < 0 ? 'color:var(--color-danger)' : '';
    const spendPct = currentPeriod.income > 0
      ? Math.min(100, Math.round((pd.total / currentPeriod.income) * 100)) : 0;
    const periodItems = getPeriodItems(expenses, currentPeriod, scenario.cadence);
    _periodItems = periodItems;
    currentPeriodCard = `
      <div class="dash-section home-section-period">
        <div class="card period-shortcut-card" id="period-shortcut" style="cursor:pointer;padding:var(--space-3) var(--space-4);">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:var(--space-3);">
            <div>
              <div class="card-header" style="margin-bottom:2px;">Current Pay Period</div>
              <div class="text-muted text-sm">${fmtRange(currentPeriod)}</div>
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
                <span class="period-detail__value">${money(currentPeriod.income)}</span>
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
            ${periodItems.length ? `
            <div class="period-bills-preview">
              <div class="period-bills-preview__header">Bills this period</div>
              ${periodItems.map((it, i) => `
              <div class="period-bill-card" data-bill-idx="${i}">
                <span class="period-bill-card__name">${esc(it.name)}</span>
                <span class="period-bill-card__amount">${money(it.periodAmount)}</span>
              </div>`).join('')}
            </div>` : ''}
          </div>
          <div class="period-shortcut__action" style="margin-top:var(--space-2);">Review pay period →</div>
        </div>
      </div>`;
  }

  // Recurring expenses for structural view
  const recurringActive = expenses.filter(e =>
    e.recurrence === 'recurring' &&
    (!e.recurrenceStartDate || e.recurrenceStartDate <= today)
  );

  document.getElementById('main-content').innerHTML = `
    <div class="page home-page">

      <div class="home-welcome">
        <div class="home-welcome__heading">
          Welcome back.
          <span class="plan-badge plan-badge--${Plans.getTier() === 'pro' ? 'pro' : 'basic'}">${Plans.getTier() === 'pro' ? 'Pro' : 'Basic'} Plan</span>
        </div>
        <div class="home-welcome__sub">Here's where your budget stands right now. &middot; ${new Date(today + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })}</div>
      </div>

      <div class="home-mode-switch" aria-label="Home view switch">
        <button class="home-mode-switch__btn is-active" type="button">Financial Health</button>
        <button class="home-mode-switch__btn" id="go-pay-period" type="button">Current Pay Period</button>
      </div>

      ${currentPeriodCard}

      ${notesCardHtml('home')}

      <div class="dash-section home-section-structure">
        <div class="card home-card--center">
          <div class="card-header">Your Financial Structure</div>
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

      <div class="dash-section home-section-bills">
        <div class="rail-title">Recurring Bills</div>
        <div class="card home-card--side">
          <div class="card-header">Recurring Bills</div>
          <div class="home-supporting-copy" style="margin-bottom:var(--space-3);">
            Your baseline monthly obligations.
          </div>
          ${buildMonthlyBills(recurringActive)}
        </div>
      </div>

      <div class="dash-section home-section-health">
        <div class="rail-title">Financial Health</div>
        ${Plans.canUse('financialHealth') ? `
        <div class="card home-card--side">
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
        ` : `
        <div class="card home-card--side" style="text-align:center;padding:var(--space-5) var(--space-4);">
          <div class="card-header">Financial Health</div>
          <p class="text-muted text-sm" style="margin:var(--space-2) 0 var(--space-4);">Financial health projections are available on Budget Peace Pro.</p>
          <button class="btn btn--primary" id="health-upgrade">Upgrade to Pro</button>
        </div>
        `}
      </div>

    </div>`;

  mountNotesWidget('home', scenario.scenarioId, scenario.notes);

  document.querySelectorAll('.horizon-btn').forEach(btn => {
    btn.addEventListener('click', () => renderHealth(Number(btn.dataset.months)));
  });

  document.getElementById('health-upgrade')?.addEventListener('click', () => Plans.showUpgradeModal(Plans.UPGRADE_CONTEXT.financialHealth));
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

  // Bill mini-card click handlers
  document.querySelectorAll('.period-bill-card').forEach(card => {
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = Number(card.dataset.billIdx);
      if (_periodItems[idx]) openBillDetailModal(_periodItems[idx], homeRefresh);
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
      <div class="overview-row">
        <span class="overview-row__name">${esc(e.name)}</span>
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
      // Monthly expense in biweekly period: split evenly or place by dueDay
      if (freq === 'monthly' && cadence === 'biweekly') {
        if (e.splitBiweekly) {
          total += e.amount / 2;
        } else if (dueDayInPeriod(e.dueDay || 1, period)) {
          total += e.amount;
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
      const freq = e.recurrenceFrequency || 'monthly';
      if (freq === 'monthly' && cadence === 'biweekly') {
        if (e.splitBiweekly) {
          items.push({ ...e, periodAmount: Math.round(e.amount / 2 * 100) / 100 });
        } else if (dueDayInPeriod(e.dueDay || 1, period)) {
          items.push({ ...e, periodAmount: e.amount });
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
    textEl.innerHTML = `<textarea class="note-detail__textarea" id="note-edit-textarea" maxlength="200">${esc(note.text)}</textarea>`;
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
      if (newText.length > 200) { alert('Note must be 200 characters or less.'); return; }
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
        <div class="bill-detail__separator"></div>
        <div class="bill-detail__row">
          <span class="bill-detail__label">Category</span>
          <span class="bill-detail__placeholder">— Not set</span>
        </div>
        <div class="bill-detail__row">
          <span class="bill-detail__label">Notes</span>
          <span class="bill-detail__placeholder">— Not set</span>
        </div>
        <div class="bill-detail__row">
          <span class="bill-detail__label">Tags</span>
          <span class="bill-detail__placeholder">— Not set</span>
        </div>
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
