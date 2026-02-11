import { Router } from 'express';
import { query, run, lastInsertId, saveDB } from '../db/index.js';
import { getAssetPrice } from '../services/priceService.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

router.post('/', async (req, res) => {
  const userId = (req as any).user.id;
  const { asset_id, alert_type, threshold, is_active = true } = req.body;

  if (!asset_id || !alert_type || threshold === undefined) {
    return res.status(400).json({ success: false, error: 'asset_id, alert_type, threshold are required' });
  }

  if (threshold <= 0) {
    return res.status(400).json({ success: false, error: 'Threshold must be greater than 0' });
  }

  const asset = query('SELECT id, symbol, name FROM assets WHERE id = ?', [asset_id])[0] as any;
  if (!asset) {
    return res.status(404).json({ success: false, error: 'Asset not found' });
  }

  try {
    run(
      `INSERT INTO alerts (user_id, asset_id, alert_type, threshold, is_active)
       VALUES (?, ?, ?, ?, ?)` ,
      [userId, asset_id, alert_type, threshold, is_active ? 1 : 0]
    );
    saveDB();

    const id = lastInsertId();
    const created = query('SELECT * FROM alerts WHERE id = ?', [id])[0] as any;

    res.status(201).json({
      success: true,
      alert: {
        ...created,
        asset_symbol: asset.symbol,
      }
    });
  } catch (error: any) {
    if (error.message?.includes('UNIQUE')) {
      return res.status(409).json({ success: false, error: 'Duplicate alert already exists' });
    }
    console.error('Error creating alert:', error);
    res.status(500).json({ success: false, error: 'Failed to create alert' });
  }
});

router.get('/', async (req, res) => {
  const userId = (req as any).user.id;
  const { is_active, asset_id } = req.query;

  const filters: string[] = ['a.user_id = ?'];
  const params: any[] = [userId];

  if (is_active !== undefined) {
    filters.push('a.is_active = ?');
    params.push(is_active === 'true' ? 1 : 0);
  }

  if (asset_id) {
    filters.push('a.asset_id = ?');
    params.push(Number(asset_id));
  }

  const alerts = query(
    `SELECT a.*, assets.symbol as asset_symbol, assets.name as asset_name, assets.type as asset_type
     FROM alerts a
     JOIN assets ON a.asset_id = assets.id
     WHERE ${filters.join(' AND ')}
     ORDER BY a.created_at DESC`,
    params
  ) as any[];

  const alertsWithPrices = await Promise.all(
    alerts.map(async alert => {
      const currentPrice = await getAssetPrice(alert.asset_symbol, alert.asset_type);
      return { ...alert, current_price: currentPrice };
    })
  );

  res.json({ success: true, alerts: alertsWithPrices });
});

router.put('/:id', (req, res) => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { threshold, is_active } = req.body;

  const existing = query('SELECT * FROM alerts WHERE id = ? AND user_id = ?', [Number(id), userId])[0] as any;
  if (!existing) {
    return res.status(404).json({ success: false, error: 'Alert not found' });
  }

  if (threshold !== undefined && threshold <= 0) {
    return res.status(400).json({ success: false, error: 'Threshold must be greater than 0' });
  }

  const newThreshold = threshold ?? existing.threshold;
  const newIsActive = is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active;

  try {
    run(
      `UPDATE alerts
       SET threshold = ?, is_active = ?, updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`,
      [newThreshold, newIsActive, Number(id), userId]
    );
    saveDB();

    const updated = query('SELECT * FROM alerts WHERE id = ?', [Number(id)])[0] as any;
    res.json({ success: true, alert: updated });
  } catch (error: any) {
    if (error.message?.includes('UNIQUE')) {
      return res.status(409).json({ success: false, error: 'Duplicate alert already exists' });
    }
    console.error('Error updating alert:', error);
    res.status(500).json({ success: false, error: 'Failed to update alert' });
  }
});

router.delete('/:id', (req, res) => {
  const userId = (req as any).user.id;
  const { id } = req.params;

  const existing = query('SELECT id FROM alerts WHERE id = ? AND user_id = ?', [Number(id), userId]);
  if (existing.length === 0) {
    return res.status(404).json({ success: false, error: 'Alert not found' });
  }

  run('DELETE FROM alerts WHERE id = ? AND user_id = ?', [Number(id), userId]);
  saveDB();
  res.json({ success: true, message: 'Alert deleted' });
});

router.get('/:id/history', (req, res) => {
  const userId = (req as any).user.id;
  const { id } = req.params;

  const alert = query(
    `SELECT a.*, assets.symbol as asset_symbol, assets.name as asset_name
     FROM alerts a
     JOIN assets ON a.asset_id = assets.id
     WHERE a.id = ? AND a.user_id = ?`,
    [Number(id), userId]
  )[0] as any;

  if (!alert) {
    return res.status(404).json({ success: false, error: 'Alert not found' });
  }

  const history = query(
    'SELECT * FROM alert_notifications WHERE alert_id = ? ORDER BY notified_at DESC',
    [Number(id)]
  );

  res.json({ success: true, alert, history });
});

export default router;
