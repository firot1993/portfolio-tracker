import { Router } from 'express';
import { eq, inArray, sql } from 'drizzle-orm';
import { getDB, holdings, assets } from '../db/index.js';
import { getAssetPrice, getUSDCNYRate } from '../services/priceService.js';
import { authMiddleware } from '../middleware/auth.js';
import {
  calculateRebalancingSuggestions,
  getUserPreferences,
  upsertUserPreferences
} from '../services/rebalancingService.js';
import { getPortfolioMetrics, getAssetMetrics } from '../services/metricsService.js';

const router = Router();

// Get portfolio summary
// Query params:
//   - refreshPrices: 'true' to fetch fresh prices from external APIs (slower)
//   - includePrices: 'false' to skip price fetching entirely (fastest)
router.get('/summary', authMiddleware, async (req, res) => {
  const userId = (req as any).user.id;
  const refreshPrices = req.query.refreshPrices === 'true';
  const includePrices = req.query.includePrices !== 'false'; // default true

  const db = getDB();

  const holdingList = db.select({
    id: holdings.id,
    userId: holdings.userId,
    assetId: holdings.assetId,
    accountId: holdings.accountId,
    quantity: holdings.quantity,
    avgCost: holdings.avgCost,
    symbol: assets.symbol,
    name: assets.name,
    type: assets.type,
    currency: assets.currency,
    current_price: assets.currentPrice,
    price_updated_at: assets.priceUpdatedAt,
  })
    .from(holdings)
    .innerJoin(assets, eq(holdings.assetId, assets.id))
    .where(eq(holdings.userId, userId))
    .all();

  const usdcny = await getUSDCNYRate() || 7.2;

  let totalValueUSD = 0;
  let totalCostUSD = 0;
  const allocation: Record<string, number> = {
    crypto: 0,
    stock_us: 0,
    stock_cn: 0,
    gold: 0,
  };

  // Collect assets that need price refresh
  const assetsToUpdate: Array<{ id: number; symbol: string; type: string }> = [];

  const details = await Promise.all(
    holdingList.map(async (h) => {
      let currentPrice: number | null = null;

      if (includePrices) {
        if (refreshPrices) {
          // Fetch fresh price from external API
          currentPrice = await getAssetPrice(h.symbol, h.type);
          if (currentPrice !== null && h.assetId !== null) {
            // Update cached price in database
            db.update(assets)
              .set({
                currentPrice,
                priceUpdatedAt: sql`datetime("now")`,
              })
              .where(eq(assets.id, h.assetId))
              .run();
          }
        } else {
          // Use cached price from database
          currentPrice = h.current_price;

          // If no cached price or price is stale (> 5 minutes), queue for background update
          const priceAge = h.price_updated_at
            ? Date.now() - new Date(h.price_updated_at).getTime()
            : Infinity;

          if ((currentPrice === null || priceAge > 5 * 60 * 1000) && h.assetId !== null) {
            assetsToUpdate.push({ id: h.assetId, symbol: h.symbol, type: h.type });
          }
        }
      }

      let valueUSD = currentPrice ? currentPrice * h.quantity : 0;
      let costUSD = h.avgCost * h.quantity;

      if (h.currency === 'CNY') {
        valueUSD = valueUSD / usdcny;
        costUSD = costUSD / usdcny;
      }

      totalValueUSD += valueUSD;
      totalCostUSD += costUSD;
      allocation[h.type] = (allocation[h.type] || 0) + valueUSD;

      return {
        symbol: h.symbol,
        name: h.name,
        type: h.type,
        quantity: h.quantity,
        avgCost: h.avgCost,
        currentPrice,
        valueUSD,
        costUSD,
        pnl: valueUSD - costUSD,
        pnlPercent: costUSD ? ((valueUSD - costUSD) / costUSD) * 100 : 0,
      };
    })
  );

  const allocationPercent: Record<string, number> = {};
  for (const [type, value] of Object.entries(allocation)) {
    allocationPercent[type] = totalValueUSD ? (value / totalValueUSD) * 100 : 0;
  }

  const totalPnL = totalValueUSD - totalCostUSD;
  const totalPnLPercent = totalCostUSD ? (totalPnL / totalCostUSD) * 100 : 0;

  res.json({
    totalValueUSD,
    totalCostUSD,
    totalPnL,
    totalPnLPercent,
    allocation,
    allocationPercent,
    holdings: details,
    usdcny,
    stalePrices: assetsToUpdate.length > 0 && !refreshPrices,
    staleAssets: assetsToUpdate.map(a => a.symbol),
  });
});

