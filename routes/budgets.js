const express       = require('express');
const { QueryCommand } = require('@aws-sdk/lib-dynamodb');
const router        = express.Router();
const db            = require('../config/dynamo');
const { verifyOwner } = require('../middleware/auth');

const PERIODS_TABLE = 'bp_budget_periods_v2';

router.get('/health', (req, res) => res.json({ ok: true }));

// GET /api/budgets/:userId?scenario=main — periods for a scenario, ascending by date
router.get('/:userId', verifyOwner, async (req, res) => {
  try {
    if (!req.params.userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    const scenario = req.query.scenario || 'main';
    const result = await db.send(new QueryCommand({
      TableName:                 PERIODS_TABLE,
      KeyConditionExpression:    'userId = :uid',
      FilterExpression:          'scenarioId = :sid OR (attribute_not_exists(scenarioId) AND :sid = :main)',
      ExpressionAttributeValues: { ':uid': req.params.userId, ':sid': scenario, ':main': 'main' },
      ScanIndexForward:          true,
    }));
    res.json(result.Items || []);
  } catch (err) {
    console.error('GET /api/budgets/:userId error:', err);
    res.status(500).json({ error: 'Failed to fetch budgets' });
  }
});

module.exports = router;
