const express = require('express');
const {
  QueryCommand, PutCommand, DeleteCommand, UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('crypto');
const router = express.Router();
const db     = require('../config/dynamo');
const { verifyOwner } = require('../middleware/auth');

const TABLE = 'bp_banks';

// GET /api/banks/:userId
router.get('/:userId', verifyOwner, async (req, res) => {
  try {
    const result = await db.send(new QueryCommand({
      TableName:                 TABLE,
      KeyConditionExpression:    'userId = :uid',
      ExpressionAttributeValues: { ':uid': req.params.userId },
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
    const { userId, name, note } = req.body;
    if (userId && userId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    if (!userId || !name) return res.status(400).json({ error: 'Missing required fields' });
    const item = {
      userId, bankId: randomUUID(),
      name, note: note || '',
      createdAt: new Date().toISOString(),
    };
    await db.send(new PutCommand({ TableName: TABLE, Item: item }));
    res.json(item);
  } catch (err) {
    console.error('POST /api/banks error:', err);
    res.status(500).json({ error: 'Failed to create bank' });
  }
});

// DELETE /api/banks/:userId/:bankId
// Also unassigns any cards that referenced this bank.
router.delete('/:userId/:bankId', verifyOwner, async (req, res) => {
  const { userId, bankId } = req.params;
  try {
    // 1. Find all cards for this user that have this bankId
    const cardsResult = await db.send(new QueryCommand({
      TableName:                 'bp_cards',
      KeyConditionExpression:    'userId = :uid',
      FilterExpression:          'bankId = :bid',
      ExpressionAttributeValues: { ':uid': userId, ':bid': bankId },
    }));

    // 2. Unassign bankId from each affected card
    const now = new Date().toISOString();
    const unassignOps = (cardsResult.Items || []).map(card =>
      db.send(new UpdateCommand({
        TableName:                 'bp_cards',
        Key:                       { userId, cardId: card.cardId },
        UpdateExpression:          'REMOVE bankId SET updatedAt = :now',
        ExpressionAttributeValues: { ':now': now },
      }))
    );

    // 3. Delete the bank record and unassign cards in parallel
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
