# Portfolio Tracker - Feature Roadmap

This document outlines the planned features and enhancements for the Portfolio Tracker application, organized by priority and implementation phase.

For detailed implementation plans for specific features, see the individual feature roadmaps linked below.

---

## 📊 Current Status (MVP - v1.0)

### Implemented Features
- ✅ Multi-asset class tracking (Crypto, US Stocks, China A-Shares, Gold)
- ✅ Real-time price fetching with LRU cache
- ✅ Transaction management (buy/sell/transfer)
- ✅ Holdings tracking with average cost calculation
- ✅ Portfolio summary with allocation pie chart
- ✅ Multi-currency support (USD/CNY/HKD)
- ✅ Basic CRUD operations for all entities
- ✅ SQLite persistence with sql.js
- ✅ Responsive UI with sidebar navigation

---

## 🚀 Phase 2: Enhanced Analytics (v1.1)

### [Historical Performance Charts](./features/01-historical-charts/roadmap.md)
**Priority:** High | **Effort:** Medium

- Portfolio value over time with date range selector (1D, 1W, 1M, 3M, 6M, 1Y, YTD, ALL)
- Benchmark comparison (S&P 500, NASDAQ, BTC)
- Individual asset price history
- Interactive charts with Recharts

📄 **[View Full Roadmap →](./features/historical-charts/roadmap.md)**

### [Advanced Metrics](./features/04-advanced-metrics/roadmap.md)
**Priority:** High | **Effort:** Medium  
**Dependencies:** Historical Performance Charts

- Sharpe Ratio and Sortino Ratio (risk-adjusted returns)
- Maximum Drawdown analysis
- Volatility (standard deviation)
- Beta and Alpha (market correlation)
- Win Rate and Profit Factor
- Best/Worst performer identification

📄 **[View Full Roadmap →](./features/advanced-metrics/roadmap.md)**

---

## 📁 Phase 3: Data Management (v1.2)

### [CSV Import/Export](./features/02-csv-import-export/roadmap.md)
**Priority:** High | **Effort:** Medium

- Import from popular brokerages (Binance, Coinbase, IBKR, Futu)
- Preview and validation before import
- Duplicate detection
- Export for tax reporting
- Custom CSV templates

📄 **[View Full Roadmap →](./features/csv-import-export/roadmap.md)**

### Data Backup & Restore
**Priority:** Medium | **Effort:** Low

- One-click database backup
- Restore from backup file
- Automatic scheduled backups
- JSON export/import for portability

---

## 🔔 Phase 4: Alerts & Notifications (v1.3)

### [Price Alerts](./features/03-price-alerts/roadmap.md)
**Priority:** High | **Effort:** Medium

- Price above/below threshold alerts
- Percentage change alerts (24h, 7d)
- Portfolio value thresholds
- In-app notifications
- Browser push notifications
- Email notifications (optional)

📄 **[View Full Roadmap →](./features/price-alerts/roadmap.md)**

---

## 💰 Phase 5: Income & Portfolio Management (v1.4)

### [Multiple Portfolios](./features/06-multiple-portfolios/roadmap.md)
**Priority:** Medium | **Effort:** High

- Create multiple portfolios (Retirement, Trading, HODL)
- Portfolio-specific analytics
- Consolidated view across portfolios
- Portfolio comparison tools
- Transfer assets between portfolios

📄 **[View Full Roadmap →](./features/multiple-portfolios/roadmap.md)**

### [Dividend Tracking](./features/05-dividend-tracking/roadmap.md)
**Priority:** Medium | **Effort:** Medium

- Dividend income recording
- Dividend yield calculation (current and yield on cost)
- DRIP (Dividend Reinvestment) support
- Annual income reports
- Dividend calendar

📄 **[View Full Roadmap →](./features/dividend-tracking/roadmap.md)**

### Rebalancing Tool
**Priority:** Low | **Effort:** Medium

- Set target allocation percentages
- Calculate required trades to rebalance
- Drift tracking from target
- Rebalancing suggestions with fee estimates

---

## 💸 Phase 6: Tax Features (v1.5)

### [Tax Reporting](./features/09-tax-reporting/roadmap.md)
**Priority:** Low | **Effort:** High  
**Dependencies:** CSV Import/Export

- Multiple cost basis methods (FIFO, LIFO, Average, Specific Lot)
- Realized gains/losses reporting
- Wash sale detection (US)
- Form 8949 export (US)
- TurboTax TXF export
- Dividend income reports (1099-DIV)

📄 **[View Full Roadmap →](./features/tax-reporting/roadmap.md)**

---

## 🔌 Phase 7: Integrations (v2.0)

### [Exchange API Sync](./features/07-exchange-api-sync/roadmap.md)
**Priority:** Medium | **Effort:** High  
**Dependencies:** CSV Import/Export

