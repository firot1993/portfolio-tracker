import { query, run, saveDB } from '../db/index.js';
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

function getHourKey(date = new Date()): string {
  return date.toISOString().slice(0, 13);
}

function hasSuccessfulRun(runType: RunType, runKey: string, userId: number): boolean {
  const existing = query(
    'SELECT id FROM collector_runs WHERE user_id = ? AND run_type = ? AND run_key = ? AND status = ?',
    [userId, runType, runKey, 'success']
  );
  return existing.length > 0;
}

function startRun(runType: RunType, runKey: string, userId: number): number {
  const existing = query(
    'SELECT id FROM collector_runs WHERE user_id = ? AND run_type = ? AND run_key = ?',
    [userId, runType, runKey]
  );
  if (existing.length > 0) {
    const id = existing[0].id as number;
    run(
      'UPDATE collector_runs SET status = ?, started_at = datetime("now"), finished_at = NULL, error_message = NULL WHERE id = ?',
      ['running', id]
    );
    return id;
  }

  run(
    'INSERT INTO collector_runs (user_id, run_type, run_key, status, started_at) VALUES (?, ?, ?, ?, datetime("now"))',
    [userId, runType, runKey, 'running']
  );
  const result = query('SELECT last_insert_rowid() as id')[0];
  if (!result?.id) {
    throw new Error('Failed to create collector run');
  }
  return result.id as number;
}

function finishRun(id: number, status: RunStatus, errorMessage?: string): void {
  run(
    'UPDATE collector_runs SET status = ?, finished_at = datetime("now"), error_message = ? WHERE id = ?',
    [status, errorMessage || null, id]
  );
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
  run('INSERT OR IGNORE INTO price_history (user_id, asset_id, price, timestamp) VALUES (?, ?, ?, ?)', [
    userId,
    assetId,
    price,
    toSqliteDateTime(timestamp),
  ]);
}

async function recordSnapshotForDate(snapshotDate: string, usdcny: number, userId: number): Promise<void> {
  const holdings = query(`
    SELECT h.quantity, h.avg_cost, a.symbol, a.type, a.currency, a.current_price
    FROM holdings h
    JOIN assets a ON h.asset_id = a.id
    WHERE h.user_id = ?
  `, [userId]);

  let totalValueUSD = 0;
  let totalCostUSD = 0;

  for (const h of holdings as any[]) {
    const currentPrice = h.current_price;
    if (!currentPrice) continue;

    let valueUSD = currentPrice * h.quantity;
    let costUSD = h.avg_cost * h.quantity;

    if (h.currency === 'CNY') {
      valueUSD = valueUSD / usdcny;
      costUSD = costUSD / usdcny;
    }

    totalValueUSD += valueUSD;
    totalCostUSD += costUSD;
  }

  run(
    'INSERT INTO price_snapshots (user_id, snapshot_date, total_value_usd, total_cost_usd, usdcny_rate) VALUES (?, ?, ?, ?, ?)',
    [userId, snapshotDate, totalValueUSD, totalCostUSD, usdcny]
  );
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
    await saveDB();
    console.log(`[Collector] Snapshot recorded for ${runKey}`);
  } catch (err: any) {
    status = 'failed';
    errorMessage = err?.message || 'Collector failed';
    console.error(`[Collector] Daily run failed: ${errorMessage}`);
  } finally {
    finishRun(runId, status, errorMessage);
    await saveDB();
    const duration = Date.now() - startTime;
    console.log(`[Collector] Daily run completed in ${duration}ms with status: ${status}`);
  }
}

export async function runBackfill(assetId: number, range: string, userId: number): Promise<{ status: RunStatus; errorMessage?: string }> {
  const asset = query(
    'SELECT id, symbol, type FROM assets WHERE id = ? AND (user_id = ? OR user_id IS NULL)',
    [assetId, userId]
  )[0] as any;
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

    await saveDB();
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
    await saveDB();
    const duration = Date.now() - startTime;
    console.log(`[Collector] Backfill completed in ${duration}ms with status: ${status}`);
  }

  return { status, errorMessage };
}

