// ============================================================
// Budget Peace — Centralized Plan Limits (Server-Side)
//
// Single source of truth for plan enforcement on the backend.
// All route-level plan checks should use these helpers.
//
// Canonical key names match the frontend (public/js/plans.js).
// Internal tier key "budget" = user-facing "Basic".
// ============================================================

const { GetCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const USERS_TABLE     = 'bp_users';
const SCENARIOS_TABLE = 'bp_scenarios';
const EXPENSES_TABLE  = 'bp_expenses';

// ---- Plan Definitions ----------------------------------------

const PLAN_LIMITS = {
  budget: {
    maxScenarios: 1,
    maxExpensesPerScenario: 8,
    maxProjectionMonths: 3,
    scenarioComparison: false,
    financialHealth: false,
    scenarioNotes: false,
    aiFeatures: false,
    widgets: false,
  },
  pro: {
    maxScenarios: Infinity,
    maxExpensesPerScenario: Infinity,
    maxProjectionMonths: Infinity,
    scenarioComparison: true,
    financialHealth: true,
    scenarioNotes: true,
    aiFeatures: true,
    widgets: true,
  },
};

// ---- Tier Resolution -----------------------------------------

function getTierFromAccessLevel(accessLevel) {
  if (accessLevel === 'pro') return 'pro';
  if (accessLevel === 'full') return 'pro'; // legacy migration
  if (accessLevel === 'budget') return 'budget';
  return 'budget'; // default to most restrictive
}

function getLimits(tier) {
  return PLAN_LIMITS[tier] || PLAN_LIMITS.budget;
}

// ---- User Plan Lookup ----------------------------------------

async function getUserPlan(db, userId) {
  const result = await db.send(new GetCommand({
    TableName: USERS_TABLE,
    Key: { userId },
  }));
  const accessLevel = result.Item?.accessLevel || 'none';
  const tier = getTierFromAccessLevel(accessLevel);
  return { tier, limits: getLimits(tier), accessLevel };
}

// ---- Semantic Check Helpers ----------------------------------

async function canCreateScenario(db, userId) {
  const { limits } = await getUserPlan(db, userId);
  const result = await db.send(new QueryCommand({
    TableName: SCENARIOS_TABLE,
    KeyConditionExpression: 'userId = :uid',
    FilterExpression: 'attribute_not_exists(deletedAt)',
    ExpressionAttributeValues: { ':uid': userId },
    Select: 'COUNT',
  }));
  const current = result.Count || 0;
  return {
    allowed: current < limits.maxScenarios,
    current,
    max: limits.maxScenarios,
  };
}

async function canAddExpense(db, userId, scenarioId) {
  const { limits } = await getUserPlan(db, userId);
  const result = await db.send(new QueryCommand({
    TableName: EXPENSES_TABLE,
    KeyConditionExpression: 'userId = :uid',
    FilterExpression: 'scenarioId = :sid OR (attribute_not_exists(scenarioId) AND :sid = :main)',
    ExpressionAttributeValues: { ':uid': userId, ':sid': scenarioId, ':main': 'main' },
    Select: 'COUNT',
  }));
  const current = result.Count || 0;
  return {
    allowed: current < limits.maxExpensesPerScenario,
    current,
    max: limits.maxExpensesPerScenario,
  };
}

async function canUseProjectionMonths(db, userId, months) {
  const { limits } = await getUserPlan(db, userId);
  return {
    allowed: months <= limits.maxProjectionMonths,
    max: limits.maxProjectionMonths,
  };
}

async function canUseNotes(db, userId) {
  const { limits } = await getUserPlan(db, userId);
  return { allowed: limits.scenarioNotes };
}

// ---- Exports -------------------------------------------------

module.exports = {
  PLAN_LIMITS,
  getTierFromAccessLevel,
  getLimits,
  getUserPlan,
  canCreateScenario,
  canAddExpense,
  canUseProjectionMonths,
  canUseNotes,
};
