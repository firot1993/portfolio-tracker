import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { getDB, assets } from '../db/index.js';
import {
  getPortfolioHistory,
  getAssetHistory,
  recordAssetPrice,
  getAvailableHistoryRange
} from '../services/priceHistoryService.js';
import { runDailyCollector, runQueuedBackfills, getCollectorStats } from '../collector/collector.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// Standard API response wrapper
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    count?: number;
    timestamp?: string;
    range?: string;
  };
}

// Get portfolio history
// Query params:
//   - range: '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | 'YTD' | 'ALL'
router.get('/portfolio', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const range = (req.query.range as string) || '1M';
    const validRanges = ['1D', '1W', '1M', '3M', '6M', '1Y', 'YTD', 'ALL'];

    if (!validRanges.includes(range)) {
      const response: ApiResponse<never> = {
        success: false,
        error: 'Invalid range. Must be one of: ' + validRanges.join(', ')
      };
      return res.status(400).json(response);
    }

    const data = await getPortfolioHistory(range, userId);

    const response: ApiResponse<typeof data> = {
      success: true,
      data,
      meta: {
        range,
        count: data.length,
        timestamp: new Date().toISOString()
      }
    };

    res.json(response);
  } catch (error: any) {
    console.error('Error fetching portfolio history:', error);
    const response: ApiResponse<never> = {
      success: false,
      error: 'Failed to fetch portfolio history'
    };
    res.status(500).json(response);
  }
});

// Get asset price history
// Query params:
//   - range: '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | 'YTD' | 'ALL'
router.get('/asset/:id', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const assetId = parseInt(req.params.id);
    const range = (req.query.range as string) || '1M';

    if (isNaN(assetId)) {
      const response: ApiResponse<never> = {
        success: false,
        error: 'Invalid asset ID'
      };
      return res.status(400).json(response);
    }

    const validRanges = ['1D', '1W', '1M', '3M', '6M', '1Y', 'YTD', 'ALL'];
    if (!validRanges.includes(range)) {
      const response: ApiResponse<never> = {
        success: false,
        error: 'Invalid range'
      };
      return res.status(400).json(response);
    }

    const db = getDB();

    // Get asset info and verify it exists (assets are global)
    const asset = db.select({ id: assets.id, symbol: assets.symbol, name: assets.name })
      .from(assets)
      .where(eq(assets.id, assetId))
      .get();

    if (!asset) {
      const response: ApiResponse<never> = {
        success: false,
        error: 'Asset not found'
      };
      return res.status(404).json(response);
    }

    const data = await getAssetHistory(assetId, range, userId);

    const response: ApiResponse<typeof data> = {
      success: true,
      data,
      meta: {
        range,
        count: data.length,
        timestamp: new Date().toISOString()
      }
    };

    res.json(response);
  } catch (error: any) {
    console.error('Error fetching asset history:', error);
    const response: ApiResponse<never> = {
      success: false,
      error: 'Failed to fetch asset history'
    };
    res.status(500).json(response);
  }
});

// Manually trigger a portfolio snapshot
router.post('/snapshot', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    await runDailyCollector(userId);
    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: { message: 'Collector run completed' },
      meta: { timestamp: new Date().toISOString() }
    };
    res.json(response);
  } catch (error: any) {
    console.error('Error running collector:', error);
    const response: ApiResponse<never> = {
      success: false,
      error: 'Failed to run collector'
    };
    res.status(500).json(response);
  }
});

// Run queued backfill jobs
router.post('/backfill/run', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    await runQueuedBackfills(userId);
    const stats = getCollectorStats(userId);
    const response: ApiResponse<{ message: string; stats: typeof stats }> = {
      success: true,
      data: { message: 'Backfill processing completed', stats },
      meta: { timestamp: new Date().toISOString() }
    };
    res.json(response);
  } catch (error: any) {
    console.error('Error running backfills:', error);
    const response: ApiResponse<never> = {
      success: false,
      error: 'Failed to run backfills'
    };
    res.status(500).json(response);
  }
});

// Get collector statistics
router.get('/stats', authMiddleware, (req, res) => {
  try {
    const userId = (req as any).user.id;
    const stats = getCollectorStats(userId);
    const response: ApiResponse<typeof stats> = {
      success: true,
      data: stats,
      meta: { timestamp: new Date().toISOString() }
    };
    res.json(response);
  } catch (error: any) {
    console.error('Error fetching collector stats:', error);
    const response: ApiResponse<never> = {
      success: false,
      error: 'Failed to fetch collector statistics'
    };
    res.status(500).json(response);
  }
});

// Record a price point for an asset (for tracking price history)
router.post('/asset/:id/price', authMiddleware, (req, res) => {
  try {
    const userId = (req as any).user.id;
    const assetId = parseInt(req.params.id);
    const { price } = req.body;

    if (isNaN(assetId)) {
      const response: ApiResponse<never> = {
        success: false,
        error: 'Invalid asset ID'
      };
      return res.status(400).json(response);
    }

    if (typeof price !== 'number' || price <= 0) {
      const response: ApiResponse<never> = {
        success: false,
        error: 'Invalid price'
      };
      return res.status(400).json(response);
    }

    const db = getDB();

    // Verify asset exists (assets are global)
    const asset = db.select({ id: assets.id })
      .from(assets)
      .where(eq(assets.id, assetId))
      .get();

    if (!asset) {
      const response: ApiResponse<never> = {
        success: false,
        error: 'Asset not found'
      };
      return res.status(404).json(response);
    }

    recordAssetPrice(assetId, price, userId);

    const response: ApiResponse<{ assetId: number; price: number; timestamp: string }> = {
      success: true,
      data: {
        assetId,
        price,
        timestamp: new Date().toISOString()
      },
      meta: { timestamp: new Date().toISOString() }
    };

    res.status(201).json(response);
  } catch (error: any) {
    console.error('Error recording price:', error);
    const response: ApiResponse<never> = {
      success: false,
      error: 'Failed to record price'
    };
    res.status(500).json(response);
  }
});

// Get available history range
router.get('/range', authMiddleware, (req, res) => {
  try {
    const userId = (req as any).user.id;
    const range = getAvailableHistoryRange(userId);
    const response: ApiResponse<typeof range> = {
      success: true,
      data: range,
      meta: { timestamp: new Date().toISOString() }
    };
    res.json(response);
  } catch (error: any) {
    console.error('Error fetching history range:', error);
    const response: ApiResponse<never> = {
      success: false,
      error: 'Failed to fetch history range'
    };
    res.status(500).json(response);
  }
});

// Batch record prices (for efficient price history tracking)
router.post('/prices/batch', authMiddleware, (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { prices } = req.body; // Array of { asset_id, price }

    if (!Array.isArray(prices) || prices.length === 0) {
      const response: ApiResponse<never> = {
        success: false,
        error: 'Prices array required'
      };
      return res.status(400).json(response);
    }

    let recorded = 0;
    for (const item of prices) {
      if (item.asset_id && typeof item.price === 'number' && item.price > 0) {
        recordAssetPrice(item.asset_id, item.price, userId);
        recorded++;
      }
    }

    const response: ApiResponse<{ recorded: number; total: number }> = {
      success: true,
      data: {
        recorded,
        total: prices.length
      },
      meta: { timestamp: new Date().toISOString() }
    };

    res.json(response);
  } catch (error: any) {
    console.error('Error recording batch prices:', error);
    const response: ApiResponse<never> = {
      success: false,
      error: 'Failed to record prices'
    };
    res.status(500).json(response);
  }
});

export default router;
