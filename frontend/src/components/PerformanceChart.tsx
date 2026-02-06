import { useState, useEffect, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { TrendingUp, TrendingDown, Loader2, Download } from 'lucide-react';
import { getPortfolioHistory, type PortfolioHistoryPoint } from '../services/api';
import './PerformanceChart.css';

const TIME_RANGES = [
  { value: '1D', label: '1D' },
  { value: '1W', label: '1W' },
  { value: '1M', label: '1M' },
  { value: '3M', label: '3M' },
  { value: '6M', label: '6M' },
  { value: '1Y', label: '1Y' },
  { value: 'YTD', label: 'YTD' },
  { value: 'ALL', label: 'All' },
] as const;

type TimeRange = typeof TIME_RANGES[number]['value'];

interface ChartDataPoint {
  date: string;
  value: number;
  cost: number;
  pnl: number;
  displayDate: string;
}

interface PerformanceChartProps {
  className?: string;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(dateStr: string, range: TimeRange): string {
  const date = new Date(dateStr);
  
  if (range === '1D') {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
  if (range === '1W' || range === '1M') {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export function PerformanceChart({ className }: PerformanceChartProps) {
  const [range, setRange] = useState<TimeRange>('1M');
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [range]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getPortfolioHistory(range);
      const formatted = response.data.map((point: PortfolioHistoryPoint) => ({
        ...point,
        displayDate: formatDate(point.date, range),
      }));
      setData(formatted);
    } catch (err) {
      setError('Failed to load chart data');
      console.error('Error loading portfolio history:', err);
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    if (data.length === 0) return null;
    
    const first = data[0];
    const last = data[data.length - 1];
    const change = last.value - first.value;
    const changePercent = first.value > 0 ? (change / first.value) * 100 : 0;
    const isPositive = change >= 0;
    
    return {
      currentValue: last.value,
      change,
      changePercent,
      isPositive,
      high: Math.max(...data.map(d => d.value)),
      low: Math.min(...data.map(d => d.value)),
    };
  }, [data]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const point = payload[0].payload as ChartDataPoint;
      return (
        <div className="chart-tooltip">
          <div className="chart-tooltip-date">
            {new Date(point.date).toLocaleDateString('en-US', {
              weekday: 'short',
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </div>
          <div className="chart-tooltip-value">
            <span className="chart-tooltip-label">Value:</span>
            <span className="chart-tooltip-amount">{formatCurrency(point.value)}</span>
          </div>
          <div className="chart-tooltip-cost">
            <span className="chart-tooltip-label">Cost:</span>
            <span className="chart-tooltip-amount">{formatCurrency(point.cost)}</span>
          </div>
          <div className={`chart-tooltip-pnl ${point.pnl >= 0 ? 'positive' : 'negative'}`}>
            <span className="chart-tooltip-label">P&L:</span>
            <span className="chart-tooltip-amount">
              {point.pnl >= 0 ? '+' : ''}{formatCurrency(point.pnl)}
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className={`performance-chart ${className || ''}`}>
      <div className="chart-header">
        <div className="chart-title-section">
          <div className="chart-title-row">
            <h3 className="chart-title">Portfolio Performance</h3>
            <button 
              className="chart-export-btn"
              onClick={() => {
                // Simple export: alert user to use browser print or screenshot
                // In production, this would use html2canvas to generate PNG
                alert('Chart export: Use browser print (Ctrl+P) or take a screenshot. Full export feature coming soon!');
              }}
              title="Export chart"
            >
              <Download size={16} />
            </button>
          </div>
          {stats && (
            <div className="chart-stats">
              <span className="chart-current-value">{formatCurrency(stats.currentValue)}</span>
              <span className={`chart-change ${stats.isPositive ? 'positive' : 'negative'}`}>
                {stats.isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {stats.isPositive ? '+' : ''}{formatCurrency(stats.change)} ({stats.changePercent.toFixed(2)}%)
              </span>
            </div>
          )}
        </div>
        <div className="chart-time-ranges">
          {TIME_RANGES.map(({ value, label }) => (
            <button
              key={value}
              className={`chart-range-btn ${range === value ? 'active' : ''}`}
              onClick={() => setRange(value)}
              disabled={loading}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="chart-container">
        {loading ? (
          <div className="chart-loading">
            <Loader2 className="chart-spinner" size={32} />
            <span>Loading chart data...</span>
          </div>
        ) : error ? (
          <div className="chart-error">
            <span>{error}</span>
            <button onClick={loadData} className="chart-retry-btn">Retry</button>
          </div>
        ) : data.length === 0 ? (
          <div className="chart-empty">
            <span>No historical data available</span>
            <p>Start tracking your portfolio to see performance over time</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0052CC" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#0052CC" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorPositive" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorNegative" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
              <XAxis
                dataKey="displayDate"
                stroke="#666"
                tick={{ fill: '#999', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                minTickGap={30}
              />
              <YAxis
                stroke="#666"
                tick={{ fill: '#999', fontSize: 11 }}
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                tickLine={false}
                axisLine={false}
                domain={['auto', 'auto']}
              />
              <Tooltip content={<CustomTooltip />} />
              {stats && (
                <ReferenceLine
                  y={stats.low}
                  stroke="#666"
                  strokeDasharray="3 3"
                  strokeOpacity={0.5}
                />
              )}
              <Area
                type="monotone"
                dataKey="value"
                stroke={stats?.isPositive ? '#22c55e' : '#ef4444'}
                strokeWidth={2}
                fill={stats?.isPositive ? 'url(#colorPositive)' : 'url(#colorNegative)'}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {stats && !loading && (
        <div className="chart-footer">
          <div className="chart-stat">
            <span className="chart-stat-label">High</span>
            <span className="chart-stat-value">{formatCurrency(stats.high)}</span>
          </div>
          <div className="chart-stat">
            <span className="chart-stat-label">Low</span>
            <span className="chart-stat-value">{formatCurrency(stats.low)}</span>
          </div>
          <div className="chart-stat">
            <span className="chart-stat-label">Data Points</span>
            <span className="chart-stat-value">{data.length}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default PerformanceChart;
