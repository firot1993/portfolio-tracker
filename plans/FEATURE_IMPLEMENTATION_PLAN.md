# Portfolio Tracker - Feature Implementation Plan

## Overview

This document outlines a step-by-step implementation plan for adding new functions to the Portfolio Tracker application. The plan prioritizes features based on user value, complexity, and dependencies.

---

## Phase 1: Foundation Features (Weeks 1-2)

### 1.1 Portfolio Rebalancing Suggestion Engine
**Priority**: HIGH  
**Complexity**: MEDIUM  
**Dependencies**: None  
**Estimated Effort**: 2-3 days

**Purpose**: Suggest trades to align current allocation with target allocation

**What it does**:
- Users set target allocation percentages (e.g., 40% crypto, 30% US stocks, 20% China stocks, 10% gold)
- System calculates current allocation
- Generates buy/sell suggestions to reach target allocation
- Shows impact of suggested trades

**Files to create/modify**:
- `backend/src/services/rebalancingService.ts` (NEW)
- `backend/src/routes/portfolio.ts` (MODIFY - add endpoint)
- `backend/src/db/index.ts` (MODIFY - add user_preferences table)
- `frontend/src/components/RebalancingWidget.tsx` (NEW)

**Database changes**:
```sql
CREATE TABLE user_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE REFERENCES users(id),
  target_allocation_crypto REAL DEFAULT 0.4,
  target_allocation_stock_us REAL DEFAULT 0.3,
  target_allocation_stock_cn REAL DEFAULT 0.2,
  target_allocation_gold REAL DEFAULT 0.1,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**API Endpoints**:
- `GET /api/portfolio/rebalance-suggestions` - Get rebalancing suggestions
- `POST /api/user/preferences` - Set target allocation
- `GET /api/user/preferences` - Get current preferences

**Frontend changes**:
- Add "Rebalancing" tab to dashboard
- Show current vs target allocation
- Display suggested trades with impact analysis

---

### 1.2 Advanced Portfolio Metrics
**Priority**: HIGH  
**Complexity**: MEDIUM  
**Dependencies**: Existing historical price data  
**Estimated Effort**: 2-3 days

**Purpose**: Calculate Sharpe ratio, Sortino ratio, max drawdown, CAGR

**What it does**:
- Calculates risk-adjusted returns (Sharpe ratio, Sortino ratio)
- Computes maximum drawdown from peak
- Calculates Compound Annual Growth Rate (CAGR)
- Provides volatility metrics
- Shows performance statistics for different time ranges

**Files to create/modify**:
- `backend/src/services/metricsService.ts` (NEW)
- `backend/src/routes/portfolio.ts` (MODIFY - add endpoint)
- `frontend/src/components/MetricsPanel.tsx` (NEW)

**API Endpoints**:
- `GET /api/portfolio/metrics?range=1M|3M|6M|1Y|ALL` - Get portfolio metrics
- `GET /api/portfolio/metrics/asset/:assetId?range=1M` - Get asset-specific metrics

**Frontend changes**:
- Add "Metrics" section to dashboard
- Display Sharpe ratio, Sortino ratio, max drawdown, CAGR
- Show volatility and risk metrics

---

### 1.3 Price Alert System
**Priority**: HIGH  
**Complexity**: MEDIUM  
**Dependencies**: None  
**Estimated Effort**: 3-4 days

**Purpose**: Notify users when assets hit price thresholds

**What it does**:
- Users create price alerts (e.g., "Alert me when BTC > $50,000")
- System checks prices periodically
- Triggers notifications when conditions are met
- Supports multiple alert types: above, below, percentage change

**Files to create/modify**:
- `backend/src/services/alertService.ts` (NEW)
- `backend/src/routes/alerts.ts` (NEW)
- `backend/src/db/index.ts` (MODIFY - add alerts table)
- `frontend/src/components/AlertManager.tsx` (NEW)

**Database changes**:
```sql
CREATE TABLE alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  asset_id INTEGER REFERENCES assets(id),
  alert_type TEXT NOT NULL, -- 'above', 'below', 'change_percent'
  threshold REAL NOT NULL,
  is_active BOOLEAN DEFAULT 1,
  triggered BOOLEAN DEFAULT 0,
  triggered_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE alert_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_id INTEGER REFERENCES alerts(id),
  triggered_price REAL NOT NULL,
  notified_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**API Endpoints**:
