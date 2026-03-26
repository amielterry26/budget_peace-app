const express = require('express');
const {
  QueryCommand, PutCommand, GetCommand, UpdateCommand, DeleteCommand, BatchWriteCommand,
} = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('crypto');
const router  = express.Router();
const db      = require('../config/dynamo');
const generatePeriods = require('../lib/generatePeriods');
const { verifyOwner } = require('../middleware/auth');
const { canCreateScenario, canUseProjectionMonths, canUseNotes } = require('../lib/planLimits');

const SCENARIOS_TABLE = 'bp_scenarios';
const PERIODS_TABLE   = 'bp_budget_periods_v2';
const EXPENSES_TABLE  = 'bp_expenses';
const USERS_TABLE     = 'bp_users';
const CHUNK = 25;

const VALID_CADENCES = ['biweekly', 'monthly'];

// ---- Helpers ------------------------------------------------

function validateSetup(body) {
  const { cadence, durationMonths, firstPayDate, income } = body;
  if (!cadence || !durationMonths || !firstPayDate || !income) {
    return 'Missing required fields (cadence, durationMonths, firstPayDate, income)';
  }
  const dur = Number(durationMonths);
  const inc = Number(income);
  if (!VALID_CADENCES.includes(cadence)) return `Invalid cadence. Must be one of: ${VALID_CADENCES.join(', ')}`;
  if (!Number.isFinite(dur) || dur <= 0) return 'durationMonths must be a positive number';
  if (!Number.isFinite(inc) || inc <= 0) return 'income must be a positive number';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstPayDate) || isNaN(Date.parse(firstPayDate))) return 'firstPayDate must be YYYY-MM-DD';
  return null;
}

async function batchWrite(table, items) {
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    const result = await db.send(new BatchWriteCommand({
      RequestItems: { [table]: chunk },
    }));
    let unprocessed = result.UnprocessedItems;
    while (unprocessed && unprocessed[table] && unprocessed[table].length > 0) {
      const retry = await db.send(new BatchWriteCommand({ RequestItems: unprocessed }));
      unprocessed = retry.UnprocessedItems;
    }
  }
}

// Query all records for a user from a table, optionally filtering by scenarioId
async function queryByScenario(table, userId, scenarioId) {
  const result = await db.send(new QueryCommand({
    TableName: table,
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: {
      ':uid': userId,
      ':sid': scenarioId,
      ':main': 'main',
    },
    FilterExpression: 'scenarioId = :sid OR (attribute_not_exists(scenarioId) AND :sid = :main)',
  }));
  return result.Items || [];
}

// Delete all records for a scenario from a table (needs the sort key name)
async function deleteByScenario(table, sortKeyName, userId, scenarioId) {
  const items = await queryByScenario(table, userId, scenarioId);
  if (!items.length) return;
  const deletes = items.map(item => ({
    DeleteRequest: { Key: { userId: item.userId, [sortKeyName]: item[sortKeyName] } },
  }));
  await batchWrite(table, deletes);
}

// Generate periods tagged with scenarioId
function generateScenarioPeriods(userId, scenarioId, cadence, firstPayDate, durationMonths, income) {
  const periods = generatePeriods(userId, cadence, firstPayDate, durationMonths, income);
  return periods.map(p => ({ ...p, scenarioId, periodKey: scenarioId + '#' + p.startDate }));
}

// ---- Routes -------------------------------------------------

// PATCH /api/scenarios/:userId/:scenarioId/promote — make scenario primary
router.patch('/:userId/:scenarioId/promote', verifyOwner, async (req, res) => {
  try {
    const { userId, scenarioId } = req.params;

    // Fetch all active scenarios to find current primary
    const all = await db.send(new QueryCommand({
      TableName: SCENARIOS_TABLE,
      KeyConditionExpression: 'userId = :uid',
      FilterExpression: 'attribute_not_exists(deletedAt)',
      ExpressionAttributeValues: { ':uid': userId },
    }));
    const scenarios = all.Items || [];

    const target = scenarios.find(s => s.scenarioId === scenarioId);
    if (!target) return res.status(404).json({ error: 'Scenario not found' });
    if (target.isPrimary) return res.json({ ok: true, promoted: scenarioId }); // already primary

    // Demote ALL scenarios that have isPrimary (ensures single primary)
    const currentPrimaries = scenarios.filter(s => s.isPrimary || (s.isPrimary === undefined && s.scenarioId === 'main'));
    for (const old of currentPrimaries) {
      await db.send(new UpdateCommand({
        TableName: SCENARIOS_TABLE,
        Key: { userId, scenarioId: old.scenarioId },
        UpdateExpression: 'SET isPrimary = :f',
        ExpressionAttributeValues: { ':f': false },
      }));
    }

    // Promote target
    await db.send(new UpdateCommand({
      TableName: SCENARIOS_TABLE,
      Key: { userId, scenarioId },
      UpdateExpression: 'SET isPrimary = :t',
      ExpressionAttributeValues: { ':t': true },
    }));

    res.json({ ok: true, promoted: scenarioId });
  } catch (err) {
    console.error('PATCH /api/scenarios/:id/promote error:', err);
    res.status(500).json({ error: 'Failed to promote scenario' });
  }
});

