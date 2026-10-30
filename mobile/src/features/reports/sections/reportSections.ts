/**
 * Port of frontend/src/utils/reportSections.js — the same split/serialize rules, so a section edited on mobile saves
 * back exactly as the web editor would. Sections are identified to the server only by `title` + current `body`.
 */
export interface ReportSection {
  id: string;
  level: number;
  title: string;
  body: string;
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;

export function parseReportSections(content: string | null | undefined = ''): ReportSection[] {
  const lines = String(content ?? '').replace(/\r\n/g, '\n').split('\n');
  const sections: ReportSection[] = [];
  let current: { id: string; level: number; title: string; body: string[] } | null = null;
  const preamble: string[] = [];

  for (const line of lines) {
    const heading = HEADING_RE.exec(line);
    if (heading) {
      if (current) sections.push({ ...current, body: current.body.join('\n').trim() });
      current = { id: `section-${sections.length + 1}`, level: heading[1].length, title: heading[2], body: [] };
    } else if (current) {
      current.body.push(line);
    } else {
      preamble.push(line);
    }
  }
  if (current) sections.push({ ...current, body: current.body.join('\n').trim() });
  const intro = preamble.join('\n').trim();
  if (!sections.length) return [{ id: 'section-1', level: 2, title: 'Report Content', body: intro }];
  if (intro) sections.unshift({ id: 'preamble', level: 0, title: 'Introduction', body: intro });
  return sections;
}

export function serializeReportSections(sections: ReportSection[]): string {
  return sections
    .map((section) => {
      const body = String(section.body || '').trim();
      if (section.level === 0) return body;
      const heading = `${'#'.repeat(section.level || 2)} ${String(section.title || 'Untitled Section').trim()}`;
      return body ? `${heading}\n\n${body}` : heading;
    })
    .filter(Boolean)
    .join('\n\n');
}

/** Replace one section's body and return the full report content. */
export function replaceSectionBody(content: string, sectionId: string, body: string): string {
  return serializeReportSections(parseReportSections(content).map((s) => (s.id === sectionId ? { ...s, body } : s)));
}

/** The seven web "FLACRON Tools" (SectionedReportEditor ASSIST_ACTIONS). */
export const ASSIST_ACTIONS = [
  { id: 'improve', label: 'Improve Writing' },
  { id: 'shorten', label: 'Shorten' },
  { id: 'expand', label: 'Expand' },
  { id: 'rewrite_professional', label: 'Rewrite Professionally' },
  { id: 'check_consistency', label: 'Check Consistency' },
  { id: 'check_missing_info', label: 'Check Missing Information' },
  { id: 'review_photos', label: 'Review Photo Documentation' },
] as const;
export type AssistAction = (typeof ASSIST_ACTIONS)[number]['id'];
