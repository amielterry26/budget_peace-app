const express = require('express');
const {
  QueryCommand, PutCommand, DeleteCommand, GetCommand, UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('crypto');
const router = express.Router();
const db     = require('../config/dynamo');
const { verifyOwner } = require('../middleware/auth');

const TABLE = 'bp_goals';

// GET /api/goals/:userId
router.get('/:userId', verifyOwner, async (req, res) => {
  try {
    const result = await db.send(new QueryCommand({
      TableName:                 TABLE,
      KeyConditionExpression:    'userId = :uid',
      ExpressionAttributeValues: { ':uid': req.params.userId },
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
    const { userId, name, targetAmount, targetDate, plannedContribution } = req.body;
    // Verify body userId matches authenticated user
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
      userId, goalId, name,
      targetAmount:  parsedAmount,
      targetDate,
      currentSaved:  0,
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

// POST /api/goals/:userId/:goalId/contribute
router.post('/:userId/:goalId/contribute', verifyOwner, async (req, res) => {
  try {
    const { amount } = req.body;
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }

    const result = await db.send(new UpdateCommand({
      TableName: TABLE,
      Key: { userId: req.params.userId, goalId: req.params.goalId },
      UpdateExpression: 'SET currentSaved = if_not_exists(currentSaved, :zero) + :amt, updatedAt = :now',
      ExpressionAttributeValues: {
        ':amt':  parsedAmount,
        ':zero': 0,
        ':now':  new Date().toISOString(),
      },
      ReturnValues: 'ALL_NEW',
    }));
    res.json(result.Attributes);
  } catch (err) {
    console.error('POST /api/goals/contribute error:', err);
    res.status(500).json({ error: 'Failed to log contribution' });
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
