const express = require('express');
const {
  QueryCommand, PutCommand, DeleteCommand, GetCommand, UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('crypto');
const router = express.Router();
const db     = require('../config/dynamo');
const { verifyOwner } = require('../middleware/auth');
const { canAddExpense } = require('../lib/planLimits');

const TABLE = 'bp_expenses';
const VALID_RECURRENCES = ['once', 'recurring'];

router.get('/health', (req, res) => res.json({ ok: true }));

// GET /api/expenses/:userId?scenario=main
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
    console.error('GET /api/expenses error:', err);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

// POST /api/expenses
router.post('/', async (req, res) => {
  try {
    const { userId, name, amount, recurrence, periodStart, cardId,
            recurrenceFrequency, recurrenceStartDate, dueDay, dueDate, scenarioId,
            splitBiweekly, allocationMethod, startDate, endDate } = req.body;
    // Verify body userId matches authenticated user
    if (userId && userId !== req.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!userId || !name || !amount || !recurrence) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }
    if (!VALID_RECURRENCES.includes(recurrence)) {
      return res.status(400).json({ error: `recurrence must be one of: ${VALID_RECURRENCES.join(', ')}` });
    }
    if (recurrence === 'recurring') {
      if (!recurrenceStartDate) {
        return res.status(400).json({ error: 'recurrenceStartDate is required for recurring expenses' });
      }
      // dueDay required only when allocation is 'due-date' (or legacy: no allocationMethod and not split)
      const effectiveAlloc = allocationMethod || (splitBiweekly ? 'split' : 'due-date');
      if (recurrenceFrequency === 'monthly' && effectiveAlloc === 'due-date' && !dueDay) {
        return res.status(400).json({ error: 'dueDay is required for monthly recurring expenses' });
      }
    }

    // Plan gate: enforce maxExpensesPerScenario
    const targetScenario = scenarioId || 'main';
    const expCheck = await canAddExpense(db, req.userId, targetScenario);
    if (!expCheck.allowed) {
      return res.status(403).json({
        error: 'Expense limit reached. Upgrade to Pro for unlimited expenses.',
        code: 'PLAN_LIMIT_EXPENSES',
        current: expCheck.current,
        max: expCheck.max,
      });
    }

    const expenseId = randomUUID();
    const item = {
      userId, expenseId, name,
      amount:      parsedAmount,
      recurrence,
      scenarioId:  scenarioId || 'main',
      createdAt:   new Date().toISOString(),
      ...(periodStart          && { periodStart }),
      ...(cardId               && { cardId }),
      ...(recurrenceFrequency  && { recurrenceFrequency }),
      ...(recurrenceStartDate  && { recurrenceStartDate }),
      ...(dueDay               && { dueDay: Number(dueDay) }),
      ...(dueDate              && { dueDate }),
      // Allocation: prefer allocationMethod (new); fall back to legacy splitBiweekly
      ...(allocationMethod     && { allocationMethod }),
      ...(!allocationMethod && splitBiweekly && { splitBiweekly: true }),
      ...(startDate && { startDate }),
      ...(endDate   && { endDate }),
    };
    await db.send(new PutCommand({ TableName: TABLE, Item: item }));
    res.json(item);
  } catch (err) {
    console.error('POST /api/expenses error:', err);
    res.status(500).json({ error: 'Failed to create expense' });
  }
});

// PUT /api/expenses/:userId/:expenseId
router.put('/:userId/:expenseId', verifyOwner, async (req, res) => {
  try {
    const { name, amount, recurrence, periodStart, cardId,
            recurrenceFrequency, recurrenceStartDate, dueDay, dueDate,
            splitBiweekly, allocationMethod,
            category, notes, tags,
            startDate, endDate } = req.body;

    if (!name || !amount || !recurrence) {
      return res.status(400).json({ error: 'Missing required fields (name, amount, recurrence)' });
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }
    if (!VALID_RECURRENCES.includes(recurrence)) {
      return res.status(400).json({ error: `recurrence must be one of: ${VALID_RECURRENCES.join(', ')}` });
    }
    if (recurrence === 'recurring') {
      if (!recurrenceStartDate) {
        return res.status(400).json({ error: 'recurrenceStartDate is required for recurring expenses' });
      }
      // dueDay required only when allocation is 'due-date' (or legacy: no allocationMethod and not split)
      const effectiveAlloc = allocationMethod || (splitBiweekly ? 'split' : 'due-date');
      if (recurrenceFrequency === 'monthly' && effectiveAlloc === 'due-date' && !dueDay) {
        return res.status(400).json({ error: 'dueDay is required for monthly recurring expenses' });
      }
    }

    // Fetch existing item to preserve createdAt and verify it exists
    const existing = await db.send(new GetCommand({
      TableName: TABLE,
      Key: { userId: req.params.userId, expenseId: req.params.expenseId },
    }));

    if (!existing.Item) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    const item = {
      ...existing.Item,
      name, recurrence,
      amount:    parsedAmount,
      updatedAt: new Date().toISOString(),
      // Conditionally set optional fields; remove them if not provided
      periodStart:         periodStart || undefined,
      cardId:              cardId || undefined,
      recurrenceFrequency: recurrenceFrequency || undefined,
      recurrenceStartDate: recurrenceStartDate || undefined,
      dueDay:              dueDay ? Number(dueDay) : undefined,
      dueDate:             dueDate || undefined,
      // Allocation: prefer allocationMethod (new); fall back to legacy splitBiweekly; clear if neither
      allocationMethod:    allocationMethod || undefined,
      splitBiweekly:       (!allocationMethod && splitBiweekly) ? true : undefined,
      // Optional metadata
      category:            category   || undefined,
      notes:               notes      || undefined,
      tags:                tags       || undefined,
      startDate:           startDate  || undefined,
      endDate:             endDate    || undefined,
    };

    await db.send(new PutCommand({ TableName: TABLE, Item: item }));
    res.json(item);
  } catch (err) {
    console.error('PUT /api/expenses error:', err);
    res.status(500).json({ error: 'Failed to update expense' });
  }
});

// DELETE /api/expenses/:userId/:expenseId
router.delete('/:userId/:expenseId', verifyOwner, async (req, res) => {
  try {
    await db.send(new DeleteCommand({
      TableName: TABLE,
      Key: { userId: req.params.userId, expenseId: req.params.expenseId },
    }));
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/expenses error:', err);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

module.exports = router;
