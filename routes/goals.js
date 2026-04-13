const express = require('express');
const {
  QueryCommand, PutCommand, DeleteCommand, GetCommand,
} = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('crypto');
const router = express.Router();
const db     = require('../config/dynamo');
const { verifyOwner } = require('../middleware/auth');
const { canAddGoal }  = require('../lib/planLimits');

const TABLE = 'bp_goals';

// GET /api/goals/:userId?scenario=main
router.get('/:userId', verifyOwner, async (req, res) => {
  try {
    const scenario = req.query.scenario || 'main';
    const result = await db.send(new QueryCommand({
      TableName:                 TABLE,
      KeyConditionExpression:    'userId = :uid',
      FilterExpression:          'scenarioId = :sid OR (attribute_not_exists(scenarioId) AND :sid = :main)',
      ExpressionAttributeValues: { ':uid': req.params.userId, ':sid': scenario, ':main': 'main' },
    }));
    res.json(result.Items || []);
  } catch (err) {
    console.error('GET /api/goals error:', err);
    res.status(500).json({ error: 'Failed to fetch goals' });
  }
});

// POST /api/goals
router.post('/', async (req, res) => {
  try {
    const { userId, scenarioId, name, targetAmount, targetDate, plannedContribution } = req.body;
    if (userId && userId !== req.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!userId || !name || !targetAmount || !targetDate) {
      return res.status(400).json({ error: 'Missing required fields (userId, name, targetAmount, targetDate)' });
    }

    // Plan gate: enforce maxGoals
    const goalCheck = await canAddGoal(db, userId, scenarioId || 'main');
    if (!goalCheck.allowed) {
      return res.status(403).json({
        error: 'Goal limit reached. Upgrade to Pro for unlimited goals.',
        code: 'PLAN_LIMIT_GOALS',
        current: goalCheck.current,
        max: goalCheck.max,
      });
    }

    const parsedAmount = Number(targetAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'targetAmount must be a positive number' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || isNaN(Date.parse(targetDate))) {
      return res.status(400).json({ error: 'targetDate must be a valid date (YYYY-MM-DD)' });
    }

    const goalId = randomUUID();
    const item = {
      userId, goalId,
      scenarioId:          scenarioId || 'main',
      name,
      targetAmount:        parsedAmount,
      targetDate,
      currentSaved:        0,
      contributionEntries: [],
      createdAt:           new Date().toISOString(),
      ...(plannedContribution && { plannedContribution: Number(plannedContribution) }),
    };
    await db.send(new PutCommand({ TableName: TABLE, Item: item }));
    res.json(item);
  } catch (err) {
    console.error('POST /api/goals error:', err);
    res.status(500).json({ error: 'Failed to create goal' });
  }
});

// PUT /api/goals/:userId/:goalId
// If currentSaved is explicitly changed, an adjustment entry is created so history stays reconciled.
router.put('/:userId/:goalId', verifyOwner, async (req, res) => {
  try {
    const { name, targetAmount, targetDate, plannedContribution, currentSaved } = req.body;
    if (!name || !targetAmount || !targetDate) {
      return res.status(400).json({ error: 'Missing required fields (name, targetAmount, targetDate)' });
    }

    const parsedAmount = Number(targetAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'targetAmount must be a positive number' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || isNaN(Date.parse(targetDate))) {
      return res.status(400).json({ error: 'targetDate must be a valid date (YYYY-MM-DD)' });
    }

    let parsedSaved;
    if (currentSaved !== undefined && currentSaved !== null && currentSaved !== '') {
      parsedSaved = Number(currentSaved);
      if (!Number.isFinite(parsedSaved) || parsedSaved < 0) {
        return res.status(400).json({ error: 'currentSaved must be a non-negative number' });
      }
    }

    const existing = await db.send(new GetCommand({
      TableName: TABLE,
      Key: { userId: req.params.userId, goalId: req.params.goalId },
    }));
    if (!existing.Item) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    const g = existing.Item;
    let contributionEntries = Array.isArray(g.contributionEntries) ? [...g.contributionEntries] : [];

    // If currentSaved changed, create a visible adjustment entry so history stays reconciled
    if (parsedSaved !== undefined) {
      const oldSaved = g.currentSaved || 0;
      const delta    = Math.round((parsedSaved - oldSaved) * 100) / 100;
      if (delta !== 0) {
        contributionEntries.push({
          id:   randomUUID(),
          amount: delta,
          date: new Date().toISOString().slice(0, 10),
          note: 'Manual adjustment',
        });
      }
    }

    const item = {
      ...g,
      name,
      targetAmount:  parsedAmount,
      targetDate,
      updatedAt:     new Date().toISOString(),
      contributionEntries,
      ...(parsedSaved !== undefined && { currentSaved: parsedSaved }),
      plannedContribution: plannedContribution ? Number(plannedContribution) : undefined,
    };
    await db.send(new PutCommand({ TableName: TABLE, Item: item }));
    res.json(item);
  } catch (err) {
    console.error('PUT /api/goals error:', err);
    res.status(500).json({ error: 'Failed to update goal' });
  }
});