export async function runQueuedBackfills(userId: number): Promise<void> {
  const jobs = query(
    'SELECT id, asset_id, range FROM backfill_jobs WHERE user_id = ? AND status = ? ORDER BY requested_at LIMIT 5',
    [userId, 'queued']
  ) as Array<{ id: number; asset_id: number; range: string }>;

  console.log(`[Collector] Processing ${jobs.length} backfill jobs for user ${userId}`);

  for (const job of jobs) {
    // Atomic claim: only update if still queued
    const updated = run('UPDATE backfill_jobs SET status = ? WHERE id = ? AND status = ?', [
      'running',
      job.id,
      'queued',
    ]);

    if (updated === 0) {
      console.log(`[Collector] Job ${job.id} already claimed by another process`);
      continue; // Another process claimed it
    }

    await saveDB();
    console.log(`[Collector] Claimed job ${job.id} (asset ${job.asset_id}, range ${job.range})`);

    let jobStatus: RunStatus = 'success';
    let jobError: string | undefined;

    try {
      const result = await runBackfill(job.asset_id, job.range, userId);
      jobStatus = result.status;
      jobError = result.errorMessage;
      console.log(`[Collector] Job ${job.id} completed with status: ${jobStatus}`);
    } catch (err: any) {
      jobStatus = 'failed';
      jobError = err?.message || 'Backfill failed';
      console.error(`[Collector] Job ${job.id} failed: ${jobError}`);
    }

    run(
      'UPDATE backfill_jobs SET status = ?, completed_at = datetime("now"), error_message = ? WHERE id = ?',
      [jobStatus, jobError || null, job.id]
    );
    await saveDB();
  }
}

// Data retention cleanup
export async function cleanupOldData(userId: number, retentionDays: number = DEFAULT_DATA_RETENTION_DAYS): Promise<{ deletedHistory: number; deletedSnapshots: number }> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoffIso = cutoffDate.toISOString();
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

  console.log(`[Collector] Cleaning up data older than ${cutoffDateStr} (${retentionDays} days retention) for user ${userId}`);

  const historyResult = run('DELETE FROM price_history WHERE user_id = ? AND timestamp < ?', [userId, cutoffIso]);
  const snapshotResult = run('DELETE FROM price_snapshots WHERE user_id = ? AND snapshot_date < ?', [userId, cutoffDateStr]);
  const runsResult = run('DELETE FROM collector_runs WHERE user_id = ? AND finished_at < ? AND finished_at IS NOT NULL', [userId, cutoffIso]);

  await saveDB();

  console.log(`[Collector] Cleanup complete: ${historyResult} history, ${snapshotResult} snapshots, ${runsResult} runs deleted`);

  return {
    deletedHistory: historyResult,
    deletedSnapshots: snapshotResult,
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
  const totalRuns = query(
    'SELECT COUNT(*) as count FROM collector_runs WHERE user_id = ?',
    [userId]
  )[0] as { count: number };
  const successfulRuns = query(
    "SELECT COUNT(*) as count FROM collector_runs WHERE user_id = ? AND status = 'success'",
    [userId]
  )[0] as { count: number };
  const failedRuns = query(
    "SELECT COUNT(*) as count FROM collector_runs WHERE user_id = ? AND status = 'failed'",
    [userId]
  )[0] as { count: number };
  const pendingJobs = query(
    "SELECT COUNT(*) as count FROM backfill_jobs WHERE user_id = ? AND status = 'queued'",
    [userId]
  )[0] as { count: number };
  const completedJobs = query(
    "SELECT COUNT(*) as count FROM backfill_jobs WHERE user_id = ? AND status IN ('success', 'partial', 'failed')",
    [userId]
  )[0] as { count: number };

  return {
    totalRuns: totalRuns.count,
    successfulRuns: successfulRuns.count,
    failedRuns: failedRuns.count,
    pendingJobs: pendingJobs.count,
    completedJobs: completedJobs.count,
  };
}
