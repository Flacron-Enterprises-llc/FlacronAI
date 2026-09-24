import { useEffect, useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Settings, RefreshCw, AlertCircle, CheckCircle, Image as ImageIcon, ShieldAlert } from 'lucide-react';
import Navbar from '../components/Navbar';
import { salesAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { getAdminEmail } from '../utils/adminEmail.js';
import useEscapeToClose from '../hooks/useEscapeToClose';
import { PLAN_IDS, UNLIMITED, buildPlanConfigPatch, validatePlanConfigForm, isPlanConfigFormDirty } from '../utils/planConfigPatch.js';

// Phase 48. Extends the admin surface AdminTierUpdate.jsx started -- this
// page owns Phase 48's PlanConfig editing UI, calling the SAME allowlisted
// write API Phase 44's schema/enforcement is built on (never a second,
// independently-editable config).
export default function AdminPlanConfig() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const ADMIN_EMAIL = getAdminEmail();

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.email?.trim().toLowerCase() !== ADMIN_EMAIL) navigate('/dashboard', { replace: true });
  }, [user, authLoading, navigate, ADMIN_EMAIL]);

  const [loadState, setLoadState] = useState('loading'); // loading | loaded | error
  const [serverView, setServerView] = useState(null); // last-fetched { config, revision, source, ... }
  const [form, setForm] = useState(null); // editable draft
  const [changeSummary, setChangeSummary] = useState('');
  const [saveState, setSaveState] = useState('idle'); // idle | saving | conflict | error
  const [saveError, setSaveError] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  const [packs, setPacks] = useState(null);
  const [integrations, setIntegrations] = useState(null);

  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [rollbackSummary, setRollbackSummary] = useState('');
  const [rollbackAck, setRollbackAck] = useState(false);
  const [rollbackSaving, setRollbackSaving] = useState(false);

  useEscapeToClose(() => setShowPreview(false), showPreview);
  useEscapeToClose(() => setRollbackOpen(false), rollbackOpen);

  const buildFormFromView = (view) => ({
    plans: Object.fromEntries(PLAN_IDS.map((id) => [id, { basePhotoLimit: view.config.plans[id].basePhotoLimit }])),
    addOnsEnabled: !!view.config.addOnsEnabled,
    displayLabels: { ...view.displayLabels },
  });

  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      const res = await salesAPI.getPlanConfig();
      setServerView(res.data);
      setForm(buildFormFromView(res.data));
      setLoadState('loaded');
    } catch {
      setLoadState('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    salesAPI.getAdminPhotoPacks().then((res) => setPacks(res.data.packs)).catch(() => setPacks([]));
    salesAPI.getIntegrationStatus().then((res) => setIntegrations(res.data.integrations)).catch(() => setIntegrations(null));
  }, []);

  const isDirty = useMemo(() => {
    if (!serverView || !form) return false;
    return isPlanConfigFormDirty(form, buildFormFromView(serverView));
  }, [form, serverView]);

  // Unsaved-changes warning on tab close/navigation away.
  useEffect(() => {
    const handler = (e) => { if (isDirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  if (authLoading || !user || user.email?.trim().toLowerCase() !== ADMIN_EMAIL) return null;

  const setPlanLimit = (id, value) => {
    setForm((p) => ({ ...p, plans: { ...p.plans, [id]: { basePhotoLimit: value } } }));
  };
  const setLabel = (id, value) => {
    setForm((p) => ({ ...p, displayLabels: { ...p.displayLabels, [id]: value } }));
  };

  // Only the fields that actually differ -- the PUT payload never resends
  // untouched values, matching the server's allowlisted-merge contract.
  const buildPatch = () => buildPlanConfigPatch(form, buildFormFromView(serverView));

  const patchPreview = showPreview ? buildPatch() : null;

  const openPreview = () => {
    const issues = validatePlanConfigForm(form, changeSummary);
    if (issues.length) { toast.error(issues[0]); return; }
    if (Object.keys(buildPatch()).length === 0) { toast('No changes to publish.'); return; }
    setShowPreview(true);
  };

  const publish = async () => {
    setSaveState('saving');
    setSaveError(null);
    try {
      const res = await salesAPI.updatePlanConfig(buildPatch(), changeSummary.trim(), serverView.revision);
      setServerView((prev) => ({ ...prev, config: res.data.config, revision: res.data.config.revision }));
      setForm(buildFormFromView({ ...serverView, config: res.data.config }));
      setChangeSummary('');
      setSaveState('idle');
      setShowPreview(false);
      toast.success('Plan configuration published.');
    } catch (err) {
      if (err.response?.status === 409) {
        setSaveState('conflict');
        setSaveError('This configuration changed since you loaded it.');
      } else {
        setSaveState('error');
        setSaveError(err.response?.data?.error || 'Failed to publish changes.');
      }
    }
  };

  const doRollback = async () => {
    if (!rollbackAck || !rollbackSummary.trim()) return;
    setRollbackSaving(true);
    try {
      await salesAPI.rollbackPlanConfigToLegacy(rollbackSummary.trim(), serverView?.revision);
      toast.success('Rolled back to the legacy flat-100 profile.');
      setRollbackOpen(false);
      setRollbackSummary('');
      setRollbackAck(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Rollback failed.');
    } finally {
      setRollbackSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <div className="pt-24 pb-16 px-4 max-w-3xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <Settings className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Admin — Plan Configuration</h1>
              <p className="text-gray-600 text-sm">Photo limits, add-on packs, and safe integration status</p>
            </div>
          </div>

          {isDirty && (
            <div role="alert" className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" /> You have unsaved changes.
            </div>
          )}

          {loadState === 'loading' && <div className="card p-6 text-center text-gray-500 text-sm">Loading configuration…</div>}
          {loadState === 'error' && (
            <div className="card p-6 text-center">
              <p className="text-sm text-gray-600 mb-3">Failed to load plan configuration.</p>
              <button onClick={load} className="btn-primary text-sm py-2 px-4">Retry</button>
            </div>
          )}

          {loadState === 'loaded' && form && (
            <>
              <div className="card p-5 mb-5 text-xs text-gray-500 flex flex-wrap gap-x-6 gap-y-1">
                <span>Revision: <strong className="text-gray-700">{serverView.revision}</strong></span>
                <span>Source: <strong className="text-gray-700">{serverView.source === 'firestore' ? 'Firestore (active)' : 'Trusted built-in fallback'}</strong></span>
                <span>Last updated: <strong className="text-gray-700">{serverView.updatedAt ? new Date(serverView.updatedAt).toLocaleString() : '—'}</strong></span>
                <span>By: <strong className="text-gray-700">{serverView.updatedBy || '—'}</strong></span>
                {serverView.isLegacyRollback && (
                  <span className="text-red-600 font-semibold flex items-center gap-1"><ShieldAlert className="w-3.5 h-3.5" /> Legacy rollback profile active</span>
                )}
              </div>

              <div className="card p-6 mb-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">Base Photo Limit per Plan</h2>
                <div className="space-y-4">
                  {PLAN_IDS.map((id) => {
                    const unlimited = form.plans[id].basePhotoLimit === UNLIMITED;
                    return (
                      <div key={id} className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3 items-center">
                        <div>
                          <label htmlFor={`label-${id}`} className="label">Display label</label>
                          <input id={`label-${id}`} className="input" value={form.displayLabels[id] || ''}
                            onChange={(e) => setLabel(id, e.target.value)} maxLength={60} />
                          <span className="text-[11px] text-gray-500">{id}</span>
                        </div>
                        <div>
                          <label htmlFor={`limit-${id}`} className="label">Photos / report</label>
                          <input id={`limit-${id}`} type="number" min={0} className="input w-28" disabled={unlimited}
                            value={unlimited ? '' : form.plans[id].basePhotoLimit}
                            onChange={(e) => setPlanLimit(id, Number(e.target.value))} />
                        </div>
                        <label className="flex items-center gap-2 text-sm text-gray-700 mt-5">
                          <input type="checkbox" checked={unlimited}
                            onChange={(e) => setPlanLimit(id, e.target.checked ? UNLIMITED : 100)} />
                          Unlimited
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="card p-6 mb-5 space-y-3">
                <h2 className="text-sm font-semibold text-gray-700 mb-1">Add-Ons & Report Behavior</h2>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={form.addOnsEnabled}
                    onChange={(e) => setForm((p) => ({ ...p, addOnsEnabled: e.target.checked }))} />
                  Report-specific photo add-on packs supported
                </label>
                {/* No watermark toggle: watermarks are decided server-side by
                    utils/watermarkPolicy.js from report review status and the
                    plan's tier flag, and PlanConfig's watermarkPolicyEnabled is
                    not read anywhere -- a toggle here would imply control the
                    system doesn't have. */}
                <p className="text-xs text-gray-500">
                  Watermarks are not configurable here: un-reviewed drafts are always marked DRAFT, and the
                  branding watermark follows each plan&apos;s tier.
                </p>
              </div>

              <div className="card p-6 mb-5">
                <label htmlFor="change-summary" className="label">Change summary (required to publish)</label>
                <textarea id="change-summary" className="input min-h-[70px] resize-none" maxLength={500}
                  value={changeSummary} onChange={(e) => setChangeSummary(e.target.value)}
                  placeholder="e.g. Raise Starter photo limit ahead of a promo" />
                <div className="flex items-center gap-3 mt-4">
                  <button onClick={openPreview} className="btn-primary text-sm py-2 px-4">Preview & Publish</button>
                  {isDirty && (
                    <button onClick={() => { setForm(buildFormFromView(serverView)); setChangeSummary(''); }} className="text-sm text-gray-500 hover:text-gray-700">
                      Discard changes
                    </button>
                  )}
                </div>
                {saveState === 'conflict' && (
                  <div className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-700 flex items-center justify-between gap-3">
                    <span>{saveError}</span>
                    <button onClick={load} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" /> Reload latest</button>
                  </div>
                )}
                {saveState === 'error' && (
                  <div className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-700">{saveError}</div>
                )}
              </div>

              {/* Read-only photo pack catalogue */}
              <div className="card p-6 mb-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2"><ImageIcon className="w-4 h-4" /> Photo Add-On Packs (read-only)</h2>
                {!packs ? <p className="text-sm text-gray-500">Loading…</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 border-b border-gray-200">
                          <th className="py-2 pr-3">Pack</th><th className="py-2 pr-3">Capacity</th><th className="py-2 pr-3">Price</th>
                          <th className="py-2 pr-3">Active</th><th className="py-2 pr-3">Test Price ID</th><th className="py-2">Live Price ID</th>
                        </tr>
                      </thead>
                      <tbody>
                        {packs.map((p) => (
                          <tr key={p.id} className="border-b border-gray-100">
                            <td className="py-2 pr-3">{p.label}</td>
                            <td className="py-2 pr-3">+{p.capacity}</td>
                            <td className="py-2 pr-3">${(p.amountCents / 100).toFixed(2)}</td>
                            <td className="py-2 pr-3">{p.active ? <CheckCircle className="w-4 h-4 text-green-500" /> : <span className="text-gray-400">Inactive</span>}</td>
                            <td className="py-2 pr-3">{p.priceIdStatus.test === 'configured' ? 'Configured' : 'Not configured'}</td>
                            <td className="py-2">{p.priceIdStatus.live === 'configured' ? 'Configured' : 'Not configured'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-3">Pack capacity/pricing is fixed to the client-confirmed catalogue; only test/live Price ID status is shown, never the ID itself.</p>
              </div>

              {/* Integration status (safe, no secrets) */}
              <div className="card p-6 mb-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">Integration Status</h2>
                {!integrations ? <p className="text-sm text-gray-500">Loading…</p> : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div className="flex justify-between"><span className="text-gray-600">OpenAI pricing</span><StatusPill status={integrations.openaiPricing.status} /></div>
                    <div className="flex justify-between"><span className="text-gray-600">Stripe add-ons (test)</span><StatusPill status={integrations.stripeAddOns.test.status} /></div>
                    <div className="flex justify-between"><span className="text-gray-600">Stripe add-ons (live)</span><StatusPill status={integrations.stripeAddOns.live.status} /></div>
                    <div className="flex justify-between"><span className="text-gray-600">Google address</span><StatusPill status={integrations.googleAddress.status} /></div>
                    <div className="flex justify-between"><span className="text-gray-600">RealtyAPI</span><StatusPill status={integrations.realtyApi.status} /></div>
                  </div>
                )}
              </div>

              {/* Legacy rollback -- deliberately dangerous, separated from the normal form */}
              <div className="card p-6 border border-red-200">
                <h2 className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-2"><ShieldAlert className="w-4 h-4" /> Emergency Legacy Rollback</h2>
                <p className="text-xs text-gray-600 mb-3">Applies the old flat-100-photos-for-every-plan profile. This is an incident-response action, never a normal edit, and never happens automatically.</p>
                <button onClick={() => setRollbackOpen(true)} className="text-sm text-red-600 hover:text-red-700 font-medium">Roll back to legacy profile…</button>
              </div>
            </>
          )}
        </motion.div>
      </div>

      <AnimatePresence>
        {showPreview && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => saveState !== 'saving' && setShowPreview(false)}>
            <motion.div className="card w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto" role="dialog" aria-modal="true" aria-label="Preview plan configuration changes"
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-bold text-gray-900 mb-1">Confirm publish</h2>
              <p className="text-xs text-gray-500 mb-4">Revision {serverView.revision} → {serverView.revision + 1}</p>
              <pre className="bg-gray-50 rounded-lg p-3 text-xs overflow-x-auto mb-4">{JSON.stringify(patchPreview, null, 2)}</pre>
              <p className="text-sm text-gray-700 mb-4"><strong>Change summary:</strong> {changeSummary}</p>
              <div className="flex gap-3">
                <button onClick={() => setShowPreview(false)} disabled={saveState === 'saving'} className="btn-secondary flex-1 text-sm py-2">Cancel</button>
                <button onClick={publish} disabled={saveState === 'saving'} className="btn-primary flex-1 text-sm py-2 flex items-center justify-center gap-2 disabled:opacity-50">
                  {saveState === 'saving' ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                  {saveState === 'saving' ? 'Publishing…' : 'Confirm & Publish'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {rollbackOpen && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !rollbackSaving && setRollbackOpen(false)}>
            <motion.div className="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-label="Confirm legacy rollback"
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-bold text-red-700 mb-2">Roll back to legacy profile?</h2>
              <p className="text-sm text-gray-600 mb-4">Every plan reverts to a flat 100-photo limit, including Enterprise. This is not the normal public configuration.</p>
              <label htmlFor="rollback-summary" className="label">Reason (required)</label>
              <textarea id="rollback-summary" className="input min-h-[60px] resize-none mb-3" value={rollbackSummary}
                onChange={(e) => setRollbackSummary(e.target.value)} placeholder="Incident description" />
              <label className="flex items-center gap-2 text-sm text-gray-700 mb-4">
                <input type="checkbox" checked={rollbackAck} onChange={(e) => setRollbackAck(e.target.checked)} />
                I understand this is an emergency action and will replace the active configuration.
              </label>
              <div className="flex gap-3">
                <button onClick={() => setRollbackOpen(false)} disabled={rollbackSaving} className="btn-secondary flex-1 text-sm py-2">Cancel</button>
                <button onClick={doRollback} disabled={rollbackSaving || !rollbackAck || !rollbackSummary.trim()}
                  className="flex-1 text-sm py-2 rounded-xl bg-red-600 text-white font-semibold disabled:opacity-50">
                  {rollbackSaving ? 'Rolling back…' : 'Roll back'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const STATUS_LABELS = {
  configured: 'Configured',
  verified: 'Verified',
  not_configured: 'Not configured',
  live_validation_pending: 'Live validation pending',
  contract_pending: 'Contract pending',
};

function StatusPill({ status }) {
  const label = STATUS_LABELS[status] || status;
  const tone = status === 'verified' ? 'bg-green-100 text-green-700'
    : status === 'not_configured' ? 'bg-gray-100 text-gray-600'
    : 'bg-amber-100 text-amber-700';
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${tone}`}>{label}</span>;
}
