import axios, { type AxiosError } from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3001/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  withCredentials: true,
});

export default api;

// Auth API
export interface User {
  id: number;
  email: string;
  created_at: string;
}

export const login = (email: string, password: string) =>
  api.post<{ user: User }>('/auth/login', { email, password }).then(r => r.data);

export const register = (email: string, password: string) =>
  api.post<{ user: User }>('/auth/register', { email, password }).then(r => r.data);

export const logout = () => api.post('/auth/logout').then(r => r.data);

export const getCurrentUser = () =>
  api.get<{ user: User }>('/auth/me').then(r => r.data);

export const changePassword = (currentPassword: string, newPassword: string) =>
  api.post('/auth/change-password', { currentPassword, newPassword }).then(r => r.data);

// Portfolio Summary
export interface PortfolioSummary {
  totalValueUSD: number;
  totalCostUSD: number;
  totalPnL: number;
  totalPnLPercent: number;
  usdcny?: number;
  allocation: Record<string, number>;
  allocationPercent: Record<string, number>;
  holdings: Array<{
    symbol: string;
    name: string;
    type: string;
    quantity: number;
    avgCost: number;
    currentPrice?: number;
    valueUSD: number;
    costUSD: number;
    pnl: number;
    pnlPercent: number;
  }>;
  stalePrices?: boolean;
  staleAssets?: string[];
}

export const getPortfolioSummary = (options?: { includePrices?: boolean; refreshPrices?: boolean }) =>
  api.get<PortfolioSummary>('/portfolio/summary', {
    params: {
      includePrices: options?.includePrices !== false,
      refreshPrices: options?.refreshPrices === true
    }
  }).then(r => r.data);

export const refreshPrices = (assetIds?: number[]) =>
  api.post<{ updated: number; failed: number; results: Array<{ symbol: string; price: number | null; error?: string }> }>('/portfolio/refresh-prices', { assetIds }).then(r => r.data);

// Holdings
export interface Holding {
  id: number;
  asset_id: number;
  account_id?: number;
  quantity: number;
  avg_cost: number;
  updated_at: string;
}

export const getHoldings = (includePrices = true) =>
  api.get<Holding[]>('/holdings', { params: { includePrices } }).then(r => r.data);
export const getHolding = (assetId: number) =>
  api.get<Holding>(`/holdings/${assetId}`).then(r => r.data);
export const createHolding = (data: { asset_id: number; quantity: number; avg_cost: number }) =>
  api.post<Holding>('/holdings', data).then(r => r.data);

// Assets
export interface Asset {
  id: number;
  symbol: string;
  name: string;
  type: 'crypto' | 'stock_us' | 'stock_cn' | 'gold';
  exchange?: string;
  currency: string;
  currentPrice?: number | null;
}

export const getAssets = () => api.get<Asset[]>('/assets').then(r => r.data);
export const createAsset = (data: { symbol: string; name: string; type: string; currency: string; exchange?: string }) =>
  api.post<Asset>('/assets', data).then(r => r.data);
export const deleteAsset = (id: number) => api.delete(`/assets/${id}`);
export const deleteAssetBySymbol = (symbol: string) => api.delete(`/assets/by-symbol/${symbol}`);
export const cleanupAllAssets = () => api.delete('/assets/cleanup/all');
export const searchAssets = (query: string) => api.get<Asset[]>(`/assets/search/${query}`).then(r => r.data);
export const seedDefaultAssets = () =>
  api.post<{ added: number; skipped: number; total: number }>('/assets/seed').then(r => r.data);
export const getAssetPrice = (id: number) =>
  api.get<{ price: number | null }>(`/assets/${id}/price`).then(r => r.data);

// Transactions
export interface Transaction {
  id: number;
  asset_id: number;
  asset_symbol: string;
  asset_type: string;
  account_id?: number;
  type: 'buy' | 'sell';
  quantity: number;
  price: number;
  fee?: number;
  date: string;
  notes?: string;
  created_at?: string;
}

export const getTransactions = (params?: { asset_id?: number; limit?: number }) =>
  api.get<Transaction[]>('/transactions', { params }).then(r => r.data);
export const createTransaction = (data: { asset_id: number; type: 'buy' | 'sell'; quantity: number; price: number; date: string; fee?: number }) =>
  api.post<Transaction>('/transactions', data).then(r => r.data);
export const deleteTransaction = (id: number) =>
  api.delete(`/transactions/${id}`).catch((err: AxiosError) => {
    console.error('Failed to delete transaction:', err);
    throw err;
  });

// Accounts
export interface Account {
  id: number;
  name: string;
  type: string;
  currency: string;
  created_at: string;
}

export const getAccounts = () => api.get<Account[]>('/accounts').then(r => r.data);
export const createAccount = (data: { name: string; type: string; currency: string }) =>
  api.post<Account>('/accounts', data).then(r => r.data);

// History API
export interface PortfolioHistoryPoint {
  date: string;
  value: number;
  cost: number;
  pnl: number;
}

export interface AssetHistoryPoint {
  date: string;
  price: number;
}

export const getPortfolioHistory = (range: string) =>
  api.get<{ range: string; data: PortfolioHistoryPoint[]; count: number }>(`/history/portfolio`, { params: { range } }).then(r => r.data);

export const getAssetHistory = (assetId: number, range: string) =>
  api.get<{ assetId: string; symbol: string; name: string; range: string; data: AssetHistoryPoint[]; count: number }>(`/history/asset/${assetId}`, { params: { range } }).then(r => r.data);

export const recordSnapshot = () =>
  api.post('/history/snapshot').then(r => r.data);

export const runBackfills = () =>
  api.post<{ success: boolean; data?: { message: string; stats: { pendingJobs: number; completedJobs: number; totalRuns: number; successfulRuns: number; failedRuns: number } } }>('/history/backfill/run').then(r => r.data);

export const getHistoryRange = () =>
  api.get<{ earliest: string | null; latest: string | null }>('/history/range').then(r => r.data);

export type { AxiosError };
