# Implementation Plan - Next Features

This document provides detailed implementation steps for the immediate next features.

---

## 📊 Feature 1: Historical Performance Charts

### Overview
Add time-series charts showing portfolio value history and individual asset performance.

### Database Changes

```sql
-- Create price history snapshots table (already exists, verify schema)
-- Ensure price_history has proper indexes
CREATE INDEX IF NOT EXISTS idx_price_history_asset_date 
ON price_history(asset_id, timestamp);

-- Add scheduled snapshot tracking
CREATE TABLE IF NOT EXISTS price_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_date DATE NOT NULL,
  total_value_usd REAL,
  total_cost_usd REAL,
  usdcny_rate REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_price_snapshots_date 
ON price_snapshots(snapshot_date);
```

### Backend Implementation

#### 1. Price History Service (`backend/src/services/priceHistoryService.ts`)

```typescript
// New file
export async function recordDailySnapshot(): Promise<void> {
  // Record portfolio value once per day
  // Called via scheduled job or on significant events
}

export async function getPortfolioHistory(
  range: '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | 'YTD' | 'ALL'
): Promise<Array<{ date: string; value: number; cost: number }>> {
  // Query price_snapshots and price_history
  // Return interpolated daily values
}

export async function getAssetHistory(
  assetId: number,
  range: string
): Promise<Array<{ date: string; price: number }>> {
  // Query price_history for specific asset
}
```

#### 2. New API Routes (`backend/src/routes/history.ts`)

```typescript
// GET /api/history/portfolio?range=1M
router.get('/portfolio', async (req, res) => {
  const { range = '1M' } = req.query;
  const history = await getPortfolioHistory(range as string);
  res.json({ range, data: history });
});

// GET /api/history/asset/:id?range=1M
router.get('/asset/:id', async (req, res) => {
  const { id } = req.params;
  const { range = '1M' } = req.query;
  const history = await getAssetHistory(Number(id), range as string);
  res.json({ assetId: id, range, data: history });
});

// POST /api/history/snapshot (manual trigger)
router.post('/snapshot', async (req, res) => {
  await recordDailySnapshot();
  res.json({ message: 'Snapshot recorded' });
});
```

#### 3. Scheduled Job Setup

```typescript
// In backend/src/index.ts or separate scheduler
import { CronJob } from 'cron';

// Record snapshot at market close (4 PM EST) on weekdays
const snapshotJob = new CronJob('0 16 * * 1-5', async () => {
  console.log('Recording daily portfolio snapshot...');
  await recordDailySnapshot();
});

snapshotJob.start();
```

### Frontend Implementation

#### 1. New API Client Methods (`frontend/src/services/api.ts`)

```typescript
export interface PortfolioHistoryPoint {
  date: string;
  value: number;
  cost: number;
  pnl: number;
}

export const getPortfolioHistory = (range: string) => 
  api.get<{ range: string; data: PortfolioHistoryPoint[] }>(`/history/portfolio`, { params: { range } }).then(r => r.data);

export const getAssetHistory = (assetId: number, range: string) => 
  api.get<{ data: Array<{ date: string; price: number }> }>(`/history/asset/${assetId}`, { params: { range } }).then(r => r.data);
```

#### 2. New Component (`frontend/src/components/PerformanceChart.tsx`)

```typescript
// Use Recharts AreaChart for portfolio value over time
// Show both total value and cost basis lines
// Include range selector buttons (1D, 1W, 1M, etc.)
// Responsive design
```

#### 3. Dashboard Integration

```typescript
// Add PerformanceChart to DashboardView
// Place below the stats cards or in the grid layout
// Default to 1M view
```

### Tasks Checklist

- [ ] Create price snapshot service
- [ ] Add history API routes
- [ ] Install cron dependency for scheduled jobs
- [ ] Create PerformanceChart component
- [ ] Add range selector UI
- [ ] Implement chart tooltip with detailed values
- [ ] Add loading skeleton for chart
- [ ] Write tests for history service
- [ ] Update AGENTS.md with new endpoints

---

## 📁 Feature 2: CSV Import/Export

### Overview
Allow users to import transactions from brokerage CSV exports and export their data.

### Backend Implementation

#### 1. CSV Parser Service (`backend/src/services/csvService.ts`)

