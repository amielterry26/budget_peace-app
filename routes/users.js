const express         = require('express');
const { PutCommand, UpdateCommand, BatchWriteCommand, GetCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl }     = require('@aws-sdk/s3-request-presigner');
const router          = express.Router();
const db              = require('../config/dynamo');
const s3              = require('../config/s3');
const generatePeriods = require('../lib/generatePeriods');
const { verifyOwner } = require('../middleware/auth');

const AVATAR_BUCKET = process.env.S3_AVATAR_BUCKET || '';

const USERS_TABLE   = 'bp_users';
const PERIODS_TABLE = 'bp_budget_periods';

const VALID_CADENCES = ['biweekly', 'monthly'];
const CHUNK = 25;

// Helper: delete all periods for a user, then write new ones
async function replacePeriods(userId, newPeriods) {
  const existing = await db.send(new QueryCommand({
    TableName:                 PERIODS_TABLE,
    KeyConditionExpression:    'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
  }));
  const items = existing.Items || [];
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    const result = await db.send(new BatchWriteCommand({
      RequestItems: {
        [PERIODS_TABLE]: chunk.map(p => ({
          DeleteRequest: { Key: { userId: p.userId, startDate: p.startDate } },
        })),
      },
    }));
    let unprocessed = result.UnprocessedItems;
    while (unprocessed && unprocessed[PERIODS_TABLE] && unprocessed[PERIODS_TABLE].length > 0) {
      const retry = await db.send(new BatchWriteCommand({ RequestItems: unprocessed }));
      unprocessed = retry.UnprocessedItems;
    }
  }
  for (let i = 0; i < newPeriods.length; i += CHUNK) {
    const chunk = newPeriods.slice(i, i + CHUNK);
    const result = await db.send(new BatchWriteCommand({
      RequestItems: {
        [PERIODS_TABLE]: chunk.map(p => ({ PutRequest: { Item: p } })),
      },
    }));
    let unprocessed = result.UnprocessedItems;
    while (unprocessed && unprocessed[PERIODS_TABLE] && unprocessed[PERIODS_TABLE].length > 0) {
      const retry = await db.send(new BatchWriteCommand({ RequestItems: unprocessed }));
      unprocessed = retry.UnprocessedItems;
    }
  }
}

// Helper: update income on all existing periods without regenerating
async function updatePeriodIncome(userId, newIncome) {
  const existing = await db.send(new QueryCommand({
    TableName:                 PERIODS_TABLE,
    KeyConditionExpression:    'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
  }));
  const items = existing.Items || [];
  for (const p of items) {
    await db.send(new UpdateCommand({
      TableName: PERIODS_TABLE,
      Key: { userId: p.userId, startDate: p.startDate },
      UpdateExpression: 'SET income = :inc',
      ExpressionAttributeValues: { ':inc': newIncome },
    }));
  }
}

// Shared validation for user setup fields
function validateSetup(body) {
  const { cadence, durationMonths, firstPayDate, incomeAmount } = body;
  if (!cadence || !durationMonths || !firstPayDate || !incomeAmount) {
    return 'Missing required fields';
  }
  const duration = Number(durationMonths);
  const income   = Number(incomeAmount);
  if (!VALID_CADENCES.includes(cadence)) return `Invalid cadence. Must be one of: ${VALID_CADENCES.join(', ')}`;
  if (!Number.isFinite(duration) || duration <= 0) return 'durationMonths must be a positive number';
  if (!Number.isFinite(income) || income <= 0) return 'incomeAmount must be a positive number';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstPayDate) || isNaN(Date.parse(firstPayDate))) return 'firstPayDate must be a valid date in YYYY-MM-DD format';
  return null;
}

router.get('/health', (req, res) => res.json({ ok: true }));

