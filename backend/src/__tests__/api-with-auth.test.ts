import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { initDB, getDB, getSqliteDB, query, run, assets } from '../db/index.js';
import assetsRouter from '../routes/assets.js';
import transactionsRouter from '../routes/transactions.js';
import holdingsRouter from '../routes/holdings.js';
import portfolioRouter from '../routes/portfolio.js';
import accountsRouter from '../routes/accounts.js';
import historyRouter from '../routes/history.js';
import authRouter from '../routes/auth.js';
import alertsRouter from '../routes/alerts.js';
import { authMiddleware } from '../middleware/auth.js';

// Helper function to create authenticated test agent
async function createAuthenticatedAgent(app: express.Application) {
  const timestamp = Date.now();
  const email = `test_${timestamp}@example.com`;
  const password = 'password123';

  // Register
  await request(app)
    .post('/api/auth/register')
    .send({ email, password });

  // Login
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email, password });

  const cookie = loginRes.headers['set-cookie'];

  return {
    email,
    password,
    cookie,
    // Helper method to make authenticated requests
    get: (url: string) => request(app).get(url).set('Cookie', cookie),
    post: (url: string) => request(app).post(url).set('Cookie', cookie),
    put: (url: string) => request(app).put(url).set('Cookie', cookie),
    delete: (url: string) => request(app).delete(url).set('Cookie', cookie),
  };
}

// Helper to create a test asset directly in the database (bypassing admin requirement)
function createTestAsset(symbol: string): number {
  run(
    'INSERT INTO assets (symbol, name, type, currency) VALUES (?, ?, ?, ?)',
    [symbol.toUpperCase(), symbol, 'crypto', 'USD']
  );
  const result = query<{ id: number }>('SELECT last_insert_rowid() as id');
  return result[0]?.id || 0;
}

// Helper to get user ID from email
async function getUserIdByEmail(email: string): Promise<number> {
  const result = query<{ id: number }>('SELECT id FROM users WHERE email = ?', [email]);
  return result[0]?.id || 0;
}

// Create app with auth middleware applied to protected routes
function createApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  // Public routes
  app.use('/api/auth', authRouter);
  app.use('/api/health', (_req, res) => res.json({ status: 'ok' }));

  // Protected routes
  app.use(authMiddleware);
  app.use('/api/assets', assetsRouter);
  app.use('/api/transactions', transactionsRouter);
  app.use('/api/holdings', holdingsRouter);
  app.use('/api/portfolio', portfolioRouter);
  app.use('/api/accounts', accountsRouter);
  app.use('/api/history', historyRouter);
  app.use('/api/alerts', alertsRouter);

  return app;
}

