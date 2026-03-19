// ============================================================
// Budgets list — all periods
// ============================================================

Router.register('budgets', async () => {
  document.getElementById('page-title').textContent = 'Budgets';
  setActivePage('budgets');
  showBottomNav(true);
  showFab(false);

  document.getElementById('main-content').innerHTML = `
    <div class="page">
      <div class="text-muted text-sm text-center" style="padding:64px 0;">Loading…</div>
    </div>`;

  try {
    const [periods, expenses, scenario] = await Promise.all([
      Store.get('periods'),
      Store.get('expenses'),
      Store.get('scenario'),
    ]);

    const notesHtml = scenario ? notesCardHtml('bud') : '';

    if (!periods.length) {
      document.getElementById('main-content').innerHTML = `
        <div class="page">
          ${notesHtml}
          <div class="text-center" style="padding-top:64px;">
            <p class="text-muted text-sm">No budget periods found.</p>
          </div>
        </div>`;
      if (scenario) mountNotesWidget('bud', scenario.scenarioId, scenario.notes);
      return;
    }

    const today = effectiveToday();

    const items = periods.map((p, i) => {
      const isCurrent = today >= p.startDate && today <= p.endDate;
      const isPast    = today > p.endDate;

      const cadence = inferCadence(p);
      const totalExp = expenses.reduce((sum, e) => {
        if (e.recurrence === 'once') {
          return e.periodStart === p.startDate ? sum + e.amount : sum;
        }
        if (e.recurrence === 'recurring') {
          const startDate = e.recurrenceStartDate || '1970-01-01';
          if (startDate > p.endDate) return sum;
          const freq = e.recurrenceFrequency || 'monthly';
          // Monthly expense in biweekly period: only count if dueDay falls in this period
          if (freq === 'monthly' && cadence === 'biweekly') {
            return dueDayInPeriod(e.dueDay || 1, p) ? sum + e.amount : sum;
          }
          return sum + e.amount * expMultiplier(freq, cadence);
        }
        return sum;
      }, 0);
      const remaining = p.income - totalExp;
      const isNeg     = remaining < 0;

      return `
        <div class="period-item ${isCurrent ? 'is-current' : ''}" data-index="${i}">
          <div class="period-item__header">
            <span class="period-item__dates">${fmtRange(p)}</span>
            ${isCurrent ? `<span class="period-item__badge">Current</span>` : ''}
            ${isPast    ? `<span class="period-item__badge" style="color:var(--color-text-secondary);background:var(--color-surface-alt);">Past</span>` : ''}
          </div>
          <div class="period-item__rows">
            <div class="period-item__row">
              <span class="period-item__row-label">Income</span>
              <span class="period-item__row-value">${money(p.income)}</span>
            </div>
            <div class="period-item__row">
              <span class="period-item__row-label">Expenses</span>
              <span class="period-item__row-value">${money(totalExp)}</span>
            </div>
          </div>
          <div class="period-item__remaining">
            <span class="period-item__remaining-label">Remaining</span>
            <span class="period-item__remaining-value ${isNeg ? 'is-negative' : ''}">${money(remaining)}</span>
          </div>
        </div>`;
    }).join('');

    document.getElementById('main-content').innerHTML = `
      <div class="page">
        ${notesHtml}
        <div class="section-title">${periods.length} periods</div>
        <div class="stack--3">${items}</div>
      </div>`;

    if (scenario) mountNotesWidget('bud', scenario.scenarioId, scenario.notes);

    // Tap a period → jump to it in pay-period view
    document.querySelectorAll('.period-item').forEach(el => {
      el.addEventListener('click', () => {
        Router.navigate('pay-period', { idx: el.dataset.index });
      });
    });

  } catch (err) {
    console.error(err);
    document.getElementById('main-content').innerHTML = `
      <div class="page text-center" style="padding-top:64px;">
        <p class="text-muted text-sm">Failed to load.</p>
        <button class="btn btn--ghost" style="margin-top:var(--space-3);" onclick="Router.navigate('budgets')">Try Again</button>
      </div>`;
  }
});

// localToday(), fmtRange(), inferCadence(), expMultiplier() provided by shared.js

function money(n) {
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

