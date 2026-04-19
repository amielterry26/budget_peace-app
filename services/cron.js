// ============================================================
// Cron — scheduled email notifications
// Runs once per day (checked every hour, fires within a 1h window)
// ============================================================
'use strict';

const { ScanCommand, QueryCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const db = require('../config/dynamo');
const email = require('./email');
const { calcPeriodExpenses } = require('../lib/periodUtils');

const USERS_TABLE     = 'bp_users';
const SCENARIOS_TABLE = 'bp_scenarios';
const PERIODS_TABLE   = 'bp_budget_periods';
const EXPENSES_TABLE  = 'bp_expenses';
const CARDS_TABLE     = 'bp_cards';
const BANKS_TABLE     = 'bp_banks';

// ---- Date utilities -----------------------------------------

function todayUTC() {
  const d = new Date();
  return d.getUTCFullYear() + '-' +
    String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(d.getUTCDate()).padStart(2, '0');
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
}

// ---- Data loaders -------------------------------------------

async function getAllUsers() {
  const result = await db.send(new ScanCommand({ TableName: USERS_TABLE }));
  return result.Items || [];
}

async function getActiveScenario(userId, activeScenarioId) {
  const sid = activeScenarioId || 'main';
  const result = await db.send(new GetCommand({
    TableName: SCENARIOS_TABLE,
    Key: { userId, scenarioId: sid },
  }));
  return result.Item || null;
}

// Returns the effective emailPrefs: scenario-level first, user-level fallback
async function getEmailPrefs(user) {
  const scenario = await getActiveScenario(user.userId, user.activeScenarioId);
  return scenario?.emailPrefs || user.emailPrefs || {};
}

async function getPeriodsForUser(userId) {
  const result = await db.send(new QueryCommand({
    TableName: PERIODS_TABLE,
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
  }));
  return result.Items || [];
}

async function getExpensesForUser(userId) {
  const result = await db.send(new QueryCommand({
    TableName: EXPENSES_TABLE,
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
  }));
  return result.Items || [];
}

async function getCardsForUser(userId) {
  const result = await db.send(new QueryCommand({
    TableName: CARDS_TABLE,
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
  }));
  return result.Items || [];
}

async function getBanksForUser(userId) {
  const result = await db.send(new QueryCommand({
    TableName: BANKS_TABLE,
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
  }));
  return result.Items || [];
}

// ---- Bill-due detection ------------------------------------
// Returns expenses whose dueDate is exactly `targetDate`

function getExpensesDueOn(expenses, targetDate) {
  return expenses.filter(e => {
    if (e.recurrence !== 'recurring') return false;
    if (e.dueDate && e.dueDate === targetDate) return true;
    return false;
  });
}

// ---- Payday summary -----------------------------------------

async function runPaydaySummary(users, today) {
  const tomorrow = addDays(today, 1);

  for (const user of users) {
    const prefs = await getEmailPrefs(user);
    if (!prefs.paydaySummary) continue;
    const toEmail = user.email;
    if (!toEmail) continue;

    try {
      const periods  = await getPeriodsForUser(user.userId);
      const period   = periods.find(p => p.startDate === tomorrow);
      if (!period) continue;

      const expenses = await getExpensesForUser(user.userId);
      const cards    = await getCardsForUser(user.userId);
      const banks    = await getBanksForUser(user.userId);

      // Only recurring expenses scoped to this scenario (or no scenarioId = main)
      const scenario = user.activeScenarioId || 'main';
      const scenarioExp = expenses.filter(e =>
        e.recurrence === 'recurring' &&
        (!e.scenarioId || e.scenarioId === scenario)
      );

      // Apply period-aware expense math (allocation, dueDay, multiplier)
      const { items: periodExp, total: totalBills } = calcPeriodExpenses(scenarioExp, period);
      const remaining = (Number(period.income) || 0) - totalBills;

      await email.sendPaydaySummary(toEmail, { period, expenses: periodExp, cards, banks, totalBills, remaining });
      console.log(`[cron] paydaySummary sent to ${toEmail} for period ${tomorrow}`);
    } catch (err) {
      console.error(`[cron] paydaySummary error for userId=${user.userId}:`, err.message);
    }
  }
}

// ---- Bill due reminders (3 days before) ----------------------

async function runBillDueReminders(users, today) {
  const targetDate = addDays(today, 3);

  for (const user of users) {
    const prefs = await getEmailPrefs(user);
    if (!prefs.billReminders) continue;
    const toEmail = user.email;
    if (!toEmail) continue;

    try {
      const expenses = await getExpensesForUser(user.userId);
      const periods  = await getPeriodsForUser(user.userId);
      const due      = getExpensesDueOn(expenses, targetDate);
      if (due.length === 0) continue;

      // Find the period that contains targetDate
      const period = periods.find(p => p.startDate <= targetDate && p.endDate >= targetDate);
      if (!period) continue;

      await email.sendBillDueReminder(toEmail, { expenses: due, period, daysAway: 3 });
      console.log(`[cron] billDueReminder sent to ${toEmail} for ${targetDate}`);
    } catch (err) {
      console.error(`[cron] billDueReminder error for userId=${user.userId}:`, err.message);
    }
  }
}

// ---- Over-budget alert (triggered on payday period start) ---

async function runOverBudgetAlerts(users, today) {
  for (const user of users) {
    const prefs = await getEmailPrefs(user);
    if (!prefs.overBudget) continue;
    const toEmail = user.email;
    if (!toEmail) continue;

    try {
      const periods  = await getPeriodsForUser(user.userId);
      const period   = periods.find(p => p.startDate === today);
      if (!period) continue;

      const expenses = await getExpensesForUser(user.userId);
      const scenario = user.activeScenarioId || 'main';
      const scenarioExp = expenses.filter(e =>
        e.recurrence === 'recurring' &&
        (!e.scenarioId || e.scenarioId === scenario)
      );

      const income     = Number(period.income) || 0;
      const { total: totalBills } = calcPeriodExpenses(scenarioExp, period);
      const overage    = totalBills - income;
      if (overage <= 0) continue;

      await email.sendOverBudget(toEmail, { period, totalBills, income, overage });
      console.log(`[cron] overBudget alert sent to ${toEmail} for period ${today}`);
    } catch (err) {
      console.error(`[cron] overBudget error for userId=${user.userId}:`, err.message);
    }
  }
}

// ============================================================
// Main tick — runs all checks
// ============================================================

let _lastRunDate = null;

async function tick() {
  const today = todayUTC();
  if (_lastRunDate === today) return; // already ran today
  _lastRunDate = today;

  console.log(`[cron] running daily notifications for ${today}`);

  let users;
  try {
    users = await getAllUsers();
  } catch (err) {
    console.error('[cron] failed to load users:', err.message);
    return;
  }

  await Promise.allSettled([
    runPaydaySummary(users, today),
    runBillDueReminders(users, today),
    runOverBudgetAlerts(users, today),
  ]);

  console.log(`[cron] done for ${today}`);
}

// ============================================================
// Start — checks every hour
// ============================================================

function start() {
  if (!process.env.RESEND_API_KEY) {
    console.log('[cron] RESEND_API_KEY not set — email notifications disabled');
    return;
  }

  // Run immediately (catches deploys that happen at the right time)
  tick().catch(err => console.error('[cron] tick error:', err));

  // Then check every hour
  setInterval(() => {
    tick().catch(err => console.error('[cron] tick error:', err));
  }, 60 * 60 * 1000);

  console.log('[cron] email notification scheduler started');
}

const cronExports = { start, tick };

// Expose for admin reset (POST /api/admin/run-cron)
Object.defineProperty(cronExports, '_lastRunDate', {
  get: () => _lastRunDate,
  set: (v) => { _lastRunDate = v; },
  enumerable: false,
  configurable: true,
});

module.exports = cronExports;
