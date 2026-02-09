import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { initDB, query, run } from '../db/index.js';
import { runDailyCollector, runBackfill } from '../collector/collector.js';

const mockGetUSDCNYRate = vi.fn().mockResolvedValue(7.2);
const mockGetHistoricalDailyPrices = vi.fn();

vi.mock('../services/priceService.js', () => ({
  getUSDCNYRate: () => mockGetUSDCNYRate(),
  getHistoricalDailyPrices: (...args: any[]) => mockGetHistoricalDailyPrices(...args),
}));

describe('Collector', () => {
  beforeAll(async () => {
    await initDB(true);
  });

  beforeEach(() => {
    mockGetUSDCNYRate.mockClear();
    mockGetHistoricalDailyPrices.mockClear();

    run('DELETE FROM collector_runs');
    run('DELETE FROM price_snapshots');
    run('DELETE FROM price_history');
    run('DELETE FROM transactions');
    run('DELETE FROM holdings');
    run('DELETE FROM assets');
  });

  it('runDailyCollector records a snapshot without bulk price fetching', async () => {
    run(
      'INSERT INTO assets (id, symbol, name, type, currency, current_price) VALUES (?, ?, ?, ?, ?, ?)',
      [1, 'BTC', 'Bitcoin', 'crypto', 'USD', 50000]
    );
    run(
      'INSERT INTO holdings (asset_id, quantity, avg_cost) VALUES (?, ?, ?)',
      [1, 0.5, 30000]
    );

    await runDailyCollector();

    const snapshots = query('SELECT * FROM price_snapshots');
    expect(snapshots.length).toBe(1);
    expect(mockGetUSDCNYRate).toHaveBeenCalledTimes(1);
    expect(mockGetHistoricalDailyPrices).not.toHaveBeenCalled();
  });

  it('runBackfill uses historical API and writes price history', async () => {
    run(
      'INSERT INTO assets (id, symbol, name, type, currency) VALUES (?, ?, ?, ?, ?)',
      [2, 'NVDA', 'NVIDIA', 'stock_us', 'USD']
    );

    mockGetHistoricalDailyPrices.mockResolvedValue([
      { date: '2026-01-01', price: 100 },
      { date: '2026-01-02', price: -1 },
    ]);

    const result = await runBackfill(2, '1Y');
    expect(result.status).toBe('partial');
    expect(mockGetHistoricalDailyPrices).toHaveBeenCalledTimes(1);

    const history = query('SELECT * FROM price_history WHERE asset_id = 2');
    expect(history.length).toBe(1);
  });
});
