import { query, run, saveDB } from '../db/index.js';
import { getAssetPrice, getUSDCNYRate } from './priceService.js';

export interface PortfolioSnapshot {
  date: string;
  value: number;
  cost: number;
  pnl: number;
}

export interface AssetHistoryPoint {
  date: string;
  price: number;
}

/**
 * Record a daily snapshot of the portfolio value
 * This should be called periodically (e.g., once per day)
 */
export async function recordDailySnapshot(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  
  // Check if we already have a snapshot for today
  const existing = query('SELECT id FROM price_snapshots WHERE snapshot_date = ?', [today]);
  if (existing.length > 0) {
    console.log(`Snapshot for ${today} already exists, skipping`);
    return;
  }

  // Get all holdings with current prices
  const holdings = query(`
    SELECT h.quantity, h.avg_cost, a.symbol, a.type, a.currency, a.current_price
    FROM holdings h
    JOIN assets a ON h.asset_id = a.id
  `);

  const usdcny = await getUSDCNYRate() || 7.2;
  
  let totalValueUSD = 0;
  let totalCostUSD = 0;

  for (const h of holdings as any[]) {
    let currentPrice = h.current_price;
    
    // If no cached price, try to fetch (but don't wait)
    if (!currentPrice) {
      currentPrice = await getAssetPrice(h.symbol, h.type);
    }
    
    if (currentPrice) {
      let valueUSD = currentPrice * h.quantity;
      let costUSD = h.avg_cost * h.quantity;
      
      if (h.currency === 'CNY') {
        valueUSD = valueUSD / usdcny;
        costUSD = costUSD / usdcny;
      }
      
      totalValueUSD += valueUSD;
      totalCostUSD += costUSD;
    }
  }

  // Insert snapshot
  run(
    'INSERT INTO price_snapshots (snapshot_date, total_value_usd, total_cost_usd, usdcny_rate) VALUES (?, ?, ?, ?)',
    [today, totalValueUSD, totalCostUSD, usdcny]
  );
  
  saveDB();
  console.log(`Recorded portfolio snapshot for ${today}: $${totalValueUSD.toFixed(2)}`);
}

/**
 * Get portfolio value history for a given time range
 */
export async function getPortfolioHistory(range: string): Promise<PortfolioSnapshot[]> {
  const { startDate, endDate } = getDateRange(range);
  
  // Get snapshots within the date range
  const snapshots = query(
    'SELECT snapshot_date as date, total_value_usd as value, total_cost_usd as cost FROM price_snapshots WHERE snapshot_date >= ? AND snapshot_date <= ? ORDER BY snapshot_date',
    [startDate, endDate]
  ) as Array<{ date: string; value: number; cost: number }>;

  // If we don't have enough snapshots, we need to estimate from transaction history
  if (snapshots.length < 2) {
    return await generatePortfolioHistoryFromTransactions(startDate, endDate);
  }

  // Calculate P&L for each snapshot
  return snapshots.map(s => ({
    date: s.date,
    value: s.value,
    cost: s.cost,
    pnl: s.value - s.cost
  }));
}

/**
 * Get price history for a specific asset
 */
export async function getAssetHistory(assetId: number, range: string): Promise<AssetHistoryPoint[]> {
  const { startDate, endDate } = getDateRange(range);
  
  const history = query(
    'SELECT DATE(timestamp) as date, price FROM price_history WHERE asset_id = ? AND DATE(timestamp) >= ? AND DATE(timestamp) <= ? ORDER BY timestamp',
    [assetId, startDate, endDate]
  ) as Array<{ date: string; price: number }>;

  return history;
}

/**
 * Record a price point for an asset
 */
export function recordAssetPrice(assetId: number, price: number): void {
  run(
    'INSERT INTO price_history (asset_id, price) VALUES (?, ?)',
    [assetId, price]
  );
  saveDB();
}

/**
 * Get the date range based on the range string
 */
