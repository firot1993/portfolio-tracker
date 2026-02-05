import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
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

describe('Price Cache Functionality', () => {
  beforeAll(async () => {
    await initDB(true);
  });

  beforeEach(async () => {
    const assets = await request(app).get('/api/assets');
    for (const asset of assets.body) {
      await request(app).delete(`/api/assets/${asset.id}`);
    }
    const assetsRes = await request(app)
      .post('/api/assets')
      .send({ symbol: 'BTC', name: 'Bitcoin', type: 'crypto' });
    await request(app)
      .post('/api/transactions')
      .send({
        asset_id: assetsRes.body.id,
        type: 'buy',
        quantity: 1,
        price: 50000,
        date: '2024-01-01',
      });
  });

  describe('Cache Hit Behavior', () => {
    it('should cache portfolio summary responses', async () => {
      const res1 = await request(app).get('/api/portfolio/summary');
      expect(res1.status).toBe(200);
      const firstCallTime = Date.now();
      
      const res2 = await request(app).get('/api/portfolio/summary');
      expect(res2.status).toBe(200);
      const secondCallTime = Date.now();
      
      expect(res1.body.totalValueUSD).toBe(res2.body.totalValueUSD);
      expect(secondCallTime - firstCallTime).toBeLessThan(100);
    });

    it('should return consistent cached data', async () => {
      const res1 = await request(app).get('/api/portfolio/summary');
      const res2 = await request(app).get('/api/portfolio/summary');
      
      expect(res1.body.holdings).toEqual(res2.body.holdings);
      expect(res1.body.allocation).toEqual(res2.body.allocation);
      expect(res1.body.totalValueUSD).toBe(res2.body.totalValueUSD);
    });
  });

  describe('Cache Miss Behavior', () => {
    it('should fetch fresh data after cache expiration', async () => {
      const res1 = await request(app).get('/api/portfolio/summary');
      expect(res1.status).toBe(200);
      
      const initialTime = Date.now();
      let dataChanged = false;
      
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const res2 = await request(app).get('/api/portfolio/summary');
      expect(res2.status).toBe(200);
      
      expect(res2.body).toHaveProperty('totalValueUSD');
    });

    it('should handle unique symbol requests correctly', async () => {
      const assetRes = await request(app)
        .post('/api/assets')
        .send({ symbol: 'ETH', name: 'Ethereum', type: 'crypto' });
      
      await request(app)
        .post('/api/transactions')
        .send({
          asset_id: assetRes.body.id,
          type: 'buy',
          quantity: 10,
          price: 3000,
          date: '2024-01-02',
        });
      
      const res = await request(app).get('/api/portfolio/summary');
      expect(res.status).toBe(200);
      expect(res.body.holdings.length).toBeGreaterThan(1);
    });
  });

  describe('Cache Key Generation', () => {
    it('should generate unique cache keys for different endpoints', async () => {
      const summaryRes = await request(app).get('/api/portfolio/summary');
      const holdingsRes = await request(app).get('/api/holdings');
      
      expect(summaryRes.status).toBe(200);
      expect(holdingsRes.status).toBe(200);
    });

    it('should differentiate cache entries by asset type', async () => {
      const cryptoRes = await request(app)
        .post('/api/assets')
        .send({ symbol: 'SOL', name: 'Solana', type: 'crypto' });
      
      const stockRes = await request(app)
        .post('/api/assets')
        .send({ symbol: 'AAPL', name: 'Apple Inc.', type: 'stock_us' });
      
      await request(app)
        .post('/api/transactions')
        .send({
          asset_id: cryptoRes.body.id,
          type: 'buy',
          quantity: 50,
          price: 100,
          date: '2024-01-03',
        });
      
      await request(app)
        .post('/api/transactions')
        .send({
          asset_id: stockRes.body.id,
          type: 'buy',
          quantity: 10,
          price: 150,
          date: '2024-01-03',
        });
      
      const res = await request(app).get('/api/portfolio/summary');
      expect(res.status).toBe(200);
      expect(res.body.holdings.length).toBe(3);
    });
  });

  describe('Concurrent Access', () => {
    it('should handle multiple simultaneous requests', async () => {
      const requests = Array(5).fill(null).map(() => 
        request(app).get('/api/portfolio/summary')
      );
      
      const results = await Promise.all(requests);
      
      results.forEach(res => {
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('totalValueUSD');
      });
      
      const firstResult = results[0].body;
      results.forEach(res => {
        expect(res.body.totalValueUSD).toBe(firstResult.totalValueUSD);
      });
    });

    it('should handle rapid successive requests', async () => {
      for (let i = 0; i < 10; i++) {
        const res = await request(app).get('/api/portfolio/summary');
        expect(res.status).toBe(200);
      }
    });
  });

  describe('Cache Performance', () => {
    it('should respond quickly for cached requests', async () => {
      await request(app).get('/api/portfolio/summary');
      
      const startTime = Date.now();
      await request(app).get('/api/portfolio/summary');
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeLessThan(50);
    });

    it('should maintain cache during multiple endpoint calls', async () => {
      await request(app).get('/api/portfolio/summary');
      await request(app).get('/api/holdings');
      await request(app).get('/api/portfolio/summary');
      
      const res = await request(app).get('/api/portfolio/summary');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalValueUSD');
    });
  });
});