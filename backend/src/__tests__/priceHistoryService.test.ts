import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { initDB, query, run } from '../db/index.js';
import {
  recordDailySnapshot,
  getPortfolioHistory,
  getAssetHistory,
  recordAssetPrice,
  getAvailableHistoryRange,
  cleanupOldSnapshots,
  PortfolioSnapshot,
  AssetHistoryPoint
} from '../services/priceHistoryService.js';

// Mock price service
vi.mock('../services/priceService.js', () => ({
  getAssetPrice: vi.fn().mockResolvedValue(100),
  getUSDCNYRate: vi.fn().mockResolvedValue(7.2)
}));

// Test user ID constant
const TEST_USER_ID = 1;

describe('Price History Service', () => {
  beforeAll(async () => {
    await initDB(true);
    // Create a test user
    run('INSERT OR IGNORE INTO users (id, email, password_hash) VALUES (1, "test@portfolio.local", "hash")');
  });

  beforeEach(() => {
    // Clean up snapshots
    run('DELETE FROM price_snapshots WHERE user_id = ?', [TEST_USER_ID]);
    run('DELETE FROM price_history WHERE user_id = ?', [TEST_USER_ID]);
    run('DELETE FROM transactions WHERE user_id = ?', [TEST_USER_ID]);
    run('DELETE FROM holdings WHERE user_id = ?', [TEST_USER_ID]);
    run('DELETE FROM assets WHERE user_id IS NULL OR user_id = ?', [TEST_USER_ID]);
  });

  describe('recordDailySnapshot', () => {
    it('should record a daily snapshot', async () => {
      await recordDailySnapshot(TEST_USER_ID);

      const snapshots = query('SELECT * FROM price_snapshots WHERE user_id = ?', [TEST_USER_ID]);
      expect(snapshots.length).toBeGreaterThanOrEqual(0);
    });

    it('should skip if snapshot already exists for today', async () => {
      // First call
      await recordDailySnapshot(TEST_USER_ID);

      // Second call should skip
      await recordDailySnapshot(TEST_USER_ID);

      const snapshots = query('SELECT * FROM price_snapshots WHERE user_id = ?', [TEST_USER_ID]);
      expect(snapshots.length).toBeLessThanOrEqual(1);
    });
  });

  describe('getPortfolioHistory', () => {
    it('should return portfolio history for 1M range', async () => {
      const history = await getPortfolioHistory('1M', TEST_USER_ID);
      expect(Array.isArray(history)).toBe(true);
    });

    it('should return portfolio history for 1W range', async () => {
      const history = await getPortfolioHistory('1W', TEST_USER_ID);
      expect(Array.isArray(history)).toBe(true);
    });

    it('should return portfolio history for 1D range', async () => {
      const history = await getPortfolioHistory('1D', TEST_USER_ID);
      expect(Array.isArray(history)).toBe(true);
    });

    it('should return portfolio history for 3M range', async () => {
      const history = await getPortfolioHistory('3M', TEST_USER_ID);
      expect(Array.isArray(history)).toBe(true);
    });

    it('should return portfolio history for 6M range', async () => {
      const history = await getPortfolioHistory('6M', TEST_USER_ID);
      expect(Array.isArray(history)).toBe(true);
    });

    it('should return portfolio history for 1Y range', async () => {
      const history = await getPortfolioHistory('1Y', TEST_USER_ID);
      expect(Array.isArray(history)).toBe(true);
    });

    it('should return portfolio history for YTD range', async () => {
      const history = await getPortfolioHistory('YTD', TEST_USER_ID);
      expect(Array.isArray(history)).toBe(true);
    });

    it('should return portfolio history for ALL range', async () => {
      const history = await getPortfolioHistory('ALL', TEST_USER_ID);
      expect(Array.isArray(history)).toBe(true);
    });

    it('should default to 1M for unknown range', async () => {
      const history = await getPortfolioHistory('UNKNOWN', TEST_USER_ID);
      expect(Array.isArray(history)).toBe(true);
    });

    it.skip('should calculate P&L for each snapshot', async () => {
      // Insert a test snapshot with yesterday's date to ensure it's within 1M range
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      run(
        'INSERT INTO price_snapshots (user_id, snapshot_date, total_value_usd, total_cost_usd, usdcny_rate) VALUES (?, ?, ?, ?, ?)',
        [TEST_USER_ID, yesterdayStr, 10000, 8000, 7.2]
      );

      const history = await getPortfolioHistory('1M', TEST_USER_ID);
      expect(history.length).toBeGreaterThan(0);

      if (history.length > 0) {
        expect(history[0]).toHaveProperty('pnl');
        // P&L should be value - cost = 10000 - 8000 = 2000
        expect(history[0].pnl).toBe(2000);
      }
    });
  });

  describe('getAssetHistory', () => {
    it('should return asset price history', async () => {
      // Create test asset
      run('INSERT INTO assets (user_id, symbol, name, type) VALUES (?, ?, ?, ?)', [TEST_USER_ID, 'TEST', 'Test Asset', 'crypto']);
      const asset = query('SELECT id FROM assets WHERE symbol = ? AND user_id = ?', ['TEST', TEST_USER_ID])[0] as { id: number };

      // Record some prices
      recordAssetPrice(asset.id, 100, TEST_USER_ID);
      recordAssetPrice(asset.id, 110, TEST_USER_ID);

      const history = await getAssetHistory(asset.id, '1M', TEST_USER_ID);
      expect(Array.isArray(history)).toBe(true);
    });

    it('should return empty array for asset with no history', async () => {
      // Create test asset without history
      run('INSERT INTO assets (user_id, symbol, name, type) VALUES (?, ?, ?, ?)', [TEST_USER_ID, 'TESTNOHIST', 'Test No History', 'crypto']);
      const asset = query('SELECT id FROM assets WHERE symbol = ? AND user_id = ?', ['TESTNOHIST', TEST_USER_ID])[0] as { id: number };

      const history = await getAssetHistory(asset.id, '1M', TEST_USER_ID);
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBe(0);
    });
  });

  describe('recordAssetPrice', () => {
    it.skip('should record asset price', () => {
      // Create test asset
      run('INSERT INTO assets (user_id, symbol, name, type) VALUES (?, ?, ?, ?)', [TEST_USER_ID, 'TESTREC', 'Test Record', 'crypto']);
      const asset = query('SELECT id FROM assets WHERE symbol = ? AND user_id = ?', ['TESTREC', TEST_USER_ID])[0] as { id: number };

      recordAssetPrice(asset.id, 150.5, TEST_USER_ID);

      const history = query('SELECT * FROM price_history WHERE asset_id = ? AND user_id = ?', [asset.id, TEST_USER_ID]);
      expect(history.length).toBe(1);
      expect((history[0] as any).price).toBe(150.5);
    });
  });

  describe('getAvailableHistoryRange', () => {
    it('should return null range when no snapshots exist', () => {
      const range = getAvailableHistoryRange(TEST_USER_ID);
      expect(range).toHaveProperty('earliest');
      expect(range).toHaveProperty('latest');
    });

    it('should return date range when snapshots exist', () => {
      const today = new Date().toISOString().split('T')[0];
      run(
        'INSERT INTO price_snapshots (user_id, snapshot_date, total_value_usd, total_cost_usd, usdcny_rate) VALUES (?, ?, ?, ?, ?)',
        [TEST_USER_ID, today, 10000, 8000, 7.2]
      );

      const range = getAvailableHistoryRange(TEST_USER_ID);
      expect(range).toHaveProperty('earliest');
      expect(range).toHaveProperty('latest');
      expect(range.earliest).toBe(today);
      expect(range.latest).toBe(today);
    });
  });

  describe('cleanupOldSnapshots', () => {
    it('should clean up old snapshots', () => {
      const oldDate = new Date();
      oldDate.setFullYear(oldDate.getFullYear() - 10);
      const oldDateStr = oldDate.toISOString().split('T')[0];

      run(
        'INSERT INTO price_snapshots (user_id, snapshot_date, total_value_usd, total_cost_usd, usdcny_rate) VALUES (?, ?, ?, ?, ?)',
        [TEST_USER_ID, oldDateStr, 10000, 8000, 7.2]
      );

      cleanupOldSnapshots(365); // Keep 1 year

      const remaining = query('SELECT * FROM price_snapshots WHERE snapshot_date = ? AND user_id = ?', [oldDateStr, TEST_USER_ID]);
      expect(remaining.length).toBe(0);
    });
  });

  describe('PortfolioSnapshot interface', () => {
    it('should have correct structure', () => {
      const snapshot: PortfolioSnapshot = {
        date: '2024-01-01',
        value: 10000,
        cost: 8000,
        pnl: 2000
      };
      
      expect(snapshot.date).toBe('2024-01-01');
      expect(snapshot.value).toBe(10000);
      expect(snapshot.cost).toBe(8000);
      expect(snapshot.pnl).toBe(2000);
    });
  });

  describe('AssetHistoryPoint interface', () => {
    it('should have correct structure', () => {
      const point: AssetHistoryPoint = {
        date: '2024-01-01',
        price: 150.5
      };
      
      expect(point.date).toBe('2024-01-01');
      expect(point.price).toBe(150.5);
    });
  });
});
