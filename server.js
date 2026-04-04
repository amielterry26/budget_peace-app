require('dotenv').config();

const express = require('express');
const path    = require('path');
const { GetCommand, PutCommand, UpdateCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const db      = require('./config/dynamo');

const app  = express();
const PORT = process.env.PORT || 3000;

// Trust proxy (EB load balancer terminates SSL) so req.protocol
// returns 'https' instead of 'http'. Required for correct Stripe
// success/cancel redirect URLs.
app.set('trust proxy', 1);

// ---- Stripe webhook (raw body — MUST come before express.json) --
app.post('/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  require('./routes/stripe').webhook
);

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

// ---- Public Stripe routes (no auth — checkout-first flow) ----
app.post('/api/stripe/create-checkout-session-public',
  require('./routes/stripe').createCheckoutSessionPublic
);
app.get('/api/stripe/checkout-session/:sessionId',
  require('./routes/stripe').getCheckoutSession
);

// ---- Pending Entitlement Claim Helpers -----------------------

const PENDING_TABLE = 'bp_pending_entitlements';

// PRIMARY: Look up by Stripe session ID (exact match)
async function claimBySessionId(sessionId) {
  if (!sessionId) return null;
  const result = await db.send(new GetCommand({
    TableName: PENDING_TABLE,
    Key: { stripeSessionId: sessionId },
  }));
  if (!result.Item || result.Item.status !== 'pending') return null;
  return result.Item;
}

// FALLBACK: Look up by email via GSI (most recent pending)
async function claimByEmail(email) {
  if (!email) return null;
  const result = await db.send(new QueryCommand({
    TableName: PENDING_TABLE,
    IndexName: 'email-index',
    KeyConditionExpression: 'email = :email',
    FilterExpression: '#s = :pending',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: {
      ':email': email.toLowerCase(),
      ':pending': 'pending',
    },
  }));
  if (!result.Items || result.Items.length === 0) return null;
  // Take the most recent pending entitlement
  return result.Items.sort((a, b) =>
    new Date(b.paidAt) - new Date(a.paidAt)
  )[0];
}

// Claim: session_id PRIMARY, email FALLBACK, with retry for webhook race
async function claimPendingEntitlement(checkoutSessionId, email) {
  // 1. PRIMARY: by session ID
  let pending = await claimBySessionId(checkoutSessionId);

  // 2. FALLBACK: by email
  if (!pending) {
    pending = await claimByEmail(email);
  }

  // 3. RETRY: if session ID provided but nothing found (webhook race)
  if (!pending && checkoutSessionId) {
    for (let i = 0; i < 3; i++) {
      await new Promise(r => setTimeout(r, 2000));
      pending = await claimBySessionId(checkoutSessionId);
      if (pending) break;
    }
  }

  return pending;
}

// Mark a pending entitlement as claimed (conditional to prevent double-claim)
async function markEntitlementClaimed(stripeSessionId, userId) {
  try {
    await db.send(new UpdateCommand({
      TableName: PENDING_TABLE,
      Key: { stripeSessionId },
      UpdateExpression: 'SET claimedBy = :uid, claimedAt = :now, #s = :claimed',
      ConditionExpression: '#s = :pending',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':uid': userId,
        ':now': new Date().toISOString(),
        ':claimed': 'claimed',
        ':pending': 'pending',
      },
    }));
    return true;
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      console.warn('Pending entitlement already claimed:', stripeSessionId);
      return false;
    }
    throw err;
  }
}

// Apply a claimed entitlement to an existing bp_users row
async function applyEntitlement(userId, pending) {
  const updateExpr = [
    'accessLevel = :al',
    'entitlementStatus = :es',
    'planName = :pn',
    'stripeCustomerId = :cid',
    'paidAt = :paid',
    'updatedAt = :now',
  ];
  const values = {
    ':al': pending.tier,
    ':es': 'active',
    ':pn': pending.plan,
    ':cid': pending.stripeCustomerId,
    ':paid': pending.paidAt,
    ':now': new Date().toISOString(),
  };

  // For subscriptions, store the sub ID. For lifetime, clear any stale sub ID.
  const removeExprs = [];
  if (pending.stripeSubscriptionId) {
    updateExpr.push('stripeSubscriptionId = :sid');
    values[':sid'] = pending.stripeSubscriptionId;
  } else {
    removeExprs.push('stripeSubscriptionId');
  }

  let updateExpression = 'SET ' + updateExpr.join(', ');
  if (removeExprs.length) {
    updateExpression += ' REMOVE ' + removeExprs.join(', ');
  }

  await db.send(new UpdateCommand({
    TableName: 'bp_users',
    Key: { userId },
    UpdateExpression: updateExpression,
    ExpressionAttributeValues: values,
  }));

  // Update Stripe subscription metadata with userId so future webhook events work
  if (pending.stripeSubscriptionId) {
    try {
      const { getStripe } = require('./routes/stripe');
      const stripe = getStripe();
      await stripe.subscriptions.update(pending.stripeSubscriptionId, {
        metadata: { userId, plan: pending.plan, tier: pending.tier },
      });
      console.log(`Claimed entitlement: updated Stripe sub ${pending.stripeSubscriptionId} metadata with userId=${userId}`);
    } catch (err) {
      console.error(`Claimed entitlement: failed to update Stripe sub metadata for userId=${userId}:`, err.message);
    }
  }
}

