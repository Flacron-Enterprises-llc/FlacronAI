import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Phase 48 correction. Repository sweep proving the second-source-of-truth
// bug is actually gone: none of the previously-hardcoded marketing surfaces
// still assert a flat, unqualified "100 photos"-style claim, and none of
// them import photoLimits.js as a primary/display source any more (it is
// fallback-only now, consumed exclusively by publicPlanConfigStore.js).
const read = (relPath) => readFileSync(fileURLToPath(new URL(relPath, import.meta.url)), 'utf8');

const MARKETING_FILES = {
  'Home.jsx': '../pages/Home.jsx',
  'Features.jsx': '../pages/Features.jsx',
  'Security.jsx': '../pages/Security.jsx',
  'PhotoAnalysis.jsx': '../pages/PhotoAnalysis.jsx',
  'ApiDocs.jsx': '../pages/ApiDocs.jsx',
  'solutions.js': '../data/solutions.js',
};

// A "flat claim" is a bare tier-agnostic number directly adjacent to
// "photo(s)" with no plan-scoping language -- e.g. "100 photos", "up to 100
// damage photos". This intentionally does NOT flag the two illustrative
// "(example)" batch-visualization counters (Home.jsx/PhotoAnalysis.jsx),
// which are explicitly labeled as a UI mock, not a plan-capacity claim.
const FLAT_CLAIM_PATTERN = /\b\d+\+?\s+(damage\s+|inspection\s+|job-site\s+)?photos?\b/i;

describe('cross-surface photo-copy sweep', () => {
  for (const [name, relPath] of Object.entries(MARKETING_FILES)) {
    it(`${name}: no bare numeric photo-capacity claim outside the labeled illustrative example`, () => {
      const src = read(relPath);
      // Strip the one explicitly-labeled illustrative counter block (if any)
      // before scanning for a real claim -- "(example)" is the marker.
      const withoutExampleBlocks = src.replace(/Photo Batch \(example\)[\s\S]{0,200}/g, '');
      expect(withoutExampleBlocks).not.toMatch(FLAT_CLAIM_PATTERN);
    });

    it(`${name}: no longer imports photoLimits.js as a display source`, () => {
      const src = read(relPath);
      expect(src).not.toMatch(/from ['"](\.\.\/)*data\/photoLimits(\.js)?['"]/);
    });
  }

  it('FAQs.jsx (an exact tier comparison) consumes the live public-plan-config hook, not a static import', () => {
    const src = read('../pages/FAQs.jsx');
    expect(src).toMatch(/usePublicPlanConfig/);
    expect(src).not.toMatch(/from ['"](\.\.\/)*data\/photoLimits(\.js)?['"]/);
  });

  it('Pricing.jsx (the commercial surface) consumes the live public-plan-config hook', () => {
    const src = read('../pages/Pricing.jsx');
    expect(src).toMatch(/usePublicPlanConfig/);
  });

  it('EnterpriseDashboard.jsx no longer hardcodes a static photo-limit label', () => {
    const src = read('../pages/EnterpriseDashboard.jsx');
    expect(src).not.toMatch(/Damage Photos \(up to 100\)/);
    expect(src).not.toMatch(/Damage Photos \(unlimited on Enterprise\)/); // the prior static-only correction
    expect(src).toMatch(/deriveEnterpriseDashboardPhotoLabel|getPhotoCapacity/);
  });

  it('photoLimits.js is documented and used as fallback-only (single authoritative consumer: publicPlanConfigStore.js)', () => {
    const src = read('../data/photoLimits.js');
    expect(src).toMatch(/FALLBACK-ONLY/);
    const storeSrc = read('../utils/publicPlanConfigStore.js');
    expect(storeSrc).toMatch(/from ['"]\.\.\/data\/photoLimits['"]/);
  });

  it('unrelated pricing/entitlement content is untouched -- reports-per-month and subscription prices still present verbatim', () => {
    const pricingSrc = read('../pages/Pricing.jsx');
    expect(pricingSrc).toMatch(/5 reports\/month/);
    expect(pricingSrc).toMatch(/50 reports\/month/);
    expect(pricingSrc).toMatch(/200 reports\/month/);
  });
});
