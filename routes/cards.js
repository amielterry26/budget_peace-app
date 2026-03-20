const express = require('express');
const {
  QueryCommand, PutCommand, DeleteCommand, GetCommand,
} = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('crypto');
const router = express.Router();
const db     = require('../config/dynamo');
const { verifyOwner } = require('../middleware/auth');

const TABLE = 'bp_cards';

router.get('/health', (req, res) => res.json({ ok: true }));

// GET /api/cards/:userId
router.get('/:userId', verifyOwner, async (req, res) => {
  try {
    const result = await db.send(new QueryCommand({
      TableName:                 TABLE,
      KeyConditionExpression:    'userId = :uid',
      ExpressionAttributeValues: { ':uid': req.params.userId },
    }));
    res.json(result.Items || []);
  } catch (err) {
    console.error('GET /api/cards error:', err);
    res.status(500).json({ error: 'Failed to fetch cards' });
  }
});

// POST /api/cards
router.post('/', async (req, res) => {
  try {
    const { userId, name, type, lastFour, colorIndex } = req.body;
    // Verify body userId matches authenticated user
    if (userId && userId !== req.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!userId || !name || !type || !lastFour) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!/^\d{4}$/.test(String(lastFour))) {
      return res.status(400).json({ error: 'lastFour must be exactly 4 digits' });
    }
    const item = {
      userId, cardId: randomUUID(),
      name, type, lastFour: String(lastFour),
      colorIndex: colorIndex ?? 0,
      createdAt:  new Date().toISOString(),
    };
    await db.send(new PutCommand({ TableName: TABLE, Item: item }));
    res.json(item);
  } catch (err) {
    console.error('POST /api/cards error:', err);
    res.status(500).json({ error: 'Failed to create card' });
  }
});

// PUT /api/cards/:userId/:cardId
router.put('/:userId/:cardId', verifyOwner, async (req, res) => {
  try {
    const { name, type, lastFour, colorIndex } = req.body;

    if (!name || !type || !lastFour) {
      return res.status(400).json({ error: 'Missing required fields (name, type, lastFour)' });
    }
    if (!/^\d{4}$/.test(String(lastFour))) {
      return res.status(400).json({ error: 'lastFour must be exactly 4 digits' });
    }

    // Fetch existing item to preserve createdAt and verify it exists
    const existing = await db.send(new GetCommand({
      TableName: TABLE,
      Key: { userId: req.params.userId, cardId: req.params.cardId },
    }));

    if (!existing.Item) {
      return res.status(404).json({ error: 'Card not found' });
    }

    const item = {
      ...existing.Item,
      name, type, lastFour: String(lastFour),
      colorIndex: colorIndex ?? existing.Item.colorIndex ?? 0,
      updatedAt: new Date().toISOString(),
    };
    await db.send(new PutCommand({ TableName: TABLE, Item: item }));
    res.json(item);
  } catch (err) {
    console.error('PUT /api/cards error:', err);
    res.status(500).json({ error: 'Failed to update card' });
  }
});

// DELETE /api/cards/:userId/:cardId
router.delete('/:userId/:cardId', verifyOwner, async (req, res) => {
  try {
    await db.send(new DeleteCommand({
      TableName: TABLE,
      Key: { userId: req.params.userId, cardId: req.params.cardId },
    }));
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/cards error:', err);
    res.status(500).json({ error: 'Failed to delete card' });
  }
});

module.exports = router;
