import { describe, it, expect } from 'vitest';
import { getConfig } from '../utils/config.js';

describe('Config Utility', () => {
  it('should load config', () => {
    const config = getConfig();
    
    expect(config).toHaveProperty('cache');
    expect(config).toHaveProperty('api');
    expect(config.cache).toHaveProperty('ttl');
    expect(config.api).toHaveProperty('port');
  });

  it('should have cache TTL value', () => {
    const config = getConfig();
    expect(typeof config.cache.ttl).toBe('number');
    expect(config.cache.ttl).toBeGreaterThan(0);
  });

  it('should have API port value', () => {
    const config = getConfig();
    expect(typeof config.api.port).toBe('number');
    expect(config.api.port).toBeGreaterThan(0);
  });
});
