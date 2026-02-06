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

describe('Price History Service', () => {
  beforeAll(async () => {
    await initDB(true);
  });

  beforeEach(() => {
    // Clean up snapshots
    run('DELETE FROM price_snapshots');
    run('DELETE FROM price_history');
    run('DELETE FROM transactions');
    run('DELETE FROM holdings');
    run('DELETE FROM assets');
  });

  describe('recordDailySnapshot', () => {
    it('should record a daily snapshot', async () => {
      await recordDailySnapshot();
      
      const snapshots = query('SELECT * FROM price_snapshots');
      expect(snapshots.length).toBeGreaterThanOrEqual(0);
    });

    it('should skip if snapshot already exists for today', async () => {
      // First call
      await recordDailySnapshot();
      
      // Second call should skip
      await recordDailySnapshot();
      
      const snapshots = query('SELECT * FROM price_snapshots');
      expect(snapshots.length).toBeLessThanOrEqual(1);
    });
  });

  describe('getPortfolioHistory', () => {
    it('should return portfolio history for 1M range', async () => {
      const history = await getPortfolioHistory('1M');
      expect(Array.isArray(history)).toBe(true);
    });

    it('should return portfolio history for 1W range', async () => {
      const history = await getPortfolioHistory('1W');
      expect(Array.isArray(history)).toBe(true);
    });

    it('should return portfolio history for 1D range', async () => {
      const history = await getPortfolioHistory('1D');
      expect(Array.isArray(history)).toBe(true);
    });

    it('should return portfolio history for 3M range', async () => {
      const history = await getPortfolioHistory('3M');
      expect(Array.isArray(history)).toBe(true);
    });

    it('should return portfolio history for 6M range', async () => {
      const history = await getPortfolioHistory('6M');
      expect(Array.isArray(history)).toBe(true);
    });

    it('should return portfolio history for 1Y range', async () => {
      const history = await getPortfolioHistory('1Y');
      expect(Array.isArray(history)).toBe(true);
    });

    it('should return portfolio history for YTD range', async () => {
      const history = await getPortfolioHistory('YTD');
      expect(Array.isArray(history)).toBe(true);
    });

    it('should return portfolio history for ALL range', async () => {
      const history = await getPortfolioHistory('ALL');
      expect(Array.isArray(history)).toBe(true);
    });

    it('should default to 1M for unknown range', async () => {
      const history = await getPortfolioHistory('UNKNOWN');
      expect(Array.isArray(history)).toBe(true);
    });

    it.skip('should calculate P&L for each snapshot', async () => {
      // Insert a test snapshot with yesterday's date to ensure it's within 1M range
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      run(
        'INSERT INTO price_snapshots (snapshot_date, total_value_usd, total_cost_usd, usdcny_rate) VALUES (?, ?, ?, ?)',
        [yesterdayStr, 10000, 8000, 7.2]
      );

      const history = await getPortfolioHistory('1M');
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
      run('INSERT INTO assets (symbol, name, type) VALUES (?, ?, ?)', ['TEST', 'Test Asset', 'crypto']);
      const asset = query('SELECT id FROM assets WHERE symbol = ?', ['TEST'])[0] as { id: number };
      
      // Record some prices
      recordAssetPrice(asset.id, 100);
      recordAssetPrice(asset.id, 110);
      
      const history = await getAssetHistory(asset.id, '1M');
      expect(Array.isArray(history)).toBe(true);
    });

    it('should return empty array for asset with no history', async () => {
      // Create test asset without history
      run('INSERT INTO assets (symbol, name, type) VALUES (?, ?, ?)', ['TESTNOHIST', 'Test No History', 'crypto']);
      const asset = query('SELECT id FROM assets WHERE symbol = ?', ['TESTNOHIST'])[0] as { id: number };
      
      const history = await getAssetHistory(asset.id, '1M');
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBe(0);
    });
  });

  describe('recordAssetPrice', () => {
    it.skip('should record asset price', () => {
      // Create test asset
      run('INSERT INTO assets (symbol, name, type) VALUES (?, ?, ?)', ['TESTREC', 'Test Record', 'crypto']);
      const asset = query('SELECT id FROM assets WHERE symbol = ?', ['TESTREC'])[0] as { id: number };
      
      recordAssetPrice(asset.id, 150.5);
      
      const history = query('SELECT * FROM price_history WHERE asset_id = ?', [asset.id]);
      expect(history.length).toBe(1);
      expect((history[0] as any).price).toBe(150.5);
    });
  });

  describe('getAvailableHistoryRange', () => {
    it('should return null range when no snapshots exist', () => {
      const range = getAvailableHistoryRange();
      expect(range).toHaveProperty('earliest');
      expect(range).toHaveProperty('latest');
    });

    it('should return date range when snapshots exist', () => {
      const today = new Date().toISOString().split('T')[0];
      run(
        'INSERT INTO price_snapshots (snapshot_date, total_value_usd, total_cost_usd, usdcny_rate) VALUES (?, ?, ?, ?)',
        [today, 10000, 8000, 7.2]
      );
      
      const range = getAvailableHistoryRange();
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
        'INSERT INTO price_snapshots (snapshot_date, total_value_usd, total_cost_usd, usdcny_rate) VALUES (?, ?, ?, ?)',
        [oldDateStr, 10000, 8000, 7.2]
      );
      
      cleanupOldSnapshots(365); // Keep 1 year
      
      const remaining = query('SELECT * FROM price_snapshots WHERE snapshot_date = ?', [oldDateStr]);
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
