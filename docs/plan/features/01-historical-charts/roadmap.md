# Feature Roadmap: Historical Performance Charts

> **Category:** Analytics  
> **Priority:** High  
> **Effort:** Medium  
> **Target Version:** v1.1  
> **Status:** In Progress

---

## Overview

Add time-series charts showing portfolio value history and individual asset performance over time.
Historical data collection is handled by a dedicated collector service (decoupled from the API backend).

---

## Goals

1. Visualize portfolio growth/decline over customizable time ranges
2. Compare portfolio performance against benchmarks (S&P 500, BTC, etc.)
3. Track individual asset price history
4. Enable data-driven investment decisions

---

## User Stories

- As a user, I want to see my portfolio value over the last year so that I understand my investment performance
- As a user, I want to compare my portfolio against S&P 500 so that I know if I'm beating the market
- As a user, I want to see individual asset price history so that I can identify trends

---

## Features

### 1. Portfolio Value Over Time
- Line chart showing total portfolio value
- Time ranges: 1D, 1W, 1M, 3M, 6M, 1Y, YTD, ALL
- Show both total value and cost basis
- P&L area highlighting

### 2. Benchmark Comparison
- Overlay S&P 500, NASDAQ, or BTC performance
- Normalized percentage view for fair comparison
- Toggle benchmarks on/off

### 3. Individual Asset Charts
- Per-asset historical price charts
- Click from holdings table to view
- Same time range options as portfolio chart

### 4. Interactive Features
- Hover tooltip with exact values
- Zoom and pan capabilities
- Click to set custom date range

---

## Technical Implementation

### Database Schema

```sql
-- Ensure price_history table has proper indexes
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

-- Collector run audit (idempotent runs)
CREATE TABLE IF NOT EXISTS collector_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_type TEXT NOT NULL, -- 'daily', 'hourly', 'backfill'
  run_key TEXT NOT NULL, -- e.g. '2026-02-06' or '2026-02-06T10'
  status TEXT NOT NULL, -- 'success', 'failed', 'partial'
  started_at DATETIME NOT NULL,
  finished_at DATETIME,
  error_message TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_collector_runs_key
ON collector_runs(run_type, run_key);

-- Optional backfill jobs when users add a new asset
CREATE TABLE IF NOT EXISTS backfill_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL REFERENCES assets(id),
  range TEXT NOT NULL, -- '1Y', '3Y', '5Y', 'ALL'
  status TEXT NOT NULL, -- 'queued', 'running', 'success', 'partial', 'failed'
  requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  error_message TEXT
);
```

### Backend API

#### New Endpoints

```typescript
// GET /api/history/portfolio?range=1M
// Returns portfolio value history for specified range
{
  "range": "1M",
  "data": [
    { "date": "2024-01-01", "value": 100000, "cost": 95000, "pnl": 5000 },
    { "date": "2024-01-02", "value": 101000, "cost": 95000, "pnl": 6000 }
  ]
}

// GET /api/history/asset/:id?range=1M
// Returns price history for specific asset
{
  "assetId": "1",
  "symbol": "BTC",
  "range": "1M",
  "data": [
    { "date": "2024-01-01", "price": 42000 },
    { "date": "2024-01-02", "price": 43500 }
  ]
}

// POST /api/history/snapshot
// Manually trigger a portfolio snapshot
```

#### Services (API Backend)

**History Service** (`backend/src/services/priceHistoryService.ts`)

```typescript
export async function recordDailySnapshot(): Promise<void>
export async function getPortfolioHistory(range: string): Promise<HistoryPoint[]>
export async function getAssetHistory(assetId: number, range: string): Promise<AssetHistoryPoint[]>
```

**Collector Service (Decoupled)**

```typescript
// Runs in a separate process/service
// 1) Determine assets to fetch (holdings + optional watchlist)
// 2) Fetch daily close prices
// 3) Write price_history and price_snapshots
// 4) Record collector_runs for idempotency
export async function runDailyCollector(): Promise<void>;
export async function runBackfill(assetId: number, range: string): Promise<void>;
```

### Frontend Components

#### New Components

1. **PerformanceChart** - Main chart component using Recharts
2. **TimeRangeSelector** - Buttons for 1D, 1W, 1M, etc.
3. **BenchmarkToggle** - Checkbox to show/hide benchmarks
4. **AssetChartModal** - Modal for individual asset charts

#### API Client

```typescript
export interface PortfolioHistoryPoint {
  date: string;
  value: number;
  cost: number;
  pnl: number;
}

export const getPortfolioHistory = (range: string) => 
  api.get(`/history/portfolio`, { params: { range } }).then(r => r.data);

export const getAssetHistory = (assetId: number, range: string) => 
  api.get(`/history/asset/${assetId}`, { params: { range } }).then(r => r.data);
```

---

## UI/UX Design

### Dashboard Integration

```
┌─────────────────────────────────────────────────────────────┐
│  Portfolio Performance                    [1D][1W][1M][1Y] │
│                                                             │
│    $125K ┤                                          ╭─╮    │
│    $120K ┤                              ╭──────────╯  │    │
│    $115K ┤                  ╭───────────╯              │    │
│    $110K ┤      ╭──────────╯                          │    │
│    $105K ┤  ╭───╯                                     │    │
│    $100K ┼──╯                                          │    │
│          └────┬────┬────┬────┬────┬────┬────┬────┬────┘    │
│             Jan  Feb  Mar  Apr  May  Jun  Jul  Aug         │
│                                                             │
│  [✓] S&P 500 Benchmark    [✓] Show Cost Basis             │
└─────────────────────────────────────────────────────────────┘
```

---

## Tasks

### Phase 1: Backend (Week 1)
- [x] Create price snapshot service
- [x] Add history API routes
- [x] Implement portfolio history query
- [x] Implement asset history query
- [x] Set up scheduled snapshots (integrated with price refresh)
- [ ] Write unit tests for history service

### Phase 2: Frontend (Week 2)
- [x] Install Recharts dependencies (already installed)
- [x] Create PerformanceChart component
- [x] Create TimeRangeSelector component (integrated in PerformanceChart)
- [x] Add chart to Dashboard
- [x] Implement asset chart modal

### Phase 3: Polish (Week 3)
- [x] Add loading states
- [ ] Implement benchmark comparison
- [x] Add export chart button (basic implementation)
- [x] Responsive design for mobile
- [ ] Write E2E tests

---

## Data Collection Design (Summary)

### Asset Scope
- Track only assets in holdings (and optional watchlist/benchmarks).
- Do not attempt to maintain a full asset universe.

### Daily Backfill
- Backfill uses daily close (one record per day).
- Triggered when a user adds a new asset or imports transactions.
- Default range: 1Y (configurable). Longer ranges are optional.

### Idempotency
- Unique indexes on `(asset_id, timestamp)` for price history and `(snapshot_date)` for snapshots.
- `collector_runs` prevents duplicate daily runs.

---

## Dependencies

```json
{
  "backend": {
    "cron": "^3.0.0"
  },
  "frontend": {
    "recharts": "^2.0.0"
  }
}
```

---

## Success Metrics

- Charts load in < 2 seconds for 1Y data
- Supports at least 5 years of historical data
- Users can export chart as PNG

---

## Future Enhancements

- Compare multiple custom date ranges
- Annotations for significant events (deposits, major trades)
- Predictive trend lines
- Volatility overlay

---

*Last Updated: 2026-02-05*  
*Related: [Advanced Metrics](../advanced-metrics/roadmap.md)*
