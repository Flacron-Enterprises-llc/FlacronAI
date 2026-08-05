import { describe, it, expect } from 'vitest';
import viteConfig from '../../vite.config.js';

describe('vite config', () => {
  it('serves the dev app on port 5173', () => {
    expect(viteConfig.server.port).toBe(5173);
  });

  it('proxies /api to the backend on port 3000', () => {
    expect(viteConfig.server.proxy['/api'].target).toBe('http://localhost:3000');
    expect(viteConfig.server.proxy['/api'].changeOrigin).toBe(true);
  });
});
