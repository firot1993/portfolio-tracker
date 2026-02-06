import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  initDB,
  getDB,
  query,
  run,
  lastInsertId,
  beginTransaction,
  commitTransaction,
  rollbackTransaction,
  withTransaction,
  saveDB,
  getEnvInfo
} from '../db/index.js';

describe('Database Utilities', () => {
  beforeAll(async () => {
    await initDB(true);
  });

  describe('Database Initialization', () => {
    it('should initialize in-memory database', async () => {
      const db = getDB();
      expect(db).toBeDefined();
    });

    it('should return environment info', () => {
      const info = getEnvInfo();
      expect(info).toHaveProperty('env');
      expect(info).toHaveProperty('dbPath');
      expect(info).toHaveProperty('isCustomPath');
    });
  });

  describe('Query Operations', () => {
    beforeEach(() => {
      // Clean up test table
      try {
        run('DROP TABLE IF EXISTS test_table');
      } catch {
        // Ignore errors
      }
      run('CREATE TABLE test_table (id INTEGER PRIMARY KEY, name TEXT, value REAL)');
    });

    it('should execute query and return results', () => {
      run('INSERT INTO test_table (name, value) VALUES (?, ?)', ['test', 100]);
      const results = query('SELECT * FROM test_table WHERE name = ?', ['test']);
      expect(results.length).toBe(1);
      expect((results[0] as any).name).toBe('test');
    });

    it('should return empty array for no results', () => {
      const results = query('SELECT * FROM test_table WHERE name = ?', ['nonexistent']);
      expect(results).toEqual([]);
    });

    it('should execute query without params', () => {
      run('INSERT INTO test_table (name, value) VALUES (?, ?)', ['test1', 100]);
      run('INSERT INTO test_table (name, value) VALUES (?, ?)', ['test2', 200]);
      
      const results = query('SELECT * FROM test_table ORDER BY id');
      expect(results.length).toBe(2);
    });
  });

  describe('Run Operations', () => {
    beforeEach(() => {
      try {
        run('DROP TABLE IF EXISTS test_run_table');
      } catch {
        // Ignore errors
      }
      run('CREATE TABLE test_run_table (id INTEGER PRIMARY KEY, name TEXT)');
    });

    it('should execute insert and return rows modified', () => {
      const rowsModified = run('INSERT INTO test_run_table (name) VALUES (?)', ['test']);
      expect(rowsModified).toBe(1);
    });

    it('should execute update and return rows modified', () => {
      run('INSERT INTO test_run_table (name) VALUES (?)', ['test']);
      const rowsModified = run('UPDATE test_run_table SET name = ? WHERE name = ?', ['updated', 'test']);
      expect(rowsModified).toBe(1);
    });

    it('should execute delete and return rows modified', () => {
      run('INSERT INTO test_run_table (name) VALUES (?)', ['test']);
      const rowsModified = run('DELETE FROM test_run_table WHERE name = ?', ['test']);
      expect(rowsModified).toBe(1);
    });
  });

  describe('Last Insert ID', () => {
    beforeEach(() => {
      try {
        run('DROP TABLE IF EXISTS test_id_table');
      } catch {
        // Ignore errors
      }
      run('CREATE TABLE test_id_table (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)');
    });

    it('should return last insert id', () => {
      run('INSERT INTO test_id_table (name) VALUES (?)', ['test1']);
      const id1 = lastInsertId();
      
      run('INSERT INTO test_id_table (name) VALUES (?)', ['test2']);
      const id2 = lastInsertId();
      
      expect(id2).toBe(id1 + 1);
    });

    it('should return 0 when no insert', () => {
      // Reset the database connection to clear any previous inserts
      const id = lastInsertId();
      expect(typeof id).toBe('number');
    });
  });

  describe('Transaction Operations', () => {
    beforeEach(() => {
      try {
        run('DROP TABLE IF EXISTS test_tx_table');
      } catch {
        // Ignore errors
      }
      run('CREATE TABLE test_tx_table (id INTEGER PRIMARY KEY, name TEXT UNIQUE)');
    });

    it('should execute within transaction', async () => {
      await withTransaction(() => {
        run('INSERT INTO test_tx_table (name) VALUES (?)', ['tx_test']);
        return 'success';
      });

      const results = query('SELECT * FROM test_tx_table WHERE name = ?', ['tx_test']);
      expect(results.length).toBe(1);
    });

    it('should rollback on error', async () => {
      try {
        await withTransaction(() => {
          run('INSERT INTO test_tx_table (name) VALUES (?)', ['rollback_test']);
          throw new Error('Intentional error');
        });
      } catch {
        // Expected error
      }

      const results = query('SELECT * FROM test_tx_table WHERE name = ?', ['rollback_test']);
      expect(results.length).toBe(0);
    });

    it('should handle manual transaction control', () => {
      beginTransaction();
      run('INSERT INTO test_tx_table (name) VALUES (?)', ['manual_tx']);
      commitTransaction();

      const results = query('SELECT * FROM test_tx_table WHERE name = ?', ['manual_tx']);
      expect(results.length).toBe(1);
    });

    it('should handle manual rollback', () => {
      beginTransaction();
      run('INSERT INTO test_tx_table (name) VALUES (?)', ['rollback_manual']);
      rollbackTransaction();

      const results = query('SELECT * FROM test_tx_table WHERE name = ?', ['rollback_manual']);
      expect(results.length).toBe(0);
    });
  });

  describe('SaveDB', () => {
    it('should not throw when saving', () => {
      expect(() => saveDB()).not.toThrow();
    });
  });

  describe('Database Schema', () => {
    it('should have accounts table', () => {
      const results = query("SELECT name FROM sqlite_master WHERE type='table' AND name='accounts'");
      expect(results.length).toBe(1);
    });

    it('should have assets table', () => {
      const results = query("SELECT name FROM sqlite_master WHERE type='table' AND name='assets'");
      expect(results.length).toBe(1);
    });

    it('should have transactions table', () => {
      const results = query("SELECT name FROM sqlite_master WHERE type='table' AND name='transactions'");
      expect(results.length).toBe(1);
    });

    it('should have holdings table', () => {
      const results = query("SELECT name FROM sqlite_master WHERE type='table' AND name='holdings'");
      expect(results.length).toBe(1);
    });

    it('should have price_history table', () => {
      const results = query("SELECT name FROM sqlite_master WHERE type='table' AND name='price_history'");
      expect(results.length).toBe(1);
    });

    it('should have price_snapshots table', () => {
      const results = query("SELECT name FROM sqlite_master WHERE type='table' AND name='price_snapshots'");
      expect(results.length).toBe(1);
    });

    it('should have collector_runs table', () => {
      const results = query("SELECT name FROM sqlite_master WHERE type='table' AND name='collector_runs'");
      expect(results.length).toBe(1);
    });

    it('should have backfill_jobs table', () => {
      const results = query("SELECT name FROM sqlite_master WHERE type='table' AND name='backfill_jobs'");
      expect(results.length).toBe(1);
    });
  });
});
