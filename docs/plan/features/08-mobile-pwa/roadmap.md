# Feature Roadmap: Mobile PWA

> **Category:** Platform  
> **Priority:** Medium  
> **Effort:** High  
> **Target Version:** v2.0+  
> **Status:** Planned

---

## Overview

Transform the web application into a Progressive Web App (PWA) for a native-like mobile experience with offline support and push notifications.

---

## Goals

1. Provide native app experience on mobile devices
2. Enable offline access to portfolio data
3. Support push notifications for price alerts
4. Add to home screen functionality

---

## User Stories

- As a user, I want to check my portfolio on my phone so that I can monitor investments on the go
- As a user, I want to receive push notifications so that I know when price alerts trigger
- As a user, I want to use the app offline so that I can check my holdings without internet

---

## Features

### 1. PWA Core
- Web App Manifest
- Service Worker for offline support
- Add to Home Screen prompt
- Splash screen and app icons

### 2. Mobile-Optimized UI
- Bottom navigation bar
- Swipe gestures
- Touch-optimized buttons
- Mobile-responsive charts

### 3. Offline Support
- Cache portfolio data locally
- View holdings offline
- Queue transactions for sync
- Background sync when online

### 4. Push Notifications
- Price alerts via push
- Daily portfolio summary
- Market open/close notifications

### 5. Mobile Widgets (Future)
- iOS 16+ Home Screen widgets
- Android widgets
- Quick view of portfolio value

---

## Technical Implementation

### PWA Configuration

#### Web App Manifest (`public/manifest.json`)

```json
{
  "name": "Portfolio Tracker",
  "short_name": "Portfolio",
  "description": "Track your investments across crypto, stocks, and gold",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0a0a",
  "theme_color": "#0052CC",
  "orientation": "portrait",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192" },
    { "src": "/icon-512.png", "sizes": "512x192" }
  ],
  "categories": ["finance", "productivity"]
}
```

#### Service Worker (`public/sw.js`)

```javascript
const CACHE_NAME = 'portfolio-tracker-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/assets/index.js',
  '/assets/index.css',
  '/icon.png'
];

// Install: Cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Fetch: Serve from cache or network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Return cached or fetch from network
      return response || fetch(event.request);
    })
  );
});

// Background sync
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-transactions') {
    event.waitUntil(syncPendingTransactions());
  }
});

// Push notifications
self.addEventListener('push', (event) => {
  const data = event.data.json();
  self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/icon.png',
    badge: '/badge.png',
    data: data.url
  });
});
```

### Mobile UI Components

#### Bottom Navigation

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                     [Content Area]                          │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  [🏠]       [📊]       [💰]       [⚙️]                      │
│  Home      Charts     Holdings   Settings                   │
└─────────────────────────────────────────────────────────────┘
```

#### Mobile-Optimized Views

1. **MobileDashboard** - Simplified cards, scrollable
2. **MobileHoldingList** - Swipeable cards instead of table
3. **MobileAddTransaction** - Full-screen modal with large inputs
4. **MobileChart** - Simplified charts with touch zoom

### Offline Storage

```typescript
// Using IndexedDB via idb package
import { openDB } from 'idb';

const db = await openDB('portfolio-tracker', 1, {
  upgrade(db) {
    db.createObjectStore('holdings', { keyPath: 'id' });
    db.createObjectStore('transactions', { keyPath: 'id' });
    db.createObjectStore('pending', { keyPath: 'id', autoIncrement: true });
  }
});

// Cache data when online
export async function cachePortfolioData(data: PortfolioData) {
  await db.put('holdings', data.holdings);
  await db.put('transactions', data.transactions);
}

// Get cached data when offline
export async function getCachedPortfolioData(): Promise<PortfolioData | null> {
  const holdings = await db.get('holdings');
  const transactions = await db.get('transactions');
  return holdings ? { holdings, transactions } : null;
}

// Queue transaction for sync
export async function queuePendingTransaction(tx: Transaction) {
  await db.add('pending', tx);
  // Register for background sync
  const registration = await navigator.serviceWorker.ready;
  await registration.sync.register('sync-transactions');
}
```

### Push Notifications

```typescript
// Request permission and subscribe
export async function subscribeToPushNotifications() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: VAPID_PUBLIC_KEY
  });

  // Send subscription to server
  await api.post('/api/notifications/subscribe', subscription);
}
```

---

## Tasks

### Phase 1: PWA Core (Week 1)
- [ ] Create Web App Manifest
- [ ] Create Service Worker
- [ ] Add PWA icons and splash screens
- [ ] Register service worker in app
- [ ] Test Add to Home Screen

### Phase 2: Mobile UI (Week 2)
- [ ] Create bottom navigation component
- [ ] Create mobile dashboard layout
- [ ] Optimize holdings list for mobile
- [ ] Create mobile-optimized charts
- [ ] Add touch gestures

### Phase 3: Offline Support (Week 3)
- [ ] Set up IndexedDB
- [ ] Implement data caching
- [ ] Create offline indicator
- [ ] Implement background sync
- [ ] Queue pending transactions

### Phase 4: Push Notifications (Week 4)
- [ ] Set up VAPID keys
- [ ] Implement push subscription
- [ ] Send push from server
- [ ] Handle push in service worker
- [ ] Test on iOS and Android

---

## Dependencies

```json
{
  "frontend": {
    "idb": "^8.0.0", // IndexedDB wrapper
    "vite-plugin-pwa": "^0.17.0" // Vite PWA plugin
  }
}
```

### Vite PWA Configuration

```typescript
// vite.config.ts
import { VitePWA } from 'vite-plugin-pwa';

export default {
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Portfolio Tracker',
        /* ... manifest content ... */
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      }
    })
  ]
};
```

---

## Platform-Specific Considerations

### iOS
- Safari PWA limitations (no push notifications before iOS 16.4)
- Status bar theming
- Safe area insets
- Touch delay issues

### Android
- Full PWA support in Chrome
- Notification channels
- Back button handling

---

## Testing Checklist

- [ ] Install on iOS Safari
- [ ] Install on Android Chrome
- [ ] Test offline functionality
- [ ] Test push notifications
- [ ] Verify Add to Home Screen prompt
- [ ] Test background sync
- [ ] Performance audit (Lighthouse)

---

## Future Enhancements

- Native app wrappers (Capacitor/Cordova)
- Biometric authentication
- iOS 16+ widgets
- Watch complications (Apple Watch, Wear OS)
- Siri shortcuts / Google Assistant

---

## Success Metrics

- Lighthouse PWA score > 90
- Installable on iOS and Android
- Offline page load < 3 seconds
- Push notification delivery > 95%

---

*Last Updated: 2026-02-05*  
*Related: [Price Alerts](../03-price-alerts/roadmap.md)*
