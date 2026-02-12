import { eq, sql } from 'drizzle-orm';
import { getDB, userPreferences, holdings, assets } from '../db/index.js';
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

function normalizeAllocation(input: Partial<AllocationMap>): AllocationMap {
  return {
    crypto: input.crypto ?? DEFAULT_TARGETS.crypto,
    stock_us: input.stock_us ?? DEFAULT_TARGETS.stock_us,
    stock_cn: input.stock_cn ?? DEFAULT_TARGETS.stock_cn,
    gold: input.gold ?? DEFAULT_TARGETS.gold,
  };
}

export function getUserPreferences(userId: number): UserPreferences {
  const db = getDB();

  const existing = db.select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .get();

  if (existing) {
    return {
      id: existing.id,
      user_id: existing.userId!,
      crypto: existing.targetAllocationCrypto!,
      stock_us: existing.targetAllocationStockUs!,
      stock_cn: existing.targetAllocationStockCn!,
      gold: existing.targetAllocationGold!,
      rebalance_threshold: existing.rebalanceThreshold!,
      updated_at: existing.updatedAt || undefined,
    };
  }

  // Create default preferences
  db.insert(userPreferences)
    .values({
      userId,
      targetAllocationCrypto: DEFAULT_TARGETS.crypto,
      targetAllocationStockUs: DEFAULT_TARGETS.stock_us,
      targetAllocationStockCn: DEFAULT_TARGETS.stock_cn,
      targetAllocationGold: DEFAULT_TARGETS.gold,
      rebalanceThreshold: 0.05,
    })
    .run();

  const created = db.select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .get();

  return {
    id: created!.id,
    user_id: created!.userId!,
    crypto: created!.targetAllocationCrypto!,
    stock_us: created!.targetAllocationStockUs!,
    stock_cn: created!.targetAllocationStockCn!,
    gold: created!.targetAllocationGold!,
    rebalance_threshold: created!.rebalanceThreshold!,
    updated_at: created!.updatedAt || undefined,
  };
}

export function upsertUserPreferences(userId: number, prefs: Partial<UserPreferences>): UserPreferences {
  const db = getDB();

  const allocation = normalizeAllocation({
    crypto: prefs.crypto,
    stock_us: prefs.stock_us,
    stock_cn: prefs.stock_cn,
    gold: prefs.gold,
  });

  const threshold = prefs.rebalance_threshold ?? 0.05;

  // Check if exists
  const existing = db.select({ id: userPreferences.id })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .get();

  if (existing) {
    db.update(userPreferences)
      .set({
        targetAllocationCrypto: allocation.crypto,
        targetAllocationStockUs: allocation.stock_us,
        targetAllocationStockCn: allocation.stock_cn,
        targetAllocationGold: allocation.gold,
        rebalanceThreshold: threshold,
        updatedAt: sql`datetime('now')`,
      })
      .where(eq(userPreferences.userId, userId))
      .run();
  } else {
    db.insert(userPreferences)
      .values({
        userId,
        targetAllocationCrypto: allocation.crypto,
        targetAllocationStockUs: allocation.stock_us,
        targetAllocationStockCn: allocation.stock_cn,
        targetAllocationGold: allocation.gold,
        rebalanceThreshold: threshold,
      })
      .run();
  }

  return getUserPreferences(userId);
}

export async function calculateCurrentAllocation(userId: number): Promise<{ allocation: AllocationMap; totalValue: number }> {
  const db = getDB();

  const holdingList = db.select({
    quantity: holdings.quantity,
    avgCost: holdings.avgCost,
    assetId: assets.id,
    symbol: assets.symbol,
    type: assets.type,
    currency: assets.currency,
    currentPrice: assets.currentPrice,
  })
    .from(holdings)
    .innerJoin(assets, eq(holdings.assetId, assets.id))
    .where(eq(holdings.userId, userId))
    .all();

  const usdcny = await getUSDCNYRate() || 7.2;
  const allocationValue: AllocationMap = { crypto: 0, stock_us: 0, stock_cn: 0, gold: 0 };
  let totalValue = 0;

  for (const holding of holdingList) {
    let price = holding.currentPrice;
    if (price === null || price === undefined) {
      price = await getAssetPrice(holding.symbol, holding.type);
      if (price !== null) {
        db.update(assets)
          .set({
            currentPrice: price,
            priceUpdatedAt: sql`datetime("now")`,
          })
          .where(eq(assets.id, holding.assetId))
          .run();
      }
    }

    if (price === null || price === undefined) continue;

    let valueUSD = price * holding.quantity;
    if (holding.currency === 'CNY') {
      valueUSD = valueUSD / usdcny;
    }

    const assetType = holding.type as AssetType;
    allocationValue[assetType] = (allocationValue[assetType] || 0) + valueUSD;
    totalValue += valueUSD;
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
