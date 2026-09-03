import { describe, expect, it } from 'vitest';
import { parseReportSections, serializeReportSections, slugifySectionTitle } from '../utils/reportSections';

describe('report section parsing', () => {
  it('round-trips headings, nested headings, and body content', () => {
    const content = '# Inspection Report\n\nIntro text\n\n## Executive Summary\n\nVisible conditions require review.\n\n### Photos\n\nNo photos provided.';
    expect(serializeReportSections(parseReportSections(content))).toBe(content);
  });

  it('keeps legacy heading-free content editable', () => {
    const sections = parseReportSections('Legacy report text');
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe('Report Content');
    expect(serializeReportSections(sections)).toBe('## Report Content\n\nLegacy report text');
  });

  // Regression coverage for Issue 8 (Review & Edit Report losing sections on
  // reopen): the root cause was the editor being fed the 300-char list-view
  // preview (GET /api/reports) instead of the full report (GET
  // /api/reports/:id). This pins exactly what that failure mode looks like
  // once it reaches the parser, so a future regression is easy to recognize.
  it('demonstrates why a truncated list-preview must never reach the editor', () => {
    const full =
      '# Claim Info & Insured Info\n\nJane Doe, 123 Main St.\n\n' +
      '## Property Info\n\nSingle-family residence.\n\n' +
      '## Inspection Details & Overview\n\nRoof and exterior inspected on-site.\n\n' +
      '## Area Observations\n\nVisible shingle displacement on the north slope.\n\n' +
      '## Photo Documentation\n\n1. Exterior — Roof: visible displacement.\n\n' +
      '## Additional Notes\n\nNone.';
    const fullSections = parseReportSections(full);
    expect(fullSections).toHaveLength(6);

    // Simulate the list endpoint's 300-char preview (backend/utils/reportSummary.js).
    const truncated = `${full.substring(0, 300)}...`;
    const truncatedSections = parseReportSections(truncated);

    expect(truncatedSections.length).toBeLessThan(fullSections.length);
    // The last visible section is cut mid-sentence, not the clean body the
    // full report actually has -- exactly the "blank/incorrectly named
    // section" QA observed.
    expect(truncatedSections.at(-1).body).not.toBe(fullSections.at(-1).body);
  });

  it('round-trips a full multi-section report identically to what a PDF export would render', () => {
    const full =
      '## Report Info\n\nClaim #12345\n\n' +
      '## Section 7: Photo Documentation\n\nPer-photo observations reviewed.\n\n' +
      '## Preliminary Estimated Costs (For Planning & Review Only)\n\nSubject to further review.';
    const sections = parseReportSections(full);
    expect(sections.map((s) => s.title)).toEqual([
      'Report Info',
      'Section 7: Photo Documentation',
      'Preliminary Estimated Costs (For Planning & Review Only)',
    ]);
    expect(serializeReportSections(sections)).toBe(full);
  });
});

describe('slugifySectionTitle (Phase 19 comment anchoring)', () => {
  it('is stable across reordering -- same title always produces the same slug', () => {
    const content = '# Report\n\nIntro\n\n## Roof Damage\n\nA\n\n## Exterior Walls\n\nB';
    const reordered = '# Report\n\nIntro\n\n## Exterior Walls\n\nB\n\n## Roof Damage\n\nA';
    const before = parseReportSections(content).find((s) => s.title === 'Roof Damage');
    const after = parseReportSections(reordered).find((s) => s.title === 'Roof Damage');
    expect(slugifySectionTitle(before.title)).toBe(slugifySectionTitle(after.title));
  });

  it('lowercases, strips punctuation, and falls back to "general"', () => {
    expect(slugifySectionTitle('Roof & Gutter Damage')).toBe('roof-gutter-damage');
    expect(slugifySectionTitle('')).toBe('general');
    expect(slugifySectionTitle(undefined)).toBe('general');
  });
});
