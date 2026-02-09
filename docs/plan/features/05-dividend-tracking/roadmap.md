# Feature Roadmap: Dividend Tracking

> **Category:** Income  
> **Priority:** Medium  
> **Effort:** Medium  
> **Target Version:** v1.5  
> **Status:** Planned

---

## Overview

Track dividend and distribution income from stocks, ETFs, and other yield-bearing assets.

---

## Goals

1. Record dividend/distribution transactions
2. Track dividend income by asset and time period
3. Calculate dividend yield and yield on cost
4. Support DRIP (Dividend Reinvestment)

---

## User Stories

- As a user, I want to record dividends so that I can track my passive income
- As a user, I want to see my dividend yield so that I can evaluate income investments
- As a user, I want to see my annual dividend income so that I can plan my cash flow

---

## Features

### 1. Dividend Recording
- Manual dividend entry
- Auto-calculate from known dividend schedules (optional)
- Support for different dividend types (cash, stock, special)
- Fee/tax withholding tracking

### 2. Income Analytics
- Total dividend income by year/quarter/month
- Dividend yield (current and yield on cost)
- Dividend growth rate
- Income projection
- Top dividend payers in portfolio

### 3. DRIP Support
- Track dividend reinvestments
- Adjust cost basis for DRIP purchases
- Separate DRIP from regular buy transactions

### 4. Dividend Calendar
- Upcoming dividend dates (manual entry)
- Expected income forecast
- Ex-dividend date tracking

---

## Technical Implementation

### Database Schema

```sql
-- Dividends table
CREATE TABLE IF NOT EXISTS dividends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL REFERENCES assets(id),
  account_id INTEGER REFERENCES accounts(id),
  dividend_type TEXT DEFAULT 'cash', -- 'cash', 'stock', 'special'
  amount REAL NOT NULL, -- Dividend amount per share
  shares_held REAL NOT NULL, -- Shares owned at record date
  total_amount REAL NOT NULL, -- Total dividend received
  tax_withheld REAL DEFAULT 0,
  fee REAL DEFAULT 0,
  record_date DATE,
  payment_date DATE NOT NULL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dividends_asset ON dividends(asset_id);
CREATE INDEX IF NOT EXISTS idx_dividends_payment_date ON dividends(payment_date);

-- DRIP transactions (linked to dividends)
ALTER TABLE transactions ADD COLUMN dividend_id INTEGER REFERENCES dividends(id);
ALTER TABLE dividends ADD COLUMN dripped_shares REAL DEFAULT 0;
ALTER TABLE dividends ADD COLUMN dripped_price REAL;
```

### Backend API

#### New Endpoints

```typescript
// GET /api/dividends?asset_id=&year=&limit=
// List dividends with filters
{
  "dividends": [
    {
      "id": 1,
      "asset_id": 2,
      "asset_symbol": "AAPL",
      "asset_name": "Apple Inc",
      "dividend_type": "cash",
      "amount": 0.24,
      "shares_held": 100,
      "total_amount": 24.00,
      "tax_withheld": 3.60,
      "fee": 0,
      "payment_date": "2024-02-15",
      "dripped_shares": 0
    }
  ],
  "summary": {
    "total_dividends": 24.00,
    "total_tax": 3.60,
    "total_net": 20.40,
    "count": 1
  }
}

// POST /api/dividends
// Record new dividend
// Body: {
//   asset_id, dividend_type, amount, shares_held,
//   tax_withheld?, fee?, record_date?, payment_date, notes?
// }

// PUT /api/dividends/:id
// Update dividend

// DELETE /api/dividends/:id
// Delete dividend

// GET /api/dividends/summary?year=2024
// Get annual dividend summary
{
  "year": 2024,
  "total_gross": 1250.00,
  "total_tax": 187.50,
  "total_net": 1062.50,
  "monthly_breakdown": [
    { "month": 1, "amount": 100 },
    { "month": 2, "amount": 150 }
  ],
  "by_asset": [
    { "symbol": "AAPL", "amount": 500 },
    { "symbol": "MSFT", "amount": 400 }
  ]
}

// GET /api/dividends/yield/:asset_id
// Get dividend yield for asset
{
  "asset_id": 2,
  "symbol": "AAPL",
  "current_yield": 0.0055, // 0.55%
  "yield_on_cost": 0.0062, // 0.62%
  "annual_dividend_per_share": 0.96,
  "payout_frequency": "quarterly",
  "next_ex_date": "2024-05-10"
}
```

#### Services

**Dividend Service** (`backend/src/services/dividendService.ts`)

```typescript
export interface DividendRecord {
  id: number;
  assetId: number;
  type: 'cash' | 'stock' | 'special';
  amount: number;
  sharesHeld: number;
  totalAmount: number;
  paymentDate: Date;
}

export async function recordDividend(dividend: Omit<DividendRecord, 'id'>): Promise<DividendRecord>;
export async function getDividends(filters: DividendFilters): Promise<DividendRecord[]>;
export async function getAnnualSummary(year: number): Promise<AnnualDividendSummary>;
export async function calculateYield(assetId: number): Promise<YieldMetrics>;
export async function getDividendGrowth(assetId: number, years: number): Promise<number>;
```

### Frontend Components

#### New Components

1. **DividendTracker** - Main dividends page
2. **DividendCalendar** - Calendar view of payments
3. **DividendIncomeChart** - Monthly income chart
4. **YieldCard** - Yield metrics for an asset
5. **DividendModal** - Add/edit dividend

#### Dividends Page Layout

```
Dividend Tracker
┌─────────────────────────────────────────────────────────────┐
│  Dividend Income 2024                           [+ Record]  │
│                                                             │
│  ┌─────────────────┐ ┌─────────────────┐ ┌───────────────┐  │
│  │ Total Gross     │ │ Total Tax       │ │ Net Income    │  │
│  │ $1,250.00       │ │ $187.50         │ │ $1,062.50     │  │
│  └─────────────────┘ └─────────────────┘ └───────────────┘  │
│                                                             │
│  Monthly Income                                             │
│  [Bar chart showing monthly dividend income]                │
│                                                             │
│  Top Dividend Payers                                        │
│  1. AAPL - $500 (4 payments)                                │
│  2. MSFT - $400 (4 payments)                                │
│  3. VOO - $200 (4 payments)                                 │
│                                                             │
│  Recent Dividends                                           │
│  Date      | Asset | Type  | Gross  | Tax   | Net           │
│  2024-02-15| AAPL  | Cash  | $24.00 | $3.60 | $20.40        │
│  2024-02-01| MSFT  | Cash  | $40.00 | $6.00 | $34.00        │
└─────────────────────────────────────────────────────────────┘
```

---

## Tasks

### Phase 1: Backend (Week 1)
- [ ] Create dividends table schema
- [ ] Implement dividend CRUD API
- [ ] Create dividend summary service
- [ ] Add yield calculation
- [ ] Write unit tests

### Phase 2: Frontend (Week 2)
- [ ] Create DividendTracker page
- [ ] Create DividendCalendar component
- [ ] Create income chart
- [ ] Add dividend button to holdings
- [ ] Create DividendModal

### Phase 3: Advanced Features (Week 3)
- [ ] DRIP support
- [ ] Dividend growth calculation
- [ ] Income projection
- [ ] Export dividend report
- [ ] E2E tests

---

## Dependencies

None beyond existing stack.

---

## Future Enhancements

- Auto-fetch dividend schedules from API
- Dividend growth rate alerts
- Dividend aristocrat tracking
- Tax form generation (1099-DIV)
- Dividend reinvestment calculator

---

*Last Updated: 2026-02-05*
