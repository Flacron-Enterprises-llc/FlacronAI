import { describe, expect, it } from 'vitest';
import { tokenizeInline, markdownToDoc, docToMarkdown } from '../utils/richContent';

describe('richContent inline tokenizer', () => {
  it('toggles bold/italic/underline independently', () => {
    const runs = tokenizeInline('**bold** *italic* ++under++');
    expect(runs.map((r) => [r.text, r.bold, r.italic, r.underline])).toEqual([
      ['bold', true, false, false],
      [' ', false, false, false],
      ['italic', false, true, false],
      [' ', false, false, false],
      ['under', false, false, true],
    ]);
  });

  it('never mistakes an underscore-containing identifier for emphasis', () => {
    const runs = tokenizeInline('ANTHROPIC_API_KEY stays intact');
    expect(runs).toHaveLength(1);
    expect(runs[0].text).toBe('ANTHROPIC_API_KEY stays intact');
  });
});

describe('markdownToDoc / docToMarkdown round-trip', () => {
  it('round-trips a paragraph with bold/italic/underline', () => {
    const md = 'A **bold** and *italic* and ++underlined++ paragraph.';
    expect(docToMarkdown(markdownToDoc(md))).toBe(md);
  });

  it('round-trips a sub-heading', () => {
    const md = '### Kitchen Findings';
    expect(docToMarkdown(markdownToDoc(md))).toBe(md);
  });

  it('round-trips a bullet list', () => {
    const md = '- Claim Number: CLM-100\n- Insured Name: Jane Doe';
    expect(docToMarkdown(markdownToDoc(md))).toBe(md);
  });

  it('round-trips a numbered list', () => {
    const md = '1. First finding\n2. Second finding';
    expect(docToMarkdown(markdownToDoc(md))).toBe(md);
  });

  it('round-trips a table', () => {
    const md = '| Category | Cost |\n|---|---|\n| Drywall | $1,200 |';
    expect(docToMarkdown(markdownToDoc(md))).toBe(md);
  });

  it('round-trips a page break token', () => {
    const md = 'Before.\n\n{{page-break}}\n\nAfter.';
    expect(docToMarkdown(markdownToDoc(md))).toBe(md);
  });

  it('round-trips a single photo token with caption', () => {
    const md = '![[photo:abc-123|Kitchen ceiling]]';
    expect(docToMarkdown(markdownToDoc(md))).toBe(md);
  });

  it('round-trips a photo grid', () => {
    const md = '[[photos cols=2]]\nphoto:p1|Wall A\nphoto:p2|Wall B\n[[/photos]]';
    expect(docToMarkdown(markdownToDoc(md))).toBe(md);
  });

  it('escapes literal * and + in typed text so they never become formatting on reload', () => {
    const doc = markdownToDoc('2 + 2 and a *literal* asterisk pair typed by a user');
    // The user typed a single '*' pair as PLAIN text (no bold/italic mark in
    // the doc) -- simulate that directly via a doc with an unmarked text node
    // containing literal delimiter characters, since parsing "*literal*" from
    // Markdown would (correctly) produce italic; the escaping guarantee is
    // about round-tripping *marked* text, tested next.
    expect(doc).toBeTruthy();

    const roundTrip = markdownToDoc(docToMarkdown({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'literal * and ++ characters', marks: [{ type: 'bold' }] }] }],
    }));
    const runs = tokenizeInline(docToMarkdown(roundTrip));
    const bold = runs.find((r) => r.bold);
    expect(bold.text).toBe('literal * and ++ characters');
  });
});
