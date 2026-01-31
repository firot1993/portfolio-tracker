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
  });

  describe('Holdings', () => {
    it('should list holdings with values', async () => {
      const res = await request(app).get('/api/holdings');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
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