// GET /api/users/:userId — fetch user profile
router.get('/:userId', verifyOwner, async (req, res) => {
  try {
    const item = await db.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { userId: req.params.userId },
    }));
    if (!item.Item) return res.status(404).json({ error: 'Not found' });
    res.json(item.Item);
  } catch (err) {
    console.error('GET /api/users/:userId error:', err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// PUT /api/users/:userId — update owner setup (income, cadence, firstPayDate, durationMonths)
router.put('/:userId', verifyOwner, async (req, res) => {
  try {
    const err = validateSetup(req.body);
    if (err) return res.status(400).json({ error: err });

    const { cadence, firstPayDate } = req.body;
    const duration = Number(req.body.durationMonths);
    const income   = Number(req.body.incomeAmount);
    const uid      = req.params.userId;

    // Fetch current user to detect what changed
    const current = await db.send(new GetCommand({ TableName: USERS_TABLE, Key: { userId: uid } }));
    if (!current.Item) return res.status(404).json({ error: 'User not found' });

    const old = current.Item;
    const structureChanged = cadence !== old.cadence || firstPayDate !== old.firstPayDate || duration !== old.durationMonths;
    const incomeChanged    = income !== old.incomeAmount;

    // Update user record
    await db.send(new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { userId: uid },
      UpdateExpression: 'SET cadence = :c, firstPayDate = :f, durationMonths = :d, incomeAmount = :i, updatedAt = :u',
      ExpressionAttributeValues: {
        ':c': cadence, ':f': firstPayDate, ':d': duration, ':i': income, ':u': new Date().toISOString(),
      },
    }));

    let periodsRegenerated = false;

    if (structureChanged) {
      // Cadence, firstPayDate, or duration changed — full period regeneration
      const periods = generatePeriods(uid, cadence, firstPayDate, duration, income);
      await replacePeriods(uid, periods);
      periodsRegenerated = true;
    } else if (incomeChanged) {
      // Income-only change — update income on all existing periods
      await updatePeriodIncome(uid, income);
    }

    res.json({ updated: true, periodsRegenerated });
  } catch (err) {
    console.error('PUT /api/users/:userId error:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// PATCH /api/users/:userId/active-scenario — persist active scenario choice
router.patch('/:userId/active-scenario', verifyOwner, async (req, res) => {
  try {
    const { scenarioId } = req.body;
    if (!scenarioId) return res.status(400).json({ error: 'scenarioId is required' });
    await db.send(new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { userId: req.params.userId },
      UpdateExpression: 'SET activeScenarioId = :sid, updatedAt = :u',
      ExpressionAttributeValues: { ':sid': scenarioId, ':u': new Date().toISOString() },
    }));
    res.json({ ok: true, activeScenarioId: scenarioId });
  } catch (err) {
    console.error('PATCH active-scenario error:', err);
    res.status(500).json({ error: 'Failed to update active scenario' });
  }
});

// POST /api/users/:userId/regenerate-periods — force delete + regenerate all periods
router.post('/:userId/regenerate-periods', verifyOwner, async (req, res) => {
  try {
    const userResult = await db.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { userId: req.params.userId },
    }));
    if (!userResult.Item) return res.status(404).json({ error: 'User not found' });

    const user = userResult.Item;
    const periods = generatePeriods(req.params.userId, user.cadence, user.firstPayDate, user.durationMonths, user.incomeAmount);
    await replacePeriods(req.params.userId, periods);

    res.json({ periodCount: periods.length });
  } catch (err) {
    console.error('POST /api/users/:userId/regenerate-periods error:', err);
    res.status(500).json({ error: 'Failed to regenerate periods' });
  }
});

// POST /api/users/:userId/avatar-url — get a presigned S3 PUT URL for avatar upload
router.post('/:userId/avatar-url', verifyOwner, async (req, res) => {
  try {
    if (!AVATAR_BUCKET) return res.status(503).json({ error: 'Avatar storage not configured' });

    const { contentType } = req.body;
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!contentType || !allowed.includes(contentType)) {
      return res.status(400).json({ error: 'contentType must be image/jpeg, image/png, image/webp, or image/gif' });
    }

    const key = `avatars/${req.params.userId}`;
    const command = new PutObjectCommand({
      Bucket:      AVATAR_BUCKET,
      Key:         key,
      ContentType: contentType,
      CacheControl: 'no-cache',
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
    const region    = process.env.AWS_REGION || 'us-west-2';
    const photoUrl  = `https://${AVATAR_BUCKET}.s3.${region}.amazonaws.com/${key}`;

    res.json({ uploadUrl, photoUrl });
  } catch (err) {
    console.error('POST /api/users/:userId/avatar-url error:', err);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

// PATCH /api/users/:userId/profile — update display name, photo, bio, job, goals
router.patch('/:userId/profile', verifyOwner, async (req, res) => {
  try {
    const { displayName, photoUrl, bio, jobTitle, personalGoals } = req.body;
    const uid = req.params.userId;

    await db.send(new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { userId: uid },
      UpdateExpression: 'SET displayName = :dn, photoUrl = :pu, bio = :b, jobTitle = :jt, personalGoals = :pg, updatedAt = :u',
      ExpressionAttributeValues: {
        ':dn': displayName   || '',
        ':pu': photoUrl      || '',
        ':b':  bio           || '',
        ':jt': jobTitle      || '',
        ':pg': personalGoals || '',
        ':u':  new Date().toISOString(),
      },
    }));

    res.json({ updated: true });
  } catch (err) {
    console.error('PATCH /api/users/:userId/profile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;
