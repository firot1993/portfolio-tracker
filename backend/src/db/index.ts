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
      user_id INTEGER REFERENCES users(id),
      symbol TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      exchange TEXT,
      currency TEXT DEFAULT 'USD',
      current_price REAL,
      price_updated_at DATETIME,
      UNIQUE(symbol)
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
      user_id INTEGER REFERENCES users(id),
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
      user_id INTEGER REFERENCES users(id),
      snapshot_date DATE NOT NULL,
      total_value_usd REAL,
      total_cost_usd REAL,
      usdcny_rate REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, snapshot_date)
    )
  `);

  // Historical Performance Charts: Collector run audit
  db.run(`
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
    )
  `);

  // Historical Performance Charts: Backfill job queue
  db.run(`
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
    )
  `);

  // Phase 1: User preferences for rebalancing
  db.run(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      target_allocation_crypto REAL DEFAULT 0.4,
      target_allocation_stock_us REAL DEFAULT 0.3,
      target_allocation_stock_cn REAL DEFAULT 0.2,
      target_allocation_gold REAL DEFAULT 0.1,
      rebalance_threshold REAL DEFAULT 0.05,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Phase 1: Price alerts
  db.run(`
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
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS alert_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      alert_id INTEGER REFERENCES alerts(id) ON DELETE CASCADE,
      triggered_price REAL NOT NULL,
      notified_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

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

