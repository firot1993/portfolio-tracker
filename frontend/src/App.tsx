import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import {
  TrendingUp, Plus, RefreshCw, Trash2,
  LayoutDashboard, List, History, Search,
  X, ChevronDown, Wallet, DollarSign, AlertCircle,
  CheckCircle, Loader2, ArrowUpRight, ArrowDownRight,
  Menu, Bell, Wifi, WifiOff, LogOut, User
} from 'lucide-react';
import {
  Routes, Route, useNavigate
} from 'react-router-dom';
import {
  getPortfolioSummary, getTransactions, createAsset,
  createTransaction, deleteTransaction, createHolding,
  getAssets, deleteAsset, seedDefaultAssets, runBackfills, logout as logoutApi
} from './services/api';
import { useAuth } from './contexts/AuthContext';
import { useRealtimePrices } from './hooks/useRealtimePrices';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import './App.css';
import PerformanceChart from './components/PerformanceChart';
import AssetChartModal from './components/AssetChartModal';

const COLORS: Record<string, string> = {
  crypto: '#F7931A',
  stock_us: '#0052CC',
  stock_cn: '#E60012',
  gold: '#FFD700',
};

const TYPE_LABELS: Record<string, string> = {
  crypto: 'Crypto',
  stock_us: 'US Stocks',
  stock_cn: 'China Stocks',
  gold: 'Gold',
};

// Toast notification types
type ToastType = 'success' | 'error' | 'info';
interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

// Asset type
interface Asset {
  id: number;
  symbol: string;
  name: string;
  type: 'crypto' | 'stock_us' | 'stock_cn' | 'gold';
  currency: string;
  exchange?: string;
  currentPrice?: number | null;
}

// Transaction type
interface Transaction {
  id: number;
  asset_id: number;
  asset_symbol: string;
  asset_type: string;
  type: 'buy' | 'sell';
  quantity: number;
  price: number;
  fee?: number;
  date: string;
  notes?: string;
}

// Holding type
interface Holding {
  symbol: string;
  name: string;
  type: string;
  quantity: number;
  avgCost: number;
  currentPrice?: number;
  valueUSD: number;
  costUSD: number;
  pnl: number;
  pnlPercent: number;
}

// Dashboard Content Component - extracted to prevent re-renders
interface DashboardContentProps {
  loading: boolean;
  summary: PortfolioSummary | null;
  realtimeTotals: {
    totalValueUSD: number;
    totalPnL: number;
    totalPnLPercent: number;
  };
  dashboardData: {
    pieData: { name: string; value: number; color: string }[];
    topHoldings: Holding[];
    recentTransactions: Transaction[];
    hasHoldings: boolean;
    hasTransactions: boolean;
  };
  transactions: Transaction[];
  wsConnected: boolean;
  getRealtimePrice: (symbol: string) => number | null;
  setActiveTab: (tab: string) => void;
  setShowAddHolding: (show: boolean) => void;
  setShowAddTx: (show: boolean) => void;
}