- `POST /api/alerts` - Create alert
- `GET /api/alerts` - List user's alerts
- `PUT /api/alerts/:id` - Update alert
- `DELETE /api/alerts/:id` - Delete alert
- `GET /api/alerts/:id/history` - Get alert trigger history

**Frontend changes**:
- Add "Alerts" management page
- Show active alerts with current prices
- Display alert history
- Quick create alert from holdings table

---

## Phase 2: Data Management Features (Weeks 3-4)

### 2.1 CSV Import/Export
**Priority**: HIGH  
**Complexity**: MEDIUM  
**Dependencies**: None  
**Estimated Effort**: 3-4 days

**Purpose**: Import transactions from brokerages, export portfolio data

**What it does**:
- Import transactions from CSV files (supports common brokerage formats)
- Export portfolio data (holdings, transactions, history)
- Validate imported data before insertion
- Show import preview with validation errors

**Files to create/modify**:
- `backend/src/services/csvService.ts` (NEW)
- `backend/src/routes/import-export.ts` (NEW)
- `frontend/src/components/ImportModal.tsx` (NEW)
- `frontend/src/components/ExportModal.tsx` (NEW)

**API Endpoints**:
- `POST /api/import/csv` - Import transactions from CSV
- `GET /api/import/preview` - Preview import without saving
- `GET /api/export/csv?type=transactions|holdings|portfolio` - Export data as CSV
- `GET /api/export/json?type=transactions|holdings|portfolio` - Export data as JSON

**Frontend changes**:
- Add "Import/Export" page
- Drag-and-drop CSV upload
- Preview imported data with validation
- Export options for different data types

---

### 2.2 Dividend & Income Tracking
**Priority**: MEDIUM  
**Complexity**: MEDIUM  
**Dependencies**: None  
**Estimated Effort**: 2-3 days

**Purpose**: Track dividend income, interest, and other distributions

**What it does**:
- Record dividend payments, interest, and other income
- Track income by asset and asset type
- Calculate total income for tax reporting
- Show income history and trends

**Files to create/modify**:
- `backend/src/routes/dividends.ts` (NEW)
- `backend/src/db/index.ts` (MODIFY - add dividends table)
- `frontend/src/components/DividendTracker.tsx` (NEW)