function getDateRange(range: string): { startDate: string; endDate: string } {
  const endDate = new Date();
  const startDate = new Date();
  
  switch (range) {
    case '1D':
      startDate.setDate(endDate.getDate() - 1);
      break;
    case '1W':
      startDate.setDate(endDate.getDate() - 7);
      break;
    case '1M':
      startDate.setMonth(endDate.getMonth() - 1);
      break;
    case '3M':
      startDate.setMonth(endDate.getMonth() - 3);
      break;
    case '6M':
      startDate.setMonth(endDate.getMonth() - 6);
      break;
    case '1Y':
      startDate.setFullYear(endDate.getFullYear() - 1);
      break;
    case 'YTD':
      startDate.setMonth(0);
      startDate.setDate(1);
      break;
    case 'ALL':
      // Get the earliest transaction date
      const earliest = query('SELECT MIN(date) as min_date FROM transactions');
      if (earliest.length > 0 && earliest[0].min_date) {
        return { startDate: earliest[0].min_date as string, endDate: endDate.toISOString().split('T')[0] };
      }
      startDate.setFullYear(endDate.getFullYear() - 5);
      break;
    default:
      startDate.setMonth(endDate.getMonth() - 1); // Default to 1M
  }
  
  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0]
  };
}

/**
 * Generate portfolio history from transaction history when snapshots are not available
 * This is a fallback method that estimates values based on transactions
 */
async function generatePortfolioHistoryFromTransactions(
  startDate: string,
  endDate: string
): Promise<PortfolioSnapshot[]> {
  // Get all transactions in the date range
  const transactions = query(`
    SELECT t.date, t.type, t.quantity, t.price, a.currency
    FROM transactions t
    JOIN assets a ON t.asset_id = a.id
    WHERE t.date >= ? AND t.date <= ?
    ORDER BY t.date
  `, [startDate, endDate]) as Array<{ date: string; type: string; quantity: number; price: number; currency: string }>;

  // Get current holdings for reference
  const holdings = query(`
    SELECT h.quantity, h.avg_cost, a.id as asset_id, a.currency
    FROM holdings h
    JOIN assets a ON h.asset_id = a.id
  `) as Array<{ quantity: number; avg_cost: number; asset_id: number; currency: string }>;

  // Get current prices
  const assets = query('SELECT id, symbol, type, current_price, currency FROM assets') as Array<{
    id: number;
    symbol: string;
    type: string;
    current_price: number;
    currency: string;
  }>;

  const usdcny = await getUSDCNYRate() || 7.2;
  
  // Calculate current total value and cost
  let currentTotalValue = 0;
  let currentTotalCost = 0;
  
  const assetMap = new Map(assets.map(a => [a.id, a]));
  
  for (const h of holdings) {
    const asset = assetMap.get(h.asset_id);
    if (asset && asset.current_price) {
      let value = asset.current_price * h.quantity;
      let cost = h.avg_cost * h.quantity;
      
      if (asset.currency === 'CNY') {
        value = value / usdcny;
        cost = cost / usdcny;
      }
      
      currentTotalValue += value;
      currentTotalCost += cost;
    }
  }

  // Generate daily points (simplified - just return current value for now)
  // In a real implementation, we'd walk backwards through transactions
  return [{
    date: endDate,
    value: currentTotalValue,
    cost: currentTotalCost,
    pnl: currentTotalValue - currentTotalCost
  }];
}

/**
 * Get the available date range for portfolio history
 */
export function getAvailableHistoryRange(): { earliest: string | null; latest: string | null } {
  const result = query('SELECT MIN(snapshot_date) as earliest, MAX(snapshot_date) as latest FROM price_snapshots');
  if (result.length === 0) {
    return { earliest: null, latest: null };
  }
  return {
    earliest: result[0].earliest as string || null,
    latest: result[0].latest as string || null
  };
}

/**
 * Delete old snapshots (for data cleanup)
 */
export function cleanupOldSnapshots(keepDays: number = 365 * 5): void {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - keepDays);
  
  run('DELETE FROM price_snapshots WHERE snapshot_date < ?', [cutoffDate.toISOString().split('T')[0]]);
  saveDB();
}