const AllocationCard = React.memo(function AllocationCard({
  loading,
  pieData,
}: {
  loading: boolean;
  pieData: { name: string; value: number; color: string }[];
}) {
  return (
    <div className="dashboard-card">
      <div className="card-header">
        <h3>Asset Allocation</h3>
      </div>
      <div className="card-body">
        {loading ? (
          <div className="chart-skeleton" />
        ) : pieData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={100}
                dataKey="value"
                paddingAngle={2}
                isAnimationActive={false}
              >
                {pieData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(v) => `${v}%`}
                contentStyle={{ 
                  background: '#1a1a1a', 
                  border: '1px solid #333',
                  borderRadius: '8px'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState
            icon={PieChart}
            title="No Allocation Data"
            description="Add holdings to see your portfolio allocation"
          />
        )}
      </div>
    </div>
  );
});

const DashboardContent = React.memo(function DashboardContent({
  loading,
  summary,
  realtimeTotals,
  dashboardData,
  transactions,
  wsConnected,
  getRealtimePrice,
  setActiveTab,
  setShowAddHolding,
  setShowAddTx,
}: DashboardContentProps) {
  return (
    <>
      {/* Stats Cards */}
      <div className="stats-grid">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <StatCard
              title="Total Value"
              value={formatCurrency(realtimeTotals.totalValueUSD)}
              subtitle={`USD/CNY: ${summary?.usdcny?.toFixed(4) || '-'}`}
              icon={DollarSign}
            />
            <StatCard
              title="Total P&L"
              value={formatCurrency(realtimeTotals.totalPnL)}
              subtitle={formatPercent(realtimeTotals.totalPnLPercent)}
              icon={TrendingUp}
              trend={`${Math.abs(realtimeTotals.totalPnLPercent).toFixed(2)}%`}
              positive={realtimeTotals.totalPnL >= 0}
            />
            <StatCard
              title="Holdings"
              value={summary?.holdings?.length?.toString() || '0'}
              subtitle="Active positions"
              icon={Wallet}
            />
            <StatCard
              title="Transactions"
              value={transactions.length.toString()}
              subtitle="Total records"
              icon={History}
            />
          </>
        )}
      </div>

      {/* Performance Chart */}
      <div className="dashboard-full-width">
        <PerformanceChart />
      </div>

      {/* Main Content */}
      <div className="dashboard-grid">
        {/* Allocation Chart */}
        <AllocationCard loading={loading} pieData={dashboardData.pieData} />

        {/* Holdings Preview */}
        <div className="dashboard-card">
          <div className="card-header">
            <h3>Top Holdings</h3>
            <button 
              className="btn-text"
              onClick={() => setActiveTab('holdings')}
            >
              View All
            </button>
          </div>
          <div className="card-body">
            {loading ? (
              <SkeletonTable rows={3} />
            ) : dashboardData.hasHoldings ? (
              <div className="holdings-list">
                {dashboardData.topHoldings.map((h: Holding) => {
                  const realtimePrice = getRealtimePrice(h.symbol);
                  const hasRealtimePrice = realtimePrice !== null && wsConnected;
                  const displayPrice = realtimePrice ?? h.currentPrice ?? 0;
                  const displayValue = displayPrice * h.quantity;
                  const displayPnl = displayValue - h.costUSD;
                  const displayPnlPercent = h.costUSD > 0 ? (displayPnl / h.costUSD) * 100 : 0;
                  
                  return (
                    <div key={h.symbol} className={`holding-item ${hasRealtimePrice ? 'realtime-active' : ''}`}>
                      <div className="holding-info">
                        <span className={`type-badge ${h.type}`}>{h.symbol}</span>
                        <span className="holding-name">{h.name}</span>
                      </div>
                      <div className="holding-value">
                        <div className="holding-amount">{formatCurrency(displayValue)}</div>
                        <div className={`holding-pnl ${displayPnl >= 0 ? 'positive' : 'negative'}`}>
                          {formatPercent(displayPnlPercent)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon={Wallet}
                title="No Holdings"
                description="Add your first holding to get started"
                action={
                  <button onClick={() => setShowAddHolding(true)}>
                    <Plus size={16} /> Add Holding
                  </button>
                }
              />
            )}
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="dashboard-card full-width">
        <div className="card-header">
          <h3>Recent Transactions</h3>
          <button 
            className="btn-text"
            onClick={() => setActiveTab('transactions')}
          >
            View All
          </button>
        </div>
        <div className="card-body">
          {loading ? (
            <SkeletonTable rows={5} />
          ) : dashboardData.hasTransactions ? (
            <div className="transactions-table">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Asset</th>
                    <th>Type</th>
                    <th>Qty</th>
                    <th>Price</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardData.recentTransactions.map((tx) => (
                    <tr key={tx.id}>
                      <td>{new Date(tx.date).toLocaleDateString()}</td>
                      <td>
                        <span className="tx-asset">{tx.asset_symbol}</span>
                      </td>
                      <td>
                        <span className={`tx-badge ${tx.type}`}>
                          {tx.type?.toUpperCase()}
                        </span>
                      </td>
                      <td>{tx.quantity}</td>
                      <td>{formatCurrency(tx.price)}</td>
                      <td className="tx-total">{formatCurrency(tx.quantity * tx.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={History}
              title="No Transactions"
              description="Record your first buy or sell transaction"
              action={
                <button onClick={() => setShowAddTx(true)}>
                  <Plus size={16} /> Add Transaction
                </button>
              }
            />
          )}
        </div>
      </div>
    </>
  );
});

// Portfolio Summary type
interface PortfolioSummary {
  totalValueUSD: number;
  totalPnL: number;
  totalPnLPercent: number;
  usdcny?: number;
  allocation: Record<string, number>;
  allocationPercent: Record<string, number>;
  holdings: Holding[];
  stalePrices?: boolean;
  staleAssets?: string[];
}

// Toast context
function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, showToast, removeToast };
}

function formatCurrency(value: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number) {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}



// Skeleton Components
function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton-line short" />
      <div className="skeleton-line long" />
    </div>
  );
}

function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="skeleton-table">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-row">
          <div className="skeleton-cell" />
          <div className="skeleton-cell" />
          <div className="skeleton-cell" />
          <div className="skeleton-cell" />
        </div>
      ))}
    </div>
  );
}

