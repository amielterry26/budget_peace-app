// ============================================================
// Compare — Side-by-side scenario comparison
// ============================================================

let _compareSelected = []; // scenarioIds currently selected

Router.register('compare', async () => {
  document.getElementById('page-title').textContent = 'Compare';
  setActivePage('compare');
  showBottomNav(true);
  showFab(false);

  // Plan gate: scenario comparison is Pro-only
  if (!Plans.canUse('scenarioComparison')) {
    document.getElementById('main-content').innerHTML = `
      <div class="page" style="padding-top:var(--space-4);">
        <div class="card" style="text-align:center;padding:var(--space-5) var(--space-4);">
          <div style="font-size:32px;margin-bottom:var(--space-2);">&#8652;</div>
          <div style="font-size:var(--font-size-md);font-weight:var(--font-weight-bold);margin-bottom:var(--space-1);">Scenario Comparison</div>
          <p class="text-muted text-sm" style="margin-bottom:var(--space-3);line-height:1.5;">
            Compare your scenarios side by side — income, expenses, and remaining budget at a glance.
          </p>
          <div style="display:flex;flex-direction:column;gap:var(--space-1);margin-bottom:var(--space-4);text-align:left;max-width:280px;margin-left:auto;margin-right:auto;">
            <div class="text-muted text-sm">&#10003;&ensp;Side-by-side metrics</div>
            <div class="text-muted text-sm">&#10003;&ensp;Income &amp; obligation breakdown</div>
            <div class="text-muted text-sm">&#10003;&ensp;Compare up to 3 scenarios</div>
          </div>
          <button class="btn btn--primary" id="compare-upgrade">Upgrade to Pro</button>
          <div class="text-muted text-sm" style="margin-top:var(--space-2);">Available on Budget Peace Pro</div>
        </div>
      </div>`;
    document.getElementById('compare-upgrade').addEventListener('click', () => Plans.showUpgradeModal(Plans.UPGRADE_CONTEXT.comparison));
    return;
  }

  document.getElementById('main-content').innerHTML = `
    <div class="page">
      <div class="text-muted text-sm text-center" style="padding:64px 0;">Loading…</div>
    </div>`;

  try {
    const scenarios = await Store.get('scenarios');

    if (scenarios.length < 2) {
      document.getElementById('main-content').innerHTML = `
        <div class="page text-center" style="padding-top:64px;">
          <p class="text-muted text-sm">Create at least 2 scenarios to compare.</p>
          <button class="btn btn--ghost" style="margin-top:var(--space-3);" onclick="Router.navigate('scenarios')">Go to Scenarios</button>
        </div>`;
      return;
    }

    // Pre-select: active + main (or first two if active is main)
    if (!_compareSelected.length) {
      _compareSelected = [_activeScenario];
      const other = scenarios.find(s => s.scenarioId !== _activeScenario);
      if (other) _compareSelected.push(other.scenarioId);
    }
    // Remove any that no longer exist
    const ids = new Set(scenarios.map(s => s.scenarioId));
    _compareSelected = _compareSelected.filter(id => ids.has(id));

    renderComparePage(scenarios);
  } catch (err) {
    console.error(err);
    document.getElementById('main-content').innerHTML = `
      <div class="page text-center" style="padding-top:64px;">
        <p class="text-muted text-sm">Failed to load.</p>
        <button class="btn btn--ghost" style="margin-top:var(--space-3);" onclick="Router.navigate('compare')">Try Again</button>
      </div>`;
  }
});

// ---- Render ------------------------------------------------

