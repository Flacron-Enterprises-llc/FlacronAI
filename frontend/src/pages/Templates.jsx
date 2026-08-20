import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Plus, RefreshCw, FolderOpen, Users, Sparkles, Pencil, Copy, Archive,
  ArchiveRestore, Trash2, AlertCircle, ArrowLeft, Lock, Image as ImageIcon,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import ConfirmDialog from '../components/ConfirmDialog';
import { templatesAPI } from '../services/api';

const TABS = [
  { id: 'personal', label: 'My Templates', icon: FolderOpen },
  { id: 'organization', label: 'Organization Templates', icon: Users },
  { id: 'flacron', label: 'Flacron Templates', icon: Sparkles },
];

// Phase 13 (Real Template Builder): the standalone /templates page -- ahead of
// the Phase 30 routing migration, same precedent as ReportPreviewPage.jsx
// (Phase 11) and SectionedReportEditor (Phase 9). Lists every template the
// account can see, grouped by scope, with real Create/Edit/Duplicate/Archive/
// Delete actions wired to backend/routes/templates.js.
export default function Templates() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Phase 17: allows a deep link (e.g. from /organization's Templates tab)
  // to land directly on a specific tab instead of always defaulting to My Templates.
  const [tab, setTab] = useState(() => {
    const requested = searchParams.get('tab');
    return TABS.some((t) => t.id === requested) ? requested : 'personal';
  });
  const [showArchived, setShowArchived] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null); // { type: 'archive'|'restore'|'delete', template }
  const [working, setWorking] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    templatesAPI.list({ includeArchived: showArchived ? 'true' : 'false' })
      .then((res) => setTemplates(res.data?.templates || []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [showArchived]);

  useEffect(() => { load(); }, [load]);

  const grouped = useMemo(() => {
    const out = { personal: [], organization: [], flacron: [] };
    templates.forEach((t) => { if (out[t.scope]) out[t.scope].push(t); });
    return out;
  }, [templates]);

  const visible = grouped[tab] || [];

  const handleDuplicate = async (t) => {
    try {
      await templatesAPI.duplicate(t.id);
      toast.success(`Duplicated "${t.name}" into My Templates`);
      setTab('personal');
      load();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not duplicate template');
    }
  };

  const runConfirmedAction = async () => {
    if (!confirmTarget) return;
    setWorking(true);
    try {
      const { type, template } = confirmTarget;
      if (type === 'archive') {
        await templatesAPI.archive(template.id);
        toast.success(`"${template.name}" archived`);
      } else if (type === 'restore') {
        await templatesAPI.restore(template.id);
        toast.success(`"${template.name}" restored`);
      } else if (type === 'delete') {
        await templatesAPI.remove(template.id);
        toast.success(`"${template.name}" deleted`);
      }
      setConfirmTarget(null);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Action failed');
      setConfirmTarget(null);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/dashboard" aria-label="Back to Dashboard" className="p-2 hover:bg-gray-100 rounded-lg transition-colors shrink-0">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-gray-900">Report Templates</h1>
              <p className="text-xs text-gray-500 mt-0.5">Reusable report structures — sections, defaults, and layout.</p>
            </div>
          </div>
          <button onClick={() => navigate('/templates/new')} className="btn-primary text-sm py-2 px-4 flex items-center gap-2 shrink-0">
            <Plus className="w-4 h-4" /> New Template
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 border-b border-gray-100">
          <div className="flex gap-1">
            {TABS.map((t) => {
              const Icon = t.icon;
              const count = grouped[t.id]?.length || 0;
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border-b-2 transition-colors ${
                    tab === t.id ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}>
                  <Icon className="w-4 h-4" /> {t.label}
                  {count > 0 && <span className="text-xs text-gray-400">({count})</span>}
                </button>
              );
            })}
          </div>
          {tab !== 'flacron' && (
            <label className="flex items-center gap-1.5 text-xs text-gray-500 pb-2 cursor-pointer">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-400" />
              Show archived
            </label>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <RefreshCw className="w-8 h-8 text-brand-500 animate-spin" />
            <p className="text-sm text-gray-500">Loading templates…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <AlertCircle className="w-8 h-8 text-amber-500" />
            <p className="text-sm text-gray-500">Could not load templates.</p>
            <button onClick={load} className="btn-secondary text-sm py-2 px-4 flex items-center gap-2">
              <RefreshCw className="w-4 h-4" /> Retry
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="card flex flex-col items-center justify-center py-20 gap-3 text-center px-4">
            <FolderOpen className="w-10 h-10 text-gray-300" />
            <div>
              <p className="text-gray-700 font-medium">
                {tab === 'personal' && 'No personal templates yet'}
                {tab === 'organization' && 'No organization templates yet'}
                {tab === 'flacron' && 'No Flacron templates available'}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                {tab === 'flacron'
                  ? 'Flacron-provided examples appear here automatically.'
                  : 'Build a reusable structure for a recurring report type.'}
              </p>
            </div>
            {tab !== 'flacron' && (
              <button onClick={() => navigate('/templates/new')} className="btn-primary text-sm py-2 px-4 flex items-center gap-2">
                <Plus className="w-4 h-4" /> Create Template
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {visible.map((t) => (
              <div key={t.id} className={`card p-4 flex flex-col gap-3 ${t.archived ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{t.name}</p>
                    {t.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{t.description}</p>}
                  </div>
                  {t.branding?.logoUrl && (
                    <img src={t.branding.logoUrl} alt="" className="w-10 h-10 object-contain rounded-lg border border-gray-100 shrink-0" />
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5 text-[11px] text-gray-500">
                  {t.fields?.lossType && (
                    <span className="px-2 py-0.5 rounded-full bg-gray-100">{t.fields.lossType}</span>
                  )}
                  {t.sections?.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-gray-100 flex items-center gap-1">
                      {t.sections.length} custom section{t.sections.length === 1 ? '' : 's'}
                    </span>
                  )}
                  {t.requiredFields?.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">{t.requiredFields.length} required field{t.requiredFields.length === 1 ? '' : 's'}</span>
                  )}
                  {t.branding?.logoObjectPath && (
                    <span className="px-2 py-0.5 rounded-full bg-gray-100 flex items-center gap-1"><ImageIcon className="w-3 h-3" /> Logo</span>
                  )}
                  {t.archived && <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-600">Archived</span>}
                </div>

                <div className="flex items-center gap-1.5 mt-auto pt-1">
                  {t.scope === 'flacron' ? (
                    <button onClick={() => handleDuplicate(t)} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5">
                      <Copy className="w-3.5 h-3.5" /> Use as starting point
                    </button>
                  ) : (
                    <>
                      <button onClick={() => navigate(`/templates/${t.id}/edit`)} className="btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1">
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </button>
                      <button onClick={() => handleDuplicate(t)} className="btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1" title="Duplicate">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      {t.archived ? (
                        <button onClick={() => setConfirmTarget({ type: 'restore', template: t })} className="text-xs py-1.5 px-2.5 rounded-btn border border-gray-200 text-gray-500 hover:bg-gray-50 flex items-center gap-1" title="Restore">
                          <ArchiveRestore className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button onClick={() => setConfirmTarget({ type: 'archive', template: t })} className="text-xs py-1.5 px-2.5 rounded-btn border border-gray-200 text-gray-500 hover:bg-gray-50 flex items-center gap-1" title="Archive">
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button onClick={() => setConfirmTarget({ type: 'delete', template: t })} className="text-xs py-1.5 px-2.5 rounded-btn border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 flex items-center gap-1" title="Delete permanently">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
                {t.scope === 'flacron' && (
                  <p className="text-[11px] text-gray-400 flex items-center gap-1"><Lock className="w-3 h-3" /> Built-in — duplicate it to customize</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {confirmTarget && (
          <ConfirmDialog
            title={
              confirmTarget.type === 'delete' ? 'Delete template?'
                : confirmTarget.type === 'archive' ? 'Archive template?'
                  : 'Restore template?'
            }
            message={
              confirmTarget.type === 'delete'
                ? `"${confirmTarget.template.name}" will be permanently deleted. This cannot be undone.`
                : confirmTarget.type === 'archive'
                  ? `"${confirmTarget.template.name}" will be hidden from the template picker. You can restore it later.`
                  : `"${confirmTarget.template.name}" will be available again in the template picker.`
            }
            confirmLabel={confirmTarget.type === 'delete' ? 'Delete' : confirmTarget.type === 'archive' ? 'Archive' : 'Restore'}
            danger={confirmTarget.type === 'delete'}
            loading={working}
            onConfirm={runConfirmedAction}
            onClose={() => setConfirmTarget(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
