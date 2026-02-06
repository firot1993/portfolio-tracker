# Feature Requests & Ideas

A living document tracking feature requests, user feedback, and ideas for the Portfolio Tracker.

---

## 🎯 High Priority (In Roadmap)

| Feature | Description | Status | Roadmap |
|---------|-------------|--------|---------|
| [Historical Performance Charts](./features/01-historical-charts/roadmap.md) | Portfolio value over time with date range selector | Planned | [View →](./features/historical-charts/roadmap.md) |
| [CSV Import/Export](./features/02-csv-import-export/roadmap.md) | Import from brokerages, export data | Planned | [View →](./features/csv-import-export/roadmap.md) |
| [Price Alerts](./features/03-price-alerts/roadmap.md) | Notify when assets hit price thresholds | Planned | [View →](./features/price-alerts/roadmap.md) |
| [Advanced Metrics](./features/04-advanced-metrics/roadmap.md) | Sharpe ratio, CAGR, max drawdown analysis | Planned | [View →](./features/advanced-metrics/roadmap.md) |

---

## 💡 Medium Priority (In Roadmap)

| Feature | Description | Status | Roadmap |
|---------|-------------|--------|---------|
| [Dividend Tracking](./features/05-dividend-tracking/roadmap.md) | Record and track dividend income | Planned | [View →](./features/dividend-tracking/roadmap.md) |
| [Multiple Portfolios](./features/06-multiple-portfolios/roadmap.md) | Separate portfolios (retirement, trading) | Planned | [View →](./features/multiple-portfolios/roadmap.md) |
| [Exchange API Sync](./features/07-exchange-api-sync/roadmap.md) | Auto-sync with Binance, Coinbase, etc. | Planned | [View →](./features/exchange-api-sync/roadmap.md) |
| [Mobile PWA](./features/08-mobile-pwa/roadmap.md) | Native app experience on mobile | Planned | [View →](./features/mobile-pwa/roadmap.md) |

---

## 🗂️ Low Priority (In Roadmap)

| Feature | Description | Status | Roadmap |
|---------|-------------|--------|---------|
| [Tax Reporting](./features/09-tax-reporting/roadmap.md) | Realized gains/losses, tax form export | Planned | [View →](./features/tax-reporting/roadmap.md) |

---

## 💭 Nice to Have (Ideas)

| Feature | Description | Status | Notes |
|---------|-------------|--------|-------|
| Watchlist | Track assets without owning them | Idea | Quick price view, star/favorite |
| Theme Toggle | Light/Dark mode | Idea | CSS variable approach |
| Rebalancing Tool | Suggest trades to hit target allocation | Idea | Need target % config |
| News Feed | Asset-related news | Idea | CryptoPanic, NewsAPI |
| Keyboard Shortcuts | Quick navigation | Idea | Cmd+K command palette |
| Cash Tracking | Include cash in portfolio | Idea | Separate cash positions |
| Options Tracking | Calls/puts support | Idea | Complex P&L calculation |
| Lending/Staking | Yield tracking for DeFi | Idea | APY calculation |
| Stock Split Handling | Automatic adjustment | Idea | Retroactive cost basis |
| Recurring Transactions | DCA tracking | Idea | Monthly buy schedule |
| Asset Correlation | Analyze asset relationships | Idea | Heat map visualization |
| Monte Carlo Simulation | Portfolio projections | Idea | Retirement planning |
| Share Portfolio | View-only link to share | Idea | Privacy considerations |
| Custom Tags | User-defined categories | Idea | Filter and group by tags |

---

## 🔌 Integration Ideas

| Integration | Type | Priority | Notes |
|-------------|------|----------|-------|
| Binance API | Exchange | Planned | See [roadmap](./features/exchange-api-sync/roadmap.md) |
| Coinbase Pro | Exchange | Planned | See [roadmap](./features/exchange-api-sync/roadmap.md) |
| Interactive Brokers | Broker | Planned | See [roadmap](./features/exchange-api-sync/roadmap.md) |
| Alpaca | Broker | Low | US stocks only |
| CryptoPanic | News | Low | Crypto news feed |
| TradingView | Charts | Low | Embed advanced charts |
| Plaid | Banking | Low | Bank account sync |
| MetaMask | DeFi Wallet | Low | Web3 integration |

---

## 🐛 Known Issues to Address

| Issue | Severity | Notes |
|-------|----------|-------|
| Price API rate limits | Medium | Add better error handling and retry logic |
| Large transaction lists | Low | Need virtualization for performance |
| Mobile UI polish | Low | Sidebar needs better mobile collapse |
| No undo for deletes | Low | Consider soft delete pattern |
| Date timezone handling | Low | Consistent UTC vs local time |

---

## 📊 User Feedback Summary

### Requests from Issues/Discussions
*None yet - awaiting user feedback*

### Personal Use Observations
1. Need better visualization of portfolio growth over time → [Historical Charts](./features/historical-charts/roadmap.md)
2. CSV import would save hours of manual entry → [CSV Import/Export](./features/02-csv-import-export/roadmap.md)
3. Price alerts would help catch buying opportunities → [Price Alerts](./features/03-price-alerts/roadmap.md)
4. Mobile view needs work for on-the-go checking → [Mobile PWA](./features/08-mobile-pwa/roadmap.md)
5. Dividend tracking needed for income investing → [Dividend Tracking](./features/05-dividend-tracking/roadmap.md)

