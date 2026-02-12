import { Router } from 'express';
import { eq, like, or, asc, sql, count } from 'drizzle-orm';
import { getDB, getSqliteDB, assets, holdings, transactions, backfillJobs } from '../db/index.js';
import { getAssetPrice } from '../services/priceService.js';
import { defaultAssets } from '../db/seeds.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// Helper to get current user ID from request
const getUserId = (req: any): number => req.user.id;

const isAssetAdmin = (req: any): boolean => {
  const raw = process.env.ASSET_ADMIN_EMAILS || '';
  const allowed = raw
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return false;
  return allowed.includes((req.user?.email || '').toLowerCase());
};

// Get all assets (without prices by default to avoid rate limits)
// Use ?includePrices=true to fetch prices (may be slow for many assets)
router.get('/', authMiddleware, async (req, res) => {
  const { includePrices } = req.query;
  const db = getDB();

  const assetList = db.select()
    .from(assets)
    .orderBy(asc(assets.type), asc(assets.symbol))
    .all();

  // Only fetch prices if explicitly requested
  if (includePrices === 'true') {
    const assetsWithPrices = await Promise.all(
      assetList.map(async (asset) => {
        const price = await getAssetPrice(asset.symbol, asset.type);
        return { ...asset, currentPrice: price };
      })
    );
    res.json(assetsWithPrices);
  } else {
    // Return assets without prices (frontend can fetch individually)
    res.json(assetList.map((asset) => ({ ...asset, currentPrice: null })));
  }
});

// Add new asset
router.post('/', authMiddleware, async (req, res) => {
  const { symbol, name, type, exchange, currency = 'USD' } = req.body;

  if (!symbol || !name || !type) {
    return res.status(400).json({ success: false, error: 'Symbol, name, and type are required' });
  }

  try {
    if (!isAssetAdmin(req)) {
      return res.status(403).json({ success: false, error: 'Asset admin access required' });
    }

    const db = getDB();
    const sqliteDb = getSqliteDB();

    let insertedId: number | undefined;

    const insertOp = sqliteDb.transaction(() => {
      const result = db.insert(assets)
        .values({
          symbol: symbol.toUpperCase(),
          name,
          type,
          exchange: exchange || null,
          currency
        })
        .returning({ id: assets.id })
        .get();

      insertedId = result?.id;

      if (insertedId) {
        db.insert(backfillJobs)
          .values({
            assetId: insertedId,
            range: '1Y',
            status: 'queued',
            userId: getUserId(req)
          })
          .run();
      }
    });

    insertOp();

    const asset = db.select().from(assets).where(eq(assets.id, insertedId!)).get();
    res.status(201).json({ success: true, data: asset });
  } catch (error: any) {
    if (error.message?.includes('UNIQUE')) {
      return res.status(409).json({ success: false, error: 'Asset already exists' });
    }
    console.error('Error creating asset:', error);
    res.status(500).json({ success: false, error: 'Failed to create asset' });
  }
});

// Get single asset price
router.get('/:id/price', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const db = getDB();

  const asset = db.select()
    .from(assets)
    .where(eq(assets.id, Number(id)))
    .get();

  if (!asset) {
    return res.status(404).json({ error: 'Asset not found' });
  }

  const price = await getAssetPrice(asset.symbol, asset.type);
  res.json({ symbol: asset.symbol, price, currency: asset.currency });
});

