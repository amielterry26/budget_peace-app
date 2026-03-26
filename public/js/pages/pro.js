// ============================================================
// Pro Discovery Page — Budget Peace Pro
// ============================================================

Router.register('pro', async () => {
  document.getElementById('page-title').textContent = 'Pro';
  setActivePage('pro');
  showBottomNav(false);
  showFab(false);

  const features   = Plans.getProFeatures();
  const comingSoon = Plans.getComingSoon();
  const isPro      = Plans.getTier() === 'pro';

  document.getElementById('main-content').innerHTML = `
    <div class="pro-page">

      <button class="pro-page__back" id="pro-back" aria-label="Go back">
        &larr; Back
      </button>

      <!-- Hero -->
      <section class="pro-hero">
        <div class="pro-hero__badge">Pro</div>
        <h1 class="pro-hero__title">Your finances,<br>without&nbsp;limits.</h1>
        <p class="pro-hero__sub">
          Budget Peace Pro removes every cap so you can plan freely,
          compare&nbsp;confidently, and see&nbsp;further&nbsp;ahead.
        </p>
      </section>

      <!-- Feature highlights -->
      <section class="pro-features">
        <h2 class="pro-section-title">What you get with Pro</h2>
        <div class="pro-features__grid">
          ${features.map(f => `
            <div class="pro-feature-card">
              <div class="pro-feature-card__icon">${f.icon}</div>
              <div class="pro-feature-card__title">${f.title}</div>
              <div class="pro-feature-card__desc">${f.description}</div>
            </div>
          `).join('')}
        </div>
      </section>

      <!-- Coming soon -->
      <section class="pro-coming-soon">
        <h2 class="pro-section-title">On the horizon</h2>
        <div class="pro-features__grid">
          ${comingSoon.map(f => `
            <div class="pro-feature-card pro-feature-card--soon">
              <div class="pro-feature-card__icon">${f.icon}</div>
              <div class="pro-feature-card__title">${f.title}</div>
              <div class="pro-feature-card__desc">${f.description}</div>
              <span class="pro-badge--soon">Coming soon</span>
            </div>
          `).join('')}
        </div>
      </section>

      <!-- Comparison table -->
      <section class="pro-compare">
        <h2 class="pro-section-title">Compare plans</h2>
        <div class="pro-compare__table-wrap">
          <table class="pro-compare__table">
            <thead>
              <tr>
                <th></th>
                <th>Budget</th>
                <th class="pro-compare__pro-col">Pro</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Scenarios</td><td>1</td><td>Unlimited</td></tr>
              <tr><td>Expenses per scenario</td><td>8</td><td>Unlimited</td></tr>
              <tr><td>Projection window</td><td>3 months</td><td>Unlimited</td></tr>
              <tr><td>Scenario comparison</td><td>&mdash;</td><td>&#10003;</td></tr>
              <tr><td>Financial health</td><td>&mdash;</td><td>&#10003;</td></tr>
              <tr><td>Scenario notes</td><td>&mdash;</td><td>&#10003;</td></tr>
              <tr><td>AI insights</td><td>&mdash;</td><td>Coming soon</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- CTA -->
      ${isPro ? `
        <section class="pro-cta">
          <div class="pro-cta__badge">&#10003; You're on Pro</div>
          <p class="pro-cta__sub">You have access to everything. Thank you for your support.</p>
        </section>
      ` : `
        <section class="pro-cta">
          <button class="btn btn--primary btn--full pro-cta__btn" id="pro-upgrade-cta">
            Go Pro &mdash; $7.99/mo
          </button>
          <div class="text-muted text-center" style="font-size:var(--font-size-xs);margin-top:var(--space-2);line-height:1.4;">
            Lifetime option coming soon
          </div>
        </section>
      `}

    </div>
  `;

  // Wire events
  document.getElementById('pro-back')?.addEventListener('click', () => {
    window.history.back();
  });

  document.getElementById('pro-upgrade-cta')?.addEventListener('click', () => {
    console.log('[Plans] Upgrade CTA clicked from Pro page: pro-monthly');
    // TODO: Wire to /api/stripe/create-checkout-session in a later phase
  });
});
