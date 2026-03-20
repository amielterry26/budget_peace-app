require('dotenv').config();

const express = require('express');
const path    = require('path');
const { GetCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const db      = require('./config/dynamo');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- Auth middleware -----------------------------------------
const { requireAuth } = require('./middleware/auth');

// ---- Public endpoints (no auth required) --------------------

// App config — returns public Supabase config for frontend
app.get('/api/config', (req, res) => {
  res.json({
    SUPABASE_URL:      process.env.SUPABASE_URL || '',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
  });
});

// Server runtime info
app.get('/api/runtime', (req, res) => {
  const d = new Date();
  const serverToday = d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
  res.json({ serverToday });
});

// ---- Profile sync endpoint (auth required) ------------------
// Called by frontend after successful auth. Creates or updates
// the bp_users row. Identity comes from the VERIFIED JWT —
// never from the request body.
app.post('/api/auth/profile', requireAuth, async (req, res) => {
  const userId       = req.userId;       // from verified JWT
  const email        = req.userEmail;    // from verified JWT
  const authProvider = req.userProvider; // from verified JWT metadata
  const { fullName } = req.body;         // optional hint from frontend

  try {
    const existing = await db.send(new GetCommand({
      TableName: 'bp_users',
      Key: { userId },
    }));

    if (existing.Item) {
      // Returning user — update lastLoginAt + email from verified token
      await db.send(new UpdateCommand({
        TableName: 'bp_users',
        Key: { userId },
        UpdateExpression: 'SET lastLoginAt = :now, email = :email',
        ExpressionAttributeValues: {
          ':now': new Date().toISOString(),
          ':email': email,
        },
      }));
    } else {
      // New user — create with full access + seed main scenario
      await db.send(new PutCommand({
        TableName: 'bp_users',
        Item: {
          userId,
          email,
          fullName:           fullName || null,
          authProvider:       authProvider || 'email',
          accessLevel:        'full',     // Future: Stripe webhook writes this
          entitlementStatus:  'active',   // Future: Stripe webhook writes this
          planName:           'pro',      // Future: Stripe webhook writes this
          createdAt:          new Date().toISOString(),
          lastLoginAt:        new Date().toISOString(),
        },
      }));
      await ensureMainScenarioForUser(userId);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/auth/profile error:', err);
    res.status(500).json({ error: 'Failed to sync profile' });
  }
});

// ---- Protected API routes (auth required) -------------------
app.use('/api/users',     requireAuth, require('./routes/users'));
app.use('/api/budgets',   requireAuth, require('./routes/budgets'));
app.use('/api/expenses',  requireAuth, require('./routes/expenses'));
app.use('/api/cards',     requireAuth, require('./routes/cards'));
app.use('/api/goals',     requireAuth, require('./routes/goals'));
app.use('/api/scenarios', requireAuth, require('./routes/scenarios'));

// ---- Migration endpoint (auth required) ---------------------
app.use('/api/admin',     requireAuth, require('./routes/migrate'));

// ---- Seed helpers -------------------------------------------

// Seeds a "main" scenario for a new user (called from profile sync)
async function ensureMainScenarioForUser(userId) {
  try {
    const existing = await db.send(new GetCommand({
      TableName: 'bp_scenarios',
      Key: { userId, scenarioId: 'main' },
    }));
    if (existing.Item) return;

    await db.send(new PutCommand({
      TableName: 'bp_scenarios',
      Item: {
        userId,
        scenarioId: 'main',
        name: 'Main',
        income: 0,
        cadence: 'biweekly',
        firstPayDate: new Date().toISOString().split('T')[0],
        durationMonths: 2,
        isPrimary: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }));
    console.log(`Seeded "main" scenario for user ${userId}`);
  } catch (err) {
    console.error('ensureMainScenarioForUser error:', err);
  }
}

// Legacy: ensure main scenario for OWNER_USER_ID on boot
// Kept for backwards compatibility during migration period
async function ensureMainScenario() {
  const ownerId = process.env.OWNER_USER_ID;
  if (!ownerId) return;
  try {
    const existing = await db.send(new GetCommand({
      TableName: 'bp_scenarios',
      Key: { userId: ownerId, scenarioId: 'main' },
    }));
    if (existing.Item) {
      if (existing.Item.isPrimary === undefined) {
        await db.send(new UpdateCommand({
          TableName: 'bp_scenarios',
          Key: { userId: ownerId, scenarioId: 'main' },
          UpdateExpression: 'SET isPrimary = :t',
          ExpressionAttributeValues: { ':t': true },
        }));
        console.log('Migrated "main" scenario: set isPrimary = true');
      }
      return;
    }
    const user = await db.send(new GetCommand({
      TableName: 'bp_users',
      Key: { userId: ownerId },
    }));
    if (!user.Item) return;
    const u = user.Item;
    await db.send(new PutCommand({
      TableName: 'bp_scenarios',
      Item: {
        userId: ownerId, scenarioId: 'main', name: 'Main',
        income: u.incomeAmount, cadence: u.cadence,
        firstPayDate: u.firstPayDate, durationMonths: u.durationMonths,
        isPrimary: true,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      },
    }));
    console.log('Seeded "main" scenario from bp_users');
  } catch (err) {
    console.error('ensureMainScenario error:', err);
  }
}
ensureMainScenario();

// ---- Landing page & SPA fallback ----------------------------

app.get('/landing', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Budget Peace running on http://localhost:${PORT}`);
}).on('error', (err) => {
  console.error('Server failed to start:', err.message);
  process.exit(1);
});