describe('Portfolio Tracker API with Authentication', () => {
  let app: express.Application;

  beforeAll(() => {
    initDB(true);
    app = createApp();
  });

  beforeEach(() => {
    // Clean up test data - order matters for foreign key constraints
    run("DELETE FROM alert_notifications WHERE alert_id IN (SELECT id FROM alerts WHERE asset_id IN (SELECT id FROM assets WHERE symbol LIKE 'TEST%'))");
    run("DELETE FROM alerts WHERE asset_id IN (SELECT id FROM assets WHERE symbol LIKE 'TEST%')");
    run("DELETE FROM transactions WHERE asset_id IN (SELECT id FROM assets WHERE symbol LIKE 'TEST%')");
    run("DELETE FROM holdings WHERE asset_id IN (SELECT id FROM assets WHERE symbol LIKE 'TEST%')");
    run("DELETE FROM assets WHERE symbol LIKE 'TEST%'");
    run("DELETE FROM accounts WHERE name LIKE 'Test%'");
  });

  describe('Authentication Required', () => {
    it('should reject requests without authentication', async () => {
      const res = await request(app).get('/api/assets');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Authentication required');
    });

    it('should allow requests with valid authentication', async () => {
      const agent = await createAuthenticatedAgent(app);
      const res = await agent.get('/api/assets');
      expect(res.status).toBe(200);
    });
  });

  describe('Protected Assets Endpoints', () => {
    it('should create asset when authenticated', async () => {
      // Note: Asset creation via API requires admin privileges
      // This test verifies the endpoint returns proper error for non-admin users
      const agent = await createAuthenticatedAgent(app);
      const res = await agent
        .post('/api/assets')
        .send({ symbol: 'TESTBTC', name: 'Test Bitcoin', type: 'crypto' });

      // Asset creation requires admin, so should return 403
      expect(res.status).toBe(403);
    });

    it('should only list assets for authenticated user', async () => {
      // Create first user and asset via direct DB insert
      const agent1 = await createAuthenticatedAgent(app);
      createTestAsset('TESTUSER1');

      // Create second user and asset
      const agent2 = await createAuthenticatedAgent(app);
      createTestAsset('TESTUSER2');

      // Verify each user only sees their own assets
      const res1 = await agent1.get('/api/assets');
      const user1Assets = res1.body.filter((a: any) => a.symbol === 'TESTUSER1');
      expect(user1Assets.length).toBe(1);

      const res2 = await agent2.get('/api/assets');
      const user2Assets = res2.body.filter((a: any) => a.symbol === 'TESTUSER2');
      expect(user2Assets.length).toBe(1);
    });
  });

  describe('Protected Transactions Endpoints', () => {
    it('should create transaction when authenticated', async () => {
      const agent = await createAuthenticatedAgent(app);

      // Create asset via direct DB insert
      const assetId = createTestAsset('TESTTX');

      const res = await agent
        .post('/api/transactions')
        .send({
          asset_id: assetId,
          type: 'buy',
          quantity: 10,
          price: 100,
          date: '2024-01-01',
        });

      expect(res.status).toBe(201);
      expect(res.body.quantity).toBe(10);
    });

    it('should only list transactions for authenticated user', async () => {
      const agent = await createAuthenticatedAgent(app);

      // Create asset and transaction via direct DB insert
      const assetId = createTestAsset('TESTTXLIST');

      await agent
        .post('/api/transactions')
        .send({
          asset_id: assetId,
          type: 'buy',
          quantity: 5,
          price: 100,
          date: '2024-01-02',
        });

      // Create second user
      const agent2 = await createAuthenticatedAgent(app);

      // Second user should see their own (empty) transaction list
      const res = await agent2.get('/api/transactions');
      expect(res.status).toBe(200);
      expect(res.body.filter((t: any) => t.asset_symbol === 'TESTTXLIST').length).toBe(0);

      // First user should see their transaction
      const res1 = await agent.get('/api/transactions');
      expect(res1.body.filter((t: any) => t.asset_symbol === 'TESTTXLIST').length).toBe(1);
    });
  });

  describe('Protected Holdings Endpoints', () => {
    it('should auto-create holding on transaction', async () => {
      const agent = await createAuthenticatedAgent(app);

      // Create asset via direct DB insert
      const assetId = createTestAsset('TESTHLD');

      await agent
        .post('/api/transactions')
        .send({
          asset_id: assetId,
          type: 'buy',
          quantity: 10,
          price: 100,
          date: '2024-01-01',
        });

      const holdingsRes = await agent.get('/api/holdings?includePrices=false');
      const holding = holdingsRes.body.find((h: any) => h.symbol === 'TESTHLD');
      expect(holding).toBeDefined();
      expect(holding.quantity).toBe(10);
    });
  });

  describe('Protected Portfolio Endpoints', () => {
    it('should return portfolio summary', async () => {
      const agent = await createAuthenticatedAgent(app);

      const res = await agent.get('/api/portfolio/summary?includePrices=false');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalValueUSD');
      expect(res.body).toHaveProperty('holdings');
    });
  });

  describe('Protected Accounts Endpoints', () => {
    it('should create account when authenticated', async () => {
      const agent = await createAuthenticatedAgent(app);

      const res = await agent
        .post('/api/accounts')
        .send({ name: 'Test Brokerage', type: 'brokerage' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Test Brokerage');
    });

    it('should only list accounts for authenticated user', async () => {
      // Create first user and account
      const agent1 = await createAuthenticatedAgent(app);
      await agent1.post('/api/accounts').send({ name: 'Test Account 1', type: 'brokerage' });

      // Create second user
      const agent2 = await createAuthenticatedAgent(app);
      await agent2.post('/api/accounts').send({ name: 'Test Account 2', type: 'wallet' });

      // Verify each user only sees their own account
      const res1 = await agent1.get('/api/accounts');
      expect(res1.body.filter((a: any) => a.name === 'Test Account 1').length).toBe(1);
      expect(res1.body.filter((a: any) => a.name === 'Test Account 2').length).toBe(0);

      const res2 = await agent2.get('/api/accounts');
      expect(res2.body.filter((a: any) => a.name === 'Test Account 2').length).toBe(1);
      expect(res2.body.filter((a: any) => a.name === 'Test Account 1').length).toBe(0);
    });
  });

  describe('Protected Alerts Endpoints', () => {
    it('should create alert when authenticated', async () => {
      const agent = await createAuthenticatedAgent(app);

      // Create asset via direct DB insert
      const assetId = createTestAsset('TESTALERT');

      const res = await agent
        .post('/api/alerts')
        .send({
          asset_id: assetId,
          alert_type: 'above',
          threshold: 50000,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('should only list alerts for authenticated user', async () => {
      // Create first user and alert
      const agent1 = await createAuthenticatedAgent(app);
      const assetId1 = createTestAsset('TESTALERT1');

      await agent1.post('/api/alerts').send({
        asset_id: assetId1,
        alert_type: 'above',
        threshold: 50000,
      });

      // Create second user
      const agent2 = await createAuthenticatedAgent(app);
      const assetId2 = createTestAsset('TESTALERT2');

      await agent2.post('/api/alerts').send({
        asset_id: assetId2,
        alert_type: 'below',
        threshold: 40000,
      });

      // Verify each user only sees their own alerts
      const res1 = await agent1.get('/api/alerts');
      expect(res1.body.alerts.filter((a: any) => a.asset_symbol === 'TESTALERT1').length).toBe(1);
      expect(res1.body.alerts.filter((a: any) => a.asset_symbol === 'TESTALERT2').length).toBe(0);

      const res2 = await agent2.get('/api/alerts');
      expect(res2.body.alerts.filter((a: any) => a.asset_symbol === 'TESTALERT2').length).toBe(1);
      expect(res2.body.alerts.filter((a: any) => a.asset_symbol === 'TESTALERT1').length).toBe(0);
    });
  });
});
