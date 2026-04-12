const express = require('express');
const {
  QueryCommand, PutCommand, DeleteCommand, GetCommand,
} = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('crypto');
const router = express.Router();
const db     = require('../config/dynamo');
const { verifyOwner } = require('../middleware/auth');

const TABLE = 'bp_goals';

// Helper: recompute currentSaved from contributions array
function sumContributions(contributions) {
  if (!Array.isArray(contributions) || contributions.length === 0) return 0;
  return Math.round(contributions.reduce((sum, c) => sum + (Number(c.amount) || 0), 0) * 100) / 100;
}

// GET /api/goals/:userId?scenario=main
// Returns goals for the active scenario.
// Legacy records with no scenarioId are treated as belonging to 'main'.
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
      scenarioId: scenarioId || 'main',
      name,
      targetAmount:  parsedAmount,
      targetDate,
      currentSaved:  0,
      contributions: [],
      createdAt:     new Date().toISOString(),
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
router.put('/:userId/:goalId', verifyOwner, async (req, res) => {
  try {
    const { name, targetAmount, targetDate, plannedContribution } = req.body;
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

    const existing = await db.send(new GetCommand({
      TableName: TABLE,
      Key: { userId: req.params.userId, goalId: req.params.goalId },
    }));
    if (!existing.Item) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    const item = {
      ...existing.Item,
      name,
      targetAmount:  parsedAmount,
      targetDate,
      updatedAt:     new Date().toISOString(),
      plannedContribution: plannedContribution ? Number(plannedContribution) : undefined,
    };
    await db.send(new PutCommand({ TableName: TABLE, Item: item }));
    res.json(item);
  } catch (err) {
    console.error('PUT /api/goals error:', err);
    res.status(500).json({ error: 'Failed to update goal' });
  }
});

// ---- Contribution ledger endpoints ----------------------------------------

// POST /api/goals/:userId/:goalId/contributions
// Add a contribution entry. Auto-migrates legacy flat currentSaved to a ledger entry.
router.post('/:userId/:goalId/contributions', verifyOwner, async (req, res) => {
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
    let contributions = Array.isArray(g.contributions) ? [...g.contributions] : [];

    // Migrate legacy flat currentSaved into a ledger entry (one-time)
    if (contributions.length === 0 && (g.currentSaved || 0) > 0) {
      contributions.push({
        id:     'legacy',
        amount: g.currentSaved,
        date:   (g.createdAt || new Date().toISOString()).slice(0, 10),
        note:   'Previous balance',
      });
    }

    const newEntry = { id: randomUUID(), amount: parsedAmount, date };
    if (note && note.trim()) newEntry.note = note.trim();
    contributions.push(newEntry);

    const item = { ...g, contributions, currentSaved: sumContributions(contributions), updatedAt: new Date().toISOString() };
    await db.send(new PutCommand({ TableName: TABLE, Item: item }));
    res.json(item);
  } catch (err) {
    console.error('POST /contributions error:', err);
    res.status(500).json({ error: 'Failed to add contribution' });
  }
});

// PUT /api/goals/:userId/:goalId/contributions/:contribId
// Edit a contribution entry.
router.put('/:userId/:goalId/contributions/:contribId', verifyOwner, async (req, res) => {
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
    const contributions = (Array.isArray(g.contributions) ? [...g.contributions] : []).map(c => {
      if (c.id !== req.params.contribId) return c;
      const updated = { ...c, amount: parsedAmount, date };
      if (note && note.trim()) updated.note = note.trim();
      else delete updated.note;
      return updated;
    });

    const item = { ...g, contributions, currentSaved: sumContributions(contributions), updatedAt: new Date().toISOString() };
    await db.send(new PutCommand({ TableName: TABLE, Item: item }));
    res.json(item);
  } catch (err) {
    console.error('PUT /contributions/:id error:', err);
    res.status(500).json({ error: 'Failed to update contribution' });
  }
});

// DELETE /api/goals/:userId/:goalId/contributions/:contribId
// Delete a single contribution entry.
router.delete('/:userId/:goalId/contributions/:contribId', verifyOwner, async (req, res) => {
  try {
    const existing = await db.send(new GetCommand({
      TableName: TABLE,
      Key: { userId: req.params.userId, goalId: req.params.goalId },
    }));
    if (!existing.Item) return res.status(404).json({ error: 'Goal not found' });

    const g = existing.Item;
    const contributions = (Array.isArray(g.contributions) ? g.contributions : [])
      .filter(c => c.id !== req.params.contribId);

    const item = { ...g, contributions, currentSaved: sumContributions(contributions), updatedAt: new Date().toISOString() };
    await db.send(new PutCommand({ TableName: TABLE, Item: item }));
    res.json(item);
  } catch (err) {
    console.error('DELETE /contributions/:id error:', err);
    res.status(500).json({ error: 'Failed to delete contribution' });
  }
});

// DELETE /api/goals/:userId/:goalId/contributions
// Reset — delete all contribution entries and set currentSaved to 0.
router.delete('/:userId/:goalId/contributions', verifyOwner, async (req, res) => {
  try {
    const existing = await db.send(new GetCommand({
      TableName: TABLE,
      Key: { userId: req.params.userId, goalId: req.params.goalId },
    }));
    if (!existing.Item) return res.status(404).json({ error: 'Goal not found' });

    const item = { ...existing.Item, contributions: [], currentSaved: 0, updatedAt: new Date().toISOString() };
    await db.send(new PutCommand({ TableName: TABLE, Item: item }));
    res.json(item);
  } catch (err) {
    console.error('DELETE /contributions error:', err);
    res.status(500).json({ error: 'Failed to reset contributions' });
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
