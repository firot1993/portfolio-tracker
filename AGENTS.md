# Portfolio Tracker - Agent Guide

This document provides essential information for AI coding agents working on the Portfolio Tracker project.

## Project Overview

Portfolio Tracker is a personal investment tracking application that monitors holdings across multiple asset classes:
- **Cryptocurrency** (BTC, ETH, etc.)
- **US Stocks** (NYSE, NASDAQ)
- **China A-Shares** (Shanghai, Shenzhen)
- **Gold** (spot price, physical holdings)

The application provides a unified dashboard with real-time price fetching, P&L tracking, transaction history, multi-currency support (USD/CNY), and **multi-user authentication**.

**Assets are global-only.** Users cannot create or delete assets unless they are configured as asset admins.

## Architecture

### Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19 + TypeScript + Vite |
| Backend | Node.js + Express + TypeScript |
| Authentication | JWT + httpOnly cookies |
| Password Hashing | bcrypt |
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
│   │   │   ├── auth.ts           # Authentication endpoints
│   │   │   ├── holdings.ts
│   │   │   ├── history.ts        # /api/history endpoints
│   │   │   ├── portfolio.ts
│   │   │   ├── transactions.ts
│   │   │   └── ws.ts             # WebSocket server (/ws/prices)
│   │   ├── services/             # Business logic
│   │   │   ├── priceHistoryService.ts  # Historical price recording
│   │   │   ├── priceService.ts   # Price fetching with LRU cache
│   │   │   └── realtimePriceService.ts  # WebSocket price streams (Binance/Tiingo)
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
│   │   │   ├── auth.ts           # Authentication types
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
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | /api/auth/register | Register new user | No |
| POST | /api/auth/login | Login user | No |
| POST | /api/auth/logout | Logout user | Yes |
| GET | /api/auth/me | Get current user | Yes |
| POST | /api/auth/change-password | Change password | Yes |
| DELETE | /api/auth/account | Delete account | Yes |
| GET | /api/health | Health check | No |
| GET | /api/portfolio/summary | Portfolio overview with allocation | Yes |
| GET | /api/holdings | All holdings with current values | Yes |
| POST | /api/holdings | Create/update holding |
| GET | /api/assets | List all assets (no prices by default) | Yes |
| GET | /api/assets?includePrices=true | List assets with prices (slow) | Yes |
| POST | /api/assets | Add new asset | Yes (asset admin only) |
| POST | /api/assets/seed | Seed default assets (manual) | Yes (asset admin only) |
| GET | /api/assets/:id/price | Get single asset price | Yes |
| POST | /api/assets/prices/batch | Batch fetch prices (max 50) | Yes |
| DELETE | /api/assets/:id | Delete asset by ID | Yes (asset admin only) |
| DELETE | /api/assets/by-symbol/:symbol | Delete asset by symbol | Yes (asset admin only) |
| DELETE | /api/assets/cleanup/all | Delete all assets (testing) | Yes (asset admin only) |
| DELETE | /api/assets/cleanup/test-data | Delete test assets only | Yes (asset admin only) |
| GET | /api/assets/search/:query | Search assets | Yes |
| GET | /api/transactions | Transaction history | Yes |
| POST | /api/transactions | Add transaction | Yes |
| DELETE | /api/transactions/:id | Delete transaction | Yes |
| GET | /api/accounts | List accounts | Yes |
| POST | /api/accounts | Create account | Yes |
| GET | /api/history/portfolio?range=1M | Portfolio value history (1D, 1W, 1M, 3M, 6M, 1Y, YTD, ALL) | Yes |
| GET | /api/history/asset/:id?range=1M | Asset price history | Yes |
| POST | /api/history/snapshot | Trigger collector run (daily snapshot + price history) | Yes |
| GET | /api/history/range | Get available history date range | Yes |
| GET | /api/health | Health check with WebSocket status | No |
| GET | /api/realtime/stats | Realtime price service statistics | Yes |

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

- **users** - User accounts with bcrypt password hashes
- **accounts** - Investment accounts (exchange, broker, wallet, bank), user-scoped
- **assets** - Global asset catalog (crypto, stock_us, stock_cn, gold). Not user-scoped.
- **transactions** - Buy/sell/transfer records, user-scoped
- **holdings** - Current positions with average cost, user-scoped
- **price_history** - Historical price snapshots
- **price_snapshots** - Daily portfolio value snapshots
- **collector_runs** - Collector run audit trail
- **backfill_jobs** - Historical data backfill queue

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

## Authentication

The application supports multi-user accounts with JWT-based authentication:

### Features
- **Registration & Login**: Email/password with validation (email format, min 8 chars)
- **JWT Tokens**: Signed with `JWT_SECRET`, stored in httpOnly cookies
- **Password Security**: bcrypt hashing with salt rounds
- **Session Duration**: 7 days (configurable via `JWT_EXPIRES_IN`)
- **Protected Routes**: All data endpoints require authentication via `authMiddleware`
- **User Data Isolation**: All data (accounts, assets, transactions, holdings) is scoped to the authenticated user via `user_id` foreign keys
- **Account Management**: Change password, delete account with cascade data removal

### Frontend Auth Types
Located in `frontend/src/types/auth.ts`:
- `User` - User profile (id, email, created_at, updated_at)
- `LoginRequest` / `RegisterRequest` - Auth request payloads
- `AuthResponse` - Auth response with user and optional message
- `ChangePasswordRequest` - Password change payload
- `AuthError` - Error response with optional field mapping
- `AuthStatus` - UI state type for auth state management

## Security Considerations

- **Authentication**: JWT-based auth with httpOnly cookies (not localStorage)
- **Password Hashing**: bcrypt with appropriate salt rounds
- **CORS**: Enabled for development
- **API Timeouts**: 5s (price fetching), 30s (general)
- **Input Validation**: All POST/PUT endpoints validate input
- **SQL Injection Prevention**: Parameterized queries used throughout
- **JWT Secret**: Must be changed in production via `JWT_SECRET` env var

## Environment Variables

### Backend
- `NODE_ENV` - Environment (development, production, test)
- `PORT` - API server port (default: 3001)
- `DATABASE_PATH` - Custom database file path
- `JWT_SECRET` - Secret key for JWT signing (**change in production**)
- `JWT_EXPIRES_IN` - Token expiration (default: '7d')
- `ASSET_ADMIN_EMAILS` - Comma-separated list of emails allowed to manage assets (create/seed/delete)

### Frontend
- `VITE_*` - Standard Vite environment variables (if needed)
- `VITE_ASSET_ADMIN_EMAILS` - Comma-separated list of emails allowed to see the Assets UI

## Useful Notes

1. **Database Persistence**: sql.js is an in-memory SQLite that exports to filesystem. Always call `saveDB()` after writes.

2. **Price Rate Limits**: External APIs have rate limits. The cache helps avoid hitting limits during development.

3. **Test Data**: E2E tests create assets with `TEST*` symbol prefix. Cleanup endpoint removes these.

4. **Currency Handling**: All portfolio calculations convert to USD for totals. USD/CNY rate fetched for display.

5. **Git Hooks**: None configured. Run linting and tests manually before committing.
