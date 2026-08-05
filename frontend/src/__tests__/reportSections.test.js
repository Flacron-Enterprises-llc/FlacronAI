import { describe, expect, it } from 'vitest';
import { parseReportSections, serializeReportSections } from '../utils/reportSections';

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