```typescript
export interface ParsedTransaction {
  date: Date;
  symbol: string;
  type: 'buy' | 'sell';
  quantity: number;
  price: number;
  fee: number;
  total: number;
}

export interface CsvParseResult {
  valid: ParsedTransaction[];
  invalid: Array<{ row: number; reason: string; data: any }>;
  warnings: string[];
}

// Supported formats
const PARSERS = {
  binance: parseBinanceCsv,
  coinbase: parseCoinbaseCsv,
  ibkr: parseIBKRCsv,
  futu: parseFutuCsv,
  generic: parseGenericCsv,
};

export function parseCsv(content: string, format: string): CsvParseResult {
  // Parse CSV and map to transaction format
}

export function validateTransactions(transactions: ParsedTransaction[]): CsvParseResult {
  // Validate dates, positive numbers, etc.
}
```

#### 2. Import/Export Routes (`backend/src/routes/importExport.ts`)

```typescript
// POST /api/import/csv/preview
// Body: { content: string, format: string }
// Returns parsed data with validation results
router.post('/csv/preview', upload.single('file'), async (req, res) => {
  const { format = 'generic' } = req.body;
  const content = req.file?.buffer?.toString('utf-8');
  const result = parseCsv(content, format);
  res.json(result);
});

// POST /api/import/csv/confirm
// Body: { transactions: ParsedTransaction[] }
// Actually creates transactions in DB
router.post('/csv/confirm', async (req, res) => {
  const { transactions } = req.body;
  // Create transactions, update holdings
  // Return summary of created records
});

// GET /api/export/transactions?startDate=&endDate=
// Returns CSV string
router.get('/transactions', async (req, res) => {
  const { startDate, endDate } = req.query;
  const transactions = await query(/* ... */);
  const csv = generateTransactionsCsv(transactions);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=transactions.csv');
  res.send(csv);
});
```

#### 3. CSV Template Generation

```typescript
// GET /api/import/csv/template?format=binance
router.get('/csv/template', async (req, res) => {
  const { format = 'generic' } = req.query;
  const template = generateTemplate(format);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=template.csv');
  res.send(template);
});
```

### Frontend Implementation

#### 1. Import Modal Component (`frontend/src/components/ImportModal.tsx`)

```typescript
// Multi-step import wizard:
// Step 1: Select format and upload file
// Step 2: Preview parsed data with validation errors
// Step 3: Map columns (if needed)
// Step 4: Confirm import
// Step 5: Success summary
```

#### 2. Export UI

```typescript
// Add Export button to Transactions page
// Date range picker for export
// Format selection (CSV, JSON)
```

### Supported CSV Formats

| Platform | File Pattern | Notes |
|----------|--------------|-------|
| Binance | trade_export_*.csv | Spot trades |
| Coinbase | transactions.csv | Includes buys/sells |
| Interactive Brokers | U1234567_*.csv | Flex query format |
| Futu | orders_*.csv | HK/US stock trades |
| Generic | Any | Required columns: Date, Symbol, Type, Qty, Price |

### Tasks Checklist

- [ ] Install csv-parse and csv-stringify packages
- [ ] Create CSV parser service with format detection
- [ ] Implement import preview endpoint
- [ ] Implement confirm import endpoint
- [ ] Implement export endpoint
- [ ] Create ImportModal component
- [ ] Add CSV format selector
- [ ] Create preview table with validation errors
- [ ] Add duplicate detection logic
- [ ] Write tests for all parsers
- [ ] Add documentation for supported formats

---

## 🔔 Feature 3: Price Alerts

### Overview
Notify users when assets hit price thresholds or percentage changes.

### Database Schema

```sql
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL REFERENCES assets(id),
  alert_type TEXT NOT NULL, -- 'price_above', 'price_below', 'change_pct_above', 'change_pct_below'
  threshold REAL NOT NULL,
  is_active BOOLEAN DEFAULT 1,
  triggered_at DATETIME, -- Set when alert fires
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_alerts_active ON alerts(is_active);
CREATE INDEX IF NOT EXISTS idx_alerts_asset ON alerts(asset_id);
```

### Backend Implementation

#### 1. Alert Service (`backend/src/services/alertService.ts`)

```typescript
export interface Alert {
  id: number;
  assetId: number;
  type: 'price_above' | 'price_below' | 'change_pct_above' | 'change_pct_below';
  threshold: number;
  isActive: boolean;
}

export async function createAlert(alert: Omit<Alert, 'id'>): Promise<Alert> {
  // Insert into DB
}

export async function getActiveAlerts(): Promise<Alert[]> {
  // Get all active alerts with asset info
}

export async function checkAlerts(): Promise<Array<{ alert: Alert; currentValue: number }>> {
  // Called during price refresh
  // Check if any alerts should trigger
  // Return triggered alerts
}

export async function markAlertTriggered(alertId: number): Promise<void> {
  // Set triggered_at timestamp
  // Optionally deactivate if one-time
}
```

