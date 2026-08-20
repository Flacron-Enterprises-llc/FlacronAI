// Phase 9 (Report Editor Rich-Text & AI Panel Upgrade): converts between one
// section's Markdown body (the persistent, exported format -- see
// backend/utils/richContent.js for the authoritative dialect definition) and
// a TipTap ProseMirror JSON document (the in-editor representation).
//
// Security note: `markdownToDoc` NEVER parses a raw HTML string into the
// editor (no `editor.commands.setContent(htmlString)` with HTML parsing) --
// every node here is built directly as a plain JS object with a `text`
// string, so arbitrary user text (even literal "<script>") can only ever end
// up as an inert ProseMirror text node, never live markup. TipTap's own
// schema additionally only allows the node/mark types registered as
// extensions, so pasted HTML outside that set is dropped by ProseMirror's
// parser, not executed.

const PAGE_BREAK_TOKEN = '{{page-break}}';
const PHOTO_LINE_RE = /^!\[\[photo:([\w-]+)(?:\|(.*))?\]\]$/;
const GRID_OPEN_RE = /^\[\[photos\s+cols=(\d+)\]\]$/;
const GRID_ITEM_RE = /^photo:([\w-]+)(?:\|(.*))?$/;
const GRID_CLOSE_RE = /^\[\[\/photos\]\]$/;
const NUMBERED_ITEM_RE = /^(\d{1,3})\.\s+(.*)$/;

