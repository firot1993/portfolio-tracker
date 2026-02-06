# Portfolio Tracker - Agent Guide

This document provides essential information for AI coding agents working on the Portfolio Tracker project.

## Project Overview

Portfolio Tracker is a personal investment tracking application that monitors holdings across multiple asset classes:
- **Cryptocurrency** (BTC, ETH, etc.)
- **US Stocks** (NYSE, NASDAQ)
- **China A-Shares** (Shanghai, Shenzhen)
- **Gold** (spot price, physical holdings)

The application provides a unified dashboard with real-time price fetching, P&L tracking, transaction history, and multi-currency support (USD/CNY).

## Architecture

### Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19 + TypeScript + Vite |
| Backend | Node.js + Express + TypeScript |
| Collector | Node.js + TypeScript (separate process) |
| Database | SQLite (via sql.js) |
| Charts | Recharts |
| Icons | Lucide React |
| HTTP Client | Axios |

### Project Structure

```
portfolio-tracker/
├── backend/
│   ├── src/
│   │   ├── index.ts              # Express app entry point
│   │   ├── collector/            # Historical data collector
│   │   │   ├── collector.ts      # Collector logic (daily + backfill)
│   │   │   └── index.ts          # Collector entrypoint
│   │   ├── routes/               # API route handlers
│   │   │   ├── accounts.ts
│   │   │   ├── assets.ts
│   │   │   ├── holdings.ts
│   │   │   ├── portfolio.ts
│   │   │   └── transactions.ts
│   │   ├── services/             # Business logic
│   │   │   └── priceService.ts   # Price fetching with LRU cache
│   │   ├── db/                   # Database layer
│   │   │   └── index.ts          # SQLite initialization & helpers
│   │   ├── utils/
│   │   │   └── config.ts         # Environment config loader
│   │   ├── types/
│   │   │   └── sql.js.d.ts       # Type declarations
│   │   └── __tests__/            # Unit tests
│   │       ├── api.test.ts
│   │       └── cache.test.ts
│   ├── config/                   # Environment-specific configs
│   │   ├── development.json
│   │   ├── production.json
│   │   └── test.json
│   ├── db/                       # Database files (outside code dir by default)
│   └── src/db/
│       ├── index.ts              # Database initialization
│       ├── seeds.ts              # Default asset definitions
│       └── seed.ts               # Seeding script
├── frontend/
│   ├── src/
│   │   ├── App.tsx               # Main React component
│   │   ├── main.tsx              # React entry point
│   │   ├── services/
│   │   │   └── api.ts            # Backend API client
│   │   ├── types/
│   │   │   └── index.ts          # TypeScript interfaces
│   │   ├── test/
│   │   │   ├── setup.ts          # Test initialization
│   │   │   └── App.test.tsx      # Unit tests
│   │   └── assets/               # Static assets
│   └── e2e/
│       └── app.spec.ts           # Playwright E2E tests
└── docs/
    └── DESIGN.md                 # Detailed design document
```

## Development Commands

### Backend

```bash
cd backend

# Install dependencies
npm install

# Development server (with hot reload)
npm run dev

# Production development mode
npm run dev:prod

# Build for production
npm run build

# Start production server
npm run start

# Run tests
npm run test
npm run test:watch
npm run test:coverage

# Database seeding (manual)
npm run db:seed        # Seed default assets
npm run db:seed:force  # Force seed (may create duplicates)

# Historical data collector
npm run collector -- daily
npm run collector -- backfills
npm run collector -- all
```

**Backend runs on http://localhost:3001**

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run linting
npm run lint

# Run unit tests
npm run test
npm run test:watch
npm run test:coverage

# Run E2E tests
npm run e2e
npm run e2e:ui  # Interactive UI mode
```

**Frontend runs on http://localhost:5173**

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/health | Health check |
| GET | /api/portfolio/summary | Portfolio overview with allocation |
| GET | /api/holdings | All holdings with current values |
| POST | /api/holdings | Create/update holding |
| GET | /api/assets | List all assets (no prices by default) |
| GET | /api/assets?includePrices=true | List assets with prices (slow) |
| POST | /api/assets | Add new asset |
| POST | /api/assets/seed | Seed default assets (manual) |
| GET | /api/assets/:id/price | Get single asset price |
| POST | /api/assets/prices/batch | Batch fetch prices (max 50) |
| DELETE | /api/assets/:id | Delete asset by ID |
| DELETE | /api/assets/by-symbol/:symbol | Delete asset by symbol |
| DELETE | /api/assets/cleanup/all | Delete all assets (testing) |
| DELETE | /api/assets/cleanup/test-data | Delete test assets only |
| GET | /api/assets/search/:query | Search assets |
| GET | /api/transactions | Transaction history |
| POST | /api/transactions | Add transaction |
| DELETE | /api/transactions/:id | Delete transaction |
| GET | /api/accounts | List accounts |
| POST | /api/accounts | Create account |
| GET | /api/history/portfolio?range=1M | Portfolio value history (1D, 1W, 1M, 3M, 6M, 1Y, YTD, ALL) |
| GET | /api/history/asset/:id?range=1M | Asset price history |
| POST | /api/history/snapshot | Trigger collector run (daily snapshot + price history) |
| GET | /api/history/range | Get available history date range |

## Code Style Guidelines

### TypeScript Configuration

- **Target**: ES2022
- **Module**: ESNext with Node resolution
- **Strict mode**: Enabled
- **Unused locals/parameters**: Error (enforced)

### Backend Conventions

- Use ES modules (`"type": "module"` in package.json)
- Import paths use `.js` extension even for `.ts` files (Node ESM requirement)
- Database helper functions: `query<T>()`, `run()`, `lastInsertId()`
- Always call `saveDB()` after write operations to persist to filesystem
- Environment config loaded from `config/{NODE_ENV}.json`
- Historical data is written by the collector; the API reads from `price_history` and `price_snapshots`

### Frontend Conventions

- React functional components with hooks
- TypeScript interfaces defined in `src/types/index.ts`
- API calls centralized in `src/services/api.ts`
- CSS styles in `App.css` (component-level)

### Naming Conventions

- Files: kebab-case for routes, camelCase for others
- Components: PascalCase
- Functions/Variables: camelCase
- Constants: UPPER_SNAKE_CASE
- Database tables: snake_case

## Testing Instructions

### Backend Tests

Uses **Vitest** with **supertest** for HTTP assertions:

```typescript
// Tests use in-memory database
await initDB(true);

