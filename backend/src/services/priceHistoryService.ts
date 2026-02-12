import { eq, and, gte, lte, min, max, isNull, sql, inArray } from 'drizzle-orm';
import { getDB, priceSnapshots, holdings, assets, transactions, priceHistory } from '../db/index.js';
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

let lastPriceTimestampMs = 0;

function toSqliteDateTimeMs(date: Date): string {
  const iso = date.toISOString(); // YYYY-MM-DDTHH:MM:SS.sssZ
  return iso.slice(0, 23).replace('T', ' '); // YYYY-MM-DD HH:MM:SS.sss
}

/**
 * Record a daily snapshot of the portfolio value
 * This should be called periodically (e.g., once per day)
 */
export async function recordDailySnapshot(userId: number): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const db = getDB();

  // Check if we already have a snapshot for today
  const existing = db.select({ id: priceSnapshots.id })
    .from(priceSnapshots)
    .where(and(
      eq(priceSnapshots.snapshotDate, today),
      eq(priceSnapshots.userId, userId)
    ))
    .get();

  if (existing) {
    console.log(`Snapshot for ${today} already exists, skipping`);
    return;
  }

  // Get all holdings with current prices
  const holdingList = db.select({
    quantity: holdings.quantity,
    avgCost: holdings.avgCost,
    symbol: assets.symbol,
    type: assets.type,
    currency: assets.currency,
    currentPrice: assets.currentPrice,
  })
    .from(holdings)
    .innerJoin(assets, eq(holdings.assetId, assets.id))
    .where(eq(holdings.userId, userId))
    .all();

  const usdcny = await getUSDCNYRate() || 7.2;

  let totalValueUSD = 0;
  let totalCostUSD = 0;

  for (const h of holdingList) {
    let currentPrice = h.currentPrice;

    // If no cached price, try to fetch (but don't wait)
    if (!currentPrice) {
      currentPrice = await getAssetPrice(h.symbol, h.type);
    }

    if (currentPrice) {
      let valueUSD = currentPrice * h.quantity;
      let costUSD = h.avgCost * h.quantity;

      if (h.currency === 'CNY') {
        valueUSD = valueUSD / usdcny;
        costUSD = costUSD / usdcny;
      }

      totalValueUSD += valueUSD;
      totalCostUSD += costUSD;
    }
  }

  // Insert snapshot
  db.insert(priceSnapshots)
    .values({
      userId,
      snapshotDate: today,
      totalValueUsd: totalValueUSD,
      totalCostUsd: totalCostUSD,
      usdcnyRate: usdcny,
    })
    .run();

  console.log(`Recorded portfolio snapshot for ${today}: $${totalValueUSD.toFixed(2)}`);
}

/**
 * Get portfolio value history for a given time range
 */
export async function getPortfolioHistory(range: string, userId: number): Promise<PortfolioSnapshot[]> {
  const { startDate, endDate } = getDateRange(range, userId);
  const db = getDB();

  // Get snapshots within the date range
  const snapshots = db.select({
    date: priceSnapshots.snapshotDate,
    value: priceSnapshots.totalValueUsd,
    cost: priceSnapshots.totalCostUsd,
  })
    .from(priceSnapshots)
    .where(and(
      eq(priceSnapshots.userId, userId),
      gte(priceSnapshots.snapshotDate, startDate),
      lte(priceSnapshots.snapshotDate, endDate)
    ))
    .orderBy(priceSnapshots.snapshotDate)
    .all();

  // If we don't have enough snapshots, we need to estimate from transaction history
  if (snapshots.length < 2) {
    return await generatePortfolioHistoryFromTransactions(startDate, endDate, userId);
  }

  // Calculate P&L for each snapshot
  return snapshots.map(s => ({
    date: s.date,
    value: s.value,
    cost: s.cost || 0,
    pnl: s.value - (s.cost || 0)
  }));
}

/**
 * Get price history for a specific asset (global, not user-specific)
 * Price history is shared across all users since prices are the same for everyone
 * Prefers global prices (user_id = NULL), falls back to user-specific prices
 */
export async function getAssetHistory(assetId: number, range: string, userId: number): Promise<AssetHistoryPoint[]> {
  const { startDate, endDate } = getDateRange(range, userId);
  const db = getDB();

  // First try to get global prices (user_id IS NULL)
  let history = db.select({
    date: sql<string>`DATE(${priceHistory.timestamp})`,
    price: priceHistory.price,
  })
    .from(priceHistory)
    .where(and(
      isNull(priceHistory.userId),
      eq(priceHistory.assetId, assetId),
      gte(sql`DATE(${priceHistory.timestamp})`, startDate),
      lte(sql`DATE(${priceHistory.timestamp})`, endDate)
    ))
    .orderBy(priceHistory.timestamp)
    .all();

  // If no global records found, fall back to any available prices
  if (history.length === 0) {
    history = db.select({
      date: sql<string>`DATE(${priceHistory.timestamp})`,
      price: priceHistory.price,
    })
      .from(priceHistory)
      .where(and(
        eq(priceHistory.assetId, assetId),
        gte(sql`DATE(${priceHistory.timestamp})`, startDate),
        lte(sql`DATE(${priceHistory.timestamp})`, endDate)
      ))
      .orderBy(priceHistory.timestamp)
      .all();
  }

  return history;
}

