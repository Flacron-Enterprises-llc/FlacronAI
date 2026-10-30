/**
 * Display-only composition of the report body, ported from frontend/src/utils/canonicalEstimateContent.js
 * (`injectSection7Detail`) and propertyIntelligenceContent.js (`injectSection3PropertyBlock`). The server-built Section 7
 * detail replaces the narrative under "## SECTION 7"; the confirmed Section 3 property block is appended beneath the
 * Section 3 narrative. The stored `content` is never changed.
 */
const NEXT_TOP_LEVEL_HEADING_RE = /^#{1,2}(?!#)\s/;

function nextHeading(lines: string[], from: number): number {
  for (let i = from + 1; i < lines.length; i++) if (NEXT_TOP_LEVEL_HEADING_RE.test(lines[i].trim())) return i;
  return lines.length;
}

export function injectSection7Detail(content: string, detailMarkdown: string | null | undefined): string {
  if (!detailMarkdown) return content;
  const lines = String(content || '').split('\n');
  const idx = lines.findIndex((l) => /^##\s*SECTION\s+7\b/i.test(l.trim()));
  if (idx === -1) return content;
  const end = nextHeading(lines, idx);
  return [...lines.slice(0, idx + 1), '', ...detailMarkdown.split('\n'), '', ...lines.slice(end)].join('\n');
}

export function injectSection3PropertyBlock(content: string, blockMarkdown: string | null | undefined): string {
  if (!blockMarkdown) return content;
  const lines = String(content || '').split('\n');
  const idx = lines.findIndex((l) => /^##\s*SECTION\s+3\b/i.test(l.trim()));
  if (idx === -1) return content;
  const end = nextHeading(lines, idx);
  return [...lines.slice(0, end), '', ...blockMarkdown.split('\n'), '', ...lines.slice(end)].join('\n');
}
