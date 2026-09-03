import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Webhook, Code2, Building2, Users, Cloud, HardDrive, FolderOpen,
  Plus, RefreshCw, AlertCircle, AlertTriangle, Trash2, X, Copy, Check,
  ChevronDown, ChevronUp, Lock,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import DashboardSidebar from '../components/DashboardSidebar';
import ConfirmDialog from '../components/ConfirmDialog';
import useEscapeToClose from '../hooks/useEscapeToClose';
import { webhooksAPI } from '../services/api';

// Phase 16 (Integrations Page & Webhook Management UI). Standalone route ahead
// of the Phase 30 routing migration -- same precedent as Analytics.jsx/
// Templates.jsx. Backend needs zero changes (per PHASES.md Phase 16's own
// scope note) -- this page only surfaces the already-complete, already-tested
// webhook backend (backend/routes/webhooks.js + services/webhookService.js).
//
// "Coming Soon" cards are exactly the 7 named integrations from PHASES.md
// Phase 16 task 1 (Guidewire, Duck Creek, Salesforce, HubSpot, Dropbox,
// Google Drive, OneDrive) -- per Golden Rule #1, never fabricate a promise
// for an integration not already named in the roadmap. They render with a
// generic lucide icon, not the real company logo/branding.
const COMING_SOON = [
  { name: 'Guidewire', icon: Building2, category: 'Claims & Policy Systems' },
  { name: 'Duck Creek', icon: Building2, category: 'Claims & Policy Systems' },
  { name: 'Salesforce', icon: Users, category: 'CRM' },
  { name: 'HubSpot', icon: Users, category: 'CRM' },
  { name: 'Dropbox', icon: Cloud, category: 'Cloud Storage' },
  { name: 'Google Drive', icon: HardDrive, category: 'Cloud Storage' },
  { name: 'OneDrive', icon: FolderOpen, category: 'Cloud Storage' },
];

const EVENT_META = {
  'report.generated': { label: 'Report Generated', desc: 'A new AI-drafted report was created and is awaiting review.' },
  'report.finalized': { label: 'Report Finalized', desc: 'A report was reviewed and approved by a licensed adjuster.' },
};
const eventLabel = (event) => EVENT_META[event]?.label
  || event.split('.').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
const eventDesc = (event) => EVENT_META[event]?.desc || '';