// GET /api/scenarios/:userId/:scenarioId — fetch single scenario
router.get('/:userId/:scenarioId', verifyOwner, async (req, res) => {
  try {
    const result = await db.send(new GetCommand({
      TableName: SCENARIOS_TABLE,
      Key: { userId: req.params.userId, scenarioId: req.params.scenarioId },
    }));
    if (!result.Item) return res.status(404).json({ error: 'Scenario not found' });
    res.json(result.Item);
  } catch (err) {
    console.error('GET /api/scenarios/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch scenario' });
  }
});

// GET /api/scenarios/:userId — list all scenarios (excludes soft-deleted)
router.get('/:userId', verifyOwner, async (req, res) => {
  try {
    const result = await db.send(new QueryCommand({
      TableName: SCENARIOS_TABLE,
      KeyConditionExpression: 'userId = :uid',
      FilterExpression: 'attribute_not_exists(deletedAt)',
      ExpressionAttributeValues: { ':uid': req.params.userId },
    }));
    res.json(result.Items || []);
  } catch (err) {
    console.error('GET /api/scenarios error:', err);
    res.status(500).json({ error: 'Failed to fetch scenarios' });
  }
});

// POST /api/scenarios — create scenario (optionally clone from source)
router.post('/', async (req, res) => {
  try {
    const { userId, name, cloneFrom } = req.body;
    // Verify body userId matches authenticated user
    if (userId && userId !== req.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!userId || !name) return res.status(400).json({ error: 'userId and name are required' });

    // Plan gate: enforce maxScenarios
    const scenarioCheck = await canCreateScenario(db, userId);
    if (!scenarioCheck.allowed) {
      return res.status(403).json({
        error: 'Scenario limit reached. Upgrade to Pro for unlimited scenarios.',
        code: 'PLAN_LIMIT_SCENARIOS',
        current: scenarioCheck.current,
        max: scenarioCheck.max,
      });
    }

    const sourceId = cloneFrom || 'main';

    // Fetch source scenario for financial setup
    const source = await db.send(new GetCommand({
      TableName: SCENARIOS_TABLE,
      Key: { userId, scenarioId: sourceId },
    }));
    if (!source.Item) return res.status(404).json({ error: `Source scenario "${sourceId}" not found` });

    const src = source.Item;
    const scenarioId = randomUUID();
    const now = new Date().toISOString();

    // Create scenario record with cloned financial setup
    const skipExpenses = !!req.body.skipExpenses;
    const scenario = {
      userId, scenarioId, name,
      income: src.income,
      cadence: src.cadence,
      firstPayDate: src.firstPayDate,
      durationMonths: src.durationMonths,
      notes: skipExpenses ? [] : (src.notes || []),
      isPrimary: false,
      createdAt: now, updatedAt: now,
    };
    await db.send(new PutCommand({ TableName: SCENARIOS_TABLE, Item: scenario }));

    // Generate periods for the new scenario
    const periods = generateScenarioPeriods(userId, scenarioId, src.cadence, src.firstPayDate, src.durationMonths, src.income);
    const periodPuts = periods.map(p => ({ PutRequest: { Item: p } }));
    await batchWrite(PERIODS_TABLE, periodPuts);

    // Clone expenses from source (unless skipExpenses)
    let expenseCount = 0;
    if (!skipExpenses) {
      const sourceExpenses = await queryByScenario(EXPENSES_TABLE, userId, sourceId);
      if (sourceExpenses.length) {
        const expensePuts = sourceExpenses.map(e => ({
          PutRequest: {
            Item: {
              ...e,
              expenseId: randomUUID(),
              scenarioId,
              createdAt: now,
              updatedAt: undefined,
            },
          },
        }));
        await batchWrite(EXPENSES_TABLE, expensePuts);
        expenseCount = sourceExpenses.length;
      }
    }

    res.json({ scenarioId, name, periodCount: periods.length, expenseCount });
  } catch (err) {
    console.error('POST /api/scenarios error:', err);
    res.status(500).json({ error: 'Failed to create scenario' });
  }
});