// Example test pattern
const res = await request(app)
  .post('/api/assets')
  .send({ symbol: 'BTC', name: 'Bitcoin', type: 'crypto' });
expect(res.status).toBe(201);
```

### Frontend Unit Tests

Uses **Vitest** with **jsdom** environment and **@testing-library/react**:

- Setup file: `src/test/setup.ts` imports `@testing-library/jest-dom`
- Tests located in `src/test/` or co-located with components

### E2E Tests

Uses **Playwright**:

- Config: `playwright.config.ts`
- Test directory: `e2e/`
- Automatically starts backend (port 3001) and frontend (port 5173)
- Cleanup endpoint available: `DELETE /api/assets/cleanup/test-data`

### Running All Tests Locally

```bash
# Terminal 1 - Start backend
cd backend && npm run dev

# Terminal 2 - Start frontend
cd frontend && npm run dev

# Terminal 3 - Run E2E tests
cd frontend && npm run e2e
```

## Data Sources

The price service (`backend/src/services/priceService.ts`) fetches prices from:

| Asset Type | Primary API |
|------------|-------------|
| Crypto | CoinGecko API |
| US Stocks | Yahoo Finance |
| China Stocks | Sina Finance |
| Gold | metals.live API |
| USD/CNY | Yahoo Finance |

### Price Caching

- **Implementation**: LRU Cache with TTL
- **Max Size**: 1000 items
- **TTL**: Environment-dependent (60s dev, 300s prod, 1s test)
- **Stats**: Available via `getCacheStats()` for monitoring

## Database Schema

Core tables managed in `backend/src/db/index.ts`:

- **accounts** - Investment accounts (exchange, broker, wallet, bank)
- **assets** - Trackable assets (crypto, stock_us, stock_cn, gold)
- **transactions** - Buy/sell/transfer records
- **holdings** - Current positions with average cost
- **price_history** - Historical price snapshots

Database file location:
- Default: `~/.portfolio-tracker/portfolio.dev.db` (development) or `portfolio.db` (production)
- Custom: Set `DATABASE_PATH` environment variable
- Old location (deprecated): `backend/data/`

## CI/CD Pipeline

GitHub Actions workflow (`.github/workflows/ci.yml`):

1. **Backend Tests** - Run unit tests with coverage
2. **Frontend Tests** - Run unit tests with coverage
3. **E2E Tests** - Run Playwright tests (depends on 1 & 2)
4. **Deploy Preview** - Deploy to GitHub Pages for PRs (depends on E2E)
5. **Deploy Production** - Deploy to GitHub Pages on main branch (depends on E2E)

Coverage reports uploaded to Codecov with separate flags for frontend/backend.

## Security Considerations

- No authentication implemented (personal/local use application)
- CORS enabled for development
- API timeouts set to 5s (price fetching) and 30s (general)
- Input validation on all POST/PUT endpoints
- SQL injection prevention via parameterized queries

## Environment Variables

### Backend
- `NODE_ENV` - Environment (development, production, test)
- `PORT` - API server port (default: 3001)
- `DATABASE_PATH` - Custom database file path

### Frontend
- `VITE_*` - Standard Vite environment variables (if needed)

## Useful Notes

1. **Database Persistence**: sql.js is an in-memory SQLite that exports to filesystem. Always call `saveDB()` after writes.

2. **Price Rate Limits**: External APIs have rate limits. The cache helps avoid hitting limits during development.

3. **Test Data**: E2E tests create assets with `TEST*` symbol prefix. Cleanup endpoint removes these.

4. **Currency Handling**: All portfolio calculations convert to USD for totals. USD/CNY rate fetched for display.

5. **Git Hooks**: None configured. Run linting and tests manually before committing.
