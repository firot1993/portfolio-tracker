import { useEffect, useState } from 'react';
import './AlertManager.css';
import {
  createAlert,
  deleteAlert,
  getAlertHistory,
  getAlerts,
  updateAlert,
  type AlertRecord,
  type Asset,
} from '../services/api';

interface AlertManagerProps {
  assets: Asset[];
}

export default function AlertManager({ assets }: AlertManagerProps) {
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    asset_id: '',
    alert_type: 'above' as 'above' | 'below' | 'change_percent',
    threshold: '',
  });
  const [history, setHistory] = useState<Record<number, Array<{ id: number; triggered_price: number; notified_at: string }>>>({});

  const loadAlerts = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getAlerts();
      setAlerts(response.alerts);
    } catch {
      setError('Failed to load alerts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlerts();
  }, []);

  const handleCreate = async () => {
    if (!form.asset_id || !form.threshold) {
      setError('Asset and threshold are required');
      return;
    }
    try {
      await createAlert({
        asset_id: Number(form.asset_id),
        alert_type: form.alert_type,
        threshold: Number(form.threshold),
        is_active: true,
      });
      setForm({ asset_id: '', alert_type: 'above', threshold: '' });
      loadAlerts();
    } catch {
      setError('Failed to create alert');
    }
  };

  const toggleAlert = async (alert: AlertRecord) => {
    try {
      await updateAlert(alert.id, { is_active: !alert.is_active });
      loadAlerts();
    } catch {
      setError('Failed to update alert');
    }
  };

  const removeAlert = async (id: number) => {
    try {
      await deleteAlert(id);
      loadAlerts();
    } catch {
      setError('Failed to delete alert');
    }
  };

  const loadHistory = async (alertId: number) => {
    if (history[alertId]) {
      setHistory(prev => {
        const next = { ...prev };
        delete next[alertId];
        return next;
      });
      return;
    }
    try {
      const response = await getAlertHistory(alertId);
      setHistory(prev => ({ ...prev, [alertId]: response.history }));
    } catch {
      setError('Failed to load alert history');
    }
  };

  return (
    <div className="alert-manager">
      <div className="manager-header">
        <h3>Price Alerts</h3>
        <button onClick={loadAlerts} className="btn-secondary">Refresh</button>
      </div>

      {error && <div className="manager-error">{error}</div>}

      <div className="alert-form">
        <select
          value={form.asset_id}
          onChange={event => setForm({ ...form, asset_id: event.target.value })}
        >
          <option value="">Select asset</option>
          {assets.map(asset => (
            <option key={asset.id} value={asset.id}>
              {asset.symbol} - {asset.name}
            </option>
          ))}
        </select>
        <select
          value={form.alert_type}
          onChange={event => setForm({ ...form, alert_type: event.target.value as 'above' | 'below' | 'change_percent' })}
        >
          <option value="above">Above</option>
          <option value="below">Below</option>
        </select>
        <input
          type="number"
          placeholder="Threshold"
          value={form.threshold}
          onChange={event => setForm({ ...form, threshold: event.target.value })}
        />
        <button onClick={handleCreate} className="btn-primary">Create</button>
      </div>

      {loading && <div className="manager-loading">Loading alerts...</div>}

      {!loading && alerts.length === 0 && (
        <div className="manager-empty">No alerts configured</div>
      )}

      {!loading && alerts.length > 0 && (
        <div className="alert-list">
          {alerts.map(alert => (
            <div key={alert.id} className="alert-card">
              <div>
                <strong>{alert.asset_symbol}</strong> {alert.alert_type} {alert.threshold}
              </div>
              <div className="alert-actions">
                <button onClick={() => toggleAlert(alert)} className="btn-secondary">
                  {alert.is_active ? 'Disable' : 'Enable'}
                </button>
                <button onClick={() => loadHistory(alert.id)} className="btn-secondary">History</button>
                <button onClick={() => removeAlert(alert.id)} className="btn-danger">Delete</button>
              </div>
              {history[alert.id] && (
                <div className="alert-history">
                  {history[alert.id].length === 0 && <span>No triggers yet</span>}
                  {history[alert.id].map(item => (
                    <div key={item.id}>
                      Triggered at {item.triggered_price} on {new Date(item.notified_at).toLocaleString()}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
