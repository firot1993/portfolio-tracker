import axios from 'axios';

const API_BASE = 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
});

// Portfolio
export const getPortfolioSummary = () => api.get<any>('/portfolio/summary').then(r => r.data);

// Holdings
export const getHoldings = () => api.get<any[]>('/holdings').then(r => r.data);
export const getHolding = (assetId: number) => api.get<any>(`/holdings/${assetId}`).then(r => r.data);

// Assets
export const getAssets = () => api.get<any[]>('/assets').then(r => r.data);
export const createAsset = (data: any) => api.post<any>('/assets', data).then(r => r.data);
export const deleteAsset = (id: number) => api.delete(`/assets/${id}`);
export const deleteAssetBySymbol = (symbol: string) => api.delete(`/assets/by-symbol/${symbol}`);
export const cleanupAllAssets = () => api.delete('/assets/cleanup/all');
export const searchAssets = (query: string) => api.get<any[]>(`/assets/search/${query}`).then(r => r.data);

// Transactions
export const getTransactions = (params?: { asset_id?: number; limit?: number }) => 
  api.get<any[]>('/transactions', { params }).then(r => r.data);
export const createTransaction = (data: any) => 
  api.post<any>('/transactions', data).then(r => r.data);
export const deleteTransaction = (id: number) => 
  api.delete(`/transactions/${id}`).catch((err: unknown) => {
    console.error('Failed to delete transaction:', err);
    throw err;
  });

// Accounts
export const getAccounts = () => api.get<any[]>('/accounts').then(r => r.data);
export const createAccount = (data: any) => api.post<any>('/accounts', data).then(r => r.data);

// Holdings
export const createHolding = (data: any) => api.post<any>('/holdings', data).then(r => r.data);