#### 2. Alert Routes (`backend/src/routes/alerts.ts`)

```typescript
// GET /api/alerts
router.get('/', async (req, res) => {
  const alerts = query(/* ... */);
  res.json(alerts);
});

// POST /api/alerts
router.post('/', async (req, res) => {
  const { asset_id, alert_type, threshold } = req.body;
  // Validate asset exists
  // Create alert
  res.status(201).json(alert);
});

// DELETE /api/alerts/:id
router.delete('/:id', async (req, res) => {
  // Delete or deactivate alert
  res.status(204).send();
});

// GET /api/alerts/history
router.get('/history', async (req, res) => {
  // Get triggered alert history
  res.json(history);
});
```

#### 3. Integration with Price Refresh

```typescript
// In priceService.ts or portfolio.ts
async function refreshPrices() {
  // ... existing price fetch logic ...
  
  // Check alerts after price update
  const triggered = await checkAlerts();
  for (const { alert, currentValue } of triggered) {
    // Store notification for frontend polling
    await createNotification({
      type: 'price_alert',
      title: `${alert.symbol} Alert Triggered`,
      message: `${alert.symbol} is now ${currentValue} (threshold: ${alert.threshold})`,
      alertId: alert.id,
    });
    await markAlertTriggered(alert.id);
  }
}
```

#### 4. Notifications Table

```sql
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  is_read BOOLEAN DEFAULT 0,
  data JSON, -- Additional data (alert_id, etc.)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Frontend Implementation

#### 1. Alert Management UI

```typescript
// Add "Alerts" tab to sidebar
// List all alerts with status
// Create alert modal (asset select, type, threshold)
// Alert history view
```

#### 2. Notification System

```typescript
// Poll for notifications every 30 seconds
// Toast notification for new alerts
// Notification badge in header
// Notification dropdown/panel
```

#### 3. Quick Alert from Holdings

```typescript
// Add bell icon to each holding row
// Quick set alert at +/- 5%, 10%, 20% from current
// Or custom price input
```

### Tasks Checklist

- [ ] Create alerts table schema
- [ ] Create notifications table
- [ ] Implement alert CRUD API
- [ ] Implement alert checking logic
- [ ] Add notification polling endpoint
- [ ] Create AlertManager component
- [ ] Create NotificationPanel component
- [ ] Add quick alert buttons to holdings
- [ ] Implement browser push notifications (optional)
- [ ] Add alert sound option
- [ ] Write tests for alert service

---

## 📋 Quick Wins (Low Effort, High Value)

### 1. Theme Toggle
```typescript
// Add dark/light mode toggle
// Use CSS variables for colors
// Persist preference to localStorage
```

### 2. Keyboard Shortcuts
```typescript
// Add react-hotkeys-hook or similar
// Document shortcuts in help modal
```

### 3. Cash Position Tracking
```typescript
// Add "Cash" as pseudo-asset
// Track deposits/withdrawals
// Show cash allocation in pie chart
```

### 4. Watchlist Quick Add
```typescript
// Star icon on assets to add to watchlist
// Separate watchlist section on dashboard
// Quick price view without holding
```

---

## 🧪 Testing Strategy

### Unit Tests
- CSV parser for each format
- Alert checking logic
- History data interpolation
- Price service with mocks

### Integration Tests
- Import flow (upload → preview → confirm)
- Alert triggering on price refresh
- Export with various date ranges

### E2E Tests
- Complete import workflow
- Create and trigger alert
- View historical charts

---

## 📅 Suggested Sprint Schedule

### Sprint 1 (2 weeks): Historical Charts
- Day 1-3: Backend API and database
- Day 4-7: Frontend chart component
- Day 8-10: Dashboard integration
- Day 11-14: Testing and polish

### Sprint 2 (2 weeks): CSV Import/Export
- Day 1-3: CSV parsers and backend
- Day 4-7: Import modal and preview
- Day 8-10: Export functionality
- Day 11-14: Format support and testing

### Sprint 3 (2 weeks): Price Alerts
- Day 1-3: Database and API
- Day 4-7: Alert management UI
- Day 8-10: Notification system
- Day 11-14: Integration and testing

---

*This plan should be reviewed and adjusted based on user feedback and priorities.*
