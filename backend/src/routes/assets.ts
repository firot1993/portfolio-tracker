import { Router } from 'express';
import { query, run, lastInsertId, saveDB, withTransaction } from '../db/index.js';
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

  const assets = query(
    'SELECT * FROM assets ORDER BY type, symbol'
  );

  // Only fetch prices if explicitly requested
  if (includePrices === 'true') {
    const assetsWithPrices = await Promise.all(
      assets.map(async (asset: any) => {
        const price = await getAssetPrice(asset.symbol, asset.type);
        return { ...asset, currentPrice: price };
      })
    );
    res.json(assetsWithPrices);
  } else {
    // Return assets without prices (frontend can fetch individually)
    res.json(assets.map((asset: any) => ({ ...asset, currentPrice: null })));
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
    await withTransaction(() => {
      run(
        'INSERT INTO assets (user_id, symbol, name, type, exchange, currency) VALUES (?, ?, ?, ?, ?, ?)',
        [null, symbol.toUpperCase(), name, type, exchange || null, currency]
      );

      const id = lastInsertId();
      run(
        'INSERT INTO backfill_jobs (asset_id, range, status, user_id) VALUES (?, ?, ?, ?)',
        [id, '1Y', 'queued', getUserId(req)]
      );
      saveDB();
      return id;
    });

    const id = lastInsertId();
    const asset = query('SELECT * FROM assets WHERE id = ?', [id])[0];
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

  // Verify ownership
  const asset = query(
    'SELECT * FROM assets WHERE id = ?',
    [Number(id)]
  )[0] as any;

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

  const results: Array<{ id: number; symbol: string; price: number | null; currency: string }> = [];

  // Fetch prices with small delays to avoid rate limits
  for (const id of ids) {
    // Verify ownership
    const asset = query(
      'SELECT * FROM assets WHERE id = ?',
      [Number(id)]
    )[0] as any;

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

  // Verify ownership
  const existing = query(
    'SELECT id FROM assets WHERE id = ?',
    [assetId]
  );

  if (existing.length === 0) {
    return res.status(404).json({ error: 'Asset not found' });
  }

  // First delete related transactions
  run('DELETE FROM transactions WHERE asset_id = ?', [assetId]);
  // Then delete related holdings
  run('DELETE FROM holdings WHERE asset_id = ?', [assetId]);
  // Finally delete the asset
  run('DELETE FROM assets WHERE id = ?', [assetId]);
  saveDB();
  res.status(204).send();
});

// Delete asset by symbol (with cascade delete)
router.delete('/by-symbol/:symbol', authMiddleware, (req, res) => {
  if (!isAssetAdmin(req)) {
    return res.status(403).json({ error: 'Asset admin access required' });
  }
  const { symbol } = req.params;

  // Verify ownership
  const asset = query(
    'SELECT id FROM assets WHERE symbol = ?',
    [symbol.toUpperCase()]
  )[0] as any;

  if (!asset) {
    return res.status(404).json({ error: 'Asset not found' });
  }
  // Delete related transactions
  run('DELETE FROM transactions WHERE asset_id = ?', [asset.id]);
  // Delete related holdings
  run('DELETE FROM holdings WHERE asset_id = ?', [asset.id]);
  // Delete the asset
  run('DELETE FROM assets WHERE id = ?', [asset.id]);
  saveDB();
  res.status(204).send();
});

// Delete all assets (for testing cleanup)
router.delete('/cleanup/all', authMiddleware, (req, res) => {
  if (process.env.NODE_ENV !== 'test' && !isAssetAdmin(req)) {
    return res.status(403).json({ error: 'Asset admin access required' });
  }
  run('DELETE FROM transactions');
  run('DELETE FROM holdings');
  run('DELETE FROM assets');
  saveDB();
  res.status(204).send();
});

// Delete test assets only (those starting with "TEST")
router.delete('/cleanup/test-data', authMiddleware, (req, res) => {
  if (process.env.NODE_ENV !== 'test' && !isAssetAdmin(req)) {
    return res.status(403).json({ error: 'Asset admin access required' });
  }
  const testAssets = query(
    "SELECT id FROM assets WHERE symbol LIKE 'TEST%'"
  );

  for (const asset of testAssets) {
    run('DELETE FROM transactions WHERE asset_id = ?', [asset.id]);
    run('DELETE FROM holdings WHERE asset_id = ?', [asset.id]);
    run('DELETE FROM assets WHERE id = ?', [asset.id]);
  }

  saveDB();
  res.status(204).send();
});

// Search assets by symbol or name (without prices)
router.get('/search/:query', authMiddleware, (req, res) => {
  const { query: searchQuery } = req.params;
  const searchTerm = `%${searchQuery}%`;
  const assets = query(
    'SELECT * FROM assets WHERE symbol LIKE ? OR name LIKE ? ORDER BY type, symbol',
    [searchTerm, searchTerm]
  );
  res.json(assets.map((asset: any) => ({ ...asset, currentPrice: null })));
});

// Seed default assets (manual trigger)
// POST /api/assets/seed
router.post('/seed', authMiddleware, (req, res) => {
  if (!isAssetAdmin(req)) {
    return res.status(403).json({ error: 'Asset admin access required' });
  }
  const { force } = req.body;

  // Check existing assets
  const existingCount = (query(
    'SELECT COUNT(*) as count FROM assets'
  )[0] as { count: number }).count;

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
      run(
        'INSERT INTO assets (user_id, symbol, name, type, exchange, currency) VALUES (?, ?, ?, ?, ?, ?)',
        [null, asset.symbol, asset.name, asset.type, asset.exchange || null, asset.currency]
      );
      successCount++;
    } catch (error: any) {
      if (error.message?.includes('UNIQUE')) {
        skipCount++;
      }
    }
  }

  saveDB();

  res.json({
    success: true,
    added: successCount,
    skipped: skipCount,
    total: defaultAssets.length
  });
});

export default router;
