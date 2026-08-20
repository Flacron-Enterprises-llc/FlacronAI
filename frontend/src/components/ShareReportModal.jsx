import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { X, Link2, Copy, Trash2, UserPlus, Loader2, ShieldCheck } from 'lucide-react';
import useEscapeToClose from '../hooks/useEscapeToClose';
import { reportsAPI } from '../services/api';

const PERMISSION_OPTIONS = [
  { value: 'view', label: 'View', hint: 'Read-only' },
  { value: 'comment', label: 'Comment', hint: 'Can also add comments' },
  { value: 'review', label: 'Review', hint: 'Can comment, edit, and approve' },
];

const EXPIRY_OPTIONS = [
  { value: 'never', label: 'No expiry' },
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
];

const formatExpiry = (share) => {
  if (share.legacy) return 'No expiry (legacy link)';
  if (!share.expiresAt) return 'No expiry';
  if (share.expired) return 'Expired';
  return `Expires ${new Date(share.expiresAt).toLocaleString()}`;
};

// Phase 19 (Sharing Permissions, Expiry, Comments & Review Requests).
// Owner-facing management surface for BOTH sharing mechanisms: anonymous,
// permission-leveled/expiring links (new), and direct "Invite User" access
// grants to a named, existing FlacronAI account -- kept as two visually
// distinct sections since PHASES.md calls them out as separate mechanisms.
export default function ShareReportModal({ report, onClose, onReportUpdate }) {
  useEscapeToClose(onClose, true, true);
  const [shares, setShares] = useState([]);
  const [loadingShares, setLoadingShares] = useState(true);
  const [permission, setPermission] = useState('view');
  const [expiresIn, setExpiresIn] = useState('never');
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePermission, setInvitePermission] = useState('view');
  const [inviting, setInviting] = useState(false);
  const [revokingUid, setRevokingUid] = useState(null);

  const loadShares = () => {
    setLoadingShares(true);
    reportsAPI.listShares(report.id)
      .then((res) => setShares(res.data?.shares || []))
      .catch(() => setShares([]))
      .finally(() => setLoadingShares(false));
  };

  useEffect(() => { loadShares(); }, [report.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateShare = async () => {
    setCreating(true);
    try {
      const res = await reportsAPI.createShare(report.id, { permission, expiresIn });
      try { await navigator.clipboard.writeText(res.data.url); toast.success('Share link created and copied to clipboard'); }
      catch { toast.success(`Share link created: ${res.data.url}`); }
      loadShares();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not create share link');
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async (url) => {
    try { await navigator.clipboard.writeText(url); toast.success('Link copied'); }
    catch { toast.success(url); }
  };

  const handleRevoke = async (share) => {
    setRevokingId(share.id);
    try {
      if (share.legacy) await reportsAPI.revokeShare(report.id);
      else await reportsAPI.revokeShareById(report.id, share.id);
      toast.success('Share link revoked');
      loadShares();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not revoke share link');
    } finally {
      setRevokingId(null);
    }
  };

  const handleInvite = async () => {
    const email = inviteEmail.trim();
    if (!email) return;
    setInviting(true);
    try {
      const res = await reportsAPI.inviteToReport(report.id, { email, permission: invitePermission });
      toast.success('Access granted');
      setInviteEmail('');
      onReportUpdate?.({ assignedUsers: res.data?.assignedUsers || report.assignedUsers });
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not invite user');
    } finally {
      setInviting(false);
    }
  };

  const handleRevokeInvite = async (uid) => {
    setRevokingUid(uid);
    try {
      await reportsAPI.revokeInvite(report.id, uid);
      toast.success('Access revoked');
      onReportUpdate?.({ assignedUsers: (report.assignedUsers || []).filter((a) => a.uid !== uid) });
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not revoke access');
    } finally {
      setRevokingUid(null);
    }
  };

  const assignedUsers = report.assignedUsers || [];

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}>
      <motion.div className="card w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="share-modal-title"
        initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 id="share-modal-title" className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Link2 className="w-4 h-4 text-brand-600" /> Share Report
          </h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Secure link creation */}
        <div className="space-y-2 mb-3">
          <div className="grid grid-cols-2 gap-2">
            <select value={permission} onChange={(e) => setPermission(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400">
              {PERMISSION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={expiresIn} onChange={(e) => setExpiresIn(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400">
              {EXPIRY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {permission === 'view' && !['finalized', 'approved', 'completed'].includes(report.status) && (
            <p className="text-xs text-amber-600">View links require the report to be finalized first. Use Comment or Review to share a draft.</p>
          )}
          <button onClick={handleCreateShare} disabled={creating}
            className="btn-primary w-full text-sm py-2 flex items-center justify-center gap-2 disabled:opacity-50">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            {creating ? 'Creating…' : 'Create Secure Link'}
          </button>
        </div>

        <div className="mb-5">
          {loadingShares ? (
            <p className="text-xs text-gray-400 py-2">Loading links…</p>
          ) : !shares.length ? (
            <p className="text-xs text-gray-400 py-2">No active share links.</p>
          ) : (
            <div className="space-y-2">
              {shares.map((s) => (
                <div key={s.id} className={`flex items-center justify-between gap-2 rounded-lg border p-2.5 text-xs ${s.revoked || s.expired ? 'border-gray-100 bg-gray-50 opacity-60' : 'border-gray-200'}`}>
                  <div className="min-w-0">
                    <span className="font-semibold text-gray-800 capitalize">{s.permission}</span>
                    <span className="text-gray-400"> · {s.revoked ? 'Revoked' : formatExpiry(s)}</span>
                  </div>
                  {!s.revoked && !s.expired && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => handleCopy(s.url)} title="Copy link" className="p-1.5 hover:bg-gray-100 rounded-lg">
                        <Copy className="w-3.5 h-3.5 text-gray-500" />
                      </button>
                      <button onClick={() => handleRevoke(s)} disabled={revokingId === s.id} title="Revoke" className="p-1.5 hover:bg-red-50 rounded-lg disabled:opacity-50">
                        {revokingId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin text-red-500" /> : <Trash2 className="w-3.5 h-3.5 text-red-500" />}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Direct Invite User (distinct mechanism) */}
        <div className="pt-4 border-t border-gray-100">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-2">
            <UserPlus className="w-4 h-4 text-brand-600" /> Invite User
          </h3>
          <p className="text-xs text-gray-400 mb-2">Give a named FlacronAI account direct access to this report (they must already have an account).</p>
          <div className="grid grid-cols-[1fr_auto] gap-2 mb-2">
            <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="name@company.com"
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400" />
            <select value={invitePermission} onChange={(e) => setInvitePermission(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400">
              {PERMISSION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}
            className="btn-secondary w-full text-sm py-2 flex items-center justify-center gap-2 disabled:opacity-50 mb-3">
            {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            {inviting ? 'Inviting…' : 'Grant Access'}
          </button>

          {!!assignedUsers.length && (
            <div className="space-y-2">
              {assignedUsers.map((a) => (
                <div key={a.uid} className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 p-2.5 text-xs">
                  <div className="min-w-0 truncate">
                    <span className="font-semibold text-gray-800 truncate">{a.email}</span>
                    <span className="text-gray-400 capitalize"> · {a.permission}</span>
                    {a.viaReviewRequest && <span className="ml-1 inline-flex items-center gap-0.5 text-brand-600"><ShieldCheck className="w-3 h-3" /> Reviewer</span>}
                  </div>
                  <button onClick={() => handleRevokeInvite(a.uid)} disabled={revokingUid === a.uid} title="Revoke access" className="p-1.5 hover:bg-red-50 rounded-lg shrink-0 disabled:opacity-50">
                    {revokingUid === a.uid ? <Loader2 className="w-3.5 h-3.5 animate-spin text-red-500" /> : <Trash2 className="w-3.5 h-3.5 text-red-500" />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
