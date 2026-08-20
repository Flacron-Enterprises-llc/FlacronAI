// Phase 9 (Report Editor Rich-Text & AI Panel Upgrade): shared helpers for the
// extended-Markdown dialect the rich-text editor persists report section
// content as. `report.content` stays a single Markdown string (unchanged
// Firestore field/shape -- legacy reports, version history, PUT/approve/export
// all keep working with zero schema change); this module is what teaches the
// export generators (PDF/DOCX/HTML) to understand the small set of new tokens
// the editor can produce, on top of the existing `##`/`###`/`- `/`|...|` syntax
// already handled inline in properPdfGenerator.js/documentGenerator.js.
//
// Dialect additions (on top of the pre-existing heading/bullet/table/`---`
// syntax those two generators already parse themselves):
//   **bold**        -- unchanged
//   *italic*        -- unchanged (single asterisk; `**` is always checked first
//                       so it's never mistaken for two nested italics)
//   ++underline++   -- new (deliberately not `_..._`: a bare underscore inside
//                       a word -- e.g. a filename or an env var name like
//                       ANTHROPIC_API_KEY -- would otherwise misfire without a
//                       full CommonMark flanking-rule implementation)
//   1. item         -- numbered list (new; bullets remain `- `/`* `)
//   {{page-break}}  -- forces a new page in PDF/DOCX; a visible divider in HTML/editor
//   ![[photo:ID|Caption]]                 -- a single photo reference
//   [[photos cols=N]] / photo:ID|Caption (repeated) / [[/photos]] -- a photo grid
// Photo tokens only ever reference a photoId that already belongs to the
// report's own `photos` array (or a legacy `legacy-N` synthetic id) -- never a
// client-supplied URL, so there is no arbitrary-image / SSRF / src-injection
// surface at all.

const PAGE_BREAK_TOKEN = '{{page-break}}';
const PHOTO_LINE_RE = /^!\[\[photo:([\w-]+)(?:\|(.*))?\]\]$/;
const GRID_OPEN_RE = /^\[\[photos\s+cols=(\d+)\]\]$/;
const GRID_ITEM_RE = /^photo:([\w-]+)(?:\|(.*))?$/;
const GRID_CLOSE_RE = /^\[\[\/photos\]\]$/;
const NUMBERED_ITEM_RE = /^(\d{1,3})\.\s+(.*)$/;

// Independent-toggle inline scanner (Phase 9). Each delimiter is unambiguous
// (no shared prefix), so a single linear pass with 3 boolean flags correctly
// handles any nesting/order/combination without a recursive parser.
const tokenizeInline = (line) => {
  const runs = [];
  let buf = '';
  let bold = false;
  let italic = false;
  let underline = false;
  const flush = () => {
    if (buf) runs.push({ text: buf, bold, italic, underline });
    buf = '';
  };
  const s = String(line || '');
  let i = 0;
  while (i < s.length) {
    // Backslash-escaped delimiter -- the editor's serializer escapes any
    // literal `*`/`+` in a run's own typed text so round-tripping through
    // Markdown never misinterprets user content as formatting.
    if (s[i] === '\\' && (s[i + 1] === '*' || s[i + 1] === '+')) {
      buf += s[i + 1];
      i += 2;
      continue;
    }
    if (s.startsWith('**', i)) {
      flush();
      bold = !bold;
      i += 2;
      continue;
    }
    if (s.startsWith('++', i)) {
      flush();
      underline = !underline;
      i += 2;
      continue;
    }
    if (s[i] === '*') {
      flush();
      italic = !italic;
      i += 1;
      continue;
    }
    buf += s[i];
    i += 1;
  }
  flush();
  return runs;
};

// Strips inline delimiters to get plain text (used anywhere we only need the
// visible text, e.g. computing wrapped-text heights before drawing).
const stripInline = (line) =>
  tokenizeInline(line)
    .map((r) => r.text)
    .join('');

// Parses a single line as one of the new block-level tokens. Returns null if
// the line isn't one of these (caller falls through to existing heading/
// bullet/table/hr handling).
const parseBlockToken = (line) => {
  const trimmed = String(line || '').trim();
  if (trimmed === PAGE_BREAK_TOKEN) return { type: 'pagebreak' };
  const photoMatch = trimmed.match(PHOTO_LINE_RE);
  if (photoMatch)
    return { type: 'photo', photoId: photoMatch[1], caption: (photoMatch[2] || '').trim() };
  const numberedMatch = trimmed.match(NUMBERED_ITEM_RE);
  if (numberedMatch) return { type: 'numbered', text: numberedMatch[2] };
  const gridOpen = trimmed.match(GRID_OPEN_RE);
  if (gridOpen) {
    const parsed = parseInt(gridOpen[1], 10);
    const cols = Number.isNaN(parsed) ? 2 : Math.max(1, Math.min(4, parsed));
    return { type: 'grid-open', cols };
  }
  if (GRID_CLOSE_RE.test(trimmed)) return { type: 'grid-close' };
  const gridItem = trimmed.match(GRID_ITEM_RE);
  if (gridItem)
    return { type: 'grid-item', photoId: gridItem[1], caption: (gridItem[2] || '').trim() };
  return null;
};

