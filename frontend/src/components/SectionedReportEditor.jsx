import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold as BoldIcon, Italic as ItalicIcon, Underline as UnderlineIcon, Heading3,
  List, ListOrdered, Table2, ImagePlus, LayoutGrid, SeparatorHorizontal,
  Undo2, Redo2, Trash2, ArrowUp, ArrowDown, Plus, Sparkles, Wand2,
  Check, X, ChevronDown, ChevronUp, FileText, RefreshCw,
} from 'lucide-react';
import { parseReportSections, serializeReportSections } from '../utils/reportSections';
import { markdownToDoc, docToMarkdown } from '../utils/richContent';
import { PageBreak, ReportPhoto, ReportPhotoGrid } from './reportEditor/extensions';
import { reportsAPI } from '../services/api';

// Phase 9 (Report Editor Rich-Text & AI Panel Upgrade): the 7 FLACRON ENGINE
// writing-assistance functions, each Apply/Discard, never auto-overwriting --
// distinct from "Regenerate Section" below (its own instructions+comparison
// modal workflow).
const ASSIST_ACTIONS = [
  { action: 'improve', label: 'Improve Writing' },
  { action: 'shorten', label: 'Shorten' },
  { action: 'expand', label: 'Expand' },
  { action: 'rewrite_professional', label: 'Rewrite Professionally' },
  { action: 'check_consistency', label: 'Check Consistency' },
  { action: 'check_missing_info', label: 'Check Missing Information' },
  { action: 'review_photos', label: 'Review Photo Documentation' },
];

const DEFAULT_SECTION_TITLES = [
  'Report Info', 'Claim Info & Insured Info', 'Property Info',
  'Inspection Details & Overview', 'Area Observations', 'Photo Documentation', 'Additional Notes',
];

