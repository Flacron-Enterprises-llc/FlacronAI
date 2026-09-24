import { describe, it, expect } from 'vitest';
import { injectSection3PropertyBlock } from '../utils/propertyIntelligenceContent';

// Phase 47. Pure splice-algorithm tests -- mirrors
// backend/utils/propertyIntelligenceContent.js's own injectSection3PropertyBlock
// test coverage; the actual field FORMATTING is server-computed
// (`report.propertySection3Markdown`), so only the generic splice logic is
// duplicated here, same architecture as canonicalEstimateContent.test.js's
// own coverage of injectSection7Detail.

const SAMPLE_CONTENT = [
  '## SECTION 3: PROPERTY INFO',
  'Existing narrative about the property.',
  '',
  '## SECTION 4: INSPECTION DETAILS & OVERVIEW',
  'Loss narrative.',
].join('\n');

describe('injectSection3PropertyBlock', () => {
  it('no-op when there is nothing to inject', () => {
    expect(injectSection3PropertyBlock(SAMPLE_CONTENT, '')).toBe(SAMPLE_CONTENT);
  });

  it('no-op when there is no SECTION 3 heading', () => {
    const noSection3 = '## SECTION 1: X\nsomething';
    expect(injectSection3PropertyBlock(noSection3, '### Confirmed Property Details')).toBe(noSection3);
  });

  it('appends beneath the existing Section 3 narrative, never replacing it', () => {
    const result = injectSection3PropertyBlock(SAMPLE_CONTENT, '### Confirmed Property Details\n| Year Built | 1998 |');
    expect(result).toContain('Existing narrative about the property.');
    expect(result).toContain('Confirmed Property Details');
    const narrativeIdx = result.indexOf('Existing narrative');
    const blockIdx = result.indexOf('Confirmed Property Details');
    const sec4Idx = result.indexOf('## SECTION 4');
    expect(narrativeIdx).toBeLessThan(blockIdx);
    expect(blockIdx).toBeLessThan(sec4Idx);
  });

  it('preserves Section 4+ byte-for-byte', () => {
    const result = injectSection3PropertyBlock(SAMPLE_CONTENT, '### Confirmed Property Details\nfoo');
    expect(result).toContain('## SECTION 4: INSPECTION DETAILS & OVERVIEW\nLoss narrative.');
  });

  it('is idempotent against the same original content (never duplicates)', () => {
    const block = '### Confirmed Property Details\nfoo';
    const once = injectSection3PropertyBlock(SAMPLE_CONTENT, block);
    const again = injectSection3PropertyBlock(SAMPLE_CONTENT, block);
    expect(once).toBe(again);
    expect((once.match(/Confirmed Property Details/g) || []).length).toBe(1);
  });
});
