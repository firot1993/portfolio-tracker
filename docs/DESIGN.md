# Portfolio Tracker - Design Document

## Overview

A personal investment tracking application to monitor and analyze holdings across multiple asset classes:
- **Cryptocurrency** (BTC, ETH, etc.)
- **US Stocks** (NYSE, NASDAQ)
- **China Stocks** (Shanghai, Shenzhen A-shares)
- **Gold** (spot price, physical holdings)

## Goals

1. **Unified Dashboard** - Single view of total portfolio value across all asset classes
2. **Real-time Pricing** - Automatic price updates from reliable data sources
3. **Performance Tracking** - P&L, gains/losses, historical performance charts
4. **Multi-currency Support** - USD, CNY, with automatic conversion
5. **Simple Data Entry** - Easy to add/edit transactions

## Tech Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Frontend | React + TypeScript | Modern, type-safe, rich ecosystem |
| UI Framework | Tailwind CSS + shadcn/ui | Fast styling, beautiful components |
| Backend | Node.js + Express | Simple, JavaScript ecosystem consistency |
| Database | SQLite | Zero config, portable, sufficient for personal use |
| Charts | Recharts | React-native, good for financial data |

## Data Sources

| Asset Class | Primary API | Backup API | Update Frequency |
|-------------|-------------|------------|------------------|
| Crypto | CoinGecko (free tier) | Binance API | Real-time / 1 min |
| US Stocks | Yahoo Finance (yfinance) | Alpha Vantage | 15 min delay (free) |
| China A-Shares | Tushare / AKShare | Sina Finance | 15 min delay |
| Gold | Gold-API.io | Metals.live | Hourly |
| FX Rates | ExchangeRate-API | Fixer.io | Daily |

## Data Model

### Core Entities

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     Account     │     │      Asset      │     │   Transaction   │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ id              │     │ id              │     │ id              │
│ name            │     │ symbol          │     │ asset_id        │
│ type (exchange/ │     │ name            │     │ account_id      │
│   broker/wallet)│     │ type (crypto/   │     │ type (buy/sell) │
│ currency        │     │   stock_us/     │     │ quantity        │
│ created_at      │     │   stock_cn/gold)│     │ price           │
└─────────────────┘     │ exchange        │     │ fee             │
                        │ currency        │     │ date            │
                        └─────────────────┘     │ notes           │
                                                └─────────────────┘

┌─────────────────┐     ┌─────────────────┐
│    Holding      │     │   PriceHistory  │
├─────────────────┤     ├─────────────────┤
│ id              │     │ id              │
│ asset_id        │     │ asset_id        │
│ account_id      │     │ price           │
│ quantity        │     │ currency        │
│ avg_cost        │     │ timestamp       │
│ updated_at      │     └─────────────────┘
└─────────────────┘
```

### Database Schema

```sql
CREATE TABLE accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'exchange', 'broker', 'wallet', 'bank'
    currency TEXT DEFAULT 'USD',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'crypto', 'stock_us', 'stock_cn', 'gold'
    exchange TEXT, -- 'binance', 'NYSE', 'SSE', 'SZSE'
    currency TEXT DEFAULT 'USD'
);

CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER REFERENCES assets(id),
    account_id INTEGER REFERENCES accounts(id),
    type TEXT NOT NULL, -- 'buy', 'sell', 'transfer_in', 'transfer_out'
    quantity REAL NOT NULL,
    price REAL NOT NULL,
    fee REAL DEFAULT 0,
    date DATETIME NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE holdings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER REFERENCES assets(id),
    account_id INTEGER REFERENCES accounts(id),
    quantity REAL NOT NULL,
    avg_cost REAL NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(asset_id, account_id)
);

CREATE TABLE price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER REFERENCES assets(id),
    price REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Project Structure