// Toast Component
function ToastContainer({ toasts, removeToast }: { toasts: Toast[]; removeToast: (id: string) => void }) {
  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <div key={toast.id} className={`toast toast-${toast.type}`}>
          {toast.type === 'success' && <CheckCircle size={18} />}
          {toast.type === 'error' && <AlertCircle size={18} />}
          {toast.type === 'info' && <Bell size={18} />}
          <span>{toast.message}</span>
          <button onClick={() => removeToast(toast.id)} className="toast-close">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

// Empty State Component
function EmptyState({ 
  icon: Icon, 
  title, 
  description, 
  action 
}: { 
  icon: React.ElementType; 
  title: string; 
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon size={48} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

// Navigation Sidebar
function Sidebar({ 
  activeTab, 
  setActiveTab, 
  collapsed, 
  setCollapsed,
  isAssetAdmin
}: { 
  activeTab: string; 
  setActiveTab: (tab: string) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  isAssetAdmin: boolean;
}) {
  const navItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'holdings', icon: Wallet, label: 'Holdings' },
    { id: 'transactions', icon: History, label: 'Transactions' },
    { id: 'assets', icon: List, label: 'Assets' },
  ].filter(item => (isAssetAdmin ? true : item.id !== 'assets'));

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="logo">
          <span className="logo-icon">📊</span>
          {!collapsed && <span className="logo-text">Portfolio</span>}
        </div>
        <button 
          className="collapse-btn"
          onClick={() => setCollapsed(!collapsed)}
        >
          <Menu size={20} />
        </button>
      </div>
      
      <nav className="sidebar-nav">
        {navItems.map(item => (
          <button
            key={item.id}
            className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => setActiveTab(item.id)}
          >
            <item.icon size={20} />
            {!collapsed && <span>{item.label}</span>}
          </button>
        ))}
      </nav>

      {!collapsed && (
        <div className="sidebar-footer">
          <div className="version">v1.0.0</div>
        </div>
      )}
    </aside>
  );
}

