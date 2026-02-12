import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import * as schema from './schema.js';

const env = process.env.NODE_ENV || 'development';
const customPath = process.env.DATABASE_PATH;

let dbPath: string;

if (customPath) {
  dbPath = customPath;
} else {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
  const dataDir = path.join(homeDir, '.portfolio-tracker');
  const dbName = env === 'production' ? 'portfolio.db' : 'portfolio.dev.db';
  dbPath = path.join(dataDir, dbName);
}

// Global database instance
let sqliteDb: Database.Database | null = null;
let drizzleDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getEnvInfo() {
  return {
    env,
    dbPath,
    isCustomPath: !!customPath
  };
}

export function initDB(inMemory = false) {
  // Ensure directory exists
  if (!inMemory) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  // Create better-sqlite3 connection
  sqliteDb = inMemory ? new Database(':memory:') : new Database(dbPath);

  // Enable foreign keys
  sqliteDb.pragma('foreign_keys = ON');

  // Create Drizzle instance with schema
  drizzleDb = drizzle(sqliteDb, { schema });

  // Initialize schema (create tables if they don't exist)
  initializeSchema(sqliteDb);

  return drizzleDb;
}

function initializeSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
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
      user_id INTEGER REFERENCES users(id),
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
      user_id INTEGER REFERENCES users(id),
      asset_id INTEGER REFERENCES assets(id),
      account_id INTEGER REFERENCES accounts(id),
      quantity REAL NOT NULL,
      avg_cost REAL NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, asset_id, account_id)
    );

    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      asset_id INTEGER REFERENCES assets(id),
      price REAL NOT NULL,
      currency TEXT DEFAULT 'USD',
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS price_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      snapshot_date DATE NOT NULL,
      total_value_usd REAL NOT NULL,
      total_cost_usd REAL,
      total_pl_usd REAL,
      usdcny_rate REAL,
      created_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, snapshot_date)
    );

    CREATE TABLE IF NOT EXISTS collector_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      run_type TEXT NOT NULL,
      run_key TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at DATETIME NOT NULL,
      finished_at DATETIME,
      error_message TEXT,
      UNIQUE(user_id, run_type, run_key)
    );

    CREATE TABLE IF NOT EXISTS backfill_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      asset_id INTEGER NOT NULL REFERENCES assets(id),
      range TEXT NOT NULL,
      status TEXT NOT NULL,
      requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      error_message TEXT,
      UNIQUE(user_id, asset_id, range)
    );

    CREATE TABLE IF NOT EXISTS user_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      target_allocation_crypto REAL DEFAULT 0.4,
      target_allocation_stock_us REAL DEFAULT 0.3,
      target_allocation_stock_cn REAL DEFAULT 0.2,
      target_allocation_gold REAL DEFAULT 0.1,
      rebalance_threshold REAL DEFAULT 0.05,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      asset_id INTEGER REFERENCES assets(id),
      alert_type TEXT NOT NULL,
      threshold REAL NOT NULL,
      is_active BOOLEAN DEFAULT 1,
      triggered BOOLEAN DEFAULT 0,
      triggered_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, asset_id, alert_type, threshold)
    );

    CREATE TABLE IF NOT EXISTS alert_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      alert_id INTEGER REFERENCES alerts(id) ON DELETE CASCADE,
      triggered_price REAL NOT NULL,
      notified_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export function getDB() {
  if (!drizzleDb) {
    throw new Error('Database not initialized. Call initDB() first.');
  }
  return drizzleDb;
}

export function getSqliteDB() {
  if (!sqliteDb) {
    throw new Error('Database not initialized. Call initDB() first.');
  }
  return sqliteDb;
}

export function closeDB() {
  if (sqliteDb) {
    sqliteDb.close();
    sqliteDb = null;
    drizzleDb = null;
  }
}

// Re-export schema for convenience
export * from './schema.js';
