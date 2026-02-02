export interface Asset {
  id: number;
  symbol: string;
  name: string;
  type: 'crypto' | 'stock_us' | 'stock_cn' | 'gold';
  exchange?: string;
  currency: string;
  currentPrice?: number;
}

export interface Holding {
  id: number;
  asset_id: number;
  account_id?: number;
  quantity: number;
  avg_cost: number;
  symbol: string;
  name: string;
  type: string;
  currency: string;
  account_name?: string;
  currentPrice?: number;
  currentValue?: number;
  valueUSD?: number;
  costBasis: number;
  pnl?: number;
  pnlPercent?: number;
}

export interface Transaction {
  id: number;
  asset_id: number;
  account_id?: number;
  type: 'buy' | 'sell' | 'transfer_in' | 'transfer_out';
  quantity: number;
  price: number;
  fee: number;
  date: string;
  notes?: string;
  asset_symbol?: string;
  asset_name?: string;
  account_name?: string;
}

export interface PortfolioSummary {
  totalValueUSD: number;
  totalCostUSD: number;
  totalPnL: number;
  totalPnLPercent: number;
  allocation: Record<string, number>;
  allocationPercent: Record<string, number>;
  holdings: Array<{
    symbol: string;
    name: string;
    type: string;
    quantity: number;
    currentPrice?: number;
    valueUSD: number;
    costUSD: number;
    pnl: number;
    pnlPercent: number;
  }>;
  usdcny: number;
}

export interface Account {
  id: number;
  name: string;
  type: string;
  currency: string;
}