---

## 🎨 UI/UX Ideas

### Dashboard Widgets
- Market overview (S&P 500, NASDAQ, BTC dominance)
- Fear & Greed index (crypto)
- Economic calendar
- Top gainers/losers in portfolio
- Crypto dominance chart
- Market heat map

### Visual Improvements
- Asset type icons (crypto logos, stock exchange icons)
- Sparkline mini-charts in holdings table
- Animated number transitions
- Skeleton loading for all components
- Confetti on reaching portfolio milestones

### Navigation
- Command palette (Cmd+K)
- Breadcrumbs for deep navigation
- Recent views history
- Bookmark specific views
- Search across all data

---

## 🔒 Security & Privacy Ideas

| Feature | Priority | Description |
|---------|----------|-------------|
| Local password | Medium | Optional app lock with PIN/password |
| Encrypted backups | Low | Password-protected export files |
| API key encryption | Medium | Enhanced encryption for exchange keys |
| Session timeout | Low | Auto-lock after inactivity |
| 2FA support | Low | TOTP for additional security |

---

## 🌐 Internationalization Ideas

| Feature | Priority | Notes |
|---------|----------|-------|
| Chinese localization | Low | Full UI translation |
| Date format preferences | Low | US vs. international formats |
| Currency display options | Low | Always show USD/CNY toggle |
| Timezone support | Low | User-configurable timezone |

---

## 📝 Backlog

- [ ] Auto-refresh prices when tab becomes active
- [ ] Portfolio comparison to benchmarks
- [ ] Asset correlation analysis
- [ ] Monte Carlo simulation for projections
- [ ] Option to hide small balances (< $1)
- [ ] Custom date format preferences
- [ ] Export to PDF report
- [ ] Share portfolio (view-only link)
- [ ] Recurring transaction support
- [ ] Stock split handling
- [ ] Options tracking (calls/puts)
- [ ] Lending/staking yield tracking
- [ ] Automated portfolio screenshots
- [ ] Telegram bot integration
- [ ] Discord webhook notifications

---

## ✅ Recently Completed

| Feature | Completed Date | Notes |
|---------|----------------|-------|
| Basic transaction management | 2026-02 | MVP complete |
| Real-time price fetching | 2026-02 | With LRU cache |
| Multi-currency support | 2026-02 | USD/CNY/HKD |
| Portfolio allocation chart | 2026-02 | Pie chart with Recharts |
| Responsive sidebar | 2026-02 | Collapsible navigation |

---

## 🗳️ Feature Voting (Hypothetical)

If this were open to users, features could be voted on. Top voted would likely be:

1. ⭐⭐⭐⭐⭐ [CSV Import/Export](./features/02-csv-import-export/roadmap.md)
2. ⭐⭐⭐⭐⭐ [Historical Charts](./features/historical-charts/roadmap.md)
3. ⭐⭐⭐⭐☆ [Price Alerts](./features/03-price-alerts/roadmap.md)
4. ⭐⭐⭐⭐☆ [Mobile App](./features/mobile-pwa/roadmap.md)
5. ⭐⭐⭐☆☆ [Dividend Tracking](./features/05-dividend-tracking/roadmap.md)

---

## 🚀 How to Request a Feature

To add a new feature request:

1. **Check existing requests** - Search this document first
2. **Use the template below** - Add to the appropriate section
3. **Link to roadmap if applicable** - If it becomes a planned feature
4. **Update status** - Mark as Planned/In Progress/Done as appropriate

### Feature Request Template

```markdown
### Feature Name
**Category:** [Analytics/Data/Integration/UI/Other]
**Priority:** [High/Medium/Low]
**Status:** [Idea/Planned/In Progress/Done]

**Description:**
What should this feature do?

**Use Case:**
Why is this needed?

**Proposed Implementation:**
Any ideas on how to build it?

**Related Roadmap:**
[Link to feature roadmap if exists]
```

---

## 📁 Related Documents

- [Main Roadmap](./ROADMAP.md) - High-level roadmap and phases
- [Implementation Plan](./IMPLEMENTATION_PLAN.md) - Detailed implementation steps
- [Feature Roadmaps](./features/) - Individual feature specifications
  - [Historical Charts](./features/historical-charts/roadmap.md)
  - [CSV Import/Export](./features/02-csv-import-export/roadmap.md)
  - [Price Alerts](./features/03-price-alerts/roadmap.md)
  - [Advanced Metrics](./features/04-advanced-metrics/roadmap.md)
  - [Dividend Tracking](./features/05-dividend-tracking/roadmap.md)
  - [Multiple Portfolios](./features/06-multiple-portfolios/roadmap.md)
  - [Exchange API Sync](./features/07-exchange-api-sync/roadmap.md)
  - [Tax Reporting](./features/09-tax-reporting/roadmap.md)
  - [Mobile PWA](./features/08-mobile-pwa/roadmap.md)

---

*Last Updated: 2026-02-05*
