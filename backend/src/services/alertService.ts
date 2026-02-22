import { eq, and, sql } from 'drizzle-orm';
import { getDB, alerts, assets, alertNotifications } from '../db/index.js';
import { getAssetPrice } from './priceService.js';

export interface AlertRecord {
  id: number;
  userId: number | null;
  assetId: number | null;
  alertType: string;
  threshold: number;
  isActive: boolean | null;
  triggered: boolean | null;
  triggeredAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export async function checkAlerts(): Promise<number> {
  const db = getDB();

  const activeAlerts = db.select()
    .from(alerts)
    .where(and(
      eq(alerts.isActive, true),
      eq(alerts.triggered, false)
    ))
    .all();

  let triggeredCount = 0;

  for (const alert of activeAlerts) {
    if (!alert.assetId) continue;

    const asset = db.select({ id: assets.id, symbol: assets.symbol, type: assets.type })
      .from(assets)
      .where(eq(assets.id, alert.assetId))
      .get();

    if (!asset) continue;

    const currentPrice = await getAssetPrice(asset.symbol, asset.type);
    if (currentPrice === null) continue;

    const shouldTrigger = evaluateAlert(alert, currentPrice);
    if (!shouldTrigger) continue;

    triggerAlert(alert.id, alert.userId!, currentPrice);
    triggeredCount++;
  }

  return triggeredCount;
}

export function triggerAlert(alertId: number, userId: number, currentPrice: number): void {
  const db = getDB();

  db.update(alerts)
    .set({
      triggered: true,
      triggeredAt: sql`datetime('now')`,
      updatedAt: sql`datetime('now')`,
    })
    .where(eq(alerts.id, alertId))
    .run();

  db.insert(alertNotifications)
    .values({
      alertId,
      userId,
      triggeredPrice: currentPrice,
    })
    .run();
}

export function resetTriggeredAlerts(): number {
  const db = getDB();

  const result = db.update(alerts)
    .set({
      triggered: false,
      triggeredAt: null,
      updatedAt: sql`datetime('now')`,
    })
    .where(eq(alerts.triggered, true))
    .run();

  return result.changes;
}

function evaluateAlert(alert: AlertRecord, currentPrice: number): boolean {
  switch (alert.alertType) {
    case 'above':
      return currentPrice >= alert.threshold;
    case 'below':
      return currentPrice <= alert.threshold;
    case 'change_percent':
      return false;
    default:
      return false;
  }
}
