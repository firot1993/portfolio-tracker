# Feature Roadmap: Price Alerts

> **Category:** Notifications  
> **Priority:** High  
> **Effort:** Medium  
> **Target Version:** v1.3  
> **Status:** Planned

---

## Overview

Notify users when assets hit price thresholds or experience significant percentage changes.

---

## Goals

1. Enable proactive monitoring of price movements
2. Help users catch buying/selling opportunities
3. Monitor portfolio value thresholds
4. Reduce need for manual price checking

---

## User Stories

- As a user, I want to be notified when BTC drops below $40k so that I can buy the dip
- As a user, I want an alert when my portfolio reaches $100k so that I can celebrate
- As a user, I want to know when any stock drops 5% in a day so that I can review my holdings

---

## Features

### 1. Alert Types

| Type | Description | Example |
|------|-------------|---------|
| Price Above | Alert when price exceeds threshold | BTC > $50,000 |
| Price Below | Alert when price drops below threshold | BTC < $40,000 |
| Change % Up | Alert on percentage gain | BTC +5% in 24h |
| Change % Down | Alert on percentage loss | BTC -5% in 24h |
| Portfolio Value | Alert on total portfolio value | Portfolio > $100k |

### 2. Notification Methods

| Method | Priority | Description |
|--------|----------|-------------|
| In-app | High | Toast notification, badge counter |
| Browser Push | Medium | Web Push API notification |
| Email | Low | SMTP configuration required |
| Sound | Low | Optional alert sound |

### 3. Alert Management

- Create/edit/delete alerts
- Enable/disable alerts
- View alert history
- One-time vs. recurring alerts
- Snooze functionality

---

## Technical Implementation

### Database Schema

```sql
-- Alerts table
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER REFERENCES assets(id), -- NULL for portfolio alerts
  alert_type TEXT NOT NULL, -- 'price_above', 'price_below', 'change_pct_up', 'change_pct_down', 'portfolio_value'
  threshold REAL NOT NULL,
  is_active BOOLEAN DEFAULT 1,
  is_one_time BOOLEAN DEFAULT 0, -- If true, disable after trigger
  triggered_at DATETIME, -- Set when alert fires
  triggered_count INTEGER DEFAULT 0, -- Number of times triggered
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_alerts_active ON alerts(is_active);
CREATE INDEX IF NOT EXISTS idx_alerts_asset ON alerts(asset_id);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL, -- 'price_alert', 'portfolio_alert', 'system'
  title TEXT NOT NULL,
  message TEXT,
  is_read BOOLEAN DEFAULT 0,
  data JSON, -- { alert_id, asset_id, price, threshold }
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);
```

### Backend API

#### New Endpoints

```typescript
// GET /api/alerts
// List all alerts with asset info
{
  "alerts": [
    {
      "id": 1,
      "asset_id": 1,
      "asset_symbol": "BTC",
      "alert_type": "price_below",
      "threshold": 40000,
      "is_active": true,
      "is_one_time": false,
      "triggered_count": 0,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}

// POST /api/alerts
// Create new alert
// Body: { asset_id?, alert_type, threshold, is_one_time? }
{
  "asset_id": 1,
  "alert_type": "price_below",
  "threshold": 40000,
  "is_one_time": false
}

// PUT /api/alerts/:id
// Update alert
// Body: { threshold?, is_active?, is_one_time? }

// DELETE /api/alerts/:id
// Delete alert

// GET /api/alerts/history
// Get triggered alert history
{
  "history": [
    {
      "id": 1,
      "alert_type": "price_below",
      "threshold": 40000,
      "triggered_at": "2024-01-15T10:30:00Z",
      "actual_price": 39500
    }
  ]
}

// GET /api/notifications
// Get user notifications
{
  "notifications": [
    {
      "id": 1,
      "type": "price_alert",
      "title": "BTC Price Alert",
      "message": "BTC has dropped below $40,000 (current: $39,500)",
      "is_read": false,
      "created_at": "2024-01-15T10:30:00Z"
    }
  ],
  "unread_count": 1
}

// POST /api/notifications/:id/read
// Mark notification as read

// POST /api/notifications/read-all
// Mark all notifications as read

// DELETE /api/notifications/:id
// Delete notification
```

#### Services

**Alert Service** (`backend/src/services/alertService.ts`)

```typescript
export interface Alert {
  id: number;
  assetId?: number;
  type: 'price_above' | 'price_below' | 'change_pct_up' | 'change_pct_down' | 'portfolio_value';
  threshold: number;
  isActive: boolean;
  isOneTime: boolean;
}

export async function createAlert(alert: Omit<Alert, 'id'>): Promise<Alert>;
export async function getActiveAlerts(): Promise<Alert[]>;
export async function updateAlert(id: number, updates: Partial<Alert>): Promise<Alert>;
export async function deleteAlert(id: number): Promise<void>;

// Check all active alerts against current prices
export async function checkAlerts(currentPrices: Map<string, number>): Promise<TriggeredAlert[]>;

// Mark alert as triggered
export async function markAlertTriggered(alertId: number, actualValue: number): Promise<void>;
```

