import { Router } from 'express';
import { query, run, saveDB } from '../db/index.js';
import { 
  getPortfolioHistory, 
  getAssetHistory, 
  recordDailySnapshot,
  recordAssetPrice,
  getAvailableHistoryRange
} from '../services/priceHistoryService.js';

const router = Router();

// Get portfolio history
// Query params:
//   - range: '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | 'YTD' | 'ALL'
router.get('/portfolio', async (req, res) => {
  try {
    const range = (req.query.range as string) || '1M';
    const validRanges = ['1D', '1W', '1M', '3M', '6M', '1Y', 'YTD', 'ALL'];
    
    if (!validRanges.includes(range)) {
      return res.status(400).json({ error: 'Invalid range. Must be one of: ' + validRanges.join(', ') });
    }

    const data = await getPortfolioHistory(range);
    
    res.json({
      range,
      data,
      count: data.length
    });
  } catch (error: any) {
    console.error('Error fetching portfolio history:', error);
    res.status(500).json({ error: 'Failed to fetch portfolio history' });
  }
});

// Get asset price history
// Query params:
//   - range: '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | 'YTD' | 'ALL'
router.get('/asset/:id', async (req, res) => {
  try {
    const assetId = parseInt(req.params.id);
    const range = (req.query.range as string) || '1M';
    
    if (isNaN(assetId)) {
      return res.status(400).json({ error: 'Invalid asset ID' });
    }

    const validRanges = ['1D', '1W', '1M', '3M', '6M', '1Y', 'YTD', 'ALL'];
    if (!validRanges.includes(range)) {
      return res.status(400).json({ error: 'Invalid range' });
    }

    // Get asset info
    const asset = query('SELECT id, symbol, name FROM assets WHERE id = ?', [assetId])[0];
    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const data = await getAssetHistory(assetId, range);
    
    res.json({
      assetId: assetId.toString(),
      symbol: (asset as any).symbol,
      name: (asset as any).name,
      range,
      data,
      count: data.length
    });
  } catch (error: any) {
    console.error('Error fetching asset history:', error);
    res.status(500).json({ error: 'Failed to fetch asset history' });
  }
});

// Manually trigger a portfolio snapshot
router.post('/snapshot', async (req, res) => {
  try {
    await recordDailySnapshot();
    res.json({ message: 'Portfolio snapshot recorded successfully' });
  } catch (error: any) {
    console.error('Error recording snapshot:', error);
    res.status(500).json({ error: 'Failed to record snapshot' });
  }
});

// Record a price point for an asset (for tracking price history)
router.post('/asset/:id/price', (req, res) => {
  try {
    const assetId = parseInt(req.params.id);
    const { price } = req.body;
    
    if (isNaN(assetId)) {
      return res.status(400).json({ error: 'Invalid asset ID' });
    }
    
    if (typeof price !== 'number' || price <= 0) {
      return res.status(400).json({ error: 'Invalid price' });
    }

    // Verify asset exists
    const asset = query('SELECT id FROM assets WHERE id = ?', [assetId])[0];
    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    recordAssetPrice(assetId, price);
    
    res.status(201).json({
      message: 'Price recorded successfully',
      assetId,
      price,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error recording price:', error);
    res.status(500).json({ error: 'Failed to record price' });
  }
});

// Get available history range
router.get('/range', (req, res) => {
  try {
    const range = getAvailableHistoryRange();
    res.json(range);
  } catch (error: any) {
    console.error('Error fetching history range:', error);
    res.status(500).json({ error: 'Failed to fetch history range' });
  }
});

// Batch record prices (for efficient price history tracking)
router.post('/prices/batch', (req, res) => {
  try {
    const { prices } = req.body; // Array of { asset_id, price }
    
    if (!Array.isArray(prices) || prices.length === 0) {
      return res.status(400).json({ error: 'Prices array required' });
    }

    let recorded = 0;
    for (const item of prices) {
      if (item.asset_id && typeof item.price === 'number' && item.price > 0) {
        recordAssetPrice(item.asset_id, item.price);
        recorded++;
      }
    }
    
    res.json({
      message: 'Prices recorded successfully',
      recorded,
      total: prices.length
    });
  } catch (error: any) {
    console.error('Error recording batch prices:', error);
    res.status(500).json({ error: 'Failed to record prices' });
  }
});

export default router;