// Migration: Add users table and user_id columns
export async function runMigrations(): Promise<void> {
  // Create migrations tracking table
  db.run(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const hasMigration = (name: string) =>
    query("SELECT id FROM migrations WHERE name = ?", [name]).length > 0;

  const ensureDefaultUser = async (): Promise<number | null> => {
    const existing = query<{ id: number }>("SELECT id FROM users WHERE email = 'default@portfolio.local'");
    if (existing.length > 0) return existing[0].id;

    const bcrypt = await import('bcrypt');
    const defaultPasswordHash = await bcrypt.hash('default_password_change_me', 10);
    db.run(
      'INSERT OR IGNORE INTO users (email, password_hash) VALUES (?, ?)',
      ['default@portfolio.local', defaultPasswordHash]
    );
    const created = query<{ id: number }>("SELECT id FROM users WHERE email = 'default@portfolio.local'");
    return created[0]?.id || null;
  };

  const addUserIdColumn = async (tableName: string) => {
    try {
      const check = query(`PRAGMA table_info(${tableName})`);
      const hasUserId = check.some((col: any) => col.name === 'user_id');
      if (hasUserId) return;

      db.run(`ALTER TABLE ${tableName} ADD COLUMN user_id INTEGER REFERENCES users(id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_${tableName}_user_id ON ${tableName}(user_id)`);

      const countResult = query<{ count: number }>(`SELECT COUNT(*) as count FROM ${tableName}`);
      const hasExistingData = countResult[0]?.count > 0;
      if (hasExistingData) {
        const defaultUserId = await ensureDefaultUser();
        if (defaultUserId) {
          db.run(`UPDATE ${tableName} SET user_id = ? WHERE user_id IS NULL`, [defaultUserId]);
          console.log(`Assigned existing ${tableName} records to default user`);
        }
      }
    } catch (error) {
      console.error(`Error adding user_id to ${tableName}:`, error);
    }
  };

  if (!hasMigration('001_add_users')) {
    // Create users table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add user_id columns to existing core tables
    const coreTables = ['accounts', 'assets', 'transactions', 'holdings', 'price_history'];
    for (const tableName of coreTables) {
      await addUserIdColumn(tableName);
    }

    db.run("INSERT INTO migrations (name) VALUES ('001_add_users')");
    console.log('Applied migration 001_add_users');
  }

  if (!hasMigration('002_add_user_id_history_tables')) {
    const historyTables = ['price_snapshots', 'collector_runs', 'backfill_jobs'];
    for (const tableName of historyTables) {
      await addUserIdColumn(tableName);
    }

    db.run("INSERT INTO migrations (name) VALUES ('002_add_user_id_history_tables')");
    console.log('Applied migration 002_add_user_id_history_tables');
  }

  if (!hasMigration('003_assets_global_only')) {
    // Consolidate duplicate assets by symbol and make assets global-only.
    const duplicates = query<{ symbol: string; keep_id: number; ids: string }>(
      'SELECT symbol, MIN(id) as keep_id, GROUP_CONCAT(id) as ids FROM assets GROUP BY symbol HAVING COUNT(*) > 1'
    );

    for (const dup of duplicates) {
      const ids = dup.ids.split(',').map(id => Number(id)).filter(id => Number.isFinite(id));
      for (const id of ids) {
        if (id === dup.keep_id) continue;
        run('UPDATE holdings SET asset_id = ? WHERE asset_id = ?', [dup.keep_id, id]);
        run('UPDATE transactions SET asset_id = ? WHERE asset_id = ?', [dup.keep_id, id]);
        run('UPDATE backfill_jobs SET asset_id = ? WHERE asset_id = ?', [dup.keep_id, id]);
        run('UPDATE price_history SET asset_id = ? WHERE asset_id = ?', [dup.keep_id, id]);
        run('DELETE FROM assets WHERE id = ?', [id]);
      }
    }

    // Make all assets global
    run('UPDATE assets SET user_id = NULL');

    // Enforce uniqueness by symbol for global assets
    try {
      db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_symbol_unique ON assets(symbol)');
    } catch (error) {
      console.warn('Note: Could not create unique symbol index:', (error as Error).message);
    }

    db.run("INSERT INTO migrations (name) VALUES ('003_assets_global_only')");
    console.log('Applied migration 003_assets_global_only');
  }

  // Historical Performance Charts: Add indexes for better query performance
  // These are wrapped in try-catch to handle cases where columns might not exist yet
  const indexes = [
    { name: 'idx_price_history_asset_date', sql: 'CREATE INDEX IF NOT EXISTS idx_price_history_asset_date ON price_history(user_id, asset_id, timestamp)' },
    { name: 'idx_price_snapshots_date', sql: 'CREATE INDEX IF NOT EXISTS idx_price_snapshots_date ON price_snapshots(user_id, snapshot_date)' },
    { name: 'idx_collector_runs_key', sql: 'CREATE INDEX IF NOT EXISTS idx_collector_runs_key ON collector_runs(user_id, run_type, run_key)' },
    { name: 'idx_backfill_jobs_status', sql: 'CREATE INDEX IF NOT EXISTS idx_backfill_jobs_status ON backfill_jobs(user_id, status)' },
    { name: 'idx_backfill_jobs_asset', sql: 'CREATE INDEX IF NOT EXISTS idx_backfill_jobs_asset ON backfill_jobs(user_id, asset_id)' },
    { name: 'idx_transactions_date', sql: 'CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(user_id, date)' },
    { name: 'idx_accounts_user', sql: 'CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id)' },
    { name: 'idx_assets_user', sql: 'CREATE INDEX IF NOT EXISTS idx_assets_user ON assets(user_id)' },
    { name: 'idx_holdings_user', sql: 'CREATE INDEX IF NOT EXISTS idx_holdings_user ON holdings(user_id)' },
    { name: 'idx_alerts_user', sql: 'CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id)' },
    { name: 'idx_alerts_asset', sql: 'CREATE INDEX IF NOT EXISTS idx_alerts_asset ON alerts(asset_id)' },
    { name: 'idx_alert_notifications_user', sql: 'CREATE INDEX IF NOT EXISTS idx_alert_notifications_user ON alert_notifications(user_id)' },
    { name: 'idx_alert_notifications_alert', sql: 'CREATE INDEX IF NOT EXISTS idx_alert_notifications_alert ON alert_notifications(alert_id)' },
  ];

  for (const index of indexes) {
    try {
      db.run(index.sql);
    } catch (error) {
      // Index might already exist or column might not exist yet
      console.warn(`Note: Could not create index ${index.name}:`, (error as Error).message);
    }
  }

  try {
    db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_symbol_unique ON assets(symbol)');
  } catch (error) {
    console.warn('Note: Could not create unique symbol index:', (error as Error).message);
  }

  saveDB();
  console.log('Database migrations completed');
}
