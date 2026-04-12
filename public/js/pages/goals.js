// ============================================================
// Goals — Savings Goal Tracker
// ============================================================

let _goals = [];

Router.register('goals', async () => {
  document.getElementById('page-title').textContent = 'Goals';
  setActivePage('goals');
  showBottomNav(true);
  showFab(true);

  document.getElementById('fab').textContent = '+';
  document.getElementById('fab').onclick = () => openGoalSheet(null);

  document.getElementById('main-content').innerHTML = `
    <div class="page">
      <div class="text-muted text-sm text-center" style="padding:64px 0;">Loading…</div>
    </div>`;

  try {
    _goals = await Store.get('goals');
    renderGoals();
  } catch (err) {
    console.error(err);
    document.getElementById('main-content').innerHTML = `
      <div class="page text-center" style="padding-top:64px;">
        <p class="text-muted text-sm">Failed to load goals.</p>
        <button class="btn btn--ghost" style="margin-top:var(--space-3);" onclick="Router.navigate('goals')">Try Again</button>
      </div>`;
  }
});

// ---- Render ------------------------------------------------

function renderGoals() {
  const content = document.getElementById('main-content');

  if (!_goals.length) {
    content.innerHTML = `
      <div class="page goals-page">
        <div class="goals-empty-state">
          <div class="goals-empty-state__icon">&#9678;</div>
          <div class="goals-empty-state__text">No savings goals yet.</div>
          <div class="goals-empty-state__hint">Tap <strong>+</strong> to set your first savings goal.</div>
        </div>
      </div>`;
    return;
  }

  const sorted = _goals.slice().sort((a, b) => a.targetDate.localeCompare(b.targetDate));

  content.innerHTML = `
    <div class="page goals-page">
      <div class="stack--3">${sorted.map(buildGoalCard).join('')}</div>
    </div>`;

  sorted.forEach(g => {
    const el = document.getElementById(`goal-${g.goalId}`);
    if (!el) return;
    el.querySelector('.goal-contribute-btn')?.addEventListener('click', () => openContributeModal(g));
    el.querySelector('.goal-history-btn')?.addEventListener('click', () => openHistorySheet(g));
    el.querySelector('.goal-edit-btn')?.addEventListener('click', () => openGoalSheet(g));
    el.querySelector('.goal-delete-btn')?.addEventListener('click', () => confirmDeleteGoal(g));
  });
}

function buildGoalCard(g) {
  const pct = g.targetAmount > 0
    ? Math.min(100, Math.round((g.currentSaved || 0) / g.targetAmount * 100))
    : 0;
  const remaining = Math.max(0, g.targetAmount - (g.currentSaved || 0));
  const targetFmt = new Date(g.targetDate + 'T00:00:00Z')
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const isComplete  = pct >= 100;
  const entryCount  = Array.isArray(g.contributionEntries) ? g.contributionEntries.length : 0;
  const historyBtn  = entryCount > 0
    ? `<button class="btn btn--ghost goal-history-btn goal-card__btn-secondary">History (${entryCount})</button>`
    : '';
  const barFill = pct > 0
    ? `<div class="goal-bar__fill${isComplete ? ' goal-bar__fill--complete' : ''}" style="width:${pct}%;"></div>`
    : '';

  return `
    <div class="card goal-card${isComplete ? ' goal-card--complete' : ''}" id="goal-${g.goalId}">
      <div class="goal-card__header">
        <div class="goal-card__name-area">
          <div class="card-header goal-card__name">${esc(g.name)}</div>
          <div class="text-muted text-sm goal-card__date">Target: ${targetFmt}</div>
        </div>
        <div class="goal-card__amount-area">
          <div class="goal-card__saved">${gMoney(g.currentSaved || 0)}</div>
          <div class="text-muted text-sm">of ${gMoney(g.targetAmount)}</div>
        </div>
      </div>
      <div class="goal-bar">${barFill}</div>
      <div class="goal-card__stats">
        <span class="text-muted text-sm">${pct}% saved${isComplete ? ' — Goal reached!' : ''}</span>
        <span class="text-muted text-sm">${isComplete ? '' : gMoney(remaining) + ' to go'}</span>
      </div>
      <div class="goal-card__actions">
        <button class="btn btn--primary goal-contribute-btn goal-card__btn-contribute">Log Contribution</button>
        ${historyBtn}
        <button class="btn btn--ghost goal-edit-btn goal-card__btn-secondary">Edit</button>
        <button class="btn btn--danger goal-delete-btn goal-card__btn-secondary">Delete</button>
      </div>
    </div>`;
}

