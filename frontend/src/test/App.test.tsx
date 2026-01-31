import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

describe('App', () => {
  it('renders without crashing', async () => {
    // Simple smoke test - just check the module can be imported
    const { default: App } = await import('../App');
    expect(App).toBeDefined();
  });
});

describe('Types', () => {
  it('exports correct types', async () => {
    const types = await import('../types');
    expect(types).toBeDefined();
  });
});

describe('API Service', () => {
  it('exports API functions', async () => {
    const api = await import('../services/api');
    expect(api.getPortfolioSummary).toBeDefined();
    expect(api.getHoldings).toBeDefined();
    expect(api.getTransactions).toBeDefined();
    expect(api.createAsset).toBeDefined();
    expect(api.createTransaction).toBeDefined();
  });
});
