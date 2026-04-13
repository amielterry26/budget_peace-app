const express = require('express');
const { GetCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const db = require('../config/dynamo');

const USERS_TABLE = 'bp_users';
const PENDING_TABLE = 'bp_pending_entitlements';

// Valid plan keys → { envVar, mode, tier }
const PLAN_MAP = {
  'budget-monthly':        { env: 'STRIPE_BUDGET_MONTHLY_PRICE_ID',        mode: 'subscription', tier: 'budget' },
  'budget-lifetime':       { env: 'STRIPE_BUDGET_LIFETIME_PRICE_ID',       mode: 'payment',      tier: 'budget' },
  'pro-monthly':           { env: 'STRIPE_PRO_MONTHLY_PRICE_ID',           mode: 'subscription', tier: 'pro' },
  'pro-lifetime':          { env: 'STRIPE_PRO_LIFETIME_PRICE_ID',          mode: 'payment',      tier: 'pro' },
  // Internal only — never sent from the client. Used when a Basic lifetime
  // user upgrades to Pro lifetime; charges $20 (the difference).
  'pro-lifetime-upgrade':  { env: 'STRIPE_PRO_LIFETIME_UPGRADE_PRICE_ID',  mode: 'payment',      tier: 'pro' },
};

// Lazy-init Stripe (only when keys are configured)
let _stripe = null;
function getStripe() {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
    _stripe = require('stripe')(key);
  }
  return _stripe;
}

// ---- Checkout Route (requires auth) ----------------------------
const router = express.Router();

