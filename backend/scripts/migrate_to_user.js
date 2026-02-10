/**
 * Migration script to add users table and user_id columns to existing database
 * Usage: node scripts/migrate_to_user.js <email>
 */

import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Get database path
const env = process.env.NODE_ENV || 'development';
const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
const dataDir = path.join(homeDir, '.portfolio-tracker');
const dbName = env === 'production' ? 'portfolio.db' : 'portfolio.dev.db';
const dbPath = path.join(dataDir, dbName);

async function migrate() {
  console.log('Starting migration...');
  console.log(`Database path: ${dbPath}`);

  // Check if database exists
  if (!fs.existsSync(dbPath)) {
    console.error('Database file not found. Please run the application first to create the database.');
    process.exit(1);
  }

  // Get email from command line or prompt
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: node scripts/migrate_to_user.js <email>');
    process.exit(1);
  }

  // Prompt for password
  const password = await new Promise((resolve, reject) => {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    readline.question('Enter password for the initial user: ', (answer) => {
      readline.close();
      resolve(answer);
    });
  });

  if (password.length < 8) {
    console.error('Password must be at least 8 characters');
    process.exit(1);
  }

  // Create backup
  const backupPath = `${dbPath}.backup.${Date.now()}`;
  console.log(`Creating backup at: ${backupPath}`);
  fs.copyFileSync(dbPath, backupPath);

  // Initialize sql.js
  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(buffer);

  // Create migrations table if it doesn't exist
  db.run(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Check if migration already applied
  const migrationCheck = db.exec("SELECT id FROM migrations WHERE name = '001_add_users'");
  if (migrationCheck.length > 0 && migrationCheck[0].values.length > 0) {
    console.log('Migration already applied. Skipping.');
    fs.writeFileSync(dbPath, buffer);
    return;
  }

  // Create users table
  console.log('Creating users table...');
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Hash password
  console.log('Hashing password...');
  const passwordHash = await bcrypt.hash(password, 10);

  // Create initial user
  console.log(`Creating user with email: ${email}`);
  db.run('INSERT INTO users (email, password_hash) VALUES (?, ?)', [email, passwordHash]);
  const userId = db.exec('SELECT last_insert_rowid() as id')[0]?.values[0]?.[0];
  console.log(`Created user with id: ${userId}`);

  // Get all tables to add user_id to
  const tables = ['accounts', 'assets', 'transactions', 'holdings', 'price_history'];

  for (const table of tables) {
    console.log(`Adding user_id column to ${table}...`);

    // Check if column already exists
    const tableInfo = db.exec(`PRAGMA table_info(${table})`);
    const hasUserId = tableInfo[0]?.values?.some((row: any[]) => row[1] === 'user_id');

    if (!hasUserId) {
      db.run(`ALTER TABLE ${table} ADD COLUMN user_id INTEGER REFERENCES users(id)`);
    }

    // Update all existing rows to have the user_id
    db.run(`UPDATE ${table} SET user_id = ? WHERE user_id IS NULL`, [userId]);
  }

  // Add user_id to price_snapshots
  console.log('Adding user_id to price_snapshots...');
  const snapshotInfo = db.exec('PRAGMA table_info(price_snapshots)');
  const hasSnapshotUserId = snapshotInfo[0]?.values?.some((row: any[]) => row[1] === 'user_id');
  if (!hasSnapshotUserId) {
    db.run('ALTER TABLE price_snapshots ADD COLUMN user_id INTEGER REFERENCES users(id)');
  }
  db.run('UPDATE price_snapshots SET user_id = ? WHERE user_id IS NULL', [userId]);

  // Add user_id to collector_runs
  console.log('Adding user_id to collector_runs...');
  const runsInfo = db.exec('PRAGMA table_info(collector_runs)');
  const hasRunsUserId = runsInfo[0]?.values?.some((row: any[]) => row[1] === 'user_id');
  if (!hasRunsUserId) {
    db.run('ALTER TABLE collector_runs ADD COLUMN user_id INTEGER REFERENCES users(id)');
  }
  db.run('UPDATE collector_runs SET user_id = ? WHERE user_id IS NULL', [userId]);

  // Add user_id to backfill_jobs
  console.log('Adding user_id to backfill_jobs...');
  const jobsInfo = db.exec('PRAGMA table_info(backfill_jobs)');
  const hasJobsUserId = jobsInfo[0]?.values?.some((row: any[]) => row[1] === 'user_id');
  if (!hasJobsUserId) {
    db.run('ALTER TABLE backfill_jobs ADD COLUMN user_id INTEGER REFERENCES users(id)');
  }
  db.run('UPDATE backfill_jobs SET user_id = ? WHERE user_id IS NULL', [userId]);

  // Record migration
  db.run("INSERT INTO migrations (name) VALUES ('001_add_users')");

  // Save database
  const data = db.export();
  const output = Buffer.from(data);
  fs.writeFileSync(dbPath, output);

  console.log('Migration completed successfully!');
  console.log(`Backup saved at: ${backupPath}`);
  console.log(`User email: ${email}`);
  console.log('Please restart the application to apply the changes.');
}

migrate().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