// Mirrors backend/utils/richContent.js's tokenizeInline exactly -- both sides
// must agree on the dialect since the backend independently re-parses
// whatever the editor saves for export rendering.
export const tokenizeInline = (line) => {
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

const parseBlockToken = (line) => {
  const trimmed = String(line || '').trim();
  if (trimmed === PAGE_BREAK_TOKEN) return { type: 'pagebreak' };
  const photoMatch = trimmed.match(PHOTO_LINE_RE);
  if (photoMatch) return { type: 'photo', photoId: photoMatch[1], caption: (photoMatch[2] || '').trim() };
  const numberedMatch = trimmed.match(NUMBERED_ITEM_RE);
  if (numberedMatch) return { type: 'numbered', text: numberedMatch[2] };
  const gridOpen = trimmed.match(GRID_OPEN_RE);
  if (gridOpen) {
    const parsed = parseInt(gridOpen[1], 10);
    return { type: 'grid-open', cols: Number.isNaN(parsed) ? 2 : Math.max(1, Math.min(4, parsed)) };
  }
  if (GRID_CLOSE_RE.test(trimmed)) return { type: 'grid-close' };
  const gridItem = trimmed.match(GRID_ITEM_RE);
  if (gridItem) return { type: 'grid-item', photoId: gridItem[1], caption: (gridItem[2] || '').trim() };
  return null;
};

const textNodesFromRuns = (text) => {
  const runs = tokenizeInline(text);
  if (!runs.length) return [];
  return runs
    .filter((r) => r.text.length)
    .map((r) => {
      const marks = [];
      if (r.bold) marks.push({ type: 'bold' });
      if (r.italic) marks.push({ type: 'italic' });
      if (r.underline) marks.push({ type: 'underline' });
      return marks.length ? { type: 'text', text: r.text, marks } : { type: 'text', text: r.text };
    });
};

const paragraphNode = (text) => {
  const content = textNodesFromRuns(text);
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' };
};

// Parses one section's Markdown body into a TipTap `doc` JSON document.
export const markdownToDoc = (markdown) => {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const content = [];
  let i = 0;

  const collectList = (isItem) => {
    const items = [];
    while (i < lines.length) {
      const trimmed = lines[i].trim();
      const token = parseBlockToken(lines[i]);
      if (token?.type === 'numbered' && isItem === 'numbered') {
        items.push(token.text);
        i += 1;
        continue;
      }
      if (!token && (trimmed.startsWith('- ') || trimmed.startsWith('* ')) && isItem === 'bullet') {
        items.push(trimmed.slice(2));
        i += 1;
        continue;
      }
      break;
    }
    return items;
  };

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();
    const token = parseBlockToken(raw);

    if (token?.type === 'grid-open') {
      const items = [];
      i += 1;
      while (i < lines.length) {
        const inner = parseBlockToken(lines[i]);
        if (inner?.type === 'grid-close') { i += 1; break; }
        if (inner?.type === 'grid-item') items.push({ type: 'reportPhoto', attrs: { photoId: inner.photoId, caption: inner.caption } });
        i += 1;
      }
      if (items.length) content.push({ type: 'reportPhotoGrid', attrs: { cols: token.cols }, content: items });
      continue;
    }
    if (token?.type === 'pagebreak') {
      content.push({ type: 'pageBreak' });
      i += 1;
      continue;
    }
    if (token?.type === 'photo') {
      content.push({ type: 'reportPhoto', attrs: { photoId: token.photoId, caption: token.caption } });
      i += 1;
      continue;
    }
    if (token?.type === 'numbered') {
      const items = collectList('numbered');
      content.push({ type: 'orderedList', content: items.map((t) => ({ type: 'listItem', content: [paragraphNode(t)] })) });
      continue;
    }
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const items = collectList('bullet');
      content.push({ type: 'bulletList', content: items.map((t) => ({ type: 'listItem', content: [paragraphNode(t)] })) });
      continue;
    }
    if (/^###\s/.test(trimmed)) {
      content.push({ type: 'heading', attrs: { level: 3 }, content: textNodesFromRuns(trimmed.replace(/^###\s*/, '')) });
      i += 1;
      continue;
    }
    if (trimmed === '---') {
      content.push({ type: 'horizontalRule' });
      i += 1;
      continue;
    }
    if (raw.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        const cells = lines[i].split('|').slice(1, -1).filter((c) => !c.trim().match(/^[-:]+$/));
        if (cells.length) rows.push(cells);
        i += 1;
      }
      if (rows.length) {
        const [headerRow, ...bodyRows] = rows;
        const headerCells = headerRow.map((c) => ({ type: 'tableHeader', content: [paragraphNode(c.trim())] }));
        const bodyTr = bodyRows.map((row) => ({
          type: 'tableRow',
          content: row.map((c) => ({ type: 'tableCell', content: [paragraphNode(c.trim())] })),
        }));
        content.push({ type: 'table', content: [{ type: 'tableRow', content: headerCells }, ...bodyTr] });
      }
      continue;
    }
    if (trimmed === '') { i += 1; continue; }
    content.push(paragraphNode(raw));
    i += 1;
  }

  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
};

// Escapes any literal `*`/`+` in a run's own typed text so the toggle-based
// tokenizer above never mistakes real user content for formatting delimiters
// on the next load. Mirrored by an unescape step in tokenizeInline (both here
// and in the backend copy).
const escapeDelimiters = (text) => String(text || '').replace(/([*+])/g, '\\$1');

const serializeInlineNodes = (nodes = []) => {
  let out = '';
  const active = { bold: false, underline: false, italic: false };
  nodes.forEach((node) => {
    if (node.type !== 'text') return;
    const marks = new Set((node.marks || []).map((m) => m.type));
    const target = { bold: marks.has('bold'), underline: marks.has('underline'), italic: marks.has('italic') };
    ['bold', 'underline', 'italic'].forEach((flag) => {
      if (target[flag] !== active[flag]) {
        out += flag === 'bold' ? '**' : flag === 'underline' ? '++' : '*';
        active[flag] = target[flag];
      }
    });
    out += escapeDelimiters(node.text || '');
  });
  ['bold', 'underline', 'italic'].forEach((flag) => {
    if (active[flag]) out += flag === 'bold' ? '**' : flag === 'underline' ? '++' : '*';
  });
  return out;
};

const cellText = (cellNode) => (cellNode.content || []).map((p) => serializeInlineNodes(p.content)).join(' ');

// Serializes a TipTap `doc` JSON document back into this section's Markdown
// body (the format actually persisted/exported).
export const docToMarkdown = (doc) => {
  const lines = [];
  (doc?.content || []).forEach((node) => {
    switch (node.type) {
      case 'heading':
        lines.push(`### ${serializeInlineNodes(node.content)}`.trimEnd());
        lines.push('');
        break;
      case 'paragraph':
        lines.push(serializeInlineNodes(node.content));
        lines.push('');
        break;
      case 'bulletList':
        (node.content || []).forEach((item) => {
          const text = (item.content || []).map((p) => serializeInlineNodes(p.content)).join(' ');
          lines.push(`- ${text}`);
        });
        lines.push('');
        break;
      case 'orderedList':
        (node.content || []).forEach((item, idx) => {
          const text = (item.content || []).map((p) => serializeInlineNodes(p.content)).join(' ');
          lines.push(`${idx + 1}. ${text}`);
        });
        lines.push('');
        break;
      case 'table':
        (node.content || []).forEach((row, ri) => {
          const cells = (row.content || []).map(cellText);
          lines.push(`| ${cells.join(' | ')} |`);
          if (ri === 0) lines.push(`|${cells.map(() => '---').join('|')}|`);
        });
        lines.push('');
        break;
      case 'horizontalRule':
        lines.push('---');
        lines.push('');
        break;
      case 'pageBreak':
        lines.push(PAGE_BREAK_TOKEN);
        lines.push('');
        break;
      case 'reportPhoto':
        lines.push(`![[photo:${node.attrs?.photoId}${node.attrs?.caption ? `|${node.attrs.caption}` : ''}]]`);
        lines.push('');
        break;
      case 'reportPhotoGrid':
        lines.push(`[[photos cols=${node.attrs?.cols || 2}]]`);
        (node.content || []).forEach((child) => {
          lines.push(`photo:${child.attrs?.photoId}${child.attrs?.caption ? `|${child.attrs.caption}` : ''}`);
        });
        lines.push('[[/photos]]');
        lines.push('');
        break;
      default:
        break;
    }
  });
  // Collapse the trailing blank-line-per-block into normal paragraph spacing.
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};