// POST /api/stripe/create-checkout-session
// Body: { plan: 'budget-monthly' | 'budget-lifetime' | 'pro-monthly' | 'pro-lifetime' }
router.post('/create-checkout-session', async (req, res) => {
  try {
    const stripe = getStripe();
    const { plan } = req.body;

    // Block direct access to internal upgrade SKU
    if (plan === 'pro-lifetime-upgrade') {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    const planDef = PLAN_MAP[plan];
    if (!planDef) {
      return res.status(400).json({
        error: `plan must be one of: budget-monthly, budget-lifetime, pro-monthly, pro-lifetime`,
      });
    }

    let priceId = process.env[planDef.env];
    if (!priceId) {
      return res.status(500).json({ error: `Price ID not configured for ${plan}` });
    }

    // Look up user's current plan state for replacement logic
    const userResult = await db.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { userId: req.userId },
    }));
    const user = userResult.Item || {};
    const existingCustomerId = user.stripeCustomerId || null;
    const existingSubId = user.stripeSubscriptionId || null;

    // Basic lifetime → Pro lifetime upgrade: charge only the $20 difference.
    // The billing price swaps to the upgrade SKU, but metadata records
    // 'pro-lifetime' so the webhook normalizes the DB correctly.
    let billingPlan = plan;
    if (plan === 'pro-lifetime' && user.planName === 'budget-lifetime') {
      billingPlan = 'pro-lifetime-upgrade';
      const upgradePriceId = process.env[PLAN_MAP['pro-lifetime-upgrade'].env];
      if (!upgradePriceId) {
        return res.status(500).json({ error: 'Upgrade price not configured' });
      }
      priceId = upgradePriceId;
    }

    const origin = `${req.protocol}://${req.get('host')}`;

    // metadata always records the canonical plan name ('pro-lifetime'),
    // not the billing SKU, so the webhook sets the right DB values.
    const metadata = { userId: req.userId, plan, tier: planDef.tier };
    // If the user has an active recurring subscription, mark it for
    // cancellation so the webhook can clean it up after the new
    // purchase succeeds.
    if (existingSubId) {
      metadata.replacesSubscriptionId = existingSubId;
    }

    const sessionParams = {
      mode: planDef.mode,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: billingPlan !== 'pro-lifetime-upgrade', // no stacking on upgrade
      metadata,
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancel`,
    };

    // Reuse existing Stripe Customer to avoid duplicates;
    // fall back to customer_email for first-time purchasers.
    // Passing customer (not customer_email) locks the email field at checkout.
    if (existingCustomerId) {
      sessionParams.customer = existingCustomerId;
    } else {
      sessionParams.customer_email = req.userEmail;
    }

    // For subscriptions, also attach metadata to the subscription object
    if (planDef.mode === 'subscription') {
      sessionParams.subscription_data = { metadata };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    res.json({ url: session.url });
  } catch (err) {
    console.error('POST /api/stripe/create-checkout-session error:', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// ---- Public Checkout Route (no auth — for checkout-first flow) --

// POST /api/stripe/create-checkout-session-public
// Body: { plan: 'budget-monthly' | 'budget-lifetime' | 'pro-monthly' | 'pro-lifetime' }
// No auth required — Stripe collects email on their checkout page.
async function createCheckoutSessionPublic(req, res) {
  try {
    const stripe = getStripe();
    const { plan } = req.body;

    const planDef = PLAN_MAP[plan];
    if (!planDef) {
      return res.status(400).json({
        error: `plan must be one of: ${Object.keys(PLAN_MAP).join(', ')}`,
      });
    }

    const priceId = process.env[planDef.env];
    if (!priceId) {
      return res.status(500).json({ error: `Price ID not configured for ${plan}` });
    }

    const origin = `${req.protocol}://${req.get('host')}`;

    // No userId — this is a checkout-first session
    const metadata = { plan, tier: planDef.tier };

    const sessionParams = {
      mode: planDef.mode,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      metadata,
      // {CHECKOUT_SESSION_ID} is a Stripe template variable replaced at redirect time
      success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?checkout=cancel`,
    };

    // For subscriptions, also attach metadata to the subscription object
    if (planDef.mode === 'subscription') {
      sessionParams.subscription_data = { metadata };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    res.json({ url: session.url });
  } catch (err) {
    console.error('POST /api/stripe/create-checkout-session-public error:', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
}

// ---- Checkout Session Info (no auth — session IDs are unguessable) --

// GET /api/stripe/checkout-session/:sessionId
// Returns minimal info: { email, status }
async function getCheckoutSession(req, res) {
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
    res.json({
      email: session.customer_details?.email || session.customer_email || null,
      status: session.payment_status,
    });
  } catch (err) {
    console.error('GET /api/stripe/checkout-session error:', err);
    res.status(404).json({ error: 'Session not found' });
  }
}

// ---- Webhook Handler (no auth — Stripe signs it) ---------------

async function webhook(req, res) {
  const stripe = getStripe();
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body, // raw body from express.raw()
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error(`Webhook handler error for ${event.type}:`, err);
  }

  res.json({ received: true });
}

// ---- Webhook Event Handlers ------------------------------------

async function handleCheckoutCompleted(session) {
  const userId = session.metadata?.userId;

  // Checkout-first flow — no userId in metadata
  if (!userId) {
    await handleCheckoutFirstCompleted(session);
    return;
  }

  const tier = session.metadata?.tier || 'budget';
  const plan = session.metadata?.plan || tier;
  const customerId = session.customer;
  const newSubId = session.subscription || null;
  const replacesSubId = session.metadata?.replacesSubscriptionId || null;

  // ---- Write new entitlement to DB first ---------------------------
  const updateExpr = [
    'accessLevel = :al',
    'entitlementStatus = :es',
    'planName = :pn',
    'stripeCustomerId = :cid',
    'paidAt = :now',
  ];
  const values = {
    ':al': tier,       // 'budget' or 'pro'
    ':es': 'active',
    ':pn': plan,       // 'budget-monthly', 'budget-lifetime', 'pro-monthly', 'pro-lifetime'
    ':cid': customerId,
    ':now': new Date().toISOString(),
  };

  // For subscription purchases, store the new subscription ID.
  // For lifetime purchases, clear any old subscription ID.
  const removeExprs = [];
  if (newSubId) {
    updateExpr.push('stripeSubscriptionId = :sid');
    values[':sid'] = newSubId;
  } else {
    removeExprs.push('stripeSubscriptionId');
  }

  let updateExpression = 'SET ' + updateExpr.join(', ');
  if (removeExprs.length) {
    updateExpression += ' REMOVE ' + removeExprs.join(', ');
  }

  await db.send(new UpdateCommand({
    TableName: USERS_TABLE,
    Key: { userId },
    UpdateExpression: updateExpression,
    ExpressionAttributeValues: values,
  }));

  console.log(`checkout.session.completed: userId=${userId} tier=${tier} plan=${plan} newSub=${newSubId || 'none'}`);

  // ---- Cancel replaced subscription (after DB is updated) ----------
  // Only cancel if: replacesSubId exists, differs from new sub, and
  // looks like a Stripe subscription ID we own for this user.
  if (replacesSubId && replacesSubId !== newSubId) {
    try {
      const stripe = getStripe();
      await stripe.subscriptions.cancel(replacesSubId);
      console.log(`checkout.session.completed: canceled replaced subscription ${replacesSubId} for userId=${userId}`);
    } catch (err) {
      // New entitlement is already active — log but do not fail.
      // Old subscription can be cleaned up manually in Stripe dashboard.
      console.error(`checkout.session.completed: failed to cancel replaced subscription ${replacesSubId} for userId=${userId}:`, err.message);
    }
  }
}

async function handleSubscriptionUpdated(subscription) {
  const userId = subscription.metadata?.userId;
  if (!userId) {
    console.error('customer.subscription.updated: no userId in metadata');
    return;
  }

  const status = subscription.status;

  let entitlementStatus;
  if (status === 'active' || status === 'trialing') {
    entitlementStatus = 'active';
  } else if (status === 'past_due') {
    entitlementStatus = 'past_due';
  } else {
    entitlementStatus = status;
  }

  // Do NOT change accessLevel or planName here — preserve the tier they paid for.
  // Only update entitlement status. If canceled/unpaid, the frontend gates access
  // based on entitlementStatus, not accessLevel.
  await db.send(new UpdateCommand({
    TableName: USERS_TABLE,
    Key: { userId },
    UpdateExpression: 'SET entitlementStatus = :es, updatedAt = :now',
    ExpressionAttributeValues: {
      ':es': entitlementStatus,
      ':now': new Date().toISOString(),
    },
  }));

  console.log(`customer.subscription.updated: userId=${userId} status=${status} → entitlementStatus=${entitlementStatus}`);
}

async function handleSubscriptionDeleted(subscription) {
  const userId = subscription.metadata?.userId;
  if (!userId) {
    console.error('customer.subscription.deleted: no userId in metadata');
    return;
  }

  const deletedSubId = subscription.id;

  // Guard: only downgrade if the deleted subscription is still the
  // user's current active subscription. If it's a stale cancellation
  // from a replaced plan, skip the downgrade — the user already has
  // a newer active plan.
  const userResult = await db.send(new GetCommand({
    TableName: USERS_TABLE,
    Key: { userId },
  }));
  const currentSubId = userResult.Item?.stripeSubscriptionId || null;

  if (currentSubId && currentSubId !== deletedSubId) {
    console.log(`customer.subscription.deleted: skipping downgrade for userId=${userId} — deleted sub ${deletedSubId} is not current sub ${currentSubId}`);
    return;
  }

  // Lifetime users have no stripeSubscriptionId — if currentSubId is
  // null and a sub is deleted, it's also a stale event.
  if (!currentSubId) {
    console.log(`customer.subscription.deleted: skipping downgrade for userId=${userId} — user has no active subscription (likely lifetime)`);
    return;
  }

  await db.send(new UpdateCommand({
    TableName: USERS_TABLE,
    Key: { userId },
    UpdateExpression: 'SET entitlementStatus = :es, accessLevel = :al, updatedAt = :now',
    ExpressionAttributeValues: {
      ':es': 'canceled',
      ':al': 'none',
      ':now': new Date().toISOString(),
    },
  }));

  console.log(`customer.subscription.deleted: userId=${userId} sub=${deletedSubId} → canceled/none`);
}

// ---- Checkout-First Webhook Handler ----------------------------

async function handleCheckoutFirstCompleted(session) {
  const tier = session.metadata?.tier || 'budget';
  const plan = session.metadata?.plan || tier;
  const customerId = session.customer;
  const subscriptionId = session.subscription || null;
  const email = (
    session.customer_details?.email ||
    session.customer_email ||
    ''
  ).toLowerCase();

  if (!email) {
    console.error('checkout-first: no email on session', session.id);
    return;
  }

  const now = new Date();
  const ttl = Math.floor(now.getTime() / 1000) + (30 * 24 * 60 * 60); // 30 days

  await db.send(new PutCommand({
    TableName: PENDING_TABLE,
    Item: {
      stripeSessionId:      session.id,
      email,
      stripeCustomerId:     customerId,
      stripeSubscriptionId: subscriptionId,
      plan,
      tier,
      paidAt:               now.toISOString(),
      claimedBy:            null,
      claimedAt:            null,
      status:               'pending',
      createdAt:            now.toISOString(),
      ttl,
    },
  }));

  console.log(`checkout-first: pending entitlement created for ${email}, session=${session.id}, tier=${tier}, plan=${plan}`);
}

module.exports = { router, webhook, createCheckoutSessionPublic, getCheckoutSession, getStripe };
