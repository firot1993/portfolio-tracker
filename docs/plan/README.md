# Portfolio Tracker - Planning Documents

This directory contains planning and roadmap documentation for the Portfolio Tracker project.

---

## 📄 Documents Overview

| Document | Purpose | Audience |
|----------|---------|----------|
| [ROADMAP.md](./ROADMAP.md) | High-level feature roadmap organized by phases | Developers, Stakeholders |
| [FEATURE_REQUESTS.md](./FEATURE_REQUESTS.md) | Feature ideas, user feedback, backlog | Product, Developers |
| [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) | Consolidated implementation steps (legacy) | Developers |

---

## 🗂️ Feature Roadmaps

Each major feature has its own detailed roadmap:

### Analytics
| Feature | Priority | Status | Document |
|---------|----------|--------|----------|
| Historical Performance Charts | High | Planned | [roadmap.md](./features/01-historical-charts/roadmap.md) |
| Advanced Metrics | High | Planned | [roadmap.md](./features/04-advanced-metrics/roadmap.md) |

### Data Management
| Feature | Priority | Status | Document |
|---------|----------|--------|----------|
| CSV Import/Export | High | Planned | [roadmap.md](./features/02-csv-import-export/roadmap.md) |

### Notifications
| Feature | Priority | Status | Document |
|---------|----------|--------|----------|
| Price Alerts | High | Planned | [roadmap.md](./features/03-price-alerts/roadmap.md) |

### Portfolio Management
| Feature | Priority | Status | Document |
|---------|----------|--------|----------|
| Multiple Portfolios | Medium | Planned | [roadmap.md](./features/06-multiple-portfolios/roadmap.md) |
| Dividend Tracking | Medium | Planned | [roadmap.md](./features/05-dividend-tracking/roadmap.md) |

### Integrations
| Feature | Priority | Status | Document |
|---------|----------|--------|----------|
| Exchange API Sync | Medium | Planned | [roadmap.md](./features/07-exchange-api-sync/roadmap.md) |
| Mobile PWA | Medium | Planned | [roadmap.md](./features/08-mobile-pwa/roadmap.md) |

### Tax & Compliance
| Feature | Priority | Status | Document |
|---------|----------|--------|----------|
| Tax Reporting | Low | Planned | [roadmap.md](./features/09-tax-reporting/roadmap.md) |

---

## 🚀 Quick Start for New Features

1. **Check the Roadmap**: See [ROADMAP.md](./ROADMAP.md) for planned features by phase
2. **Review Feature Roadmap**: Click into specific feature roadmaps for detailed specs
3. **Pick a Feature**: Choose from high priority items in the roadmap
4. **Update Documentation**: Mark status in relevant docs as you progress

---

## 📊 Current Priorities

### Immediate (Next 1-2 Months)
1. **[Historical Performance Charts](./features/historical-charts/roadmap.md)** - Portfolio value over time
2. **[CSV Import/Export](./features/csv-import-export/roadmap.md)** - Import from brokerages, export data
3. **[Price Alerts](./features/price-alerts/roadmap.md)** - Notifications for price thresholds
4. **[Advanced Metrics](./features/advanced-metrics/roadmap.md)** - Sharpe ratio, CAGR, drawdown analysis

### Short Term (3-6 Months)
5. **[Dividend Tracking](./features/dividend-tracking/roadmap.md)** - Income tracking and yield calculations
6. **[Multiple Portfolios](./features/multiple-portfolios/roadmap.md)** - Separate portfolios for different strategies

### Long Term (6+ Months)
7. **[Exchange API Sync](./features/exchange-api-sync/roadmap.md)** - Auto-sync with exchanges
8. **[Tax Reporting](./features/tax-reporting/roadmap.md)** - Realized gains/losses, tax form export
9. **[Mobile PWA](./features/mobile-pwa/roadmap.md)** - Native-like mobile experience

---

## 🔄 Workflow

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Feature Request │ -> │  Main Roadmap   │ -> │ Feature Roadmap │
│  (Ideas/Bugs)   │    │  (Prioritization)│   │  (Detailed Spec)│
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                        │
                                                        v
                                               ┌─────────────────┐
                                               │ Implementation  │
                                               │   (Development) │
                                               └─────────────────┘
                                                        │
                                                        v
                                               ┌─────────────────┐
                                               │  Update Status  │
                                               │  (Documentation)│
                                               └─────────────────┘
```

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

## 📝 Adding New Documentation

When creating a new feature roadmap:

1. Create folder: `features/<feature-name>/`
2. Create `roadmap.md` with detailed spec
3. Add entry to this README's feature table
4. Link from [ROADMAP.md](./ROADMAP.md)
5. Link from [FEATURE_REQUESTS.md](./FEATURE_REQUESTS.md)

---

*Happy building! 🚀*
