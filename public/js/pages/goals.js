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
  const isComplete = pct >= 100;
  const entryCount = Array.isArray(g.contributionEntries) ? g.contributionEntries.length : 0;
  const historyBtn = entryCount > 0
    ? `<button class="btn btn--ghost goal-history-btn goal-card__btn-secondary">History (${entryCount})</button>`
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
      <div class="goal-bar">
        <div class="goal-bar__fill${isComplete ? ' goal-bar__fill--complete' : ''}" style="width:${pct}%;"></div>
      </div>
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
  const today = effectiveToday();

  document.body.insertAdjacentHTML('beforeend', `
    <div id="goal-sheet-overlay" class="sheet-overlay"></div>
    <div id="goal-sheet" class="sheet">
      <div class="sheet__handle"></div>
      <div class="sheet__title">${editing ? 'Edit Goal' : 'New Goal'}</div>
      <div class="stack--4">

        <div class="form-group">
          <label class="form-label" for="gs-name">Goal name</label>
          <input class="form-input" id="gs-name" type="text" placeholder="e.g. Emergency Fund"
            value="${editing ? esc(goal.name) : ''}" />
        </div>

        <div class="form-group">
          <label class="form-label" for="gs-target">Target amount</label>
          <div class="ob-input-money">
            <input class="form-input" id="gs-target" type="number" placeholder="0.00"
              min="0" step="0.01" style="padding-left:28px;"
              value="${editing ? goal.targetAmount : ''}" />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="gs-date">Target date</label>
          <input class="form-input" id="gs-date" type="date"
            value="${editing ? goal.targetDate : ''}" min="${today}" />
        </div>

        ${editing ? `
        <div class="form-group">
          <label class="form-label" for="gs-saved">Current amount saved</label>
          <div class="ob-input-money">
            <input class="form-input" id="gs-saved" type="number" placeholder="0.00"
              min="0" step="0.01" style="padding-left:28px;"
              value="${goal.currentSaved || 0}" />
          </div>
          <p class="text-muted text-sm" style="margin-top:4px;">The actual amount in this goal right now. Editing this does not add a contribution entry.</p>
        </div>` : ''}

        <div class="form-group gs-planning-group">
          <label class="form-label" for="gs-planned">Planned contribution per period <span class="text-muted">(optional — for projections only)</span></label>
          <div class="ob-input-money">
            <input class="form-input" id="gs-planned" type="number" placeholder="0.00"
              min="0" step="0.01" style="padding-left:28px;"
              value="${editing && goal.plannedContribution ? goal.plannedContribution : ''}" />
          </div>
        </div>

        <div style="display:flex;gap:12px;padding-top:8px;">
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
    btn.disabled = true;

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
      btn.disabled = false;
    }
  });
}

// ---- Contribute Modal --------------------------------------

function openContributeModal(goal) {
  const today = effectiveToday();
  const pct = goal.targetAmount > 0
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
    btn.disabled = true;

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
    } catch (err) {
      console.error(err);
      btn.textContent = 'Try Again';
      btn.disabled = false;
    }
  });
}

// ---- History Sheet -----------------------------------------

function openHistorySheet(goal) {
  const entries = Array.isArray(goal.contributionEntries) ? goal.contributionEntries : [];
  const sorted  = entries.slice().sort((a, b) => b.date.localeCompare(a.date));

  const rows = sorted.length
    ? sorted.map(e => `
        <div class="history-entry">
          <div class="history-entry__left">
            <span class="history-entry__amount">${gMoney(e.amount)}</span>
            <span class="text-muted text-sm">${gHistoryDate(e.date)}</span>
          </div>
          ${e.note ? `<span class="text-muted text-sm history-entry__note">${esc(e.note)}</span>` : ''}
        </div>`).join('')
    : '<div class="text-muted text-sm" style="padding:var(--space-3) 0;">No contributions logged yet.</div>';

  document.body.insertAdjacentHTML('beforeend', `
    <div id="history-overlay" class="sheet-overlay"></div>
    <div id="history-sheet" class="sheet">
      <div class="sheet__handle"></div>
      <div class="sheet__title">Contribution History</div>
      <div class="card-header" style="margin-bottom:4px;">${esc(goal.name)}</div>
      <div class="text-muted text-sm" style="margin-bottom:var(--space-3);">${gMoney(goal.currentSaved || 0)} saved total · ${entries.length} entr${entries.length !== 1 ? 'ies' : 'y'}</div>
      <div class="history-list">${rows}</div>
      <div style="margin-top:var(--space-4);">
        <button class="btn btn--ghost btn--full" id="history-close">Close</button>
      </div>
    </div>`);

  requestAnimationFrame(() => {
    document.getElementById('history-overlay').classList.add('is-open');
    document.getElementById('history-sheet').classList.add('is-open');
  });

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

// ---- Delete ------------------------------------------------

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

// ---- Helpers -----------------------------------------------

function gMoney(n) {
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function gHistoryDate(dateStr) {
  return new Date(dateStr + 'T00:00:00Z')
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