async function renderComparePage(scenarios) {
  // Picker chips
  const chips = scenarios.map(s => {
    const selected = _compareSelected.includes(s.scenarioId);
    return `<button class="cmp-chip ${selected ? 'is-selected' : ''}" data-sid="${esc(s.scenarioId)}">${esc(s.name)}</button>`;
  }).join('');

  document.getElementById('main-content').innerHTML = `
    <div class="page">
      <div style="margin-bottom:var(--space-4);">
        <div class="text-muted text-sm" style="margin-bottom:var(--space-2);">Select 2–3 scenarios to compare</div>
        <div class="cmp-chips">${chips}</div>
      </div>
      <div class="cmp-mobile-hint">For the best view, rotate your phone to landscape.</div>
      <div id="cmp-grid"></div>
    </div>`;

  // Wire chips
  document.querySelectorAll('.cmp-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const sid = chip.dataset.sid;
      if (_compareSelected.includes(sid)) {
        _compareSelected = _compareSelected.filter(id => id !== sid);
      } else if (_compareSelected.length < 3) {
        _compareSelected.push(sid);
      }
      // Update chip visuals
      document.querySelectorAll('.cmp-chip').forEach(c => {
        c.classList.toggle('is-selected', _compareSelected.includes(c.dataset.sid));
      });
      renderCompareGrid(scenarios);
    });
  });

  await renderCompareGrid(scenarios);
}

async function renderCompareGrid(scenarios) {
  const grid = document.getElementById('cmp-grid');
  if (!grid) return;

  if (_compareSelected.length < 2) {
    grid.innerHTML = `<div class="text-muted text-sm text-center" style="padding:var(--space-5) 0;">Select at least 2 scenarios.</div>`;
    return;
  }

  grid.innerHTML = `<div class="text-muted text-sm text-center" style="padding:var(--space-5) 0;">Calculating…</div>`;

  try {
    // Fetch data for each selected scenario
    const selected = scenarios.filter(s => _compareSelected.includes(s.scenarioId));
    const data = await Promise.all(selected.map(async s => {
      const expenses = await fetchScenarioExpenses(s.scenarioId);
      return computeMetrics(s, expenses);
    }));

    grid.innerHTML = buildDesktopGrid(data);

    // Wire expand/collapse toggles — expand ALL columns simultaneously
    grid.querySelectorAll('.cmp-expand-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const allExtras = grid.querySelectorAll('.cmp-expense-extra');
        const allBtns = grid.querySelectorAll('.cmp-expand-btn');
        const shouldExpand = allExtras[0]?.classList.contains('is-hidden');
        allExtras.forEach(el => el.classList.toggle('is-hidden', !shouldExpand));
        allBtns.forEach(b => { b.textContent = shouldExpand ? 'Collapse' : 'Show full breakdown'; });
      });
    });
  } catch (err) {
    console.error(err);
    grid.innerHTML = `<div class="text-muted text-sm text-center" style="padding:var(--space-5) 0;">Failed to load comparison data.</div>`;
  }
}

// ---- Data --------------------------------------------------

async function fetchScenarioExpenses(scenarioId) {
  const res = await authFetch(`/api/expenses/${userId()}?scenario=${encodeURIComponent(scenarioId)}`);
  if (!res.ok) throw new Error('Failed to fetch expenses');
  return res.json();
}

function computeMetrics(scenario, expenses) {
  const income = scenario.income || 0;
  const cadence = scenario.cadence || 'biweekly';
  const monthlyIncome = cadence === 'biweekly' ? income * 2 : income;

  // Monthly expenses: only recurring, normalized via shared canonical helper
  let monthlyExp = 0;
  const recurringExps = [];
  for (const e of expenses) {
    if (e.recurrence !== 'recurring') continue;
    const monthly = calcMonthlyAmt(e);
    monthlyExp += monthly;
    recurringExps.push({ name: e.name, monthly });
  }
  monthlyExp = Math.round(monthlyExp * 100) / 100;

  // Top 3 expenses by monthly amount
  recurringExps.sort((a, b) => b.monthly - a.monthly);
  const top3 = recurringExps.slice(0, 3);

  const monthlyLeftover = Math.round((monthlyIncome - monthlyExp) * 100) / 100;

  const firstPayFmt = scenario.firstPayDate
    ? new Date(scenario.firstPayDate + 'T00:00:00Z')
        .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    : '—';

  return {
    name: scenario.name,
    scenarioId: scenario.scenarioId,
    isPrimary: !!scenario.isPrimary,
    cadence: cadence === 'biweekly' ? 'Bi-weekly' : 'Monthly',
    income,
    firstPayDate: firstPayFmt,
    durationMonths: scenario.durationMonths || 0,
    monthlyIncome,
    monthlyExp,
    monthlyLeftover,
    expenseCount: expenses.length,
    top3,
    allExpenses: recurringExps,
  };
}

