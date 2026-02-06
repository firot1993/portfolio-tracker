# Feature Roadmap: Tax Reporting

> **Category:** Compliance  
> **Priority:** Low  
> **Effort:** High  
> **Target Version:** v2.1+  
> **Status:** Planned  
> **Dependencies:** [CSV Import/Export](../02-csv-import-export/roadmap.md)

---

## Overview

Generate tax reports for realized gains/losses, dividends, and other taxable events. Support for multiple jurisdictions and tax methods.

---

## Goals

1. Calculate realized gains/losses accurately
2. Support multiple cost basis methods (FIFO, LIFO, Average)
3. Generate tax reports for filing
4. Export to popular tax software formats

---

## User Stories

- As a user, I want to see my realized gains for the year so that I can file taxes accurately
- As a user, I want to choose FIFO or LIFO method so that I can optimize my tax burden
- As a user, I want to export to TurboTax so that I don't manually enter transactions

---

## Features

### 1. Cost Basis Methods
- FIFO (First In, First Out)
- LIFO (Last In, First Out)
- Average Cost (current)
- Specific Lot Selection (manual)
- HIFO (Highest In, First Out) - tax optimization

### 2. Realized Gains Report
- Annual realized gains/losses
- Short-term vs long-term classification
- Wash sale detection (US)
- Cost basis and proceeds for each sale

### 3. Dividend Reports
- Ordinary vs qualified dividends
- Foreign tax paid
- 1099-DIV equivalent

### 4. Tax Form Export
- Form 8949 (US Capital Gains)
- Schedule B (US Interest/Dividends)
- TurboTax TXF format
- CSV for accountants
- PDF report

### 5. Jurisdiction Support
- United States
- Canada
- United Kingdom
- Australia
- Generic (customizable)

---

## Technical Implementation

### Database Schema

```sql
-- Tax lots tracking
CREATE TABLE IF NOT EXISTS tax_lots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL REFERENCES assets(id),
  transaction_id INTEGER NOT NULL REFERENCES transactions(id),
  original_quantity REAL NOT NULL,
  remaining_quantity REAL NOT NULL,
  cost_basis REAL NOT NULL,
  purchase_date DATE NOT NULL,
  is_closed BOOLEAN DEFAULT 0,
  closed_date DATE,
  method TEXT DEFAULT 'FIFO' -- 'FIFO', 'LIFO', 'AVG', 'SPECIFIC'
);

CREATE INDEX IF NOT EXISTS idx_tax_lots_asset ON tax_lots(asset_id);
CREATE INDEX IF NOT EXISTS idx_tax_lots_open ON tax_lots(is_closed);

-- Realized gains tracking
CREATE TABLE IF NOT EXISTS realized_gains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL REFERENCES assets(id),
  sell_transaction_id INTEGER REFERENCES transactions(id),
  buy_lot_id INTEGER REFERENCES tax_lots(id),
  quantity REAL NOT NULL,
  proceeds REAL NOT NULL,
  cost_basis REAL NOT NULL,
  gain_loss REAL NOT NULL,
  is_long_term BOOLEAN, -- > 1 year holding
  purchase_date DATE,
  sale_date DATE,
  wash_sale_adjusted BOOLEAN DEFAULT 0,
  wash_sale_disallowed_loss REAL DEFAULT 0,
  tax_year INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_realized_gains_year ON realized_gains(tax_year);
CREATE INDEX IF NOT EXISTS idx_realized_gains_asset ON realized_gains(asset_id);
```

### Backend API

#### New Endpoints

```typescript
// GET /api/tax/realized-gains?year=2024&method=FIFO
// Calculate realized gains for tax year
{
  "year": 2024,
  "method": "FIFO",
  "summary": {
    "short_term_gains": 5000,
    "short_term_losses": -2000,
    "long_term_gains": 15000,
    "long_term_losses": -1000,
    "net_short_term": 3000,
    "net_long_term": 14000,
    "total_gain_loss": 17000
  },
  "transactions": [
    {
      "asset_symbol": "BTC",
      "sale_date": "2024-03-15",
      "purchase_date": "2023-01-10",
      "quantity": 0.5,
      "proceeds": 25000,
      "cost_basis": 20000,
      "gain_loss": 5000,
      "is_long_term": true,
      "is_wash_sale": false
    }
  ],
  "wash_sales": []
}

// POST /api/tax/calculate
// Recalculate gains with different method
// Body: { year, method }

// GET /api/tax/dividends?year=2024
// Dividend income report
{
  "year": 2024,
  "summary": {
    "total_ordinary": 1200,
    "total_qualified": 800,
    "total_foreign_tax": 50
  },
  "details": [
    {
      "asset_symbol": "AAPL",
      "payment_date": "2024-02-15",
      "amount": 50,
      "is_qualified": true
    }
  ]
}

// GET /api/tax/export/8949?year=2024&format=csv
// Export Form 8949 data
// Returns CSV file

// GET /api/tax/export/turbotax?year=2024
// Export TurboTax TXF file

// GET /api/tax/lots/:asset_id
// View tax lots for an asset
{
  "asset_id": 1,
  "symbol": "BTC",
  "lots": [
    {
      "id": 1,
      "purchase_date": "2023-01-10",
      "original_quantity": 1.0,
      "remaining_quantity": 0.5,
      "cost_basis": 40000,
      "is_closed": false
    }
  ]
}

// POST /api/tax/lots/:lot_id/assign
// Manually assign lot to sale (specific lot method)
// Body: { sell_transaction_id, quantity }
```

