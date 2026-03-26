// ============================================================
// Budget Peace — Plan Limits & Feature Gating
//
// Single source of truth for what each plan tier can access.
// Loaded after auth.js. All feature checks go through this
// module — never hardcode plan logic in page scripts.
//
// Functions:
//   Plans.getPlanLimits()         — full limits object for current tier
//   Plans.canUse(feature)         — boolean: is feature enabled?
//   Plans.getLimit(feature)       — numeric limit value
//   Plans.getTier()               — 'budget' | 'pro' | 'none'
//   Plans.showUpgradeModal()      — opens the Pro upgrade modal
//   Plans.hideUpgradeModal()      — closes the Pro upgrade modal
// ============================================================

const Plans = (() => {
  // ---- Plan Definitions ----------------------------------------

  const TIERS = {
    budget: {
      maxScenarios: 1,
      maxExpenses: 8,
      maxDurationMonths: 3,
      scenarioComparison: false,
      financialHealth: false,
      scenarioNotes: false,
      advancedAdjustments: false,
    },
    pro: {
      maxScenarios: Infinity,
      maxExpenses: Infinity,
      maxDurationMonths: Infinity,
      scenarioComparison: true,
      financialHealth: true,
      scenarioNotes: true,
      advancedAdjustments: true,
    },
  };

  // ---- Tier Resolution -----------------------------------------

  function getTier() {
    const al = Auth.getAccessLevel();
    if (al === 'pro') return 'pro';
    if (al === 'budget') return 'budget';
    // Legacy users with 'full' access get pro behavior
    if (al === 'full') return 'pro';
    return 'none';
  }

  function getPlanLimits() {
    const tier = getTier();
    return TIERS[tier] || TIERS.budget;
  }

  // ---- Feature Checks ------------------------------------------

  function canUse(feature) {
    const limits = getPlanLimits();
    const val = limits[feature];
    if (val === undefined) return false;
    if (typeof val === 'boolean') return val;
    if (typeof val === 'number') return val > 0;
    return !!val;
  }

  function getLimit(feature) {
    return getPlanLimits()[feature];
  }

  // ---- Upgrade Modal -------------------------------------------

  function showUpgradeModal() {
    // Remove existing if open
    document.getElementById('upgrade-overlay')?.remove();
    document.getElementById('upgrade-modal')?.remove();

    document.body.insertAdjacentHTML('beforeend', `
      <div id="upgrade-overlay" class="sheet-overlay"></div>
      <div id="upgrade-modal" class="sheet" style="max-width:420px;">
        <div class="sheet__handle"></div>

        <div style="text-align:center;padding:var(--space-4) 0 var(--space-1);">
          <div style="font-size:20px;font-weight:var(--font-weight-bold);letter-spacing:-0.02em;line-height:1.3;">
            Budget Peace Pro
          </div>
          <div class="text-muted" style="font-size:var(--font-size-sm);margin-top:var(--space-1);line-height:1.5;">
            See your full financial picture &mdash; no limits.
          </div>
        </div>

        <div style="padding:var(--space-3) 0 var(--space-2);">
          <div style="font-size:var(--font-size-xs);font-weight:var(--font-weight-semibold);text-transform:uppercase;letter-spacing:0.05em;color:var(--color-text-secondary);margin-bottom:var(--space-2);">What you get</div>
          <ul style="list-style:none;padding:0;margin:0;font-size:var(--font-size-sm);color:var(--color-text-secondary);">
            <li style="padding:5px 0;">&#10003;&ensp;Unlimited scenarios</li>
            <li style="padding:5px 0;">&#10003;&ensp;Unlimited expenses per scenario</li>
            <li style="padding:5px 0;">&#10003;&ensp;Extended projection window (6+ months)</li>
            <li style="padding:5px 0;">&#10003;&ensp;Side-by-side scenario comparison</li>
            <li style="padding:5px 0;">&#10003;&ensp;Financial health projection</li>
            <li style="padding:5px 0;">&#10003;&ensp;Scenario notes</li>
          </ul>
        </div>

        <div style="padding:var(--space-1) 0 var(--space-2);">
          <div style="font-size:var(--font-size-xs);font-weight:var(--font-weight-semibold);text-transform:uppercase;letter-spacing:0.05em;color:var(--color-text-secondary);margin-bottom:var(--space-2);">Coming soon</div>
          <ul style="list-style:none;padding:0;margin:0;font-size:var(--font-size-sm);color:var(--color-text-secondary);">
            <li style="padding:5px 0;">&#10003;&ensp;AI-powered budget insights</li>
            <li style="padding:5px 0;">&#10003;&ensp;Custom widgets &amp; dashboards</li>
            <li style="padding:5px 0;">&#10003;&ensp;Advanced adjustments</li>
          </ul>
        </div>

        <div style="display:flex;flex-direction:column;gap:var(--space-2);padding:var(--space-3) 0 var(--space-2);">
          <button class="btn btn--primary btn--full" id="upgrade-pro-monthly">
            Go Pro &mdash; $7.99/mo
          </button>
          <div class="text-muted text-center" style="font-size:var(--font-size-xs);line-height:1.4;">
            Lifetime option coming soon
          </div>
        </div>

        <div style="padding:var(--space-1) 0 var(--space-3);text-align:center;">
          <button class="btn btn--ghost btn--full" id="upgrade-close" style="font-size:var(--font-size-sm);">
            Not now
          </button>
        </div>
      </div>
    `);

    requestAnimationFrame(() => {
      document.getElementById('upgrade-overlay').classList.add('is-open');
      document.getElementById('upgrade-modal').classList.add('is-open');
    });

    // Close handler
    const close = () => hideUpgradeModal();
    document.getElementById('upgrade-close').addEventListener('click', close);
    document.getElementById('upgrade-overlay').addEventListener('click', close);

    // Upgrade CTA — stub for now (Stripe wiring in a later phase)
    document.getElementById('upgrade-pro-monthly').addEventListener('click', () => {
      console.log('[Plans] Upgrade CTA clicked: pro-monthly');
      // TODO: Wire to /api/stripe/create-checkout-session in a later phase
    });
  }

  function hideUpgradeModal() {
    const overlay = document.getElementById('upgrade-overlay');
    const modal = document.getElementById('upgrade-modal');
    if (overlay) overlay.classList.remove('is-open');
    if (modal) {
      modal.classList.remove('is-open');
      modal.addEventListener('transitionend', () => {
        document.getElementById('upgrade-overlay')?.remove();
        document.getElementById('upgrade-modal')?.remove();
      }, { once: true });
    }
  }

  return {
    getPlanLimits,
    canUse,
    getLimit,
    getTier,
    showUpgradeModal,
    hideUpgradeModal,
  };
})();