// ---- Desktop Grid ------------------------------------------

function buildDesktopGrid(data) {
  const cols = data.length;
  let rowIndex = 0;

  function row(label, values, opts) {
    const cls = opts?.cls || '';
    const alt = (++rowIndex % 2 === 0) ? ' cmp-row--alt' : '';
    const cells = values.map(v => `<div class="cmp-cell ${cls}">${v}</div>`).join('');
    return `
      <div class="cmp-row${alt}">
        <div class="cmp-label">${label}</div>
        ${cells}
      </div>`;
  }

  const headers = data.map(d => {
    let badges = '';
    if (d.isPrimary) badges += ' <span class="sc-card__badge sc-card__badge--primary" style="font-size:10px;">Primary</span>';
    if (d.scenarioId === _activeScenario) badges += ' <span class="sc-card__badge" style="font-size:10px;">Active</span>';
    const badgeHtml = badges ? `<span class="cmp-header-badges">${badges}</span>` : '';
    return `<div class="cmp-cell cmp-cell--header">${esc(d.name)}${badgeHtml}</div>`;
  }).join('');

  return `
    <div class="cmp-table" style="--cmp-cols:${cols};">
      <div class="cmp-row cmp-row--header">
        <div class="cmp-label"></div>
        ${headers}
      </div>
      ${row('Cadence', data.map(d => d.cadence))}
      ${row('Per-check income', data.map(d => cmpMoney(d.income)))}
      ${row('First pay date', data.map(d => d.firstPayDate))}
      ${row('Duration', data.map(d => d.durationMonths + ' months'))}
      <div class="cmp-divider"></div>
      ${row('Expense count', data.map(d => String(d.expenseCount)))}
      <div class="cmp-divider" style="margin:0;"></div>
      ${row('Top expenses', data.map(d => {
        if (!d.top3.length) return '<span class="text-muted">None</span>';
        const totalRecurring = d.allExpenses.length;
        const topLabel = totalRecurring > 3 ? `<div class="cmp-top-label">Top 3 of ${totalRecurring}</div>` : '';
        const fmtItem = e => `<div class="cmp-top-item"><span class="cmp-top-item__name">${esc(e.name)}</span><span class="cmp-top-item__value">${cmpMoney(e.monthly)}/mo</span></div>`;
        const top3Items = d.top3.map(fmtItem).join('');
        const extraItems = totalRecurring > 3
          ? `<div class="cmp-expense-extra is-hidden" data-expand-id="${esc(d.scenarioId)}">${d.allExpenses.slice(3).map(fmtItem).join('')}</div><button class="cmp-expand-btn" data-expand-target="${esc(d.scenarioId)}">Show full breakdown</button>`
          : '';
        return topLabel + top3Items + extraItems;
      }))}
      <div class="cmp-divider"></div>
      ${row('Income', data.map(d => cmpMoney(d.monthlyIncome) + '/mo'), { cls: 'cmp-cell--bold' })}
      ${row('Obligations', data.map(d => cmpMoney(d.monthlyExp) + '/mo'), { cls: 'cmp-cell--bold' })}
      ${row('Remaining', data.map(d => cmpMoneyColor(d.monthlyLeftover) + '/mo'), { cls: 'cmp-cell--bold' })}
    </div>`;
}

// ---- Helpers -----------------------------------------------

function cmpMoney(n) {
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function cmpMoneyColor(n) {
  const str = cmpMoney(n);
  return n < 0 ? `<span style="color:var(--color-danger);">${str}</span>` : str;
}
