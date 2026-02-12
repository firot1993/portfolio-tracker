// Drizzle ORM database layer
// This module provides a unified interface for database operations
import { getDB, initDB, getSqliteDB, getEnvInfo, closeDB } from './drizzle.js';

// Re-export Drizzle utilities
export { getDB, initDB, getSqliteDB, getEnvInfo, closeDB };

// Re-export schema
export * from './schema.js';

// Legacy compatibility functions for gradual migration
// These wrap better-sqlite3 operations to maintain backward compatibility

/**
 * Execute a raw SQL query and return results as objects
 * @deprecated Use Drizzle query builder instead
 */
export function query<T = any>(sql: string, params: any[] = []): T[] {
  const db = getSqliteDB();
  const stmt = db.prepare(sql);
  return stmt.all(...params) as T[];
}

/**
 * Execute a raw SQL statement (INSERT, UPDATE, DELETE)
 * @deprecated Use Drizzle query builder instead
 */
export function run(sql: string, params: any[] = []): number {
  const db = getSqliteDB();
  const stmt = db.prepare(sql);
  const result = stmt.run(...params);
  return result.changes;
}

/**
 * Get the last inserted row ID
 * @deprecated Use Drizzle's returning() clause instead
 */
export function lastInsertId(): number {
  const db = getSqliteDB();
  const result = db.prepare('SELECT last_insert_rowid() as id').get() as { id: number };
  return result?.id || 0;
}

/**
 * Begin a transaction
 * @deprecated Use db.transaction() from better-sqlite3 instead
 */
export function beginTransaction(): void {
  const db = getSqliteDB();
  db.exec('BEGIN TRANSACTION');
}

/**
 * Commit a transaction
 * @deprecated Use db.transaction() from better-sqlite3 instead
 */
export function commitTransaction(): void {
  const db = getSqliteDB();
  db.exec('COMMIT');
}

/**
 * Rollback a transaction
 * @deprecated Use db.transaction() from better-sqlite3 instead
 */
export function rollbackTransaction(): void {
  const db = getSqliteDB();
  db.exec('ROLLBACK');
}

/**
 * Execute a function within a transaction
 * @deprecated Use db.transaction() from better-sqlite3 instead
 */
export function withTransaction<T>(fn: () => T): T {
  const db = getSqliteDB();
  const transaction = db.transaction(fn);
  return transaction();
}

/**
 * Save database to disk
 * @deprecated better-sqlite3 auto-saves, this is now a no-op
 */
export function saveDB(): void {
  // better-sqlite3 automatically persists changes
  // This function is kept for backward compatibility
}