// ---- Goal Sheet (Create / Edit) ----------------------------

function openGoalSheet(goal) {
  const editing = !!goal;
  const today   = effectiveToday();

  document.body.insertAdjacentHTML('beforeend', `
    <div id="goal-sheet-overlay" class="sheet-overlay"></div>
    <div id="goal-sheet" class="sheet">
      <div class="sheet__handle"></div>
      <div class="sheet__title">${editing ? 'Edit Goal' : 'New Goal'}</div>
      <div class="stack--4">

        <div class="gs-section">
          <div class="gs-section__label">Goal Details</div>
          <div class="form-group">
            <label class="form-label" for="gs-name">Goal name</label>
            <input class="form-input" id="gs-name" type="text" placeholder="e.g. Emergency Fund"
              value="${editing ? esc(goal.name) : ''}" />
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label" for="gs-target">Target amount</label>
            <div class="ob-input-money">
              <input class="form-input" id="gs-target" type="number" placeholder="0.00"
                min="0" step="0.01" style="padding-left:28px;"
                value="${editing ? goal.targetAmount : ''}" />
            </div>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label" for="gs-date">Target date</label>
            <input class="form-input" id="gs-date" type="date"
              value="${editing ? goal.targetDate : ''}" min="${today}" />
          </div>
        </div>

        ${editing ? `
        <div class="gs-section">
          <div class="gs-section__label">Current Saved</div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label" for="gs-saved">Amount currently in this goal</label>
            <div class="ob-input-money">
              <input class="form-input" id="gs-saved" type="number" placeholder="0.00"
                min="0" step="0.01" style="padding-left:28px;"
                value="${goal.currentSaved || 0}" />
            </div>
            <p class="gs-hint">Changing this creates a visible "Manual adjustment" entry in your contribution history so the total stays consistent.</p>
          </div>
        </div>` : ''}

        <div class="gs-section">
          <div class="gs-section__label">Planning <span class="gs-section__label-sub">(projection only)</span></div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label" for="gs-planned">Planned contribution per period <span class="text-muted">(optional)</span></label>
            <div class="ob-input-money">
              <input class="form-input" id="gs-planned" type="number" placeholder="0.00"
                min="0" step="0.01" style="padding-left:28px;"
                value="${editing && goal.plannedContribution ? goal.plannedContribution : ''}" />
            </div>
            <p class="gs-hint">Used for future projections only. Does not automatically add to your saved total.</p>
          </div>
        </div>

        <div style="display:flex;gap:12px;padding-top:4px;">
          <button class="btn btn--ghost btn--full" id="gs-cancel">Cancel</button>
          <button class="btn btn--primary btn--full" id="gs-save">${editing ? 'Save Changes' : 'Create Goal'}</button>
        </div>

      </div>
    </div>`);

  requestAnimationFrame(() => {
    document.getElementById('goal-sheet-overlay').classList.add('is-open');
    document.getElementById('goal-sheet').classList.add('is-open');
  });

  const closeSheet = () => {
    document.getElementById('goal-sheet-overlay').classList.remove('is-open');
    const sheet = document.getElementById('goal-sheet');
    sheet.classList.remove('is-open');
    sheet.addEventListener('transitionend', () => {
      document.getElementById('goal-sheet-overlay')?.remove();
      document.getElementById('goal-sheet')?.remove();
    }, { once: true });
  };

  document.getElementById('goal-sheet-overlay').addEventListener('click', closeSheet);
  document.getElementById('gs-cancel').addEventListener('click', closeSheet);

  document.getElementById('gs-save').addEventListener('click', async () => {
    const name         = document.getElementById('gs-name').value.trim();
    const targetAmount = document.getElementById('gs-target').value;
    const targetDate   = document.getElementById('gs-date').value;
    const planned      = document.getElementById('gs-planned').value;
    const savedEl      = document.getElementById('gs-saved');
    const savedVal     = savedEl ? savedEl.value : null;

    if (!name)         { alert('Enter a goal name.'); return; }
    if (!targetAmount) { alert('Enter a target amount.'); return; }
    if (!targetDate)   { alert('Enter a target date.'); return; }

    const btn = document.getElementById('gs-save');
    btn.textContent = 'Saving…';
    btn.disabled    = true;

    const payload = {
      userId: userId(), scenarioId: activeScenario(), name,
      targetAmount: Number(targetAmount),
      targetDate,
      ...(savedVal !== null && savedVal !== '' && { currentSaved: Number(savedVal) }),
      ...(planned && { plannedContribution: Number(planned) }),
    };

    try {
      if (editing) {
        const res = await authFetch(`/api/goals/${userId()}/${goal.goalId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Save failed');
      } else {
        const res = await authFetch('/api/goals', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Save failed');
      }
      Store.invalidate('goals');
      _goals = await Store.get('goals');
      closeSheet();
      renderGoals();
    } catch (err) {
      console.error(err);
      btn.textContent = 'Try Again';
      btn.disabled    = false;
    }
  });
}

// ---- Contribute Modal --------------------------------------

function openContributeModal(goal) {
  const today = effectiveToday();
  const pct   = goal.targetAmount > 0
    ? Math.min(100, Math.round((goal.currentSaved || 0) / goal.targetAmount * 100))
    : 0;

  document.body.insertAdjacentHTML('beforeend', `
    <div id="contrib-overlay" class="sheet-overlay"></div>
    <div id="contrib-sheet" class="sheet">
      <div class="sheet__handle"></div>
      <div class="sheet__title">Log Contribution</div>
      <div class="stack--4">

        <div>
          <div class="card-header" style="margin-bottom:2px;">${esc(goal.name)}</div>
          <div class="text-muted text-sm">${pct}% saved · ${gMoney(goal.currentSaved || 0)} of ${gMoney(goal.targetAmount)}</div>
        </div>

        <div class="form-group">
          <label class="form-label" for="ct-amount">Amount</label>
          <div class="ob-input-money">
            <input class="form-input" id="ct-amount" type="number" placeholder="0.00"
              min="0" step="0.01" style="padding-left:28px;" />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="ct-date">Date</label>
          <input class="form-input" id="ct-date" type="date" value="${today}" />
        </div>

        <div class="form-group">
          <label class="form-label" for="ct-note">Note <span class="text-muted">(optional)</span></label>
          <input class="form-input" id="ct-note" type="text" placeholder="e.g. Monthly transfer" />
        </div>

        <div style="display:flex;gap:12px;padding-top:8px;">
          <button class="btn btn--ghost btn--full" id="ct-cancel">Cancel</button>
          <button class="btn btn--primary btn--full" id="ct-confirm">Log Contribution</button>
        </div>

      </div>
    </div>`);

  requestAnimationFrame(() => {
    document.getElementById('contrib-overlay').classList.add('is-open');
    document.getElementById('contrib-sheet').classList.add('is-open');
  });

  const closeModal = () => {
    document.getElementById('contrib-overlay').classList.remove('is-open');
    const sheet = document.getElementById('contrib-sheet');
    sheet.classList.remove('is-open');
    sheet.addEventListener('transitionend', () => {
      document.getElementById('contrib-overlay')?.remove();
      document.getElementById('contrib-sheet')?.remove();
    }, { once: true });
  };

  document.getElementById('contrib-overlay').addEventListener('click', closeModal);
  document.getElementById('ct-cancel').addEventListener('click', closeModal);

  document.getElementById('ct-confirm').addEventListener('click', async () => {
    const amount = document.getElementById('ct-amount').value;
    const date   = document.getElementById('ct-date').value;
    const note   = document.getElementById('ct-note').value.trim();
    if (!amount || Number(amount) <= 0) { alert('Enter a valid amount.'); return; }
    if (!date) { alert('Enter a date.'); return; }

    const btn = document.getElementById('ct-confirm');
    btn.textContent = 'Saving…';
    btn.disabled    = true;

    try {
      const res = await authFetch(`/api/goals/${userId()}/${goal.goalId}/contribute`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(amount), date, ...(note && { note }) }),
      });
      if (!res.ok) throw new Error('Contribution failed');
      Store.invalidate('goals');
      _goals = await Store.get('goals');
      closeModal();
      renderGoals();
      showGoalToast('Nice — you\'re one step closer.');
    } catch (err) {
      console.error(err);
      btn.textContent = 'Try Again';
      btn.disabled    = false;
    }
  });
}

// ---- History Sheet -----------------------------------------

function openHistorySheet(goal) {
  document.body.insertAdjacentHTML('beforeend', `
    <div id="history-overlay" class="sheet-overlay"></div>
    <div id="history-sheet" class="sheet">
      <div class="sheet__handle"></div>
      <div class="sheet__title">Contribution History</div>
      <div class="card-header" id="history-goal-name" style="margin-bottom:4px;">${esc(goal.name)}</div>
      <div class="text-muted text-sm" id="history-goal-summary" style="margin-bottom:var(--space-3);"></div>
      <div id="history-entries" class="history-list"></div>
      <div style="margin-top:var(--space-4);">
        <button class="btn btn--ghost btn--full" id="history-close">Close</button>
      </div>
    </div>`);

  requestAnimationFrame(() => {
    document.getElementById('history-overlay').classList.add('is-open');
    document.getElementById('history-sheet').classList.add('is-open');
  });

  _renderHistoryEntries(goal);

  const close = () => {
    document.getElementById('history-overlay').classList.remove('is-open');
    const sheet = document.getElementById('history-sheet');
    sheet.classList.remove('is-open');
    sheet.addEventListener('transitionend', () => {
      document.getElementById('history-overlay')?.remove();
      document.getElementById('history-sheet')?.remove();
    }, { once: true });
  };

  document.getElementById('history-overlay').addEventListener('click', close);
  document.getElementById('history-close').addEventListener('click', close);
}

function _renderHistoryEntries(goal) {
  const summaryEl = document.getElementById('history-goal-summary');
  const listEl    = document.getElementById('history-entries');
  if (!listEl) return;

  const entries = Array.isArray(goal.contributionEntries) ? goal.contributionEntries : [];
  const sorted  = entries.slice().sort((a, b) => b.date.localeCompare(a.date));

  if (summaryEl) {
    const count = entries.length;
    summaryEl.textContent = `${gMoney(goal.currentSaved || 0)} saved total · ${count} entr${count !== 1 ? 'ies' : 'y'}`;
  }

  if (!sorted.length) {
    listEl.innerHTML = '<div class="text-muted text-sm" style="padding:var(--space-3) 0;">No contributions logged yet.</div>';
    return;
  }

  listEl.innerHTML = sorted.map(e => `
    <div class="history-entry" data-id="${e.id}">
      <div class="history-entry__body">
        <div class="history-entry__row1">
          <span class="history-entry__amount">${gMoney(e.amount)}</span>
          <span class="text-muted text-sm history-entry__date">${gHistoryDate(e.date)}</span>
        </div>
        ${e.note ? `<div class="text-muted text-sm history-entry__note">${esc(e.note)}</div>` : ''}
      </div>
      <div class="history-entry__actions">
        <button class="btn btn--ghost history-edit-btn" style="font-size:12px;padding:4px 10px;" data-id="${e.id}">Edit</button>
        <button class="btn btn--danger history-delete-btn" style="font-size:12px;padding:4px 10px;" data-id="${e.id}">Delete</button>
      </div>
    </div>`).join('');

  // Delete handlers
  listEl.querySelectorAll('.history-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const entryId = btn.dataset.id;
      const entry   = entries.find(e => e.id === entryId);
      const label   = entry ? gMoney(entry.amount) + ' on ' + gHistoryDate(entry.date) : 'this entry';
      if (!confirm(`Delete ${label}? This will subtract it from your saved total.`)) return;
      btn.disabled = true;
      try {
        const res = await authFetch(`/api/goals/${userId()}/${goal.goalId}/contributions/${entryId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Delete failed');
        Store.invalidate('goals');
        _goals = await Store.get('goals');
        renderGoals();
        const updated = _goals.find(g => g.goalId === goal.goalId);
        if (updated) _renderHistoryEntries(updated);
      } catch (err) {
        console.error(err);
        btn.disabled = false;
        alert('Delete failed. Try again.');
      }
    });
  });

  // Edit handlers — inline edit form replaces the row
  listEl.querySelectorAll('.history-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const entryId = btn.dataset.id;
      const entry   = entries.find(e => e.id === entryId);
      if (!entry) return;
      _openInlineEntryEdit(goal, entry);
    });
  });
}

