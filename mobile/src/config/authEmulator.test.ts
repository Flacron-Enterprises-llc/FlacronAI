import { resolveAuthEmulatorUrl } from './authEmulator';

describe('resolveAuthEmulatorUrl', () => {
  it('is ignored by preview and production builds, whatever the value', () => {
    expect(resolveAuthEmulatorUrl('preview', 'https://x.trycloudflare.com')).toBeNull();
    expect(resolveAuthEmulatorUrl('production', 'http://localhost:9099')).toBeNull();
  });

  it('development: accepts http(s) and normalizes to origin; rejects junk', () => {
    expect(resolveAuthEmulatorUrl('development', 'https://a-b-c.trycloudflare.com/x')).toBe('https://a-b-c.trycloudflare.com');
    expect(resolveAuthEmulatorUrl('development', 'http://10.0.2.2:9099')).toBe('http://10.0.2.2:9099');
    expect(resolveAuthEmulatorUrl('development', '')).toBeNull();
    expect(resolveAuthEmulatorUrl('development', undefined)).toBeNull();
    expect(resolveAuthEmulatorUrl('development', 'not a url')).toBeNull();
    expect(resolveAuthEmulatorUrl('development', 'ftp://host')).toBeNull();
  });
});
