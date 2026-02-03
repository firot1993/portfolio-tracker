import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { TrendingUp, TrendingDown, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { getPortfolioSummary, getTransactions, createAsset, createTransaction, deleteTransaction, createHolding, getAssets, deleteAsset, cleanupAllAssets } from './services/api';
import './App.css';

const COLORS: Record<string, string> = {
  crypto: '#F7931A',
  stock_us: '#0052CC',
  stock_cn: '#E60012',
  gold: '#FFD700',
};

const TYPE_LABELS: Record<string, string> = {
  crypto: 'Crypto',
  stock_us: 'US Stocks',
  stock_cn: 'CN Stocks',
  gold: 'Gold',
};

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

function App() {
  const [summary, setSummary] = useState<any | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [showAddTx, setShowAddTx] = useState(false);
  const [showAddHolding, setShowAddHolding] = useState(false);
  const [showSymbolManagement, setShowSymbolManagement] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryData, txData] = await Promise.all([
        getPortfolioSummary(),
        getTransactions({ limit: 10 }),
      ]);
      setSummary(summaryData);
      setTransactions(txData);
    } catch {
      setError('Failed to load data. Is the backend running?');
      console.error('Failed to load portfolio data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const pieData = summary
    ? (Object.entries(summary.allocationPercent || {}) as [string, number][])
        .filter(([, v]) => v > 0)
        .map(([type, value]) => ({
          name: TYPE_LABELS[type] || type,
          value: parseFloat(value.toFixed(2)),
          color: COLORS[type],
        }))
    : [];

  if (loading) {
    return (
      <div className="loading">
        <RefreshCw className="spin" size={32} />
        <p>Loading portfolio...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error">
        <p>{error}</p>
        <button onClick={loadData}>Retry</button>
      </div>
    );
  }

  return (
    <div className="app">
      <header>
        <h1>📊 Portfolio Tracker</h1>
        <div className="actions">
          <button onClick={() => setShowAddAsset(true)}>
            <Plus size={16} /> Add Asset
          </button>
          <button onClick={() => setShowAddTx(true)}>
            <Plus size={16} /> Add Transaction
          </button>
          <button onClick={() => setShowAddHolding(true)}>
            <Plus size={16} /> Add Holding
          </button>
          <button onClick={() => setShowSymbolManagement(true)}>
            <Trash2 size={16} /> Symbols
          </button>
          <button onClick={loadData} className="icon-btn">
            <RefreshCw size={16} />
          </button>
        </div>
      </header>

      {summary && (
        <>
          <div className="summary-cards">
            <div className="card total">
              <h3>Total Value</h3>
              <p className="value">{formatCurrency(summary.totalValueUSD)}</p>
            </div>
            <div className={`card pnl ${summary.totalPnL >= 0 ? 'positive' : 'negative'}`}>
              <h3>Total P&L</h3>
              <p className="value">
                {summary.totalPnL >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                {formatCurrency(summary.totalPnL)} ({formatPercent(summary.totalPnLPercent)})
              </p>
            </div>
            <div className="card">
              <h3>USD/CNY Rate</h3>
              <p className="value">{summary.usdcny?.toFixed(4) || '-'}</p>
            </div>
          </div>

          <div className="main-content">
            <div className="chart-section">
              <h2>Allocation</h2>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}%`}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => `${v}%`} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="empty">No holdings yet</p>
              )}
            </div>

            <div className="holdings-section">
              <h2>Holdings</h2>
              {summary.holdings && summary.holdings.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th>Qty</th>
                      <th>Price</th>
                      <th>Value</th>
                      <th>P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.holdings.map((h: any) => (
                      <tr key={h.symbol}>
                        <td>
                          <span className={`type-badge ${h.type}`}>{h.symbol}</span>
                          <small>{h.name}</small>
                        </td>
                        <td>{h.quantity?.toFixed(4) || '-'}</td>
                        <td>{h.currentPrice ? formatCurrency(h.currentPrice) : '-'}</td>
                        <td>{formatCurrency(h.valueUSD)}</td>
                        <td className={h.pnl >= 0 ? 'positive' : 'negative'}>
                          {formatPercent(h.pnlPercent)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="empty">No holdings yet. Add a transaction or holding to get started!</p>
              )}
            </div>
          </div>

          <div className="transactions-section">
            <h2>Recent Transactions</h2>
            {transactions.length > 0 ? (
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
                      <td>{tx.asset_symbol}</td>
                      <td className={`tx-type ${tx.type}`}>{tx.type?.toUpperCase()}</td>
                      <td>{tx.quantity}</td>
                      <td>{formatCurrency(tx.price)}</td>
                      <td>{formatCurrency(tx.quantity * tx.price)}</td>
                      <td>
                        <button
                          onClick={async () => {
                            if (window.confirm('Are you sure you want to delete this transaction?')) {
                              try {
                                await deleteTransaction(tx.id);
                                loadData();
                              } catch {
                                alert('Failed to delete transaction');
                              }
                            }
                          }}
                          className="icon-btn"
                          style={{ background: 'transparent', border: 'none' }}
                        >
                          <Trash2 size={16} color="#ef4444" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="empty">No transactions yet</p>
            )}
          </div>
        </>
      )}

      {showAddAsset && (
        <AddAssetModal onClose={() => setShowAddAsset(false)} onSuccess={loadData} />
      )}
      {showAddTx && (
        <AddTransactionModal key={Math.random()} onClose={() => setShowAddTx(false)} onSuccess={loadData} />
      )}
      {showAddHolding && (
        <AddHoldingModal onClose={() => setShowAddHolding(false)} onSuccess={loadData} />
      )}
      {showSymbolManagement && (
        <SymbolManagementModal onClose={() => setShowSymbolManagement(false)} onSuccess={loadData} />
      )}
    </div>
  );
}

function AddAssetModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ symbol: '', name: '', type: 'crypto', currency: 'USD' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createAsset(form);
      onSuccess();
      onClose();
    } catch {
      alert('Failed to add asset');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Add Asset</h2>
        <form onSubmit={handleSubmit}>
          <label>
            Symbol
            <input
              value={form.symbol}
              onChange={(e) => setForm({ ...form, symbol: e.target.value })}
              placeholder="BTC, AAPL, 600519..."
              required
            />
          </label>
          <label>
            Name
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Bitcoin, Apple Inc..."
              required
            />
          </label>
          <label>
            Type
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="crypto">Crypto</option>
              <option value="stock_us">US Stock</option>
              <option value="stock_cn">China Stock</option>
              <option value="gold">Gold</option>
            </select>
          </label>
          <label>
            Currency
            <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              <option value="USD">USD</option>
              <option value="CNY">CNY</option>
            </select>
          </label>
          <div className="modal-actions">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={loading}>
              {loading ? 'Adding...' : 'Add Asset'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddTransactionModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [assets, setAssets] = useState<any[]>([]);
  const [form, setForm] = useState({
    asset_id: '',
    type: 'buy',
    quantity: '',
    price: '',
    date: new Date().toISOString().split('T')[0],
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getAssets().then((data) => setAssets(data));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
    } catch {
      alert('Failed to add transaction');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Add Transaction</h2>
        <form onSubmit={handleSubmit}>
          <label>
            Asset
            <select
              value={form.asset_id}
              onChange={(e) => setForm({ ...form, asset_id: e.target.value })}
              required
            >
              <option value="">Select asset...</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>{a.symbol}</option>
              ))}
            </select>
          </label>
          <label>
            Type
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>
          </label>
          <label>
            Quantity
            <input
              type="number"
              step="any"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              required
            />
          </label>
          <label>
            Price
            <input
              type="number"
              step="any"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              required
            />
          </label>
          <label>
            Date
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
            />
          </label>
          <div className="modal-actions">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={loading}>
              {loading ? 'Adding...' : 'Add Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddHoldingModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [assets, setAssets] = useState<any[]>([]);
  const [form, setForm] = useState({
    asset_id: '',
    quantity: '',
    avg_cost: '',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getAssets().then((data) => setAssets(data));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createHolding({
        asset_id: Number(form.asset_id),
        quantity: Number(form.quantity),
        avg_cost: Number(form.avg_cost),
      });
      onSuccess();
      onClose();
    } catch {
      alert('Failed to add holding');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Add Holding</h2>
        <form onSubmit={handleSubmit}>
          <label>
            Asset
            <select
              value={form.asset_id}
              onChange={(e) => setForm({ ...form, asset_id: e.target.value })}
              required
            >
              <option value="">Select asset...</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>{a.symbol}</option>
              ))}
            </select>
          </label>
          <label>
            Quantity
            <input
              type="number"
              step="any"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              required
            />
          </label>
          <label>
            Average Cost
            <input
              type="number"
              step="any"
              value={form.avg_cost}
              onChange={(e) => setForm({ ...form, avg_cost: e.target.value })}
              required
            />
          </label>
          <div className="modal-actions">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={loading}>
              {loading ? 'Adding...' : 'Add Holding'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SymbolManagementModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [assets, setAssets] = useState<any[]>([]);
  const [filteredAssets, setFilteredAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmCleanup, setConfirmCleanup] = useState(false);

  useEffect(() => {
    loadAssets();
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredAssets(assets);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredAssets(
        assets.filter(
          (a) =>
            a.symbol.toLowerCase().includes(query) || a.name.toLowerCase().includes(query)
        )
      );
    }
  }, [searchQuery, assets]);

  const loadAssets = async () => {
    setLoading(true);
    try {
      const data = await getAssets();
      setAssets(data);
      setFilteredAssets(data);
    } catch (error) {
      console.error('Failed to load assets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAsset = async (id: number, symbol: string) => {
    if (!window.confirm(`Are you sure you want to delete "${symbol}"? This will also delete all related transactions and holdings.`)) {
      return;
    }
    try {
      await deleteAsset(id);
      await loadAssets();
      onSuccess();
    } catch {
      alert('Failed to delete asset');
    }
  };

  const handleCleanupAll = async () => {
    if (!confirmCleanup) {
      setConfirmCleanup(true);
      return;
    }
    
    if (!window.confirm('Are you sure you want to delete ALL assets, transactions, and holdings? This cannot be undone!')) {
      setConfirmCleanup(false);
      return;
    }
    
    try {
      await cleanupAllAssets();
      setAssets([]);
      setFilteredAssets([]);
      setConfirmCleanup(false);
      onSuccess();
      alert('All data has been cleaned up.');
    } catch {
      alert('Failed to cleanup data');
      setConfirmCleanup(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Symbol Management</h2>
        
        <div className="search-box">
          <input
            type="text"
            placeholder="Search symbols..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="asset-list">
          {loading ? (
            <p>Loading...</p>
          ) : filteredAssets.length === 0 ? (
            <p className="empty">
              {searchQuery ? 'No symbols found matching your search.' : 'No symbols available.'}
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredAssets.map((asset) => (
                  <tr key={asset.id}>
                    <td>
                      <span className={`type-badge ${asset.type}`}>{asset.symbol}</span>
                    </td>
                    <td>{asset.name}</td>
                    <td>{TYPE_LABELS[asset.type] || asset.type}</td>
                    <td>
                      <button
                        onClick={() => handleDeleteAsset(asset.id, asset.symbol)}
                        className="icon-btn"
                        style={{ background: 'transparent', border: 'none' }}
                      >
                        <Trash2 size={16} color="#ef4444" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="modal-actions">
          <button 
            onClick={handleCleanupAll} 
            style={{ background: confirmCleanup ? '#ef4444' : undefined, color: confirmCleanup ? 'white' : undefined }}
          >
            {confirmCleanup ? 'Click again to confirm cleanup' : 'Delete All Data'}
          </button>
          <button type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default App;
