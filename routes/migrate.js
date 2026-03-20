const express = require('express');
const { QueryCommand, PutCommand, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const router  = express.Router();
const db      = require('../config/dynamo');
const { verifyOwner } = require('../middleware/auth');

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

    // Secondary safety: verify target has no existing scenarios
    const targetScenarios = await db.send(new QueryCommand({
      TableName: 'bp_scenarios',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': targetUserId },
    }));
    if ((targetScenarios.Items || []).length > 0) {
      return res.status(400).json({ error: 'Target user already has scenarios. Migration aborted to prevent overwriting data.' });
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

module.exports = router;
