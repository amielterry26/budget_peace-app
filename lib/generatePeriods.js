// Generate budget periods from a start date, cadence, and duration

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

function addMonths(dateStr, months) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const dayOfMonth  = d.getUTCDate();
  const targetMonth = d.getUTCMonth() + months;
  d.setUTCMonth(targetMonth, 1);
  const lastDay = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)
  ).getUTCDate();
  d.setUTCDate(Math.min(dayOfMonth, lastDay));
  return d.toISOString().split('T')[0];
}

const VALID_CADENCES = ['weekly', 'biweekly', 'semimonthly', 'monthly'];

function generatePeriods(userId, cadence, firstPayDate, durationMonths, incomeAmount) {
  if (!VALID_CADENCES.includes(cadence)) {
    throw new Error(`Invalid cadence: "${cadence}". Must be one of: ${VALID_CADENCES.join(', ')}`);
  }

  const periods     = [];
  const boundary    = addMonths(firstPayDate, durationMonths);
  let   periodStart = firstPayDate;
  let   index       = 0;

  while (periodStart < boundary) {
    let nextStart, periodEnd;

    if (cadence === 'weekly') {
      nextStart = addDays(periodStart, 7);
      periodEnd = addDays(periodStart, 6);

    } else if (cadence === 'biweekly') {
      nextStart = addDays(periodStart, 14);
      periodEnd = addDays(periodStart, 13);

    } else if (cadence === 'semimonthly') {
      // Periods always split on the 1st and 15th of each month
      const parts = periodStart.split('-');
      const y = Number(parts[0]);
      const m = Number(parts[1]); // 1–12
      const d = Number(parts[2]);

      if (d < 15) {
        // First half: 1st → 14th; next starts 15th of same month
        periodEnd = `${parts[0]}-${parts[1]}-14`;
        nextStart = `${parts[0]}-${parts[1]}-15`;
      } else {
        // Second half: 15th → last day; next starts 1st of next month
        const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
        periodEnd  = `${parts[0]}-${parts[1]}-${String(lastDay).padStart(2, '0')}`;
        const nxt  = new Date(Date.UTC(y, m, 1)); // 1st of month m+1 (m is 1-indexed, JS uses 0-indexed)
        nextStart  = nxt.toISOString().split('T')[0];
      }

    } else {
      // monthly
      nextStart = addMonths(periodStart, 1);
      periodEnd = addDays(nextStart, -1);
    }

    periods.push({
      userId,
      startDate:   periodStart,
      endDate:     periodEnd,
      income:      incomeAmount,
      periodIndex: index,
      cadence,          // stored so inferCadence() can read it without heuristics
    });

    periodStart = nextStart;
    index++;
    if (index > 1000) break; // safety
  }

  return periods;
}

module.exports = generatePeriods;
module.exports.VALID_CADENCES = VALID_CADENCES;
