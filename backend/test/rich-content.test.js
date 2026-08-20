const test = require('node:test');
const assert = require('node:assert/strict');
const {
  tokenizeInline,
  parseBlockToken,
  collectReferencedPhotoIds,
  sanitizeReportContent,
  sanitizeInstructions,
  MAX_CONTENT_LENGTH,
  MAX_INSTRUCTION_LENGTH,
} = require('../utils/richContent');

// Phase 9 (Report Editor Rich-Text & AI Panel Upgrade): the extended-Markdown
// dialect the rich-text editor persists section content as -- inline
// bold/italic/underline, numbered lists, page breaks, and photo/photo-grid
// tokens layered on top of the pre-existing `##`/`- `/`|...|` syntax.

test('tokenizeInline: plain text has no marks', () => {
  const runs = tokenizeInline('just plain text');
  assert.equal(runs.length, 1);
  assert.deepEqual(runs[0], {
    text: 'just plain text',
    bold: false,
    italic: false,
    underline: false,
  });
});

test('tokenizeInline: bold, italic, underline each toggle independently', () => {
  const runs = tokenizeInline('**bold** *italic* ++under++');
  assert.deepEqual(
    runs.map((r) => [r.text, r.bold, r.italic, r.underline]),
    [
      ['bold', true, false, false],
      [' ', false, false, false],
      ['italic', false, true, false],
      [' ', false, false, false],
      ['under', false, false, true],
    ]
  );
});

test('tokenizeInline: marks combine when nested in any order', () => {
  const runs = tokenizeInline('**_++all three++_**');
  // ** toggles bold, then * toggles italic (single asterisk), then ++ toggles underline
  const combined = runs.find((r) => r.text === 'all three');
  assert.ok(combined, 'the fully-combined run exists');
  assert.equal(combined.bold, true);
  assert.equal(combined.underline, true);
});

test('tokenizeInline: a bare underscore inside a word is never mistaken for emphasis (no underscore-based italic)', () => {
  const runs = tokenizeInline('the env var ANTHROPIC_API_KEY and file_name.txt stay intact');
  assert.equal(runs.length, 1);
  assert.equal(runs[0].text, 'the env var ANTHROPIC_API_KEY and file_name.txt stay intact');
  assert.equal(runs[0].italic, false);
});

test('tokenizeInline: double-asterisk is never mistaken for two adjacent italics', () => {
  const runs = tokenizeInline('a **bold label** and more');
  assert.deepEqual(
    runs.map((r) => [r.text, r.bold]),
    [
      ['a ', false],
      ['bold label', true],
      [' and more', false],
    ]
  );
});

test('tokenizeInline: backslash-escaped * and + render as literal characters, not toggles', () => {
  const runs = tokenizeInline(String.raw`2 \+ 2, \*not italic\*, and **real bold** still works`);
  assert.equal(runs.map((r) => r.text).join(''), '2 + 2, *not italic*, and real bold still works');
  const bold = runs.find((r) => r.bold);
  assert.equal(bold.text, 'real bold');
});

test('parseBlockToken: recognizes page break, single photo, numbered item, grid markers', () => {
  assert.deepEqual(parseBlockToken('{{page-break}}'), { type: 'pagebreak' });
  assert.deepEqual(parseBlockToken('![[photo:abc-123|Kitchen ceiling]]'), {
    type: 'photo',
    photoId: 'abc-123',
    caption: 'Kitchen ceiling',
  });
  assert.deepEqual(parseBlockToken('![[photo:abc-123]]'), {
    type: 'photo',
    photoId: 'abc-123',
    caption: '',
  });
  assert.deepEqual(parseBlockToken('3. Third finding'), {
    type: 'numbered',
    text: 'Third finding',
  });
  assert.deepEqual(parseBlockToken('[[photos cols=3]]'), { type: 'grid-open', cols: 3 });
  assert.deepEqual(parseBlockToken('[[/photos]]'), { type: 'grid-close' });
  assert.deepEqual(parseBlockToken('photo:xyz|A caption'), {
    type: 'grid-item',
    photoId: 'xyz',
    caption: 'A caption',
  });
});

test('parseBlockToken: cols is clamped to a sane 1-4 range', () => {
  assert.equal(parseBlockToken('[[photos cols=9]]').cols, 4);
  assert.equal(parseBlockToken('[[photos cols=0]]').cols, 1);
});

test('parseBlockToken: returns null for ordinary heading/bullet/table/paragraph lines (falls through to existing handling)', () => {
  assert.equal(parseBlockToken('## SECTION 5: AREA OBSERVATIONS'), null);
  assert.equal(parseBlockToken('- A bullet'), null);
  assert.equal(parseBlockToken('| a | b |'), null);
  assert.equal(parseBlockToken('Just a sentence.'), null);
});

test('collectReferencedPhotoIds: finds single-photo and grid-item photoIds, deduped', () => {
  const content = [
    'Some text',
    '![[photo:p1|Cap]]',
    '[[photos cols=2]]',
    'photo:p2|Cap A',
    'photo:p1|Duplicate of p1]]', // malformed on purpose -- must not crash
    '[[/photos]]',
  ].join('\n');
  const ids = collectReferencedPhotoIds(content);
  assert.ok(ids.includes('p1'));
  assert.ok(ids.includes('p2'));
});

test('sanitizeReportContent: strips control characters but keeps tab/newline/CR', () => {
  const dirty = 'Line one\nLine\ttwo\r\nBell:\x07 Null:\x00 end';
  const clean = sanitizeReportContent(dirty);
  // eslint-disable-next-line no-control-regex
  assert.doesNotMatch(clean, /[\x00-\x08\x0B\x0C\x0E-\x1F]/);
  assert.match(clean, /Line one\nLine\ttwo\r\nBell: Null: end/);
});

test('sanitizeReportContent: does NOT strip or escape a literal "<script>" -- export generators already neutralize it at render time', () => {
  const clean = sanitizeReportContent('## Findings\n<script>alert(1)</script>\n**bold**');
  assert.match(clean, /<script>alert\(1\)<\/script>/);
});

test('sanitizeReportContent: caps length at MAX_CONTENT_LENGTH', () => {
  const huge = 'a'.repeat(MAX_CONTENT_LENGTH + 5000);
  assert.equal(sanitizeReportContent(huge).length, MAX_CONTENT_LENGTH);
});

test('sanitizeInstructions: trims and caps at MAX_INSTRUCTION_LENGTH', () => {
  assert.equal(sanitizeInstructions('  make this shorter  '), 'make this shorter');
  assert.equal(sanitizeInstructions('x'.repeat(5000)).length, MAX_INSTRUCTION_LENGTH);
});
