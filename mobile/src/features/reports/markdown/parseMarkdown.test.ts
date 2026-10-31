import { parseInline, parseMarkdown } from './parseMarkdown';

describe('parseMarkdown', () => {
  it('parses headings, paragraphs, lists, quotes, rules and tables', () => {
    const md = [
      '# INSPECTION REPORT',
      '## 1. Executive Summary',
      'Visible conditions appear consistent',
      'with water intrusion.',
      '',
      '- First item',
      '- Second item',
      '  continued',
      '1. Step one',
      '2. Step two',
      '> A qualified professional should confirm.',
      '---',
      '| Item | Qty |',
      '|------|----:|',
      '| Drywall | 12 |',
    ].join('\n');
    expect(parseMarkdown(md)).toEqual([
      { type: 'heading', level: 1, text: 'INSPECTION REPORT' },
      { type: 'heading', level: 2, text: '1. Executive Summary' },
      { type: 'paragraph', text: 'Visible conditions appear consistent with water intrusion.' },
      { type: 'list', ordered: false, items: ['First item', 'Second item continued'] },
      { type: 'list', ordered: true, items: ['Step one', 'Step two'] },
      { type: 'quote', text: 'A qualified professional should confirm.' },
      { type: 'hr' },
      { type: 'table', header: ['Item', 'Qty'], rows: [['Drywall', '12']] },
    ]);
  });

  it('keeps plain text and handles empty input', () => {
    expect(parseMarkdown('Just text')).toEqual([{ type: 'paragraph', text: 'Just text' }]);
    expect(parseMarkdown(null)).toEqual([]);
  });

  it('caps heading depth at 4 and reads fenced code verbatim', () => {
    expect(parseMarkdown('###### Deep')).toEqual([{ type: 'heading', level: 4, text: 'Deep' }]);
    expect(parseMarkdown('```\n# not a heading\n```')).toEqual([{ type: 'code', text: '# not a heading' }]);
  });
});

describe('parseInline', () => {
  it('splits bold, italic and code spans', () => {
    expect(parseInline('A **bold** and *soft* `id` end')).toEqual([
      { text: 'A ' },
      { text: 'bold', bold: true },
      { text: ' and ' },
      { text: 'soft', italic: true },
      { text: ' ' },
      { text: 'id', code: true },
      { text: ' end' },
    ]);
  });

  it('leaves unmatched markers and arithmetic alone', () => {
    expect(parseInline('2 * 3 = 6')).toEqual([{ text: '2 * 3 = 6' }]);
    expect(parseInline('**open')).toEqual([{ text: '**open' }]);
  });
});