// PUT /api/scenarios/:userId/:scenarioId — update name and/or financial setup
router.put('/:userId/:scenarioId', verifyOwner, async (req, res) => {
  try {
    const { userId, scenarioId } = req.params;

    // Fetch current scenario
    const current = await db.send(new GetCommand({
      TableName: SCENARIOS_TABLE,
      Key: { userId, scenarioId },
    }));
    if (!current.Item) return res.status(404).json({ error: 'Scenario not found' });

    const old = current.Item;
    const name = req.body.name || old.name;
    const cadence = req.body.cadence || old.cadence;
    const firstPayDate = req.body.firstPayDate || old.firstPayDate;
    const durationMonths = req.body.durationMonths != null ? Number(req.body.durationMonths) : old.durationMonths;
    const income = req.body.income != null ? Number(req.body.income) : old.income;

    // Validate if financial fields are being changed
    if (req.body.cadence || req.body.firstPayDate || req.body.durationMonths != null || req.body.income != null) {
      const err = validateSetup({ cadence, firstPayDate, durationMonths, income });
      if (err) return res.status(400).json({ error: err });
    }

    // Plan gate: enforce maxProjectionMonths
    if (req.body.durationMonths != null) {
      const durCheck = await canUseProjectionMonths(db, userId, durationMonths);
      if (!durCheck.allowed) {
        return res.status(403).json({
          error: `Your plan allows a maximum of ${durCheck.max} months. Upgrade to Pro for longer projections.`,
          code: 'PLAN_LIMIT_DURATION',
        });
      }
    }

    const now = new Date().toISOString();

    // Update scenario record
    await db.send(new PutCommand({
      TableName: SCENARIOS_TABLE,
      Item: { userId, scenarioId, name, cadence, firstPayDate, durationMonths, income, notes: old.notes || [], isPrimary: !!old.isPrimary, createdAt: old.createdAt, updatedAt: now },
    }));

    let periodsRegenerated = false;
    const structureChanged = cadence !== old.cadence || firstPayDate !== old.firstPayDate || durationMonths !== old.durationMonths;
    const incomeChanged = income !== old.income;

    if (structureChanged) {
      // Delete old periods for this scenario, generate new ones
      await deleteByScenario(PERIODS_TABLE, 'periodKey', userId, scenarioId);
      const periods = generateScenarioPeriods(userId, scenarioId, cadence, firstPayDate, durationMonths, income);
      const puts = periods.map(p => ({ PutRequest: { Item: p } }));
      await batchWrite(PERIODS_TABLE, puts);
      periodsRegenerated = true;
    } else if (incomeChanged) {
      // Update income on existing periods for this scenario
      const existing = await queryByScenario(PERIODS_TABLE, userId, scenarioId);
      for (const p of existing) {
        await db.send(new UpdateCommand({
          TableName: PERIODS_TABLE,
          Key: { userId: p.userId, periodKey: p.periodKey },
          UpdateExpression: 'SET income = :inc',
          ExpressionAttributeValues: { ':inc': income },
        }));
      }
    }

    res.json({ updated: true, periodsRegenerated });
  } catch (err) {
    console.error('PUT /api/scenarios error:', err);
    res.status(500).json({ error: 'Failed to update scenario' });
  }
});

