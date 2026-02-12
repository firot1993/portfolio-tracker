import { eq, and, lt, count, sql, inArray } from 'drizzle-orm';
import { getDB, getSqliteDB, collectorRuns, backfillJobs, priceHistory, priceSnapshots, holdings, assets } from '../db/index.js';
import { getUSDCNYRate, getHistoricalDailyPrices } from '../services/priceService.js';

type RunStatus = 'success' | 'failed' | 'partial';
type RunType = 'daily' | 'hourly' | 'backfill';

// Configuration
const PRICE_FETCH_RETRIES = 3;
const RETRY_DELAY_BASE_MS = 1000;
const DEFAULT_DATA_RETENTION_DAYS = 365 * 2; // 2 years

function getTodayKey(date = new Date()): string {
  return date.toISOString().split('T')[0];
}

function hasSuccessfulRun(runType: RunType, runKey: string, userId: number): boolean {
  const db = getDB();
  const existing = db.select({ id: collectorRuns.id })
    .from(collectorRuns)
    .where(and(
      eq(collectorRuns.userId, userId),
      eq(collectorRuns.runType, runType),
      eq(collectorRuns.runKey, runKey),
      eq(collectorRuns.status, 'success')
    ))
    .get();
  return !!existing;
}

function startRun(runType: RunType, runKey: string, userId: number): number {
  const db = getDB();

  const existing = db.select({ id: collectorRuns.id })
    .from(collectorRuns)
    .where(and(
      eq(collectorRuns.userId, userId),
      eq(collectorRuns.runType, runType),
      eq(collectorRuns.runKey, runKey)
    ))
    .get();

  if (existing) {
    db.update(collectorRuns)
      .set({
        status: 'running',
        startedAt: sql`datetime("now")`,
        finishedAt: null,
        errorMessage: null,
      })
      .where(eq(collectorRuns.id, existing.id))
      .run();
    return existing.id;
  }

  const result = db.insert(collectorRuns)
    .values({
      userId,
      runType,
      runKey,
      status: 'running',
      startedAt: new Date().toISOString().replace('T', ' ').split('.')[0],
    })
    .returning({ id: collectorRuns.id })
    .get();

  if (!result?.id) {
    throw new Error('Failed to create collector run');
  }
  return result.id;
}

function finishRun(id: number, status: RunStatus, errorMessage?: string): void {
  const db = getDB();
  db.update(collectorRuns)
    .set({
      status,
      finishedAt: sql`datetime("now")`,
      errorMessage: errorMessage || null,
    })
    .where(eq(collectorRuns.id, id))
    .run();
}

