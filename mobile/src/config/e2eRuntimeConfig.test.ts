import { isE2ERuntimeConfigEnabled, parseE2EConfigUrl } from './e2eRuntimeConfig';
import { redirectSystemPath } from '../../app/+native-intent';

describe('e2e launch-time config (test build only)', () => {
  it('is enabled only for development builds that carry the e2e flag', () => {
    expect(isE2ERuntimeConfigEnabled('development', '1')).toBe(true);
    expect(isE2ERuntimeConfigEnabled('development', undefined)).toBe(false);
    expect(isE2ERuntimeConfigEnabled('development', 'true')).toBe(false);
    expect(isE2ERuntimeConfigEnabled('preview', '1')).toBe(false);
    expect(isE2ERuntimeConfigEnabled('production', '1')).toBe(false);
  });

  it('parses only the exact config link with two HTTPS origins', () => {
    expect(
      parseE2EConfigUrl('flacronai://e2e-config?api=https%3A%2F%2Fa-b.trycloudflare.com%2Fx&auth=https%3A%2F%2Fc-d.trycloudflare.com')
    ).toEqual({ apiOrigin: 'https://a-b.trycloudflare.com', authEmulatorOrigin: 'https://c-d.trycloudflare.com' });
    expect(parseE2EConfigUrl('flacronai://e2e-config?api=http%3A%2F%2Fa.com&auth=https%3A%2F%2Fb.com')).toBeNull();
    expect(parseE2EConfigUrl('flacronai://e2e-config?api=https%3A%2F%2Fa.com')).toBeNull();
    expect(parseE2EConfigUrl('flacronai://report/123?api=https%3A%2F%2Fa.com&auth=https%3A%2F%2Fb.com')).toBeNull();
    expect(parseE2EConfigUrl('https://e2e-config?api=https%3A%2F%2Fa.com&auth=https%3A%2F%2Fb.com')).toBeNull();
    expect(parseE2EConfigUrl(null)).toBeNull();
    expect(parseE2EConfigUrl('not a url')).toBeNull();
  });

  it('router rewrite: config link opens the start route; other links unchanged', () => {
    expect(redirectSystemPath({ path: 'flacronai://e2e-config?api=x&auth=y', initial: true })).toBe('/');
    expect(redirectSystemPath({ path: '/e2e-config?api=x', initial: true })).toBe('/');
    expect(redirectSystemPath({ path: 'flacronai://report/abc', initial: true })).toBe('flacronai://report/abc');
    expect(redirectSystemPath({ path: '/dashboard', initial: false })).toBe('/dashboard');
  });
});
