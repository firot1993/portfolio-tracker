import axios from 'axios';

// Create axios instance with timeout
const api = axios.create({
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// CoinGecko API for crypto prices
export async function getCryptoPrice(symbol: string): Promise<number | null> {
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

// Yahoo Finance for US stocks
export async function getUSStockPrice(symbol: string): Promise<number | null> {
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

// Sina Finance for China A-shares
export async function getCNStockPrice(symbol: string): Promise<number | null> {
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

// Gold price (using free API)
export async function getGoldPrice(): Promise<number | null> {
  try {
    // Using metals.live free API
    const response = await api.get('https://api.metals.live/v1/spot/gold');
    return response.data?.[0]?.price || null;
  } catch (error) {
    console.error('Failed to fetch gold price:', error);
    // Fallback: try alternative
    try {
      const alt = await api.get('https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/XAU/USD');
      return alt.data?.[0]?.spreadProfilePrices?.[0]?.ask || null;
    } catch {
      return null;
    }
  }
}

// FX rate USD/CNY
export async function getUSDCNYRate(): Promise<number | null> {
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