- Binance API sync
- Coinbase/Coinbase Pro integration
- Interactive Brokers
- Secure API key storage (encrypted)
- Scheduled auto-sync
- Real-time balance updates (WebSocket)

📄 **[View Full Roadmap →](./features/exchange-api-sync/roadmap.md)**

### [Mobile PWA](./features/08-mobile-pwa/roadmap.md)
**Priority:** Medium | **Effort:** High  
**Dependencies:** Price Alerts

- Progressive Web App support
- Offline mode with data caching
- Push notifications
- Mobile-optimized UI
- Add to home screen
- Background sync

📄 **[View Full Roadmap →](./features/mobile-pwa/roadmap.md)**

### News Integration
**Priority:** Low | **Effort:** Medium

- News feed for held assets
- Sentiment indicators
- CryptoPanic integration
- News-based alerts

---

## 🎨 Phase 8: UI/UX Enhancements (Ongoing)

### Theme & Customization
**Priority:** Medium | **Effort:** Low

- Light/Dark/System theme toggle
- Customizable dashboard layout
- Draggable widgets
- Color scheme customization

### Keyboard Shortcuts
**Priority:** Low | **Effort:** Low

- Command palette (Cmd/Ctrl + K)
- Quick navigation shortcuts
- Transaction shortcuts
- Help modal with shortcut reference

### Dashboard Widgets
**Priority:** Low | **Effort:** Medium

- Market overview widget (indices)
- Fear & Greed index
- Top gainers/losers widget
- Economic calendar
- Quick actions widget

---

## 🔐 Phase 9: Security & Privacy (v2.1)

### Local Authentication
**Priority:** Medium | **Effort:** Medium

- Optional password protection
- Session timeout
- Biometric authentication (WebAuthn)

### Data Encryption
**Priority:** Low | **Effort:** High

- Encrypt sensitive data at rest
- API key encryption improvements
- Encrypted backups

---

## 📋 Implementation Priorities

### Immediate (Next 1-2 Months)
| Feature | Priority | Status | Roadmap |
|---------|----------|--------|---------|
| Historical Performance Charts | High | Planned | [View](./features/historical-charts/roadmap.md) |
| CSV Import/Export | High | Planned | [View](./features/csv-import-export/roadmap.md) |
| Price Alerts | High | Planned | [View](./features/price-alerts/roadmap.md) |
| Advanced Metrics | High | Planned | [View](./features/advanced-metrics/roadmap.md) |

### Short Term (3-6 Months)
| Feature | Priority | Status | Roadmap |
|---------|----------|--------|---------|
| Dividend Tracking | Medium | Planned | [View](./features/dividend-tracking/roadmap.md) |
| Watchlist | Medium | Idea | - |
| Multiple Portfolios | Medium | Planned | [View](./features/multiple-portfolios/roadmap.md) |
| Theme Toggle | Medium | Idea | - |

### Long Term (6+ Months)
| Feature | Priority | Status | Roadmap |
|---------|----------|--------|---------|
| Exchange API Sync | Medium | Planned | [View](./features/exchange-api-sync/roadmap.md) |
| Tax Reporting | Low | Planned | [View](./features/tax-reporting/roadmap.md) |
| Mobile PWA | Medium | Planned | [View](./features/mobile-pwa/roadmap.md) |

---

## 🛠️ Technical Debt & Infrastructure

### Performance Optimizations
- [ ] Virtualize long lists (transactions, holdings)
- [ ] Optimize price fetching (batch requests)
- [ ] Add database indexes for common queries
- [ ] Implement request caching with ETags

### Testing
- [ ] Increase test coverage to 80%+
- [ ] Add visual regression tests
- [ ] Performance benchmarks
- [ ] E2E tests for critical paths

### Developer Experience
- [ ] API documentation (Swagger/OpenAPI)
- [ ] Storybook for UI components
- [ ] Git hooks for linting/tests
- [ ] Docker support for easy setup

---

## 📝 Feature Request Process

1. Add new ideas to [FEATURE_REQUESTS.md](./FEATURE_REQUESTS.md)
2. Review and prioritize quarterly
3. Move approved features to this roadmap
4. Create detailed roadmap in `features/<feature-name>/roadmap.md`
5. Update status as development progresses

---

## 🎯 Project Goals

### Mission
Build the best personal portfolio tracking application for multi-asset investors.

### Core Principles
1. **Privacy First** - All data stays local by default
2. **Simplicity** - Easy to use, minimal configuration
3. **Flexibility** - Support diverse asset classes and currencies
4. **Performance** - Fast loading, real-time updates
5. **Extensibility** - Plugin-friendly architecture

---

*Last Updated: 2026-02-05*  
*Next Review: Monthly*
