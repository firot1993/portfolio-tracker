# Feature Roadmap: Exchange API Sync

> **Category:** Integration  
> **Priority:** Medium  
> **Effort:** High  
> **Target Version:** v2.0  
> **Status:** Planned  
> **Related:** [CSV Import/Export](../csv-import-export/roadmap.md)

---

## Overview

Automatically sync balances and transactions from exchanges via API, eliminating manual data entry.

---

## Goals

1. Sync balances automatically from supported exchanges
2. Import transaction history via API
3. Keep portfolio up-to-date without manual entry
4. Support scheduled sync

---

## User Stories

- As a user, I want to connect my Binance account so that my trades sync automatically
- As a user, I want my portfolio to update automatically so that I don't miss any trades
- As a user, I want to sync multiple exchanges so that I can see all my holdings in one place

---

## Supported Exchanges

| Exchange | Priority | API Type | Features |
|----------|----------|----------|----------|
| Binance | High | REST + WebSocket | Spot, Margin, Futures |
| Coinbase | High | REST + WebSocket | Spot, Staking |
| Coinbase Pro | Medium | REST | Spot |
| Interactive Brokers | Medium | REST | Stocks, Options |
| Alpaca | Low | REST | US Stocks |
| Futu/Moomoo | Low | REST | HK/US Stocks |
| Kraken | Low | REST | Spot |

---

## Features

### 1. API Key Management
- Secure storage of API keys (encrypted)
- Test connection before saving
- API key permissions validation
- Multiple exchange connections

### 2. Balance Sync
- Fetch current balances
- Update holdings automatically
- Support for locked/staked assets
- Real-time updates (WebSocket where available)

### 3. Transaction Sync
- Import trade history
- Detect new transactions since last sync
- Handle different trade types (spot, margin, futures)
- Duplicate detection

### 4. Scheduled Sync
- Automatic sync on schedule (hourly, daily)
- Manual sync button
- Sync status and history
- Error handling and retry

---

## Technical Implementation

### Database Schema

```sql
-- Exchange connections table
CREATE TABLE IF NOT EXISTS exchange_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exchange TEXT NOT NULL, -- 'binance', 'coinbase', etc.
  name TEXT, -- User-defined name (e.g., "My Binance")
  api_key_encrypted TEXT NOT NULL,
  api_secret_encrypted TEXT NOT NULL,
  passphrase_encrypted TEXT, -- For Coinbase Pro, etc.
  is_active BOOLEAN DEFAULT 1,
  last_sync_at DATETIME,
  last_sync_status TEXT, -- 'success', 'error', 'pending'
  last_sync_error TEXT,
  sync_frequency TEXT DEFAULT 'hourly', -- 'manual', 'hourly', 'daily'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_exchange_connections_active ON exchange_connections(is_active);

-- Sync history table
CREATE TABLE IF NOT EXISTS exchange_sync_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id INTEGER REFERENCES exchange_connections(id),
  sync_type TEXT, -- 'balances', 'transactions', 'full'
  status TEXT, -- 'success', 'error', 'partial'
  records_synced INTEGER,
  error_message TEXT,
  started_at DATETIME,
  completed_at DATETIME
);
```

### Backend API

#### New Endpoints

```typescript
// GET /api/exchanges
// List supported exchanges
{
  "exchanges": [
    {
      "id": "binance",
      "name": "Binance",
      "logo_url": "/logos/binance.svg",
      "website": "https://binance.com",
      "features": ["spot", "margin", "futures"],
      "api_docs": "https://binance-docs.github.io/"
    }
  ]
}

// GET /api/exchange-connections
// List user's exchange connections
{
  "connections": [
    {
      "id": 1,
      "exchange": "binance",
      "name": "My Binance",
      "is_active": true,
      "last_sync_at": "2024-02-05T10:00:00Z",
      "last_sync_status": "success",
      "sync_frequency": "hourly"
    }
  ]
}

// POST /api/exchange-connections
// Create new connection
// Body: { exchange, name, api_key, api_secret, passphrase?, sync_frequency? }
// Keys are encrypted before storage

// POST /api/exchange-connections/:id/test
// Test connection without saving

// POST /api/exchange-connections/:id/sync
// Trigger manual sync
// Body: { sync_type: 'balances' | 'transactions' | 'full' }
{
  "status": "success",
  "records_synced": 150,
  "balances_updated": 10,
  "transactions_imported": 140
}

// GET /api/exchange-connections/:id/sync-history
// Get sync history
{
  "history": [
    {
      "id": 1,
      "sync_type": "full",
      "status": "success",
      "records_synced": 150,
      "started_at": "2024-02-05T10:00:00Z",
      "completed_at": "2024-02-05T10:00:05Z"
    }
  ]
}

// DELETE /api/exchange-connections/:id
// Remove connection
```

#### Services

