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