function getRangeDates(range: string): Date[] {
  const end = new Date();
  const start = new Date();

  switch (range) {
    case '1Y':
      start.setFullYear(end.getFullYear() - 1);
      break;
    case '3Y':
      start.setFullYear(end.getFullYear() - 3);
      break;
    case '5Y':
      start.setFullYear(end.getFullYear() - 5);
      break;
    case 'ALL':
      start.setFullYear(end.getFullYear() - 10);
      break;
    default:
      throw new Error(`Invalid range: ${range}. Use 1Y, 3Y, 5Y, or ALL.`);
  }

  const dates: Date[] = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const endDate = new Date(end);
  endDate.setHours(0, 0, 0, 0);

  while (cursor <= endDate) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function toSqliteDateTime(date: Date): string {
  const iso = date.toISOString();
  return iso.slice(0, 19).replace('T', ' ');
}

async function recordPriceHistory(assetId: number, price: number, timestamp: Date, userId: number): Promise<void> {
  const db = getDB();
  try {
    db.insert(priceHistory)
      .values({
        userId,
        assetId,
        price,
        timestamp: toSqliteDateTime(timestamp),
      })
      .run();
  } catch (e: any) {
    // Ignore unique constraint violations (INSERT OR IGNORE behavior)
    if (!e.message?.includes('UNIQUE')) {
      throw e;
    }
  }
}

async function recordSnapshotForDate(snapshotDate: string, usdcny: number, userId: number): Promise<void> {
  const db = getDB();

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

  let totalValueUSD = 0;
  let totalCostUSD = 0;

  for (const h of holdingList) {
    const currentPrice = h.currentPrice;
    if (!currentPrice) continue;

    let valueUSD = currentPrice * h.quantity;
    let costUSD = h.avgCost * h.quantity;

    if (h.currency === 'CNY') {
      valueUSD = valueUSD / usdcny;
      costUSD = costUSD / usdcny;
    }

    totalValueUSD += valueUSD;
    totalCostUSD += costUSD;
  }

  db.insert(priceSnapshots)
    .values({
      userId,
      snapshotDate,
      totalValueUsd: totalValueUSD,
      totalCostUsd: totalCostUSD,
      usdcnyRate: usdcny,
    })
    .run();
}

// Retry helper with exponential backoff
async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = PRICE_FETCH_RETRIES,
  retryDelayMs: number = RETRY_DELAY_BASE_MS
): Promise<T> {
  let lastError: Error | undefined;

  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (i < retries - 1) {
        const delay = retryDelayMs * Math.pow(2, i);
        console.log(`[Collector] Retry ${i + 1}/${retries} after ${delay}ms: ${error?.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Retry failed');
}

export async function runDailyCollector(userId: number): Promise<void> {
  const runKey = getTodayKey();
  if (hasSuccessfulRun('daily', runKey, userId)) {
    console.log(`[Collector] Daily run ${runKey} already completed.`);
    return;
  }

  const runId = startRun('daily', runKey, userId);
  let status: RunStatus = 'success';
  let errorMessage: string | undefined;
  const startTime = Date.now();

  console.log(`[Collector] Starting daily collector for ${runKey} (user ${userId})`);

  try {
    const usdcny = await withRetry(getUSDCNYRate);
    if (!usdcny) {
      throw new Error('Failed to fetch USD/CNY rate after retries');
    }
    console.log(`[Collector] USD/CNY rate: ${usdcny}`);
    console.log('[Collector] Skipping bulk price fetch (realtime service updates prices).');

    await recordSnapshotForDate(runKey, usdcny, userId);
    console.log(`[Collector] Snapshot recorded for ${runKey}`);
  } catch (err: any) {
    status = 'failed';
    errorMessage = err?.message || 'Collector failed';
    console.error(`[Collector] Daily run failed: ${errorMessage}`);
  } finally {
    finishRun(runId, status, errorMessage);
    const duration = Date.now() - startTime;
    console.log(`[Collector] Daily run completed in ${duration}ms with status: ${status}`);
  }
}

export async function runBackfill(assetId: number, range: string, userId: number): Promise<{ status: RunStatus; errorMessage?: string }> {
  const db = getDB();

  const asset = db.select({ id: assets.id, symbol: assets.symbol, type: assets.type })
    .from(assets)
    .where(eq(assets.id, assetId))
    .get();

  if (!asset) {
    throw new Error('Asset not found');
  }

  const dates = getRangeDates(range);
  if (dates.length === 0) {
    throw new Error('Invalid backfill date range: no dates generated');
  }

  const runKey = `${assetId}:${range}:${dates[0].toISOString().split('T')[0]}`;
  if (hasSuccessfulRun('backfill', runKey, userId)) {
    console.log(`[Collector] Backfill ${runKey} already completed.`);
    return { status: 'success' };
  }

  const runId = startRun('backfill', runKey, userId);
  let status: RunStatus = 'success';
  let errorMessage: string | undefined;
  const startTime = Date.now();

  console.log(`[Collector] Starting backfill for ${asset.symbol} (${range})`);

  try {
    const startDate = dates[0].toISOString().split('T')[0];
    const endDate = dates[dates.length - 1].toISOString().split('T')[0];

    const points = await withRetry(() => getHistoricalDailyPrices(asset.symbol, asset.type, startDate, endDate));
    if (points.length === 0) {
      throw new Error('No historical data returned');
    }

    let validPoints = 0;
    let invalidPoints = 0;

    for (const point of points) {
      // Parse date in local timezone to avoid UTC shift issues
      const [year, month, day] = point.date.split('-').map(Number);
      const ts = new Date(year, month - 1, day);

      if (Number.isFinite(point.price) && point.price > 0) {
        await recordPriceHistory(asset.id, point.price, ts, userId);
        validPoints++;
      } else {
        invalidPoints++;
        console.warn(`[Collector] Invalid price for ${asset.symbol} on ${point.date}: ${point.price}`);
      }
    }

    console.log(`[Collector] Backfill complete: ${validPoints} valid, ${invalidPoints} invalid`);

    if (invalidPoints > 0) {
      status = 'partial';
      errorMessage = `${invalidPoints} prices were invalid`;
    }
  } catch (err: any) {
    status = 'failed';
    errorMessage = err?.message || 'Backfill failed';
    console.error(`[Collector] Backfill failed for ${asset.symbol}: ${errorMessage}`);
    throw err; // Re-throw so caller knows it failed
  } finally {
    finishRun(runId, status, errorMessage);
    const duration = Date.now() - startTime;
    console.log(`[Collector] Backfill completed in ${duration}ms with status: ${status}`);
  }

  return { status, errorMessage };
}

export async function runQueuedBackfills(userId: number): Promise<void> {
  const db = getDB();

  const jobs = db.select({
    id: backfillJobs.id,
    assetId: backfillJobs.assetId,
    range: backfillJobs.range,
  })
    .from(backfillJobs)
    .where(and(
      eq(backfillJobs.userId, userId),
      eq(backfillJobs.status, 'queued')
    ))
    .orderBy(backfillJobs.requestedAt)
    .limit(5)
    .all();

  console.log(`[Collector] Processing ${jobs.length} backfill jobs for user ${userId}`);

  for (const job of jobs) {
    // Atomic claim: only update if still queued
    const result = db.update(backfillJobs)
      .set({ status: 'running' })
      .where(and(
        eq(backfillJobs.id, job.id),
        eq(backfillJobs.status, 'queued')
      ))
      .run();

    if (result.changes === 0) {
      console.log(`[Collector] Job ${job.id} already claimed by another process`);
      continue; // Another process claimed it
    }

    console.log(`[Collector] Claimed job ${job.id} (asset ${job.assetId}, range ${job.range})`);

    let jobStatus: RunStatus = 'success';
    let jobError: string | undefined;

    try {
      const backfillResult = await runBackfill(job.assetId, job.range, userId);
      jobStatus = backfillResult.status;
      jobError = backfillResult.errorMessage;
      console.log(`[Collector] Job ${job.id} completed with status: ${jobStatus}`);
    } catch (err: any) {
      jobStatus = 'failed';
      jobError = err?.message || 'Backfill failed';
      console.error(`[Collector] Job ${job.id} failed: ${jobError}`);
    }

    db.update(backfillJobs)
      .set({
        status: jobStatus,
        completedAt: sql`datetime("now")`,
        errorMessage: jobError || null,
      })
      .where(eq(backfillJobs.id, job.id))
      .run();
  }
}

// Data retention cleanup
export async function cleanupOldData(userId: number, retentionDays: number = DEFAULT_DATA_RETENTION_DAYS): Promise<{ deletedHistory: number; deletedSnapshots: number }> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoffIso = cutoffDate.toISOString();
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

  console.log(`[Collector] Cleaning up data older than ${cutoffDateStr} (${retentionDays} days retention) for user ${userId}`);

  const db = getDB();

  const historyResult = db.delete(priceHistory)
    .where(and(
      eq(priceHistory.userId, userId),
      lt(priceHistory.timestamp, cutoffIso)
    ))
    .run();

  const snapshotResult = db.delete(priceSnapshots)
    .where(and(
      eq(priceSnapshots.userId, userId),
      lt(priceSnapshots.snapshotDate, cutoffDateStr)
    ))
    .run();

  const runsResult = db.delete(collectorRuns)
    .where(and(
      eq(collectorRuns.userId, userId),
      lt(collectorRuns.finishedAt, cutoffIso)
    ))
    .run();

  console.log(`[Collector] Cleanup complete: ${historyResult.changes} history, ${snapshotResult.changes} snapshots, ${runsResult.changes} runs deleted`);

  return {
    deletedHistory: historyResult.changes,
    deletedSnapshots: snapshotResult.changes,
  };
}

// Get collector statistics
export function getCollectorStats(userId: number): {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  pendingJobs: number;
  completedJobs: number;
} {
  const db = getDB();

  const totalRuns = db.select({ count: count() })
    .from(collectorRuns)
    .where(eq(collectorRuns.userId, userId))
    .get();

  const successfulRuns = db.select({ count: count() })
    .from(collectorRuns)
    .where(and(
      eq(collectorRuns.userId, userId),
      eq(collectorRuns.status, 'success')
    ))
    .get();

  const failedRuns = db.select({ count: count() })
    .from(collectorRuns)
    .where(and(
      eq(collectorRuns.userId, userId),
      eq(collectorRuns.status, 'failed')
    ))
    .get();

  const pendingJobs = db.select({ count: count() })
    .from(backfillJobs)
    .where(and(
      eq(backfillJobs.userId, userId),
      eq(backfillJobs.status, 'queued')
    ))
    .get();

  const completedJobs = db.select({ count: count() })
    .from(backfillJobs)
    .where(and(
      eq(backfillJobs.userId, userId),
      inArray(backfillJobs.status, ['success', 'partial', 'failed'])
    ))
    .get();

  return {
    totalRuns: totalRuns?.count ?? 0,
    successfulRuns: successfulRuns?.count ?? 0,
    failedRuns: failedRuns?.count ?? 0,
    pendingJobs: pendingJobs?.count ?? 0,
    completedJobs: completedJobs?.count ?? 0,
  };
}
