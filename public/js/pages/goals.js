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
    el.querySelector('.goal-contribute-btn')?.addEventListener('click', () => openContributionsSheet(g));
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

        <div class="form-group">
          <label class="form-label" for="gs-planned">Planned contribution per period <span class="text-muted">(optional)</span></label>
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

// ---- Contributions Ledger Sheet ------------------------------------

function openContributionsSheet(goal) {
  _renderContribSheet(goal);
}

function _renderContribSheet(goal) {
  // Remove any existing sheet first (re-render after mutations)
  document.getElementById('contrib-overlay')?.remove();
  document.getElementById('contrib-sheet')?.remove();

  const contributions = Array.isArray(goal.contributions) ? goal.contributions : [];
  const pct = goal.targetAmount > 0
    ? Math.min(100, Math.round((goal.currentSaved || 0) / goal.targetAmount * 100))
    : 0;
  const today = effectiveToday();

  const entryRows = contributions.length
    ? contributions.slice().sort((a, b) => b.date.localeCompare(a.date)).map(c => `
        <div class="contrib-entry" data-id="${c.id}">
          <div class="contrib-entry__main">
            <span class="contrib-entry__amount">${gMoney(c.amount)}</span>
            <span class="contrib-entry__date text-muted text-sm">${fmtContribDate(c.date)}</span>
            ${c.note ? `<span class="contrib-entry__note text-muted text-sm">${esc(c.note)}</span>` : ''}
          </div>
          <div class="contrib-entry__actions">
            <button class="btn btn--ghost contrib-edit-btn" style="font-size:12px;padding:4px 10px;" data-id="${c.id}">Edit</button>
            <button class="btn btn--danger contrib-delete-btn" style="font-size:12px;padding:4px 10px;" data-id="${c.id}">Delete</button>
          </div>
        </div>`).join('')
    : '<div class="text-muted text-sm" style="padding:var(--space-2) 0;">No contributions yet.</div>';

  document.body.insertAdjacentHTML('beforeend', `
    <div id="contrib-overlay" class="sheet-overlay"></div>
    <div id="contrib-sheet" class="sheet contrib-sheet">
      <div class="sheet__handle"></div>
      <div class="sheet__title">Contributions — ${esc(goal.name)}</div>

      <div class="contrib-summary text-muted text-sm">
        ${gMoney(goal.currentSaved || 0)} saved · ${pct}% of ${gMoney(goal.targetAmount)}
      </div>

      <!-- Ledger -->
      <div class="contrib-ledger">${entryRows}</div>

      <!-- Add form -->
      <div class="contrib-add-form">
        <div class="card-header" style="font-size:var(--font-size-sm);margin-bottom:var(--space-2);">Add Contribution</div>
        <div style="display:flex;gap:var(--space-2);margin-bottom:var(--space-2);">
          <div class="form-group" style="flex:1;margin-bottom:0;">
            <label class="form-label" for="ct-amount">Amount</label>
            <div class="ob-input-money">
              <input class="form-input" id="ct-amount" type="number" placeholder="0.00"
                min="0" step="0.01" style="padding-left:28px;"
                value="${goal.plannedContribution || ''}" />
            </div>
          </div>
          <div class="form-group" style="flex:1;margin-bottom:0;">
            <label class="form-label" for="ct-date">Date</label>
            <input class="form-input" id="ct-date" type="date" value="${today}" />
          </div>
        </div>
        <div class="form-group" style="margin-bottom:var(--space-3);">
          <label class="form-label" for="ct-note">Note <span class="text-muted">(optional)</span></label>
          <input class="form-input" id="ct-note" type="text" placeholder="e.g. Monthly transfer" />
        </div>
        <button class="btn btn--primary btn--full" id="ct-add">Add Contribution</button>
      </div>

      <!-- Footer actions -->
      <div class="contrib-footer">
        <button class="btn btn--ghost btn--full" id="ct-close">Close</button>
        ${contributions.length > 0
          ? '<button class="btn btn--danger" id="ct-reset" style="white-space:nowrap;">Reset All</button>'
          : ''}
      </div>
    </div>`);

  requestAnimationFrame(() => {
    document.getElementById('contrib-overlay').classList.add('is-open');
    document.getElementById('contrib-sheet').classList.add('is-open');
  });

  const closeSheet = () => {
    document.getElementById('contrib-overlay')?.classList.remove('is-open');
    const sheet = document.getElementById('contrib-sheet');
    if (!sheet) return;
    sheet.classList.remove('is-open');
    sheet.addEventListener('transitionend', () => {
      document.getElementById('contrib-overlay')?.remove();
      document.getElementById('contrib-sheet')?.remove();
    }, { once: true });
  };

  document.getElementById('contrib-overlay').addEventListener('click', closeSheet);
  document.getElementById('ct-close').addEventListener('click', closeSheet);

  // Add contribution
  document.getElementById('ct-add').addEventListener('click', async () => {
    const amount = document.getElementById('ct-amount').value;
    const date   = document.getElementById('ct-date').value;
    const note   = document.getElementById('ct-note').value.trim();
    if (!amount || Number(amount) <= 0) { alert('Enter a valid amount.'); return; }
    if (!date) { alert('Enter a date.'); return; }

    const btn = document.getElementById('ct-add');
    btn.textContent = 'Saving…'; btn.disabled = true;

    try {
      const res = await authFetch(`/api/goals/${userId()}/${goal.goalId}/contributions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(amount), date, ...(note && { note }) }),
      });
      if (!res.ok) throw new Error('Add failed');
      await _refreshGoalsAndRerender(goal.goalId);
    } catch (err) {
      console.error(err);
      btn.textContent = 'Add Contribution'; btn.disabled = false;
    }
  });

  // Edit contribution
  document.querySelectorAll('.contrib-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const contribId = btn.dataset.id;
      const entry = contributions.find(c => c.id === contribId);
      if (!entry) return;
      _openEditEntrySheet(goal, entry);
    });
  });

  // Delete single contribution
  document.querySelectorAll('.contrib-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const contribId = btn.dataset.id;
      const entry = contributions.find(c => c.id === contribId);
      if (!confirm(`Delete this contribution (${entry ? gMoney(entry.amount) : ''})?`)) return;
      btn.disabled = true;
      try {
        const res = await authFetch(`/api/goals/${userId()}/${goal.goalId}/contributions/${contribId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Delete failed');
        await _refreshGoalsAndRerender(goal.goalId);
      } catch (err) {
        console.error(err);
        btn.disabled = false;
        alert('Delete failed. Try again.');
      }
    });
  });

  // Reset all
  document.getElementById('ct-reset')?.addEventListener('click', async () => {
    if (!confirm('Delete all contributions and reset to $0.00?')) return;
    const btn = document.getElementById('ct-reset');
    btn.disabled = true;
    try {
      const res = await authFetch(`/api/goals/${userId()}/${goal.goalId}/contributions`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Reset failed');
      await _refreshGoalsAndRerender(goal.goalId);
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      alert('Reset failed. Try again.');
    }
  });
}

function _openEditEntrySheet(goal, entry) {
  // Close contributions sheet temporarily
  document.getElementById('contrib-overlay')?.remove();
  document.getElementById('contrib-sheet')?.remove();

  document.body.insertAdjacentHTML('beforeend', `
    <div id="edit-entry-overlay" class="sheet-overlay"></div>
    <div id="edit-entry-sheet" class="sheet">
      <div class="sheet__handle"></div>
      <div class="sheet__title">Edit Contribution</div>
      <div class="stack--4">
        <div class="form-group">
          <label class="form-label" for="ee-amount">Amount</label>
          <div class="ob-input-money">
            <input class="form-input" id="ee-amount" type="number" placeholder="0.00"
              min="0" step="0.01" style="padding-left:28px;" value="${entry.amount}" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="ee-date">Date</label>
          <input class="form-input" id="ee-date" type="date" value="${entry.date}" />
        </div>
        <div class="form-group">
          <label class="form-label" for="ee-note">Note <span class="text-muted">(optional)</span></label>
          <input class="form-input" id="ee-note" type="text" value="${esc(entry.note || '')}" placeholder="e.g. Monthly transfer" />
        </div>
        <div style="display:flex;gap:12px;padding-top:8px;">
          <button class="btn btn--ghost btn--full" id="ee-cancel">Cancel</button>
          <button class="btn btn--primary btn--full" id="ee-save">Save Changes</button>
        </div>
      </div>
    </div>`);

  requestAnimationFrame(() => {
    document.getElementById('edit-entry-overlay').classList.add('is-open');
    document.getElementById('edit-entry-sheet').classList.add('is-open');
  });

  const closeEdit = (reopen) => {
    document.getElementById('edit-entry-overlay')?.classList.remove('is-open');
    const sheet = document.getElementById('edit-entry-sheet');
    if (!sheet) return;
    sheet.classList.remove('is-open');
    sheet.addEventListener('transitionend', () => {
      document.getElementById('edit-entry-overlay')?.remove();
      document.getElementById('edit-entry-sheet')?.remove();
      if (reopen) {
        const updatedGoal = _goals.find(g => g.goalId === goal.goalId) || goal;
        _renderContribSheet(updatedGoal);
      }
    }, { once: true });
  };

  document.getElementById('edit-entry-overlay').addEventListener('click', () => closeEdit(true));
  document.getElementById('ee-cancel').addEventListener('click', () => closeEdit(true));

  document.getElementById('ee-save').addEventListener('click', async () => {
    const amount = document.getElementById('ee-amount').value;
    const date   = document.getElementById('ee-date').value;
    const note   = document.getElementById('ee-note').value.trim();
    if (!amount || Number(amount) <= 0) { alert('Enter a valid amount.'); return; }
    if (!date) { alert('Enter a date.'); return; }

    const btn = document.getElementById('ee-save');
    btn.textContent = 'Saving…'; btn.disabled = true;

    try {
      const res = await authFetch(`/api/goals/${userId()}/${goal.goalId}/contributions/${entry.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(amount), date, ...(note && { note }) }),
      });
      if (!res.ok) throw new Error('Save failed');
      await _refreshGoals();
      closeEdit(true);
    } catch (err) {
      console.error(err);
      btn.textContent = 'Try Again'; btn.disabled = false;
    }
  });
}

// Refresh goals cache and re-render the contributions sheet for a given goalId
async function _refreshGoalsAndRerender(goalId) {
  await _refreshGoals();
  const updatedGoal = _goals.find(g => g.goalId === goalId);
  if (updatedGoal) {
    _renderContribSheet(updatedGoal);
  } else {
    // Goal was deleted (shouldn't happen here, but handle gracefully)
    document.getElementById('contrib-overlay')?.remove();
    document.getElementById('contrib-sheet')?.remove();
  }
  renderGoals();
}

async function _refreshGoals() {
  Store.invalidate('goals');
  _goals = await Store.get('goals');
}

function fmtContribDate(dateStr) {
  return new Date(dateStr + 'T00:00:00Z')
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
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
