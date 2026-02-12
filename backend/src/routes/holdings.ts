import { Router } from 'express';
import { eq, and, asc, desc, isNull, or, sql } from 'drizzle-orm';
import { getDB, holdings, assets, accounts, transactions } from '../db/index.js';
import { getAssetPrice, getUSDCNYRate } from '../services/priceService.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// Get all holdings with current values
// Query params:
//   - includePrices: 'false' to skip price fetching (use cached prices)
router.get('/', authMiddleware, async (req, res) => {
  const userId = (req as any).user.id;
  const includePrices = req.query.includePrices !== 'false'; // default true

  const db = getDB();

  const holdingList = db.select({
    id: holdings.id,
    userId: holdings.userId,
    assetId: holdings.assetId,
    accountId: holdings.accountId,
    quantity: holdings.quantity,
    avgCost: holdings.avgCost,
    updatedAt: holdings.updatedAt,
    symbol: assets.symbol,
    name: assets.name,
    type: assets.type,
    currency: assets.currency,
    current_price: assets.currentPrice,
    price_updated_at: assets.priceUpdatedAt,
    account_name: accounts.name,
  })
    .from(holdings)
    .innerJoin(assets, eq(holdings.assetId, assets.id))
    .leftJoin(accounts, eq(holdings.accountId, accounts.id))
    .where(eq(holdings.userId, userId))
    .orderBy(asc(assets.type), asc(assets.symbol))
    .all();

  const usdcny = await getUSDCNYRate() || 7.2;

  const holdingsWithValue = await Promise.all(
    holdingList.map(async (h) => {
      let currentPrice: number | null = null;

      if (includePrices) {
        // Use cached price from database if available and fresh (< 5 minutes)
        const priceAge = h.price_updated_at
          ? Date.now() - new Date(h.price_updated_at).getTime()
          : Infinity;

        if (h.current_price !== null && priceAge < 5 * 60 * 1000) {
          currentPrice = h.current_price;
        } else {
          // Fetch fresh price if cache is stale or missing
          currentPrice = await getAssetPrice(h.symbol, h.type);
          if (currentPrice !== null && h.assetId !== null) {
            db.update(assets)
              .set({
                currentPrice,
                priceUpdatedAt: sql`datetime("now")`,
              })
              .where(eq(assets.id, h.assetId))
              .run();
          }
        }
      } else {
        // Just return cached price without fetching
        currentPrice = h.current_price;
      }

      const currentValue = currentPrice ? currentPrice * h.quantity : null;
      const costBasis = h.avgCost * h.quantity;
      const pnl = currentValue ? currentValue - costBasis : null;
      const pnlPercent = pnl && costBasis ? (pnl / costBasis) * 100 : null;

      let valueUSD = currentValue;
      if (h.currency === 'CNY' && currentValue) {
        valueUSD = currentValue / usdcny;
      }

      return {
        ...h,
        asset_id: h.assetId,
        account_id: h.accountId,
        avg_cost: h.avgCost,
        currentPrice,
        currentValue,
        valueUSD,
        costBasis,
        pnl,
        pnlPercent,
      };
    })
  );

  res.json(holdingsWithValue);
});

