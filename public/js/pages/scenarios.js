// ============================================================
// Scenarios — Profile Manager
// ============================================================

Router.register('scenarios', async () => {
  document.getElementById('page-title').textContent = 'Scenarios';
  setActivePage('scenarios');
  showBottomNav(true);
  showFab(true);

  document.getElementById('fab').textContent = '+';
  document.getElementById('fab').onclick = () => openNewScenarioSheet();

  document.getElementById('main-content').innerHTML = `
    <div class="page">
      <div class="text-muted text-sm text-center" style="padding:64px 0;">Loading…</div>
    </div>`;

  try {
    Store.invalidate('scenarios');
    const scenarios = await Store.get('scenarios');
    renderScenarios(scenarios);
  } catch (err) {
    console.error(err);
    document.getElementById('main-content').innerHTML = `
      <div class="page text-center" style="padding-top:64px;">
        <p class="text-muted text-sm">Failed to load scenarios.</p>
        <button class="btn btn--ghost" style="margin-top:var(--space-3);" onclick="Router.navigate('scenarios')">Try Again</button>
      </div>`;
  }
});

// ---- Render ------------------------------------------------

function renderScenarios(scenarios) {
  // Sort: primary first, then by name
  const sorted = scenarios.slice().sort((a, b) => {
    if (a.isPrimary) return -1;
    if (b.isPrimary) return 1;
    return a.name.localeCompare(b.name);
  });

  const maxScenarios = Plans.getLimit('maxScenarios');
  const isLimited = typeof maxScenarios === 'number' && maxScenarios !== Infinity;
  const usageLine = isLimited
    ? `${sorted.length} of ${maxScenarios} scenario${maxScenarios !== 1 ? 's' : ''} used`
    : `${sorted.length} scenario${sorted.length !== 1 ? 's' : ''}`;

  document.getElementById('main-content').innerHTML = `
    <div class="page">
      <div class="text-muted text-sm" style="margin-bottom:var(--space-4);">
        ${usageLine}. Tap to switch.${isLimited && sorted.length >= maxScenarios ? ' <a href="javascript:void(0)" id="sc-usage-upgrade" style="color:var(--color-accent);font-weight:600;">Upgrade for more</a>' : ''}
      </div>
      <div class="stack--3">${sorted.map(s => buildScenarioCard(s)).join('')}</div>
    </div>`;

  // Wire usage upgrade link
  document.getElementById('sc-usage-upgrade')?.addEventListener('click', () => Plans.showUpgradeModal(Plans.UPGRADE_CONTEXT.scenarios));

  // Wire up card actions
  sorted.forEach(s => {
    const card = document.getElementById(`sc-${s.scenarioId}`);
    if (!card) return;

    // Tap card body to switch
    card.querySelector('.sc-card__body').addEventListener('click', () => {
      if (s.scenarioId !== _activeScenario) {
        setScenario(s.scenarioId).then(() => Router.navigate('scenarios'));
      }
    });

    // Rename
    card.querySelector('.sc-rename-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      startRename(s);
    });

    // Clear expenses
    card.querySelector('.sc-clear-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmClearScenario(s);
    });

    // Set as Main
    card.querySelector('.sc-promote-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmSetAsMain(s);
    });

    // Delete
    card.querySelector('.sc-delete-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmDeleteScenario(s);
    });
  });
}

