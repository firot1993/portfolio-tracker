import axios from 'axios';
import config from '../utils/config';

// Create axios instance with timeout
const api = axios.create({
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Price cache implementation
interface CacheItem {
  value: number;
  timestamp: number;
}

// Cache object with TTL
const priceCache: Record<string, CacheItem> = {};
const CACHE_TTL = config.cache.ttl;

// Get cached value if valid
function getCachedValue(key: string): number | null {
  const item = priceCache[key];
  if (item) {
    const now = Date.now();
    if (now - item.timestamp < CACHE_TTL) {
      return item.value;
    } else {
      // Remove expired item
      delete priceCache[key];
    }
  }
  return null;
}

// Set value in cache
function setCachedValue(key: string, value: number): void {
  priceCache[key] = {
    value,
    timestamp: Date.now(),
  };
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