// Batch fetch prices for multiple assets (with delays to avoid rate limits)
// POST body: { ids: number[] }
router.post('/prices/batch', authMiddleware, async (req, res) => {
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids array is required' });
  }

  // Limit batch size to prevent abuse
  if (ids.length > 50) {
    return res.status(400).json({ error: 'Maximum 50 assets per batch' });
  }

  const db = getDB();
  const results: Array<{ id: number; symbol: string; price: number | null; currency: string | null }> = [];

  // Fetch prices with small delays to avoid rate limits
  for (const id of ids) {
    const asset = db.select()
      .from(assets)
      .where(eq(assets.id, Number(id)))
      .get();

    if (asset) {
      const price = await getAssetPrice(asset.symbol, asset.type);
      results.push({
        id: Number(id),
        symbol: asset.symbol,
        price,
        currency: asset.currency
      });
      // Small delay between requests to avoid rate limits
      if (ids.length > 5) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  res.json(results);
});

// Delete asset by ID (with cascade delete for holdings and transactions)
router.delete('/:id', authMiddleware, (req, res) => {
  if (!isAssetAdmin(req)) {
    return res.status(403).json({ error: 'Asset admin access required' });
  }
  const { id } = req.params;
  const assetId = Number(id);
  const db = getDB();
  const sqliteDb = getSqliteDB();

  const existing = db.select({ id: assets.id })
    .from(assets)
    .where(eq(assets.id, assetId))
    .get();

  if (!existing) {
    return res.status(404).json({ error: 'Asset not found' });
  }

  const deleteOp = sqliteDb.transaction(() => {
    db.delete(transactions).where(eq(transactions.assetId, assetId)).run();
    db.delete(holdings).where(eq(holdings.assetId, assetId)).run();
    db.delete(assets).where(eq(assets.id, assetId)).run();
  });

  deleteOp();
  res.status(204).send();
});

// Delete asset by symbol (with cascade delete)
router.delete('/by-symbol/:symbol', authMiddleware, (req, res) => {
  if (!isAssetAdmin(req)) {
    return res.status(403).json({ error: 'Asset admin access required' });
  }
  const { symbol } = req.params;
  const db = getDB();
  const sqliteDb = getSqliteDB();

  const asset = db.select({ id: assets.id })
    .from(assets)
    .where(eq(assets.symbol, symbol.toUpperCase()))
    .get();

  if (!asset) {
    return res.status(404).json({ error: 'Asset not found' });
  }

  const deleteOp = sqliteDb.transaction(() => {
    db.delete(transactions).where(eq(transactions.assetId, asset.id)).run();
    db.delete(holdings).where(eq(holdings.assetId, asset.id)).run();
    db.delete(assets).where(eq(assets.id, asset.id)).run();
  });

  deleteOp();
  res.status(204).send();
});

// Delete all assets (for testing cleanup)
router.delete('/cleanup/all', authMiddleware, (req, res) => {
  if (process.env.NODE_ENV !== 'test' && !isAssetAdmin(req)) {
    return res.status(403).json({ error: 'Asset admin access required' });
  }
  const db = getDB();
  const sqliteDb = getSqliteDB();

  const deleteOp = sqliteDb.transaction(() => {
    db.delete(transactions).run();
    db.delete(holdings).run();
    db.delete(assets).run();
  });

  deleteOp();
  res.status(204).send();
});

// Delete test assets only (those starting with "TEST")
router.delete('/cleanup/test-data', authMiddleware, (req, res) => {
  if (process.env.NODE_ENV !== 'test' && !isAssetAdmin(req)) {
    return res.status(403).json({ error: 'Asset admin access required' });
  }
  const db = getDB();
  const sqliteDb = getSqliteDB();

  const testAssets = db.select({ id: assets.id })
    .from(assets)
    .where(like(assets.symbol, 'TEST%'))
    .all();

  const deleteOp = sqliteDb.transaction(() => {
    for (const asset of testAssets) {
      db.delete(transactions).where(eq(transactions.assetId, asset.id)).run();
      db.delete(holdings).where(eq(holdings.assetId, asset.id)).run();
      db.delete(assets).where(eq(assets.id, asset.id)).run();
    }
  });

  deleteOp();
  res.status(204).send();
});

// Search assets by symbol or name (without prices)
router.get('/search/:query', authMiddleware, (req, res) => {
  const { query: searchQuery } = req.params;
  const searchTerm = `%${searchQuery}%`;
  const db = getDB();

  const assetList = db.select()
    .from(assets)
    .where(or(
      like(assets.symbol, searchTerm),
      like(assets.name, searchTerm)
    ))
    .orderBy(asc(assets.type), asc(assets.symbol))
    .all();

  res.json(assetList.map((asset) => ({ ...asset, currentPrice: null })));
});

// Seed default assets (manual trigger)
// POST /api/assets/seed
router.post('/seed', authMiddleware, (req, res) => {
  if (!isAssetAdmin(req)) {
    return res.status(403).json({ error: 'Asset admin access required' });
  }
  const { force } = req.body;
  const db = getDB();

  // Check existing assets
  const countResult = db.select({ count: count() })
    .from(assets)
    .get();

  const existingCount = countResult?.count ?? 0;

  if (existingCount > 0 && !force) {
    return res.status(409).json({
      error: 'Database already contains assets',
      existingCount,
      message: 'Use force: true to seed anyway (may create duplicates)'
    });
  }

  let successCount = 0;
  let skipCount = 0;

  for (const asset of defaultAssets) {
    try {
      db.insert(assets)
        .values({
          symbol: asset.symbol,
          name: asset.name,
          type: asset.type,
          exchange: asset.exchange || null,
          currency: asset.currency
        })
        .run();
      successCount++;
    } catch (error: any) {
      if (error.message?.includes('UNIQUE')) {
        skipCount++;
      }
    }
  }

  res.json({
    success: true,
    added: successCount,
    skipped: skipCount,
    total: defaultAssets.length
  });
});

export default router;
