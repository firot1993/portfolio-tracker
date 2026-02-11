import { useEffect, useMemo, useState } from 'react';
import './RebalancingWidget.css';
import { getRebalanceSuggestions, getUserPreferences, setUserPreferences } from '../services/api';

type AllocationMap = {
  crypto: number;
  stock_us: number;
  stock_cn: number;
  gold: number;
};

interface RebalanceSuggestion {
  action: 'buy' | 'sell';
  assetType: keyof AllocationMap;
  currentValue: number;
  targetValue: number;
  difference: number;
  percentOfPortfolio: number;
  reason: string;
}

interface RebalanceResponse {
  currentAllocation: AllocationMap;
  targetAllocation: AllocationMap;
  suggestions: RebalanceSuggestion[];
  totalPortfolioValue: number;
  rebalancingNeeded: boolean;
}

const TYPE_LABELS: Record<keyof AllocationMap, string> = {
  crypto: 'Crypto',
  stock_us: 'US Stocks',
  stock_cn: 'China Stocks',
  gold: 'Gold',
};

export default function RebalancingWidget() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<RebalanceResponse | null>(null);
  const [form, setForm] = useState<AllocationMap>({
    crypto: 0.4,
    stock_us: 0.3,
    stock_cn: 0.2,
    gold: 0.1,
  });
  const [threshold, setThreshold] = useState(0.05);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [prefs, suggestions] = await Promise.all([
        getUserPreferences(),
        getRebalanceSuggestions(),
      ]);
      setForm({
        crypto: prefs.preferences.crypto,
        stock_us: prefs.preferences.stock_us,
        stock_cn: prefs.preferences.stock_cn,
        gold: prefs.preferences.gold,
      });
      setThreshold(prefs.preferences.rebalance_threshold);
      setData(suggestions);
    } catch {
      setError('Failed to load rebalancing data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const totalAllocation = useMemo(() => {
    return form.crypto + form.stock_us + form.stock_cn + form.gold;
  }, [form]);

  const handleSave = async () => {
    if (Math.abs(totalAllocation - 1) > 0.001) {
      setError('Target allocation must sum to 1.00');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await setUserPreferences({
        target_allocation_crypto: form.crypto,
        target_allocation_stock_us: form.stock_us,
        target_allocation_stock_cn: form.stock_cn,
        target_allocation_gold: form.gold,
        rebalance_threshold: threshold,
      });
      await loadData();
    } catch {
      setError('Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rebalancing-widget">
      <div className="widget-header">
        <h3>Rebalancing Suggestions</h3>
        <button onClick={loadData} disabled={loading} className="btn-secondary">
          Refresh
        </button>
      </div>

      {error && <div className="widget-error">{error}</div>}

      <div className="widget-body">
        <div className="widget-section">
          <h4>Target Allocation</h4>
          <div className="allocation-grid">
            {(Object.keys(form) as Array<keyof AllocationMap>).map((key) => (
              <label key={key} className="allocation-input">
                <span>{TYPE_LABELS[key]}</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={form[key]}
                  onChange={(event) =>
                    setForm({ ...form, [key]: Number(event.target.value) })
                  }
                />
              </label>
            ))}
          </div>
          <div className="allocation-footer">
            <span>Total: {totalAllocation.toFixed(2)}</span>
            <label className="threshold-input">
              Rebalance Threshold
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={threshold}
                onChange={(event) => setThreshold(Number(event.target.value))}
              />
            </label>
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : 'Save Targets'}
            </button>
          </div>
        </div>

        <div className="widget-section">
          <h4>Suggestions</h4>
          {loading && <div className="widget-loading">Loading...</div>}
          {!loading && data && data.suggestions.length === 0 && (
            <div className="widget-empty">No rebalancing needed</div>
          )}
          {!loading && data && data.suggestions.length > 0 && (
            <div className="suggestions-list">
              {data.suggestions.map((suggestion) => (
                <div key={`${suggestion.assetType}-${suggestion.action}`} className="suggestion-card">
                  <div className={`suggestion-action ${suggestion.action}`}>
                    {suggestion.action.toUpperCase()}
                  </div>
                  <div className="suggestion-details">
                    <div className="suggestion-title">
                      {TYPE_LABELS[suggestion.assetType]}
                    </div>
                    <div className="suggestion-reason">{suggestion.reason}</div>
                  </div>
                  <div className="suggestion-values">
                    <div>${suggestion.difference.toFixed(2)}</div>
                    <small>{(suggestion.percentOfPortfolio * 100).toFixed(1)}% of portfolio</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