// Get single holding detail
router.get('/:assetId', authMiddleware, async (req, res) => {
  const userId = (req as any).user.id;
  const { assetId } = req.params;

  const db = getDB();

  const holding = db.select({
    id: holdings.id,
    userId: holdings.userId,
    assetId: holdings.assetId,
    accountId: holdings.accountId,
    quantity: holdings.quantity,
    avgCost: holdings.avgCost,
    updatedAt: holdings.updatedAt,
    symbol: assets.symbol,
    name: assets.name,
    type: assets.type,
    currency: assets.currency,
    current_price: assets.currentPrice,
    price_updated_at: assets.priceUpdatedAt,
  })
    .from(holdings)
    .innerJoin(assets, eq(holdings.assetId, assets.id))
    .where(and(eq(holdings.assetId, Number(assetId)), eq(holdings.userId, userId)))
    .get();

  if (!holding) {
    return res.status(404).json({ error: 'Holding not found' });
  }

  // Use cached price if fresh, otherwise fetch new price
  const priceAge = holding.price_updated_at
    ? Date.now() - new Date(holding.price_updated_at).getTime()
    : Infinity;

  let currentPrice = holding.current_price;
  if (currentPrice === null || priceAge > 5 * 60 * 1000) {
    currentPrice = await getAssetPrice(holding.symbol, holding.type);
    if (currentPrice !== null && holding.assetId !== null) {
      db.update(assets)
        .set({
          currentPrice,
          priceUpdatedAt: sql`datetime("now")`,
        })
        .where(eq(assets.id, holding.assetId))
        .run();
    }
  }

  const currentValue = currentPrice ? currentPrice * holding.quantity : null;
  const costBasis = holding.avgCost * holding.quantity;
  const pnl = currentValue ? currentValue - costBasis : null;

  const txnList = db.select()
    .from(transactions)
    .where(and(eq(transactions.assetId, Number(assetId)), eq(transactions.userId, userId)))
    .orderBy(desc(transactions.date))
    .all();

  res.json({
    ...holding,
    asset_id: holding.assetId,
    account_id: holding.accountId,
    avg_cost: holding.avgCost,
    currentPrice,
    currentValue,
    costBasis,
    pnl,
    pnlPercent: pnl && costBasis ? (pnl / costBasis) * 100 : null,
    transactions: txnList,
  });
});

// Add holding directly
router.post('/', authMiddleware, (req, res) => {
  const userId = (req as any).user.id;
  const { asset_id, account_id, quantity, avg_cost } = req.body;

  if (!asset_id || !quantity || !avg_cost) {
    return res.status(400).json({ error: 'Missing required fields: asset_id, quantity, avg_cost' });
  }

  if (quantity <= 0) {
    return res.status(400).json({ error: 'Quantity must be greater than 0' });
  }

  if (avg_cost < 0) {
    return res.status(400).json({ error: 'Average cost cannot be negative' });
  }

  const db = getDB();

  // Verify asset belongs to user
  const assetCheck = db.select({ id: assets.id })
    .from(assets)
    .where(and(
      eq(assets.id, asset_id),
      or(eq(assets.id, asset_id), isNull(assets.id)) // assets table doesn't have userId, all assets are global
    ))
    .get();

  if (!assetCheck) {
    return res.status(404).json({ error: 'Asset not found' });
  }

  try {
    // Check if holding already exists
    const accountCondition = account_id
      ? eq(holdings.accountId, account_id)
      : isNull(holdings.accountId);

    const existing = db.select()
      .from(holdings)
      .where(and(
        eq(holdings.assetId, asset_id),
        accountCondition,
        eq(holdings.userId, userId)
      ))
      .get();

    if (existing) {
      // Update existing holding
      const newQty = existing.quantity + quantity;
      const newAvgCost = (existing.avgCost * existing.quantity + avg_cost * quantity) / newQty;

      const updated = db.update(holdings)
        .set({
          quantity: newQty,
          avgCost: newAvgCost,
          updatedAt: sql`datetime('now')`,
        })
        .where(and(eq(holdings.id, existing.id), eq(holdings.userId, userId)))
        .returning()
        .get();

      res.json(updated);
    } else {
      // Create new holding
      const newHolding = db.insert(holdings)
        .values({
          userId,
          assetId: asset_id,
          accountId: account_id || null,
          quantity,
          avgCost: avg_cost,
        })
        .returning()
        .get();

      res.status(201).json(newHolding);
    }
  } catch (error: any) {
    console.error('Error adding holding:', error);
    res.status(500).json({ error: 'Failed to add holding' });
  }
});

export default router;
