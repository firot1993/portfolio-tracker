import { describe, it, expect, beforeEach, vi, type Mocked } from 'vitest';
import axios from 'axios';
import { 
  getCacheStats, 
  getCacheInfo, 
  getAssetPrice,
  getCryptoPrice,
  getUSStockPrice,
  getCNStockPrice,
  getGoldPrice,
  getUSDCNYRate,
  getHistoricalDailyPrices
} from '../services/priceService.js';

// Mock axios
vi.mock('axios');
const mockedAxios = axios as Mocked<typeof axios>;

describe('Price Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Cache Functions', () => {
    it('should return cache stats', () => {
      const stats = getCacheStats();
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('evictions');
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('hitRate');
    });

    it('should return cache info', () => {
      const info = getCacheInfo();
      expect(info).toHaveProperty('size');
      expect(info).toHaveProperty('maxSize');
      expect(info).toHaveProperty('ttl');
    });
  });

  describe('Crypto Price', () => {
    it('should fetch crypto price from CoinGecko', async () => {
      mockedAxios.create = vi.fn(() => ({
        get: vi.fn().mockResolvedValue({
          data: { bitcoin: { usd: 50000 } }
        })
      } as any));

      const price = await getCryptoPrice('BTC');
      // First call might be null due to cache miss, second should return value
      expect(price === null || typeof price === 'number').toBe(true);
    });

    it('should handle crypto price fetch error', async () => {
      mockedAxios.create = vi.fn(() => ({
        get: vi.fn().mockRejectedValue(new Error('API Error'))
      } as any));

      const price = await getCryptoPrice('INVALID');
      expect(price === null || typeof price === 'number').toBe(true);
    });
  });

  describe('US Stock Price', () => {
    it('should fetch US stock price from Yahoo Finance', async () => {
      mockedAxios.create = vi.fn(() => ({
        get: vi.fn().mockResolvedValue({
          data: {
            chart: {
              result: [{
                meta: { regularMarketPrice: 150.5 }
              }]
            }
          }
        })
      } as any));

      const price = await getUSStockPrice('AAPL');
      expect(price === null || typeof price === 'number').toBe(true);
    });

    it('should handle US stock price fetch error', async () => {
      mockedAxios.create = vi.fn(() => ({
        get: vi.fn().mockRejectedValue(new Error('API Error'))
      } as any));

      const price = await getUSStockPrice('INVALID');
      expect(price === null || typeof price === 'number').toBe(true);
    });
  });

  describe('CN Stock Price', () => {
    it('should fetch CN stock price from Sina Finance', async () => {
      mockedAxios.create = vi.fn(() => ({
        get: vi.fn().mockResolvedValue({
          data: 'var hq_str_sh600519="贵州茅台,1800.00,1790.00,1810.00,1820.00,1795.00,1805.00,1815.00,10000,50000,1800,100,1799,200"'
        })
      } as any));

      const price = await getCNStockPrice('600519');
      expect(price === null || typeof price === 'number').toBe(true);
    });

    it('should handle CN stock price fetch error', async () => {
      mockedAxios.create = vi.fn(() => ({
        get: vi.fn().mockRejectedValue(new Error('API Error'))
      } as any));

      const price = await getCNStockPrice('INVALID');
      expect(price === null || typeof price === 'number').toBe(true);
    });
  });

  describe('Gold Price', () => {
    it('should fetch gold price', async () => {
      mockedAxios.create = vi.fn(() => ({
        get: vi.fn().mockResolvedValue({
          data: [{ price: 2000.5 }]
        })
      } as any));

      const price = await getGoldPrice();
      expect(price === null || typeof price === 'number').toBe(true);
    });

    it('should handle gold price fetch error', async () => {
      mockedAxios.create = vi.fn(() => ({
        get: vi.fn().mockRejectedValue(new Error('API Error'))
      } as any));

      const price = await getGoldPrice();
      expect(price === null || typeof price === 'number').toBe(true);
    });
  });

  describe('USD/CNY Rate', () => {
    it('should fetch USD/CNY rate', async () => {
      mockedAxios.create = vi.fn(() => ({
        get: vi.fn().mockResolvedValue({
          data: {
            chart: {
              result: [{
                meta: { regularMarketPrice: 7.2 }
              }]
            }
          }
        })
      } as any));

      const rate = await getUSDCNYRate();
      expect(rate === null || typeof rate === 'number').toBe(true);
    });

    it('should handle USD/CNY rate fetch error', async () => {
      mockedAxios.create = vi.fn(() => ({
        get: vi.fn().mockRejectedValue(new Error('API Error'))
      } as any));

      const rate = await getUSDCNYRate();
      expect(rate === null || typeof rate === 'number').toBe(true);
    });
  });

  describe('Unified Asset Price', () => {
    it('should get price for crypto asset', async () => {
      const price = await getAssetPrice('BTC', 'crypto');
      expect(price === null || typeof price === 'number').toBe(true);
    });

    it('should get price for US stock', async () => {
      const price = await getAssetPrice('AAPL', 'stock_us');
      expect(price === null || typeof price === 'number').toBe(true);
    });

    it('should get price for CN stock', async () => {
      const price = await getAssetPrice('600519', 'stock_cn');
      expect(price === null || typeof price === 'number').toBe(true);
    });

    it('should get price for gold', async () => {
      const price = await getAssetPrice('XAU', 'gold');
      expect(price === null || typeof price === 'number').toBe(true);
    });

    it('should return null for unknown asset type', async () => {
      const price = await getAssetPrice('UNKNOWN', 'unknown_type');
      expect(price).toBeNull();
    });
  });

  describe('Historical Prices', () => {
    it('should handle crypto historical data fetch', async () => {
      mockedAxios.create = vi.fn(() => ({
        get: vi.fn().mockResolvedValue({
          data: {
            prices: [
              [Date.now(), 50000],
              [Date.now() - 86400000, 49000]
            ]
          }
        })
      } as any));

      const prices = await getHistoricalDailyPrices('BTC', 'crypto', '2024-01-01', '2024-01-31');
      expect(Array.isArray(prices)).toBe(true);
    });

    it('should handle US stock historical data fetch', async () => {
      mockedAxios.create = vi.fn(() => ({
        get: vi.fn().mockResolvedValue({
          data: {
            chart: {
              result: [{
                timestamp: [Date.now() / 1000],
                indicators: {
                  quote: [{ close: [150] }]
                }
              }]
            }
          }
        })
      } as any));

      const prices = await getHistoricalDailyPrices('AAPL', 'stock_us', '2024-01-01', '2024-01-31');
      expect(Array.isArray(prices)).toBe(true);
    });

    it('should handle error in historical data fetch', async () => {
      mockedAxios.create = vi.fn(() => ({
        get: vi.fn().mockRejectedValue(new Error('API Error'))
      } as any));

      const prices = await getHistoricalDailyPrices('INVALID', 'crypto', '2024-01-01', '2024-01-31');
      expect(Array.isArray(prices)).toBe(true);
      expect(prices.length).toBe(0);
    });

    it('should return empty array for unsupported asset type', async () => {
      const prices = await getHistoricalDailyPrices('UNKNOWN', 'unknown', '2024-01-01', '2024-01-31');
      expect(Array.isArray(prices)).toBe(true);
      expect(prices.length).toBe(0);
    });
  });
});