**Database changes**:
```sql
CREATE TABLE dividends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  asset_id INTEGER REFERENCES assets(id),
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'USD',
  ex_date DATETIME NOT NULL,
  payment_date DATETIME NOT NULL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**API Endpoints**:
- `POST /api/dividends` - Record dividend
- `GET /api/dividends` - List dividends with filters
- `PUT /api/dividends/:id` - Update dividend
- `DELETE /api/dividends/:id` - Delete dividend
- `GET /api/portfolio/income-summary` - Total income by asset/type

**Frontend changes**:
- Add "Income" section to dashboard
- Show dividend history table
- Display income by asset and type
- Add dividend entry form

---

### 2.3 Watchlist Management
**Priority**: MEDIUM  
**Complexity**: LOW  
**Dependencies**: None  
**Estimated Effort**: 1-2 days

**Purpose**: Track assets without owning them

**What it does**:
- Add/remove assets from watchlist
- View watchlist with current prices and price changes
- Quick add to portfolio from watchlist
- Sort and filter watchlist

**Files to create/modify**:
- `backend/src/routes/watchlist.ts` (NEW)
- `backend/src/db/index.ts` (MODIFY - add watchlist table)
- `frontend/src/components/WatchlistPanel.tsx` (NEW)

**Database changes**:
```sql
CREATE TABLE watchlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  asset_id INTEGER REFERENCES assets(id),
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, asset_id)
);
```

**API Endpoints**:
- `POST /api/watchlist` - Add to watchlist
- `GET /api/watchlist` - Get watchlist with prices
- `DELETE /api/watchlist/:assetId` - Remove from watchlist

**Frontend changes**:
- Add "Watchlist" tab to sidebar
- Show watchlist with current prices
- Quick actions to add to portfolio

---

## Phase 3: Advanced Analytics (Weeks 5-6)

### 3.1 Performance Benchmarking
**Priority**: MEDIUM  
**Complexity**: MEDIUM  
**Dependencies**: Metrics service  
**Estimated Effort**: 2-3 days

**Purpose**: Compare portfolio performance against market benchmarks

**What it does**:
- Compare portfolio returns to S&P 500, BTC, etc.
- Calculate alpha and beta
- Show correlation with benchmarks
- Display relative performance chart

**Files to create/modify**:
- `backend/src/services/benchmarkService.ts` (NEW)
- `backend/src/routes/portfolio.ts` (MODIFY - add endpoint)
- `frontend/src/components/BenchmarkChart.tsx` (NEW)

**API Endpoints**:
- `GET /api/portfolio/benchmark?benchmark=SPY|BTC|GOLD` - Compare to benchmark
- `GET /api/portfolio/benchmarks/available` - List available benchmarks

**Frontend changes**:
- Add "Benchmarks" section to analytics
- Show performance comparison chart
- Display alpha and beta metrics

---

### 3.2 Asset Correlation Analysis
**Priority**: MEDIUM  
**Complexity**: MEDIUM  
**Dependencies**: Historical price data  
**Estimated Effort**: 2-3 days

**Purpose**: Calculate correlation between assets in portfolio

**What it does**:
- Compute correlation matrix for portfolio assets
- Identify diversification opportunities
- Show correlation heatmap
- Suggest assets to reduce correlation

**Files to create/modify**:
- `backend/src/services/correlationService.ts` (NEW)
- `backend/src/routes/portfolio.ts` (MODIFY - add endpoint)
- `frontend/src/components/CorrelationMatrix.tsx` (NEW)

**API Endpoints**:
- `GET /api/portfolio/correlation-matrix?range=1M` - Get correlation matrix
- `GET /api/portfolio/diversification-score` - Calculate diversification score

**Frontend changes**:
- Add "Correlation" section to analytics
- Display correlation heatmap
- Show diversification recommendations

---

### 3.3 Tax Lot Tracking
**Priority**: MEDIUM  
**Complexity**: HIGH  
**Dependencies**: None  
**Estimated Effort**: 4-5 days

**Purpose**: Track cost basis using FIFO/LIFO/average cost methods

**What it does**:
- Track individual purchase lots for each asset
- Support FIFO, LIFO, and average cost methods
- Calculate realized and unrealized gains
- Generate tax reports

**Files to create/modify**:
- `backend/src/services/taxLotService.ts` (NEW)
- `backend/src/routes/tax-lots.ts` (NEW)
- `backend/src/db/index.ts` (MODIFY - add tax_lots table)
- `frontend/src/components/TaxLotViewer.tsx` (NEW)

**Database changes**:
```sql
CREATE TABLE tax_lots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  asset_id INTEGER REFERENCES assets(id),
  quantity REAL NOT NULL,
  cost_per_unit REAL NOT NULL,
  purchase_date DATETIME NOT NULL,
  sale_date DATETIME,
  realized_gain REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**API Endpoints**:
- `GET /api/tax-lots` - List tax lots
- `GET /api/tax-lots/report?year=2025` - Generate tax report
- `GET /api/tax-lots/realized-gains?year=2025` - Get realized gains

**Frontend changes**:
- Add "Tax" section to analytics
- Show tax lot details
- Display realized gains report

---