**Exchange Sync Service** (`backend/src/services/exchangeSyncService.ts`)

```typescript
export interface ExchangeCredentials {
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
}

export interface ExchangeAdapter {
  name: string;
  testConnection(credentials: ExchangeCredentials): Promise<boolean>;
  fetchBalances(credentials: ExchangeCredentials): Promise<Balance[]>;
  fetchTransactions(credentials: ExchangeCredentials, since?: Date): Promise<Transaction[]>;
}

// Adapters for each exchange
export class BinanceAdapter implements ExchangeAdapter { }
export class CoinbaseAdapter implements ExchangeAdapter { }
export class CoinbaseProAdapter implements ExchangeAdapter { }

export async function syncExchange(connectionId: number, syncType: string): Promise<SyncResult>;
export async function testConnection(exchange: string, credentials: ExchangeCredentials): Promise<boolean>;
```

**Encryption Service**

```typescript
// Encrypt API keys before storage
export function encryptApiKey(key: string): string;
export function decryptApiKey(encrypted: string): string;
```

**Scheduled Sync**

```typescript
// Cron job for scheduled sync
const syncJob = new CronJob('0 * * * *', async () => {
  const connections = await getActiveConnections();
  for (const conn of connections) {
    if (shouldSync(conn)) {
      await syncExchange(conn.id, 'full');
    }
  }
});
```

### Frontend Components

#### New Components

1. **ExchangeConnections** - Manage connections page
2. **AddExchangeModal** - Add new exchange connection
3. **ExchangeCard** - Connection status card
4. **SyncStatus** - Sync status indicator
5. **ExchangeLogos** - Exchange brand logos

#### UI Layout

```
Exchange Connections
┌─────────────────────────────────────────────────────────────┐
│  Connected Exchanges                              [+ Add]   │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 🟢 Binance - My Binance                               │  │
│  │    Last sync: 5 minutes ago ✓                         │  │
│  │    Balances: 10 assets synced                         │  │
│  │    [Sync Now] [Settings] [Disconnect]                 │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │ 🟡 Coinbase - Retirement Account                      │  │
│  │    Last sync: 1 hour ago ⚠️ Rate limited              │  │
│  │    [Retry] [Settings] [Disconnect]                    │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  Available Exchanges                                        │
│  [Binance] [Coinbase] [Kraken] [Interactive Brokers]        │
└─────────────────────────────────────────────────────────────┘

Add Exchange Modal
┌─────────────────────────────────────────────────────────────┐
│  Connect Binance                                            │
│                                                             │
│  1. Create API Key on Binance                               │
│     • Enable "Reading" permission                           │
│     • IP whitelist recommended                              │
│                                                             │
│  2. Enter API Credentials                                   │
│     API Key:    [________________________]                  │
│     API Secret: [________________________]                  │
│                                                             │
│  3. Connection Settings                                     │
│     Name: [My Binance________]                              │
│     Sync: [Hourly ▼]                                        │
│                                                             │
│     [Test Connection]  [Cancel] [Save]                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Security Considerations

### API Key Encryption
- Encrypt all API keys at rest using AES-256
- Use environment variable for encryption key
- Never log API keys
- Keys only decrypted in memory during sync

### Permissions
- Only request "Read" permissions (no trading)
- Document required permissions per exchange
- Warn users about excessive permissions

### IP Whitelisting
- Recommend users whitelist server IP
- Document IP addresses for self-hosted users

### Best Practices
- Regular key rotation reminders
- Option to pause sync without deleting keys
- Auto-disable on repeated failures

---

## Tasks

### Phase 1: Core Infrastructure (Week 1-2)
- [ ] Create exchange_connections table
- [ ] Implement encryption service
- [ ] Create exchange adapter interface
- [ ] Implement API key management endpoints
- [ ] Write tests

### Phase 2: Exchange Adapters (Week 3-4)
- [ ] Implement Binance adapter
- [ ] Implement Coinbase adapter
- [ ] Implement balance sync
- [ ] Implement transaction sync
- [ ] Add duplicate detection

### Phase 3: Frontend & Scheduling (Week 5)
- [ ] Create ExchangeConnections page
- [ ] Create AddExchangeModal
- [ ] Implement sync status UI
- [ ] Add scheduled sync job
- [ ] E2E tests

---

## Dependencies

```json
{
  "backend": {
    "crypto-js": "^4.2.0", // For encryption
    "ws": "^8.0.0" // For WebSocket connections
  }
}
```

---

## Future Enhancements

- WebSocket real-time updates
- Two-way sync (push trades to exchange - read-only for safety)
- DeFi wallet connections (MetaMask, WalletConnect)
- Staking reward tracking
- Lending/borrowing positions

---

*Last Updated: 2026-02-05*  
*Related: [CSV Import/Export](../02-csv-import-export/roadmap.md)*