#### Services

**Tax Service** (`backend/src/services/taxService.ts`)

```typescript
export type CostBasisMethod = 'FIFO' | 'LIFO' | 'AVG' | 'HIFO' | 'SPECIFIC';

export interface RealizedGain {
  assetId: number;
  symbol: string;
  quantity: number;
  proceeds: number;
  costBasis: number;
  gainLoss: number;
  isLongTerm: boolean;
  purchaseDate: Date;
  saleDate: Date;
  isWashSale: boolean;
}

export async function calculateRealizedGains(
  year: number,
  method: CostBasisMethod
): Promise<RealizedGain[]>;

export async function detectWashSales(
  year: number
): Promise<WashSale[]>;

export async function generateForm8949(
  year: number,
  format: 'csv' | 'pdf' | 'txf'
): Promise<Buffer>;

export async function getOpenTaxLots(
  assetId: number
): Promise<TaxLot[]>;

// Recalculate all gains with new method
export async function recalculateGains(
  method: CostBasisMethod
): Promise<void>;
```

**Cost Basis Engine**

```typescript
// Calculate gains using FIFO
export function calculateFIFO(
  buys: Transaction[],
  sells: Transaction[]
): RealizedGain[];

// Calculate gains using LIFO
export function calculateLIFO(
  buys: Transaction[],
  sells: Transaction[]
): RealizedGain[];

// Detect wash sales
export function detectWashSales(
  sales: RealizedGain[],
  repurchases: Transaction[]
): WashSale[];
```

### Frontend Components

#### New Components

1. **TaxDashboard** - Main tax page
2. **RealizedGainsTable** - Detailed gains/losses
3. **TaxMethodSelector** - Choose cost basis method
4. **TaxExportPanel** - Export options
5. **TaxLotViewer** - View and manage tax lots

#### Tax Dashboard Layout

```
Tax Center 2024
┌─────────────────────────────────────────────────────────────┐
│  Tax Year: [2024 ▼]  Method: [FIFO ▼]    [Export Report]    │
│                                                             │
│  Summary                                                    │
│  ┌─────────────────┐ ┌─────────────────┐ ┌───────────────┐  │
│  │ Short-Term      │ │ Long-Term       │ │ Total         │  │
│  │ Gains: $5,000   │ │ Gains: $15,000  │ │ Gains: $20,000│  │
│  │ Losses: -$2,000 │ │ Losses: -$1,000 │ │ Losses: -$3,00│  │
│  │ Net: $3,000     │ │ Net: $14,000    │ │ Net: $17,000  │  │
│  └─────────────────┘ └─────────────────┘ └───────────────┘  │
│                                                             │
│  Realized Gains                                             │
│  Asset | Sale Date | Qty | Proceeds | Cost Basis | Gain/Loss│
│  BTC   | 2024-03-15| 0.5 | $25,000 | $20,000   | +$5,000  │
│                                                             │
│  Wash Sales Detected: 0                                     │
│                                                             │
│  Export Options                                             │
│  [Form 8949 CSV] [TurboTax] [PDF Report] [Accountant CSV]   │
└─────────────────────────────────────────────────────────────┘
```

---

## Tasks

### Phase 1: Core Engine (Week 1-2)
- [ ] Create tax_lots and realized_gains tables
- [ ] Implement FIFO calculation
- [ ] Implement LIFO calculation
- [ ] Implement average cost calculation
- [ ] Add tax lot tracking to transaction processing

### Phase 2: Wash Sale Detection (Week 3)
- [ ] Implement wash sale detection algorithm
- [ ] Calculate disallowed losses
- [ ] Adjust cost basis for replacement shares
- [ ] Generate wash sale report

### Phase 3: Frontend & Export (Week 4)
- [ ] Create TaxDashboard page
- [ ] Create RealizedGainsTable
- [ ] Add method selector
- [ ] Implement Form 8949 export
- [ ] Implement TurboTax export

---

## Dependencies

```json
{
  "backend": {
    "pdfkit": "^0.14.0" // For PDF generation
  }
}
```

---

## Jurisdiction-Specific Notes

### United States
- Short-term vs long-term (1 year threshold)
- Wash sale rules (30 days)
- Form 8949 and Schedule D
- 1099-B matching

### Canada
- Superficial loss rules (similar to wash sale)
- Adjusted cost base (ACB)
- Capital gains inclusion rate

### UK
- Same-day and 30-day bed and breakfast rules
- Section 104 pools
- Annual exempt amount

### Australia
- CGT discount (50% for held > 1 year)
- FIFO only for shares
- Wash sale provisions

---

## Future Enhancements

- Automatic 1099-B import
- Tax loss harvesting suggestions
- Estimated quarterly tax payments
- State tax calculations
- Crypto-specific guidance (airdrops, forks, mining)
- NFT tax handling
- DeFi tax support (yield farming, liquidity mining)

---

*Last Updated: 2026-02-05*  
*Related: [Dividend Tracking](../05-dividend-tracking/roadmap.md)*
