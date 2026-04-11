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
          <div class="goals-empty-state__icon">&#9734;</div>
          <div class="goals-empty-state__text">No savings goals yet.</div>
          <div class="goals-empty-state__hint">Tap <strong>+</strong> to create your first goal.</div>
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
    <div class="card" id="goal-${g.goalId}" style="padding:var(--space-3) var(--space-4);">
      <div style="display:flex;justify-content:space-between;align-items:start;gap:var(--space-2);margin-bottom:var(--space-2);">
        <div>
          <div class="card-header" style="margin-bottom:2px;">${esc(g.name)}</div>
          <div class="text-muted text-sm">Target: ${targetFmt}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:var(--font-weight-bold);font-size:var(--font-size-lg);letter-spacing:-0.02em;">${gMoney(g.currentSaved || 0)}</div>
          <div class="text-muted text-sm">of ${gMoney(g.targetAmount)}</div>
        </div>
      </div>
      <div class="spend-bar" style="margin-bottom:var(--space-1);">
        <div class="spend-bar__fill" style="width:${pct}%;${isComplete ? 'background:var(--color-accent);' : ''}"></div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span class="text-muted text-sm">${pct}% saved${isComplete ? ' — Goal reached!' : ''}</span>
        <span class="text-muted text-sm">${gMoney(remaining)} to go</span>
      </div>
      <div style="display:flex;gap:8px;margin-top:var(--space-3);padding-top:var(--space-3);border-top:1px solid var(--color-border);">
        <button class="btn btn--primary goal-contribute-btn" style="font-size:13px;padding:8px 16px;flex:1;">Log Contribution</button>
        <button class="btn btn--ghost goal-edit-btn" style="font-size:13px;padding:8px 16px;">Edit</button>
        <button class="btn btn--danger goal-delete-btn" style="font-size:13px;padding:8px 16px;">Delete</button>
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

// ---- Contribute Modal --------------------------------------

function openContributeModal(goal) {
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
          <label class="form-label" for="ct-amount">Contribution amount</label>
          <div class="ob-input-money">
            <input class="form-input" id="ct-amount" type="number" placeholder="0.00"
              min="0" step="0.01" style="padding-left:28px;"
              value="${goal.plannedContribution || ''}" />
          </div>
        </div>

        <div style="display:flex;gap:12px;padding-top:8px;">
          <button class="btn btn--ghost btn--full" id="ct-cancel">Cancel</button>
          <button class="btn btn--primary btn--full" id="ct-confirm">Confirm</button>
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
    if (!amount || Number(amount) <= 0) { alert('Enter a valid amount.'); return; }

    const btn = document.getElementById('ct-confirm');
    btn.textContent = 'Saving…';
    btn.disabled = true;

    try {
      const res = await authFetch(`/api/goals/${userId()}/${goal.goalId}/contribute`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(amount) }),
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