/**
 * Record a price point for an asset (as global, not user-specific)
 * Prices should be recorded globally since they're the same for everyone
 */
export function recordAssetPrice(assetId: number, price: number, userId: number): void {
  let nowMs = Date.now();
  if (nowMs <= lastPriceTimestampMs) {
    nowMs = lastPriceTimestampMs + 1;
  }
  lastPriceTimestampMs = nowMs;
  const timestamp = toSqliteDateTimeMs(new Date(nowMs));
  const db = getDB();

  // Record as global price (user_id = NULL) since prices are the same for all users
  db.insert(priceHistory)
    .values({
      userId: null,
      assetId,
      price,
      timestamp,
    })
    .run();
}

/**
 * Record a price point at a specific timestamp (ms since epoch).
 * Uses INSERT OR IGNORE to avoid duplicate (asset_id, timestamp).
 * Records as global price (user_id = NULL) since prices are the same for all users
 */
export function recordAssetPriceAt(assetId: number, price: number, timestampMs: number, userId: number): void {
  const timestamp = toSqliteDateTimeMs(new Date(timestampMs));
  const db = getDB();

  // Record as global price (user_id = NULL) since prices are the same for all users
  // Using onConflictDoNothing for INSERT OR IGNORE behavior
  try {
    db.insert(priceHistory)
      .values({
        userId: null,
        assetId,
        price,
        timestamp,
      })
      .run();
  } catch (e: any) {
    // Ignore unique constraint violations
    if (!e.message?.includes('UNIQUE')) {
      throw e;
    }
  }
}

/**
 * Get the date range based on the range string
 */
function getDateRange(range: string, _userId?: number): { startDate: string; endDate: string } {
  const endDate = new Date();
  const startDate = new Date();
  const db = getDB();

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
      if (_userId) {
        const earliest = db.select({ minDate: min(transactions.date) })
          .from(transactions)
          .where(eq(transactions.userId, _userId))
          .get();

        if (earliest?.minDate) {
          return { startDate: earliest.minDate, endDate: endDate.toISOString().split('T')[0] };
        }
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
  endDate: string,
  userId: number
): Promise<PortfolioSnapshot[]> {
  const db = getDB();

  // Get all transactions in the date range
  const txnList = db.select({
    date: transactions.date,
    type: transactions.type,
    quantity: transactions.quantity,
    price: transactions.price,
    currency: assets.currency,
  })
    .from(transactions)
    .innerJoin(assets, eq(transactions.assetId, assets.id))
    .where(and(
      eq(transactions.userId, userId),
      gte(transactions.date, startDate),
      lte(transactions.date, endDate)
    ))
    .orderBy(transactions.date)
    .all();

  // Get current holdings for reference
  const holdingList = db.select({
    quantity: holdings.quantity,
    avgCost: holdings.avgCost,
    assetId: assets.id,
    currency: assets.currency,
  })
    .from(holdings)
    .innerJoin(assets, eq(holdings.assetId, assets.id))
    .where(eq(holdings.userId, userId))
    .all();

  // Get asset IDs from both holdings and transactions
  const holdingAssetIds = holdingList.map(h => h.assetId);
  const txnAssetIds = db.select({ assetId: transactions.assetId })
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .all()
    .map(t => t.assetId)
    .filter((id): id is number => id !== null);

  const allAssetIds = [...new Set([...holdingAssetIds, ...txnAssetIds])];

  // Get current prices for relevant assets
  const assetList = allAssetIds.length > 0
    ? db.select({
        id: assets.id,
        symbol: assets.symbol,
        type: assets.type,
        currentPrice: assets.currentPrice,
        currency: assets.currency,
      })
        .from(assets)
        .where(inArray(assets.id, allAssetIds))
        .all()
    : [];

  const usdcny = await getUSDCNYRate() || 7.2;

  // Calculate current total value and cost
  let currentTotalValue = 0;
  let currentTotalCost = 0;

  const assetMap = new Map(assetList.map(a => [a.id, a]));

  for (const h of holdingList) {
    const asset = assetMap.get(h.assetId);
    if (asset && asset.currentPrice) {
      let value = asset.currentPrice * h.quantity;
      let cost = h.avgCost * h.quantity;

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
export function getAvailableHistoryRange(userId: number): { earliest: string | null; latest: string | null } {
  const db = getDB();

  const result = db.select({
    earliest: min(priceSnapshots.snapshotDate),
    latest: max(priceSnapshots.snapshotDate),
  })
    .from(priceSnapshots)
    .where(eq(priceSnapshots.userId, userId))
    .get();

  if (!result) {
    return { earliest: null, latest: null };
  }

  return {
    earliest: result.earliest || null,
    latest: result.latest || null
  };
}

/**
 * Delete old snapshots (for data cleanup)
 */
export function cleanupOldSnapshots(keepDays: number = 365 * 5): void {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - keepDays);
  const db = getDB();

  db.delete(priceSnapshots)
    .where(lte(priceSnapshots.snapshotDate, cutoffDate.toISOString().split('T')[0]))
    .run();
}
