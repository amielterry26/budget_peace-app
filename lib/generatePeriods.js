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
  d.setUTCMonth(targetMonth, 1);                     // move to 1st of target month
  const lastDay = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)
  ).getUTCDate();
  d.setUTCDate(Math.min(dayOfMonth, lastDay));        // clamp to last valid day
  return d.toISOString().split('T')[0];
}

const VALID_CADENCES = ['biweekly', 'monthly'];

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

    if (cadence === 'biweekly') {
      nextStart = addDays(periodStart, 14);
      periodEnd = addDays(periodStart, 13);
    } else {
      nextStart = addMonths(periodStart, 1);
      periodEnd = addDays(nextStart, -1);
    }

    // Let the last period keep its full natural length
    // (no truncation — avoids 1-2 day tail periods)

    periods.push({
      userId,
      startDate:   periodStart,
      endDate:     periodEnd,
      income:      incomeAmount,
      periodIndex: index,
    });

    periodStart = nextStart;
    index++;
    if (index > 500) break; // safety
  }

  return periods;
}

module.exports = generatePeriods;