function buildScenarioCard(s) {
  const isActive = s.scenarioId === _activeScenario;
  const isPrimary = !!s.isPrimary;
  const cadenceLabel = s.cadence === 'biweekly' ? 'Bi-weekly' : 'Monthly';
  const incomeFmt = '$' + Number(s.income).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const badges = [];
  if (isPrimary) badges.push('<span class="sc-card__badge sc-card__badge--primary">Primary</span>');
  if (isActive)  badges.push('<span class="sc-card__badge">Active</span>');

  return `
    <div class="card sc-card ${isActive ? 'sc-card--active' : ''}" id="sc-${esc(s.scenarioId)}">
      <div class="sc-card__body" style="cursor:pointer;">
        <div style="display:flex;justify-content:space-between;align-items:start;gap:var(--space-2);">
          <div>
            <div class="sc-card__name" id="sc-name-${esc(s.scenarioId)}">${esc(s.name)}</div>
            <div class="text-muted text-sm" style="margin-top:2px;">${cadenceLabel} · ${incomeFmt}/check</div>
          </div>
          <div style="display:flex;gap:var(--space-1);">${badges.join('')}</div>
        </div>
      </div>
      <div class="sc-card__actions">
        <button class="btn btn--ghost sc-rename-btn" style="font-size:13px;padding:6px 12px;">Rename</button>
        <button class="btn btn--ghost sc-clear-btn" style="font-size:13px;padding:6px 12px;">Clear</button>
        ${!isPrimary ? `<button class="btn btn--ghost sc-promote-btn" style="font-size:13px;padding:6px 12px;">Set as Main</button>` : ''}
        <button class="btn btn--danger sc-delete-btn" style="font-size:13px;padding:6px 12px;">Delete</button>
      </div>
    </div>`;
}

// ---- Rename (inline) ---------------------------------------

function startRename(scenario) {
  const nameEl = document.getElementById(`sc-name-${scenario.scenarioId}`);
  if (!nameEl) return;
  const currentName = scenario.name;

  nameEl.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;">
      <input type="text" class="form-input" id="sc-rename-input" value="${esc(currentName)}"
        style="font-size:var(--font-size-md);padding:4px 8px;flex:1;min-width:0;" />
      <button class="btn btn--primary" id="sc-rename-save" style="font-size:12px;padding:4px 12px;">Save</button>
      <button class="btn btn--ghost" id="sc-rename-cancel" style="font-size:12px;padding:4px 12px;">Cancel</button>
    </div>`;

  const input = document.getElementById('sc-rename-input');
  input.focus();
  input.select();

  const cancel = () => { nameEl.textContent = currentName; };

  document.getElementById('sc-rename-cancel').addEventListener('click', (e) => {
    e.stopPropagation();
    cancel();
  });

  document.getElementById('sc-rename-save').addEventListener('click', async (e) => {
    e.stopPropagation();
    const newName = input.value.trim();
    if (!newName) { alert('Enter a name.'); return; }
    if (newName === currentName) { cancel(); return; }

    try {
      const res = await authFetch(`/api/scenarios/${userId()}/${scenario.scenarioId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      if (!res.ok) throw new Error('Rename failed');
      Store.invalidate('scenarios');
      Store.invalidate('scenario');
      const scenarios = await Store.get('scenarios');
      renderScenarios(scenarios);
      updateScenarioSelector();
    } catch (err) {
      console.error(err);
      alert('Rename failed. Try again.');
      cancel();
    }
  });
}

// ---- Delete ------------------------------------------------

async function confirmDeleteScenario(scenario) {
  if (scenario.isPrimary) {
    // Primary scenario — require typed confirmation via modal
    openDeletePrimarySheet(scenario);
    return;
  }
  if (!confirm(`Delete "${scenario.name}"? It will be removed from your scenarios and can be restored within 14 days.`)) return;
  await executeDeleteScenario(scenario);
}

