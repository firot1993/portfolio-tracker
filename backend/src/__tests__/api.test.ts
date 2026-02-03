import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { initDB } from '../db/index.js';
import assetsRouter from '../routes/assets.js';
import transactionsRouter from '../routes/transactions.js';
import holdingsRouter from '../routes/holdings.js';
import portfolioRouter from '../routes/portfolio.js';

const app = express();
app.use(express.json());
app.use('/api/assets', assetsRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/holdings', holdingsRouter);
app.use('/api/portfolio', portfolioRouter);

describe('Portfolio Tracker API', () => {
  beforeAll(async () => {
    // Use in-memory database for tests
    await initDB(true);
  });

  describe('Assets', () => {
    it('should create a new asset', async () => {
      const res = await request(app)
        .post('/api/assets')
        .send({ symbol: 'BTC', name: 'Bitcoin', type: 'crypto' });
      
      expect(res.status).toBe(201);
      expect(res.body.symbol).toBe('BTC');
      expect(res.body.type).toBe('crypto');
    });

    it('should list all assets', async () => {
      const res = await request(app).get('/api/assets');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('should reject duplicate symbols', async () => {
      const res = await request(app)
        .post('/api/assets')
        .send({ symbol: 'BTC', name: 'Bitcoin Copy', type: 'stock_us' });
      
      expect(res.status).toBe(409);
    });

    it('should validate required fields', async () => {
      const res = await request(app)
        .post('/api/assets')
        .send({ symbol: 'ETH' }); // missing name and type
      
      expect(res.status).toBe(400);
    });
  });

  describe('Transactions', () => {
    it('should create a buy transaction and update holdings', async () => {
      // Get existing asset
      const assets = await request(app).get('/api/assets');
      const btc = assets.body.find((a: any) => a.symbol === 'BTC');
      
      const res = await request(app)
        .post('/api/transactions')
        .send({
          asset_id: btc.id,
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

    it('should validate required fields', async () => {
      const res = await request(app)
        .post('/api/transactions')
        .send({ type: 'buy' }); // missing required fields
      
      expect(res.status).toBe(400);
    });

    it('should reject negative quantity', async () => {
      const assets = await request(app).get('/api/assets');
      const btc = assets.body.find((a: any) => a.symbol === 'BTC');
      
      const res = await request(app)
        .post('/api/transactions')
        .send({
          asset_id: btc.id,
          type: 'buy',
          quantity: -5,
          price: 100,
          date: '2024-01-01',
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Quantity must be greater than 0');
    });

    it('should reject negative price', async () => {
      const assets = await request(app).get('/api/assets');
      const btc = assets.body.find((a: any) => a.symbol === 'BTC');
      
      const res = await request(app)
        .post('/api/transactions')
        .send({
          asset_id: btc.id,
          type: 'buy',
          quantity: 5,
          price: -100,
          date: '2024-01-01',
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Price cannot be negative');
    });

    it('should reject invalid transaction type', async () => {
      const assets = await request(app).get('/api/assets');
      const btc = assets.body.find((a: any) => a.symbol === 'BTC');
      
      const res = await request(app)
        .post('/api/transactions')
        .send({
          asset_id: btc.id,
          type: 'invalid_type',
          quantity: 5,
          price: 100,
          date: '2024-01-01',
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid transaction type');
    });

    it('should delete transaction and reverse holdings update', async () => {
      // Get existing transactions
      const txList = await request(app).get('/api/transactions');
      const tx = txList.body[0];
      
      // Delete the transaction
      const res = await request(app).delete(`/api/transactions/${tx.id}`);
      expect(res.status).toBe(204);
      
      // Verify transaction is deleted
      const afterDelete = await request(app).get('/api/transactions');
      expect(afterDelete.body.length).toBe(txList.body.length - 1);
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
        .send({ symbol: 'ETH', name: 'Ethereum', type: 'crypto' });
      
      const res = await request(app)
        .post('/api/holdings')
        .send({
          asset_id: assetRes.body.id,
          quantity: 5,
          avg_cost: 2000,
        });
      
      expect(res.status).toBe(201);
      expect(res.body.quantity).toBe(5);
      expect(res.body.avg_cost).toBe(2000);
    });

    it('should update existing holding when adding to same asset', async () => {
      const assets = await request(app).get('/api/assets');
      const eth = assets.body.find((a: any) => a.symbol === 'ETH');
      
      // Add more to existing holding
      const res = await request(app)
        .post('/api/holdings')
        .send({
          asset_id: eth.id,
          quantity: 3,
          avg_cost: 2100,
        });
      
      expect(res.status).toBe(200);
      expect(res.body.quantity).toBeGreaterThan(5); // Should be 8 now
    });

    it('should reject negative quantity', async () => {
      const assets = await request(app).get('/api/assets');
      const eth = assets.body.find((a: any) => a.symbol === 'ETH');
      
      const res = await request(app)
        .post('/api/holdings')
        .send({
          asset_id: eth.id,
          quantity: -5,
          avg_cost: 2000,
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Quantity must be greater than 0');
    });

    it('should reject negative average cost', async () => {
      const assets = await request(app).get('/api/assets');
      const eth = assets.body.find((a: any) => a.symbol === 'ETH');
      
      const res = await request(app)
        .post('/api/holdings')
        .send({
          asset_id: eth.id,
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
  });

  describe('Portfolio', () => {
    it('should return portfolio summary', async () => {
      const res = await request(app).get('/api/portfolio/summary');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalValueUSD');
      expect(res.body).toHaveProperty('allocation');
      expect(res.body).toHaveProperty('holdings');
    });
  });
});
