const express = require('express');
const {
  QueryCommand, PutCommand, DeleteCommand, GetCommand, UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('crypto');
const router = express.Router();
const db     = require('../config/dynamo');
const { verifyOwner } = require('../middleware/auth');

const TABLE = 'bp_cards';

router.get('/health', (req, res) => res.json({ ok: true }));

// GET /api/cards/:userId?scenario=main
// Returns cards for the active scenario.
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
    console.error('GET /api/cards error:', err);
    res.status(500).json({ error: 'Failed to fetch cards' });
  }
});

// POST /api/cards
router.post('/', async (req, res) => {
  try {
    const { userId, scenarioId, name, type, lastFour, colorIndex, bankId } = req.body;
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
      scenarioId: scenarioId || 'main',
      name, type, lastFour: String(lastFour),
      colorIndex: colorIndex ?? 0,
      sortOrder:  Date.now(),
      createdAt:  new Date().toISOString(),
    };
    if (bankId) item.bankId = bankId;
    await db.send(new PutCommand({ TableName: TABLE, Item: item }));
    res.json(item);
  } catch (err) {
    console.error('POST /api/cards error:', err);
    res.status(500).json({ error: 'Failed to create card' });
  }
});

// PUT /api/cards/:userId/order — batch-update sortOrder for a list of cards
router.put('/:userId/order', verifyOwner, async (req, res) => {
  const { userId } = req.params;
  const { items } = req.body; // [{cardId, sortOrder}]
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items must be an array' });
  try {
    await Promise.all(items.map(({ cardId, sortOrder }) =>
      db.send(new UpdateCommand({
        TableName: TABLE,
        Key: { userId, cardId },
        UpdateExpression: 'SET sortOrder = :so',
        ExpressionAttributeValues: { ':so': Number(sortOrder) },
      }))
    ));
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/cards/order error:', err);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// PUT /api/cards/:userId/:cardId
router.put('/:userId/:cardId', verifyOwner, async (req, res) => {
  try {
    const { name, type, lastFour, colorIndex, bankId } = req.body;

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
    if (bankId) {
      item.bankId = bankId;
    } else {
      delete item.bankId;
    }
    await db.send(new PutCommand({ TableName: TABLE, Item: item }));
    res.json(item);
  } catch (err) {
    console.error('PUT /api/cards error:', err);
    res.status(500).json({ error: 'Failed to update card' });
  }
});

// PUT /api/cards/:userId/:cardId/expenses — bulk-assign expenses to a card
// expense.cardId is the single source of truth for card↔expense links.
router.put('/:userId/:cardId/expenses', verifyOwner, async (req, res) => {
  try {
    const { userId, cardId } = req.params;
    const { expenseIds } = req.body;

    if (!Array.isArray(expenseIds)) {
      return res.status(400).json({ error: 'expenseIds must be an array' });
    }

    const newSet = new Set(expenseIds);
    const now = new Date().toISOString();

    // 1. Find expenses currently linked to this card
    const linked = await db.send(new QueryCommand({
      TableName:                 'bp_expenses',
      KeyConditionExpression:    'userId = :uid',
      FilterExpression:          'cardId = :cid',
      ExpressionAttributeValues: { ':uid': userId, ':cid': cardId },
    }));

    // 2. Unlink expenses that were on this card but are no longer selected
    const unlinkOps = (linked.Items || [])
      .filter(e => !newSet.has(e.expenseId))
      .map(e => db.send(new UpdateCommand({
        TableName: 'bp_expenses',
        Key: { userId, expenseId: e.expenseId },
        UpdateExpression: 'REMOVE cardId SET updatedAt = :now',
        ExpressionAttributeValues: { ':now': now },
      })));

    // 3. Link selected expenses to this card (works even if already on another card)
    const linkOps = expenseIds.map(expenseId =>
      db.send(new UpdateCommand({
        TableName: 'bp_expenses',
        Key: { userId, expenseId },
        UpdateExpression: 'SET cardId = :cid, updatedAt = :now',
        ExpressionAttributeValues: { ':cid': cardId, ':now': now },
      }))
    );

    await Promise.all([...unlinkOps, ...linkOps]);
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/cards/:cardId/expenses error:', err);
    res.status(500).json({ error: 'Failed to update card expenses' });
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