async function executeDeleteScenario(scenario) {
  try {
    // If deleting the active scenario, switch to primary first
    if (scenario.scenarioId === _activeScenario) {
      Store.invalidate('scenarios');
      const all = await Store.get('scenarios');
      const primary = all.find(s => s.isPrimary) || all.find(s => s.scenarioId !== scenario.scenarioId);
      if (primary) await setScenario(primary.scenarioId);
    }

    const res = await authFetch(`/api/scenarios/${userId()}/${scenario.scenarioId}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Delete failed');
    }

    Store.invalidate('scenarios');
    const scenarios = await Store.get('scenarios');
    renderScenarios(scenarios);
    updateScenarioSelector();
  } catch (err) {
    console.error(err);
    alert(err.message || 'Delete failed. Try again.');
  }
}

function openDeletePrimarySheet(scenario) {
  document.body.insertAdjacentHTML('beforeend', `
    <div id="del-sheet-overlay" class="sheet-overlay"></div>
    <div id="del-sheet" class="sheet">
      <div class="sheet__handle"></div>
      <div class="sheet__title">Delete Primary Scenario?</div>
      <div class="stack--4">
        <p class="text-muted text-sm">
          You are about to delete <strong>${esc(scenario.name)}</strong>, your primary scenario.
          Another scenario will be promoted to primary automatically. This can be restored within 14 days.
        </p>
        <div class="form-group">
          <label class="form-label" for="del-confirm-input">Type DELETE to confirm</label>
          <input class="form-input" id="del-confirm-input" type="text" placeholder="TYPE DELETE TO CONFIRM" autocomplete="off" />
        </div>
        <div style="display:flex;gap:12px;padding-top:8px;">
          <button class="btn btn--ghost btn--full" id="del-cancel">Cancel</button>
          <button class="btn btn--danger btn--full" id="del-confirm" disabled>Delete</button>
        </div>
      </div>
    </div>`);

  requestAnimationFrame(() => {
    document.getElementById('del-sheet-overlay').classList.add('is-open');
    document.getElementById('del-sheet').classList.add('is-open');
  });

  const closeSheet = () => {
    document.getElementById('del-sheet-overlay').classList.remove('is-open');
    const sheet = document.getElementById('del-sheet');
    sheet.classList.remove('is-open');
    sheet.addEventListener('transitionend', () => {
      document.getElementById('del-sheet-overlay')?.remove();
      document.getElementById('del-sheet')?.remove();
    }, { once: true });
  };

  document.getElementById('del-sheet-overlay').addEventListener('click', closeSheet);
  document.getElementById('del-cancel').addEventListener('click', closeSheet);

  const input = document.getElementById('del-confirm-input');
  const btn = document.getElementById('del-confirm');
  input.addEventListener('input', () => {
    btn.disabled = input.value.trim() !== 'DELETE';
  });

  btn.addEventListener('click', async () => {
    if (input.value.trim() !== 'DELETE') return;
    btn.textContent = 'Deleting…';
    btn.disabled = true;

    // Must promote another scenario first before deleting primary
    Store.invalidate('scenarios');
    const all = await Store.get('scenarios');
    const other = all.find(s => !s.isPrimary && s.scenarioId !== scenario.scenarioId);
    if (!other) {
      alert('Cannot delete the last scenario.');
      closeSheet();
      return;
    }
    // Promote another scenario to primary
    await authFetch(`/api/scenarios/${userId()}/${other.scenarioId}/promote`, { method: 'PATCH' });

    closeSheet();
    await executeDeleteScenario(scenario);
  });
}

// ---- Set as Main -------------------------------------------

async function confirmSetAsMain(scenario) {
  if (scenario.isPrimary) return;
  if (!confirm(`Make "${scenario.name}" the primary scenario?`)) return;

  try {
    const res = await authFetch(`/api/scenarios/${userId()}/${scenario.scenarioId}/promote`, { method: 'PATCH' });
    if (!res.ok) throw new Error('Promote failed');

    Store.invalidate('scenarios');
    Store.invalidate('scenario');
    const scenarios = await Store.get('scenarios');
    renderScenarios(scenarios);
    updateScenarioSelector();
  } catch (err) {
    console.error(err);
    alert('Failed to set as main. Try again.');
  }
}

// ---- Clear Expenses ----------------------------------------

async function confirmClearScenario(scenario) {
  if (!confirm(`Clear all expenses from "${scenario.name}"? Periods and financial setup will be kept. This can't be undone.`)) return;

  try {
    const res = await authFetch(`/api/scenarios/${userId()}/${scenario.scenarioId}/expenses`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Clear failed');

    Store.invalidate('expenses');
    Store.invalidate('scenarios');
    const scenarios = await Store.get('scenarios');
    renderScenarios(scenarios);
  } catch (err) {
    console.error(err);
    alert('Clear failed. Try again.');
  }
}

// ---- New Scenario Sheet ------------------------------------

async function openNewScenarioSheet() {
  let scenarios;
  try {
    scenarios = await Store.get('scenarios');
  } catch { scenarios = []; }

  // Plan gate: check scenario limit
  const maxScenarios = Plans.getLimit('maxScenarios');
  if (scenarios.length >= maxScenarios) {
    Plans.showUpgradeModal(Plans.UPGRADE_CONTEXT.scenarios);
    return;
  }

  const cloneOptions = scenarios.map(s =>
    `<option value="${esc(s.scenarioId)}" ${s.scenarioId === _activeScenario ? 'selected' : ''}>${esc(s.name)}</option>`
  ).join('');
  const options = `<option value="">Start from scratch (keep setup, no expenses)</option>${cloneOptions}`;

  document.body.insertAdjacentHTML('beforeend', `
    <div id="sc-sheet-overlay" class="sheet-overlay"></div>
    <div id="sc-sheet" class="sheet">
      <div class="sheet__handle"></div>
      <div class="sheet__title">New Scenario</div>
      <div class="stack--4">

        <div class="form-group">
          <label class="form-label" for="sc-new-name">Scenario name</label>
          <input class="form-input" id="sc-new-name" type="text" placeholder="e.g. Seattle, Vegas" />
        </div>

        <div class="form-group">
          <label class="form-label" for="sc-clone-from">Clone from</label>
          <select class="form-input" id="sc-clone-from">${options}</select>
          <div class="text-muted text-sm" id="sc-clone-hint" style="margin-top:var(--space-1);">
            Copies financial setup only. No expenses.
          </div>
        </div>

        <div style="display:flex;gap:12px;padding-top:8px;">
          <button class="btn btn--ghost btn--full" id="sc-cancel">Cancel</button>
          <button class="btn btn--primary btn--full" id="sc-create">Create</button>
        </div>

      </div>
    </div>`);

  requestAnimationFrame(() => {
    document.getElementById('sc-sheet-overlay').classList.add('is-open');
    document.getElementById('sc-sheet').classList.add('is-open');
  });

  const closeSheet = () => {
    document.getElementById('sc-sheet-overlay').classList.remove('is-open');
    const sheet = document.getElementById('sc-sheet');
    sheet.classList.remove('is-open');
    sheet.addEventListener('transitionend', () => {
      document.getElementById('sc-sheet-overlay')?.remove();
      document.getElementById('sc-sheet')?.remove();
    }, { once: true });
  };

  document.getElementById('sc-sheet-overlay').addEventListener('click', closeSheet);
  document.getElementById('sc-cancel').addEventListener('click', closeSheet);

  // Update hint text based on clone-from selection
  document.getElementById('sc-clone-from').addEventListener('change', (e) => {
    const hint = document.getElementById('sc-clone-hint');
    hint.textContent = e.target.value
      ? 'Copies financial setup and expenses from the selected scenario.'
      : 'Copies financial setup only. No expenses.';
  });

  document.getElementById('sc-create').addEventListener('click', async () => {
    const name = document.getElementById('sc-new-name').value.trim();
    const cloneFromVal = document.getElementById('sc-clone-from').value;
    const skipExpenses = !cloneFromVal;
    const cloneFrom = cloneFromVal || _activeScenario;

    if (!name) { alert('Enter a scenario name.'); return; }

    const btn = document.getElementById('sc-create');
    btn.textContent = 'Creating…';
    btn.disabled = true;

    try {
      const res = await authFetch('/api/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId(), name, cloneFrom, skipExpenses }),
      });
      if (!res.ok) throw new Error('Create failed');
      const data = await res.json();

      Store.invalidate('scenarios');
      closeSheet();
      await setScenario(data.scenarioId);
      Router.navigate('scenarios');
    } catch (err) {
      console.error(err);
      btn.textContent = 'Create';
      btn.disabled = false;
      alert('Failed to create scenario. Try again.');
    }
  });
}
