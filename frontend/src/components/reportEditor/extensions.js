import { Node, mergeAttributes } from '@tiptap/core';

// Phase 9 (Report Editor Rich-Text & AI Panel Upgrade): three small custom
// TipTap nodes for content the base StarterKit/Table extensions don't cover.
// All three are schema-constrained (fixed, known attrs only) -- there is no
// path for arbitrary HTML/script to enter the document through them.

// A visible, explicit page-break marker. Persists as the literal line
// `{{page-break}}` (see utils/richContent.js) and is honored by the PDF/DOCX
// export generators as a real page break.
export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'div[data-report-page-break]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-report-page-break': '' })];
  },
  addNodeView() {
    return () => {
      const dom = document.createElement('div');
      dom.className = 'report-pagebreak';
      dom.contentEditable = 'false';
      dom.innerHTML = '<span>Page Break</span>';
      return { dom };
    };
  },
});

// A single photo reference, resolved (both in-editor and at export time)
// against the report's OWN owned photo records by photoId -- never a
// client-supplied URL, so there is no arbitrary-image/SSRF/src-injection
// surface. `getThumbnailUrl(photoId)` (an extension option, supplied per
// editor instance) is expected to return an object-URL string or null.
export const ReportPhoto = Node.create({
  name: 'reportPhoto',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return {
      getThumbnailUrl: async () => null,
      onEditCaption: null,
    };
  },
  addAttributes() {
    return {
      photoId: { default: null },
      caption: { default: '' },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-report-photo]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-report-photo': '' })];
  },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('figure');
      dom.className = 'report-photo-node';
      dom.contentEditable = 'false';

      const imgWrap = document.createElement('div');
      imgWrap.className = 'report-photo-node-img';
      imgWrap.textContent = 'Loading photo…';
      dom.appendChild(imgWrap);

      const caption = document.createElement('div');
      caption.className = 'report-photo-node-caption';
      caption.textContent = node.attrs.caption || 'Click to add a caption';
      dom.appendChild(caption);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'report-photo-node-remove';
      removeBtn.textContent = '×';
      removeBtn.title = 'Remove photo';
      removeBtn.addEventListener('click', () => {
        if (typeof getPos === 'function') {
          editor.chain().focus().deleteRange({ from: getPos(), to: getPos() + node.nodeSize }).run();
        }
      });
      dom.appendChild(removeBtn);

      caption.addEventListener('click', () => {
        const opts = editor.extensionManager.extensions.find((e) => e.name === 'reportPhoto')?.options;
        if (opts?.onEditCaption && typeof getPos === 'function') {
          opts.onEditCaption({ photoId: node.attrs.photoId, caption: node.attrs.caption, pos: getPos() });
        }
      });

      let cancelled = false;
      const opts = editor.extensionManager.extensions.find((e) => e.name === 'reportPhoto')?.options;
      Promise.resolve(opts?.getThumbnailUrl?.(node.attrs.photoId)).then((url) => {
        if (cancelled) return;
        imgWrap.textContent = '';
        if (url) {
          const img = document.createElement('img');
          img.src = url;
          img.alt = node.attrs.caption || 'Report photo';
          imgWrap.appendChild(img);
        } else {
          imgWrap.textContent = 'Photo unavailable';
        }
      });

      return {
        dom,
        update: (updatedNode) => {
          if (updatedNode.type.name !== 'reportPhoto') return false;
          caption.textContent = updatedNode.attrs.caption || 'Click to add a caption';
          return true;
        },
        destroy: () => { cancelled = true; },
      };
    };
  },
});

// A container of 2-4 ReportPhoto children laid out in a CSS grid -- the
// "photo grid" formatting control. Persists as the `[[photos cols=N]] ...
// [[/photos]]` fenced block.
export const ReportPhotoGrid = Node.create({
  name: 'reportPhotoGrid',
  group: 'block',
  content: 'reportPhoto+',
  selectable: true,

  addAttributes() {
    return { cols: { default: 2 } };
  },
  parseHTML() {
    return [{ tag: 'div[data-report-photo-grid]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-report-photo-grid': '' }), 0];
  },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div');
      dom.className = 'report-photo-grid-node';
      dom.style.gridTemplateColumns = `repeat(${node.attrs.cols || 2}, 1fr)`;
      return {
        dom,
        contentDOM: dom,
        update: (updatedNode) => {
          if (updatedNode.type.name !== 'reportPhotoGrid') return false;
          dom.style.gridTemplateColumns = `repeat(${updatedNode.attrs.cols || 2}, 1fr)`;
          return true;
        },
      };
    };
  },
});
