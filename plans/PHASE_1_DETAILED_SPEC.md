# Phase 1: Foundation Features - Detailed Specification

## Overview

Phase 1 focuses on implementing three core features that provide immediate value to users:
1. Portfolio Rebalancing Suggestion Engine
2. Advanced Portfolio Metrics
3. Price Alert System

This document provides detailed specifications for implementing Phase 1.

---

## 1. Portfolio Rebalancing Suggestion Engine

### 1.1 Feature Overview

**Goal**: Help users maintain their target asset allocation by suggesting buy/sell trades.

**User Story**: 
> As an investor, I want to set target allocation percentages for my portfolio (e.g., 40% crypto, 30% US stocks, 20% China stocks, 10% gold) and receive suggestions on which assets to buy or sell to reach those targets.

### 1.2 Technical Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React)                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  RebalancingWidget.tsx                               │   │
│  │  - Display current vs target allocation              │   │
│  │  - Show suggested trades                             │   │
│  │  - Allow user to set target allocation               │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    Backend (Express)                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  routes/portfolio.ts                                 │   │
│  │  - GET /api/portfolio/rebalance-suggestions          │   │
│  │  - POST /api/user/preferences                        │   │
│  │  - GET /api/user/preferences                         │   │
│  └──────────────────────────────────────────────────────┘   │
│                            ↓                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  services/rebalancingService.ts                      │   │
│  │  - calculateCurrentAllocation()                      │   │
│  │  - calculateRebalancingSuggestions()                 │   │
│  │  - estimateTradeImpact()                             │   │
│  └──────────────────────────────────────────────────────┘   │
│                            ↓                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  db/index.ts                                         │   │
│  │  - user_preferences table                            │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 Database Schema

```sql
-- Store user's target allocation preferences
CREATE TABLE user_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  target_allocation_crypto REAL DEFAULT 0.4,
  target_allocation_stock_us REAL DEFAULT 0.3,
  target_allocation_stock_cn REAL DEFAULT 0.2,
  target_allocation_gold REAL DEFAULT 0.1,
  rebalance_threshold REAL DEFAULT 0.05, -- Trigger rebalancing if allocation drifts > 5%
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 1.4 API Endpoints

#### 1.4.1 Get Rebalancing Suggestions
```
GET /api/portfolio/rebalance-suggestions

Query Parameters:
  - threshold: number (optional, default: 0.05) - Only suggest trades if allocation drifts > threshold

Response:
{
  "currentAllocation": {
    "crypto": 0.45,
    "stock_us": 0.25,
    "stock_cn": 0.20,
    "gold": 0.10
  },
  "targetAllocation": {
    "crypto": 0.40,
    "stock_us": 0.30,
    "stock_cn": 0.20,
    "gold": 0.10
  },
  "suggestions": [
    {
      "action": "sell",
      "assetType": "crypto",
      "currentValue": 5625,
      "targetValue": 5000,
      "difference": 625,
      "percentOfPortfolio": 0.05,
      "reason": "Crypto allocation is 5% above target"
    },
    {
      "action": "buy",
      "assetType": "stock_us",
      "currentValue": 3125,
      "targetValue": 3750,
      "difference": 625,
      "percentOfPortfolio": 0.05,
      "reason": "US stocks allocation is 5% below target"
    }
  ],
  "totalPortfolioValue": 12500,
  "rebalancingNeeded": true
}
```

#### 1.4.2 Set User Preferences
```
POST /api/user/preferences

Request Body:
{
  "target_allocation_crypto": 0.40,
  "target_allocation_stock_us": 0.30,
  "target_allocation_stock_cn": 0.20,
  "target_allocation_gold": 0.10,
  "rebalance_threshold": 0.05
}

Response:
{
  "success": true,
  "preferences": {
    "id": 1,
    "user_id": 1,
    "target_allocation_crypto": 0.40,
    "target_allocation_stock_us": 0.30,
    "target_allocation_stock_cn": 0.20,
    "target_allocation_gold": 0.10,
    "rebalance_threshold": 0.05,
    "updated_at": "2026-02-11T12:43:39.000Z"
  }
}
```

#### 1.4.3 Get User Preferences
```
GET /api/user/preferences

