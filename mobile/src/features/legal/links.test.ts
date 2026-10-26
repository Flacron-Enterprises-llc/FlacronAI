import { INFO_ITEMS, LEGAL_ITEMS, LEGAL_LINKS, openExternal, SUPPORT_EMAIL, supportMailto } from './links';
import { LEGAL_LINKS as BILLING_LEGAL_LINKS } from '@/features/billing/legalLinks';

describe('legal & support links', () => {
  it('every link is an existing public page on the canonical site (no invented URLs)', () => {
    const routes = [...LEGAL_ITEMS, ...INFO_ITEMS].map((i) => new URL(i.url));
    for (const u of routes) {
      expect(u.protocol).toBe('https:');
      expect(u.host).toBe('flacronai.com');
    }
    // Same routes as frontend/src/App.jsx.
    expect(routes.map((u) => u.pathname).sort()).toEqual(
      ['/about', '/acceptable-use-policy', '/contact', '/cookies-policy', '/faqs', '/privacy-policy', '/refund-policy', '/security', '/terms-of-service'].sort()
    );
  });

  it('support uses the published support address', () => {
    expect(SUPPORT_EMAIL).toBe('support@flacronenterprises.com');
    expect(supportMailto()).toMatch(/^mailto:support@flacronenterprises\.com\?subject=/);
  });

  it('subscription disclosures reuse the same legal links', () => {
    expect(BILLING_LEGAL_LINKS).toBe(LEGAL_LINKS);
  });

  it('a link that cannot be opened fails gracefully instead of throwing', async () => {
    await expect(openExternal('mailto:x@example.com', () => Promise.reject(new Error('no mail app')))).resolves.toBe('failed');
    await expect(openExternal(LEGAL_LINKS.privacy, () => Promise.resolve(true))).resolves.toBe('opened');
  });
});
