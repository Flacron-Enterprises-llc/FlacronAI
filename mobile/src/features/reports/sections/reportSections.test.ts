import { parseReportSections, replaceSectionBody, serializeReportSections } from './reportSections';

describe('report sections (port of web reportSections.js)', () => {
  it('splits on headings with an Introduction preamble and round-trips', () => {
    const md = 'Prepared for review.\n\n# REPORT\n\n## 1. Summary\nLine one\n\n## 2. Findings\nMay show staining.';
    const s = parseReportSections(md);
    expect(s.map((x) => [x.id, x.level, x.title])).toEqual([
      ['preamble', 0, 'Introduction'],
      ['section-1', 1, 'REPORT'],
      ['section-2', 2, '1. Summary'],
      ['section-3', 2, '2. Findings'],
    ]);
    expect(serializeReportSections(s)).toBe('Prepared for review.\n\n# REPORT\n\n## 1. Summary\n\nLine one\n\n## 2. Findings\n\nMay show staining.');
  });

  it('wraps heading-less content as "Report Content" and replaces one section body', () => {
    expect(parseReportSections('plain')).toEqual([{ id: 'section-1', level: 2, title: 'Report Content', body: 'plain' }]);
    expect(replaceSectionBody('## A\nold\n\n## B\nkeep', 'section-1', 'new')).toBe('## A\n\nnew\n\n## B\n\nkeep');
  });
});
