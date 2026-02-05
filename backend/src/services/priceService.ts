import axios from 'axios';
import config from '../utils/config';

// Create axios instance with timeout
const api = axios.create({
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Price cache implementation with LRU eviction
interface CacheItem {
  value: number;
  timestamp: number;
  lastAccess: number;
}

// LRU Cache class with size limit and TTL support
class LRUCache {
  private cache: Map<string, CacheItem>;
  private maxSize: number;
  private ttl: number;
  private stats: {
    hits: number;
    misses: number;
    evictions: number;
    size: number;
  };

  constructor(maxSize: number = 1000, ttl: number = 300000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0,
    };
  }

  get(key: string): number | null {
    const item = this.cache.get(key);
    
    if (!item) {
      this.stats.misses++;
      return null;
    }

    const now = Date.now();
    
    // Check if expired
    if (now - item.timestamp > this.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.size = this.cache.size;
      return null;
    }

    // Update last access time for LRU
    item.lastAccess = now;
    this.cache.delete(key);
    this.cache.set(key, item);
    
    this.stats.hits++;
    return item.value;
  }

  set(key: string, value: number): void {
    // Check if cache is full and need to evict
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    const now = Date.now();
    this.cache.set(key, {
      value,
      timestamp: now,
      lastAccess: now,
    });
    this.stats.size = this.cache.size;
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestAccess = Infinity;
    
    for (const [key, item] of this.cache.entries()) {
      if (item.lastAccess < oldestAccess) {
        oldestAccess = item.lastAccess;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
      this.stats.size = this.cache.size;
    }
  }

  getStats(): { hits: number; misses: number; evictions: number; size: number; hitRate: string } {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? ((this.stats.hits / total) * 100).toFixed(2) : '0.00';
    
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      size: this.stats.size,
      hitRate: `${hitRate}%`,
    };
  }

  clear(): void {
    this.cache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0,
    };
  }

  getSize(): number {
    return this.cache.size;
  }

  getMaxSize(): number {
    return this.maxSize;
  }
}

// Create cache instance with config TTL
const priceCache = new LRUCache(1000, config.cache.ttl);

// Get cached value if valid
function getCachedValue(key: string): number | null {
  return priceCache.get(key);
}

// Set value in cache
function setCachedValue(key: string, value: number): void {
  priceCache.set(key, value);
}

// Generic cache wrapper
function withCache<T extends (...args: any[]) => Promise<number | null>>(
  fn: T,
  keyGenerator: (...args: Parameters<T>) => string
): (...args: Parameters<T>) => Promise<number | null> {
  return async (...args: Parameters<T>): Promise<number | null> => {
    const cacheKey = keyGenerator(...args);
    
    // Check cache first
    const cachedValue = getCachedValue(cacheKey);
    if (cachedValue !== null) {
      return cachedValue;
    }
    
    // Call the original function
    const value = await fn(...args);
    
    // Cache the value if valid
    if (value !== null) {
      setCachedValue(cacheKey, value);
    }
    
    return value;
  };
}

// Export cache statistics for monitoring
export function getCacheStats() {
  return priceCache.getStats();
}

// Export cache info for debugging
export function getCacheInfo() {
  return {
    size: priceCache.getSize(),
    maxSize: priceCache.getMaxSize(),
    ttl: config.cache.ttl,
  };
}

// CoinGecko API for crypto prices
async function getCryptoPriceImpl(symbol: string): Promise<number | null> {
  try {
    const coinMap: Record<string, string> = {
      'BTC': 'bitcoin',
      'ETH': 'ethereum',
      'SOL': 'solana',
      'BNB': 'binancecoin',
      'XRP': 'ripple',
      'ADA': 'cardano',
      'DOGE': 'dogecoin',
      'DOT': 'polkadot',
    };
    
    const coinId = coinMap[symbol.toUpperCase()] || symbol.toLowerCase();
    const response = await api.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`
    );
    return response.data[coinId]?.usd || null;
  } catch (error) {
    console.error(`Failed to fetch crypto price for ${symbol}:`, error);
    return null;
  }
}

export const getCryptoPrice = withCache(
  getCryptoPriceImpl,
  (symbol: string) => `crypto:${symbol.toUpperCase()}`
);

// Yahoo Finance for US stocks
async function getUSStockPriceImpl(symbol: string): Promise<number | null> {
  try {
    const response = await api.get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`
    );
    const result = response.data.chart.result?.[0];
    return result?.meta?.regularMarketPrice || null;
  } catch (error) {
    console.error(`Failed to fetch US stock price for ${symbol}:`, error);
    return null;
  }
}

export const getUSStockPrice = withCache(
  getUSStockPriceImpl,
  (symbol: string) => `us_stock:${symbol.toUpperCase()}`
);

// Sina Finance for China A-shares
async function getCNStockPriceImpl(symbol: string): Promise<number | null> {
  try {
    // Sina uses sh/sz prefix: 600519 -> sh600519, 000001 -> sz000001
    let prefix = 'sh';
    if (symbol.startsWith('0') || symbol.startsWith('3')) {
      prefix = 'sz';
    }
    const response = await api.get(
      `https://hq.sinajs.cn/list=${prefix}${symbol}`,
      { headers: { Referer: 'https://finance.sina.com.cn' } }
    );
    const data = response.data;
    const match = data.match(/"(.+)"/);
    if (match) {
      const parts = match[1].split(',');
      return parseFloat(parts[3]) || null; // Current price
    }
    return null;
  } catch (error) {
    console.error(`Failed to fetch CN stock price for ${symbol}:`, error);
    return null;
  }
}

export const getCNStockPrice = withCache(
  getCNStockPriceImpl,
  (symbol: string) => `cn_stock:${symbol}`
);

// Gold price (using free API)
async function getGoldPriceImpl(): Promise<number | null> {
  try {
    // Using metals.live free API
    const response = await api.get('https://api.metals.live/v1/spot/gold');
    let price = response.data?.[0]?.price || null;
    
    // Fallback if first API fails
    if (price === null) {
      const alt = await api.get('https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/XAU/USD');
      price = alt.data?.[0]?.spreadProfilePrices?.[0]?.ask || null;
    }
    
    return price;
  } catch (error) {
    console.error('Failed to fetch gold price:', error);
    return null;
  }
}

export const getGoldPrice = withCache(
  getGoldPriceImpl,
  () => 'gold'
);

// FX rate USD/CNY
async function getUSDCNYRateImpl(): Promise<number | null> {
  try {
    const response = await api.get(
      'https://query1.finance.yahoo.com/v8/finance/chart/USDCNY=X?interval=1d&range=1d'
    );
    return response.data.chart.result?.[0]?.meta?.regularMarketPrice || null;
  } catch (error) {
    console.error('Failed to fetch USD/CNY rate:', error);
    return null;
  }
}

export const getUSDCNYRate = withCache(
  getUSDCNYRateImpl,
  () => 'usd_cny'
);

// Unified price fetcher
export async function getAssetPrice(symbol: string, type: string): Promise<number | null> {
  switch (type) {
    case 'crypto':
      return getCryptoPrice(symbol);
    case 'stock_us':
      return getUSStockPrice(symbol);
    case 'stock_cn':
      return getCNStockPrice(symbol);
    case 'gold':
      return getGoldPrice();
    default:
      return null;
  }
}
