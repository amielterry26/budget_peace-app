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
//   Plans.showUpgradeModal(ctx)   — opens contextual Pro upgrade modal
//   Plans.hideUpgradeModal()      — closes the Pro upgrade modal
//   Plans.getProFeatures()        — shared Pro feature list
//   Plans.getComingSoon()         — shared Coming Soon feature list
//   Plans.UPGRADE_CONTEXT         — contextual messages for each gated feature
// ============================================================

const Plans = (() => {
  // ---- Plan Definitions ----------------------------------------
  // Canonical key names — must match lib/planLimits.js on the server.
  // Internal tier key "budget" = user-facing "Basic".

  const TIERS = {
    budget: {
      maxScenarios: 1,
      maxExpensesPerScenario: 8,
      maxProjectionMonths: 3,
      scenarioComparison: false,
      financialHealth: false,
      scenarioNotes: false,
      advancedAdjustments: false,
    },
    pro: {
      maxScenarios: Infinity,
      maxExpensesPerScenario: Infinity,
      maxProjectionMonths: Infinity,
      scenarioComparison: true,
      financialHealth: true,
      scenarioNotes: true,
      advancedAdjustments: true,
    },
  };

  // ---- Shared Pro Feature Data ---------------------------------

  const PRO_FEATURES = [
    { icon: '\u25EB', title: 'Unlimited scenarios',        description: 'Create as many what-if scenarios as you need.' },
    { icon: '\u2261', title: 'Unlimited expenses',          description: 'No cap on expenses per scenario.' },
    { icon: '\u25F7', title: 'Extended projections',        description: 'See 6+ months ahead with longer projection windows.' },
    { icon: '\u21C4', title: 'Scenario comparison',         description: 'Compare scenarios side by side to find the best path.' },
    { icon: '\u2661', title: 'Financial health projection', description: 'Track your financial trajectory over time.' },
    { icon: '\u270E', title: 'Scenario notes',              description: 'Annotate scenarios with context and reminders.' },
  ];

  const COMING_SOON = [
    { icon: '\u2726', title: 'AI-powered budget insights',  description: 'Smart suggestions based on your spending patterns.' },
    { icon: '\u25A6', title: 'Custom widgets & dashboards', description: 'Personalize your financial overview.' },
    { icon: '\u2699', title: 'Advanced adjustments',        description: 'Fine-grained control over projections.' },
  ];

  function getProFeatures() { return PRO_FEATURES; }
  function getComingSoon()  { return COMING_SOON; }

  // ---- Contextual Upgrade Messages -----------------------------

  const UPGRADE_CONTEXT = {
    scenarios:       { message: 'Multiple scenarios are available on the Pro plan.' },
    expenses:        { message: 'Unlimited expenses are available on the Pro plan.' },
    duration:        { message: 'Longer projection windows are part of Pro.' },
    comparison:      { message: 'Comparison is a Pro feature for side-by-side decision making.' },
    notes:           { message: 'Notes are available on Pro for deeper planning.' },
    financialHealth: { message: 'Financial health tracking is available on the Pro plan.' },
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

  // ---- Upgrade Modal (contextual — full discovery on /pro) -----

  function showUpgradeModal(context) {
    // Remove existing if open
    document.getElementById('upgrade-overlay')?.remove();
    document.getElementById('upgrade-modal')?.remove();

    const topFeatures = PRO_FEATURES.slice(0, 3);
    const subtitle = (context && context.message)
      ? context.message
      : 'See your full financial picture &mdash; no limits.';

    document.body.insertAdjacentHTML('beforeend', `
      <div id="upgrade-overlay" class="sheet-overlay"></div>
      <div id="upgrade-modal" class="sheet" style="max-width:420px;">
        <div class="sheet__handle"></div>

        <div style="text-align:center;padding:var(--space-4) 0 var(--space-1);">
          <div style="font-size:20px;font-weight:var(--font-weight-bold);letter-spacing:-0.02em;line-height:1.3;">
            Budget Peace Pro
          </div>
          <div class="text-muted" style="font-size:var(--font-size-sm);margin-top:var(--space-1);line-height:1.5;">
            ${subtitle}
          </div>
        </div>

        <div style="padding:var(--space-3) 0 var(--space-2);">
          <ul style="list-style:none;padding:0;margin:0;font-size:var(--font-size-sm);color:var(--color-text-secondary);">
            ${topFeatures.map(f => `<li style="padding:5px 0;">&#10003;&ensp;${f.title}</li>`).join('')}
          </ul>
          <a href="/pro" id="upgrade-learn-more" style="display:inline-block;margin-top:var(--space-2);font-size:var(--font-size-sm);color:var(--color-accent);font-weight:600;text-decoration:none;">
            See all Pro features &rarr;
          </a>
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

    // "Learn more" link — navigates to /pro (standard link, no JS needed)

    // Upgrade CTA — triggers Stripe checkout
    document.getElementById('upgrade-pro-monthly').addEventListener('click', async () => {
      const btn = document.getElementById('upgrade-pro-monthly');
      btn.disabled = true;
      btn.textContent = 'Redirecting…';
      try {
        const res = await authFetch('/api/stripe/create-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: 'pro-monthly' }),
        });
        if (!res.ok) throw new Error('Checkout session failed');
        const data = await res.json();
        if (data.url) window.location.href = data.url;
      } catch (err) {
        console.error('[Plans] Checkout error:', err);
        btn.disabled = false;
        btn.textContent = 'Go Pro \u2014 $7.99/mo';
        alert('Unable to start checkout. Please try again.');
      }
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
    getProFeatures,
    getComingSoon,
    UPGRADE_CONTEXT,
  };
})();