// Refresh prices for specific assets or all holdings
router.post('/refresh-prices', authMiddleware, async (req, res) => {
  const userId = (req as any).user.id;
  const { assetIds } = req.body; // Optional: specific asset IDs to refresh

  const db = getDB();

  let holdingQuery = db.select({
    assetId: holdings.assetId,
    symbol: assets.symbol,
    name: assets.name,
    type: assets.type,
    currency: assets.currency,
  })
    .from(holdings)
    .innerJoin(assets, eq(holdings.assetId, assets.id))
    .where(eq(holdings.userId, userId));

  // If specific asset IDs provided, filter to those
  const holdingList = assetIds && assetIds.length > 0
    ? db.select({
        assetId: holdings.assetId,
        symbol: assets.symbol,
        name: assets.name,
        type: assets.type,
        currency: assets.currency,
      })
        .from(holdings)
        .innerJoin(assets, eq(holdings.assetId, assets.id))
        .where(eq(holdings.userId, userId))
        .all()
        .filter(h => assetIds.includes(h.assetId))
    : holdingQuery.all();

  const results: Array<{ symbol: string; price: number | null; error?: string }> = [];

  // Fetch prices sequentially to avoid rate limiting
  for (const h of holdingList) {
    try {
      const price = await getAssetPrice(h.symbol, h.type);
      if (price !== null && h.assetId !== null) {
        db.update(assets)
          .set({
            currentPrice: price,
            priceUpdatedAt: sql`datetime("now")`,
          })
          .where(eq(assets.id, h.assetId))
          .run();
      }
      results.push({ symbol: h.symbol, price });
    } catch (error: any) {
      results.push({ symbol: h.symbol, price: null, error: error.message });
    }
  }

  res.json({
    updated: results.filter(r => r.price !== null).length,
    failed: results.filter(r => r.price === null).length,
    results,
  });
});

router.get('/rebalance-suggestions', authMiddleware, async (req, res) => {
  const userId = (req as any).user.id;
  const threshold = req.query.threshold ? Number(req.query.threshold) : undefined;

  if (threshold !== undefined && (Number.isNaN(threshold) || threshold < 0 || threshold > 1)) {
    return res.status(400).json({ error: 'Threshold must be between 0 and 1' });
  }

  const result = await calculateRebalancingSuggestions(userId, threshold);
  res.json(result);
});

router.get('/metrics', authMiddleware, async (req, res) => {
  const userId = (req as any).user.id;
  const range = (req.query.range as string) || '1M';
  const riskFreeRate = req.query.riskFreeRate ? Number(req.query.riskFreeRate) : 0.04;

  try {
    const data = await getPortfolioMetrics(userId, range, riskFreeRate);
    res.json({
      success: true,
      data,
      meta: {
        range,
        dataPoints: data ? 1 : 0,
      },
    });
  } catch (error: any) {
    const isInsufficientData = error.message?.includes('Insufficient data');
    res.status(isInsufficientData ? 422 : 400).json({
      success: false,
      error: error.message,
      code: isInsufficientData ? 'INSUFFICIENT_DATA' : 'METRICS_ERROR'
    });
  }
});

router.get('/metrics/asset/:assetId', authMiddleware, async (req, res) => {
  const userId = (req as any).user.id;
  const { assetId } = req.params;
  const range = (req.query.range as string) || '1M';
  const riskFreeRate = req.query.riskFreeRate ? Number(req.query.riskFreeRate) : 0.04;

  try {
    const data = await getAssetMetrics(userId, Number(assetId), range, riskFreeRate);
    res.json({ success: true, data });
  } catch (error: any) {
    const isInsufficientData = error.message?.includes('Insufficient data');
    res.status(isInsufficientData ? 422 : 400).json({
      success: false,
      error: error.message,
      code: isInsufficientData ? 'INSUFFICIENT_DATA' : 'METRICS_ERROR'
    });
  }
});

router.get('/user/preferences', authMiddleware, (req, res) => {
  const userId = (req as any).user.id;
  const prefs = getUserPreferences(userId);
  res.json({ success: true, preferences: prefs });
});

router.post('/user/preferences', authMiddleware, (req, res) => {
  const userId = (req as any).user.id;
  const {
    target_allocation_crypto,
    target_allocation_stock_us,
    target_allocation_stock_cn,
    target_allocation_gold,
    rebalance_threshold,
  } = req.body;

  const allocationValues = [
    target_allocation_crypto,
    target_allocation_stock_us,
    target_allocation_stock_cn,
    target_allocation_gold,
  ];

  if (allocationValues.some((value) => value === undefined || value < 0)) {
    return res.status(400).json({ success: false, error: 'Allocations must be >= 0' });
  }

  const sum = allocationValues.reduce((acc, value) => acc + value, 0);
  if (Math.abs(sum - 1) > 0.001) {
    return res.status(400).json({ success: false, error: 'Allocations must sum to 1.0' });
  }

  if (rebalance_threshold !== undefined && (rebalance_threshold < 0 || rebalance_threshold > 1)) {
    return res.status(400).json({ success: false, error: 'Threshold must be between 0 and 1' });
  }

  const preferences = upsertUserPreferences(userId, {
    crypto: target_allocation_crypto,
    stock_us: target_allocation_stock_us,
    stock_cn: target_allocation_stock_cn,
    gold: target_allocation_gold,
    rebalance_threshold,
  });

  res.json({ success: true, preferences });
});

export default router;
