import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { X, RefreshCw, FolderOpen, Users, Sparkles, ExternalLink } from 'lucide-react';
import useEscapeToClose from '../hooks/useEscapeToClose';
import { templatesAPI } from '../services/api';

const TABS = [
  { id: 'personal', label: 'My Templates', icon: FolderOpen },
  { id: 'organization', label: 'Organization', icon: Users },
  { id: 'flacron', label: 'Flacron Templates', icon: Sparkles },
];

// Phase 13 (Real Template Builder): a lightweight in-wizard picker used by
// Dashboard.jsx's "Start From a Report Template" step. Selection only applies
// the template's fields/id to the caller's own form state -- template
// management (create/edit/duplicate/archive) lives on the standalone
// /templates page, linked from here rather than duplicated into this modal.
export default function TemplatePickerModal({ onClose, onSelect }) {
  useEscapeToClose(onClose, true, true);
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState('personal');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    templatesAPI.list()
      .then((res) => { if (!cancelled) setTemplates(res.data?.templates || []); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const grouped = useMemo(() => {
    const out = { personal: [], organization: [], flacron: [] };
    templates.forEach((t) => { if (out[t.scope]) out[t.scope].push(t); });
    return out;
  }, [templates]);

  const visible = grouped[tab] || [];

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}>
      <motion.div className="card w-full max-w-lg p-6 max-h-[85vh] flex flex-col" role="dialog" aria-modal="true" aria-labelledby="template-picker-title"
        initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 id="template-picker-title" className="text-lg font-bold text-gray-900">Start From a Template</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="flex gap-1 mb-4 border-b border-gray-100">
          {TABS.map((t) => {
            const Icon = t.icon;
            const count = grouped[t.id]?.length || 0;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                  tab === t.id ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}>
                <Icon className="w-3.5 h-3.5" /> {t.label}
                {count > 0 && <span className="text-[10px] text-gray-400">({count})</span>}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto min-h-[200px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <RefreshCw className="w-6 h-6 text-brand-500 animate-spin" />
              <p className="text-xs text-gray-400">Loading templates…</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
              <p className="text-sm text-gray-500">Could not load templates.</p>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-center px-4">
              <p className="text-sm text-gray-500">
                {tab === 'personal' && 'You have no saved templates yet.'}
                {tab === 'organization' && 'No organization templates yet.'}
                {tab === 'flacron' && 'No Flacron templates available.'}
              </p>
              {tab !== 'flacron' && (
                <button onClick={() => navigate('/templates/new')} className="text-xs text-brand-600 hover:text-brand-700 underline">
                  Create one
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {visible.map((t) => (
                <button key={t.id} onClick={() => onSelect(t)}
                  className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:border-brand-400 hover:bg-brand-500/5 transition-all">
                  <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                  {t.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{t.description}</p>}
                  {t.requiredFields?.length > 0 && (
                    <p className="text-[11px] text-amber-600 mt-1">Requires: {t.requiredFields.join(', ')}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <button onClick={() => navigate('/templates')} className="mt-4 text-xs text-gray-400 hover:text-brand-600 flex items-center gap-1 justify-center">
          Manage all templates <ExternalLink className="w-3 h-3" />
        </button>
      </motion.div>
    </motion.div>
  );
}