function _openInlineEntryEdit(goal, entry) {
  const listEl = document.getElementById('history-entries');
  if (!listEl) return;
  const row = listEl.querySelector(`[data-id="${entry.id}"]`);
  if (!row) return;

  row.classList.add('history-entry--editing');
  row.innerHTML = `
    <div class="history-entry__edit-form">
      <div class="history-entry__edit-row">
        <div class="form-group" style="flex:1;margin-bottom:0;">
          <label class="form-label" style="font-size:11px;">Amount</label>
          <div class="ob-input-money">
            <input class="form-input he-amount" type="number" placeholder="0.00"
              min="0" step="0.01" style="padding-left:28px;" value="${entry.amount}" />
          </div>
        </div>
        <div class="form-group" style="flex:1;margin-bottom:0;">
          <label class="form-label" style="font-size:11px;">Date</label>
          <input class="form-input he-date" type="date" value="${entry.date}" />
        </div>
      </div>
      <div class="form-group" style="margin-bottom:var(--space-2);">
        <label class="form-label" style="font-size:11px;">Note <span class="text-muted">(optional)</span></label>
        <input class="form-input he-note" type="text" value="${esc(entry.note || '')}" placeholder="e.g. Monthly transfer" />
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn--primary he-save" style="font-size:12px;padding:6px 12px;flex:1;">Save</button>
        <button class="btn btn--ghost he-cancel" style="font-size:12px;padding:6px 12px;">Cancel</button>
      </div>
    </div>`;

  row.querySelector('.he-cancel').addEventListener('click', () => {
    const current = _goals.find(g => g.goalId === goal.goalId) || goal;
    _renderHistoryEntries(current);
  });

  row.querySelector('.he-save').addEventListener('click', async () => {
    const amount = row.querySelector('.he-amount').value;
    const date   = row.querySelector('.he-date').value;
    const note   = row.querySelector('.he-note').value.trim();
    if (!amount || Number(amount) <= 0) { alert('Enter a valid amount.'); return; }
    if (!date) { alert('Enter a date.'); return; }

    const saveBtn = row.querySelector('.he-save');
    saveBtn.textContent = 'Saving…'; saveBtn.disabled = true;

    try {
      const res = await authFetch(`/api/goals/${userId()}/${goal.goalId}/contributions/${entry.id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ amount: Number(amount), date, ...(note && { note }) }),
      });
      if (!res.ok) throw new Error('Save failed');
      Store.invalidate('goals');
      _goals = await Store.get('goals');
      renderGoals();
      const updated = _goals.find(g => g.goalId === goal.goalId);
      if (updated) _renderHistoryEntries(updated);
    } catch (err) {
      console.error(err);
      saveBtn.textContent = 'Try Again'; saveBtn.disabled = false;
    }
  });
}

// ---- Delete Goal -------------------------------------------

async function confirmDeleteGoal(goal) {
  if (!confirm(`Delete "${goal.name}"? This can't be undone.`)) return;
  try {
    const res = await authFetch(`/api/goals/${userId()}/${goal.goalId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
    Store.invalidate('goals');
    _goals = await Store.get('goals');
    renderGoals();
  } catch (err) {
    console.error(err);
    alert('Delete failed. Try again.');
  }
}

// ---- Toast -------------------------------------------------

function showGoalToast(msg) {
  const el = document.createElement('div');
  el.className   = 'goal-toast';
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-visible'));
  setTimeout(() => {
    el.classList.remove('is-visible');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
  }, 2500);
}

// ---- Helpers -----------------------------------------------

function gMoney(n) {
  const num = Number(n);
  const abs = Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (num < 0 ? '-$' : '$') + abs;
}

function gHistoryDate(dateStr) {
  return new Date(dateStr + 'T00:00:00Z')
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
