import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';


const __dirname = path.dirname(fileURLToPath(import.meta.url));

const env = process.env.NODE_ENV || 'development';
const customPath = process.env.DATABASE_PATH;

let dbPath: string;

if (customPath) {
  // Use custom path if provided
  dbPath = customPath;
} else {
  // Default: Store in user's home directory, outside of code
  const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
  const dataDir = path.join(homeDir, '.portfolio-tracker');
  const dbName = env === 'production' ? 'portfolio.db' : 'portfolio.dev.db';
  dbPath = path.join(dataDir, dbName);
}

let db: SqlJsDatabase;

export function getEnvInfo() {
  return {
    env,
    dbPath,
    isCustomPath: !!customPath
  };
}

export async function initDB(inMemory = false): Promise<SqlJsDatabase> {
  const SQL = await initSqlJs();
  
  // For tests, use in-memory database
  if (inMemory) {
    db = new SQL.Database();
  } else if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  
  // Initialize schema
  db.run(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      currency TEXT DEFAULT 'USD',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      exchange TEXT,
      currency TEXT DEFAULT 'USD',
      current_price REAL,
      price_updated_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id INTEGER REFERENCES assets(id),
      account_id INTEGER REFERENCES accounts(id),
      type TEXT NOT NULL,
      quantity REAL NOT NULL,
      price REAL NOT NULL,
      fee REAL DEFAULT 0,
      date DATETIME NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS holdings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id INTEGER REFERENCES assets(id),
      account_id INTEGER REFERENCES accounts(id),
      quantity REAL NOT NULL,
      avg_cost REAL NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(asset_id, account_id)
    );

    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id INTEGER REFERENCES assets(id),
      price REAL NOT NULL,
      currency TEXT DEFAULT 'USD',
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration: Add current_price columns if they don't exist (for existing databases)
  try {
    db.run('ALTER TABLE assets ADD COLUMN current_price REAL');
  } catch {
    // Column may already exist, ignore error
  }
  try {
    db.run('ALTER TABLE assets ADD COLUMN price_updated_at DATETIME');
  } catch {
    // Column may already exist, ignore error
  }

  // Historical Performance Charts: Add price_snapshots table
  db.run(`
    CREATE TABLE IF NOT EXISTS price_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_date DATE NOT NULL UNIQUE,
      total_value_usd REAL,
      total_cost_usd REAL,
      usdcny_rate REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Historical Performance Charts: Collector run audit
  db.run(`
    CREATE TABLE IF NOT EXISTS collector_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_type TEXT NOT NULL,
      run_key TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at DATETIME NOT NULL,
      finished_at DATETIME,
      error_message TEXT
    )
  `);

  // Historical Performance Charts: Backfill job queue
  db.run(`
    CREATE TABLE IF NOT EXISTS backfill_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id INTEGER NOT NULL REFERENCES assets(id),
      range TEXT NOT NULL,
      status TEXT NOT NULL,
      requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      error_message TEXT
    )
  `);

  // Historical Performance Charts: Add indexes for better query performance
  db.run(`CREATE INDEX IF NOT EXISTS idx_price_history_asset_date ON price_history(asset_id, timestamp)`);
  try {
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_price_history_unique ON price_history(asset_id, timestamp)`);
  } catch {
    // Existing duplicates may prevent unique index creation; keep non-unique index.
  }
  db.run(`CREATE INDEX IF NOT EXISTS idx_price_snapshots_date ON price_snapshots(snapshot_date)`);
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_collector_runs_key ON collector_runs(run_type, run_key)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_backfill_jobs_status ON backfill_jobs(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_backfill_jobs_asset ON backfill_jobs(asset_id)`);
  // Prevent duplicate queued backfill jobs for same asset and range
  try {
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_backfill_jobs_unique ON backfill_jobs(asset_id, range) WHERE status = 'queued'`);
  } catch {
    // Index may already exist or DB doesn't support partial indexes
  }
  db.run(`CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)`);

  saveDB();
  return db;
}

export function getDB(): SqlJsDatabase {
  if (!db) throw new Error('Database not initialized');
  return db;
}

export function saveDB() {
  if (!db) return;
  // Skip save for in-memory test databases
  if (process.env.VITEST) return;
  
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, buffer);
}

// Helper to run queries and return results as objects
export function query<T = any>(sql: string, params: any[] = []): T[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return results;
}

export function run(sql: string, params: any[] = []): number {
  db.run(sql, params);
  return db.getRowsModified();
}

export function lastInsertId(): number {
  const result = db.exec('SELECT last_insert_rowid() as id');
  return result[0]?.values[0]?.[0] as number || 0;
}

// Transaction support
export function beginTransaction(): void {
  db.run('BEGIN TRANSACTION');
}

export function commitTransaction(): void {
  db.run('COMMIT');
}

export function rollbackTransaction(): void {
  db.run('ROLLBACK');
}

// Execute function within a transaction
export async function withTransaction<T>(fn: () => T): Promise<T> {
  beginTransaction();
  try {
    const result = await fn();
    commitTransaction();
    return result;
  } catch (error) {
    rollbackTransaction();
    throw error;
  }
}
