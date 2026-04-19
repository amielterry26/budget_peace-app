// ============================================================
// Settings — per-scenario configuration
// ============================================================

const SETTINGS_LS = {
  financial: 'bp_settings_financial_collapsed',
  notif:     'bp_settings_notif_collapsed',
};

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
    const [scenario, user] = await Promise.all([Store.get('scenario'), Store.get('user')]);
    renderSettings(scenario, user);
  } catch (err) {
    console.error(err);
    document.getElementById('main-content').innerHTML = `
      <div class="page text-center" style="padding-top:64px;">
        <p class="text-muted text-sm">Failed to load settings.</p>
        <button class="btn btn--ghost" style="margin-top:var(--space-3);" onclick="Router.navigate('settings')">Try Again</button>
      </div>`;
  }
});

function renderSettings(scenario, user) {
  const cadence   = scenario.cadence || 'biweekly';
  const duration  = scenario.durationMonths || 6;
  const payDate   = scenario.firstPayDate || '';
  const income    = scenario.income || '';
  const name      = scenario.name || 'Main';
  const isMain    = scenario.scenarioId === 'main';

  const cadenceLabel = cadence === 'biweekly' ? 'bi-weekly' : 'monthly';
  const incomeFmt = '$' + Number(income).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const chevronSvg = `<svg class="settings-section__chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 6 8 10 12 6"/></svg>`;

  const financialCollapsed = localStorage.getItem(SETTINGS_LS.financial) === 'true';
  const notifCollapsed     = localStorage.getItem(SETTINGS_LS.notif) === 'true';

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
      <div class="card settings-setup-card settings-section ${financialCollapsed ? 'is-collapsed' : ''}" id="settings-financial-card">
        <button class="settings-section__header" id="settings-financial-toggle" aria-expanded="${!financialCollapsed}">
          <span class="settings-setup-card__title">Financial Setup</span>
          ${chevronSvg}
        </button>
        <div class="settings-section__body">

          ${!isMain ? `
          <div class="form-group" style="margin-bottom:var(--space-3);">
            <label class="form-label" for="settings-name">Scenario name</label>
            <input class="form-input" type="text" id="settings-name" value="${esc(name)}" />
          </div>` : ''}

          <div class="form-group" style="margin-bottom:var(--space-3);">
            <label class="form-label">How often do you get paid?</label>
            <div class="option-grid option-grid--2">
              <div class="option-card settings-cadence is-disabled" data-value="weekly" data-locked="cadence-soon">
                <div class="option-card__title">Every week <span class="cadence-badge">Soon</span></div>
                <div class="option-card__sub">52 paychecks / year</div>
              </div>
              <div class="option-card settings-cadence ${cadence === 'biweekly' ? 'is-selected' : ''}" data-value="biweekly">
                <div class="option-card__title">Every 2 weeks</div>
                <div class="option-card__sub">26 paychecks / year</div>
              </div>
              <div class="option-card settings-cadence ${cadence === 'semimonthly' ? 'is-selected' : ''}" data-value="semimonthly">
                <div class="option-card__title">Twice a month <span class="cadence-badge">Beta</span></div>
                <div class="option-card__sub">1st &amp; 15th · 24/year</div>
              </div>
              <div class="option-card settings-cadence ${cadence === 'monthly' ? 'is-selected' : ''}" data-value="monthly">
                <div class="option-card__title">Monthly <span class="cadence-badge">Beta</span></div>
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
            <label class="form-label" for="settings-date">First pay date</label>
            <input class="form-input" type="date" id="settings-date" value="${payDate}" />
            <p class="text-muted text-sm" id="settings-date-hint" style="margin-top:4px;"></p>
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
              Income changes update instantly. Changing frequency, first pay date, or horizon regenerates all pay periods.
            </p>
          </div>

        </div>
      </div>

      <!-- Email Notifications -->
      ${renderEmailPrefsCard(user, notifCollapsed, scenario)}

      <!-- Notes -->
      ${notesCardHtml('settings')}
    </div>`;

  // Collapse toggles
  mountCollapseToggle('settings-financial-toggle', 'settings-financial-card', SETTINGS_LS.financial);
  mountCollapseToggle('settings-notif-toggle',     'settings-notif-card',     SETTINGS_LS.notif);

  // Track selected cadence + duration
  let selectedCadence  = cadence;
  let selectedDuration = duration;

  function updateDateHint(c) {
    const el = document.getElementById('settings-date-hint');
    if (!el) return;
    const hints = {
      weekly:       'Your first payday — periods repeat every 7 days from here.',
      biweekly:     'Your first payday — periods repeat every 2 weeks from here.',
      semimonthly:  'Must be the 1st or 15th — periods always split each month on those two dates.',
      monthly:      'Your first payday — periods repeat on the same day each month.',
    };
    el.textContent = hints[c] || '';
  }
  updateDateHint(selectedCadence);

  document.querySelectorAll('.settings-cadence').forEach(card => {
    card.addEventListener('click', () => {
      if (card.dataset.locked === 'cadence-soon') return; // coming soon, not selectable
      document.querySelectorAll('.settings-cadence').forEach(c => c.classList.remove('is-selected'));
      card.classList.add('is-selected');
      selectedCadence = card.dataset.value;
      updateDateHint(selectedCadence);
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

  // Email prefs toggles
  mountEmailPrefsWidget(user);
}

// ---- Collapse toggle ----------------------------------------

function mountCollapseToggle(btnId, cardId, lsKey) {
  const btn  = document.getElementById(btnId);
  const card = document.getElementById(cardId);
  if (!btn || !card) return;

  btn.addEventListener('click', () => {
    const collapsed = card.classList.toggle('is-collapsed');
    btn.setAttribute('aria-expanded', String(!collapsed));
    localStorage.setItem(lsKey, String(collapsed));
  });
}

// ---- Email preferences card ---------------------------------

function renderEmailPrefsCard(user, collapsed, scenario) {
  const prefs = (scenario && scenario.emailPrefs) || (user && user.emailPrefs) || {};
  const chevronSvg = `<svg class="settings-section__chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 6 8 10 12 6"/></svg>`;

  const toggleRow = (id, label, sublabel, checked) => `
    <div class="notif-row">
      <div class="notif-row__text">
        <div class="notif-row__label">${label}</div>
        <div class="notif-row__sub">${sublabel}</div>
      </div>
      <label class="toggle-switch">
        <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} />
        <span class="toggle-switch__track"></span>
      </label>
    </div>`;

  return `
    <div class="card settings-notif-card settings-section ${collapsed ? 'is-collapsed' : ''}" id="settings-notif-card">
      <button class="settings-section__header" id="settings-notif-toggle" aria-expanded="${!collapsed}">
        <span class="settings-setup-card__title">Email Notifications</span>
        ${chevronSvg}
      </button>
      <div class="settings-section__body">
        <div class="notif-email-hint text-muted text-sm" style="margin-bottom:var(--space-3);">
          Sent to <strong>${esc((user && user.email) || '')}</strong>
        </div>
        ${toggleRow('notif-payday',    'Payday summary',    'Overview of income &amp; bills the day before each paycheck', !!prefs.paydaySummary)}
        ${toggleRow('notif-bills',     'Bill reminders',    'Alert 3 days before bills with a due date are due', !!prefs.billReminders)}
        ${toggleRow('notif-goals',     'Goal milestones',   'Celebrate when you hit 25%, 50%, 75%, and 100% of a goal', !!prefs.goalMilestones)}
        ${toggleRow('notif-budget',    'Over-budget alert', 'Notify when your bills exceed your paycheck', !!prefs.overBudget)}
        <div id="notif-save-status" style="height:20px;margin-top:var(--space-2);font-size:13px;color:var(--color-text-tertiary);text-align:right;"></div>
      </div>
    </div>`;
}

function mountEmailPrefsWidget(user) {
  const ids  = ['notif-payday', 'notif-bills', 'notif-goals', 'notif-budget'];
  const keys = { 'notif-payday': 'paydaySummary', 'notif-bills': 'billReminders', 'notif-goals': 'goalMilestones', 'notif-budget': 'overBudget' };

  let saveTimer = null;

  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveEmailPrefs, 600);
    });
  });

  async function saveEmailPrefs() {
    const statusEl = document.getElementById('notif-save-status');
    const prefs = {};
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) prefs[keys[id]] = el.checked;
    });

    try {
      const res = await authFetch(`/api/scenarios/${encodeURIComponent(userId())}/${encodeURIComponent(scenario.scenarioId)}/email-prefs`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(prefs),
      });
      if (!res.ok) throw new Error('Save failed');
      Store.invalidate('scenario');
      if (statusEl) { statusEl.textContent = 'Saved'; setTimeout(() => { statusEl.textContent = ''; }, 2000); }
    } catch (err) {
      console.error(err);
      if (statusEl) statusEl.textContent = 'Failed to save';
    }
  }
}
