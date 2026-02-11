import { initDB, getEnvInfo, query } from '../db/index.js';
import { runDailyCollector, runQueuedBackfills, cleanupOldData, getCollectorStats } from './collector.js';

async function main() {
  await initDB();
  const { env, dbPath } = getEnvInfo();

  console.log(`[Collector] Starting (env: ${env}, db: ${dbPath})`);

  // Get the first user for backward compatibility
  const users = query('SELECT id FROM users LIMIT 1');
  const userId = users.length > 0 ? users[0].id : 1;

  const mode = process.argv[2] || 'daily';

  switch (mode) {
    case 'daily':
      await runDailyCollector(userId);
      break;
    case 'backfills':
      await runQueuedBackfills(userId);
      break;
    case 'all':
      await runDailyCollector(userId);
      await runQueuedBackfills(userId);
      break;
    case 'cleanup': {
      const days = parseInt(process.argv[3]) || 730; // Default 2 years
      const result = await cleanupOldData(userId, days);
      console.log(`[Collector] Cleanup result:`, result);
      break;
    }
    case 'stats': {
      const stats = getCollectorStats(userId);
      console.log('[Collector] Statistics:', JSON.stringify(stats, null, 2));
      break;
    }
    default:
      console.error('Unknown mode. Use: daily | backfills | all | cleanup [days] | stats');
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('[Collector] Fatal error:', err);
  process.exit(1);
});