**Notification Service** (`backend/src/services/notificationService.ts`)

```typescript
export async function createNotification(notification: {
  type: string;
  title: string;
  message: string;
  data?: any;
}): Promise<void>;

export async function getUnreadNotifications(): Promise<Notification[]>;
export async function markAsRead(notificationId: number): Promise<void>;
export async function markAllAsRead(): Promise<void>;
```

#### Integration with Price Refresh

```typescript
// In priceService.ts or portfolio.ts
async function refreshPrices() {
  // ... existing price fetch logic ...
  
  // Check alerts after price update
  const priceMap = new Map(holdings.map(h => [h.symbol, h.currentPrice]));
  const triggered = await checkAlerts(priceMap);
  
  for (const alert of triggered) {
    // Create notification
    await createNotification({
      type: 'price_alert',
      title: `${alert.symbol} Alert Triggered`,
      message: `${alert.symbol} is now ${alert.actualPrice} (threshold: ${alert.threshold})`,
      data: { alert_id: alert.id, asset_id: alert.assetId, price: alert.actualPrice }
    });
    
    // Update alert status
    await markAlertTriggered(alert.id, alert.actualPrice);
    
    // If one-time alert, deactivate it
    if (alert.isOneTime) {
      await updateAlert(alert.id, { isActive: false });
    }
  }
}
```

### Frontend Components

#### New Components

1. **AlertManager** - Main alerts page
2. **CreateAlertModal** - Create new alert
3. **AlertList** - List all alerts with status
4. **NotificationPanel** - Dropdown/panel for notifications
5. **NotificationBadge** - Badge with unread count
6. **QuickAlertButton** - Quick alert from holdings table

#### UI Flow

```
Alerts Page:
┌─────────────────────────────────────────────────────────────┐
│  Price Alerts                                    [+ Create] │
│                                                             │
│  Active Alerts (3)                                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 🔔 BTC < $40,000                     [Edit] [Delete]  │  │
│  │    Triggered: 0 times | Recurring                     │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │ 🔔 ETH +5% (24h)                     [Edit] [Delete]  │  │
│  │    Triggered: 2 times | Recurring                     │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  Alert History                                              │
│  • 2024-01-15: ETH increased 5.2%                           │
│  • 2024-01-14: BTC dropped to $39,500                       │
└─────────────────────────────────────────────────────────────┘
```

#### Quick Alert from Holdings

```typescript
// Add to each holding row in holdings table
<button onClick={() => quickAlert(holding)}>
  <Bell size={16} />
</button>

// Quick alert modal presets:
// • Alert when drops below [current price - 5%]
// • Alert when rises above [current price + 5%]
// • Custom price...
```

---

## Tasks

### Phase 1: Backend (Week 1)
- [ ] Create alerts table schema
- [ ] Create notifications table
- [ ] Implement alert CRUD API
- [ ] Implement alert checking logic
- [ ] Create notification service
- [ ] Add notification polling endpoint
- [ ] Write unit tests

### Phase 2: Frontend (Week 2)
- [ ] Create AlertManager page
- [ ] Create CreateAlertModal
- [ ] Create AlertList component
- [ ] Create NotificationPanel
- [ ] Add notification badge to header
- [ ] Add quick alert buttons to holdings
- [ ] Implement polling for notifications

### Phase 3: Advanced Features (Week 3)
- [ ] Browser push notifications
- [ ] Alert sounds
- [ ] Alert templates (e.g., "Buy the dip", "Take profit")
- [ ] Portfolio value alerts
- [ ] Percentage change alerts
- [ ] E2E tests

---

## Browser Push Notifications

### Setup

```typescript
// Register service worker
if ('serviceWorker' in navigator) {
  const registration = await navigator.serviceWorker.register('/sw.js');
  
  // Subscribe to push
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: VAPID_PUBLIC_KEY
  });
  
  // Send subscription to server
  await api.post('/api/notifications/subscribe', subscription);
}
```

### Service Worker

```javascript
// public/sw.js
self.addEventListener('push', event => {
  const data = event.data.json();
  self.registration.showNotification(data.title, {
    body: data.message,
    icon: '/icon.png',
    badge: '/badge.png',
    data: { url: data.url }
  });
});
```

---

## Dependencies

```json
{
  "backend": {
    "web-push": "^3.6.0" // For push notifications
  },
  "frontend": {}
}
```

---

## Success Metrics

- Alert delivery latency < 1 minute after price change
- Support for 100+ active alerts per user
- < 1% false positive rate

---

## Future Enhancements

- Technical indicator alerts (RSI, MACD)
- News-based alerts (sentiment change)
- Correlation alerts ("When BTC drops, alert me if ETH doesn't")
- Scheduled alerts ("Alert me every Monday at 9 AM")
- Alert via Telegram/Discord webhook

---

*Last Updated: 2026-02-05*
