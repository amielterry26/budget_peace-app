require('dotenv').config();

const express = require('express');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Server runtime info
app.get('/api/runtime', (req, res) => {
  const d = new Date();
  const serverToday = d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
  res.json({ serverToday });
});

// Owner identity — single-user mode
app.get('/api/me', (req, res) => {
  const uid = process.env.OWNER_USER_ID;
  if (!uid) return res.status(500).json({ error: 'OWNER_USER_ID not configured' });
  res.json({ userId: uid });
});

// API routes (wired up per slice)
app.use('/api/users',     require('./routes/users'));
app.use('/api/budgets',   require('./routes/budgets'));
app.use('/api/expenses',  require('./routes/expenses'));
app.use('/api/cards',     require('./routes/cards'));
app.use('/api/goals',     require('./routes/goals'));
app.use('/api/scenarios', require('./routes/scenarios'));

// Ensure "main" scenario exists (one-time seed from bp_users)
async function ensureMainScenario() {
  const ownerId = process.env.OWNER_USER_ID;
  if (!ownerId) return;
  const { GetCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
  const db = require('./config/dynamo');
  try {
    const existing = await db.send(new GetCommand({
      TableName: 'bp_scenarios',
      Key: { userId: ownerId, scenarioId: 'main' },
    }));
    if (existing.Item) {
      // One-time migration: set isPrimary if missing
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

// Landing page (standalone, not part of SPA)
app.get('/landing', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler — catches unhandled errors in async route handlers
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
