import { Router } from 'express';
import { query, run, lastInsertId, saveDB } from '../db/index.js';
import { getAssetPrice, getUSDCNYRate } from '../services/priceService.js';

const router = Router();

// Get all holdings with current values
router.get('/', async (req, res) => {
  const holdings = query(`
    SELECT h.*, a.symbol, a.name, a.type, a.currency, acc.name as account_name
    FROM holdings h
    JOIN assets a ON h.asset_id = a.id
    LEFT JOIN accounts acc ON h.account_id = acc.id
    ORDER BY a.type, a.symbol
  `);
  
  const usdcny = await getUSDCNYRate() || 7.2;
  
  const holdingsWithValue = await Promise.all(
    holdings.map(async (h: any) => {
      const currentPrice = await getAssetPrice(h.symbol, h.type);
      const currentValue = currentPrice ? currentPrice * h.quantity : null;
      const costBasis = h.avg_cost * h.quantity;
      const pnl = currentValue ? currentValue - costBasis : null;
      const pnlPercent = pnl && costBasis ? (pnl / costBasis) * 100 : null;
      
      let valueUSD = currentValue;
      if (h.currency === 'CNY' && currentValue) {
        valueUSD = currentValue / usdcny;
      }
      
      return {
        ...h,
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
router.get('/:assetId', async (req, res) => {
  const { assetId } = req.params;
  
  const holding = query(`
    SELECT h.*, a.symbol, a.name, a.type, a.currency
    FROM holdings h
    JOIN assets a ON h.asset_id = a.id
    WHERE h.asset_id = ?
  `, [Number(assetId)])[0] as any;
  
  if (!holding) {
    return res.status(404).json({ error: 'Holding not found' });
  }
  
  const currentPrice = await getAssetPrice(holding.symbol, holding.type);
  const currentValue = currentPrice ? currentPrice * holding.quantity : null;
  const costBasis = holding.avg_cost * holding.quantity;
  const pnl = currentValue ? currentValue - costBasis : null;
  
  const transactions = query(
    'SELECT * FROM transactions WHERE asset_id = ? ORDER BY date DESC',
    [Number(assetId)]
  );
  
  res.json({
    ...holding,
    currentPrice,
    currentValue,
    costBasis,
    pnl,
    pnlPercent: pnl && costBasis ? (pnl / costBasis) * 100 : null,
    transactions,
  });
});

// Add holding directly
router.post('/', (req, res) => {
  const { asset_id, account_id, quantity, avg_cost } = req.body;
  
  if (!asset_id || !quantity || !avg_cost) {
    return res.status(400).json({ error: 'Missing required fields: asset_id, quantity, avg_cost' });
  }
  
  try {
    // Check if holding already exists
    const existing = query(
      'SELECT * FROM holdings WHERE asset_id = ? AND (account_id = ? OR (account_id IS NULL AND ? IS NULL))',
      [asset_id, account_id || null, account_id || null]
    )[0] as any;
    
    if (existing) {
      // Update existing holding
      const newQty = existing.quantity + quantity;
      const newAvgCost = (existing.avg_cost * existing.quantity + avg_cost * quantity) / newQty;
      run(
        `UPDATE holdings SET quantity = ?, avg_cost = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [newQty, newAvgCost, existing.id]
      );
      saveDB();
      
      const updatedHolding = query('SELECT * FROM holdings WHERE id = ?', [existing.id])[0];
      res.json(updatedHolding);
    } else {
      // Create new holding
      run(
        'INSERT INTO holdings (asset_id, account_id, quantity, avg_cost) VALUES (?, ?, ?, ?)',
        [asset_id, account_id || null, quantity, avg_cost]
      );
      saveDB();
      
      const id = lastInsertId();
      const newHolding = query('SELECT * FROM holdings WHERE id = ?', [id])[0];
      res.status(201).json(newHolding);
    }
  } catch (error: any) {
    console.error('Error adding holding:', error);
    res.status(500).json({ error: 'Failed to add holding' });
  }
});

export default router;
