import { query, run, saveDB } from '../db/index.js';
import { getAssetPrice, getUSDCNYRate } from './priceService.js';

export type AssetType = 'crypto' | 'stock_us' | 'stock_cn' | 'gold';

export interface AllocationMap {
  crypto: number;
  stock_us: number;
  stock_cn: number;
  gold: number;
}

export interface RebalanceSuggestion {
  action: 'buy' | 'sell';
  assetType: AssetType;
  currentValue: number;
  targetValue: number;
  difference: number;
  percentOfPortfolio: number;
  reason: string;
}

export interface RebalanceResult {
  currentAllocation: AllocationMap;
  targetAllocation: AllocationMap;
  suggestions: RebalanceSuggestion[];
  totalPortfolioValue: number;
  rebalancingNeeded: boolean;
}

const DEFAULT_TARGETS: AllocationMap = {
  crypto: 0.4,
  stock_us: 0.3,
  stock_cn: 0.2,
  gold: 0.1,
};

export interface UserPreferences extends AllocationMap {
  id?: number;
  user_id: number;
  rebalance_threshold: number;
  updated_at?: string;
}

interface UserPreferencesRecord {
  id: number;
  user_id: number;
  target_allocation_crypto: number;
  target_allocation_stock_us: number;
  target_allocation_stock_cn: number;
  target_allocation_gold: number;
  rebalance_threshold: number;
  updated_at: string;
}

function normalizeAllocation(input: Partial<AllocationMap>): AllocationMap {
  return {
    crypto: input.crypto ?? DEFAULT_TARGETS.crypto,
    stock_us: input.stock_us ?? DEFAULT_TARGETS.stock_us,
    stock_cn: input.stock_cn ?? DEFAULT_TARGETS.stock_cn,
    gold: input.gold ?? DEFAULT_TARGETS.gold,
  };
}

export function getUserPreferences(userId: number): UserPreferences {
  const existing = query<UserPreferencesRecord>(
    'SELECT * FROM user_preferences WHERE user_id = ?',
    [userId]
  )[0];

  if (existing) {
    return {
      ...existing,
      crypto: existing.target_allocation_crypto,
      stock_us: existing.target_allocation_stock_us,
      stock_cn: existing.target_allocation_stock_cn,
      gold: existing.target_allocation_gold,
    } as UserPreferences;
  }

  run(
    `INSERT INTO user_preferences (
      user_id,
      target_allocation_crypto,
      target_allocation_stock_us,
      target_allocation_stock_cn,
      target_allocation_gold,
      rebalance_threshold
    ) VALUES (?, ?, ?, ?, ?, ?)` ,
    [userId, DEFAULT_TARGETS.crypto, DEFAULT_TARGETS.stock_us, DEFAULT_TARGETS.stock_cn, DEFAULT_TARGETS.gold, 0.05]
  );
  saveDB();

  const created = query<UserPreferencesRecord>(
    'SELECT * FROM user_preferences WHERE user_id = ?',
    [userId]
  )[0];

  return {
    ...created,
    crypto: created.target_allocation_crypto,
    stock_us: created.target_allocation_stock_us,
    stock_cn: created.target_allocation_stock_cn,
    gold: created.target_allocation_gold,
  } as UserPreferences;
}

export function upsertUserPreferences(userId: number, prefs: Partial<UserPreferences>): UserPreferences {
  const allocation = normalizeAllocation({
    crypto: prefs.crypto,
    stock_us: prefs.stock_us,
    stock_cn: prefs.stock_cn,
    gold: prefs.gold,
  });

  const threshold = prefs.rebalance_threshold ?? 0.05;

  run(
    `INSERT INTO user_preferences (
      user_id,
      target_allocation_crypto,
      target_allocation_stock_us,
      target_allocation_stock_cn,
      target_allocation_gold,
      rebalance_threshold,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      target_allocation_crypto = excluded.target_allocation_crypto,
      target_allocation_stock_us = excluded.target_allocation_stock_us,
      target_allocation_stock_cn = excluded.target_allocation_stock_cn,
      target_allocation_gold = excluded.target_allocation_gold,
      rebalance_threshold = excluded.rebalance_threshold,
      updated_at = datetime('now')`,
    [userId, allocation.crypto, allocation.stock_us, allocation.stock_cn, allocation.gold, threshold]
  );
  saveDB();

  return getUserPreferences(userId);
}

