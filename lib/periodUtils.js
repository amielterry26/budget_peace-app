'use strict';

// ============================================================
// Period expense math — ported from public/js/shared.js and
// public/js/pages/pay-period.js. Must stay in sync with frontend.
// Used by cron.js and routes/migrate.js (test email).
// ============================================================

function inferCadence(period) {
  if (period.cadence) return period.cadence;
  const days = Math.round(
    (new Date(period.endDate + 'T00:00:00Z') - new Date(period.startDate + 'T00:00:00Z')) / 86400000
  ) + 1;
  if (days <= 8)  return 'weekly';
  if (days <= 17) return 'biweekly'; // semimonthly 15th–31st = 17 days
  return 'monthly';
}

function dueDayInPeriod(dueDay, period) {
  const start = new Date(period.startDate + 'T00:00:00Z');
  let m = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  for (let i = 0; i < 2; i++) {
    const lastDay   = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0)).getUTCDate();
    const actualDay = Math.min(dueDay, lastDay);
    const candidate = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), actualDay))
      .toISOString().split('T')[0];
    if (candidate >= period.startDate && candidate <= period.endDate) return true;
    m.setUTCMonth(m.getUTCMonth() + 1);
  }
  return false;
}

function expMultiplier(expenseFreq, periodCadence) {
  if (periodCadence === 'weekly') return 1;
  if (periodCadence === 'biweekly' || periodCadence === 'semimonthly') {
    return expenseFreq === 'weekly' ? 2 : 1;
  }
  // monthly
  if (expenseFreq === 'weekly')   return 4;
  if (expenseFreq === 'biweekly') return 2;
  return 1;
}

function getEffectiveAllocation(expense) {
  const m = expense.allocationMethod;
  if (m === 'paycheck1' || m === 'first')  return 'first';
  if (m === 'paycheck2' || m === 'second') return 'second';
  if (m === 'split')    return 'split';
  if (m === 'due-date') return 'due-date';
  if (expense.splitBiweekly) return 'split';
  return 'due-date';
}

/**
 * Calculate which recurring expenses belong to a specific period
 * and at what amounts. Mirrors calcPdExpenses() from pay-period.js.
 *
 * Returns { items, total } where items have a displayAmount field.
 */
function calcPeriodExpenses(expenses, period) {
  const cadence = inferCadence(period);
  let total = 0;
  const items = [];

  for (const e of expenses) {
    if (e.recurrence !== 'recurring') continue;

    const startDate = e.recurrenceStartDate || '1970-01-01';
    if (startDate > period.endDate) continue;
    if (e.endDate && e.endDate < period.startDate) continue;

    const freq = e.recurrenceFrequency || 'monthly';
    let mult;

    // Monthly expense in a half-month period (biweekly or semimonthly):
    // only assign it to the period that contains its dueDay.
    if (freq === 'monthly' && (cadence === 'biweekly' || cadence === 'semimonthly')) {
      const alloc = getEffectiveAllocation(e);
      if (alloc === 'split') {
        mult = 0.5;
      } else if (alloc === 'first') {
        mult = dueDayInPeriod(1, period) ? 1 : 0;
      } else if (alloc === 'second') {
        mult = dueDayInPeriod(16, period) ? 1 : 0;
      } else {
        // 'due-date' (default): full amount only if dueDay falls in this period
        mult = dueDayInPeriod(e.dueDay || 1, period) ? 1 : 0;
      }
    } else if (freq === 'biweekly' && (cadence === 'biweekly' || cadence === 'semimonthly') && e.allocationMethod) {
      const alloc = getEffectiveAllocation(e);
      if (alloc === 'first') {
        mult = dueDayInPeriod(1, period) ? 1 : 0;
      } else if (alloc === 'second') {
        mult = dueDayInPeriod(16, period) ? 1 : 0;
      } else if (alloc === 'due-date') {
        mult = dueDayInPeriod(e.dueDay || 1, period) ? 1 : 0;
      } else {
        mult = 1; // split = every period
      }
    } else {
      mult = expMultiplier(freq, cadence);
    }

    if (mult === 0) continue;

    const displayAmount = Math.round(e.amount * mult * 100) / 100;
    total += displayAmount;
    items.push({ ...e, displayAmount });
  }

  return { items, total: Math.round(total * 100) / 100 };
}

module.exports = { inferCadence, dueDayInPeriod, expMultiplier, calcPeriodExpenses };
