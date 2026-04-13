// ============================================================
// Budget Peace — First-Time Onboarding Wizard
//
// Shown once to new paid users who haven't set up their budget
// yet (detected by absence of user.cadence on the bp_users row).
//
// Steps:
//   1. Name
//   2. Paycheck amount + frequency
//   3. Last payday (firstPayDate)
//   4. Done — submit → PUT /api/users/:id + PATCH profile
//
// Public API:
//   Onboarding.check(user) — shows wizard if user needs setup
// ============================================================

const Onboarding = (() => {
  let _step    = 1;
  const STEPS  = 4;
  let _data    = { displayName: '', income: '', cadence: 'biweekly', firstPayDate: '' };

  // ---- Is this a new user? -----------------------------------

  function needsSetup(user) {
    return !user || !user.cadence;
  }

  // ---- Main entry point --------------------------------------

  function check(user) {
    if (!needsSetup(user)) return;
    _data.displayName = user?.displayName || Auth.getUser()?.displayName || '';
    render();
  }

  // ---- Render ------------------------------------------------

  function render() {
    document.getElementById('onboarding-overlay')?.remove();
    document.getElementById('onboarding-wizard')?.remove();

    document.body.insertAdjacentHTML('beforeend', `
      <div id="onboarding-overlay" class="ob-overlay"></div>
      <div id="onboarding-wizard" class="ob-wizard">
        <div class="ob-wizard__inner">
          ${buildProgress()}
          ${buildStep(_step)}
        </div>
      </div>
    `);

    requestAnimationFrame(() => {
      document.getElementById('onboarding-overlay').classList.add('is-open');
      document.getElementById('onboarding-wizard').classList.add('is-open');
    });

    bindStep(_step);
  }

  // ---- Progress dots -----------------------------------------

  function buildProgress() {
    const dots = Array.from({ length: STEPS }, (_, i) => {
      const cls = i + 1 === _step ? 'ob-dot ob-dot--active'
                : i + 1 < _step  ? 'ob-dot ob-dot--done'
                : 'ob-dot';
      return `<span class="${cls}"></span>`;
    }).join('');
    return `<div class="ob-progress">${dots}</div>`;
  }

  // ---- Step content ------------------------------------------

  function buildStep(step) {
    if (step === 1) return `
      <div class="ob-step" data-step="1">
        <div class="ob-icon">👋</div>
        <h2 class="ob-title">Welcome to Budget Peace</h2>
        <p class="ob-sub">Let's set up your budget in about a minute. First — what should we call you?</p>
        <input id="ob-name" class="ob-input" type="text" placeholder="Your first name" autocomplete="given-name" value="${esc(_data.displayName)}" maxlength="40" />
        <div class="ob-actions">
          <button id="ob-next" class="btn btn--primary btn--full ob-btn-next">Continue →</button>
        </div>
      </div>`;

    if (step === 2) return `
      <div class="ob-step" data-step="2">
        <div class="ob-icon">💰</div>
        <h2 class="ob-title">Your paycheck</h2>
        <p class="ob-sub">How much do you take home each pay period?</p>
        <div class="ob-input-prefix-wrap">
          <span class="ob-input-prefix">$</span>
          <input id="ob-income" class="ob-input ob-input--prefixed" type="number" placeholder="0.00" min="0" step="0.01" value="${_data.income}" inputmode="decimal" />
        </div>
        <p class="ob-label" style="margin-top:var(--space-4);">How often do you get paid?</p>
        <div class="ob-cadence-row">
          <button class="ob-cadence-btn ${_data.cadence === 'biweekly' ? 'is-active' : ''}" data-cadence="biweekly">
            <span class="ob-cadence-title">Every two weeks</span>
            <span class="ob-cadence-sub">Bi-weekly</span>
          </button>
          <button class="ob-cadence-btn ${_data.cadence === 'monthly' ? 'is-active' : ''}" data-cadence="monthly">
            <span class="ob-cadence-title">Once a month</span>
            <span class="ob-cadence-sub">Monthly</span>
          </button>
        </div>
        <div class="ob-actions">
          <button id="ob-back" class="btn btn--ghost ob-btn-back">← Back</button>
          <button id="ob-next" class="btn btn--primary ob-btn-next">Continue →</button>
        </div>
      </div>`;

    if (step === 3) return `
      <div class="ob-step" data-step="3">
        <div class="ob-icon">📅</div>
        <h2 class="ob-title">When was your last payday?</h2>
        <p class="ob-sub">This lets us line up your pay periods correctly. Pick the most recent date you received a paycheck.</p>
        <input id="ob-payday" class="ob-input ob-input--date" type="date" value="${_data.firstPayDate}" />
        <div class="ob-actions">
          <button id="ob-back" class="btn btn--ghost ob-btn-back">← Back</button>
          <button id="ob-next" class="btn btn--primary ob-btn-next">Continue →</button>
        </div>
      </div>`;

    if (step === 4) return `
      <div class="ob-step" data-step="4">
        <div class="ob-icon">🎉</div>
        <h2 class="ob-title">You're all set${_data.displayName ? ', ' + _data.displayName : ''}!</h2>
        <p class="ob-sub">Here's what we'll set up for you:</p>
        <div class="ob-summary">
          <div class="ob-summary__row">
            <span class="ob-summary__label">Paycheck</span>
            <span class="ob-summary__val">$${Number(_data.income).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div class="ob-summary__row">
            <span class="ob-summary__label">Frequency</span>
            <span class="ob-summary__val">${_data.cadence === 'biweekly' ? 'Every two weeks' : 'Monthly'}</span>
          </div>
          <div class="ob-summary__row">
            <span class="ob-summary__label">Last payday</span>
            <span class="ob-summary__val">${new Date(_data.firstPayDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
          </div>
          <div class="ob-summary__row">
            <span class="ob-summary__label">Planning ahead</span>
            <span class="ob-summary__val">3 months</span>
          </div>
        </div>
        <div class="ob-actions">
          <button id="ob-back" class="btn btn--ghost ob-btn-back">← Back</button>
          <button id="ob-submit" class="btn btn--primary btn--full ob-btn-submit">Let's go →</button>
        </div>
        <div id="ob-error" class="ob-error" style="display:none;"></div>
      </div>`;
  }

  // ---- Event binding -----------------------------------------

  function bindStep(step) {
    document.getElementById('ob-next')?.addEventListener('click', () => advance(step));
    document.getElementById('ob-back')?.addEventListener('click', () => goBack());
    document.getElementById('ob-submit')?.addEventListener('click', () => submit());

    // Cadence buttons
    document.querySelectorAll('.ob-cadence-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _data.cadence = btn.dataset.cadence;
        document.querySelectorAll('.ob-cadence-btn').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
      });
    });

    // Enter key on inputs
    document.getElementById('ob-name')?.addEventListener('keydown',   e => { if (e.key === 'Enter') advance(step); });
    document.getElementById('ob-income')?.addEventListener('keydown', e => { if (e.key === 'Enter') advance(step); });
    document.getElementById('ob-payday')?.addEventListener('keydown', e => { if (e.key === 'Enter') advance(step); });

    // Auto-focus
    setTimeout(() => {
      const el = document.getElementById('ob-name') || document.getElementById('ob-income') || document.getElementById('ob-payday');
      el?.focus();
    }, 120);
  }

  // ---- Step validation + advance -----------------------------

  function advance(step) {
    if (step === 1) {
      _data.displayName = document.getElementById('ob-name').value.trim();
      // Name is optional — can skip
      _step = 2; render(); return;
    }

    if (step === 2) {
      const val = Number(document.getElementById('ob-income').value);
      if (!val || val <= 0) { shake('ob-income'); return; }
      _data.income = val;
      _step = 3; render(); return;
    }

    if (step === 3) {
      const val = document.getElementById('ob-payday').value;
      if (!val) { shake('ob-payday'); return; }
      _data.firstPayDate = val;
      _step = 4; render(); return;
    }
  }

  function goBack() {
    if (_step > 1) { _step--; render(); }
  }

  function shake(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('ob-shake');
    setTimeout(() => el.classList.remove('ob-shake'), 500);
    el.focus();
  }

  // ---- Submit ------------------------------------------------

  async function submit() {
    const btn = document.getElementById('ob-submit');
    const err = document.getElementById('ob-error');
    btn.disabled    = true;
    btn.textContent = 'Setting up…';
    err.style.display = 'none';

    try {
      const userId = Auth.getUser()?.userId;

      // Set up user record + generate periods
      const res = await authFetch(`/api/users/${userId}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          cadence:        _data.cadence,
          incomeAmount:   Number(_data.income),
          firstPayDate:   _data.firstPayDate,
          durationMonths: 3,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Setup failed');
      }

      // Save display name if provided
      if (_data.displayName) {
        await authFetch(`/api/users/${userId}/profile`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ displayName: _data.displayName, photoUrl: '', bio: '', jobTitle: '', personalGoals: '' }),
        });
      }

      // Full reload — picks up new cadence, periods, everything
      window.location.reload();
    } catch (e) {
      console.error('[Onboarding] submit error:', e);
      err.textContent   = e.message || 'Something went wrong. Please try again.';
      err.style.display = 'block';
      btn.disabled      = false;
      btn.textContent   = 'Let\'s go →';
    }
  }

  // ---- Utilities ---------------------------------------------

  function esc(str) {
    return (str || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return { check };
})();