Response:
{
  "success": true,
  "preferences": {
    "id": 1,
    "user_id": 1,
    "target_allocation_crypto": 0.40,
    "target_allocation_stock_us": 0.30,
    "target_allocation_stock_cn": 0.20,
    "target_allocation_gold": 0.10,
    "rebalance_threshold": 0.05,
    "updated_at": "2026-02-11T12:43:39.000Z"
  }
}
```

### 1.5 Implementation Steps

1. **Database Migration**
   - Add `user_preferences` table
   - Create migration script

2. **Backend Service** (`rebalancingService.ts`)
   - `calculateCurrentAllocation(userId)` - Calculate current allocation by asset type
   - `getTargetAllocation(userId)` - Get user's target allocation
   - `calculateRebalancingSuggestions(userId, threshold)` - Generate suggestions
   - `estimateTradeImpact(suggestions)` - Show impact of suggested trades

3. **Backend Routes** (modify `routes/portfolio.ts`)
   - Add `GET /api/portfolio/rebalance-suggestions`
   - Add `POST /api/user/preferences`
   - Add `GET /api/user/preferences`

4. **Frontend Component** (`RebalancingWidget.tsx`)
   - Display current vs target allocation (side-by-side bars)
   - Show suggested trades with action buttons
   - Allow user to set target allocation
   - Show rebalancing impact

5. **Testing**
   - Unit tests for rebalancing calculations
   - Integration tests for API endpoints
   - E2E tests for UI workflow

### 1.6 Edge Cases & Validation

- **Allocation percentages must sum to 100%**: Validate in POST endpoint
- **Negative allocations not allowed**: Validate each percentage >= 0
- **Threshold must be between 0 and 1**: Validate threshold parameter
- **No holdings**: Return empty suggestions if user has no holdings
- **Single asset type**: Handle portfolios with only one asset type

---

## 2. Advanced Portfolio Metrics

### 2.1 Feature Overview

**Goal**: Provide professional-grade portfolio analytics including Sharpe ratio, Sortino ratio, max drawdown, and CAGR.

**User Story**:
> As a serious investor, I want to see advanced metrics like Sharpe ratio, Sortino ratio, maximum drawdown, and CAGR to understand my portfolio's risk-adjusted returns.

### 2.2 Technical Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React)                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  MetricsPanel.tsx                                    │   │
│  │  - Display Sharpe ratio, Sortino ratio               │   │
│  │  - Show max drawdown, CAGR                           │   │
│  │  - Time range selector (1M, 3M, 6M, 1Y, ALL)         │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    Backend (Express)                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  routes/portfolio.ts                                 │   │
│  │  - GET /api/portfolio/metrics                        │   │
│  │  - GET /api/portfolio/metrics/asset/:assetId         │   │
│  └──────────────────────────────────────────────────────┘   │
│                            ↓                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  services/metricsService.ts                          │   │
│  │  - calculateSharpeRatio()                            │   │
│  │  - calculateSortinoRatio()                           │   │
│  │  - calculateMaxDrawdown()                            │   │
│  │  - calculateCAGR()                                   │   │
│  │  - calculateVolatility()                             │   │
│  └──────────────────────────────────────────────────────┘   │
│                            ↓                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  services/priceHistoryService.ts                     │   │
│  │  - getPortfolioHistory()                             │   │
│  │  - getAssetHistory()                                 │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 Metrics Definitions

#### 2.3.1 Sharpe Ratio
```
Sharpe Ratio = (Portfolio Return - Risk-Free Rate) / Portfolio Volatility

Where:
- Portfolio Return = (Ending Value - Starting Value) / Starting Value
- Risk-Free Rate = 4% (US Treasury rate, configurable)
- Portfolio Volatility = Standard deviation of daily returns

Interpretation:
- > 1.0: Good risk-adjusted returns
- > 2.0: Very good risk-adjusted returns
- > 3.0: Excellent risk-adjusted returns
```

#### 2.3.2 Sortino Ratio
```
Sortino Ratio = (Portfolio Return - Risk-Free Rate) / Downside Volatility

Where:
- Downside Volatility = Standard deviation of negative returns only

Interpretation:
- Similar to Sharpe ratio but only penalizes downside volatility
- Better for portfolios with asymmetric return distributions
```

#### 2.3.3 Maximum Drawdown
```
Max Drawdown = (Trough Value - Peak Value) / Peak Value

Where:
- Peak Value = Highest portfolio value before the drawdown
- Trough Value = Lowest portfolio value during the drawdown

Interpretation:
- -20%: Portfolio lost 20% from its peak
- Measures worst-case loss from peak to trough
```

#### 2.3.4 CAGR (Compound Annual Growth Rate)
```
CAGR = (Ending Value / Starting Value) ^ (1 / Number of Years) - 1

Interpretation:
- 10%: Portfolio grew 10% per year on average
- Smooths out volatility to show average annual growth
```

#### 2.3.5 Volatility
```
Volatility = Standard Deviation of Daily Returns

Interpretation:
- 15%: Portfolio returns vary by ~15% on average
- Higher volatility = higher risk
```

### 2.4 API Endpoints

#### 2.4.1 Get Portfolio Metrics
```
GET /api/portfolio/metrics?range=1M