// POST /api/scenarios/:userId/:scenarioId/notes — add a note
router.post('/:userId/:scenarioId/notes', verifyOwner, async (req, res) => {
  try {
    const { userId, scenarioId } = req.params;
    const text = (req.body.text || '').trim();
    if (!text) return res.status(400).json({ error: 'text is required' });
    if (text.length > 200) return res.status(400).json({ error: 'Note must be 200 characters or less' });

    // Plan gate: notes are Pro-only
    const notesCheck = await canUseNotes(db, userId);
    if (!notesCheck.allowed) {
      return res.status(403).json({
        error: 'Notes are available on Pro for deeper planning.',
        code: 'PLAN_LIMIT_NOTES',
      });
    }

    // Fetch current scenario to check note count
    const current = await db.send(new GetCommand({
      TableName: SCENARIOS_TABLE,
      Key: { userId, scenarioId },
    }));
    if (!current.Item) return res.status(404).json({ error: 'Scenario not found' });
    const existing = current.Item.notes || [];
    if (existing.length >= 10) return res.status(400).json({ error: 'Maximum 10 notes per scenario' });

    const note = { id: randomUUID().slice(0, 8), text, createdAt: new Date().toISOString() };

    await db.send(new UpdateCommand({
      TableName: SCENARIOS_TABLE,
      Key: { userId, scenarioId },
      UpdateExpression: 'SET notes = list_append(if_not_exists(notes, :empty), :note)',
      ExpressionAttributeValues: { ':empty': [], ':note': [note] },
    }));

    res.json({ note });
  } catch (err) {
    console.error('POST /api/scenarios/:id/notes error:', err);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

// PATCH /api/scenarios/:userId/:scenarioId/notes/:noteId — edit a note
router.patch('/:userId/:scenarioId/notes/:noteId', verifyOwner, async (req, res) => {
  try {
    const { userId, scenarioId, noteId } = req.params;
    const text = (req.body.text || '').trim();
    if (!text) return res.status(400).json({ error: 'text is required' });
    if (text.length > 200) return res.status(400).json({ error: 'Note must be 200 characters or less' });

    const current = await db.send(new GetCommand({
      TableName: SCENARIOS_TABLE,
      Key: { userId, scenarioId },
    }));
    if (!current.Item) return res.status(404).json({ error: 'Scenario not found' });

    const notes = current.Item.notes || [];
    const idx = notes.findIndex(n => n.id === noteId);
    if (idx === -1) return res.status(404).json({ error: 'Note not found' });

    notes[idx].text = text;
    await db.send(new UpdateCommand({
      TableName: SCENARIOS_TABLE,
      Key: { userId, scenarioId },
      UpdateExpression: 'SET notes = :notes',
      ExpressionAttributeValues: { ':notes': notes },
    }));

    res.json({ note: notes[idx] });
  } catch (err) {
    console.error('PATCH /api/scenarios/:id/notes/:noteId error:', err);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

// DELETE /api/scenarios/:userId/:scenarioId/notes/:noteId — delete a note
router.delete('/:userId/:scenarioId/notes/:noteId', verifyOwner, async (req, res) => {
  try {
    const { userId, scenarioId, noteId } = req.params;

    const current = await db.send(new GetCommand({
      TableName: SCENARIOS_TABLE,
      Key: { userId, scenarioId },
    }));
    if (!current.Item) return res.status(404).json({ error: 'Scenario not found' });

    const notes = (current.Item.notes || []).filter(n => n.id !== noteId);
    await db.send(new UpdateCommand({
      TableName: SCENARIOS_TABLE,
      Key: { userId, scenarioId },
      UpdateExpression: 'SET notes = :notes',
      ExpressionAttributeValues: { ':notes': notes },
    }));

    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/scenarios/:id/notes/:noteId error:', err);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

// DELETE /api/scenarios/:userId/:scenarioId/expenses — clear expenses only
router.delete('/:userId/:scenarioId/expenses', verifyOwner, async (req, res) => {
  try {
    const { userId, scenarioId } = req.params;
    await deleteByScenario(EXPENSES_TABLE, 'expenseId', userId, scenarioId);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/scenarios/:id/expenses error:', err);
    res.status(500).json({ error: 'Failed to clear expenses' });
  }
});

// DELETE /api/scenarios/:userId/:scenarioId — delete scenario + cascade
router.delete('/:userId/:scenarioId', verifyOwner, async (req, res) => {
  try {
    const { userId, scenarioId } = req.params;

    // Fetch scenario to check isPrimary
    const current = await db.send(new GetCommand({
      TableName: SCENARIOS_TABLE,
      Key: { userId, scenarioId },
    }));
    if (!current.Item) return res.status(404).json({ error: 'Scenario not found' });

    // Cannot delete primary scenario
    const isPrimary = current.Item.isPrimary || (current.Item.isPrimary === undefined && scenarioId === 'main');
    if (isPrimary) return res.status(400).json({ error: 'Cannot delete the primary scenario. Promote another scenario first.' });

    // Cannot delete last active scenario (exclude already-deleted)
    const all = await db.send(new QueryCommand({
      TableName: SCENARIOS_TABLE,
      KeyConditionExpression: 'userId = :uid',
      FilterExpression: 'attribute_not_exists(deletedAt)',
      ExpressionAttributeValues: { ':uid': userId },
    }));
    const activeCount = (all.Items || []).length;
    if (activeCount <= 1) return res.status(400).json({ error: 'Cannot delete the last scenario.' });

    // Soft delete — mark with deletedAt, keep data intact for recovery
    await db.send(new UpdateCommand({
      TableName: SCENARIOS_TABLE,
      Key: { userId, scenarioId },
      UpdateExpression: 'SET deletedAt = :d',
      ExpressionAttributeValues: { ':d': new Date().toISOString() },
    }));

    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/scenarios error:', err);
    res.status(500).json({ error: 'Failed to delete scenario' });
  }
});

module.exports = router;
