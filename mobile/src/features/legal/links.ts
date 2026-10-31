/**
 * Phase 8 — the existing, live legal / information pages and support contact. Every URL is a
 * real route in `frontend/src/App.jsx` on the public site (canonical non-www `flacronai.com`),
 * and the support address is the one the web Contact, Privacy and Terms pages publish. No new
 * legal copy is authored in the app (out of scope) — these open the same pages the web shows.
 *
 * Terms of Use / EULA for the App Store is still an open decision (MOBILE_DEVELOPMENT_PHASES.md
 * §10 item 23): the app links the existing Terms of Service and does not present it as Apple's
 * standard EULA.
 */
import { Linking } from 'react-native';

const SITE = 'https://flacronai.com';

export const LEGAL_LINKS = {
  terms: `${SITE}/terms-of-service`,
  privacy: `${SITE}/privacy-policy`,
  acceptableUse: `${SITE}/acceptable-use-policy`,
  refund: `${SITE}/refund-policy`,
  cookies: `${SITE}/cookies-policy`,
  security: `${SITE}/security`,
} as const;

export const INFO_LINKS = {
  about: `${SITE}/about`,
  faqs: `${SITE}/faqs`,
  contact: `${SITE}/contact`,
} as const;

export const SUPPORT_EMAIL = 'support@flacronenterprises.com';

export interface LinkItem {
  key: string;
  label: string;
  url: string;
}

export const LEGAL_ITEMS: LinkItem[] = [
  { key: 'privacy', label: 'Privacy Policy', url: LEGAL_LINKS.privacy },
  { key: 'terms', label: 'Terms of Service', url: LEGAL_LINKS.terms },
  { key: 'acceptableUse', label: 'Acceptable Use Policy', url: LEGAL_LINKS.acceptableUse },
  { key: 'refund', label: 'Refund Policy', url: LEGAL_LINKS.refund },
  { key: 'cookies', label: 'Cookies Policy', url: LEGAL_LINKS.cookies },
  { key: 'security', label: 'Security', url: LEGAL_LINKS.security },
];

export const INFO_ITEMS: LinkItem[] = [
  { key: 'about', label: 'About FlacronAI', url: INFO_LINKS.about },
  { key: 'faqs', label: 'FAQs', url: INFO_LINKS.faqs },
  { key: 'contact', label: 'Contact form', url: INFO_LINKS.contact },
];

export const supportMailto = (subject = 'FlacronAI app support') =>
  `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;

export type OpenLinkResult = 'opened' | 'failed';

/**
 * Opens an external link; never throws. On failure the caller shows the URL / address so the
 * user can still reach it (no email app configured, no browser, etc.).
 */
export async function openExternal(url: string, opener: (u: string) => Promise<unknown> = (u) => Linking.openURL(u)): Promise<OpenLinkResult> {
  try {
    await opener(url);
    return 'opened';
  } catch {
    return 'failed';
  }
}
