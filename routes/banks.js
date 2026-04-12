const express = require('express');
const {
  QueryCommand, PutCommand, DeleteCommand, UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('crypto');
const router = express.Router();
const db     = require('../config/dynamo');
const { verifyOwner } = require('../middleware/auth');

const TABLE = 'bp_banks';

// GET /api/banks/:userId?scenario=main
// Returns banks for the active scenario.
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
    console.error('GET /api/banks error:', err);
    res.status(500).json({ error: 'Failed to fetch banks' });
  }
});

// POST /api/banks
router.post('/', async (req, res) => {
  try {
    const { userId, scenarioId, name, note, color } = req.body;
    if (userId && userId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    if (!userId || !name) return res.status(400).json({ error: 'Missing required fields' });
    const item = {
      userId, bankId: randomUUID(),
      scenarioId: scenarioId || 'main',
      name, note: note || '',
      color: color || '',
      createdAt: new Date().toISOString(),
    };
    await db.send(new PutCommand({ TableName: TABLE, Item: item }));
    res.json(item);
  } catch (err) {
    console.error('POST /api/banks error:', err);
    res.status(500).json({ error: 'Failed to create bank' });
  }
});

// PUT /api/banks/:userId/:bankId
router.put('/:userId/:bankId', verifyOwner, async (req, res) => {
  const { userId, bankId } = req.params;
  const { name, note, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Missing name' });
  try {
    await db.send(new UpdateCommand({
      TableName:                 TABLE,
      Key:                       { userId, bankId },
      UpdateExpression:          'SET #n = :name, note = :note, color = :color, updatedAt = :now',
      ExpressionAttributeNames:  { '#n': 'name' },
      ExpressionAttributeValues: {
        ':name':  name,
        ':note':  note || '',
        ':color': color || '',
        ':now':   new Date().toISOString(),
      },
    }));
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/banks error:', err);
    res.status(500).json({ error: 'Failed to update bank' });
  }
});

// DELETE /api/banks/:userId/:bankId
// Also unassigns any cards in the same scenario that referenced this bank.
router.delete('/:userId/:bankId', verifyOwner, async (req, res) => {
  const { userId, bankId } = req.params;
  try {
    // 1. Look up the bank's scenarioId so the cascade is scoped to the same scenario
    const bankResult = await db.send(new QueryCommand({
      TableName:                 TABLE,
      KeyConditionExpression:    'userId = :uid AND bankId = :bid',
      ExpressionAttributeValues: { ':uid': userId, ':bid': bankId },
    }));
    const bank = (bankResult.Items || [])[0];
    const scenarioId = bank?.scenarioId || 'main';

    // 2. Find cards in the same scenario that have this bankId
    const cardsResult = await db.send(new QueryCommand({
      TableName:                 'bp_cards',
      KeyConditionExpression:    'userId = :uid',
      FilterExpression:          'bankId = :bid AND (scenarioId = :sid OR (attribute_not_exists(scenarioId) AND :sid = :main))',
      ExpressionAttributeValues: { ':uid': userId, ':bid': bankId, ':sid': scenarioId, ':main': 'main' },
    }));

    // 3. Unassign bankId from each affected card
    const now = new Date().toISOString();
    const unassignOps = (cardsResult.Items || []).map(card =>
      db.send(new UpdateCommand({
        TableName:                 'bp_cards',
        Key:                       { userId, cardId: card.cardId },
        UpdateExpression:          'REMOVE bankId SET updatedAt = :now',
        ExpressionAttributeValues: { ':now': now },
      }))
    );

    // 4. Delete the bank record and unassign cards in parallel
    await Promise.all([
      db.send(new DeleteCommand({
        TableName: TABLE,
        Key: { userId, bankId },
      })),
      ...unassignOps,
    ]);

    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/banks error:', err);
    res.status(500).json({ error: 'Failed to delete bank' });
  }
});

module.exports = router;