## Phase 4: Integration & Automation (Weeks 7-8)

### 4.1 Recurring Transactions (DCA)
**Priority**: LOW  
**Complexity**: MEDIUM  
**Dependencies**: None  
**Estimated Effort**: 2-3 days

**Purpose**: Dollar-cost averaging tracking

**What it does**:
- Set up recurring buy transactions
- Automatically create transactions on schedule
- Track DCA performance
- Show average cost over time

**Files to create/modify**:
- `backend/src/services/dcaService.ts` (NEW)
- `backend/src/routes/dca.ts` (NEW)
- `backend/src/db/index.ts` (MODIFY - add recurring_transactions table)

**Database changes**:
```sql
CREATE TABLE recurring_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  asset_id INTEGER REFERENCES assets(id),
  account_id INTEGER REFERENCES accounts(id),
  amount REAL NOT NULL,
  frequency TEXT NOT NULL, -- 'daily', 'weekly', 'monthly', 'quarterly', 'yearly'
  next_execution DATETIME NOT NULL,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

### 4.2 Stock Split Handling
**Priority**: LOW  
**Complexity**: MEDIUM  
**Dependencies**: Tax lot tracking  
**Estimated Effort**: 2-3 days

**Purpose**: Automatic adjustment of holdings and cost basis

**What it does**:
- Record stock splits
- Automatically adjust holdings and cost basis
- Update historical prices
- Maintain accurate tax lot records

---

### 4.3 Exchange API Sync
**Priority**: LOW  
**Complexity**: HIGH  
**Dependencies**: None  
**Estimated Effort**: 5-7 days

**Purpose**: Auto-sync with Binance, Coinbase, etc.

**What it does**:
- Connect to exchange APIs
- Auto-import transactions
- Sync holdings in real-time
- Support multiple exchanges

---

## Implementation Timeline

| Phase | Features | Timeline | Status |
|-------|----------|----------|--------|
| Phase 1 | Rebalancing, Metrics, Alerts | Weeks 1-2 | Not Started |
| Phase 2 | CSV Import/Export, Dividends, Watchlist | Weeks 3-4 | Not Started |
| Phase 3 | Benchmarking, Correlation, Tax Lots | Weeks 5-6 | Not Started |
| Phase 4 | DCA, Stock Splits, Exchange Sync | Weeks 7-8 | Not Started |

---

## Dependencies & Prerequisites

### Before starting Phase 1:
- [ ] Review existing database schema
- [ ] Understand current API structure
- [ ] Set up development environment
- [ ] Review AGENTS.md for coding standards

### Before starting Phase 2:
- [ ] Complete Phase 1 features
- [ ] Test Phase 1 features thoroughly

### Before starting Phase 3:
- [ ] Complete Phase 2 features
- [ ] Ensure historical data collection is working

### Before starting Phase 4:
- [ ] Complete Phase 3 features
- [ ] Plan exchange API integrations

---

## Testing Strategy

### Unit Tests
- Test each service function independently
- Mock external API calls
- Test edge cases and error handling

### Integration Tests
- Test API endpoints with real database
- Test data flow between services
- Test database migrations

### E2E Tests
- Test complete user workflows
- Test UI interactions
- Test data persistence

---

## Documentation Requirements

For each feature:
1. Update AGENTS.md with new endpoints
2. Create feature-specific documentation
3. Add code comments for complex logic
4. Update API endpoint list
5. Document database schema changes

---

## Success Criteria

- [ ] All features implemented according to spec
- [ ] 80%+ test coverage for new code
- [ ] All E2E tests passing
- [ ] Documentation complete and up-to-date
- [ ] No performance regressions
- [ ] User feedback positive

---

## Notes

- Each feature should be implemented in a separate branch
- Features should be tested independently before integration
- Database migrations should be reversible
- API endpoints should follow existing conventions
- Frontend components should follow existing patterns

---

*Last Updated: 2026-02-11*
*Next Review: After Phase 1 completion*
