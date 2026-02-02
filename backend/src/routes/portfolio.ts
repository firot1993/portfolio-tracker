import { Router } from 'express';
import { query } from '../db/index.js';
import { getAssetPrice, getUSDCNYRate } from '../services/priceService.js';

const router = Router();

// Get portfolio summary
router.get('/summary', async (req, res) => {
  const holdings = query(`
    SELECT h.*, a.symbol, a.name, a.type, a.currency
    FROM holdings h
    JOIN assets a ON h.asset_id = a.id
  `);
  
  const usdcny = await getUSDCNYRate() || 7.2;
  
  let totalValueUSD = 0;
  let totalCostUSD = 0;
  const allocation: Record<string, number> = {
    crypto: 0,
    stock_us: 0,
    stock_cn: 0,
    gold: 0,
  };
  
  const details = await Promise.all(
    holdings.map(async (h: any) => {
      const currentPrice = await getAssetPrice(h.symbol, h.type);
      let valueUSD = currentPrice ? currentPrice * h.quantity : 0;
      let costUSD = h.avg_cost * h.quantity;
      
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
  });
});

export default router;
