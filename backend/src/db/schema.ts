import { sqliteTable, text, integer, real, unique } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Users table
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// Accounts table
export const accounts = sqliteTable('accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id),
  name: text('name').notNull(),
  type: text('type').notNull(),
  currency: text('currency').default('USD'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// Assets table
export const assets = sqliteTable('assets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  symbol: text('symbol').notNull().unique(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  exchange: text('exchange'),
  currency: text('currency').default('USD'),
  currentPrice: real('current_price'),
  priceUpdatedAt: text('price_updated_at'),
});

// Transactions table
export const transactions = sqliteTable('transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id),
  assetId: integer('asset_id').references(() => assets.id),
  accountId: integer('account_id').references(() => accounts.id),
  type: text('type').notNull(),
  quantity: real('quantity').notNull(),
  price: real('price').notNull(),
  fee: real('fee').default(0),
  date: text('date').notNull(),
  notes: text('notes'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// Holdings table
export const holdings = sqliteTable('holdings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id),
  assetId: integer('asset_id').references(() => assets.id),
  accountId: integer('account_id').references(() => accounts.id),
  quantity: real('quantity').notNull(),
  avgCost: real('avg_cost').notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  unique('holdings_user_asset_account_unique').on(table.userId, table.assetId, table.accountId),
]);

// Price History table
export const priceHistory = sqliteTable('price_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id'),
  assetId: integer('asset_id').references(() => assets.id),
  price: real('price').notNull(),
  currency: text('currency').default('USD'),
  timestamp: text('timestamp').default(sql`CURRENT_TIMESTAMP`),
});

// Price Snapshots table
export const priceSnapshots = sqliteTable('price_snapshots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  snapshotDate: text('snapshot_date').notNull(),
  totalValueUsd: real('total_value_usd').notNull(),
  totalCostUsd: real('total_cost_usd'),
  totalPlUsd: real('total_pl_usd'),
  usdcnyRate: real('usdcny_rate'),
  createdAt: text('created_at'),
}, (table) => [
  unique('price_snapshots_user_date_unique').on(table.userId, table.snapshotDate),
]);

// Collector Runs table
export const collectorRuns = sqliteTable('collector_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id),
  runType: text('run_type').notNull(),
  runKey: text('run_key').notNull(),
  status: text('status').notNull(),
  startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at'),
  errorMessage: text('error_message'),
}, (table) => [
  unique('collector_runs_user_type_key_unique').on(table.userId, table.runType, table.runKey),
]);

// Backfill Jobs table
export const backfillJobs = sqliteTable('backfill_jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id),
  assetId: integer('asset_id').notNull().references(() => assets.id),
  range: text('range').notNull(),
  status: text('status').notNull(),
  requestedAt: text('requested_at').default(sql`CURRENT_TIMESTAMP`),
  completedAt: text('completed_at'),
  errorMessage: text('error_message'),
}, (table) => [
  unique('backfill_jobs_user_asset_range_unique').on(table.userId, table.assetId, table.range),
]);

// User Preferences table
export const userPreferences = sqliteTable('user_preferences', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').unique().references(() => users.id, { onDelete: 'cascade' }),
  targetAllocationCrypto: real('target_allocation_crypto').default(0.4),
  targetAllocationStockUs: real('target_allocation_stock_us').default(0.3),
  targetAllocationStockCn: real('target_allocation_stock_cn').default(0.2),
  targetAllocationGold: real('target_allocation_gold').default(0.1),
  rebalanceThreshold: real('rebalance_threshold').default(0.05),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Alerts table
export const alerts = sqliteTable('alerts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  assetId: integer('asset_id').references(() => assets.id),
  alertType: text('alert_type').notNull(),
  threshold: real('threshold').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  triggered: integer('triggered', { mode: 'boolean' }).default(false),
  triggeredAt: text('triggered_at'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  unique('alerts_user_asset_type_threshold_unique').on(table.userId, table.assetId, table.alertType, table.threshold),
]);

// Alert Notifications table
export const alertNotifications = sqliteTable('alert_notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  alertId: integer('alert_id').references(() => alerts.id, { onDelete: 'cascade' }),
  triggeredPrice: real('triggered_price').notNull(),
  notifiedAt: text('notified_at').default(sql`CURRENT_TIMESTAMP`),
});

// Type exports for use in queries
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Holding = typeof holdings.$inferSelect;
export type NewHolding = typeof holdings.$inferInsert;
export type PriceHistory = typeof priceHistory.$inferSelect;
export type NewPriceHistory = typeof priceHistory.$inferInsert;
export type PriceSnapshot = typeof priceSnapshots.$inferSelect;
export type NewPriceSnapshot = typeof priceSnapshots.$inferInsert;
export type CollectorRun = typeof collectorRuns.$inferSelect;
export type NewCollectorRun = typeof collectorRuns.$inferInsert;
export type BackfillJob = typeof backfillJobs.$inferSelect;
export type NewBackfillJob = typeof backfillJobs.$inferInsert;
export type UserPreference = typeof userPreferences.$inferSelect;
export type NewUserPreference = typeof userPreferences.$inferInsert;
export type Alert = typeof alerts.$inferSelect;
export type NewAlert = typeof alerts.$inferInsert;
export type AlertNotification = typeof alertNotifications.$inferSelect;
export type NewAlertNotification = typeof alertNotifications.$inferInsert;