const ToolbarButton = ({ onClick, active, disabled, title, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    aria-label={title}
    aria-pressed={!!active}
    className={`inline-flex h-7 w-7 items-center justify-center rounded-md border text-gray-600 transition-colors disabled:opacity-40 ${
      active ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-transparent hover:border-gray-200 hover:bg-gray-100'
    }`}
  >
    {children}
  </button>
);

// A small photo picker used by both "Insert Photo" (single, `max=1`) and
// "Insert Photo Grid" (`max=4`, `min=2`). Photos are private objects fetched
// as authenticated blobs (matches the existing ReportPhotoGallery pattern).
function PhotoPickerModal({ reportId, max, min = 1, onCancel, onConfirm }) {
  const [photos, setPhotos] = useState(null);
  const [thumbUrls, setThumbUrls] = useState({});
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const created = [];
    (async () => {
      try {
        const res = await reportsAPI.getPhotos(reportId);
        const list = (res.data.photos || []).filter((p) => p.status === 'uploaded');
        if (cancelled) return;
        setPhotos(list);
        await Promise.all(list.map(async (p) => {
          try {
            const img = await reportsAPI.getPhotoImageBlob(reportId, p.id, 'thumbnail');
            const url = URL.createObjectURL(img.data);
            created.push(url);
            if (!cancelled) setThumbUrls((prev) => ({ ...prev, [p.id]: url }));
          } catch { /* leave placeholder */ }
        }));
      } catch {
        if (!cancelled) setPhotos([]);
      }
    })();
    return () => { cancelled = true; created.forEach((u) => URL.revokeObjectURL(u)); };
  }, [reportId]);

  const toggle = (id) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (max === 1) return [id];
      if (prev.length >= max) return prev;
      return [...prev, id];
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Select photos">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-bg shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h3 className="text-sm font-semibold text-gray-900">{max === 1 ? 'Insert Photo' : `Select ${min}-${max} Photos for Grid`}</h3>
          <button type="button" onClick={onCancel} aria-label="Close" className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[55vh] overflow-y-auto p-5">
          {photos === null && <p className="py-8 text-center text-sm text-gray-500">Loading photos…</p>}
          {photos?.length === 0 && <p className="py-8 text-center text-sm text-gray-500">No uploaded photos on this report yet.</p>}
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {photos?.map((p) => {
              const isSelected = selected.includes(p.id);
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  className={`relative aspect-square overflow-hidden rounded-lg border-2 bg-gray-50 ${isSelected ? 'border-brand-500' : 'border-transparent hover:border-gray-300'}`}
                >
                  {thumbUrls[p.id] ? (
                    <img src={thumbUrls[p.id]} alt={p.fileName || 'Report photo'} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] text-gray-400">Loading…</div>
                  )}
                  {isSelected && (
                    <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-white">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-5 py-3">
          <p className="text-xs text-gray-500">{selected.length} selected{max > 1 ? ` (need at least ${min})` : ''}</p>
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="btn-secondary px-3 py-1.5 text-xs">Cancel</button>
            <button
              type="button"
              disabled={selected.length < min}
              onClick={() => onConfirm(selected.map((id) => photos.find((p) => p.id === id)))}
              className="btn-primary px-3 py-1.5 text-xs disabled:opacity-50"
            >
              Insert
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CaptionEditModal({ initialValue, onCancel, onSave }) {
  const [value, setValue] = useState(initialValue || '');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Edit photo caption">
      <div className="w-full max-w-md rounded-2xl bg-bg p-5 shadow-xl">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Photo Caption</h3>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. Kitchen ceiling — water staining"
          className="input w-full text-sm"
          maxLength={200}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-secondary px-3 py-1.5 text-xs">Cancel</button>
          <button type="button" onClick={() => onSave(value)} className="btn-primary px-3 py-1.5 text-xs">Save Caption</button>
        </div>
      </div>
    </div>
  );
}

// The distinct "Regenerate Section" workflow (Phase 9 amendment): an
// open-ended instructions textarea, Cancel/Regenerate, a generated-vs-current
// comparison, then explicit approval before the section content is replaced.
function RegenerateSectionModal({ sectionTitle, currentBody, reportId, sectionForPrompt, onClose, onApprove }) {
  const [instructions, setInstructions] = useState('');
  const [stage, setStage] = useState('instructions'); // instructions | loading | compare | error
  const [generated, setGenerated] = useState('');
  const [error, setError] = useState('');

  const runRegenerate = async () => {
    setStage('loading');
    setError('');
    try {
      const res = await reportsAPI.suggestSection(reportId, { title: sectionForPrompt, body: currentBody, instructions });
      setGenerated(res.data?.suggestion || '');
      setStage('compare');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not regenerate this section. Try again.');
      setStage('instructions');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Regenerate section">
      <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-bg shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Regenerate Section — {sectionTitle}</h3>
            <p className="text-xs text-gray-500">The FLACRON ENGINE proposes a full rewrite. Nothing is replaced until you approve it.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>

        {stage === 'instructions' && (
          <div className="p-5">
            <label htmlFor="regen-instructions" className="mb-1.5 block text-xs font-semibold text-gray-700">What would you like to change?</label>
            <textarea
              id="regen-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="e.g. Make this more concise and mention the hallway water staining too."
              className="input w-full resize-y text-sm"
            />
            {error && <p className="mt-2 text-xs text-red-600" role="alert">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="btn-secondary px-3 py-1.5 text-xs">Cancel</button>
              <button type="button" onClick={runRegenerate} className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs">
                <Wand2 className="h-3.5 w-3.5" /> Regenerate
              </button>
            </div>
          </div>
        )}

        {stage === 'loading' && (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <RefreshCw className="h-8 w-8 animate-spin text-brand-500" />
            <p className="text-sm text-gray-500">Generating a new version of this section…</p>
          </div>
        )}

        {stage === 'compare' && (
          <div className="p-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">Current</p>
                <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">{currentBody || '(empty)'}</div>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-blue-700">Generated (not applied yet)</p>
                <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-gray-700">{generated}</div>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="btn-secondary px-3 py-1.5 text-xs">Cancel</button>
              <button type="button" onClick={() => setStage('instructions')} className="btn-secondary px-3 py-1.5 text-xs">Regenerate Again</button>
              <button type="button" onClick={() => onApprove(generated)} className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs">
                <Check className="h-3.5 w-3.5" /> Approve &amp; Replace
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// One section's rich-text editor. Photo insert/AI-apply/Regenerate-approve
// all act directly on this component's own `editor` instance, so no ref API
// is exposed to the parent.
function SectionEditor(
  { section, index, total, reportId, disabled, onBodyChange, onRename, onMove, onDelete, isCollapsed, onToggleCollapse }
) {
  const [captionEdit, setCaptionEdit] = useState(null); // { photoId, caption } | null
  const [photoPicker, setPhotoPicker] = useState(null); // 'single' | 'grid' | null
  const [aiOpen, setAiOpen] = useState(false);
  const [aiRunning, setAiRunning] = useState(null);
  const [aiResult, setAiResult] = useState(null); // { action, label, suggestion }
  const [aiError, setAiError] = useState('');
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const bodyRef = useRef(section.body);

  const thumbCache = useRef({});
  const getThumbnailUrl = async (photoId) => {
    if (!photoId) return null;
    if (thumbCache.current[photoId]) return thumbCache.current[photoId];
    try {
      const res = await reportsAPI.getPhotoImageBlob(reportId, photoId, 'thumbnail');
      const url = URL.createObjectURL(res.data);
      thumbCache.current[photoId] = url;
      return url;
    } catch {
      return null;
    }
  };

  const editor = useEditor({
    editable: !disabled,
    content: markdownToDoc(section.body),
    extensions: [
      StarterKit.configure({ heading: { levels: [3] } }),
      Underline,
      Table.configure({ resizable: false }),
      TableRow, TableHeader, TableCell,
      Placeholder.configure({ placeholder: 'Write this section…' }),
      PageBreak,
      ReportPhoto.configure({
        getThumbnailUrl,
        onEditCaption: ({ photoId, caption, pos }) => {
          editor?.commands.setNodeSelection(pos);
          setCaptionEdit({ photoId, caption });
        },
      }),
      ReportPhotoGrid,
    ],
    onUpdate: ({ editor: ed }) => {
      const md = docToMarkdown(ed.getJSON());
      bodyRef.current = md;
      onBodyChange(index, md);
    },
  }, [reportId]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  const runAssist = async ({ action, label }) => {
    setAiRunning(action);
    setAiError('');
    try {
      const res = await reportsAPI.assistSection(reportId, { action, title: section.title, body: bodyRef.current });
      setAiResult({ action, label, suggestion: res.data?.suggestion || '' });
    } catch (err) {
      setAiError(err.response?.data?.error || `Could not run "${label}". Try again.`);
    } finally {
      setAiRunning(null);
    }
  };

  const applySuggestion = (markdown) => {
    editor?.commands.setContent(markdownToDoc(markdown));
    bodyRef.current = markdown;
    onBodyChange(index, markdown);
    setAiResult(null);
  };

  if (!editor) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-bg">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3">
        <FileText className="h-4 w-4 shrink-0 text-brand-500" />
        <input
          value={section.title}
          onChange={(e) => onRename(index, e.target.value)}
          disabled={disabled}
          aria-label={`Section ${index + 1} title`}
          className="min-w-0 flex-1 rounded bg-transparent px-1 text-sm font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-brand-400"
        />
        <div className="flex items-center gap-1">
          <ToolbarButton onClick={() => onMove(index, -1)} disabled={disabled || index === 0} title="Move section up"><ArrowUp className="h-3.5 w-3.5" /></ToolbarButton>
          <ToolbarButton onClick={() => onMove(index, 1)} disabled={disabled || index === total - 1} title="Move section down"><ArrowDown className="h-3.5 w-3.5" /></ToolbarButton>
          <ToolbarButton onClick={() => onDelete(index)} disabled={disabled} title="Delete section"><Trash2 className="h-3.5 w-3.5" /></ToolbarButton>
        </div>
        <button
          type="button"
          onClick={() => setRegenerateOpen(true)}
          disabled={disabled || !reportId}
          className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-50"
        >
          <Wand2 className="h-3.5 w-3.5" /> Regenerate Section
        </button>
        <button
          type="button"
          onClick={() => setAiOpen((v) => !v)}
          disabled={disabled || !reportId}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50 ${aiOpen ? 'border-navy-300 bg-navy-50 text-navy-700' : 'border-gray-300 bg-bg text-gray-700 hover:bg-gray-100'}`}
          aria-expanded={aiOpen}
        >
          <Sparkles className="h-3.5 w-3.5" /> FLACRON Tools
        </button>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-200"
          aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${section.title}`}
          aria-expanded={!isCollapsed}
        >
          {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      </div>

      {!isCollapsed && (
        <div>
          <div className="flex flex-wrap items-center gap-1 border-b border-gray-100 bg-bg px-3 py-2">
            <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} disabled={disabled} title="Bold"><BoldIcon className="h-3.5 w-3.5" /></ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} disabled={disabled} title="Italic"><ItalicIcon className="h-3.5 w-3.5" /></ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} disabled={disabled} title="Underline"><UnderlineIcon className="h-3.5 w-3.5" /></ToolbarButton>
            <span className="mx-1 h-5 w-px bg-gray-200" />
            <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} disabled={disabled} title="Sub-heading"><Heading3 className="h-3.5 w-3.5" /></ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} disabled={disabled} title="Bullet list"><List className="h-3.5 w-3.5" /></ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} disabled={disabled} title="Numbered list"><ListOrdered className="h-3.5 w-3.5" /></ToolbarButton>
            <span className="mx-1 h-5 w-px bg-gray-200" />
            <ToolbarButton onClick={() => editor.chain().focus().insertTable({ rows: 2, cols: 3, withHeaderRow: true }).run()} disabled={disabled} title="Insert table"><Table2 className="h-3.5 w-3.5" /></ToolbarButton>
            <ToolbarButton onClick={() => setPhotoPicker('single')} disabled={disabled || !reportId} title="Insert photo"><ImagePlus className="h-3.5 w-3.5" /></ToolbarButton>
            <ToolbarButton onClick={() => setPhotoPicker('grid')} disabled={disabled || !reportId} title="Insert photo grid"><LayoutGrid className="h-3.5 w-3.5" /></ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().insertContent({ type: 'pageBreak' }).run()} disabled={disabled} title="Insert page break"><SeparatorHorizontal className="h-3.5 w-3.5" /></ToolbarButton>
            <span className="mx-1 h-5 w-px bg-gray-200" />
            <ToolbarButton onClick={() => editor.chain().focus().undo().run()} disabled={disabled} title="Undo"><Undo2 className="h-3.5 w-3.5" /></ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().redo().run()} disabled={disabled} title="Redo"><Redo2 className="h-3.5 w-3.5" /></ToolbarButton>
          </div>

          <EditorContent editor={editor} className="report-rich-editor px-4 py-3 text-sm leading-6 text-gray-700" />

          {aiOpen && (
            <div className="border-t border-navy-100 bg-navy-50/40 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-navy-700">
                <Sparkles className="h-3.5 w-3.5" /> FLACRON ENGINE Writing Assistance
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ASSIST_ACTIONS.map((a) => (
                  <button
                    key={a.action}
                    type="button"
                    onClick={() => runAssist(a)}
                    disabled={disabled || aiRunning !== null}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-bg px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                  >
                    {aiRunning === a.action ? <RefreshCw className="h-3 w-3 animate-spin" /> : null}
                    {a.label}
                  </button>
                ))}
              </div>
              {aiError && <p className="mt-2 text-xs text-red-600" role="alert">{aiError}</p>}
            </div>
          )}

          {aiResult && (
            <div className="border-t border-blue-200 bg-blue-50 p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-blue-800">{aiResult.label} — not applied</p>
                  <p className="text-xs text-blue-700">Review this proposal before applying it.</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setAiResult(null)} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-bg px-2.5 py-1.5 text-xs font-semibold text-gray-700"><X className="h-3.5 w-3.5" /> Discard</button>
                  <button type="button" onClick={() => applySuggestion(aiResult.suggestion)} className="inline-flex items-center gap-1 rounded-lg bg-blue-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-800"><Check className="h-3.5 w-3.5" /> Apply</button>
                </div>
              </div>
              <textarea
                value={aiResult.suggestion}
                onChange={(e) => setAiResult((r) => ({ ...r, suggestion: e.target.value }))}
                rows={Math.max(4, Math.min(12, aiResult.suggestion.split('\n').length + 2))}
                aria-label={`${aiResult.label} suggestion`}
                className="block w-full resize-y rounded-lg border border-blue-200 bg-bg p-3 text-sm leading-6 text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
        </div>
      )}

      {photoPicker && (
        <PhotoPickerModal
          reportId={reportId}
          max={photoPicker === 'single' ? 1 : 4}
          min={photoPicker === 'single' ? 1 : 2}
          onCancel={() => setPhotoPicker(null)}
          onConfirm={(photos) => {
            if (photoPicker === 'single') {
              editor.chain().focus().insertContent({ type: 'reportPhoto', attrs: { photoId: photos[0].id, caption: photos[0].fileName || '' } }).run();
            } else {
              editor.chain().focus().insertContent({
                type: 'reportPhotoGrid',
                attrs: { cols: Math.min(4, Math.max(2, photos.length)) },
                content: photos.map((p) => ({ type: 'reportPhoto', attrs: { photoId: p.id, caption: p.fileName || '' } })),
              }).run();
            }
            setPhotoPicker(null);
          }}
        />
      )}

      {captionEdit && (
        <CaptionEditModal
          initialValue={captionEdit.caption}
          onCancel={() => setCaptionEdit(null)}
          onSave={(value) => {
            editor.chain().focus().updateAttributes('reportPhoto', { caption: value }).run();
            setCaptionEdit(null);
          }}
        />
      )}

      {regenerateOpen && (
        <RegenerateSectionModal
          sectionTitle={section.title}
          sectionForPrompt={section.title}
          currentBody={bodyRef.current}
          reportId={reportId}
          onClose={() => setRegenerateOpen(false)}
          onApprove={(markdown) => { applySuggestion(markdown); setRegenerateOpen(false); }}
        />
      )}
    </section>
  );
}

export default function SectionedReportEditor({ reportId, value, onChange, disabled = false }) {
  const [sections, setSections] = useState(() => parseReportSections(value));
  const [collapsed, setCollapsed] = useState({});
  const [generation, setGeneration] = useState(0);
  const lastEmitted = useRef(serializeReportSections(sections));

  useEffect(() => {
    const incoming = String(value || '').trim();
    if (incoming !== lastEmitted.current.trim()) {
      const next = parseReportSections(value);
      setSections(next);
      lastEmitted.current = serializeReportSections(next);
      setGeneration((g) => g + 1);
    }
  }, [value]);

  // Deliberately NOT `setSections(prev => { ...; onChange(...); return next })`:
  // an updater function's side effects (calling the parent's onChange) would
  // run twice under React 18 StrictMode's double-invoke dev check, which for
  // moveSection would swap the array back to its original order on the
  // second, discarded invocation but still fire onChange twice. Deriving
  // `next` from the current `sections` closure and emitting once afterwards
  // (matching this component's pre-Phase-9 pattern) avoids that entirely.
  const emit = (next) => {
    const serialized = serializeReportSections(next);
    lastEmitted.current = serialized;
    setSections(next);
    onChange(serialized);
  };

  const updateBody = (index, body) => {
    emit(sections.map((s, i) => (i === index ? { ...s, body } : s)));
  };

  const renameSection = (index, title) => {
    emit(sections.map((s, i) => (i === index ? { ...s, title } : s)));
  };

  const moveSection = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    emit(next);
  };

  const deleteSection = (index) => {
    const section = sections[index];
    if (!window.confirm(`Delete "${section.title}"? This cannot be undone after you save.`)) return;
    const filtered = sections.filter((_, i) => i !== index);
    emit(filtered.length ? filtered : [{ id: `section-${Date.now()}`, level: 2, title: 'Report Content', body: '' }]);
  };

  const addSection = (afterIndex) => {
    const newSection = { id: `section-${Date.now()}`, level: 2, title: 'New Section', body: '' };
    const next = [...sections];
    next.splice(afterIndex + 1, 0, newSection);
    emit(next);
  };

  const availableDefaults = useMemo(
    () => DEFAULT_SECTION_TITLES.filter((t) => !sections.some((s) => s.title.trim().toLowerCase() === t.toLowerCase())),
    [sections]
  );

  return (
    <div className="space-y-3" aria-label="Report sections" key={`report-editor-${reportId || 'new'}-${generation}`}>
      {sections.map((section, index) => (
        <SectionEditor
          key={section.id}
          section={section}
          index={index}
          total={sections.length}
          reportId={reportId}
          disabled={disabled}
          onBodyChange={updateBody}
          onRename={renameSection}
          onMove={moveSection}
          onDelete={deleteSection}
          isCollapsed={!!collapsed[section.id]}
          onToggleCollapse={() => setCollapsed((c) => ({ ...c, [section.id]: !c[section.id] }))}
        />
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <button
          type="button"
          onClick={() => addSection(sections.length - 1)}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600 hover:border-brand-300 hover:text-brand-700 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> Add Section
        </button>
        {availableDefaults.length > 0 && (
          <p className="text-xs text-gray-400">Missing standard sections: {availableDefaults.join(', ')}</p>
        )}
      </div>
      <p className="text-xs text-gray-500">AI proposals stay separate until you Apply/Approve them. Applied edits still require Save Changes and final human approval.</p>
    </div>
  );
}
