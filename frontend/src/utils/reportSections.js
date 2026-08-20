const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;

export const parseReportSections = (content = '') => {
  const lines = String(content).replace(/\r\n/g, '\n').split('\n');
  const sections = [];
  let current = null;
  let preamble = [];

  lines.forEach(line => {
    const heading = line.match(HEADING_RE);
    if (heading) {
      if (current) sections.push({ ...current, body: current.body.join('\n').trim() });
      current = {
        id: `section-${sections.length + 1}`,
        level: heading[1].length,
        title: heading[2],
        body: [],
      };
    } else if (current) {
      current.body.push(line);
    } else {
      preamble.push(line);
    }
  });

  if (current) sections.push({ ...current, body: current.body.join('\n').trim() });
  const intro = preamble.join('\n').trim();
  if (!sections.length) {
    return [{ id: 'section-1', level: 2, title: 'Report Content', body: intro }];
  }
  if (intro) sections.unshift({ id: 'preamble', level: 0, title: 'Introduction', body: intro });
  return sections;
};

// Phase 19 (Sharing, Comments & Review Requests): a content-based section
// anchor for comments, mirroring backend/utils/reportAccess.js's
// slugifySectionTitle exactly -- a comment anchored to a title survives
// reordering (its slug is unaffected by position) and only breaks if the
// section is literally renamed or removed, at which point the UI falls back
// to showing the comment under "General" with the original title kept for
// context.
export const slugifySectionTitle = (title) => {
  const slug = String(title || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80);
  return slug || 'general';
};

export const serializeReportSections = sections => sections
  .map(section => {
    const body = String(section.body || '').trim();
    if (section.level === 0) return body;
    const heading = `${'#'.repeat(section.level || 2)} ${String(section.title || 'Untitled Section').trim()}`;
    return body ? `${heading}\n\n${body}` : heading;
  })
  .filter(Boolean)
  .join('\n\n');

