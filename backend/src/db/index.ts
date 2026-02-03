import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const env = process.env.NODE_ENV || 'development';
const customPath = process.env.DATABASE_PATH;

let dbPath: string;

if (customPath) {
  dbPath = customPath;
} else if (env === 'production') {
  dbPath = path.join(__dirname, '../../data/portfolio.db');
} else {
  dbPath = path.join(__dirname, '../../data/portfolio.dev.db');
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
      currency TEXT DEFAULT 'USD'
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
