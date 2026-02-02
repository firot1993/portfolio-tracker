import { Router } from 'express';
import { query } from '../db/index.js';
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

export default router;