// Walks a section body's lines and groups them into a flat block list the
// exporters can iterate: { type: 'text', line } for anything not recognized
// here (existing heading/bullet/table/hr handling stays in each generator),
// or one of 'pagebreak' | 'photo' | 'numbered' | 'photo-grid'.
const parseContentBlocks = (lines) => {
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const token = parseBlockToken(lines[i]);
    if (token?.type === 'grid-open') {
      const items = [];
      i += 1;
      while (i < lines.length) {
        const inner = parseBlockToken(lines[i]);
        if (inner?.type === 'grid-close') {
          i += 1;
          break;
        }
        if (inner?.type === 'grid-item')
          items.push({ photoId: inner.photoId, caption: inner.caption });
        i += 1;
      }
      blocks.push({ type: 'photo-grid', cols: token.cols, items });
      continue;
    }
    if (token) {
      blocks.push(token);
      i += 1;
      continue;
    }
    blocks.push({ type: 'text', line: lines[i] });
    i += 1;
  }
  return blocks;
};

// Collects every photoId referenced by `![[photo:...]]` / grid tokens in a
// content string, so callers can resolve/download only the referenced photos
// instead of the whole report's photo set.
const collectReferencedPhotoIds = (content) => {
  const ids = new Set();
  String(content || '')
    .split('\n')
    .forEach((line) => {
      const token = parseBlockToken(line);
      if (token?.type === 'photo') ids.add(token.photoId);
      if (token?.type === 'grid-item') ids.add(token.photoId);
    });
  return [...ids];
};

// Defense-in-depth normalization for any `content`/section-body text accepted
// from a client (PUT /:id, /approve, the AI-assist endpoints' inputs). The
// export generators already neutralize hostile text at render time via
// escapeXml/escapeHtml/PDFKit's inherently-textual .text() calls (covered by
// backend/test/exports.test.js's hostile-content fixture, which specifically
// expects a literal "<script>" to survive as inert escaped text, not be
// stripped) -- so this does NOT strip/rewrite arbitrary angle brackets.
// It only bounds size (prevents multi-MB payloads reaching Firestore/the AI
// prompt) and removes control characters that have no legitimate use in
// report text and could otherwise corrupt PDF/DOCX text layout.
const MAX_CONTENT_LENGTH = 300000;
const MAX_INSTRUCTION_LENGTH = 2000;

// Matches C0 control characters except tab (\t, 0x09), newline (\n, 0x0A) and
// carriage return (\r, 0x0D), which are legitimate in report text.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = new RegExp('[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F]', 'g');

const sanitizeReportContent = (text) =>
  String(text ?? '')
    .replace(CONTROL_CHARS_RE, '')
    .slice(0, MAX_CONTENT_LENGTH);

const sanitizeInstructions = (text) =>
  String(text ?? '')
    .replace(CONTROL_CHARS_RE, '')
    .trim()
    .slice(0, MAX_INSTRUCTION_LENGTH);

// Phase 13 (Real Template Builder): deterministically appends a template's own
// custom sections to the end of AI-generated report content. Mirrors Phase 8's
// insertPhotoObservations reasoning -- an LLM prompt hint ("also cover X") is
// only ever probabilistic, so a template's defined structure is guaranteed to
// appear in the output via a plain post-processing append instead, rather than
// trusting the model to reproduce it. Never touches the fixed SECTION 1-9
// skeleton (and its anchors other helpers rely on), so it's safe to call
// unconditionally after generation.
const appendTemplateSections = (content, sections = []) => {
  if (!Array.isArray(sections) || sections.length === 0) return content;
  const rendered = sections
    .filter((s) => s && typeof s.title === 'string' && s.title.trim())
    .map((s) => {
      const body = sanitizeReportContent(s.body || '').trim();
      return `## ${s.title.trim().toUpperCase()}\n${body || '[To be completed by the adjuster]'}`;
    })
    .join('\n\n');
  if (!rendered) return content;
  return `${String(content || '').trimEnd()}\n\n${rendered}`;
};

module.exports = {
  PAGE_BREAK_TOKEN,
  tokenizeInline,
  stripInline,
  parseBlockToken,
  parseContentBlocks,
  collectReferencedPhotoIds,
  sanitizeReportContent,
  sanitizeInstructions,
  appendTemplateSections,
  MAX_CONTENT_LENGTH,
  MAX_INSTRUCTION_LENGTH,
};
