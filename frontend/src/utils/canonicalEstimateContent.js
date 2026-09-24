// Phase 42 (Section 7 Rendering, Editor & Report Integration) -- 2026-09-18
// correction (CHECK 1). Frontend mirror of the tiny, generic splice
// algorithm in `backend/utils/canonicalEstimateContent.js`'s
// `injectSection7Detail` (that module can't be imported directly here --
// it's a separate CommonJS backend app, not part of this build). Only the
// generic "replace this heading's body" logic is duplicated; the actual
// estimate -> markdown FORMATTING is never duplicated -- the server
// computes `detailMarkdown` (via `GET /reports/:id/canonical-estimate`)
// and this only splices that already-rendered string into the report's
// own `content` for DISPLAY, so the desktop preview follows the exact same
// selection rule as the PDF/DOCX/HTML exports: a canonical estimate
// present REPLACES the legacy Section 7 narrative body (never both shown
// together); absent, Section 7 renders exactly as before. Never persisted
// -- purely a display-time transformation of the in-memory content string.

const SECTION7_HEADING_RE = /^##\s*SECTION\s+7\b/i;
const NEXT_TOP_LEVEL_HEADING_RE = /^#{1,2}(?!#)\s/;

export const injectSection7Detail = (content, detailMarkdown) => {
  if (!detailMarkdown) return content;
  const source = String(content || '');
  const lines = source.split('\n');
  const sec7Index = lines.findIndex((line) => SECTION7_HEADING_RE.test(line.trim()));
  if (sec7Index === -1) return content;

  let nextHeadingIndex = lines.length;
  for (let i = sec7Index + 1; i < lines.length; i++) {
    if (NEXT_TOP_LEVEL_HEADING_RE.test(lines[i].trim())) {
      nextHeadingIndex = i;
      break;
    }
  }

  const before = lines.slice(0, sec7Index + 1); // includes the Section 7 heading line itself
  const after = lines.slice(nextHeadingIndex); // Section 8+ (or nothing), untouched
  const spliced = [...before, '', ...detailMarkdown.split('\n'), '', ...after];
  return spliced.join('\n');
};
