import { useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, FileType, Code2, Lock, Download, RefreshCw, X } from 'lucide-react';
import useEscapeToClose from '../hooks/useEscapeToClose';

const FORMATS = [
  { id: 'pdf', label: 'PDF', icon: FileText },
  { id: 'docx', label: 'DOCX', icon: FileType },
  { id: 'html', label: 'HTML', icon: Code2 },
];

const CHECKBOXES = [
  { key: 'includeCoverPage', label: 'Include cover page', hint: 'Title, claim summary, and status on their own page' },
  { key: 'includePhotoCaptions', label: 'Include photo captions', hint: 'File name shown under each appendix photo' },
  { key: 'includePageNumbers', label: 'Include page numbers', hint: 'Adds "Page N" to the footer' },
  { key: 'includeAppendix', label: 'Include photo appendix', hint: 'The "Photo Documentation" section' },
  { key: 'includeCompanyBranding', label: 'Include company branding', hint: 'Your logo/name in the header and cover' },
];

const LAYOUTS = [1, 2, 4];

// Phase 11 (Export Options Modal & PDF Layout Completion): shared by
// Dashboard.jsx and ReportPreviewPage.jsx. Calls `onExport(format, options)`
// -- the caller owns the actual API call + file download, since Dashboard and
// the preview page already have (slightly different) download plumbing.
export default function ExportOptionsModal({ report, allowedExports = ['pdf'], onClose, onExport }) {
  useEscapeToClose(onClose, true, true);
  const [format, setFormat] = useState(allowedExports[0] || 'pdf');
  // Phase 13 (Real Template Builder): a report generated from a template
  // carries that template's photo-layout preference as `exportDefaults` --
  // used only to seed this modal's initial choices (a starting point the
  // user can still change per-export), never enforced server-side as
  // anything more than the same validated options any export already sends.
  const templateDefaults = report?.exportDefaults || {};
  const [options, setOptions] = useState({
    includeCoverPage: templateDefaults.includeCoverPage ?? true,
    includePhotoCaptions: templateDefaults.includePhotoCaptions ?? true,
    includePageNumbers: templateDefaults.includePageNumbers ?? true,
    includeAppendix: templateDefaults.includeAppendix ?? true,
    includeCompanyBranding: templateDefaults.includeCompanyBranding ?? true,
  });
  const [photoLayout, setPhotoLayout] = useState(
    LAYOUTS.includes(templateDefaults.photoLayout) ? templateDefaults.photoLayout : 2
  );
  const [exporting, setExporting] = useState(false);

  const hasPhotos = (report?.imageCount || 0) > 0;

  const toggle = (key) => setOptions((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleExport = async () => {
    setExporting(true);
    try {
      await onExport(format, { ...options, photoLayout });
      onClose();
    } finally {
      setExporting(false);
    }
  };

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={() => !exporting && onClose()}>
      <motion.div className="card w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="export-modal-title"
        initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 id="export-modal-title" className="text-lg font-bold text-gray-900">Export Report</h2>
          <button onClick={onClose} disabled={exporting} aria-label="Close" className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <p className="text-xs font-semibold text-gray-600 mb-2">Format</p>
        <div className="grid grid-cols-3 gap-2 mb-5">
          {FORMATS.map((f) => {
            const allowed = allowedExports.includes(f.id);
            const Icon = f.icon;
            return (
              <button key={f.id} type="button" disabled={!allowed}
                onClick={() => setFormat(f.id)}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-semibold transition-colors ${
                  !allowed ? 'border-dashed border-gray-200 text-gray-300 cursor-not-allowed'
                    : format === f.id ? 'border-brand-500 bg-brand-500/10 text-brand-700' : 'border-gray-200 text-gray-600 hover:border-brand-300'
                }`}>
                {allowed ? <Icon className="w-5 h-5" /> : <Lock className="w-4 h-4" />}
                {f.label}
              </button>
            );
          })}
        </div>

        <p className="text-xs font-semibold text-gray-600 mb-2">Include</p>
        <div className="space-y-2.5 mb-5">
          {CHECKBOXES.map((cb) => (
            <label key={cb.key} className="flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" checked={options[cb.key]} onChange={() => toggle(cb.key)}
                className="mt-0.5 rounded border-gray-300 text-brand-600 focus:ring-brand-400" />
              <span className="text-sm text-gray-700">
                {cb.label}
                <span className="block text-[11px] text-gray-400 font-normal">{cb.hint}</span>
              </span>
            </label>
          ))}
        </div>

        {hasPhotos && options.includeAppendix && (
          <div className="mb-5">
            <p className="text-xs font-semibold text-gray-600 mb-2">Photos per page</p>
            <div className="grid grid-cols-3 gap-2">
              {LAYOUTS.map((n) => (
                <button key={n} type="button" onClick={() => setPhotoLayout(n)}
                  className={`py-2 rounded-lg border text-sm font-semibold transition-colors ${
                    photoLayout === n ? 'border-brand-500 bg-brand-500/10 text-brand-700' : 'border-gray-200 text-gray-600 hover:border-brand-300'
                  }`}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} disabled={exporting} className="btn-secondary flex-1 text-sm py-2 disabled:opacity-50">Cancel</button>
          <button onClick={handleExport} disabled={exporting || !allowedExports.includes(format)}
            className="btn-primary flex-1 text-sm py-2 flex items-center justify-center gap-2 disabled:opacity-50">
            {exporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {exporting ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
