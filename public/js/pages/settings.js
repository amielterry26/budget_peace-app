// ============================================================
// Settings — per-scenario configuration
// ============================================================

Router.register('settings', async () => {
  document.getElementById('page-title').textContent = 'Settings';
  setActivePage('settings');
  showBottomNav(true);
  showFab(false);

  document.getElementById('main-content').innerHTML = `
    <div class="page">
      <div class="text-muted text-sm text-center" style="padding:64px 0;">Loading…</div>
    </div>`;

  try {
    const scenario = await Store.get('scenario');
    renderSettings(scenario);
  } catch (err) {
    console.error(err);
    document.getElementById('main-content').innerHTML = `
      <div class="page text-center" style="padding-top:64px;">
        <p class="text-muted text-sm">Failed to load settings.</p>
        <button class="btn btn--ghost" style="margin-top:var(--space-3);" onclick="Router.navigate('settings')">Try Again</button>
      </div>`;
  }
});

function renderSettings(scenario) {
  const cadence   = scenario.cadence || 'biweekly';
  const duration  = scenario.durationMonths || 6;
  const payDate   = scenario.firstPayDate || '';
  const income    = scenario.income || '';
  const name      = scenario.name || 'Main';
  const isMain    = scenario.scenarioId === 'main';

  const cadenceLabel = cadence === 'biweekly' ? 'bi-weekly' : 'monthly';
  const incomeFmt = '$' + Number(income).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  document.getElementById('main-content').innerHTML = `
    <div class="page settings-page">

      <!-- Scenario Profile -->
      <div class="card settings-profile-card">
        <div class="settings-profile-card__inner">
          <div>
            <div class="settings-profile-card__name">${esc(name)}</div>
            <div class="settings-profile-card__summary">
              ${cadenceLabel} · ${incomeFmt}/check · ${duration}-month horizon
            </div>
          </div>
          ${isMain
            ? '<span class="sc-card__badge">Active</span>'
            : (_activeScenario === scenario.scenarioId
              ? '<span class="sc-card__badge">Active</span>'
              : '')}
        </div>
      </div>

      <!-- Financial Setup -->
      <div class="card settings-setup-card">
        <div class="card-header settings-setup-card__title">Financial Setup</div>

        ${!isMain ? `
        <div class="form-group" style="margin-bottom:var(--space-3);">
          <label class="form-label" for="settings-name">Scenario name</label>
          <input class="form-input" type="text" id="settings-name" value="${esc(name)}" />
        </div>` : ''}

        <div class="form-group" style="margin-bottom:var(--space-3);">
          <label class="form-label">How often do you get paid?</label>
          <div class="option-grid option-grid--2">
            <div class="option-card settings-cadence ${cadence === 'biweekly' ? 'is-selected' : ''}" data-value="biweekly">
              <div class="option-card__title">Every 2 weeks</div>
              <div class="option-card__sub">26 paychecks / year</div>
            </div>
            <div class="option-card settings-cadence ${cadence === 'monthly' ? 'is-selected' : ''}" data-value="monthly">
              <div class="option-card__title">Monthly</div>
              <div class="option-card__sub">12 paychecks / year</div>
            </div>
          </div>
        </div>

        <div class="form-group" style="margin-bottom:var(--space-3);">
          <label class="form-label">Budget horizon</label>
          <div class="option-grid option-grid--3">
            ${[3,6,12].map(m => {
              const maxDur = Plans.getLimit('maxProjectionMonths');
              const locked = typeof maxDur === 'number' && m > maxDur;
              const selected = duration === m ? 'is-selected' : '';
              const lockedCls = locked ? 'is-locked' : '';
              return `
              <div class="option-card settings-duration ${selected} ${lockedCls}" data-value="${m}" ${locked ? 'data-locked="true"' : ''}>
                <div class="option-card__title">${m}${locked ? ' <span style="font-size:12px;">&#9733;</span>' : ''}</div>
                <div class="option-card__sub">${locked ? 'Pro' : 'months'}</div>
              </div>`;
            }).join('')}
          </div>
        </div>

        <div class="form-group" style="margin-bottom:var(--space-3);">
          <label class="form-label" for="settings-date">Pay start date</label>
          <input class="form-input" type="date" id="settings-date" value="${payDate}" />
        </div>

        <div class="form-group" style="margin-bottom:var(--space-3);">
          <label class="form-label" for="settings-income">Take-home per paycheck</label>
          <div class="ob-input-money">
            <input class="form-input" type="number" id="settings-income"
              placeholder="0.00" min="0" step="0.01" value="${income}" />
          </div>
        </div>

        <div class="settings-save-area">
          <button class="btn btn--primary btn--full" id="settings-save">Save Changes</button>
          <p class="text-muted text-sm text-center settings-save-area__hint">
            Changing your income updates all calculations instantly. Changing pay frequency, start date, or horizon will regenerate your pay periods.
          </p>
        </div>
      </div>

      <!-- Notes -->
      ${notesCardHtml('settings')}
    </div>`;

  // Track selected cadence + duration
  let selectedCadence  = cadence;
  let selectedDuration = duration;

  document.querySelectorAll('.settings-cadence').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.settings-cadence').forEach(c => c.classList.remove('is-selected'));
      card.classList.add('is-selected');
      selectedCadence = card.dataset.value;
    });
  });

  document.querySelectorAll('.settings-duration').forEach(card => {
    card.addEventListener('click', () => {
      if (card.dataset.locked === 'true') {
        Plans.showUpgradeModal(Plans.UPGRADE_CONTEXT.duration);
        return;
      }
      document.querySelectorAll('.settings-duration').forEach(c => c.classList.remove('is-selected'));
      card.classList.add('is-selected');
      selectedDuration = Number(card.dataset.value);
    });
  });

  document.getElementById('settings-save').addEventListener('click', async () => {
    const firstPayDate = document.getElementById('settings-date').value;
    const incomeVal    = document.getElementById('settings-income').value;
    const nameEl       = document.getElementById('settings-name');
    const scenarioName = nameEl ? nameEl.value.trim() : name;

    if (!firstPayDate) { alert('Enter your first pay date.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(firstPayDate) || isNaN(Date.parse(firstPayDate))) {
      alert('Enter a valid date.'); return;
    }
    if (!incomeVal) { alert('Enter your paycheck amount.'); return; }
    const parsedIncome = Number(incomeVal);
    if (!Number.isFinite(parsedIncome) || parsedIncome <= 0) {
      alert('Enter a valid positive amount.'); return;
    }

    const btn = document.getElementById('settings-save');
    btn.textContent = 'Saving…';
    btn.disabled = true;

    try {
      const res = await authFetch(`/api/scenarios/${encodeURIComponent(userId())}/${encodeURIComponent(scenario.scenarioId)}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:           scenarioName,
          cadence:        selectedCadence,
          durationMonths: selectedDuration,
          firstPayDate,
          income:         parsedIncome,
        }),
      });

      if (!res.ok) throw new Error('Save failed');
      const data = await res.json();

      Store.invalidate('scenario');
      Store.invalidate('periods');
      Store.invalidate('scenarios');

      const msg = data.periodsRegenerated ? 'Saved — periods regenerated' : 'Saved';
      btn.textContent = msg;
      setTimeout(() => { btn.textContent = 'Save Changes'; btn.disabled = false; }, 2000);
    } catch (err) {
      console.error(err);
      btn.textContent = 'Save Changes';
      btn.disabled = false;
      alert('Failed to save. Please try again.');
    }
  });

  // Notes widget
  mountNotesWidget('settings', scenario.scenarioId, scenario.notes);
}
