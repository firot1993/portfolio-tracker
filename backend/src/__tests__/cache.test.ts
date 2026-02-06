import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { initDB } from '../db/index.js';
import assetsRouter from '../routes/assets.js';
import transactionsRouter from '../routes/transactions.js';
import holdingsRouter from '../routes/holdings.js';
import portfolioRouter from '../routes/portfolio.js';

// Mock the price service to avoid external API calls
vi.mock('../services/priceService.js', async () => {
  const actual = await vi.importActual<typeof import('../services/priceService.js')>('../services/priceService.js');
  return {
    ...actual,
    getUSDCNYRate: vi.fn().mockResolvedValue(7.2),
    getAssetPrice: vi.fn().mockResolvedValue(100),
  };
});

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
    // Clean up test data
    const assets = await request(app).get('/api/assets');
    for (const asset of assets.body) {
      if (asset.symbol && asset.symbol.startsWith('CACHE')) {
        await request(app).delete(`/api/assets/${asset.id}`);
      }
    }
    vi.clearAllMocks();
  });

  describe('Cache Behavior', () => {
    it('should return portfolio summary', async () => {
      // Create test asset and holding
      const assetRes = await request(app)
        .post('/api/assets')
        .send({ symbol: 'CACHEBTC', name: 'Cache Bitcoin', type: 'crypto' });
      
      await request(app)
        .post('/api/transactions')
        .send({
          asset_id: assetRes.body.data.id,
          type: 'buy',
          quantity: 1,
          price: 50000,
          date: '2024-01-01',
        });

      const res = await request(app).get('/api/portfolio/summary');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalValueUSD');
      expect(res.body).toHaveProperty('allocation');
      expect(res.body).toHaveProperty('holdings');
    });

    it('should return consistent data on multiple calls', async () => {
      const assetRes = await request(app)
        .post('/api/assets')
        .send({ symbol: 'CACHEETH', name: 'Cache Ethereum', type: 'crypto' });
      
      await request(app)
        .post('/api/transactions')
        .send({
          asset_id: assetRes.body.data.id,
          type: 'buy',
          quantity: 10,
          price: 3000,
          date: '2024-01-02',
        });

      const res1 = await request(app).get('/api/portfolio/summary');
      expect(res1.status).toBe(200);
      
      const res2 = await request(app).get('/api/portfolio/summary');
      expect(res2.status).toBe(200);
      
      expect(res1.body.totalValueUSD).toBe(res2.body.totalValueUSD);
    });

    it('should handle unique symbol requests correctly', async () => {
      const cryptoRes = await request(app)
        .post('/api/assets')
        .send({ symbol: 'CACHESOL', name: 'Cache Solana', type: 'crypto' });
      
      const stockRes = await request(app)
        .post('/api/assets')
        .send({ symbol: 'CACHEAAPL', name: 'Cache Apple', type: 'stock_us' });
      
      await request(app)
        .post('/api/transactions')
        .send({
          asset_id: cryptoRes.body.data.id,
          type: 'buy',
          quantity: 50,
          price: 100,
          date: '2024-01-03',
        });
      
      await request(app)
        .post('/api/transactions')
        .send({
          asset_id: stockRes.body.data.id,
          type: 'buy',
          quantity: 10,
          price: 150,
          date: '2024-01-03',
        });

      const res = await request(app).get('/api/portfolio/summary');
      expect(res.status).toBe(200);
      expect(res.body.holdings.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Concurrent Access', () => {
    it('should handle multiple simultaneous requests', async () => {
      const assetRes = await request(app)
        .post('/api/assets')
        .send({ symbol: 'CACHECONC', name: 'Cache Concurrent', type: 'crypto' });
      
      await request(app)
        .post('/api/transactions')
        .send({
          asset_id: assetRes.body.data.id,
          type: 'buy',
          quantity: 1,
          price: 100,
          date: '2024-01-01',
        });

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
  });

  describe('Query Parameters', () => {
    it('should handle includePrices=false', async () => {
      const res = await request(app).get('/api/portfolio/summary?includePrices=false');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalValueUSD');
    });

    it('should handle refreshPrices=true', async () => {
      const res = await request(app).get('/api/portfolio/summary?refreshPrices=true');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalValueUSD');
    });
  });

  describe('Holdings with Different Assets', () => {
    it('should differentiate holdings by asset type', async () => {
      // Create multiple assets of different types
      const crypto = await request(app)
        .post('/api/assets')
        .send({ symbol: 'CACHECRYPTO', name: 'Cache Crypto', type: 'crypto' });
      
      const stockUs = await request(app)
        .post('/api/assets')
        .send({ symbol: 'CACHESTOCKUS', name: 'Cache Stock US', type: 'stock_us' });
      
      const stockCn = await request(app)
        .post('/api/assets')
        .send({ symbol: '600519', name: 'Cache Stock CN', type: 'stock_cn', currency: 'CNY' });
      
      const gold = await request(app)
        .post('/api/assets')
        .send({ symbol: 'CACHEGOLD', name: 'Cache Gold', type: 'gold' });

      // Create holdings for each
      await request(app).post('/api/transactions').send({
        asset_id: crypto.body.data.id,
        type: 'buy',
        quantity: 1,
        price: 50000,
        date: '2024-01-01',
      });
      
      await request(app).post('/api/transactions').send({
        asset_id: stockUs.body.data.id,
        type: 'buy',
        quantity: 10,
        price: 150,
        date: '2024-01-01',
      });
      
      await request(app).post('/api/transactions').send({
        asset_id: stockCn.body.data.id,
        type: 'buy',
        quantity: 100,
        price: 1000,
        date: '2024-01-01',
      });
      
      await request(app).post('/api/transactions').send({
        asset_id: gold.body.data.id,
        type: 'buy',
        quantity: 5,
        price: 2000,
        date: '2024-01-01',
      });

      const res = await request(app).get('/api/portfolio/summary');
      expect(res.status).toBe(200);
      expect(res.body.allocation).toHaveProperty('crypto');
      expect(res.body.allocation).toHaveProperty('stock_us');
      expect(res.body.allocation).toHaveProperty('stock_cn');
      expect(res.body.allocation).toHaveProperty('gold');
    });
  });
});
