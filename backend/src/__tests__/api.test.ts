import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { initDB } from '../db/index.js';
import assetsRouter from '../routes/assets.js';
import transactionsRouter from '../routes/transactions.js';
import holdingsRouter from '../routes/holdings.js';
import portfolioRouter from '../routes/portfolio.js';
import accountsRouter from '../routes/accounts.js';
import historyRouter from '../routes/history.js';

const app = express();
app.use(express.json());
app.use('/api/assets', assetsRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/holdings', holdingsRouter);
app.use('/api/portfolio', portfolioRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/history', historyRouter);

describe('Portfolio Tracker API', () => {
  beforeAll(async () => {
    // Use in-memory database for tests
    await initDB(true);
  });

  beforeEach(async () => {
    // Clean up test data before each test
    const testAssets = await request(app).get('/api/assets');
    for (const asset of testAssets.body) {
      if (asset.symbol.startsWith('TEST')) {
        await request(app).delete(`/api/assets/${asset.id}`);
      }
    }
  });

  describe('Assets', () => {
    it('should create a new asset', async () => {
      const res = await request(app)
        .post('/api/assets')
        .send({ symbol: 'TESTBTC', name: 'Test Bitcoin', type: 'crypto' });
      
      expect(res.status).toBe(201);
      expect(res.body.data.symbol).toBe('TESTBTC');
      expect(res.body.data.type).toBe('crypto');
    });

    it('should list all assets', async () => {
      const res = await request(app).get('/api/assets');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should reject duplicate symbols', async () => {
      // First create an asset
      await request(app)
        .post('/api/assets')
        .send({ symbol: 'TESTDUP', name: 'Test Duplicate', type: 'crypto' });
      
      // Try to create the same asset again
      const res = await request(app)
        .post('/api/assets')
        .send({ symbol: 'TESTDUP', name: 'Test Duplicate Copy', type: 'stock_us' });
      
      expect(res.status).toBe(409);
    });

    it('should validate required fields', async () => {
      const res = await request(app)
        .post('/api/assets')
        .send({ symbol: 'TESTETH' }); // missing name and type
      
      expect(res.status).toBe(400);
    });

    it('should get single asset price', async () => {
      // Create an asset first
      const assetRes = await request(app)
        .post('/api/assets')
        .send({ symbol: 'TESTPRICE', name: 'Test Price Asset', type: 'crypto' });
      
      const res = await request(app).get(`/api/assets/${assetRes.body.data.id}/price`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('symbol');
      expect(res.body).toHaveProperty('price');
    });

    it('should return 404 for non-existent asset price', async () => {
      const res = await request(app).get('/api/assets/999999/price');
      expect(res.status).toBe(404);
    });

    it('should search assets by symbol', async () => {
      // Create a unique asset
      await request(app)
        .post('/api/assets')
        .send({ symbol: 'TESTSEARCH', name: 'Test Search Asset', type: 'crypto' });
      
      const res = await request(app).get('/api/assets/search/TESTSEARCH');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('should delete asset by id', async () => {
      const assetRes = await request(app)
        .post('/api/assets')
        .send({ symbol: 'TESTDEL', name: 'Test Delete', type: 'crypto' });
      
      const res = await request(app).delete(`/api/assets/${assetRes.body.data.id}`);
      expect(res.status).toBe(204);
    });

    it('should seed default assets', async () => {
      const res = await request(app)
        .post('/api/assets/seed')
        .send({ force: true });
      
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('added');
      expect(res.body).toHaveProperty('skipped');
    });
  });

  describe('Transactions', () => {
    it('should create a buy transaction and update holdings', async () => {
      // Create a unique asset
      const assetRes = await request(app)
        .post('/api/assets')
        .send({ symbol: 'TESTTX', name: 'Test Transaction Asset', type: 'crypto' });
      
      const res = await request(app)
        .post('/api/transactions')
        .send({
          asset_id: assetRes.body.data.id,
          type: 'buy',
          quantity: 10,
          price: 100,
          date: '2024-01-01',
        });

      expect(res.status).toBe(201);
      expect(res.body.quantity).toBe(10);
      expect(res.body.price).toBe(100);
    });

    it('should list transactions', async () => {
      const res = await request(app).get('/api/transactions');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should filter transactions by asset_id', async () => {
      const assetRes = await request(app)
        .post('/api/assets')
        .send({ symbol: 'TESTFILTER', name: 'Test Filter', type: 'crypto' });
      
      await request(app)
        .post('/api/transactions')
        .send({
          asset_id: assetRes.body.data.id,
          type: 'buy',
          quantity: 5,
          price: 100,
          date: '2024-01-01',
        });
      
      const res = await request(app).get(`/api/transactions?asset_id=${assetRes.body.data.id}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should validate required fields', async () => {
      const res = await request(app)
        .post('/api/transactions')
        .send({ type: 'buy' }); // missing required fields
      
      expect(res.status).toBe(400);
    });

    it('should reject negative quantity', async () => {
      const assetRes = await request(app)
        .post('/api/assets')
        .send({ symbol: 'TESTNEGQTY', name: 'Test Negative Qty', type: 'crypto' });
      
      const res = await request(app)
        .post('/api/transactions')
        .send({
          asset_id: assetRes.body.data.id,
          type: 'buy',
          quantity: -5,
          price: 100,
          date: '2024-01-01',
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Quantity must be greater than 0');
    });

    it('should reject negative price', async () => {
      const assetRes = await request(app)
        .post('/api/assets')
        .send({ symbol: 'TESTNEGPRICE', name: 'Test Negative Price', type: 'crypto' });
      
      const res = await request(app)
        .post('/api/transactions')
        .send({
          asset_id: assetRes.body.data.id,
          type: 'buy',
          quantity: 5,
          price: -100,
          date: '2024-01-01',
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Price cannot be negative');
    });

    it('should reject invalid transaction type', async () => {
      const assetRes = await request(app)
        .post('/api/assets')
        .send({ symbol: 'TESTINVTYPE', name: 'Test Invalid Type', type: 'crypto' });
      
      const res = await request(app)
        .post('/api/transactions')
        .send({
          asset_id: assetRes.body.data.id,
          type: 'invalid_type',
          quantity: 5,
          price: 100,
          date: '2024-01-01',
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid transaction type');
    });

    it('should create sell transaction', async () => {
      const assetRes = await request(app)
        .post('/api/assets')
        .send({ symbol: 'TESTSELL', name: 'Test Sell', type: 'crypto' });
      
      // First buy some
      await request(app)
        .post('/api/transactions')
        .send({
          asset_id: assetRes.body.data.id,
          type: 'buy',
          quantity: 10,
          price: 100,
          date: '2024-01-01',
        });
      
      // Then sell some
      const res = await request(app)
        .post('/api/transactions')
        .send({
          asset_id: assetRes.body.data.id,
          type: 'sell',
          quantity: 5,
          price: 150,
          date: '2024-01-02',
        });
      
      expect(res.status).toBe(201);
      expect(res.body.type).toBe('sell');
    });

    it.skip('should update transaction', async () => {
      const assetRes = await request(app)
        .post('/api/assets')
        .send({ symbol: 'TESTUPDATE', name: 'Test Update', type: 'crypto' });
      
      const txRes = await request(app)
        .post('/api/transactions')
        .send({
          asset_id: assetRes.body.data.id,
          type: 'buy',
          quantity: 5,
          price: 100,
          date: '2024-01-01',
        });
      
      // Verify transaction was created
      expect(txRes.status).toBe(201);
      expect(txRes.body.id).toBeDefined();
      
      const res = await request(app)
        .put(`/api/transactions/${txRes.body.id}`)
        .send({ quantity: 10, price: 100, date: '2024-01-01' });
      
      expect(res.status).toBe(200);
      expect(res.body.quantity).toBe(10);
    });

    it('should delete transaction and reverse holdings update', async () => {
      const assetRes = await request(app)
        .post('/api/assets')
        .send({ symbol: 'TESTDELTX', name: 'Test Delete Tx', type: 'crypto' });
      
      const txRes = await request(app)
        .post('/api/transactions')
        .send({
          asset_id: assetRes.body.data.id,
          type: 'buy',
          quantity: 5,
          price: 100,
          date: '2024-01-01',
        });
      
      const res = await request(app).delete(`/api/transactions/${txRes.body.id}`);
      expect(res.status).toBe(204);
    });

    it('should return 404 when deleting non-existent transaction', async () => {
      const res = await request(app).delete('/api/transactions/999999');
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Transaction not found');
    });
  });

  describe('Holdings', () => {
    it('should list holdings with values', async () => {
      const res = await request(app).get('/api/holdings');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should create a new holding directly', async () => {
      // Create a new asset for this test
      const assetRes = await request(app)
        .post('/api/assets')
        .send({ symbol: 'TESTHOLD', name: 'Test Holding', type: 'crypto' });
      
      const res = await request(app)
        .post('/api/holdings')
        .send({
          asset_id: assetRes.body.data.id,
          quantity: 5,
          avg_cost: 2000,
        });
      
      expect(res.status).toBe(201);
      expect(res.body.quantity).toBe(5);
      expect(res.body.avg_cost).toBe(2000);
    });

    it('should update existing holding when adding to same asset', async () => {
      // Create a new asset for this test
      const assetRes = await request(app)
        .post('/api/assets')
        .send({ symbol: 'TESTHOLDUPD', name: 'Test Holding Update', type: 'crypto' });
      
      // Create initial holding
      await request(app)
        .post('/api/holdings')
        .send({
          asset_id: assetRes.body.data.id,
          quantity: 5,
          avg_cost: 2000,
        });
      
      // Add more to existing holding
      const res = await request(app)
        .post('/api/holdings')
        .send({
          asset_id: assetRes.body.data.id,
          quantity: 3,
          avg_cost: 2100,
        });
      
      expect(res.status).toBe(200);
      expect(res.body.quantity).toBe(8);
    });

    it('should reject negative quantity', async () => {
      const assetRes = await request(app)
        .post('/api/assets')
        .send({ symbol: 'TESTNEGHOLD', name: 'Test Negative Holding', type: 'crypto' });
      
      const res = await request(app)
        .post('/api/holdings')
        .send({
          asset_id: assetRes.body.data.id,
          quantity: -5,
          avg_cost: 2000,
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Quantity must be greater than 0');
    });

    it('should reject negative average cost', async () => {
      const assetRes = await request(app)
        .post('/api/assets')
        .send({ symbol: 'TESTNEGCOST', name: 'Test Negative Cost', type: 'crypto' });
      
      const res = await request(app)
        .post('/api/holdings')
        .send({
          asset_id: assetRes.body.data.id,
          quantity: 5,
          avg_cost: -2000,
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Average cost cannot be negative');
    });

    it('should validate required fields', async () => {
      const res = await request(app)
        .post('/api/holdings')
        .send({ quantity: 5 }); // missing asset_id and avg_cost
      
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Missing required fields');
    });

    it.skip('should get single holding detail', async () => {
      const assetRes = await request(app)
        .post('/api/assets')
        .send({ symbol: 'TESTHOLDDET', name: 'Test Holding Detail', type: 'crypto' });
      
      await request(app)
        .post('/api/holdings')
        .send({
          asset_id: assetRes.body.data.id,
          quantity: 5,
          avg_cost: 2000,
        });
      
      const res = await request(app).get(`/api/holdings/${assetRes.body.data.id}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('symbol');
      expect(res.body).toHaveProperty('transactions');
    });

    it('should return 404 for non-existent holding', async () => {
      const res = await request(app).get('/api/holdings/999999');
      expect(res.status).toBe(404);
    });
  });

  describe('Portfolio', () => {
    it('should return portfolio summary', async () => {
      const res = await request(app).get('/api/portfolio/summary');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalValueUSD');
      expect(res.body).toHaveProperty('allocation');
      expect(res.body).toHaveProperty('holdings');
    });

    it('should refresh prices', async () => {
      const res = await request(app)
        .post('/api/portfolio/refresh-prices')
        .send({});
      
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('updated');
      expect(res.body).toHaveProperty('failed');
    });
  });

  describe('Accounts', () => {
    it('should list accounts', async () => {
      const res = await request(app).get('/api/accounts');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should create account', async () => {
      const res = await request(app)
        .post('/api/accounts')
        .send({ name: 'Test Account', type: 'exchange', currency: 'USD' });
      
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Test Account');
      expect(res.body.type).toBe('exchange');
    });

    it('should validate required fields for account', async () => {
      const res = await request(app)
        .post('/api/accounts')
        .send({ currency: 'USD' }); // missing name and type
      
      expect(res.status).toBe(400);
    });

    it('should delete account', async () => {
      const createRes = await request(app)
        .post('/api/accounts')
        .send({ name: 'Test Delete Account', type: 'broker' });
      
      const res = await request(app).delete(`/api/accounts/${createRes.body.id}`);
      expect(res.status).toBe(204);
    });

    it('should create transaction with account', async () => {
      const accountRes = await request(app)
        .post('/api/accounts')
        .send({ name: 'Test Account Tx', type: 'exchange' });
      
      const assetRes = await request(app)
        .post('/api/assets')
        .send({ symbol: 'TESTACCTX', name: 'Test Account Tx Asset', type: 'crypto' });
      
      const res = await request(app)
        .post('/api/transactions')
        .send({
          asset_id: assetRes.body.data.id,
          account_id: accountRes.body.id,
          type: 'buy',
          quantity: 5,
          price: 100,
          date: '2024-01-01',
        });
      
      expect(res.status).toBe(201);
      expect(res.body.account_id).toBe(accountRes.body.id);
    });
  });

  describe('History', () => {
    it('should get portfolio history', async () => {
      const res = await request(app).get('/api/history/portfolio?range=1M');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('data');
    });

    it('should validate range parameter', async () => {
      const res = await request(app).get('/api/history/portfolio?range=INVALID');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should get asset history', async () => {
      const assetRes = await request(app)
        .post('/api/assets')
        .send({ symbol: 'TESTHIST', name: 'Test History Asset', type: 'crypto' });
      
      const res = await request(app).get(`/api/history/asset/${assetRes.body.data.id}?range=1M`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for non-existent asset history', async () => {
      const res = await request(app).get('/api/history/asset/999999?range=1M');
      expect(res.status).toBe(404);
    });

    it('should validate asset id for history', async () => {
      const res = await request(app).get('/api/history/asset/invalid?range=1M');
      expect(res.status).toBe(400);
    });

    it('should get available history range', async () => {
      const res = await request(app).get('/api/history/range');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('earliest');
      expect(res.body.data).toHaveProperty('latest');
    });

    it('should record asset price', async () => {
      const assetRes = await request(app)
        .post('/api/assets')
        .send({ symbol: 'TESTPRICEHIST', name: 'Test Price History', type: 'crypto' });
      
      const res = await request(app)
        .post(`/api/history/asset/${assetRes.body.data.id}/price`)
        .send({ price: 100.5 });
      
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('should validate price when recording', async () => {
      const assetRes = await request(app)
        .post('/api/assets')
        .send({ symbol: 'TESTPRICEINV', name: 'Test Price Invalid', type: 'crypto' });
      
      const res = await request(app)
        .post(`/api/history/asset/${assetRes.body.data.id}/price`)
        .send({ price: -10 });
      
      expect(res.status).toBe(400);
    });

    it.skip('should batch record prices', async () => {
      const assetRes = await request(app)
        .post('/api/assets')
        .send({ symbol: 'TESTBATCH', name: 'Test Batch', type: 'crypto' });
      
      expect(assetRes.status).toBe(201);
      const assetId = assetRes.body.data.id;
      
      const res = await request(app)
        .post('/api/history/prices/batch')
        .send({
          prices: [
            { asset_id: assetId, price: 100 },
            { asset_id: assetId, price: 110 },
          ]
        });
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.recorded).toBe(2);
    });

    it('should validate batch prices input', async () => {
      const res = await request(app)
        .post('/api/history/prices/batch')
        .send({ prices: [] });
      
      expect(res.status).toBe(400);
    });

    it('should get collector stats', async () => {
      const res = await request(app).get('/api/history/stats');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