// One-time secret reveal -- mirrors Settings.jsx's KeyModal exactly (same
// pattern already established for API keys), generalized for both the
// create and rotate moments. Never re-fetchable after this closes: the
// backend only ever returns the full secret in the create/rotate response.
function SecretRevealModal({ secret, mode, onClose }) {
  const [copied, setCopied] = useState(false);
  useEscapeToClose(onClose);
  const handleCopy = () => {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-labelledby="secret-modal-title"
        initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 id="secret-modal-title" className="text-lg font-bold text-gray-900">
            {mode === 'rotated' ? 'Secret Rotated' : 'Webhook Registered'}
          </h2>
          <button onClick={onClose} aria-label="Close" title="Close"><X className="w-5 h-5 text-gray-600" /></button>
        </div>
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex gap-2 mb-4">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-amber-800 text-sm">
            {mode === 'rotated'
              ? 'Copy this new signing secret now — the previous secret no longer works, and this one will not be shown again.'
              : 'Copy this signing secret now. It will not be shown again.'}
          </p>
        </div>
        <div className="bg-gray-200 rounded-xl p-3 font-mono text-sm text-brand-800 break-all mb-4">{secret}</div>
        <div className="flex gap-3">
          <button onClick={handleCopy} className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm py-2">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy Secret'}
          </button>
          <button onClick={onClose} className="btn-secondary text-sm py-2 px-4">Done</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function WebhookRow({ webhook, busy, onRotate, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-xl border border-gray-200 bg-bg">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm text-gray-900 break-all">{webhook.url}</p>
          {webhook.description && <p className="text-xs text-gray-500 mt-0.5">{webhook.description}</p>}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {webhook.events.map((ev) => (
              <span key={ev} className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{eventLabel(ev)}</span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => onRotate(webhook)} disabled={busy} className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-50">
            Rotate Secret
          </button>
          <button onClick={() => onDelete(webhook)} disabled={busy} aria-label="Delete webhook" title="Delete webhook"
            className="p-2 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50">
            <Trash2 className="w-4 h-4 text-red-400" />
          </button>
          <button onClick={() => setExpanded((p) => !p)} aria-label={expanded ? 'Collapse details' : 'Expand details'} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-gray-500">
          <div><p className="text-gray-400">Secret</p><p className="font-mono text-gray-700 mt-0.5">{webhook.secretHint}</p></div>
          <div><p className="text-gray-400">Created</p><p className="text-gray-700 mt-0.5">{new Date(webhook.createdAt).toLocaleDateString()}</p></div>
          <div><p className="text-gray-400">Last Delivery</p><p className="text-gray-700 mt-0.5">{webhook.lastDeliveryAt ? new Date(webhook.lastDeliveryAt).toLocaleString() : 'Never delivered yet'}</p></div>
          <div>
            <p className="text-gray-400">Consecutive Failures</p>
            <p className={`mt-0.5 font-semibold ${webhook.failureCount > 0 ? 'text-red-600' : 'text-gray-700'}`}>{webhook.failureCount}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Integrations() {
  const navigate = useNavigate();
  const [eventCatalog, setEventCatalog] = useState(null);
  const [webhooksList, setWebhooksList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorCode, setErrorCode] = useState(null);

  const [url, setUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState([]);
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const [reveal, setReveal] = useState(null); // { secret, mode: 'created'|'rotated' }
  const [confirmTarget, setConfirmTarget] = useState(null); // { type: 'rotate'|'delete', webhook }
  const [actionBusyId, setActionBusyId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setErrorCode(null);
    Promise.all([webhooksAPI.getEvents(), webhooksAPI.getAll()])
      .then(([eventsRes, listRes]) => {
        setEventCatalog(eventsRes.data);
        setWebhooksList(listRes.data?.endpoints || []);
      })
      .catch((err) => {
        setErrorCode(err?.response?.data?.code || 'ERROR');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleEvent = (event) => {
    setSelectedEvents((current) => (
      current.includes(event) ? current.filter((e) => e !== event) : [...current, event]
    ));
  };

  const extractErrorMessage = (err, fallback) => {
    const data = err?.response?.data;
    if (data?.errors) return Object.values(data.errors).map((e) => e.msg).filter(Boolean).join(', ') || fallback;
    return data?.error || fallback;
  };

  const handleCreate = async () => {
    if (!url.trim()) { toast.error('Enter an endpoint URL'); return; }
    if (selectedEvents.length === 0) { toast.error('Select at least one event'); return; }
    setCreating(true);
    try {
      const res = await webhooksAPI.create({ url: url.trim(), events: selectedEvents, description: description.trim() || undefined });
      setReveal({ mode: 'created', secret: res.data.secret });
      setUrl('');
      setSelectedEvents([]);
      setDescription('');
      toast.success('Webhook registered');
      load();
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Failed to register webhook'));
    } finally {
      setCreating(false);
    }
  };

  const runConfirmedAction = async () => {
    if (!confirmTarget) return;
    const { type, webhook } = confirmTarget;
    setActionBusyId(webhook.endpointId);
    try {
      if (type === 'rotate') {
        const res = await webhooksAPI.rotateSecret(webhook.endpointId);
        setReveal({ mode: 'rotated', secret: res.data.secret });
        toast.success('Secret rotated — the previous secret no longer works');
      } else {
        await webhooksAPI.remove(webhook.endpointId);
        toast.success('Webhook deleted');
      }
      setConfirmTarget(null);
      load();
    } catch (err) {
      toast.error(extractErrorMessage(err, type === 'rotate' ? 'Failed to rotate secret' : 'Failed to delete webhook'));
      setConfirmTarget(null);
    } finally {
      setActionBusyId(null);
    }
  };

  const apiAccessDenied = errorCode === 'API_ACCESS_DENIED';
  const genuineError = errorCode && !apiAccessDenied;

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <Navbar />
      <div className="flex flex-1 pt-16 min-h-0">
        <DashboardSidebar activeId="integrations" />
        <main className="min-w-0 flex-1">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-5">
          <Link to="/dashboard" aria-label="Back to Dashboard" className="p-2 hover:bg-gray-100 rounded-lg transition-colors shrink-0">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900">Integrations</h1>
            <p className="text-xs text-gray-500 mt-0.5">Connect FlacronAI to your own systems.</p>
          </div>
        </div>

        {/* Real integrations */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div className="card p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center shrink-0">
                <Webhook className="w-5 h-5 text-brand-500" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">Webhooks</p>
                <p className="text-xs text-gray-500">
                  {loading ? 'Loading…' : apiAccessDenied ? 'Requires Professional plan or higher' : `${webhooksList.length} active endpoint${webhooksList.length === 1 ? '' : 's'}`}
                </p>
              </div>
            </div>
            <p className="text-gray-600 text-sm">Get notified in real time when a report is generated or finalized.</p>
          </div>
          <div className="card p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                <Code2 className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">API</p>
                <p className="text-xs text-gray-500">Programmatic access</p>
              </div>
            </div>
            <p className="text-gray-600 text-sm mb-3">Generate and manage API keys for programmatic access.</p>
            <div className="flex gap-2">
              <button onClick={() => navigate('/settings?tab=api-keys')} className="btn-secondary text-xs py-1.5 px-3">Manage API Keys</button>
            </div>
          </div>
        </div>

        {/* Coming Soon */}
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">More Integrations</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {COMING_SOON.map((item) => (
              <div key={item.name}
                className="flex flex-col items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 p-3 text-center opacity-70 cursor-not-allowed select-none"
                aria-disabled="true" title={`${item.name} — coming soon, not yet available`}>
                <item.icon className="w-6 h-6 text-gray-400" />
                <span className="text-xs font-medium text-gray-600">{item.name}</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">Coming Soon</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3">These integrations are planned but not yet built — nothing here is active or clickable.</p>
        </div>

        {/* Webhook management */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Webhook Management</h2>
          <p className="text-sm text-gray-500 mb-4">
            {eventCatalog
              ? `Every delivery is signed with HMAC-SHA256 (${eventCatalog.delivery.signatureHeader} header), ${eventCatalog.delivery.maxAttempts} attempts with backoff, ${eventCatalog.delivery.timeoutMs / 1000}s timeout per attempt.`
              : 'Get a signed HTTP POST whenever a subscribed event happens.'}
          </p>

          {loading ? (
            <div className="space-y-3">
              {[...Array(2)].map((_, i) => <div key={i} className="skeleton h-16 w-full" />)}
            </div>
          ) : apiAccessDenied ? (
            <div className="text-center py-10">
              <Lock className="w-8 h-8 text-gray-400 mx-auto mb-3" />
              <h3 className="text-gray-900 font-semibold mb-1">Webhooks Require Professional Plan or Higher</h3>
              <p className="text-gray-600 text-sm mb-4">Upgrade your plan to register and manage webhook endpoints.</p>
              <button onClick={() => navigate('/pricing')} className="btn-primary text-sm py-2 px-6">View Plans</button>
            </div>
          ) : genuineError ? (
            <div className="text-center py-10">
              <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
              <p className="text-gray-600 text-sm font-medium mb-3">Could not load webhooks.</p>
              <button onClick={load} className="btn-secondary text-sm py-2 px-4 inline-flex items-center gap-2">
                <RefreshCw className="w-4 h-4" /> Retry
              </button>
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-gray-200 p-4 mb-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Register a New Webhook</h3>
                <label className="block text-xs font-medium text-gray-700 mb-1">Endpoint URL</label>
                <input type="url" className="input w-full mb-3" placeholder="https://your-app.example.com/webhooks/flacronai"
                  value={url} onChange={(e) => setUrl(e.target.value)} />
                <label className="block text-xs font-medium text-gray-700 mb-1">Events</label>
                <div className="grid gap-2 sm:grid-cols-2 mb-3">
                  {(eventCatalog?.events || []).map((ev) => (
                    <label key={ev} className="flex gap-2 rounded-lg border border-gray-200 p-3 cursor-pointer hover:border-brand-300">
                      <input type="checkbox" className="mt-0.5 accent-brand-500" checked={selectedEvents.includes(ev)} onChange={() => toggleEvent(ev)} />
                      <span>
                        <span className="block text-sm font-medium text-gray-900">{eventLabel(ev)}</span>
                        <span className="block text-xs text-gray-500 mt-0.5">{eventDesc(ev)}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Description (optional)</label>
                <input className="input w-full mb-3" placeholder="e.g. Production sync" maxLength={200}
                  value={description} onChange={(e) => setDescription(e.target.value)} />
                <button onClick={handleCreate} disabled={creating} className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-50">
                  <Plus className="w-4 h-4" /> {creating ? 'Registering…' : 'Register Webhook'}
                </button>
              </div>

              <h3 className="text-sm font-semibold text-gray-900 mb-3">Registered Webhooks</h3>
              {webhooksList.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-gray-200 rounded-xl">
                  <Webhook className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">No webhooks registered yet. Add one above.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {webhooksList.map((webhook) => (
                    <WebhookRow key={webhook.endpointId} webhook={webhook} busy={actionBusyId === webhook.endpointId}
                      onRotate={(w) => setConfirmTarget({ type: 'rotate', webhook: w })}
                      onDelete={(w) => setConfirmTarget({ type: 'delete', webhook: w })} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
        </main>
      </div>

      <AnimatePresence>
        {reveal && <SecretRevealModal secret={reveal.secret} mode={reveal.mode} onClose={() => setReveal(null)} />}
      </AnimatePresence>

      <AnimatePresence>
        {confirmTarget && (
          <ConfirmDialog
            title={confirmTarget.type === 'rotate' ? 'Rotate signing secret?' : 'Delete this webhook?'}
            message={
              confirmTarget.type === 'rotate'
                ? 'The current secret will stop working immediately. Update your receiving endpoint with the new secret shown next.'
                : `Deliveries to ${confirmTarget.webhook.url} will stop immediately. This cannot be undone.`
            }
            confirmLabel={confirmTarget.type === 'rotate' ? 'Rotate Secret' : 'Delete'}
            danger={confirmTarget.type === 'delete'}
            loading={actionBusyId === confirmTarget.webhook.endpointId}
            onConfirm={runConfirmedAction}
            onClose={() => setConfirmTarget(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
