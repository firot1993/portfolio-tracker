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

// Delete asset
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  run('DELETE FROM assets WHERE id = ?', [Number(id)]);
  saveDB();
  res.status(204).send();
});

export default router;
