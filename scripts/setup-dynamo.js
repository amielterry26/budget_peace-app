// Run once to create DynamoDB tables: node scripts/setup-dynamo.js
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
} = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });

const tables = [
  {
    TableName: 'bp_users',
    KeySchema: [{ AttributeName: 'userId', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'userId', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST',
  },
  {
    TableName: 'bp_budget_periods',
    KeySchema: [
      { AttributeName: 'userId',    KeyType: 'HASH'  },
      { AttributeName: 'startDate', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'userId',    AttributeType: 'S' },
      { AttributeName: 'startDate', AttributeType: 'S' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  },
  {
    TableName: 'bp_cards',
    KeySchema: [
      { AttributeName: 'userId', KeyType: 'HASH'  },
      { AttributeName: 'cardId', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'userId', AttributeType: 'S' },
      { AttributeName: 'cardId', AttributeType: 'S' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  },
  {
    TableName: 'bp_expenses',
    KeySchema: [
      { AttributeName: 'userId',    KeyType: 'HASH'  },
      { AttributeName: 'expenseId', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'userId',    AttributeType: 'S' },
      { AttributeName: 'expenseId', AttributeType: 'S' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  },
];

async function tableExists(name) {
  try {
    await client.send(new DescribeTableCommand({ TableName: name }));
    return true;
  } catch {
    return false;
  }
}

(async () => {
  for (const def of tables) {
    if (await tableExists(def.TableName)) {
      console.log(`  already exists: ${def.TableName}`);
    } else {
      await client.send(new CreateTableCommand(def));
      console.log(`  created: ${def.TableName}`);
    }
  }
  console.log('Done.');
})().catch(console.error);
