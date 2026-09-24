// Phase 47 (Property Intelligence: RealtyAPI U.S. Adapter & Report
// Integration). Frontend mirror of the tiny, generic splice algorithm in
// `backend/utils/propertyIntelligenceContent.js`'s `injectSection3PropertyBlock`
// -- same architecture decision as `injectSection7Detail`'s own frontend
// mirror (canonicalEstimateContent.js): only the generic "append beneath
// this heading's existing body" logic is duplicated here; the actual
// money/label FORMATTING is never duplicated -- the server computes
// `propertySection3Markdown` (via `GET /reports/:id`) and this only splices
// that already-rendered string into the report's own `content` for
// DISPLAY. Never persisted -- purely a display-time transformation.

const SECTION3_HEADING_RE = /^##\s*SECTION\s+3\b/i;
const NEXT_TOP_LEVEL_HEADING_RE = /^#{1,2}(?!#)\s/;

export const injectSection3PropertyBlock = (content, blockMarkdown) => {
  if (!blockMarkdown) return content;
  const source = String(content || '');
  const lines = source.split('\n');
  const sec3Index = lines.findIndex((line) => SECTION3_HEADING_RE.test(line.trim()));
  if (sec3Index === -1) return content;

  let nextHeadingIndex = lines.length;
  for (let i = sec3Index + 1; i < lines.length; i++) {
    if (NEXT_TOP_LEVEL_HEADING_RE.test(lines[i].trim())) {
      nextHeadingIndex = i;
      break;
    }
  }

  const before = lines.slice(0, nextHeadingIndex); // heading + full existing narrative, untouched
  const after = lines.slice(nextHeadingIndex); // Section 4+, untouched
  const spliced = [...before, '', ...blockMarkdown.split('\n'), '', ...after];
  return spliced.join('\n');
};
