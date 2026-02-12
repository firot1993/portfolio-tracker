import { Router } from 'express';
import { eq, and, desc, sql } from 'drizzle-orm';
import { getDB, alerts, assets, alertNotifications } from '../db/index.js';
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

  const db = getDB();

  const asset = db.select({ id: assets.id, symbol: assets.symbol, name: assets.name })
    .from(assets)
    .where(eq(assets.id, asset_id))
    .get();

  if (!asset) {
    return res.status(404).json({ success: false, error: 'Asset not found' });
  }

  try {
    const created = db.insert(alerts)
      .values({
        userId,
        assetId: asset_id,
        alertType: alert_type,
        threshold,
        isActive: is_active,
      })
      .returning()
      .get();

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
  const db = getDB();

  // Build conditions dynamically
  const conditions = [eq(alerts.userId, userId)];

  if (is_active !== undefined) {
    conditions.push(eq(alerts.isActive, is_active === 'true'));
  }

  if (asset_id) {
    conditions.push(eq(alerts.assetId, Number(asset_id)));
  }

  const alertList = db.select({
    id: alerts.id,
    userId: alerts.userId,
    assetId: alerts.assetId,
    alertType: alerts.alertType,
    threshold: alerts.threshold,
    isActive: alerts.isActive,
    triggered: alerts.triggered,
    triggeredAt: alerts.triggeredAt,
    createdAt: alerts.createdAt,
    updatedAt: alerts.updatedAt,
    asset_symbol: assets.symbol,
    asset_name: assets.name,
    asset_type: assets.type,
  })
    .from(alerts)
    .innerJoin(assets, eq(alerts.assetId, assets.id))
    .where(and(...conditions))
    .orderBy(desc(alerts.createdAt))
    .all();

  const alertsWithPrices = await Promise.all(
    alertList.map(async alert => {
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
  const db = getDB();

  const existing = db.select()
    .from(alerts)
    .where(and(eq(alerts.id, Number(id)), eq(alerts.userId, userId)))
    .get();

  if (!existing) {
    return res.status(404).json({ success: false, error: 'Alert not found' });
  }

  if (threshold !== undefined && threshold <= 0) {
    return res.status(400).json({ success: false, error: 'Threshold must be greater than 0' });
  }

  const newThreshold = threshold ?? existing.threshold;
  const newIsActive = is_active !== undefined ? is_active : existing.isActive;

  try {
    const updated = db.update(alerts)
      .set({
        threshold: newThreshold,
        isActive: newIsActive,
        updatedAt: sql`datetime('now')`,
      })
      .where(and(eq(alerts.id, Number(id)), eq(alerts.userId, userId)))
      .returning()
      .get();

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
  const db = getDB();

  const existing = db.select({ id: alerts.id })
    .from(alerts)
    .where(and(eq(alerts.id, Number(id)), eq(alerts.userId, userId)))
    .get();

  if (!existing) {
    return res.status(404).json({ success: false, error: 'Alert not found' });
  }

  db.delete(alerts)
    .where(and(eq(alerts.id, Number(id)), eq(alerts.userId, userId)))
    .run();

  res.json({ success: true, message: 'Alert deleted' });
});

router.get('/:id/history', (req, res) => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const db = getDB();

  const alert = db.select({
    id: alerts.id,
    userId: alerts.userId,
    assetId: alerts.assetId,
    alertType: alerts.alertType,
    threshold: alerts.threshold,
    isActive: alerts.isActive,
    triggered: alerts.triggered,
    triggeredAt: alerts.triggeredAt,
    createdAt: alerts.createdAt,
    updatedAt: alerts.updatedAt,
    asset_symbol: assets.symbol,
    asset_name: assets.name,
  })
    .from(alerts)
    .innerJoin(assets, eq(alerts.assetId, assets.id))
    .where(and(eq(alerts.id, Number(id)), eq(alerts.userId, userId)))
    .get();

  if (!alert) {
    return res.status(404).json({ success: false, error: 'Alert not found' });
  }

  const history = db.select()
    .from(alertNotifications)
    .where(eq(alertNotifications.alertId, Number(id)))
    .orderBy(desc(alertNotifications.notifiedAt))
    .all();

  res.json({ success: true, alert, history });
});

export default router;