// Stats Card Component
function StatCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  trend,
  positive 
}: { 
  title: string; 
  value: string; 
  subtitle?: string;
  icon: React.ElementType;
  trend?: string;
  positive?: boolean;
}) {
  return (
    <div className="stat-card">
      <div className="stat-header">
        <div className="stat-icon">
          <Icon size={20} />
        </div>
        {trend && (
          <span className={`stat-trend ${positive ? 'positive' : 'negative'}`}>
            {positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {trend}
          </span>
        )}
      </div>
      <div className="stat-content">
        <div className="stat-value">{value}</div>
        <div className="stat-title">{title}</div>
        {subtitle && <div className="stat-subtitle">{subtitle}</div>}
      </div>
    </div>
  );
}

// Searchable Asset Select
function AssetSelect({ 
  assets, 
  value, 
  onChange, 
  placeholder = "Select asset..." 
}: { 
  assets: Asset[]; 
  value: string; 
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const selectedAsset = assets.find(a => a.id.toString() === value);

  const filteredAssets = assets.filter(a => 
    a.symbol.toLowerCase().includes(search.toLowerCase()) ||
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="asset-select">
      <button 
        type="button"
        className="asset-select-trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        {selectedAsset ? (
          <>
            <span className={`type-badge ${selectedAsset.type}`}>
              {selectedAsset.symbol}
            </span>
            <span className="asset-name">{selectedAsset.name}</span>
          </>
        ) : (
          <span className="placeholder">{placeholder}</span>
        )}
        <ChevronDown size={16} className={isOpen ? 'open' : ''} />
      </button>
      
      {isOpen && (
        <div className="asset-select-dropdown">
          <div className="asset-select-search">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search assets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="asset-select-options">
            {filteredAssets.map(asset => (
              <button
                key={asset.id}
                type="button"
                className={`asset-option ${value === asset.id.toString() ? 'selected' : ''}`}
                onClick={() => {
                  onChange(asset.id.toString());
                  setIsOpen(false);
                  setSearch('');
                }}
              >
                <span className={`type-badge ${asset.type}`}>{asset.symbol}</span>
                <span className="asset-option-name">{asset.name}</span>
              </button>
            ))}
            {filteredAssets.length === 0 && (
              <div className="asset-option-empty">No assets found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Modal Component
function Modal({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  size = 'md' 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  title: string; 
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal modal-${size}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button onClick={onClose} className="modal-close">
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );
}

// Main App Component
function App() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isAssetAdmin = useMemo(() => {
    const raw = import.meta.env.VITE_ASSET_ADMIN_EMAILS || '';
    const allowed = raw
      .split(',')
      .map((email: string) => email.trim().toLowerCase())
      .filter(Boolean);
    if (!user || allowed.length === 0) return false;
    return allowed.includes(user.email.toLowerCase());
  }, [user]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [priceRefreshing, setPriceRefreshing] = useState(false);
  const [backfillRunning, setBackfillRunning] = useState(false);
  const [stalePrices, setStalePrices] = useState(false);
  const { toasts, showToast, removeToast } = useToast();
  
  // Realtime prices and connection status
  const { prices: realtimePrices, connected: wsConnected, stats: wsStats } = useRealtimePrices();
  
  // Use API-fetched holdings - refreshed every 10 minutes
  const holdingsList = useMemo(() => {
    return summary?.holdings || [];
  }, [summary?.holdings]);
  
  // Auto-refresh holdings list every 10 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      console.log('[App] Auto-refreshing holdings list (10 min interval)');
      loadData(true); // silent refresh
    }, 10 * 60 * 1000); // 10 minutes
    
    return () => clearInterval(interval);
  }, []); // Empty deps - interval runs continuously
  
  // Helper to get realtime price for a holding
  const getRealtimePrice = useCallback((symbol: string): number | null => {
    const asset = assets.find(a => a.symbol === symbol);
    if (!asset) return null;
    const price = realtimePrices.get(asset.id);
    return price?.price ?? null;
  }, [realtimePrices, assets]);

  const realtimeTotals = useMemo(() => {
    let totalValueUSD = 0;
    let totalCostUSD = 0;
    for (const h of holdingsList) {
      const realtimePrice = getRealtimePrice(h.symbol);
      const displayPrice = realtimePrice ?? h.currentPrice ?? 0;
      const valueUSD = displayPrice * h.quantity;
      totalValueUSD += valueUSD;
      totalCostUSD += h.costUSD;
    }
    const totalPnL = totalValueUSD - totalCostUSD;
    const totalPnLPercent = totalCostUSD > 0 ? (totalPnL / totalCostUSD) * 100 : 0;
    return { totalValueUSD, totalPnL, totalPnLPercent };
  }, [holdingsList, getRealtimePrice]);

  // Modals state
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [showAddTx, setShowAddTx] = useState(false);
  const [showAddHolding, setShowAddHolding] = useState(false);
  
  // Asset chart modal state
  const [selectedAssetForChart, setSelectedAssetForChart] = useState<Holding | null>(null);


  // Load portfolio data - uses cached prices for instant loading
  const loadData = async (silent = false, refreshPriceData = false) => {
    if (!silent) setLoading(true);
    if (silent) setRefreshing(true);
    
    try {
      // First load with cached prices for instant display
      const [summaryData, txData, assetsData] = await Promise.all([
        getPortfolioSummary({ includePrices: true, refreshPrices: refreshPriceData }),
        getTransactions({ limit: 50 }),
        getAssets(),
      ]);
      setSummary(summaryData);
      setTransactions(txData);
      setAssets(assetsData);
      setStalePrices(summaryData.stalePrices || false);
      
      // Note: Realtime prices are handled via WebSocket, no need for polling
    } catch {
      showToast('Failed to load data. Is the backend running?', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  
  // Manual refresh from API (fallback when WebSocket is not available)
  const handleRefreshPrices = async () => {
    if (wsConnected) {
      showToast('Realtime prices active via WebSocket', 'info');
      return;
    }
    setPriceRefreshing(true);
    try {
      await loadData(true, true);
      showToast('Prices refreshed from API', 'success');
    } catch {
      showToast('Failed to refresh prices', 'error');
    } finally {
      setPriceRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isAssetAdmin && activeTab === 'assets') {
      setActiveTab('dashboard');
    }
  }, [isAssetAdmin, activeTab]);

  // Seed default assets
  const handleSeedAssets = async () => {
    try {
      const result = await seedDefaultAssets();
      showToast(`Seeded ${result.added} default assets`, 'success');
      loadData();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status: number } };
      if (axiosErr.response?.status === 409) {
        showToast('Database already contains assets', 'info');
      } else {
        showToast('Failed to seed assets', 'error');
      }
    }
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      await logout();
      await logoutApi();
      navigate('/login');
    } catch (err) {
      console.error('Logout error:', err);
      navigate('/login');
    }
  };

  const handleRunBackfills = async () => {
    setBackfillRunning(true);
    try {
      const result = await runBackfills();
      const stats = result.data?.stats;
      if (stats) {
        showToast(
          `Backfill complete. Pending: ${stats.pendingJobs}, Completed: ${stats.completedJobs}`,
          'success'
        );
      } else {
        showToast('Backfill complete', 'success');
      }
    } catch {
      showToast('Failed to run backfills', 'error');
    } finally {
      setBackfillRunning(false);
    }
  };

  const pieData = useMemo(() => {
    return summary
      ? (Object.entries(summary.allocationPercent || {}) as [string, number][])
          .filter(([, v]) => v > 0)
          .map(([type, value]) => ({
            name: TYPE_LABELS[type] || type,
            value: parseFloat(value.toFixed(2)),
            color: COLORS[type],
          }))
      : [];
  }, [summary?.allocationPercent]); // Only recalculate when allocation changes

  // Memoize dashboard data to prevent chart re-renders
  const dashboardData = useMemo(() => ({
    pieData,
    topHoldings: holdingsList.slice(0, 5),
    recentTransactions: transactions.slice(0, 10),
    hasHoldings: holdingsList.length > 0,
    hasTransactions: transactions.length > 0,
  }), [pieData, holdingsList, transactions]);

  // Holdings View
  const HoldingsView = () => (
    <div className="page">
      <div className="page-header">
        <h2>Holdings</h2>
        <button onClick={() => setShowAddHolding(true)}>
          <Plus size={16} /> Add Holding
        </button>
      </div>
      {loading ? (
        <SkeletonTable rows={8} />
      ) : holdingsList.length > 0 ? (
        <div className="data-table">
          <table>
            <thead>
              <tr>
                <th>Asset</th>
                <th>Qty</th>
                <th>Avg Cost</th>
                <th>Current Price</th>
                <th>Value</th>
                <th>P&L</th>
              </tr>
            </thead>
            <tbody>
              {holdingsList.map((h: Holding) => {
                const realtimePrice = getRealtimePrice(h.symbol);
                const displayPrice = realtimePrice ?? h.currentPrice;
                const hasRealtimePrice = realtimePrice !== null && wsConnected;
                const displayValue = displayPrice ? displayPrice * h.quantity : 0;
                const displayPnl = displayValue - h.costUSD;
                const displayPnlPercent = h.costUSD > 0 ? (displayPnl / h.costUSD) * 100 : 0;
                
                return (
                  <tr 
                    key={h.symbol} 
                    className="clickable-row"
                    onClick={() => setSelectedAssetForChart(h)}
                    title="Click to view price history"
                  >
                    <td>
                      <div className="asset-cell">
                        <span className={`type-badge ${h.type}`}>{h.symbol}</span>
                        <span className="asset-name">{h.name}</span>
                      </div>
                    </td>
                    <td>{h.quantity?.toFixed(4)}</td>
                    <td>{formatCurrency(h.avgCost)}</td>
                    <td className={hasRealtimePrice ? 'realtime-price' : ''}>
                      {displayPrice ? formatCurrency(displayPrice) : '-'}
                    </td>
                    <td className="value-cell">{formatCurrency(displayValue)}</td>
                    <td className={displayPnl >= 0 ? 'positive' : 'negative'}>
                      <div className="pnl-cell">
                        {formatCurrency(displayPnl)}
                        <small>({formatPercent(displayPnlPercent)})</small>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={Wallet}
          title="No Holdings Yet"
          description="Add your first holding to track your investments"
          action={
            <button onClick={() => setShowAddHolding(true)}>
              <Plus size={16} /> Add Holding
            </button>
          }
        />
      )}
    </div>
  );

  // Transactions View
  const TransactionsView = () => (
    <div className="page">
      <div className="page-header">
        <h2>Transactions</h2>
        <button onClick={() => setShowAddTx(true)}>
          <Plus size={16} /> Add Transaction
        </button>
      </div>
      {loading ? (
        <SkeletonTable rows={8} />
      ) : transactions.length > 0 ? (
        <div className="data-table">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Asset</th>
                <th>Type</th>
                <th>Qty</th>
                <th>Price</th>
                <th>Total</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id}>
                  <td>{new Date(tx.date).toLocaleDateString()}</td>
                  <td>
                    <div className="asset-cell">
                      <span className={`type-badge ${tx.asset_type}`}>{tx.asset_symbol}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`tx-badge ${tx.type}`}>
                      {tx.type?.toUpperCase()}
                    </span>
                  </td>
                  <td>{tx.quantity}</td>
                  <td>{formatCurrency(tx.price)}</td>
                  <td className="value-cell">{formatCurrency(tx.quantity * tx.price)}</td>
                  <td>
                    <button
                      onClick={async () => {
                        if (window.confirm('Delete this transaction?')) {
                          try {
                            await deleteTransaction(tx.id);
                            showToast('Transaction deleted', 'success');
                            loadData();
                          } catch {
                            showToast('Failed to delete transaction', 'error');
                          }
                        }
                      }}
                      className="btn-icon danger"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={History}
          title="No Transactions"
          description="Record your investment activities"
          action={
            <button onClick={() => setShowAddTx(true)}>
              <Plus size={16} /> Add Transaction
            </button>
          }
        />
      )}
    </div>
  );

  // Assets View
  const AssetsView = () => (
    <div className="page">
      <div className="page-header">
        <h2>Asset Management</h2>
        <div className="page-actions">
          <button onClick={handleSeedAssets} className="btn-secondary">
            <RefreshCw size={16} /> Seed Defaults
          </button>
          <button
            onClick={handleRunBackfills}
            className="btn-secondary"
            disabled={backfillRunning}
            title="Run queued backfill jobs"
          >
            <History size={16} className={backfillRunning ? 'spin' : ''} /> Backfill
          </button>
          <button onClick={() => setShowAddAsset(true)}>
            <Plus size={16} /> Add Asset
          </button>
        </div>
      </div>
      {loading ? (
        <SkeletonTable rows={8} />
      ) : assets.length > 0 ? (
        <div className="data-table">
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Name</th>
                <th>Type</th>
                <th>Currency</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => (
                <tr key={asset.id}>
                  <td>
                    <span className={`type-badge ${asset.type}`}>{asset.symbol}</span>
                  </td>
                  <td>{asset.name}</td>
                  <td>{TYPE_LABELS[asset.type] || asset.type}</td>
                  <td>{asset.currency}</td>
                  <td>
                    <button
                      onClick={async () => {
                        if (window.confirm(`Delete ${asset.symbol}?`)) {
                          try {
                            await deleteAsset(asset.id);
                            showToast('Asset deleted', 'success');
                            loadData();
                          } catch {
                            showToast('Failed to delete asset', 'error');
                          }
                        }
                      }}
                      className="btn-icon danger"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={List}
          title="No Assets"
          description="Add assets or seed default symbols"
          action={
            <div className="empty-actions">
              <button onClick={handleSeedAssets}>
                <RefreshCw size={16} /> Seed Defaults
              </button>
              <button onClick={() => setShowAddAsset(true)}>
                <Plus size={16} /> Add Custom
              </button>
            </div>
          }
        />
      )}
    </div>
  );

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Protected Routes */}
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <div className="app-container">
              <Sidebar
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                collapsed={sidebarCollapsed}
                setCollapsed={setSidebarCollapsed}
                isAssetAdmin={isAssetAdmin}
              />

              <main className={`main-content ${sidebarCollapsed ? 'expanded' : ''}`}>
                {/* Header */}
                <header className="top-header">
                  <div className="header-left">
                    <h1>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h1>
                  </div>
                  <div className="header-right">
                    {/* WebSocket Connection Status */}
                    <div
                      className={`ws-status ${wsConnected ? 'connected' : 'disconnected'}`}
                      title={wsConnected
                        ? `Realtime: ${wsStats?.cryptoCount || 0} crypto, ${wsStats?.stockUsCount || 0} stocks`
                        : 'Realtime disconnected'
                      }
                    >
                      {wsConnected ? <Wifi size={16} /> : <WifiOff size={16} />}
                      {wsConnected && (
                        <span className="ws-badge">
                          {wsStats?.trackedAssets || 0}
                        </span>
                      )}
                    </div>

                    {stalePrices && !priceRefreshing && (
                      <span className="price-stale-indicator" title="Prices may be outdated">
                        <AlertCircle size={16} />
                      </span>
                    )}
                    <button
                      onClick={handleRefreshPrices}
                      className="btn-icon"
                      disabled={priceRefreshing}
                      title={wsConnected ? 'Realtime active (WebSocket)' : 'Refresh prices from API'}
                    >
                      <RefreshCw size={18} className={priceRefreshing || wsConnected ? 'spin' : ''} />
                    </button>
                    <button
                      onClick={() => loadData(true)}
                      className="btn-icon"
                      disabled={refreshing}
                      title="Reload data"
                    >
                      <List size={18} className={refreshing ? 'spin' : ''} />
                    </button>
                    <div className="header-actions">
                      <button onClick={() => setShowAddTx(true)} className="btn-primary">
                        <Plus size={16} /> Quick Add
                      </button>
                    </div>

                    {/* User Menu */}
                    {user && (
                      <div className="user-menu" style={{ marginLeft: '12px' }}>
                        <button
                          className="user-email"
                          onClick={handleLogout}
                          title="Click to logout"
                        >
                          <User size={14} />
                          <span>{user.email}</span>
                          <LogOut size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </header>

                {/* Content */}
                <div className="content">
                  {activeTab === 'dashboard' && (
                    <DashboardContent
                      loading={loading}
                      summary={summary}
                      realtimeTotals={realtimeTotals}
                      dashboardData={dashboardData}
                      transactions={transactions}
                      wsConnected={wsConnected}
                      getRealtimePrice={getRealtimePrice}
                      setActiveTab={setActiveTab}
                      setShowAddHolding={setShowAddHolding}
                      setShowAddTx={setShowAddTx}
                    />
                  )}
                  {activeTab === 'holdings' && <HoldingsView />}
                  {activeTab === 'transactions' && <TransactionsView />}
                  {activeTab === 'assets' && isAssetAdmin && <AssetsView />}
                </div>
              </main>

              {/* Toasts */}
              <ToastContainer toasts={toasts} removeToast={removeToast} />

              {/* Modals */}
              {isAssetAdmin && (
                <AddAssetModal
                  isOpen={showAddAsset}
                  onClose={() => setShowAddAsset(false)}
                  onSuccess={() => {
                    showToast('Asset added successfully', 'success');
                    loadData();
                  }}
                  showToast={showToast}
                />
              )}

              <AddTransactionModal
                isOpen={showAddTx}
                onClose={() => setShowAddTx(false)}
                onSuccess={() => {
                  showToast('Transaction added successfully', 'success');
                  loadData();
                }}
                assets={assets}
                showToast={showToast}
              />

              <AddHoldingModal
                isOpen={showAddHolding}
                onClose={() => setShowAddHolding(false)}
                onSuccess={() => {
                  showToast('Holding added successfully', 'success');
                  loadData();
                }}
                assets={assets}
                showToast={showToast}
              />

              {/* Asset Chart Modal */}
              <AssetChartModal
                isOpen={!!selectedAssetForChart}
                onClose={() => setSelectedAssetForChart(null)}
                assetId={assets.find(a => a.symbol === selectedAssetForChart?.symbol)?.id || 0}
                symbol={selectedAssetForChart?.symbol || ''}
                name={selectedAssetForChart?.name || ''}
                type={selectedAssetForChart?.type || ''}
                currentPrice={selectedAssetForChart?.currentPrice}
                avgCost={selectedAssetForChart?.avgCost}
                quantity={selectedAssetForChart?.quantity}
              />
            </div>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

// Add Asset Modal
function AddAssetModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  showToast 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onSuccess: () => void;
  showToast: (msg: string, type: ToastType) => void;
}) {
  const [form, setForm] = useState({ symbol: '', name: '', type: 'crypto', currency: 'USD' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.symbol || !form.name) {
      showToast('Please fill in all required fields', 'error');
      return;
    }
    
    setLoading(true);
    try {
      await createAsset(form);
      onSuccess();
      onClose();
      setForm({ symbol: '', name: '', type: 'crypto', currency: 'USD' });
    } catch {
      showToast('Failed to add asset', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add New Asset">
      <form onSubmit={handleSubmit} className="form">
        <div className="form-group">
          <label>Symbol *</label>
          <input
            value={form.symbol}
            onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })}
            placeholder="BTC, AAPL, 600519..."
            required
          />
        </div>
        <div className="form-group">
          <label>Name *</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Bitcoin, Apple Inc..."
            required
          />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Type</label>
            <select 
              value={form.type} 
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              <option value="crypto">Crypto</option>
              <option value="stock_us">US Stock</option>
              <option value="stock_cn">China Stock</option>
              <option value="gold">Gold</option>
            </select>
          </div>
          <div className="form-group">
            <label>Currency</label>
            <select 
              value={form.currency} 
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            >
              <option value="USD">USD</option>
              <option value="CNY">CNY</option>
              <option value="HKD">HKD</option>
            </select>
          </div>
        </div>
        <div className="form-actions">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
            {loading ? 'Adding...' : 'Add Asset'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Add Transaction Modal
function AddTransactionModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  assets,
  showToast 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onSuccess: () => void;
  assets: Asset[];
  showToast: (msg: string, type: ToastType) => void;
}) {
  const [form, setForm] = useState({
    asset_id: '',
    type: 'buy',
    quantity: '',
    price: '',
    date: new Date().toISOString().split('T')[0],
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.asset_id || !form.quantity || !form.price) {
      showToast('Please fill in all fields', 'error');
      return;
    }

    setLoading(true);
    try {
      await createTransaction({
        asset_id: Number(form.asset_id),
        type: form.type as 'buy' | 'sell',
        quantity: Number(form.quantity),
        price: Number(form.price),
        date: form.date,
      });
      onSuccess();
      onClose();
      setForm({
        asset_id: '',
        type: 'buy',
        quantity: '',
        price: '',
        date: new Date().toISOString().split('T')[0],
      });
    } catch {
      showToast('Failed to add transaction', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Transaction">
      <form onSubmit={handleSubmit} className="form">
        <div className="form-group">
          <label>Asset *</label>
          <AssetSelect
            assets={assets}
            value={form.asset_id}
            onChange={(value) => setForm({ ...form, asset_id: value })}
          />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Type</label>
            <select 
              value={form.type} 
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>
          </div>
          <div className="form-group">
            <label>Date</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Quantity *</label>
            <input
              type="number"
              step="any"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              placeholder="0.00"
              required
            />
          </div>
          <div className="form-group">
            <label>Price *</label>
            <input
              type="number"
              step="any"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              placeholder="0.00"
              required
            />
          </div>
        </div>
        {form.quantity && form.price && (
          <div className="form-summary">
            Total: <strong>{formatCurrency(Number(form.quantity) * Number(form.price))}</strong>
          </div>
        )}
        <div className="form-actions">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
            {loading ? 'Adding...' : 'Add Transaction'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Add Holding Modal
function AddHoldingModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  assets,
  showToast 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onSuccess: () => void;
  assets: Asset[];
  showToast: (msg: string, type: ToastType) => void;
}) {
  const [form, setForm] = useState({
    asset_id: '',
    quantity: '',
    avg_cost: '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.asset_id || !form.quantity || !form.avg_cost) {
      showToast('Please fill in all fields', 'error');
      return;
    }

    setLoading(true);
    try {
      await createHolding({
        asset_id: Number(form.asset_id),
        quantity: Number(form.quantity),
        avg_cost: Number(form.avg_cost),
      });
      onSuccess();
      onClose();
      setForm({ asset_id: '', quantity: '', avg_cost: '' });
    } catch {
      showToast('Failed to add holding', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Holding">
      <form onSubmit={handleSubmit} className="form">
        <div className="form-group">
          <label>Asset *</label>
          <AssetSelect
            assets={assets}
            value={form.asset_id}
            onChange={(value) => setForm({ ...form, asset_id: value })}
          />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Quantity *</label>
            <input
              type="number"
              step="any"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              placeholder="0.00"
              required
            />
          </div>
          <div className="form-group">
            <label>Average Cost *</label>
            <input
              type="number"
              step="any"
              value={form.avg_cost}
              onChange={(e) => setForm({ ...form, avg_cost: e.target.value })}
              placeholder="0.00"
              required
            />
          </div>
        </div>
        <div className="form-actions">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
            {loading ? 'Adding...' : 'Add Holding'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default App;