```
portfolio-tracker/
├── docs/
│   └── DESIGN.md
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── PortfolioChart.tsx
│   │   │   ├── AssetList.tsx
│   │   │   ├── TransactionForm.tsx
│   │   │   └── ...
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── types/
│   │   └── App.tsx
│   ├── package.json
│   └── vite.config.ts
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   ├── services/
│   │   │   ├── priceService.ts
│   │   │   ├── cryptoApi.ts
│   │   │   ├── stockUsApi.ts
│   │   │   ├── stockCnApi.ts
│   │   │   └── goldApi.ts
│   │   ├── db/
│   │   └── index.ts
│   ├── package.json
│   └── data/
│       └── portfolio.db
├── package.json
└── README.md
```

## Key Features

### Phase 1 - MVP
- [ ] Manual transaction entry (buy/sell)
- [ ] Asset price fetching (all 4 types)
- [ ] Portfolio summary dashboard
- [ ] Holdings list with current value & P&L
- [ ] Basic pie chart allocation view

### Phase 2 - Enhanced
- [ ] Historical performance charts
- [ ] Multi-account support
- [ ] CSV import for transactions
- [ ] Currency conversion (USD/CNY)
- [ ] Price alerts

### Phase 3 - Advanced
- [ ] Dividend/income tracking
- [ ] Tax lot tracking (FIFO/LIFO)
- [ ] API integrations (exchange sync)
- [ ] Mobile responsive design
- [ ] Data export/backup

## API Endpoints

```
GET    /api/portfolio/summary     # Total value, allocation, P&L
GET    /api/holdings              # All current holdings
GET    /api/holdings/:assetId     # Single holding detail

GET    /api/assets                # List all tracked assets
POST   /api/assets                # Add new asset to track
GET    /api/assets/:id/price      # Get current price

GET    /api/transactions          # List transactions (with filters)
POST   /api/transactions          # Add transaction
PUT    /api/transactions/:id      # Update transaction
DELETE /api/transactions/:id      # Delete transaction

GET    /api/accounts              # List accounts
POST   /api/accounts              # Create account

GET    /api/prices/history/:assetId  # Historical prices
```

## UI Wireframe

```
┌──────────────────────────────────────────────────────────────┐
│  Portfolio Tracker                          [Add Transaction]│
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Total Value: $125,432.50        24h: +$1,234 (+0.99%)      │
│                                                              │
│  ┌─────────────────────┐  ┌────────────────────────────────┐│
│  │    Allocation       │  │      Performance (30D)         ││
│  │    [Pie Chart]      │  │      [Line Chart]              ││
│  │  Crypto: 45%        │  │                                ││
│  │  US Stock: 30%      │  │                                ││
│  │  CN Stock: 15%      │  │                                ││
│  │  Gold: 10%          │  │                                ││
│  └─────────────────────┘  └────────────────────────────────┘│
│                                                              │
│  Holdings                                                    │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ Asset      │ Qty    │ Avg Cost │ Current │ Value  │ P&L  ││
│  ├────────────┼────────┼──────────┼─────────┼────────┼──────┤│
│  │ BTC        │ 0.5    │ $42,000  │ $43,500 │ $21,750│ +3.5%││
│  │ AAPL       │ 50     │ $175     │ $182    │ $9,100 │ +4.0%││
│  │ 600519.SS  │ 10     │ ¥1,800   │ ¥1,750  │ ¥17,500│ -2.8%││
│  │ Gold (oz)  │ 2      │ $1,950   │ $2,020  │ $4,040 │ +3.6%││
│  └──────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

## Open Questions

1. **Deployment**: Local-only, or self-hosted server option?
2. **Authentication**: Needed if self-hosted? Simple password?
3. **Data Backup**: Manual export, or automatic cloud sync?
4. **Preferred Currency**: Default display in USD or CNY?

## Next Steps

1. Review and approve this design
2. Set up project structure (monorepo with frontend/backend)
3. Implement database schema and basic CRUD
4. Add price fetching services
5. Build dashboard UI
6. Iterate based on feedback

---

*Awaiting review. Please comment on any changes to scope, tech choices, or features.*
