const express = require('express');
const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const db = require('../config/dynamo');

const USERS_TABLE = 'bp_users';

// Valid plan keys → { envVar, mode, tier }
const PLAN_MAP = {
  'budget-monthly':  { env: 'STRIPE_BUDGET_MONTHLY_PRICE_ID',  mode: 'subscription', tier: 'budget' },
  'budget-lifetime': { env: 'STRIPE_BUDGET_LIFETIME_PRICE_ID', mode: 'payment',      tier: 'budget' },
  'pro-monthly':     { env: 'STRIPE_PRO_MONTHLY_PRICE_ID',     mode: 'subscription', tier: 'pro' },
  'pro-lifetime':    { env: 'STRIPE_PRO_LIFETIME_PRICE_ID',    mode: 'payment',      tier: 'pro' },
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

    const sessionParams = {
      mode: planDef.mode,
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: req.userEmail,
      metadata: { userId: req.userId, plan, tier: planDef.tier },
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancel`,
    };

    // For subscriptions, also attach metadata to the subscription object
    if (planDef.mode === 'subscription') {
      sessionParams.subscription_data = {
        metadata: { userId: req.userId, plan, tier: planDef.tier },
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    res.json({ url: session.url });
  } catch (err) {
    console.error('POST /api/stripe/create-checkout-session error:', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

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
  if (!userId) {
    console.error('checkout.session.completed: no userId in metadata');
    return;
  }

  const tier = session.metadata?.tier || 'budget';
  const plan = session.metadata?.plan || tier;
  const customerId = session.customer;

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

  if (session.subscription) {
    updateExpr.push('stripeSubscriptionId = :sid');
    values[':sid'] = session.subscription;
  }

  await db.send(new UpdateCommand({
    TableName: USERS_TABLE,
    Key: { userId },
    UpdateExpression: 'SET ' + updateExpr.join(', '),
    ExpressionAttributeValues: values,
  }));

  console.log(`checkout.session.completed: userId=${userId} tier=${tier} plan=${plan}`);
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

  console.log(`customer.subscription.deleted: userId=${userId} → canceled/none`);
}

module.exports = { router, webhook };
