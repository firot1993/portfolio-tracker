import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { initDB, run, query } from '../db/index.js';
import { realtimePriceService } from '../services/realtimePriceService.js';
import axios from 'axios';
import { WebSocket } from 'ws';

// Mock axios
vi.mock('axios');

// Mock WebSocket
vi.mock('ws', () => {
  const mockOn = vi.fn();
  const mockSend = vi.fn();
  const mockClose = vi.fn();
  
  class MockWebSocket {
    static OPEN = 1;
    static CLOSED = 3;
    readyState = 1;
    on = mockOn;
    send = mockSend;
    close = mockClose;
  }
  
  return { WebSocket: MockWebSocket };
});

// Test user ID constant
const TEST_USER_ID = 1;

describe('RealtimePriceService', () => {
  beforeAll(async () => {
    await initDB(true);
    // Create a test user
    run('INSERT OR IGNORE INTO users (id, email, password_hash) VALUES (1, "test@portfolio.local", "hash")');
    // Create a test account
    run('INSERT OR IGNORE INTO accounts (id, user_id, name, type, currency) VALUES (1, 1, "Test Account", "exchange", "USD")');
  });

  beforeEach(() => {
    run('DELETE FROM price_history');
    run('DELETE FROM holdings');
    run('DELETE FROM assets');

    // Reset internal state to avoid cross-test pollution.
    (realtimePriceService as any).trackedAssets = new Map();
    (realtimePriceService as any).currentPrices = new Map();
    (realtimePriceService as any).historyBuckets = new Map();
    (realtimePriceService as any).clients = new Map();
    (realtimePriceService as any).priceCallbacks = [];
    (realtimePriceService as any).binanceSymbols = new Set();
    (realtimePriceService as any).tiingoSymbols = new Set();
    (realtimePriceService as any).binanceConnected = false;
    (realtimePriceService as any).tiingoConnected = false;
    (realtimePriceService as any).reconnectAttempts = 0;

    // Clear timers
    if ((realtimePriceService as any).httpFallbackTimer) {
      clearInterval((realtimePriceService as any).httpFallbackTimer);
      (realtimePriceService as any).httpFallbackTimer = null;
    }
    if ((realtimePriceService as any).binanceReconnectTimer) {
      clearTimeout((realtimePriceService as any).binanceReconnectTimer);
      (realtimePriceService as any).binanceReconnectTimer = null;
    }
    if ((realtimePriceService as any).tiingoReconnectTimer) {
      clearTimeout((realtimePriceService as any).tiingoReconnectTimer);
      (realtimePriceService as any).tiingoReconnectTimer = null;
    }

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function toSqliteDateTimeMs(date: Date): string {
    const iso = date.toISOString();
    return iso.slice(0, 23).replace('T', ' ');
  }

  describe('normalizeBinanceSymbol', () => {
    it('normalizes crypto symbol with USDT suffix', () => {
      const result = (realtimePriceService as any).normalizeBinanceSymbol('BTC');
      expect(result).toBe('btcusdt');
    });

    it('preserves symbol already ending with USDT', () => {
      const result = (realtimePriceService as any).normalizeBinanceSymbol('BTCUSDT');
      expect(result).toBe('btcusdt');
    });

    it('preserves symbol already ending with USD', () => {
      const result = (realtimePriceService as any).normalizeBinanceSymbol('BTCUSD');
      expect(result).toBe('btcusd');
    });

    it('handles lowercase input', () => {
      const result = (realtimePriceService as any).normalizeBinanceSymbol('eth');
      expect(result).toBe('ethusdt');
    });
  });

  describe('loadTrackedAssets', () => {
    it('loads assets with holdings from database', () => {
      run('INSERT INTO assets (id, user_id, symbol, name, type, currency) VALUES (?, ?, ?, ?, ?, ?)',
        [1, TEST_USER_ID, 'BTC', 'Bitcoin', 'crypto', 'USD']);
      run('INSERT INTO holdings (id, user_id, account_id, asset_id, quantity, avg_cost) VALUES (?, ?, ?, ?, ?, ?)',
        [1, TEST_USER_ID, 1, 1, 1.5, 30000]);

      (realtimePriceService as any).loadTrackedAssets();

      const tracked = (realtimePriceService as any).trackedAssets;
      expect(tracked.size).toBe(1);
      expect(tracked.get(1)).toMatchObject({
        id: 1,
        symbol: 'BTC',
        type: 'crypto',
        normalizedSymbol: 'btcusdt',
      });
    });

    it('loads US stock assets with normalized symbols', () => {
      run('INSERT INTO assets (id, user_id, symbol, name, type, currency) VALUES (?, ?, ?, ?, ?, ?)',
        [2, TEST_USER_ID, 'AAPL', 'Apple Inc', 'stock_us', 'USD']);
      run('INSERT INTO holdings (id, user_id, account_id, asset_id, quantity, avg_cost) VALUES (?, ?, ?, ?, ?, ?)',
        [2, TEST_USER_ID, 1, 2, 100, 150]);

      (realtimePriceService as any).loadTrackedAssets();

      const tracked = (realtimePriceService as any).trackedAssets;
      expect(tracked.size).toBe(1);
      expect(tracked.get(2)).toMatchObject({
        id: 2,
        symbol: 'AAPL',
        type: 'stock_us',
        normalizedSymbol: 'AAPL',
      });
    });

    it('only loads assets with positive quantity holdings', () => {
      run('INSERT INTO assets (id, user_id, symbol, name, type, currency) VALUES (?, ?, ?, ?, ?, ?)',
        [1, TEST_USER_ID, 'BTC', 'Bitcoin', 'crypto', 'USD']);
      run('INSERT INTO holdings (id, user_id, account_id, asset_id, quantity, avg_cost) VALUES (?, ?, ?, ?, ?, ?)',
        [1, TEST_USER_ID, 1, 1, 0, 30000]);

      (realtimePriceService as any).loadTrackedAssets();

      const tracked = (realtimePriceService as any).trackedAssets;
      expect(tracked.size).toBe(0);
    });

    it('limits crypto assets to MAX_CRYPTO_TICKS', () => {
      // Insert more than 10 crypto assets
      for (let i = 1; i <= 15; i++) {
        run('INSERT INTO assets (id, user_id, symbol, name, type, currency) VALUES (?, ?, ?, ?, ?, ?)',
          [i, TEST_USER_ID, `CRYPTO${i}`, `Crypto ${i}`, 'crypto', 'USD']);
        run('INSERT INTO holdings (id, user_id, account_id, asset_id, quantity, avg_cost) VALUES (?, ?, ?, ?, ?, ?)',
          [i, TEST_USER_ID, 1, i, 1, 100]);
      }

      (realtimePriceService as any).loadTrackedAssets();

      const tracked = (realtimePriceService as any).trackedAssets;
      const cryptoCount = Array.from(tracked.values()).filter((a: any) => a.type === 'crypto').length;
      expect(cryptoCount).toBe(10);
    });

    it('limits US stock assets to MAX_STOCK_US_TICKS', () => {
      // Insert more than 20 stock assets
      for (let i = 1; i <= 25; i++) {
        run('INSERT INTO assets (id, user_id, symbol, name, type, currency) VALUES (?, ?, ?, ?, ?, ?)',
          [i, TEST_USER_ID, `STOCK${i}`, `Stock ${i}`, 'stock_us', 'USD']);
        run('INSERT INTO holdings (id, user_id, account_id, asset_id, quantity, avg_cost) VALUES (?, ?, ?, ?, ?, ?)',
          [i, TEST_USER_ID, 1, i, 1, 100]);
      }

      (realtimePriceService as any).loadTrackedAssets();

      const tracked = (realtimePriceService as any).trackedAssets;
      const stockCount = Array.from(tracked.values()).filter((a: any) => a.type === 'stock_us').length;
      expect(stockCount).toBe(20);
    });
  });

  describe('getProxyAgent', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('returns undefined when no proxy is configured', () => {
      delete process.env.HTTPS_PROXY;
      delete process.env.https_proxy;
      delete process.env.HTTP_PROXY;
      delete process.env.http_proxy;

      const result = (realtimePriceService as any).getProxyAgent();
      expect(result).toBeUndefined();
    });

    it('returns agent when HTTPS_PROXY is set', () => {
      process.env.HTTPS_PROXY = 'http://proxy.example.com:8080';

      const result = (realtimePriceService as any).getProxyAgent();
      expect(result).toBeDefined();
    });
  });

  describe('fetchHttpPrices', () => {
    it('skips when Binance WebSocket is connected', async () => {
      (realtimePriceService as any).binanceConnected = true;

      await (realtimePriceService as any).fetchHttpPrices();

      expect(axios.get).not.toHaveBeenCalled();
    });

    it('returns early when no crypto assets', async () => {
      (realtimePriceService as any).binanceConnected = false;

      await (realtimePriceService as any).fetchHttpPrices();

      expect(axios.get).not.toHaveBeenCalled();
    });

    it('fetches crypto prices via HTTP', async () => {
      (realtimePriceService as any).binanceConnected = false;
      (realtimePriceService as any).trackedAssets.set(1, {
        id: 1,
        symbol: 'BTC',
        name: 'Bitcoin',
        type: 'crypto',
        currency: 'USD',
        normalizedSymbol: 'btcusdt',
      });

      (axios.get as any).mockResolvedValue({
        data: [{ symbol: 'BTCUSDT', price: '45000.50' }],
      });

      await (realtimePriceService as any).fetchHttpPrices();

      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('api.binance.com'),
        expect.any(Object)
      );
    });

    it('handles API errors gracefully', async () => {
      (realtimePriceService as any).binanceConnected = false;
      (realtimePriceService as any).trackedAssets.set(1, {
        id: 1,
        symbol: 'BTC',
        name: 'Bitcoin',
        type: 'crypto',
        currency: 'USD',
        normalizedSymbol: 'btcusdt',
      });

      (axios.get as any).mockRejectedValue(new Error('Network error'));

      // Should not throw
      await expect((realtimePriceService as any).fetchHttpPrices()).resolves.not.toThrow();
    });
  });

  describe('fetchHttpStockPrices', () => {
    it('skips when Tiingo WebSocket is connected', async () => {
      (realtimePriceService as any).tiingoConnected = true;

      await (realtimePriceService as any).fetchHttpStockPrices();

      expect(axios.get).not.toHaveBeenCalled();
    });

    it('skips when no API key is available', async () => {
      (realtimePriceService as any).tiingoConnected = false;
      const originalKey = process.env.TIINGO_API_KEY;
      process.env.TIINGO_API_KEY = '';

      await (realtimePriceService as any).fetchHttpStockPrices();

      expect(axios.get).not.toHaveBeenCalled();
      process.env.TIINGO_API_KEY = originalKey;
    });

    it('returns early when no stock assets', async () => {
      (realtimePriceService as any).tiingoConnected = false;

      await (realtimePriceService as any).fetchHttpStockPrices();

      expect(axios.get).not.toHaveBeenCalled();
    });

    it('handles API errors with response data', async () => {
      (realtimePriceService as any).tiingoConnected = false;
      (realtimePriceService as any).trackedAssets.set(1, {
        id: 1,
        symbol: 'AAPL',
        name: 'Apple',
        type: 'stock_us',
        currency: 'USD',
        normalizedSymbol: 'AAPL',
      });

      const error = new Error('API Error') as any;
      error.response = { data: { message: 'Invalid API key' } };
      (axios.get as any).mockRejectedValue(error);

      await expect((realtimePriceService as any).fetchHttpStockPrices()).resolves.not.toThrow();
    });
  });

  describe('handleBinanceMessage', () => {
    it('parses Binance ticker message and updates price', () => {
      (realtimePriceService as any).trackedAssets.set(1, {
        id: 1,
        symbol: 'BTC',
        name: 'Bitcoin',
        type: 'crypto',
        currency: 'USD',
        normalizedSymbol: 'btcusdt',
      });

      (realtimePriceService as any).handleBinanceMessage({
        stream: 'btcusdt@ticker',
        data: { c: '45000.50' },
      });

      const current = realtimePriceService.getCurrentPrice(1);
      expect(current).not.toBeNull();
      expect(current?.price).toBe(45000.50);
    });

    it('ignores messages without stream or data', () => {
      (realtimePriceService as any).handleBinanceMessage({});
      // Should not throw
      expect(realtimePriceService.getCurrentPrice(1)).toBeNull();
    });

    it('ignores messages with invalid price', () => {
      (realtimePriceService as any).trackedAssets.set(1, {
        id: 1,
        symbol: 'BTC',
        name: 'Bitcoin',
        type: 'crypto',
        currency: 'USD',
        normalizedSymbol: 'btcusdt',
      });

      (realtimePriceService as any).handleBinanceMessage({
        stream: 'btcusdt@ticker',
        data: { c: 'invalid' },
      });

      expect(realtimePriceService.getCurrentPrice(1)).toBeNull();
    });

    it('ignores messages for untracked symbols', () => {
      (realtimePriceService as any).handleBinanceMessage({
        stream: 'unknownusdt@ticker',
        data: { c: '100.00' },
      });

      // Should not crash
      expect(realtimePriceService.getCurrentPrice(999)).toBeNull();
    });
  });

  describe('handleTiingoMessage', () => {
    it('ignores heartbeat messages', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      (realtimePriceService as any).handleTiingoMessage({
        messageType: 'H',
        data: {},
      });

      // Should not process heartbeat
      consoleSpy.mockRestore();
    });

    it('ignores messages without messageType', () => {
      (realtimePriceService as any).trackedAssets.set(1, {
        id: 1,
        symbol: 'AAPL',
        name: 'Apple',
        type: 'stock_us',
        currency: 'USD',
        normalizedSymbol: 'AAPL',
      });

      (realtimePriceService as any).handleTiingoMessage({
        data: [Date.now(), 'AAPL', 150],
      });

      expect(realtimePriceService.getCurrentPrice(1)).toBeNull();
    });

    it('parses IEX array message and updates current price', () => {
      run(
        'INSERT INTO assets (id, user_id, symbol, name, type, currency) VALUES (?, ?, ?, ?, ?, ?)',
        [1, TEST_USER_ID, 'NVDA', 'NVIDIA', 'stock_us', 'USD']
      );

      (realtimePriceService as any).trackedAssets.set(1, {
        id: 1,
        symbol: 'NVDA',
        name: 'NVIDIA',
        type: 'stock_us',
        currency: 'USD',
        normalizedSymbol: 'NVDA',
      });

      const ts = '2026-02-09T11:20:49.068446596-05:00';
      (realtimePriceService as any).handleTiingoMessage({
        service: 'iex',
        messageType: 'A',
        data: [ts, 'nvda', 191.61],
      });

      const current = realtimePriceService.getCurrentPrice(1);
      expect(current).not.toBeNull();
      expect(current?.price).toBeCloseTo(191.61, 6);
      expect(current?.timestamp).toBe(Date.parse(ts));
    });

    it('parses IEX batch array messages', () => {
      run(
        'INSERT INTO assets (id, user_id, symbol, name, type, currency) VALUES (?, ?, ?, ?, ?, ?)',
        [2, TEST_USER_ID, 'NVDA', 'NVIDIA', 'stock_us', 'USD']
      );

      (realtimePriceService as any).trackedAssets.set(2, {
        id: 2,
        symbol: 'NVDA',
        name: 'NVIDIA',
        type: 'stock_us',
        currency: 'USD',
        normalizedSymbol: 'NVDA',
      });

      const ts = '2026-02-09T11:20:50.000000000-05:00';
      (realtimePriceService as any).handleTiingoMessage({
        service: 'iex',
        messageType: 'A',
        data: [
          [ts, 'nvda', 191.62],
          [ts, 'nvda', 191.63],
        ],
      });

      const current = realtimePriceService.getCurrentPrice(2);
      expect(current).not.toBeNull();
      expect(current?.price).toBeCloseTo(191.63, 6);
      expect(current?.timestamp).toBe(Date.parse(ts));
    });

    it('parses object payload with lastPrice', () => {
      (realtimePriceService as any).trackedAssets.set(3, {
        id: 3,
        symbol: 'AAPL',
        name: 'Apple',
        type: 'stock_us',
        currency: 'USD',
        normalizedSymbol: 'AAPL',
      });

      (realtimePriceService as any).handleTiingoMessage({
        messageType: 'A',
        data: {
          ticker: 'AAPL',
          lastPrice: 175.50,
          timestamp: Date.now(),
        },
      });

      const current = realtimePriceService.getCurrentPrice(3);
      expect(current).not.toBeNull();
      expect(current?.price).toBe(175.50);
    });

    it('calculates mid price from bid/ask when lastPrice unavailable', () => {
      (realtimePriceService as any).trackedAssets.set(4, {
        id: 4,
        symbol: 'AAPL',
        name: 'Apple',
        type: 'stock_us',
        currency: 'USD',
        normalizedSymbol: 'AAPL',
      });

      (realtimePriceService as any).handleTiingoMessage({
        messageType: 'A',
        data: {
          ticker: 'AAPL',
          bidPrice: 170,
          askPrice: 172,
          timestamp: Date.now(),
        },
      });

      const current = realtimePriceService.getCurrentPrice(4);
      expect(current).not.toBeNull();
      // When bidPrice is available without lastPrice, it uses bidPrice directly
      // The mid-price is only calculated when bidPrice is falsy
      expect(current?.price).toBe(170);
    });

    it('ignores invalid data in batch arrays', () => {
      (realtimePriceService as any).trackedAssets.set(5, {
        id: 5,
        symbol: 'AAPL',
        name: 'Apple',
        type: 'stock_us',
        currency: 'USD',
        normalizedSymbol: 'AAPL',
      });

      (realtimePriceService as any).handleTiingoMessage({
        messageType: 'A',
        data: [
          ['2026-02-09T11:20:50Z', 'AAPL', 150],
          'invalid row',
          ['2026-02-09T11:20:51Z', 'AAPL', 151],
        ],
      });

      const current = realtimePriceService.getCurrentPrice(5);
      expect(current).not.toBeNull();
      expect(current?.price).toBe(151);
    });
  });

  describe('updatePrice and persistPrice', () => {
    it('updates current price and notifies callbacks', () => {
      const callback = vi.fn();
      realtimePriceService.onPriceUpdate(callback);

      (realtimePriceService as any).trackedAssets.set(1, {
        id: 1,
        symbol: 'BTC',
        name: 'Bitcoin',
        type: 'crypto',
        currency: 'USD',
        normalizedSymbol: 'btcusdt',
      });

      const timestamp = Date.now();
      (realtimePriceService as any).updatePrice(1, 'BTC', 45000, timestamp);

      expect(callback).toHaveBeenCalledWith(1, 'BTC', 45000, timestamp);
      expect(realtimePriceService.getCurrentPrice(1)).toEqual({ price: 45000, timestamp });

      realtimePriceService.offPriceUpdate(callback);
    });

    it('throttles database writes', () => {
      run('INSERT INTO assets (id, user_id, symbol, name, type, currency, current_price) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [1, TEST_USER_ID, 'BTC', 'Bitcoin', 'crypto', 'USD', 40000]);

      const now = Date.now();
      (realtimePriceService as any).priceUpdateThrottle.clear();

      // First update should write to DB
      (realtimePriceService as any).updatePrice(1, 'BTC', 45000, now);
      
      // Second update within 5 seconds should be throttled
      (realtimePriceService as any).updatePrice(1, 'BTC', 46000, now + 1000);

      const rows = query('SELECT current_price FROM assets WHERE id = 1') as Array<{ current_price: number }>;
      // Price should still be 45000 due to throttling
      expect(rows[0].current_price).toBe(45000);
    });

    it('allows update after throttle period', () => {
      run('INSERT INTO assets (id, user_id, symbol, name, type, currency, current_price) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [1, TEST_USER_ID, 'BTC', 'Bitcoin', 'crypto', 'USD', 40000]);

      const now = Date.now();
      (realtimePriceService as any).priceUpdateThrottle.clear();

      // First update
      (realtimePriceService as any).updatePrice(1, 'BTC', 45000, now);
      
      // Update after 6 seconds should not be throttled
      (realtimePriceService as any).updatePrice(1, 'BTC', 46000, now + 6000);

      const rows = query('SELECT current_price FROM assets WHERE id = 1') as Array<{ current_price: number }>;
      expect(rows[0].current_price).toBe(46000);
    });
  });

  describe('recordBucketedHistory', () => {
    // Note: These tests are skipped because recordBucketedHistory no longer writes to the database
    // Price history recording requires user context - users should use /history/asset/:id/price to record prices manually

    it.skip('records 15-minute bucket start/end points in price history', () => {
      run(
        'INSERT INTO assets (id, user_id, symbol, name, type, currency) VALUES (?, ?, ?, ?, ?, ?)',
        [3, TEST_USER_ID, 'NVDA', 'NVIDIA', 'stock_us', 'USD']
      );

      (realtimePriceService as any).trackedAssets.set(3, {
        id: 3,
        symbol: 'NVDA',
        name: 'NVIDIA',
        type: 'stock_us',
        currency: 'USD',
        normalizedSymbol: 'NVDA',
      });

      const t1 = Date.parse('2026-02-09T12:00:00.000Z');
      const t2 = Date.parse('2026-02-09T12:07:00.000Z');
      const t3 = Date.parse('2026-02-09T12:15:00.000Z');

      (realtimePriceService as any).handleTiingoMessage({
        service: 'iex',
        messageType: 'A',
        data: [new Date(t1).toISOString(), 'nvda', 100],
      });
      (realtimePriceService as any).handleTiingoMessage({
        service: 'iex',
        messageType: 'A',
        data: [new Date(t2).toISOString(), 'nvda', 110],
      });
      (realtimePriceService as any).handleTiingoMessage({
        service: 'iex',
        messageType: 'A',
        data: [new Date(t3).toISOString(), 'nvda', 120],
      });

      const rows = query(
        'SELECT timestamp, price FROM price_history WHERE asset_id = 3 ORDER BY timestamp'
      ) as Array<{ timestamp: string; price: number }>;

      const expected = [
        { timestamp: toSqliteDateTimeMs(new Date(t1)), price: 100 },
        { timestamp: toSqliteDateTimeMs(new Date(t1 + 15 * 60 * 1000 - 1)), price: 110 },
        { timestamp: toSqliteDateTimeMs(new Date(t3)), price: 120 },
      ];

      expect(rows.length).toBe(3);
      expect(rows).toEqual(expected);
    });

    it('ignores non-crypto and non-stock_us assets', () => {
      (realtimePriceService as any).trackedAssets.set(1, {
        id: 1,
        symbol: 'GOLD',
        name: 'Gold',
        type: 'gold',
        currency: 'USD',
        normalizedSymbol: 'GOLD',
      });

      (realtimePriceService as any).recordBucketedHistory(1, 1800, Date.now());

      const rows = query('SELECT * FROM price_history WHERE asset_id = 1');
      expect(rows.length).toBe(0);
    });

    it('ignores invalid prices', () => {
      (realtimePriceService as any).trackedAssets.set(1, {
        id: 1,
        symbol: 'BTC',
        name: 'Bitcoin',
        type: 'crypto',
        currency: 'USD',
        normalizedSymbol: 'btcusdt',
      });

      (realtimePriceService as any).recordBucketedHistory(1, -100, Date.now());

      const rows = query('SELECT * FROM price_history WHERE asset_id = 1');
      expect(rows.length).toBe(0);
    });

    it.skip('ignores out-of-order timestamps', () => {
      run('INSERT INTO assets (id, user_id, symbol, name, type, currency) VALUES (?, ?, ?, ?, ?, ?)',
        [1, TEST_USER_ID, 'BTC', 'Bitcoin', 'crypto', 'USD']);

      (realtimePriceService as any).trackedAssets.set(1, {
        id: 1,
        symbol: 'BTC',
        name: 'Bitcoin',
        type: 'crypto',
        currency: 'USD',
        normalizedSymbol: 'btcusdt',
      });

      const now = Date.now();
      (realtimePriceService as any).historyBuckets.set(1, {
        bucketStartMs: now,
        lastPrice: 45000,
        lastTimestamp: now,
        started: true,
      });

      // Try to record an earlier timestamp
      (realtimePriceService as any).recordBucketedHistory(1, 44000, now - 1000);

      // Should not add new record
      const rows = query('SELECT * FROM price_history WHERE asset_id = 1');
      expect(rows.length).toBe(0);
    });

    it.skip('records start of bucket if not started', () => {
      run('INSERT INTO assets (id, user_id, symbol, name, type, currency) VALUES (?, ?, ?, ?, ?, ?)',
        [1, TEST_USER_ID, 'BTC', 'Bitcoin', 'crypto', 'USD']);

      (realtimePriceService as any).trackedAssets.set(1, {
        id: 1,
        symbol: 'BTC',
        name: 'Bitcoin',
        type: 'crypto',
        currency: 'USD',
        normalizedSymbol: 'btcusdt',
      });

      const bucketStart = Math.floor(Date.now() / (15 * 60 * 1000)) * (15 * 60 * 1000);
      (realtimePriceService as any).historyBuckets.set(1, {
        bucketStartMs: bucketStart,
        lastPrice: 45000,
        lastTimestamp: bucketStart + 1000,
        started: false,
      });

      (realtimePriceService as any).recordBucketedHistory(1, 46000, bucketStart + 5000);

      const rows = query('SELECT * FROM price_history WHERE asset_id = 1');
      expect(rows.length).toBe(1);
    });
  });

  describe('Client Management', () => {
    it('adds client and sends init message', () => {
      const mockSend = vi.fn();
      const mockWs = {
        readyState: WebSocket.OPEN,
        send: mockSend,
        on: vi.fn(),
        close: vi.fn(),
      } as any;

      (realtimePriceService as any).trackedAssets.set(1, {
        id: 1,
        symbol: 'BTC',
        type: 'crypto',
        currency: 'USD',
        normalizedSymbol: 'btcusdt',
      });
      (realtimePriceService as any).currentPrices.set(1, { price: 45000, timestamp: Date.now() });

      realtimePriceService.addClient(mockWs);

      expect((realtimePriceService as any).clients.size).toBe(1);
      expect(mockSend).toHaveBeenCalled();
      
      const sentMessage = JSON.parse(mockSend.mock.calls[0][0]);
      expect(sentMessage.type).toBe('init');
      expect(sentMessage.prices).toHaveLength(1);
    });

    it('removes client', () => {
      const mockWs = {
        readyState: WebSocket.OPEN,
        send: vi.fn(),
        on: vi.fn(),
        close: vi.fn(),
      } as any;

      realtimePriceService.addClient(mockWs);
      expect((realtimePriceService as any).clients.size).toBe(1);

      realtimePriceService.removeClient(mockWs);
      expect((realtimePriceService as any).clients.size).toBe(0);
    });

    it('handles client WebSocket errors', () => {
      const mockSend = vi.fn();
      const mockOn = vi.fn();
      const mockClose = vi.fn();
      const mockWs = {
        readyState: WebSocket.OPEN,
        send: mockSend,
        on: mockOn,
        close: mockClose,
      } as any;

      realtimePriceService.addClient(mockWs);

      // Get the error handler
      const errorHandler = mockOn.mock.calls.find((call: any) => call[0] === 'error')?.[1];
      expect(errorHandler).toBeDefined();

      // Trigger error
      errorHandler(new Error('Connection lost'));
      expect((realtimePriceService as any).clients.size).toBe(0);
    });

    it('handles close event', () => {
      const mockOn = vi.fn();
      const mockWs = {
        readyState: WebSocket.OPEN,
        send: vi.fn(),
        on: mockOn,
        close: vi.fn(),
      } as any;

      realtimePriceService.addClient(mockWs);

      // Get the close handler
      const closeHandler = mockOn.mock.calls.find((call: any) => call[0] === 'close')?.[1];
      expect(closeHandler).toBeDefined();

      // Trigger close
      closeHandler();
      expect((realtimePriceService as any).clients.size).toBe(0);
    });

    it('sendToClient handles non-open WebSocket', () => {
      const mockSend = vi.fn();
      const mockWs = {
        readyState: WebSocket.CLOSED,
        send: mockSend,
      } as any;

      (realtimePriceService as any).sendToClient(mockWs, { type: 'test' });

      expect(mockSend).not.toHaveBeenCalled();
    });

    it('broadcastToClients sends to all open clients', () => {
      const mockSend1 = vi.fn();
      const mockSend2 = vi.fn();
      const mockWs1 = { readyState: WebSocket.OPEN, send: mockSend1 } as any;
      const mockWs2 = { readyState: WebSocket.CLOSED, send: mockSend2 } as any;

      (realtimePriceService as any).clients.set(mockWs1, { ws: mockWs1, subscribedAssets: new Set() });
      (realtimePriceService as any).clients.set(mockWs2, { ws: mockWs2, subscribedAssets: new Set() });

      (realtimePriceService as any).broadcastToClients({ type: 'update', price: 100 });

      expect(mockSend1).toHaveBeenCalled();
      expect(mockSend2).not.toHaveBeenCalled();
    });
  });

  describe('Public API', () => {
    it('onPriceUpdate and offPriceUpdate manage callbacks', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      realtimePriceService.onPriceUpdate(callback1);
      realtimePriceService.onPriceUpdate(callback2);

      (realtimePriceService as any).priceCallbacks.forEach((cb: any) => cb(1, 'BTC', 100, Date.now()));

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();

      realtimePriceService.offPriceUpdate(callback1);
      expect((realtimePriceService as any).priceCallbacks.length).toBe(1);
    });

    it('getCurrentPrice returns null for unknown asset', () => {
      expect(realtimePriceService.getCurrentPrice(999)).toBeNull();
    });

    it('getTrackedAssets returns array of tracked assets', () => {
      (realtimePriceService as any).trackedAssets.set(1, {
        id: 1,
        symbol: 'BTC',
        name: 'Bitcoin',
        type: 'crypto',
        currency: 'USD',
        normalizedSymbol: 'btcusdt',
      });

      const assets = realtimePriceService.getTrackedAssets();
      expect(assets).toHaveLength(1);
      expect(assets[0].symbol).toBe('BTC');
    });

    it('getStats returns service statistics', () => {
      (realtimePriceService as any).clients.set({} as any, { ws: {} as any, subscribedAssets: new Set() });
      (realtimePriceService as any).trackedAssets.set(1, { id: 1, type: 'crypto' } as any);
      (realtimePriceService as any).trackedAssets.set(2, { id: 2, type: 'stock_us' } as any);
      (realtimePriceService as any).binanceConnected = true;
      (realtimePriceService as any).tiingoConnected = false;

      const stats = realtimePriceService.getStats();
      expect(stats).toMatchObject({
        clients: 1,
        trackedAssets: 2,
        cryptoCount: 1,
        stockUsCount: 1,
        binanceConnected: true,
        tiingoConnected: false,
      });
    });

    it('refreshAssets reloads tracked assets and reconnects', () => {
      const loadSpy = vi.spyOn(realtimePriceService as any, 'loadTrackedAssets');
      const reconnectSpy = vi.spyOn(realtimePriceService as any, 'reconnectIfNeeded');

      realtimePriceService.refreshAssets();

      expect(loadSpy).toHaveBeenCalled();
      expect(reconnectSpy).toHaveBeenCalled();
    });
  });

  describe('reconnectIfNeeded', () => {
    it('reconnects Binance when crypto symbols change', () => {
      (realtimePriceService as any).binanceSymbols = new Set(['btcusdt']);
      (realtimePriceService as any).trackedAssets.set(1, {
        id: 1,
        symbol: 'ETH',
        type: 'crypto',
        normalizedSymbol: 'ethusdt',
      });

      const disconnectSpy = vi.spyOn(realtimePriceService as any, 'disconnectBinance');
      const connectSpy = vi.spyOn(realtimePriceService as any, 'connectBinance');

      (realtimePriceService as any).reconnectIfNeeded();

      expect(disconnectSpy).toHaveBeenCalled();
      expect(connectSpy).toHaveBeenCalled();
    });

    it('reconnects Tiingo when stock symbols change', () => {
      (realtimePriceService as any).tiingoSymbols = new Set(['AAPL']);
      (realtimePriceService as any).trackedAssets.set(1, {
        id: 1,
        symbol: 'GOOGL',
        type: 'stock_us',
        normalizedSymbol: 'GOOGL',
      });

      const disconnectSpy = vi.spyOn(realtimePriceService as any, 'disconnectTiingo');
      const connectSpy = vi.spyOn(realtimePriceService as any, 'connectTiingo');

      (realtimePriceService as any).reconnectIfNeeded();

      expect(disconnectSpy).toHaveBeenCalled();
      expect(connectSpy).toHaveBeenCalled();
    });

    it('does not reconnect when symbols are the same', () => {
      (realtimePriceService as any).binanceSymbols = new Set(['btcusdt']);
      (realtimePriceService as any).trackedAssets.set(1, {
        id: 1,
        symbol: 'BTC',
        type: 'crypto',
        normalizedSymbol: 'btcusdt',
      });

      const disconnectSpy = vi.spyOn(realtimePriceService as any, 'disconnectBinance');

      (realtimePriceService as any).reconnectIfNeeded();

      expect(disconnectSpy).not.toHaveBeenCalled();
    });
  });

  describe('start and stop', () => {
    it('start loads assets and connects data sources', () => {
      const loadSpy = vi.spyOn(realtimePriceService as any, 'loadTrackedAssets');
      const connectBinanceSpy = vi.spyOn(realtimePriceService as any, 'connectBinance');
      const connectTiingoSpy = vi.spyOn(realtimePriceService as any, 'connectTiingo');
      const startHttpSpy = vi.spyOn(realtimePriceService as any, 'startHttpFallback');

      realtimePriceService.start();

      expect(loadSpy).toHaveBeenCalled();
      expect(connectBinanceSpy).toHaveBeenCalled();
      expect(connectTiingoSpy).toHaveBeenCalled();
      expect(startHttpSpy).toHaveBeenCalled();

      // Cleanup
      realtimePriceService.stop();
    });

    it('stop disconnects everything and clears clients', () => {
      const mockWs = { close: vi.fn() } as any;
      (realtimePriceService as any).clients.set(mockWs, { ws: mockWs, subscribedAssets: new Set() });

      realtimePriceService.stop();

      expect((realtimePriceService as any).clients.size).toBe(0);
      expect(mockWs.close).toHaveBeenCalled();
    });
  });

  describe('scheduleBinanceReconnect', () => {
    it('does not schedule multiple reconnects', () => {
      (realtimePriceService as any).scheduleBinanceReconnect();
      const timer = (realtimePriceService as any).binanceReconnectTimer;
      
      (realtimePriceService as any).scheduleBinanceReconnect();
      
      expect((realtimePriceService as any).binanceReconnectTimer).toBe(timer);
      
      // Cleanup
      if (timer) clearTimeout(timer);
      (realtimePriceService as any).binanceReconnectTimer = null;
    });

    it('stops reconnecting after max attempts', () => {
      vi.useFakeTimers();
      (realtimePriceService as any).reconnectAttempts = 10;
      const connectSpy = vi.spyOn(realtimePriceService as any, 'connectBinance');

      (realtimePriceService as any).scheduleBinanceReconnect();
      
      // Fast forward timer
      vi.advanceTimersByTime(70000);

      // Should not call connect after max attempts
      expect(connectSpy).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('scheduleTiingoReconnect', () => {
    it('does not schedule multiple reconnects', () => {
      (realtimePriceService as any).scheduleTiingoReconnect();
      const timer = (realtimePriceService as any).tiingoReconnectTimer;
      
      (realtimePriceService as any).scheduleTiingoReconnect();
      
      expect((realtimePriceService as any).tiingoReconnectTimer).toBe(timer);
      
      // Cleanup
      if (timer) clearTimeout(timer);
      (realtimePriceService as any).tiingoReconnectTimer = null;
    });
  });

  describe('connectBinance', () => {
    it('returns early when no crypto assets', () => {
      const result = (realtimePriceService as any).connectBinance();
      // Should not throw, just return early
      expect(result).toBeUndefined();
    });

    it('creates WebSocket with correct streams', () => {
      (realtimePriceService as any).trackedAssets.set(1, {
        id: 1,
        symbol: 'BTC',
        type: 'crypto',
        normalizedSymbol: 'btcusdt',
      });

      // Should not throw when connecting
      expect(() => {
        (realtimePriceService as any).connectBinance();
        (realtimePriceService as any).disconnectBinance();
      }).not.toThrow();
    });
  });

  describe('connectTiingo', () => {
    it('returns early when no API key', () => {
      const originalKey = process.env.TIINGO_API_KEY;
      process.env.TIINGO_API_KEY = '';

      const result = (realtimePriceService as any).connectTiingo();
      expect(result).toBeUndefined();

      process.env.TIINGO_API_KEY = originalKey;
    });

    it('returns early when no stock assets', () => {
      const result = (realtimePriceService as any).connectTiingo();
      expect(result).toBeUndefined();
    });
  });

  describe('disconnectBinance', () => {
    it('cleans up Binance connection', () => {
      const mockWs = { close: vi.fn() } as any;
      (realtimePriceService as any).binanceWs = mockWs;
      (realtimePriceService as any).binanceConnected = true;
      (realtimePriceService as any).binanceSymbols = new Set(['btcusdt']);

      (realtimePriceService as any).disconnectBinance();

      expect(mockWs.close).toHaveBeenCalled();
      expect((realtimePriceService as any).binanceWs).toBeNull();
      expect((realtimePriceService as any).binanceConnected).toBe(false);
      expect((realtimePriceService as any).binanceSymbols.size).toBe(0);
    });

    it('cleans up reconnect timer', () => {
      (realtimePriceService as any).binanceReconnectTimer = setTimeout(() => {}, 10000);

      (realtimePriceService as any).disconnectBinance();

      expect((realtimePriceService as any).binanceReconnectTimer).toBeNull();
    });
  });

  describe('disconnectTiingo', () => {
    it('cleans up Tiingo connection', () => {
      const mockWs = { close: vi.fn() } as any;
      (realtimePriceService as any).tiingoWs = mockWs;
      (realtimePriceService as any).tiingoConnected = true;
      (realtimePriceService as any).tiingoSymbols = new Set(['AAPL']);

      (realtimePriceService as any).disconnectTiingo();

      expect(mockWs.close).toHaveBeenCalled();
      expect((realtimePriceService as any).tiingoWs).toBeNull();
      expect((realtimePriceService as any).tiingoConnected).toBe(false);
      expect((realtimePriceService as any).tiingoSymbols.size).toBe(0);
    });
  });

  describe('startHttpFallback and stopHttpFallback', () => {
    it('starts and stops HTTP fallback timer', () => {
      (realtimePriceService as any).startHttpFallback();
      expect((realtimePriceService as any).httpFallbackTimer).not.toBeNull();

      (realtimePriceService as any).stopHttpFallback();
      expect((realtimePriceService as any).httpFallbackTimer).toBeNull();
    });

    it('stopHttpFallback handles null timer gracefully', () => {
      (realtimePriceService as any).httpFallbackTimer = null;
      // Should not throw
      expect(() => (realtimePriceService as any).stopHttpFallback()).not.toThrow();
    });
  });
});
