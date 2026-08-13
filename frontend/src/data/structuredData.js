// schema.org JSON-LD builders (T-1.14). Only factual, verifiable data.
import { PLAN_PRICING } from './plans.js';

const SITE_URL = 'https://flacronai.com';

export const ORGANIZATION_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'FlacronAI',
  url: SITE_URL,
  logo: `${SITE_URL}/logo-mark.png`,
  description:
    'FlacronAI is an automated platform that drafts professional insurance inspection reports for adjusters to review and approve.',
  parentOrganization: { '@type': 'Organization', name: 'Flacron Enterprises LLC' },
  sameAs: [
    'https://www.instagram.com/flacronenterprisesllc/',
    'https://www.linkedin.com/company/flacronenterprisesllc/',
    'https://www.facebook.com/people/Flacron-Enterprises/61579538447653/',
    'https://www.tiktok.com/@flacronenterprises',
    'https://x.com/flacron14958',
    'https://www.youtube.com/channel/UC09l7Vh-7D-7xQcNT002YGw',
  ],
};

// Pricing as a SoftwareApplication with an AggregateOffer — prices from the
// single source of truth (data/plans.js), so this never drifts from the UI.
const PLAN_NAMES = { starter: 'Starter', professional: 'Professional', agency: 'Agency', enterprise: 'Enterprise' };
const monthlies = Object.keys(PLAN_NAMES).map((id) => PLAN_PRICING[id].monthly);

export const PRODUCT_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'FlacronAI',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  url: `${SITE_URL}/pricing`,
  description:
    'Automated insurance inspection report drafting with PDF, DOCX and HTML export, photo analysis, CRM, API access, and white-label options.',
  offers: {
    '@type': 'AggregateOffer',
    priceCurrency: 'USD',
    lowPrice: String(Math.min(...monthlies)),
    highPrice: String(Math.max(...monthlies)),
    offerCount: String(Object.keys(PLAN_NAMES).length),
    offers: Object.entries(PLAN_NAMES).map(([id, name]) => ({
      '@type': 'Offer',
      name,
      price: String(PLAN_PRICING[id].monthly),
      priceCurrency: 'USD',
      url: `${SITE_URL}/pricing`,
    })),
  },
};

// Build a FAQPage schema from a [{ q, a }] list (answer stripped of any markup).
export const buildFaqJsonLd = (faqs) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map(({ q, a }) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a },
  })),
});
