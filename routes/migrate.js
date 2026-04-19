const express = require('express');
const { QueryCommand, PutCommand, GetCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const router  = express.Router();
const db      = require('../config/dynamo');
const { verifyOwner } = require('../middleware/auth');
const emailSvc = require('../services/email');
const cron     = require('../services/cron');

// All 7 DynamoDB tables partitioned by userId
const TABLES = [
  { name: 'bp_users',              sortKey: null },
  { name: 'bp_scenarios',          sortKey: 'scenarioId' },
  { name: 'bp_expenses',           sortKey: 'expenseId' },
  { name: 'bp_budget_periods_v2',  sortKey: 'periodKey' },
  { name: 'bp_budget_periods',     sortKey: 'startDate' },
  { name: 'bp_cards',              sortKey: 'cardId' },
  { name: 'bp_goals',              sortKey: 'goalId' },
];

// POST /api/admin/migrate
// Copy all data from sourceUserId (legacy OWNER_USER_ID) to the authenticated user's UUID.
// COPY ONLY — source data is NEVER deleted.
router.post('/migrate', async (req, res) => {
  try {
    const targetUserId = req.userId; // from verified JWT
    const { sourceUserId } = req.body;

    // --- PRECHECKS ---

    if (!sourceUserId) {
      return res.status(400).json({ error: 'sourceUserId is required in request body' });
    }

    // Safety: only allow migrating from the known legacy account
    if (sourceUserId !== process.env.OWNER_USER_ID) {
      return res.status(400).json({ error: 'sourceUserId does not match OWNER_USER_ID env var' });
    }

    if (sourceUserId === targetUserId) {
      return res.status(400).json({ error: 'sourceUserId and target userId are the same' });
    }

    // Verify source bp_users row exists
    const sourceUser = await db.send(new GetCommand({
      TableName: 'bp_users',
      Key: { userId: sourceUserId },
    }));
    if (!sourceUser.Item) {
      return res.status(400).json({ error: `Source user "${sourceUserId}" not found in bp_users` });
    }

    // Verify target bp_users row exists (created by profile sync)
    const targetUser = await db.send(new GetCommand({
      TableName: 'bp_users',
      Key: { userId: targetUserId },
    }));
    if (!targetUser.Item) {
      return res.status(400).json({ error: 'Target user row not found. Please log in first to create your profile.' });
    }

    // Primary double-run protection: check migratedFromUserId marker
    if (targetUser.Item.migratedFromUserId) {
      return res.status(400).json({
        error: 'Migration already completed',
        migratedFromUserId: targetUser.Item.migratedFromUserId,
        migratedAt: targetUser.Item.migratedAt,
      });
    }

    // Secondary safety: verify target has no real scenarios
    const targetScenarios = await db.send(new QueryCommand({
      TableName: 'bp_scenarios',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': targetUserId },
    }));
    const tScens = targetScenarios.Items || [];

    if (tScens.length > 1) {
      return res.status(400).json({ error: 'Target user already has scenarios. Migration aborted to prevent overwriting data.' });
    }

    // Allow migration if the only scenario is the auto-seeded empty primary
    if (tScens.length === 1) {
      const s = tScens[0];
      const isSeeded = s.scenarioId === 'main' && s.isPrimary === true && (s.income === 0 || s.income === undefined);
      if (!isSeeded) {
        return res.status(400).json({ error: 'Target user already has a non-empty scenario. Migration aborted to prevent overwriting data.' });
      }
      // Delete the seeded empty scenario — it will be replaced by source data
      await db.send(new DeleteCommand({
        TableName: 'bp_scenarios',
        Key: { userId: targetUserId, scenarioId: 'main' },
      }));
    }

    // --- MIGRATION ---

    const report = {};

    // 1. bp_users — merge source profile fields into existing target row
    const src = sourceUser.Item;
    await db.send(new UpdateCommand({
      TableName: 'bp_users',
      Key: { userId: targetUserId },
      UpdateExpression: 'SET incomeAmount = :inc, cadence = :cad, firstPayDate = :fpd, durationMonths = :dur, activeScenarioId = :asid',
      ExpressionAttributeValues: {
        ':inc':  src.incomeAmount || 0,
        ':cad':  src.cadence || 'biweekly',
        ':fpd':  src.firstPayDate || null,
        ':dur':  src.durationMonths || 6,
        ':asid': src.activeScenarioId || 'main',
      },
    }));
    report['bp_users'] = 'merged';

    // 2-7. Copy records from remaining tables
    for (const table of TABLES) {
      if (table.name === 'bp_users') continue; // already handled

      const result = await db.send(new QueryCommand({
        TableName: table.name,
        KeyConditionExpression: 'userId = :uid',
        ExpressionAttributeValues: { ':uid': sourceUserId },
      }));
      const items = result.Items || [];

      for (const item of items) {
        const copy = { ...item, userId: targetUserId };
        await db.send(new PutCommand({ TableName: table.name, Item: copy }));
      }

      report[table.name] = items.length;
    }

    // --- MIGRATION MARKER ---
    await db.send(new UpdateCommand({
      TableName: 'bp_users',
      Key: { userId: targetUserId },
      UpdateExpression: 'SET migratedFromUserId = :src, migratedAt = :now',
      ExpressionAttributeValues: {
        ':src': sourceUserId,
        ':now': new Date().toISOString(),
      },
    }));

    // --- REPORT ---
    res.json({
      ok: true,
      sourceUserId,
      targetUserId,
      migrated: report,
      sourcePreserved: true,
    });

  } catch (err) {
    console.error('POST /api/admin/migrate error:', err);
    res.status(500).json({ error: 'Migration failed: ' + err.message });
  }
});

// ============================================================
// POST /api/admin/test-email
// Fire any email type on demand for development/testing
// Body: { type: 'paydaySummary'|'billDue'|'overBudget'|'goalMilestone', userId? }
// If userId is omitted, uses the authenticated user's ID.
// ============================================================
router.post('/test-email', async (req, res) => {
  try {
    const { type, userId: targetId } = req.body;
    const uid = targetId || req.userId;

    const userResult = await db.send(new GetCommand({
      TableName: 'bp_users',
      Key: { userId: uid },
    }));
    if (!userResult.Item) return res.status(404).json({ error: 'User not found' });

    const user = userResult.Item;
    const toEmail = user.email;
    if (!toEmail) return res.status(400).json({ error: 'User has no email' });

    // Load supporting data
    const [periodsRes, expensesRes, cardsRes, banksRes, goalsRes] = await Promise.all([
      db.send(new QueryCommand({ TableName: 'bp_budget_periods', KeyConditionExpression: 'userId = :uid', ExpressionAttributeValues: { ':uid': uid } })),
      db.send(new QueryCommand({ TableName: 'bp_expenses',       KeyConditionExpression: 'userId = :uid', ExpressionAttributeValues: { ':uid': uid } })),
      db.send(new QueryCommand({ TableName: 'bp_cards',          KeyConditionExpression: 'userId = :uid', ExpressionAttributeValues: { ':uid': uid } })),
      db.send(new QueryCommand({ TableName: 'bp_banks',          KeyConditionExpression: 'userId = :uid', ExpressionAttributeValues: { ':uid': uid } })),
      db.send(new QueryCommand({ TableName: 'bp_goals',          KeyConditionExpression: 'userId = :uid', ExpressionAttributeValues: { ':uid': uid } })),
    ]);

    const periods  = periodsRes.Items  || [];
    const expenses = expensesRes.Items || [];
    const cards    = cardsRes.Items    || [];
    const banks    = banksRes.Items    || [];
    const goals    = goalsRes.Items    || [];

    // Use next upcoming period, or first period if none upcoming
    const today = new Date().toISOString().split('T')[0];
    const period = periods.find(p => p.startDate >= today) || periods[0];
    if (!period && type !== 'goalMilestone') {
      return res.status(400).json({ error: 'No budget period found for this user' });
    }

    const scenario = user.activeScenarioId || 'main';
    const recurringExp = expenses.filter(e =>
      e.recurrence === 'recurring' &&
      (!e.scenarioId || e.scenarioId === scenario)
    );
    const totalBills = recurringExp.reduce((s, e) => s + (Number(e.amount) || 0), 0);

    let result;
    switch (type) {
      case 'paydaySummary': {
        const remaining = (Number(period.income) || 0) - totalBills;
        result = await emailSvc.sendPaydaySummary(toEmail, {
          period, expenses: recurringExp, cards, banks, totalBills, remaining,
        });
        break;
      }
      case 'billDue': {
        const due = recurringExp.slice(0, 3); // preview first 3 for testing
        result = await emailSvc.sendBillDueReminder(toEmail, { expenses: due, period, daysAway: 3 });
        break;
      }
      case 'overBudget': {
        const income  = Number(period.income) || 0;
        const overage = Math.max(0, totalBills - income) || 50; // force non-zero for test
        result = await emailSvc.sendOverBudget(toEmail, { period, totalBills, income, overage });
        break;
      }
      case 'goalMilestone': {
        const goal = goals.find(g => g.currentAmount > 0 && g.targetAmount > 0) || goals[0];
        if (!goal) return res.status(400).json({ error: 'No goals found for this user' });
        result = await emailSvc.sendGoalMilestone(toEmail, { goal });
        break;
      }
      default:
        return res.status(400).json({ error: `Unknown type "${type}". Use: paydaySummary, billDue, overBudget, goalMilestone` });
    }

    if (result?.error) {
      return res.status(500).json({ error: result.error.message || 'Resend error', detail: result.error });
    }

    res.json({ ok: true, type, sentTo: toEmail, resendId: result?.data?.id });
  } catch (err) {
    console.error('POST /api/admin/test-email error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/run-cron — manually trigger the daily cron tick
router.post('/run-cron', async (req, res) => {
  try {
    // Reset lastRunDate so tick() actually runs even if already ran today
    cron._lastRunDate = null;
    await cron.tick();
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/admin/run-cron error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
