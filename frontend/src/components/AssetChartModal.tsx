import { useState, useEffect, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { X, Loader2 } from 'lucide-react';
import { getAssetHistory, type AssetHistoryPoint } from '../services/api';
import './AssetChartModal.css';

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

interface AssetChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  assetId: number;
  symbol: string;
  name: string;
  type: string;
  currentPrice?: number;
  avgCost?: number;
  quantity?: number;
}

interface ChartDataPoint {
  date: string;
  price: number;
  displayDate: string;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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

export function AssetChartModal({
  isOpen,
  onClose,
  assetId,
  symbol,
  name,
  type,
  currentPrice,
  avgCost,
  quantity,
}: AssetChartModalProps) {
  const [range, setRange] = useState<TimeRange>('1M');
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [livePrice, setLivePrice] = useState<number | undefined>(currentPrice);

  useEffect(() => {
    if (isOpen && assetId) {
      loadData();
    }
  }, [isOpen, assetId, range]);

  // Update live price when modal opens
  useEffect(() => {
    if (isOpen && currentPrice) {
      setLivePrice(currentPrice);
    }
  }, [isOpen, currentPrice]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getAssetHistory(assetId, range);
      
      // If we have no historical data, create a single point with current price
      if (response.data.length === 0 && livePrice) {
        const today = new Date().toISOString().split('T')[0];
        setData([{
          date: today,
          price: livePrice,
          displayDate: formatDate(today, range),
        }]);
      } else {
        const formatted = response.data.map((point: AssetHistoryPoint) => ({
          ...point,
          displayDate: formatDate(point.date, range),
        }));
        setData(formatted);
      }
    } catch (err) {
      setError('Failed to load price history');
      console.error('Error loading asset history:', err);
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    if (data.length === 0) return null;
    
    const first = data[0];
    const last = data[data.length - 1];
    const change = last.price - first.price;
    const changePercent = first.price > 0 ? (change / first.price) * 100 : 0;
    const isPositive = change >= 0;
    
    // Calculate P&L if we have avgCost and quantity
    let pnl = null;
    let pnlPercent = null;
    if (avgCost && quantity && livePrice) {
      pnl = (livePrice - avgCost) * quantity;
      pnlPercent = avgCost > 0 ? ((livePrice - avgCost) / avgCost) * 100 : 0;
    }
    
    return {
      currentPrice: last.price,
      change,
      changePercent,
      isPositive,
      high: Math.max(...data.map(d => d.price)),
      low: Math.min(...data.map(d => d.price)),
      pnl,
      pnlPercent,
    };
  }, [data, avgCost, quantity, livePrice]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const point = payload[0].payload as ChartDataPoint;
      return (
        <div className="asset-chart-tooltip">
          <div className="asset-chart-tooltip-date">
            {new Date(point.date).toLocaleDateString('en-US', {
              weekday: 'short',
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </div>
          <div className="asset-chart-tooltip-price">
            <span className="asset-chart-tooltip-label">Price:</span>
            <span className="asset-chart-tooltip-amount">{formatCurrency(point.price)}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'crypto': return '#F7931A';
      case 'stock_us': return '#0052CC';
      case 'stock_cn': return '#E60012';
      case 'gold': return '#FFD700';
      default: return '#0052CC';
    }
  };

  if (!isOpen) return null;

  const typeColor = getTypeColor(type);

  return (
    <div className="asset-chart-modal-overlay" onClick={onClose}>
      <div className="asset-chart-modal" onClick={(e) => e.stopPropagation()}>
        <div className="asset-chart-modal-header">
          <div className="asset-chart-modal-title">
            <span className="asset-chart-symbol" style={{ backgroundColor: typeColor }}>
              {symbol}
            </span>
            <div className="asset-chart-info">
              <h3>{name}</h3>
              <span className="asset-chart-type">{type.replace('_', ' ').toUpperCase()}</span>
            </div>
          </div>
          <button className="asset-chart-modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {stats && (
          <div className="asset-chart-modal-stats">
            <div className="asset-chart-stat">
              <span className="asset-chart-stat-label">Current Price</span>
              <span className="asset-chart-stat-value">{formatCurrency(stats.currentPrice)}</span>
            </div>
            <div className="asset-chart-stat">
              <span className="asset-chart-stat-label">Change</span>
              <span className={`asset-chart-stat-value ${stats.isPositive ? 'positive' : 'negative'}`}>
                {stats.isPositive ? '+' : ''}{stats.changePercent.toFixed(2)}%
              </span>
            </div>
            {stats.pnl !== null && (
              <div className="asset-chart-stat">
                <span className="asset-chart-stat-label">Your P&L</span>
                <span className={`asset-chart-stat-value ${(stats.pnl || 0) >= 0 ? 'positive' : 'negative'}`}>
                  {(stats.pnl || 0) >= 0 ? '+' : ''}{formatCurrency(stats.pnl || 0)}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="asset-chart-modal-ranges">
          {TIME_RANGES.map(({ value, label }) => (
            <button
              key={value}
              className={`asset-chart-range-btn ${range === value ? 'active' : ''}`}
              onClick={() => setRange(value)}
              disabled={loading}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="asset-chart-modal-content">
          {loading ? (
            <div className="asset-chart-loading">
              <Loader2 className="asset-chart-spinner" size={32} />
              <span>Loading price history...</span>
            </div>
          ) : error ? (
            <div className="asset-chart-error">
              <span>{error}</span>
              <button onClick={loadData} className="asset-chart-retry-btn">Retry</button>
            </div>
          ) : data.length === 0 ? (
            <div className="asset-chart-empty">
              <span>No price history available</span>
              <p>Price history will be recorded as prices are updated</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="assetChartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={typeColor} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={typeColor} stopOpacity={0} />
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
                  tickFormatter={(value) => `$${value.toLocaleString()}`}
                  tickLine={false}
                  axisLine={false}
                  domain={['auto', 'auto']}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke={typeColor}
                  strokeWidth={2}
                  fill="url(#assetChartGradient)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {stats && !loading && (
          <div className="asset-chart-modal-footer">
            <div className="asset-chart-footer-stat">
              <span className="asset-chart-footer-label">High</span>
              <span className="asset-chart-footer-value">{formatCurrency(stats.high)}</span>
            </div>
            <div className="asset-chart-footer-stat">
              <span className="asset-chart-footer-label">Low</span>
              <span className="asset-chart-footer-value">{formatCurrency(stats.low)}</span>
            </div>
            <div className="asset-chart-footer-stat">
              <span className="asset-chart-footer-label">Data Points</span>
              <span className="asset-chart-footer-value">{data.length}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AssetChartModal;