// POST /api/goals/:userId/:goalId/contribute
// Logs a contribution entry and increments currentSaved.
router.post('/:userId/:goalId/contribute', verifyOwner, async (req, res) => {
  try {
    const { amount, date, note } = req.body;
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    }

    const existing = await db.send(new GetCommand({
      TableName: TABLE,
      Key: { userId: req.params.userId, goalId: req.params.goalId },
    }));
    if (!existing.Item) return res.status(404).json({ error: 'Goal not found' });

    const g = existing.Item;
    const entry = { id: randomUUID(), amount: parsedAmount, date };
    if (note && note.trim()) entry.note = note.trim();

    const contributionEntries = Array.isArray(g.contributionEntries)
      ? [...g.contributionEntries, entry]
      : [entry];
    const currentSaved = Math.round(((g.currentSaved || 0) + parsedAmount) * 100) / 100;

    const item = { ...g, contributionEntries, currentSaved, updatedAt: new Date().toISOString() };
    await db.send(new PutCommand({ TableName: TABLE, Item: item }));
    res.json(item);
  } catch (err) {
    console.error('POST /api/goals/contribute error:', err);
    res.status(500).json({ error: 'Failed to log contribution' });
  }
});

// PUT /api/goals/:userId/:goalId/contributions/:entryId
// Edit a contribution entry. Applies delta to currentSaved.
router.put('/:userId/:goalId/contributions/:entryId', verifyOwner, async (req, res) => {
  try {
    const { amount, date, note } = req.body;
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    }

    const existing = await db.send(new GetCommand({
      TableName: TABLE,
      Key: { userId: req.params.userId, goalId: req.params.goalId },
    }));
    if (!existing.Item) return res.status(404).json({ error: 'Goal not found' });

    const g = existing.Item;
    const entries = Array.isArray(g.contributionEntries) ? [...g.contributionEntries] : [];
    const idx     = entries.findIndex(e => e.id === req.params.entryId);
    if (idx === -1) return res.status(404).json({ error: 'Entry not found' });

    const oldAmount = entries[idx].amount;
    const delta     = Math.round((parsedAmount - oldAmount) * 100) / 100;

    const updatedEntry = { ...entries[idx], amount: parsedAmount, date };
    if (note && note.trim()) updatedEntry.note = note.trim();
    else delete updatedEntry.note;
    entries[idx] = updatedEntry;

    const currentSaved = Math.round(((g.currentSaved || 0) + delta) * 100) / 100;
    const item = { ...g, contributionEntries: entries, currentSaved, updatedAt: new Date().toISOString() };
    await db.send(new PutCommand({ TableName: TABLE, Item: item }));
    res.json(item);
  } catch (err) {
    console.error('PUT /contributions/:entryId error:', err);
    res.status(500).json({ error: 'Failed to update contribution entry' });
  }
});

// DELETE /api/goals/:userId/:goalId/contributions/:entryId
// Delete a contribution entry. Subtracts its amount from currentSaved.
router.delete('/:userId/:goalId/contributions/:entryId', verifyOwner, async (req, res) => {
  try {
    const existing = await db.send(new GetCommand({
      TableName: TABLE,
      Key: { userId: req.params.userId, goalId: req.params.goalId },
    }));
    if (!existing.Item) return res.status(404).json({ error: 'Goal not found' });

    const g       = existing.Item;
    const entries = Array.isArray(g.contributionEntries) ? [...g.contributionEntries] : [];
    const entry   = entries.find(e => e.id === req.params.entryId);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });

    const remaining    = entries.filter(e => e.id !== req.params.entryId);
    const currentSaved = Math.max(0, Math.round(((g.currentSaved || 0) - entry.amount) * 100) / 100);

    const item = { ...g, contributionEntries: remaining, currentSaved, updatedAt: new Date().toISOString() };
    await db.send(new PutCommand({ TableName: TABLE, Item: item }));
    res.json(item);
  } catch (err) {
    console.error('DELETE /contributions/:entryId error:', err);
    res.status(500).json({ error: 'Failed to delete contribution entry' });
  }
});

// DELETE /api/goals/:userId/:goalId
router.delete('/:userId/:goalId', verifyOwner, async (req, res) => {
  try {
    await db.send(new DeleteCommand({
      TableName: TABLE,
      Key: { userId: req.params.userId, goalId: req.params.goalId },
    }));
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/goals error:', err);
    res.status(500).json({ error: 'Failed to delete goal' });
  }
});

module.exports = router;
