import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { initDB, getDB, query, run, saveDB, lastInsertId } from '../db/index.js';
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
    await initDB();
  });

  describe('Assets', () => {
    it('should create a new asset', async () => {
      const res = await request(app)
        .post('/api/assets')
        .send({ symbol: 'TEST', name: 'Test Asset', type: 'crypto' });
      
      expect(res.status).toBe(201);
      expect(res.body.symbol).toBe('TEST');
      expect(res.body.type).toBe('crypto');
    });

    it('should list all assets', async () => {
      const res = await request(app).get('/api/assets');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should reject duplicate symbols', async () => {
      await request(app)
        .post('/api/assets')
        .send({ symbol: 'DUP', name: 'First', type: 'crypto' });
      
      const res = await request(app)
        .post('/api/assets')
        .send({ symbol: 'DUP', name: 'Second', type: 'stock_us' });
      
      expect(res.status).toBe(409);
    });
  });

  describe('Transactions', () => {
    let assetId: number;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/assets')
        .send({ symbol: 'TXN', name: 'Transaction Test', type: 'crypto' });
      assetId = res.body.id;
    });

    it('should create a buy transaction and update holdings', async () => {
      const res = await request(app)
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
      expect(res.body.price).toBe(100);
    });

    it('should list transactions', async () => {
      const res = await request(app).get('/api/transactions');
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
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
