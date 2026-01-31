import axios from 'axios';
import { Asset, Holding, Transaction, PortfolioSummary, Account } from '../types';

const API_BASE = 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
});

// Portfolio
export const getPortfolioSummary = () => api.get<PortfolioSummary>('/portfolio/summary').then(r => r.data);

// Holdings
export const getHoldings = () => api.get<Holding[]>('/holdings').then(r => r.data);
export const getHolding = (assetId: number) => api.get<Holding>(`/holdings/${assetId}`).then(r => r.data);

// Assets
export const getAssets = () => api.get<Asset[]>('/assets').then(r => r.data);
export const createAsset = (data: Partial<Asset>) => api.post<Asset>('/assets', data).then(r => r.data);
export const deleteAsset = (id: number) => api.delete(`/assets/${id}`);

// Transactions
export const getTransactions = (params?: { asset_id?: number; limit?: number }) => 
  api.get<Transaction[]>('/transactions', { params }).then(r => r.data);
export const createTransaction = (data: Partial<Transaction>) => 
  api.post<Transaction>('/transactions', data).then(r => r.data);
export const deleteTransaction = (id: number) => 
  api.delete(`/transactions/${id}`).catch((err: unknown) => {
    console.error('Failed to delete transaction:', err);
    throw err;
  });

// Accounts
export const getAccounts = () => api.get<Account[]>('/accounts').then(r => r.data);
export const createAccount = (data: Partial<Account>) => api.post<Account>('/accounts', data).then(r => r.data);
