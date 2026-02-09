/**
 * Default asset seeds for the portfolio tracker
 * These assets are automatically added when the database is first created
 */

export interface DefaultAsset {
  symbol: string;
  name: string;
  type: 'crypto' | 'stock_us' | 'stock_cn' | 'gold';
  exchange?: string;
  currency: string;
}

export const defaultAssets: DefaultAsset[] = [
  // Cryptocurrency
  { symbol: 'BTC', name: 'Bitcoin', type: 'crypto', currency: 'USD' },
  { symbol: 'ETH', name: 'Ethereum', type: 'crypto', currency: 'USD' },
  { symbol: 'SOL', name: 'Solana', type: 'crypto', currency: 'USD' },
  { symbol: 'BNB', name: 'BNB', type: 'crypto', currency: 'USD' },
  { symbol: 'XRP', name: 'XRP', type: 'crypto', currency: 'USD' },
  { symbol: 'DOGE', name: 'Dogecoin', type: 'crypto', currency: 'USD' },
  { symbol: 'ADA', name: 'Cardano', type: 'crypto', currency: 'USD' },
  { symbol: 'AVAX', name: 'Avalanche', type: 'crypto', currency: 'USD' },
  { symbol: 'DOT', name: 'Polkadot', type: 'crypto', currency: 'USD' },
  { symbol: 'LINK', name: 'Chainlink', type: 'crypto', currency: 'USD' },

  // US Stocks - Tech Giants
  { symbol: 'AAPL', name: 'Apple Inc.', type: 'stock_us', exchange: 'NASDAQ', currency: 'USD' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', type: 'stock_us', exchange: 'NASDAQ', currency: 'USD' },
  { symbol: 'GOOGL', name: 'Alphabet Inc. (Google)', type: 'stock_us', exchange: 'NASDAQ', currency: 'USD' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', type: 'stock_us', exchange: 'NASDAQ', currency: 'USD' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', type: 'stock_us', exchange: 'NASDAQ', currency: 'USD' },
  { symbol: 'META', name: 'Meta Platforms Inc.', type: 'stock_us', exchange: 'NASDAQ', currency: 'USD' },
  { symbol: 'TSLA', name: 'Tesla Inc.', type: 'stock_us', exchange: 'NASDAQ', currency: 'USD' },
  { symbol: 'NFLX', name: 'Netflix Inc.', type: 'stock_us', exchange: 'NASDAQ', currency: 'USD' },
  { symbol: 'AMD', name: 'Advanced Micro Devices', type: 'stock_us', exchange: 'NASDAQ', currency: 'USD' },
  { symbol: 'INTC', name: 'Intel Corporation', type: 'stock_us', exchange: 'NASDAQ', currency: 'USD' },

  // US Stocks - Finance & Others
  { symbol: 'BRK-B', name: 'Berkshire Hathaway', type: 'stock_us', exchange: 'NYSE', currency: 'USD' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', type: 'stock_us', exchange: 'NYSE', currency: 'USD' },
  { symbol: 'V', name: 'Visa Inc.', type: 'stock_us', exchange: 'NYSE', currency: 'USD' },
  { symbol: 'WMT', name: 'Walmart Inc.', type: 'stock_us', exchange: 'NYSE', currency: 'USD' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', type: 'stock_us', exchange: 'NYSE', currency: 'USD' },
  { symbol: 'PG', name: 'Procter & Gamble', type: 'stock_us', exchange: 'NYSE', currency: 'USD' },
  { symbol: 'UNH', name: 'UnitedHealth Group', type: 'stock_us', exchange: 'NYSE', currency: 'USD' },
  { symbol: 'HD', name: 'Home Depot Inc.', type: 'stock_us', exchange: 'NYSE', currency: 'USD' },
  { symbol: 'MA', name: 'Mastercard Inc.', type: 'stock_us', exchange: 'NYSE', currency: 'USD' },
  { symbol: 'BAC', name: 'Bank of America', type: 'stock_us', exchange: 'NYSE', currency: 'USD' },

  // US Stocks - ETFs
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF', type: 'stock_us', exchange: 'NYSE', currency: 'USD' },
  { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', type: 'stock_us', exchange: 'NYSE', currency: 'USD' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', type: 'stock_us', exchange: 'NASDAQ', currency: 'USD' },
  { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', type: 'stock_us', exchange: 'NYSE', currency: 'USD' },
  { symbol: 'ARKK', name: 'ARK Innovation ETF', type: 'stock_us', exchange: 'NYSE', currency: 'USD' },
  { symbol: 'GLD', name: 'SPDR Gold Shares', type: 'stock_us', exchange: 'NYSE', currency: 'USD' },

  // China A-Shares (Shanghai/Shenzhen)
  { symbol: '600519', name: '贵州茅台 (Kweichow Moutai)', type: 'stock_cn', exchange: 'SSE', currency: 'CNY' },
  { symbol: '000858', name: '五粮液 (Wuliangye)', type: 'stock_cn', exchange: 'SZSE', currency: 'CNY' },
  { symbol: '601398', name: '工商银行 (ICBC)', type: 'stock_cn', exchange: 'SSE', currency: 'CNY' },
  { symbol: '601288', name: '农业银行 (ABC)', type: 'stock_cn', exchange: 'SSE', currency: 'CNY' },
  { symbol: '601988', name: '中国银行 (Bank of China)', type: 'stock_cn', exchange: 'SSE', currency: 'CNY' },
  { symbol: '600036', name: '招商银行 (CMB)', type: 'stock_cn', exchange: 'SSE', currency: 'CNY' },
  { symbol: '000001', name: '平安银行 (Ping An Bank)', type: 'stock_cn', exchange: 'SZSE', currency: 'CNY' },
  { symbol: '000002', name: '万科A (Vanke)', type: 'stock_cn', exchange: 'SZSE', currency: 'CNY' },
  { symbol: '002594', name: '比亚迪 (BYD)', type: 'stock_cn', exchange: 'SZSE', currency: 'CNY' },
  { symbol: '300750', name: '宁德时代 (CATL)', type: 'stock_cn', exchange: 'SZSE', currency: 'CNY' },
  { symbol: '600276', name: '恒瑞医药 (Hengrui Medicine)', type: 'stock_cn', exchange: 'SSE', currency: 'CNY' },
  { symbol: '000725', name: '京东方A (BOE)', type: 'stock_cn', exchange: 'SZSE', currency: 'CNY' },
  { symbol: '600900', name: '长江电力 (Yangtze Power)', type: 'stock_cn', exchange: 'SSE', currency: 'CNY' },
  { symbol: '601012', name: '隆基绿能 (LONGi Green Energy)', type: 'stock_cn', exchange: 'SSE', currency: 'CNY' },
  { symbol: '300059', name: '东方财富 (East Money)', type: 'stock_cn', exchange: 'SZSE', currency: 'CNY' },

  // Hong Kong Stocks
  { symbol: '0700.HK', name: '腾讯控股 (Tencent)', type: 'stock_cn', exchange: 'HKEX', currency: 'HKD' },
  { symbol: '9988.HK', name: '阿里巴巴 (Alibaba)', type: 'stock_cn', exchange: 'HKEX', currency: 'HKD' },
  { symbol: '3690.HK', name: '美团 (Meituan)', type: 'stock_cn', exchange: 'HKEX', currency: 'HKD' },
  { symbol: '2318.HK', name: '中国平安 (Ping An)', type: 'stock_cn', exchange: 'HKEX', currency: 'HKD' },
  { symbol: '1211.HK', name: '比亚迪股份 (BYD)', type: 'stock_cn', exchange: 'HKEX', currency: 'HKD' },

  // Chinese ADRs (US-listed Chinese companies)
  { symbol: 'BABA', name: 'Alibaba Group', type: 'stock_us', exchange: 'NYSE', currency: 'USD' },
  { symbol: 'PDD', name: 'PDD Holdings', type: 'stock_us', exchange: 'NASDAQ', currency: 'USD' },
  { symbol: 'JD', name: 'JD.com', type: 'stock_us', exchange: 'NASDAQ', currency: 'USD' },
  { symbol: 'BIDU', name: 'Baidu Inc.', type: 'stock_us', exchange: 'NASDAQ', currency: 'USD' },
  { symbol: 'NTES', name: 'NetEase Inc.', type: 'stock_us', exchange: 'NASDAQ', currency: 'USD' },
  { symbol: 'LI', name: 'Li Auto Inc.', type: 'stock_us', exchange: 'NASDAQ', currency: 'USD' },
  { symbol: 'NIO', name: 'NIO Inc.', type: 'stock_us', exchange: 'NYSE', currency: 'USD' },
  { symbol: 'XPEV', name: 'XPeng Inc.', type: 'stock_us', exchange: 'NYSE', currency: 'USD' },

  // Gold
  { symbol: 'XAU', name: 'Gold Spot', type: 'gold', currency: 'USD' },
];