export async function calculateCurrentAllocation(userId: number): Promise<{ allocation: AllocationMap; totalValue: number }> {
  const holdings = query(
    `SELECT h.quantity, h.avg_cost, a.id as asset_id, a.symbol, a.type, a.currency, a.current_price
     FROM holdings h
     JOIN assets a ON h.asset_id = a.id
     WHERE h.user_id = ?`,
    [userId]
  ) as Array<{ quantity: number; avg_cost: number; asset_id: number; symbol: string; type: AssetType; currency: string; current_price: number | null }>;

  const usdcny = await getUSDCNYRate() || 7.2;
  const allocationValue: AllocationMap = { crypto: 0, stock_us: 0, stock_cn: 0, gold: 0 };
  let totalValue = 0;
  let shouldSave = false;

  for (const holding of holdings) {
    let price = holding.current_price;
    if (price === null || price === undefined) {
      price = await getAssetPrice(holding.symbol, holding.type);
      if (price !== null) {
        run(
          'UPDATE assets SET current_price = ?, price_updated_at = datetime("now") WHERE id = ?',
          [price, holding.asset_id]
        );
        shouldSave = true;
      }
    }

    if (price === null || price === undefined) continue;

    let valueUSD = price * holding.quantity;
    if (holding.currency === 'CNY') {
      valueUSD = valueUSD / usdcny;
    }

    allocationValue[holding.type] = (allocationValue[holding.type] || 0) + valueUSD;
    totalValue += valueUSD;
  }

  if (shouldSave) {
    saveDB();
  }

  const allocationPercent: AllocationMap = {
    crypto: totalValue ? allocationValue.crypto / totalValue : 0,
    stock_us: totalValue ? allocationValue.stock_us / totalValue : 0,
    stock_cn: totalValue ? allocationValue.stock_cn / totalValue : 0,
    gold: totalValue ? allocationValue.gold / totalValue : 0,
  };

  return { allocation: allocationPercent, totalValue };
}

export async function calculateRebalancingSuggestions(userId: number, threshold?: number): Promise<RebalanceResult> {
  const prefs = getUserPreferences(userId);
  const targetAllocation = normalizeAllocation({
    crypto: prefs.crypto,
    stock_us: prefs.stock_us,
    stock_cn: prefs.stock_cn,
    gold: prefs.gold,
  });

  const effectiveThreshold = threshold ?? prefs.rebalance_threshold ?? 0.05;
  const { allocation: currentAllocation, totalValue } = await calculateCurrentAllocation(userId);

  if (totalValue <= 0) {
    return {
      currentAllocation,
      targetAllocation,
      suggestions: [],
      totalPortfolioValue: 0,
      rebalancingNeeded: false,
    };
  }

  const suggestions: RebalanceSuggestion[] = [];
  const types: AssetType[] = ['crypto', 'stock_us', 'stock_cn', 'gold'];

  for (const type of types) {
    const currentPercent = currentAllocation[type] || 0;
    const targetPercent = targetAllocation[type] || 0;
    const drift = currentPercent - targetPercent;

    if (Math.abs(drift) < effectiveThreshold) continue;

    const currentValue = currentPercent * totalValue;
    const targetValue = targetPercent * totalValue;
    const difference = targetValue - currentValue;
    const action: 'buy' | 'sell' = difference > 0 ? 'buy' : 'sell';
    const percentOfPortfolio = totalValue ? Math.abs(difference) / totalValue : 0;

    suggestions.push({
      action,
      assetType: type,
      currentValue,
      targetValue,
      difference: Math.abs(difference),
      percentOfPortfolio,
      reason: `${type.replace('_', ' ')} allocation is ${Math.abs(drift * 100).toFixed(1)}% ${drift > 0 ? 'above' : 'below'} target`,
    });
  }

  return {
    currentAllocation,
    targetAllocation,
    suggestions,
    totalPortfolioValue: totalValue,
    rebalancingNeeded: suggestions.length > 0,
  };
}
