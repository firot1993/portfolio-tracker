# Feature Roadmap: Multiple Portfolios

> **Category:** Portfolio Management  
> **Priority:** Medium  
> **Effort:** High  
> **Target Version:** v1.4  
> **Status:** Planned

---

## Overview

Allow users to create and manage multiple portfolios (e.g., "Retirement", "Trading", "HODL") with separate analytics and a consolidated view.

---

## Goals

1. Organize investments by purpose/strategy
2. Track performance separately for each portfolio
3. Compare performance across portfolios
4. View consolidated overview of all holdings

---

## User Stories

- As a user, I want separate portfolios for retirement and trading so that I can track different strategies
- As a user, I want to compare my retirement vs trading performance so that I know which strategy works better
- As a user, I want to see all my holdings in one view so that I know my total net worth

---

## Features

### 1. Portfolio Management
- Create multiple portfolios with name, description, color
- Set default portfolio
- Delete/archiving portfolios
- Transfer assets between portfolios

### 2. Portfolio-Specific Data
- Holdings per portfolio
- Transactions per portfolio
- Performance metrics per portfolio
- Separate P&L tracking

### 3. Consolidated View
- Combined portfolio summary
- Aggregated allocation across portfolios
- Total net worth across all portfolios
- Cross-portfolio analytics

### 4. Portfolio Comparison
- Side-by-side performance comparison
- Risk metrics comparison
- Allocation comparison
- Benchmark comparison per portfolio

---

## Technical Implementation

### Database Schema Changes

```sql
-- New portfolios table
CREATE TABLE IF NOT EXISTS portfolios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#0052CC', -- For UI theming
  is_default BOOLEAN DEFAULT 0,
  is_archived BOOLEAN DEFAULT 0,
  target_allocation JSON, -- { "crypto": 0.4, "stock_us": 0.6 }
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Add portfolio_id to existing tables
ALTER TABLE holdings ADD COLUMN portfolio_id INTEGER REFERENCES portfolios(id) DEFAULT 1;
ALTER TABLE transactions ADD COLUMN portfolio_id INTEGER REFERENCES portfolios(id) DEFAULT 1;

-- Migration: Create default portfolio for existing data
INSERT INTO portfolios (name, description, is_default, color)
VALUES ('Default', 'My main investment portfolio', 1, '#0052CC');

-- Update existing records to use default portfolio
UPDATE holdings SET portfolio_id = 1 WHERE portfolio_id IS NULL;
UPDATE transactions SET portfolio_id = 1 WHERE portfolio_id IS NULL;
```

### Backend API

#### New Endpoints

```typescript
// GET /api/portfolios
// List all portfolios
{
  "portfolios": [
    {
      "id": 1,
      "name": "Retirement",
      "description": "Long-term buy and hold",
      "color": "#0052CC",
      "is_default": true,
      "is_archived": false,
      "total_value": 150000,
      "total_cost": 120000,
      "total_pnl": 30000,
      "holding_count": 10,
      "created_at": "2024-01-01"
    },
    {
      "id": 2,
      "name": "Trading",
      "description": "Active trading account",
      "color": "#E60012",
      "is_default": false,
      "total_value": 25000,
      "total_cost": 20000,
      "total_pnl": 5000,
      "holding_count": 5
    }
  ]
}

// POST /api/portfolios
// Create new portfolio
// Body: { name, description?, color?, target_allocation? }

// PUT /api/portfolios/:id
// Update portfolio

// DELETE /api/portfolios/:id
// Delete portfolio (must be empty)

// POST /api/portfolios/:id/set-default
// Set as default portfolio

// POST /api/portfolios/:id/archive
// Archive portfolio

// GET /api/portfolios/summary
// Get consolidated view of all portfolios
{
  "consolidated": {
    "total_value": 175000,
    "total_cost": 140000,
    "total_pnl": 35000,
    "total_pnl_percent": 25
  },
  "by_portfolio": [
    { "id": 1, "name": "Retirement", "value": 150000, "percentage": 85.7 },
    { "id": 2, "name": "Trading", "value": 25000, "percentage": 14.3 }
  ],
  "combined_allocation": {
    "crypto": { "value": 70000, "percentage": 40 },
    "stock_us": { "value": 87500, "percentage": 50 },
    "gold": { "value": 17500, "percentage": 10 }
  }
}

// POST /api/portfolios/:id/transfer
// Transfer holdings to another portfolio
// Body: { target_portfolio_id, asset_id, quantity }
```