// ---- Profile sync endpoint (auth required) ------------------
// Called by frontend after successful auth. Creates or updates
// the bp_users row. Identity comes from the VERIFIED JWT —
// never from the request body.
app.post('/api/auth/profile', requireAuth, async (req, res) => {
  const userId       = req.userId;       // from verified JWT
  const email        = req.userEmail;    // from verified JWT
  const authProvider = req.userProvider; // from verified JWT metadata
  const { fullName, checkoutSessionId } = req.body;

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

      // Check for pending entitlement (e.g., user paid from landing page
      // while already having an account but being logged out)
      if (checkoutSessionId) {
        const pending = await claimPendingEntitlement(checkoutSessionId, email);
        if (pending) {
          const claimed = await markEntitlementClaimed(pending.stripeSessionId, userId);
          if (claimed) {
            await applyEntitlement(userId, pending);
            console.log(`Returning user claimed entitlement: userId=${userId} session=${pending.stripeSessionId} plan=${pending.plan}`);
          }
        }
      }
    } else {
      // New user — check for pending entitlement (checkout-first flow)
      const pending = await claimPendingEntitlement(checkoutSessionId, email);

      if (pending) {
        // Claim the entitlement
        const claimed = await markEntitlementClaimed(pending.stripeSessionId, userId);

        if (claimed) {
          // Create user WITH entitlement pre-applied
          const item = {
            userId,
            email,
            fullName:           fullName || null,
            authProvider:       authProvider || 'email',
            accessLevel:        pending.tier,
            entitlementStatus:  'active',
            planName:           pending.plan,
            stripeCustomerId:   pending.stripeCustomerId,
            paidAt:             pending.paidAt,
            createdAt:          new Date().toISOString(),
            lastLoginAt:        new Date().toISOString(),
          };

          // For subscriptions, store the sub ID. For lifetime, omit it.
          if (pending.stripeSubscriptionId) {
            item.stripeSubscriptionId = pending.stripeSubscriptionId;
          }

          await db.send(new PutCommand({
            TableName: 'bp_users',
            Item: item,
          }));

          // Update Stripe subscription metadata with userId
          if (pending.stripeSubscriptionId) {
            try {
              const { getStripe } = require('./routes/stripe');
              const stripe = getStripe();
              await stripe.subscriptions.update(pending.stripeSubscriptionId, {
                metadata: { userId, plan: pending.plan, tier: pending.tier },
              });
              console.log(`New user claimed entitlement: updated Stripe sub ${pending.stripeSubscriptionId} metadata with userId=${userId}`);
            } catch (err) {
              console.error(`New user: failed to update Stripe sub metadata for userId=${userId}:`, err.message);
            }
          }

          console.log(`New user created with entitlement: userId=${userId} plan=${pending.plan} tier=${pending.tier}`);
        } else {
          // Claim failed (race condition) — create without entitlement
          await db.send(new PutCommand({
            TableName: 'bp_users',
            Item: {
              userId,
              email,
              fullName:           fullName || null,
              authProvider:       authProvider || 'email',
              accessLevel:        'none',
              entitlementStatus:  'inactive',
              planName:           'none',
              createdAt:          new Date().toISOString(),
              lastLoginAt:        new Date().toISOString(),
            },
          }));
        }
      } else {
        // No pending entitlement — standard new user (no access until they pay)
        await db.send(new PutCommand({
          TableName: 'bp_users',
          Item: {
            userId,
            email,
            fullName:           fullName || null,
            authProvider:       authProvider || 'email',
            accessLevel:        'none',
            entitlementStatus:  'inactive',
            planName:           'none',
            createdAt:          new Date().toISOString(),
            lastLoginAt:        new Date().toISOString(),
          },
        }));
      }

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
app.use('/api/banks',     requireAuth, require('./routes/banks'));
app.use('/api/goals',     requireAuth, require('./routes/goals'));
app.use('/api/scenarios', requireAuth, require('./routes/scenarios'));

// ---- Stripe checkout (auth required) -------------------------
app.use('/api/stripe',    requireAuth, require('./routes/stripe').router);

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

app.get('/pro', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pro.html'));
});

app.get('/demo', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'demo.html'));
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