Query Parameters:
  - range: '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | 'YTD' | 'ALL' (default: '1M')
  - riskFreeRate: number (optional, default: 0.04) - Annual risk-free rate

Response:
{
  "success": true,
  "data": {
    "range": "1M",
    "startDate": "2026-01-11",
    "endDate": "2026-02-11",
    "startValue": 10000,
    "endValue": 10500,
    "totalReturn": 0.05,
    "annualizedReturn": 0.60,
    "sharpeRatio": 1.25,
    "sortinoRatio": 1.85,
    "maxDrawdown": -0.08,
    "cagr": 0.60,
    "volatility": 0.12,
    "downside_volatility": 0.08,
    "bestDay": 0.025,
    "worstDay": -0.035,
    "winningDays": 15,
    "losingDays": 5,
    "winRate": 0.75
  },
  "meta": {
    "range": "1M",
    "dataPoints": 21
  }
}
```

#### 2.4.2 Get Asset-Specific Metrics
```
GET /api/portfolio/metrics/asset/:assetId?range=1M

Response:
{
  "success": true,
  "data": {
    "assetId": 1,
    "symbol": "BTC",
    "range": "1M",
    "startDate": "2026-01-11",
    "endDate": "2026-02-11",
    "startPrice": 42000,
    "endPrice": 43500,
    "totalReturn": 0.0357,
    "sharpeRatio": 1.15,
    "sortinoRatio": 1.65,
    "maxDrawdown": -0.12,
    "volatility": 0.18,
    "correlation_with_portfolio": 0.85
  }
}
```

### 2.5 Implementation Steps

1. **Backend Service** (`metricsService.ts`)
   - `calculateSharpeRatio(returns, riskFreeRate)` - Calculate Sharpe ratio
   - `calculateSortinoRatio(returns, riskFreeRate)` - Calculate Sortino ratio
   - `calculateMaxDrawdown(prices)` - Calculate maximum drawdown
   - `calculateCAGR(startValue, endValue, years)` - Calculate CAGR
   - `calculateVolatility(returns)` - Calculate volatility
   - `calculateDownsideVolatility(returns)` - Calculate downside volatility
   - `getPortfolioMetrics(userId, range, riskFreeRate)` - Main function

2. **Backend Routes** (modify `routes/portfolio.ts`)
   - Add `GET /api/portfolio/metrics`
   - Add `GET /api/portfolio/metrics/asset/:assetId`

3. **Frontend Component** (`MetricsPanel.tsx`)
   - Display metrics in card layout
   - Show time range selector
   - Display metric explanations on hover
   - Color-code metrics (green for good, red for bad)

4. **Testing**
   - Unit tests for each metric calculation
   - Integration tests with real historical data
   - E2E tests for UI

### 2.6 Edge Cases & Validation

- **Insufficient data**: Return error if less than 2 data points
- **All positive returns**: Sortino ratio = Sharpe ratio
- **No negative returns**: Downside volatility = 0
- **Single day range**: Cannot calculate volatility
- **Future dates**: Validate date range is in the past

---

## 3. Price Alert System

### 3.1 Feature Overview

**Goal**: Notify users when asset prices hit specified thresholds.

**User Story**:
> As an investor, I want to set price alerts (e.g., "Alert me when BTC > $50,000") so I can catch buying/selling opportunities without constantly monitoring prices.

### 3.2 Technical Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React)                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  AlertManager.tsx                                    │   │
│  │  - Create/edit/delete alerts                         │   │
│  │  - Show active alerts with current prices            │   │
│  │  - Display alert history                             │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    Backend (Express)                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  routes/alerts.ts                                    │   │
│  │  - POST /api/alerts                                  │   │
│  │  - GET /api/alerts                                   │   │
│  │  - PUT /api/alerts/:id                               │   │
│  │  - DELETE /api/alerts/:id                            │   │
│  │  - GET /api/alerts/:id/history                       │   │
│  └──────────────────────────────────────────────────────┘   │
│                            ↓                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  services/alertService.ts                            │   │
│  │  - checkAlerts() - Run periodically                  │   │
│  │  - triggerAlert()                                    │   │
│  │  - sendNotification()                                │   │
│  └──────────────────────────────────────────────────────┘   │
│                            ↓                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  db/index.ts                                         │   │
│  │  - alerts table                                      │   │
│  │  - alert_notifications table                         │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 Database Schema

```sql
-- Store user's price alerts
CREATE TABLE alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  asset_id INTEGER REFERENCES assets(id),
  alert_type TEXT NOT NULL, -- 'above', 'below', 'change_percent'
  threshold REAL NOT NULL,
  is_active BOOLEAN DEFAULT 1,
  triggered BOOLEAN DEFAULT 0,
  triggered_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, asset_id, alert_type, threshold)
);