#### Modified Endpoints

Existing endpoints need to support `portfolio_id` filter:

```typescript
// GET /api/holdings?portfolio_id=1
// Get holdings for specific portfolio (omit for all)

// GET /api/transactions?portfolio_id=1
// Get transactions for specific portfolio

// GET /api/portfolio/summary?portfolio_id=1
// Get summary for specific portfolio (omit for consolidated)
```

#### Services

**Portfolio Service** (`backend/src/services/portfolioService.ts`)

```typescript
export interface Portfolio {
  id: number;
  name: string;
  description?: string;
  color: string;
  isDefault: boolean;
  isArchived: boolean;
  targetAllocation?: Record<string, number>;
}

export async function createPortfolio(portfolio: Omit<Portfolio, 'id'>): Promise<Portfolio>;
export async function getPortfolios(): Promise<Portfolio[]>;
export async function updatePortfolio(id: number, updates: Partial<Portfolio>): Promise<Portfolio>;
export async function deletePortfolio(id: number): Promise<void>;
export async function setDefaultPortfolio(id: number): Promise<void>;
export async function getConsolidatedSummary(): Promise<ConsolidatedSummary>;
export async function transferHolding(
  sourcePortfolioId: number,
  targetPortfolioId: number,
  assetId: number,
  quantity: number
): Promise<void>;
```

### Frontend Components

#### New Components

1. **PortfolioSelector** - Dropdown to switch portfolios
2. **PortfolioManager** - Manage portfolios page
3. **PortfolioCard** - Portfolio summary card
4. **CreatePortfolioModal** - Create new portfolio
5. **PortfolioComparison** - Compare multiple portfolios
6. **ConsolidatedDashboard** - Combined view

#### UI Layout

```
Portfolio Selector (in header)
┌─────────────────────────────────────────────────────────────┐
│  [📊 Portfolio ▼]  Retirement  $150K (+20%)    [+ New]      │
│                    Trading     $25K  (+25%)                 │
│                    [Consolidated View]                      │
└─────────────────────────────────────────────────────────────┘

Portfolio Manager
┌─────────────────────────────────────────────────────────────┐
│  My Portfolios                                    [+ Create]│
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 🔵 Retirement (Default)                               │  │
│  │    Long-term buy and hold                             │  │
│  │    Value: $150,000 | P&L: +$30,000 (+20%)             │  │
│  │    Holdings: 10                                       │  │
│  │    [View] [Edit] [Archive]                            │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │ 🔴 Trading                                            │  │
│  │    Active trading account                             │  │
│  │    Value: $25,000 | P&L: +$5,000 (+25%)               │  │
│  │    Holdings: 5                                        │  │
│  │    [View] [Edit] [Archive] [Set Default]              │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  Consolidated Overview                                      │
│  Total Value: $175,000 | Total P&L: +$35,000 (+20%)         │
│  [View Consolidated]                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Tasks

### Phase 1: Database & Backend (Week 1-2)
- [ ] Create portfolios table
- [ ] Add portfolio_id to holdings and transactions
- [ ] Migration script for existing data
- [ ] Implement portfolio CRUD API
- [ ] Update existing endpoints to support portfolio filter
- [ ] Implement consolidated summary
- [ ] Write tests

### Phase 2: Frontend Core (Week 3)
- [ ] Create PortfolioSelector component
- [ ] Create PortfolioManager page
- [ ] Create portfolio context/state management
- [ ] Update all existing pages to use selected portfolio
- [ ] Add portfolio selector to header

### Phase 3: Advanced Features (Week 4)
- [ ] Create consolidated dashboard
- [ ] Create portfolio comparison view
- [ ] Implement transfer between portfolios
- [ ] Add target allocation tracking
- [ ] E2E tests

---

## Dependencies

None beyond existing stack.

---

## Migration Strategy

1. Create portfolios table
2. Create default portfolio for all existing data
3. Add portfolio_id column (nullable initially)
4. Update all records to point to default portfolio
5. Make portfolio_id non-nullable
6. Update application code
7. Test thoroughly

---

## Future Enhancements

- Portfolio sharing (view-only links)
- Portfolio templates (aggressive, conservative, etc.)
- Automated rebalancing suggestions per portfolio
- Portfolio-specific alerts
- Portfolio performance benchmarking

---

*Last Updated: 2026-02-05*
