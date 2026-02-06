# Feature Roadmap: Advanced Metrics

> **Category:** Analytics  
> **Priority:** High  
> **Effort:** Medium  
> **Target Version:** v1.1  
> **Status:** Planned  
> **Dependencies:** [Historical Charts](../historical-charts/roadmap.md)

---

## Overview

Provide advanced portfolio analytics including risk metrics, performance ratios, and benchmark comparisons.

---

## Goals

1. Measure risk-adjusted returns (Sharpe ratio, etc.)
2. Understand portfolio volatility and drawdowns
3. Compare performance against benchmarks
4. Identify best/worst performing assets

---

## User Stories

- As a user, I want to see my Sharpe ratio so that I understand my risk-adjusted returns
- As a user, I want to know my maximum drawdown so that I understand my worst-case scenario
- As a user, I want to compare against S&P 500 so that I know if I'm beating the market

---

## Metrics to Implement

### Performance Metrics

| Metric | Description | Formula |
|--------|-------------|---------|
| Total Return | Overall gain/loss | (Current - Cost) / Cost |
| Annualized Return (CAGR) | Yearly growth rate | (End / Start)^(1/years) - 1 |
| Daily/Weekly/Monthly Return | Period returns | (Price_t / Price_t-1) - 1 |

### Risk Metrics

| Metric | Description | Formula |
|--------|-------------|---------|
| Sharpe Ratio | Risk-adjusted return | (Return - Risk Free) / StdDev |
| Sortino Ratio | Downside risk-adjusted return | (Return - Risk Free) / Downside StdDev |
| Volatility | Standard deviation of returns | σ(returns) |
| Beta | Market correlation | Cov(Portfolio, Market) / Var(Market) |
| Maximum Drawdown | Largest peak-to-trough decline | max(Peak - Trough) / Peak |
| Calmar Ratio | Return to max drawdown ratio | CAGR / Max Drawdown |

### Portfolio Metrics

| Metric | Description |
|--------|-------------|
| Win Rate | % of profitable positions |
| Profit Factor | Gross Profit / Gross Loss |
| Average Winner | Average profit on winning trades |
| Average Loser | Average loss on losing trades |
| Best/Worst Performer | Assets with highest/lowest returns |

---

## Technical Implementation

### Backend API

#### New Endpoints

```typescript
// GET /api/metrics/portfolio?range=1Y
// Returns comprehensive portfolio metrics
{
  "range": "1Y",
  "period": {
    "start_date": "2024-01-01",
    "end_date": "2024-12-31",
    "trading_days": 252
  },
  "returns": {
    "total_return": 0.25,
    "total_return_pct": "25.00%",
    "annualized_return": 0.25,
    "cagr": "25.00%",
    "daily_avg_return": 0.0009,
    "weekly_avg_return": 0.0045,
    "monthly_avg_return": 0.019
  },
  "risk": {
    "volatility": 0.15,
    "volatility_annualized": 0.238,
    "sharpe_ratio": 1.05,
    "sortino_ratio": 1.52,
    "max_drawdown": -0.12,
    "max_drawdown_pct": "-12.00%",
    "max_drawdown_period": {
      "start": "2024-03-15",
      "end": "2024-04-20"
    },
    "calmar_ratio": 2.08,
    "beta": 1.15,
    "alpha": 0.05
  },
  "performance": {
    "win_rate": 0.65,
    "profit_factor": 2.1,
    "avg_winner": 1250,
    "avg_loser": -450,
    "best_performer": {
      "symbol": "BTC",
      "return": 0.85
    },
    "worst_performer": {
      "symbol": "TSLA",
      "return": -0.25
    }
  },
  "benchmark_comparison": {
    "benchmark": "SPY",
    "benchmark_return": 0.20,
    "excess_return": 0.05,
    "tracking_error": 0.08,
    "information_ratio": 0.625
  }
}

// GET /api/metrics/asset/:id?range=1Y
// Returns metrics for specific asset
{
  "asset_id": 1,
  "symbol": "BTC",
  "metrics": {
    "return": 0.85,
    "volatility": 0.45,
    "sharpe_ratio": 1.89,
    "max_drawdown": -0.25,
    "contribution_to_portfolio": 0.35
  }
}

// GET /api/metrics/benchmarks
// List available benchmarks
{
  "benchmarks": [
    { "symbol": "SPY", "name": "S&P 500 ETF" },
    { "symbol": "QQQ", "name": "NASDAQ-100 ETF" },
    { "symbol": "BTC", "name": "Bitcoin" },
    { "symbol": "GOLD", "name": "Gold Spot" }
  ]
}
```

#### Services

**Metrics Service** (`backend/src/services/metricsService.ts`)

