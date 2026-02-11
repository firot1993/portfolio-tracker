import { useEffect, useState } from 'react';
import './MetricsPanel.css';
import { getPortfolioMetrics } from '../services/api';

type MetricsRange = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | 'YTD' | 'ALL';

interface MetricsData {
  range: MetricsRange;
  startDate: string;
  endDate: string;
  startValue: number;
  endValue: number;
  totalReturn: number;
  annualizedReturn: number;
  sharpeRatio: number | null;
  sortinoRatio: number | null;
  maxDrawdown: number;
  cagr: number | null;
  volatility: number | null;
  downside_volatility: number | null;
  bestDay: number | null;
  worstDay: number | null;
  winningDays: number;
  losingDays: number;
  winRate: number | null;
}

const RANGE_OPTIONS: MetricsRange[] = ['1M', '3M', '6M', '1Y', 'ALL'];

function formatPercent(value: number | null, decimals = 2) {
  if (value === null || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(decimals)}%`;
}

function formatRatio(value: number | null) {
  if (value === null || Number.isNaN(value)) return '—';
  return value.toFixed(2);
}

export default function MetricsPanel() {
  const [range, setRange] = useState<MetricsRange>('1M');
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = async (nextRange: MetricsRange) => {
    setLoading(true);
    setError(null);
    try {
      const response = await getPortfolioMetrics(nextRange);
      setData(response.data as MetricsData);
    } catch {
      setError('Failed to load metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMetrics(range);
  }, [range]);

  return (
    <div className="metrics-panel">
      <div className="panel-header">
        <h3>Advanced Metrics</h3>
        <div className="range-select">
          {RANGE_OPTIONS.map(option => (
            <button
              key={option}
              className={option === range ? 'active' : ''}
              onClick={() => setRange(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="panel-error">{error}</div>}
      {loading && <div className="panel-loading">Loading metrics...</div>}

      {!loading && data && (
        <div className="metrics-grid">
          <div className="metric-card">
            <span>Sharpe Ratio</span>
            <strong>{formatRatio(data.sharpeRatio)}</strong>
          </div>
          <div className="metric-card">
            <span>Sortino Ratio</span>
            <strong>{formatRatio(data.sortinoRatio)}</strong>
          </div>
          <div className="metric-card">
            <span>Max Drawdown</span>
            <strong>{formatPercent(data.maxDrawdown)}</strong>
          </div>
          <div className="metric-card">
            <span>CAGR</span>
            <strong>{formatPercent(data.cagr)}</strong>
          </div>
          <div className="metric-card">
            <span>Volatility</span>
            <strong>{formatPercent(data.volatility)}</strong>
          </div>
          <div className="metric-card">
            <span>Win Rate</span>
            <strong>{formatPercent(data.winRate)}</strong>
          </div>
          <div className="metric-card">
            <span>Best Day</span>
            <strong>{formatPercent(data.bestDay)}</strong>
          </div>
          <div className="metric-card">
            <span>Worst Day</span>
            <strong>{formatPercent(data.worstDay)}</strong>
          </div>
        </div>
      )}
    </div>
  );
}
