import { Router } from 'express';
import { query, run, lastInsertId, saveDB } from '../db/index.js';
import { getAssetPrice } from '../services/priceService.js';

const router = Router();

// Get all assets with current prices
router.get('/', async (req, res) => {
  const assets = query('SELECT * FROM assets ORDER BY type, symbol');
  
  const assetsWithPrices = await Promise.all(
    assets.map(async (asset: any) => {
      const price = await getAssetPrice(asset.symbol, asset.type);
      return { ...asset, currentPrice: price };
    })
  );
  
  res.json(assetsWithPrices);
});

// Add new asset
router.post('/', (req, res) => {
  const { symbol, name, type, exchange, currency = 'USD' } = req.body;
  
  if (!symbol || !name || !type) {
    return res.status(400).json({ error: 'Symbol, name, and type are required' });
  }
  
  try {
    run(
      'INSERT INTO assets (symbol, name, type, exchange, currency) VALUES (?, ?, ?, ?, ?)',
      [symbol.toUpperCase(), name, type, exchange || null, currency]
    );
    saveDB();
    
    const id = lastInsertId();
    const asset = query('SELECT * FROM assets WHERE id = ?', [id])[0];
    res.status(201).json(asset);
  } catch (error: any) {
    if (error.message?.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Asset already exists' });
    }
    throw error;
  }
});

// Get single asset price
router.get('/:id/price', async (req, res) => {
  const { id } = req.params;
  const asset = query('SELECT * FROM assets WHERE id = ?', [Number(id)])[0] as any;
  
  if (!asset) {
    return res.status(404).json({ error: 'Asset not found' });
  }
  
  const price = await getAssetPrice(asset.symbol, asset.type);
  res.json({ symbol: asset.symbol, price, currency: asset.currency });
});

// Delete asset by ID (with cascade delete for holdings and transactions)
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const assetId = Number(id);
  
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
router.delete('/by-symbol/:symbol', (req, res) => {
  const { symbol } = req.params;
  
  // Get asset ID first
  const asset = query('SELECT id FROM assets WHERE symbol = ?', [symbol.toUpperCase()])[0] as any;
  
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
router.delete('/cleanup/all', (req, res) => {
  run('DELETE FROM transactions');
  run('DELETE FROM holdings');
  run('DELETE FROM assets');
  saveDB();
  res.status(204).send();
});

// Delete test assets only (those starting with "TEST")
router.delete('/cleanup/test-data', (req, res) => {
  const testAssets = query("SELECT id FROM assets WHERE symbol LIKE 'TEST%'");
  
  for (const asset of testAssets) {
    run('DELETE FROM transactions WHERE asset_id = ?', [asset.id]);
    run('DELETE FROM holdings WHERE asset_id = ?', [asset.id]);
    run('DELETE FROM assets WHERE id = ?', [asset.id]);
  }
  
  saveDB();
  res.status(204).send();
});

// Search assets by symbol or name
router.get('/search/:query', (req, res) => {
  const { query } = req.params;
  const searchTerm = `%${query}%`;
  const assets = query(
    'SELECT * FROM assets WHERE symbol LIKE ? OR name LIKE ? ORDER BY type, symbol',
    [searchTerm, searchTerm]
  );
  res.json(assets);
});

export default router;