```typescript
export interface PortfolioMetrics {
  returns: ReturnMetrics;
  risk: RiskMetrics;
  performance: PerformanceMetrics;
  benchmarkComparison: BenchmarkComparison;
}

export async function calculatePortfolioMetrics(
  portfolioHistory: HistoryPoint[],
  benchmarkHistory?: HistoryPoint[],
  riskFreeRate: number = 0.02
): Promise<PortfolioMetrics>;

export async function calculateAssetMetrics(
  assetHistory: HistoryPoint[]
): Promise<AssetMetrics>;

// Helper functions
export function calculateSharpeRatio(
  returns: number[],
  riskFreeRate: number
): number;

export function calculateMaxDrawdown(
  values: number[]
): { maxDrawdown: number; startIndex: number; endIndex: number };

export function calculateVolatility(
  returns: number[],
  annualize: boolean = true
): number;

export function calculateBeta(
  portfolioReturns: number[],
  marketReturns: number[]
): number;
```

### Frontend Components

#### New Components

1. **MetricsDashboard** - Main metrics page
2. **MetricCard** - Individual metric display with trend
3. **RiskAnalysis** - Risk-specific metrics section
4. **BenchmarkComparison** - Side-by-side comparison chart
5. **TopPerformers** - Best/worst assets list

#### Dashboard Layout

```
Metrics Dashboard
┌─────────────────────────────────────────────────────────────┐
│  Portfolio Performance                                      │
│  ┌─────────────────┐ ┌─────────────────┐ ┌───────────────┐  │
│  │ Total Return    │ │ Annualized      │ │ Sharpe Ratio  │  │
│  │ +25.00%         │ │ +25.00%         │ │ 1.05          │  │
│  │ vs SPY: +5%     │ │ CAGR            │ │ Risk-adjusted │  │
│  └─────────────────┘ └─────────────────┘ └───────────────┘  │
│                                                             │
│  Risk Analysis                                              │
│  ┌─────────────────┐ ┌─────────────────┐ ┌───────────────┐  │
│  │ Max Drawdown    │ │ Volatility      │ │ Beta vs SPY   │  │
│  │ -12.00%         │ │ 23.8%           │ │ 1.15          │  │
│  │ Mar 15 - Apr 20 │ │ Annualized      │ │ More volatile │  │
│  └─────────────────┘ └─────────────────┘ └───────────────┘  │
│                                                             │
│  Benchmark Comparison                                       │
│  [Portfolio vs SPY line chart]                              │
│                                                             │
│  Top Performers                                             │
│  1. BTC +85%    2. ETH +45%    3. AAPL +15%                 │
│  Worst: TSLA -25%                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Tasks

### Phase 1: Backend (Week 1)
- [ ] Create metrics calculation service
- [ ] Implement return calculations
- [ ] Implement risk metrics (Sharpe, volatility, drawdown)
- [ ] Add benchmark data fetching
- [ ] Create metrics API endpoints
- [ ] Write unit tests for calculations

### Phase 2: Frontend (Week 2)
- [ ] Create MetricsDashboard page
- [ ] Create MetricCard component
- [ ] Create RiskAnalysis section
- [ ] Create BenchmarkComparison chart
- [ ] Create TopPerformers list
- [ ] Add to sidebar navigation

### Phase 3: Polish (Week 3)
- [ ] Add tooltips explaining each metric
- [ ] Add time range selector
- [ ] Mobile responsive design
- [ ] Export metrics as PDF/CSV
- [ ] E2E tests

---

## Calculation Details

### Sharpe Ratio
```typescript
function calculateSharpeRatio(returns: number[], riskFreeRate: number): number {
  const excessReturns = returns.map(r => r - riskFreeRate / 252); // Daily risk-free
  const avgExcessReturn = mean(excessReturns);
  const stdDev = standardDeviation(excessReturns);
  return (avgExcessReturn / stdDev) * Math.sqrt(252); // Annualized
}
```

### Maximum Drawdown
```typescript
function calculateMaxDrawdown(values: number[]): number {
  let maxDrawdown = 0;
  let peak = values[0];
  
  for (const value of values) {
    if (value > peak) {
      peak = value;
    }
    const drawdown = (peak - value) / peak;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
  }
  
  return -maxDrawdown; // Return as negative number
}
```

---

## Risk-Free Rate

Use the 10-year Treasury yield as the risk-free rate:
- Fetch from Yahoo Finance (^TNX)
- Cache and update daily
- Default to 2% if unavailable

---

## Benchmarks

| Symbol | Name | Type |
|--------|------|------|
| SPY | SPDR S&P 500 ETF | Stocks |
| QQQ | Invesco QQQ Trust | Tech Stocks |
| DIA | SPDR Dow Jones ETF | Large Cap |
| IWM | iShares Russell 2000 | Small Cap |
| BTC | Bitcoin | Crypto |
| ETH | Ethereum | Crypto |
| GLD | SPDR Gold Shares | Gold |

---

## Success Metrics

- All calculations complete in < 500ms
- Metrics update automatically with new data
- Tooltips explain every metric in plain language

---

## Future Enhancements

- VaR (Value at Risk) calculation
- Monte Carlo simulation for projections
- Correlation matrix between assets
- Rolling metrics (30-day Sharpe, etc.)
- Custom benchmark creation

---

*Last Updated: 2026-02-05*  
*Related: [Historical Charts](../01-historical-charts/roadmap.md)*
