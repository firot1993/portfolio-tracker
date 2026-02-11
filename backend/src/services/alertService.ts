import { query, run, saveDB } from '../db/index.js';
import { getAssetPrice } from './priceService.js';

export interface AlertRecord {
  id: number;
  user_id: number;
  asset_id: number;
  alert_type: 'above' | 'below' | 'change_percent';
  threshold: number;
  is_active: number;
  triggered: number;
  triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function checkAlerts(): Promise<number> {
  const activeAlerts = query<AlertRecord>(
    `SELECT * FROM alerts
     WHERE is_active = 1 AND triggered = 0`
  );

  let triggeredCount = 0;

  for (const alert of activeAlerts) {
    const asset = query<{ id: number; symbol: string; type: string }>(
      'SELECT id, symbol, type FROM assets WHERE id = ?',
      [alert.asset_id]
    )[0];

    if (!asset) continue;

    const currentPrice = await getAssetPrice(asset.symbol, asset.type);
    if (currentPrice === null) continue;

    const shouldTrigger = evaluateAlert(alert, currentPrice);
    if (!shouldTrigger) continue;

    triggerAlert(alert.id, alert.user_id, currentPrice);
    triggeredCount++;
  }

  if (triggeredCount > 0) {
    saveDB();
  }

  return triggeredCount;
}

export function triggerAlert(alertId: number, userId: number, currentPrice: number): void {
  run(
    `UPDATE alerts
     SET triggered = 1, triggered_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ?`,
    [alertId]
  );
  run(
    'INSERT INTO alert_notifications (alert_id, user_id, triggered_price) VALUES (?, ?, ?)',
    [alertId, userId, currentPrice]
  );
}

export function resetTriggeredAlerts(): number {
  const updated = run(
    `UPDATE alerts
     SET triggered = 0, triggered_at = NULL, updated_at = datetime('now')
     WHERE triggered = 1`
  );
  if (updated > 0) {
    saveDB();
  }
  return updated;
}

function evaluateAlert(alert: AlertRecord, currentPrice: number): boolean {
  switch (alert.alert_type) {
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