-- Track alert trigger history
CREATE TABLE alert_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_id INTEGER REFERENCES alerts(id) ON DELETE CASCADE,
  triggered_price REAL NOT NULL,
  notified_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 3.4 API Endpoints

#### 3.4.1 Create Alert
```
POST /api/alerts

Request Body:
{
  "asset_id": 1,
  "alert_type": "above", -- 'above', 'below', 'change_percent'
  "threshold": 50000,
  "is_active": true
}

Response:
{
  "success": true,
  "alert": {
    "id": 1,
    "user_id": 1,
    "asset_id": 1,
    "asset_symbol": "BTC",
    "alert_type": "above",
    "threshold": 50000,
    "is_active": true,
    "triggered": false,
    "created_at": "2026-02-11T12:43:39.000Z"
  }
}
```

#### 3.4.2 Get Alerts
```
GET /api/alerts?is_active=true

Query Parameters:
  - is_active: boolean (optional) - Filter by active status
  - asset_id: number (optional) - Filter by asset

Response:
{
  "success": true,
  "alerts": [
    {
      "id": 1,
      "user_id": 1,
      "asset_id": 1,
      "asset_symbol": "BTC",
      "asset_name": "Bitcoin",
      "alert_type": "above",
      "threshold": 50000,
      "current_price": 43500,
      "is_active": true,
      "triggered": false,
      "created_at": "2026-02-11T12:43:39.000Z"
    }
  ]
}
```

#### 3.4.3 Update Alert
```
PUT /api/alerts/:id

Request Body:
{
  "threshold": 51000,
  "is_active": true
}

Response:
{
  "success": true,
  "alert": { ... }
}
```

#### 3.4.4 Delete Alert
```
DELETE /api/alerts/:id

Response:
{
  "success": true,
  "message": "Alert deleted"
}
```

#### 3.4.5 Get Alert History
```
GET /api/alerts/:id/history

Response:
{
  "success": true,
  "alert": { ... },
  "history": [
    {
      "id": 1,
      "triggered_price": 50100,
      "notified_at": "2026-02-10T15:30:00.000Z"
    }
  ]
}
```

### 3.5 Implementation Steps

1. **Database Migration**
   - Add `alerts` table
   - Add `alert_notifications` table
   - Create migration script

2. **Backend Service** (`alertService.ts`)
   - `checkAlerts()` - Check all active alerts against current prices
   - `triggerAlert(alertId, currentPrice)` - Trigger an alert
   - `sendNotification(userId, alert, currentPrice)` - Send notification
   - `resetTriggeredAlerts()` - Reset triggered alerts daily

3. **Backend Routes** (`routes/alerts.ts`)
   - `POST /api/alerts` - Create alert
   - `GET /api/alerts` - List alerts
   - `PUT /api/alerts/:id` - Update alert
   - `DELETE /api/alerts/:id` - Delete alert
   - `GET /api/alerts/:id/history` - Get alert history

4. **Alert Checker Job**
   - Run every 5 minutes to check alerts
   - Use existing price fetching service
   - Trigger notifications when thresholds are met

5. **Frontend Component** (`AlertManager.tsx`)
   - Create alert form with asset selector
   - Display active alerts with current prices
   - Show alert history
   - Quick create alert from holdings table

6. **Testing**
   - Unit tests for alert checking logic
   - Integration tests for API endpoints
   - E2E tests for alert creation and triggering

### 3.6 Edge Cases & Validation

- **Duplicate alerts**: Prevent duplicate alert_type + threshold combinations
- **Invalid thresholds**: Validate threshold > 0
- **Asset not found**: Return error if asset doesn't exist
- **Alert already triggered**: Don't trigger same alert twice
- **Inactive alerts**: Don't check inactive alerts

---

## Implementation Order

1. **Start with Portfolio Rebalancing** (simplest, no external dependencies)
2. **Then Advanced Metrics** (uses existing historical data)
3. **Finally Price Alerts** (requires background job setup)

---

## Testing Strategy

### Unit Tests
- Test each calculation function independently
- Mock database queries
- Test edge cases

### Integration Tests
- Test API endpoints with real database
- Test data flow between services
- Test database migrations

### E2E Tests
- Test complete user workflows
- Test UI interactions
- Test data persistence

---

## Success Criteria

- [ ] All three features implemented
- [ ] 80%+ test coverage for new code
- [ ] All E2E tests passing
- [ ] No performance regressions
- [ ] Documentation complete
- [ ] Code follows project conventions

---

*Last Updated: 2026-02-11*
