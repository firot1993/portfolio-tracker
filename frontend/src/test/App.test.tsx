import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

// Mock the API calls
vi.mock('../services/api', () => ({
  getPortfolioSummary: vi.fn().mockResolvedValue({
    totalValueUSD: 10000,
    totalCostUSD: 8000,
    totalPnL: 2000,
    totalPnLPercent: 25,
    allocation: { crypto: 5000, stock_us: 3000, stock_cn: 1500, gold: 500 },
    allocationPercent: { crypto: 50, stock_us: 30, stock_cn: 15, gold: 5 },
    holdings: [
      { symbol: 'BTC', name: 'Bitcoin', type: 'crypto', quantity: 0.1, currentPrice: 50000, valueUSD: 5000, costUSD: 4000, pnl: 1000, pnlPercent: 25 },
    ],
    usdcny: 7.2,
  }),
  getTransactions: vi.fn().mockResolvedValue([
    { id: 1, asset_symbol: 'BTC', type: 'buy', quantity: 0.1, price: 40000, date: '2024-01-01' },
  ]),
  getAssets: vi.fn().mockResolvedValue([
    { id: 1, symbol: 'BTC', name: 'Bitcoin', type: 'crypto' },
  ]),
}));

describe('App', () => {
  it('renders the app title', async () => {
    render(<App />);
    
    // Wait for loading to finish
    const title = await screen.findByText(/Portfolio Tracker/i);
    expect(title).toBeInTheDocument();
  });

  it('shows total value after loading', async () => {
    render(<App />);
    
    const totalValue = await screen.findByText(/\$10,000\.00/);
    expect(totalValue).toBeInTheDocument();
  });

  it('displays holdings table', async () => {
    render(<App />);
    
    const btc = await screen.findByText('BTC');
    expect(btc).toBeInTheDocument();
  });
});
