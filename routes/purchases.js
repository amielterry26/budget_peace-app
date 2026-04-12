const express = require('express');
const {
  QueryCommand, PutCommand, UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('crypto');
const router = express.Router();
const db     = require('../config/dynamo');
const { verifyOwner } = require('../middleware/auth');

const TABLE = 'bp_purchases';

// GET /api/purchases/:userId?scenario=main
// Returns all non-archived purchases for the active scenario.
// Legacy records with no scenarioId are treated as belonging to 'main'.
router.get('/:userId', verifyOwner, async (req, res) => {
  try {
    const scenario = req.query.scenario || 'main';
    const result = await db.send(new QueryCommand({
      TableName:                 TABLE,
      KeyConditionExpression:    'userId = :uid',
      FilterExpression:          'attribute_not_exists(archivedAt) AND (scenarioId = :sid OR (attribute_not_exists(scenarioId) AND :sid = :main))',
      ExpressionAttributeValues: { ':uid': req.params.userId, ':sid': scenario, ':main': 'main' },
    }));
    res.json(result.Items || []);
  } catch (err) {
    console.error('GET /api/purchases error:', err);
    res.status(500).json({ error: 'Failed to fetch purchases' });
  }
});

// POST /api/purchases
// Creates a new purchase.
router.post('/', async (req, res) => {
  try {
    const { userId, scenarioId, name, price, note, link, targetDate } = req.body;
    if (userId && userId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    if (!userId || !name) return res.status(400).json({ error: 'Missing required fields' });
    const now = new Date().toISOString();
    const item = {
      userId,
      purchaseId: randomUUID(),
      scenarioId: scenarioId || 'main',
      name,
      price:      price      != null ? Number(price) : null,
      note:       note       || '',
      link:       link       || '',
      targetDate: targetDate || '',
      createdAt:  now,
      updatedAt:  now,
    };
    // Remove null price rather than storing null
    if (item.price === null) delete item.price;
    await db.send(new PutCommand({ TableName: TABLE, Item: item }));
    res.json(item);
  } catch (err) {
    console.error('POST /api/purchases error:', err);
    res.status(500).json({ error: 'Failed to create purchase' });
  }
});

// PUT /api/purchases/:userId/:purchaseId
// Updates allowed fields only: name, price, note, link, targetDate, archivedAt.
router.put('/:userId/:purchaseId', verifyOwner, async (req, res) => {
  const { userId, purchaseId } = req.params;
  const { name, price, note, link, targetDate, archivedAt } = req.body;
  try {
    const now = new Date().toISOString();
    const sets   = ['updatedAt = :updatedAt'];
    const names  = {};
    const values = { ':updatedAt': now };

    if (name       !== undefined) { sets.push('#nm = :name');       names['#nm'] = 'name';       values[':name']       = name; }
    if (price      !== undefined) { sets.push('price = :price');                                  values[':price']      = price != null ? Number(price) : null; }
    if (note       !== undefined) { sets.push('note = :note');                                    values[':note']       = note; }
    if (link       !== undefined) { sets.push('link = :link');                                    values[':link']       = link; }
    if (targetDate !== undefined) { sets.push('targetDate = :targetDate');                        values[':targetDate'] = targetDate; }
    if (archivedAt !== undefined) { sets.push('archivedAt = :archivedAt');                        values[':archivedAt'] = archivedAt; }

    const params = {
      TableName:                 TABLE,
      Key:                       { userId, purchaseId },
      UpdateExpression:          'SET ' + sets.join(', '),
      ExpressionAttributeValues: values,
      ReturnValues:              'ALL_NEW',
    };
    if (Object.keys(names).length) params.ExpressionAttributeNames = names;

    const result = await db.send(new UpdateCommand(params));
    res.json(result.Attributes);
  } catch (err) {
    console.error('PUT /api/purchases error:', err);
    res.status(500).json({ error: 'Failed to update purchase' });
  }
});

module.exports = router;
