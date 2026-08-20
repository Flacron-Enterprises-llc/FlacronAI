import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Monitor, FileText, Pencil, CheckCircle, Download, RefreshCw,
  AlertCircle, ShieldCheck, Lock, X, Share2, UserCheck, XCircle, RotateCcw,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import ReportMarkdown from '../components/ReportMarkdown';
import ExportOptionsModal from '../components/ExportOptionsModal';
import ShareReportModal from '../components/ShareReportModal';
import CommentsPanel from '../components/CommentsPanel';
import useEscapeToClose from '../hooks/useEscapeToClose';
import { useAuth } from '../context/AuthContext';
import { reportsAPI, teamsAPI } from '../services/api';
import api from '../services/api';
import { parseReportSections } from '../utils/reportSections';

// Kept in sync with Dashboard.jsx's TIER_EXPORTS -- purely a UX convenience
// (which buttons look enabled). The server enforces `tier.exportFormats` on
// every /export call regardless of what this list says, so a stale value
// here can never grant an unentitled export (Golden Rule #4).
const TIER_EXPORTS = {
  starter: ['pdf'],
  professional: ['pdf', 'docx', 'html'],
  agency: ['pdf', 'docx', 'html'],
  enterprise: ['pdf', 'docx', 'html'],
};

const REVIEWED_STATUSES = ['finalized', 'approved', 'completed'];

function ApproveModal({ report, onClose, onApproved }) {
  useEscapeToClose(onClose, true, true);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseState, setLicenseState] = useState('');
  const [company, setCompany] = useState('');
  const [confirmReview, setConfirmReview] = useState(false);
  const [approving, setApproving] = useState(false);

  const submit = async () => {
    if (!name.trim() || !licenseNumber.trim() || !licenseState.trim() || !company.trim()) {
      toast.error('Full name, license number, license state, and company/firm are required.');
      return;
    }
    if (!confirmReview) {
      toast.error('You must confirm you have reviewed the report before approving.');
      return;
    }
    setApproving(true);
    try {
      const res = await reportsAPI.approve(report.id, {
        content: report.content,
        signature: { name: name.trim(), title: title.trim(), licenseNumber: licenseNumber.trim(), licenseState: licenseState.trim(), company: company.trim() },
        confirmReview: true,
      });
      toast.success('Report approved & finalized — exports are now clean');
      onApproved(res.data?.report || {});
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Approval failed');
    } finally {
      setApproving(false);
    }
  };

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={() => !approving && onClose()}>
      <motion.div className="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-labelledby="approve-modal-title"
        initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 id="approve-modal-title" className="text-lg font-bold text-gray-900">Approve &amp; Finalize</h2>
          <button onClick={onClose} disabled={approving} aria-label="Close" className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">This finalizes the report as reviewed. Exports will no longer carry the DRAFT watermark. Any later edit reopens it as a draft.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Full name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Adjuster"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Senior Adjuster"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">License number *</label>
            <input value={licenseNumber} onChange={e => setLicenseNumber(e.target.value)} placeholder="TX-ADJ-583920"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">License state *</label>
            <input value={licenseState} onChange={e => setLicenseState(e.target.value)} placeholder="TX"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400" />
          </div>
        </div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Company / adjusting firm *</label>
        <input value={company} onChange={e => setCompany(e.target.value)} placeholder="ABC Claims Services"
          className="w-full mb-3 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400" />
        <label className="flex items-start gap-2 mb-4 text-xs text-gray-700 cursor-pointer">
          <input type="checkbox" checked={confirmReview} onChange={e => setConfirmReview(e.target.checked)}
            className="mt-0.5 rounded border-gray-300 text-brand-600 focus:ring-brand-400" />
          <span>I confirm that I have reviewed this report, made any necessary corrections, and approve this version for final export.</span>
        </label>
        <div className="flex gap-3">
          <button onClick={onClose} disabled={approving} className="btn-secondary flex-1 text-sm py-2 disabled:opacity-50">Cancel</button>
          <button onClick={submit} disabled={approving} className="btn-primary flex-1 text-sm py-2 flex items-center justify-center gap-2 disabled:opacity-50">
            {approving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {approving ? 'Approving…' : 'Approve & Finalize'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Phase 19: owner assigns an in-organization reviewer (supervisor review
// request). Deliberately lists only the caller's own team roster, never any
// other organization's -- reusing the same endpoint EnterpriseDashboard.jsx
// already uses for team management.
function RequestReviewModal({ report, currentUid, onClose, onRequested }) {
  useEscapeToClose(onClose, true, true);
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [reviewerUid, setReviewerUid] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    teamsAPI.getMembers()
      .then((res) => setMembers(
        (res.data?.members || [])
          // Only members who have actually accepted (a real Firebase uid to
          // grant access to) and aren't suspended can be assigned a review.
          .filter((m) => m.userId && m.userId !== currentUid && m.status !== 'suspended')
      ))
      .catch(() => setMembers([]))
      .finally(() => setLoadingMembers(false));
  }, [currentUid]);

  const submit = async () => {
    if (!reviewerUid) { toast.error('Choose a reviewer'); return; }
    setSubmitting(true);
    try {
      const res = await reportsAPI.requestReview(report.id, { reviewerUid, notes: notes.trim() });
      toast.success('Review requested');
      onRequested(res.data?.reviewRequest);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not request review');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={() => !submitting && onClose()}>
      <motion.div className="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-labelledby="request-review-title"
        initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 id="request-review-title" className="text-lg font-bold text-gray-900">Request Review</h2>
          <button onClick={onClose} disabled={submitting} aria-label="Close" className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">Assign a reviewer from your organization. They'll be able to comment, edit, and approve or return this report -- without seeing any of your other reports.</p>
        {loadingMembers ? (
          <p className="text-sm text-gray-400 py-3">Loading team…</p>
        ) : !members.length ? (
          <p className="text-sm text-gray-500 py-3">No other active team members found. Add a team member first, or use Invite User to share with an external reviewer instead.</p>
        ) : (
          <select value={reviewerUid} onChange={(e) => setReviewerUid(e.target.value)}
            className="w-full mb-3 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400">
            <option value="">Select a reviewer…</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>{m.email} ({m.role})</option>
            ))}
          </select>
        )}
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional note for the reviewer…"
          className="w-full mb-4 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400" />
        <div className="flex gap-3">
          <button onClick={onClose} disabled={submitting} className="btn-secondary flex-1 text-sm py-2 disabled:opacity-50">Cancel</button>
          <button onClick={submit} disabled={submitting || !members.length} className="btn-primary flex-1 text-sm py-2 flex items-center justify-center gap-2 disabled:opacity-50">
            {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
            {submitting ? 'Sending…' : 'Send Request'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Phase 19: the ASSIGNED reviewer declining or asking for changes. Approving
// reuses the existing ApproveModal/POST /:id/approve flow directly (a
// 'review'-tier grantee is now authorized there too) -- this only covers
// the two outcomes that have no existing analog.
function ReviewResponseModal({ decision, onClose, onSubmit }) {
  useEscapeToClose(onClose, true, true);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const isReject = decision === 'rejected';

  const submit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(notes.trim());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={() => !submitting && onClose()}>
      <motion.div className="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-labelledby="review-response-title"
        initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 id="review-response-title" className="text-lg font-bold text-gray-900">{isReject ? 'Decline Review' : 'Return for Changes'}</h2>
          <button onClick={onClose} disabled={submitting} aria-label="Close" className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          {isReject ? 'The report stays a draft and the owner is notified you declined.' : 'The report goes back to the owner as a draft with your notes.'}
        </p>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Notes for the owner…"
          className="w-full mb-4 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400" />
        <div className="flex gap-3">
          <button onClick={onClose} disabled={submitting} className="btn-secondary flex-1 text-sm py-2 disabled:opacity-50">Cancel</button>
          <button onClick={submit} disabled={submitting} className="btn-primary flex-1 text-sm py-2 flex items-center justify-center gap-2 disabled:opacity-50">
            {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : isReject ? <XCircle className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
            {submitting ? 'Sending…' : isReject ? 'Decline' : 'Send Back'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Phase 11 (Report Preview, Export Options & Document Layout Completion): a
// real, bookmarkable, directly-linkable report page -- ahead of the broader
// Phase 30 routing migration, added here specifically because the spec calls
// for a dedicated /reports/:id/preview URL with its own Desktop/PDF toggle,
// distinct from Dashboard.jsx's activeView='generate' editor. It fetches by
// ID independently (no dependency on Dashboard's in-memory state), so a
// direct visit or a refresh both work the same way.
export default function ReportPreviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { tier, user } = useAuth();

  const [report, setReport] = useState(null);
  // Phase 19: what the CURRENT viewer may do on this specific report --
  // 'owner' | 'view' | 'comment' | 'review'. Drives every share/comment/
  // review-request affordance below; never assumed, always as returned by
  // GET /:id (server-authoritative, see backend/utils/reportAccess.js).
  const [myAccess, setMyAccess] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('desktop');
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showRequestReviewModal, setShowRequestReviewModal] = useState(false);
  const [reviewResponseDecision, setReviewResponseDecision] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    reportsAPI.getOne(id)
      .then((res) => {
        setReport(res.data?.report || res.data);
        // Default to the least-privileged tier if the field is somehow
        // absent -- never assume full access.
        setMyAccess(res.data?.myAccess || 'view');
      })
      .catch((err) => setError(err?.response?.status === 404 ? 'not_found' : 'error'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    return () => { if (pdfUrl) window.URL.revokeObjectURL(pdfUrl); };
  }, [pdfUrl]);

  const loadPdfPreview = useCallback(async () => {
    if (!report) return;
    setPdfLoading(true);
    setPdfError(false);
    try {
      const exportRes = await reportsAPI.export(report.id, { format: 'pdf' });
      const { filename } = exportRes.data;
      const fileRes = await api.get(`/reports/${report.id}/download?file=${filename}&inline=true`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([fileRes.data], { type: 'application/pdf' }));
      setPdfUrl((prev) => { if (prev) window.URL.revokeObjectURL(prev); return url; });
    } catch {
      setPdfError(true);
    } finally {
      setPdfLoading(false);
    }
  }, [report]);

  const switchMode = (next) => {
    setMode(next);
    if (next === 'pdf' && !pdfUrl && !pdfLoading) loadPdfPreview();
  };

  // Must run unconditionally (before the loading/error early returns below)
  // to satisfy the Rules of Hooks -- guards internally instead.
  const sections = useMemo(() => (report ? parseReportSections(report.content) : []), [report]);

  const handleExport = async (format, options = {}) => {
    try {
      const exportRes = await reportsAPI.export(report.id, { format, ...options });
      const { filename } = exportRes.data;
      const fileRes = await api.get(`/reports/${report.id}/download?file=${filename}`, { responseType: 'blob' });
      const mimeTypes = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', html: 'text/html' };
      const url = window.URL.createObjectURL(new Blob([fileRes.data], { type: mimeTypes[format] || 'application/octet-stream' }));
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      window.URL.revokeObjectURL(url);
      toast.success(`Exported as ${format.toUpperCase()}`);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Export failed');
      throw err;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg">
        <Navbar />
        <div className="flex flex-col items-center justify-center py-32 gap-3">
          <RefreshCw className="w-8 h-8 text-brand-500 animate-spin" />
          <p className="text-sm text-gray-500">Loading report…</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-bg">
        <Navbar />
        <div className="flex flex-col items-center justify-center py-32 gap-4 text-center px-4">
          <AlertCircle className="w-10 h-10 text-amber-500" />
          <div>
            <p className="text-gray-900 font-semibold">
              {error === 'not_found' ? 'Report not found' : "We couldn't load this report"}
            </p>
            <p className="text-gray-500 text-sm mt-1">
              {error === 'not_found' ? "It may have been deleted, or you don't have access to it." : 'Check your connection and try again.'}
            </p>
          </div>
          <div className="flex gap-2">
            {error !== 'not_found' && (
              <button onClick={load} className="btn-secondary text-sm py-2 px-4 flex items-center gap-2">
                <RefreshCw className="w-4 h-4" /> Retry
              </button>
            )}
            <Link to="/dashboard" className="btn-primary text-sm py-2 px-4 flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" /> Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const processing = report.status === 'processing';
  const regenerating = !!report.regenerating;
  const reviewed = REVIEWED_STATUSES.includes(report.status);
  const canActOn = !processing && !regenerating;
  const allowedExports = TIER_EXPORTS[tier] || ['pdf'];

  // Phase 19: derived per-viewer capability. An owner always has full
  // access; a grantee's capability comes ENTIRELY from myAccess (never their
  // own account role/tier -- see backend/utils/reportAccess.js).
  const isOwner = myAccess === 'owner';
  const canEdit = isOwner || myAccess === 'review';
  const canApprove = isOwner || myAccess === 'review';
  const canExportReport = isOwner || myAccess === 'review';
  const canShowComments = myAccess === 'owner' || myAccess === 'comment' || myAccess === 'review';
  const reviewRequest = report.reviewRequest;
  const isAssignedReviewerPending =
    !isOwner && reviewRequest?.status === 'pending' && reviewRequest?.reviewerUid === user?.uid;
  const isReviewPendingForOwner = isOwner && reviewRequest?.status === 'pending';

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/dashboard" aria-label="Back to Dashboard" className="p-2 hover:bg-gray-100 rounded-lg transition-colors shrink-0">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 truncate">Claim {report.claimNumber || '—'}</h1>
              <p className="text-xs text-gray-500 truncate">{report.insuredName} · {report.propertyAddress}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isOwner && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-navy-500/10 text-navy-700 border border-navy-500/30 capitalize">
                {myAccess} access
              </span>
            )}
            {reviewed ? (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-500/10 text-green-700 border border-green-500/30 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Finalized
              </span>
            ) : processing ? (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-brand-500/10 text-brand-700 border border-brand-500/30">Analyzing…</span>
            ) : reviewRequest?.status === 'pending' ? (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-navy-500/10 text-navy-700 border border-navy-500/30 flex items-center gap-1">
                <UserCheck className="w-3.5 h-3.5" /> In Review
              </span>
            ) : (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-700 border border-amber-500/30">Draft — pending review</span>
            )}
          </div>
        </div>

        {processing && (
          <div className="card p-6 mb-5 flex items-center gap-3 border border-brand-200 bg-brand-50/40">
            <RefreshCw className="w-5 h-5 text-brand-600 animate-spin shrink-0" />
            <div>
              <p className="text-sm font-semibold text-gray-800">This report is still being analyzed</p>
              <p className="text-xs text-gray-500 mt-0.5">Preview, editing, approval, and export unlock once the FLACRON ENGINE finishes.</p>
            </div>
          </div>
        )}

        {isReviewPendingForOwner && (
          <div className="card p-4 mb-5 flex items-center gap-3 border border-navy-200 bg-navy-50/40">
            <UserCheck className="w-5 h-5 text-navy-600 shrink-0" />
            <p className="text-sm text-gray-700">Awaiting review from <span className="font-semibold">{reviewRequest.reviewerEmail}</span>.</p>
          </div>
        )}

        {isAssignedReviewerPending && (
          <div className="card p-4 mb-5 border border-navy-200 bg-navy-50/40">
            <div className="flex items-center gap-3 mb-3">
              <UserCheck className="w-5 h-5 text-navy-600 shrink-0" />
              <p className="text-sm text-gray-700">You've been asked to review this report{reviewRequest.notes ? `: "${reviewRequest.notes}"` : '.'}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setShowApproveModal(true)} className="btn-primary text-sm py-2 px-3 flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4" /> Approve
              </button>
              <button onClick={() => setReviewResponseDecision('changes_requested')} className="btn-secondary text-sm py-2 px-3 flex items-center gap-1.5">
                <RotateCcw className="w-4 h-4" /> Return for Changes
              </button>
              <button onClick={() => setReviewResponseDecision('rejected')} className="text-sm py-2 px-3 flex items-center gap-1.5 rounded-btn border border-gray-200 text-gray-500 hover:bg-gray-50">
                <XCircle className="w-4 h-4" /> Decline
              </button>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="inline-flex rounded-xl border border-gray-200 p-1 bg-bg">
            <button onClick={() => switchMode('desktop')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors ${mode === 'desktop' ? 'bg-brand-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              <Monitor className="w-4 h-4" /> Desktop
            </button>
            <button onClick={() => switchMode('pdf')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors ${mode === 'pdf' ? 'bg-brand-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              <FileText className="w-4 h-4" /> PDF
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {isOwner && (
              <button onClick={() => setShowShareModal(true)} className="btn-secondary text-sm py-2 px-3 flex items-center gap-1.5">
                <Share2 className="w-4 h-4" /> Share
              </button>
            )}
            {isOwner && !reviewed && !isReviewPendingForOwner && (
              <button onClick={() => setShowRequestReviewModal(true)} className="btn-secondary text-sm py-2 px-3 flex items-center gap-1.5">
                <UserCheck className="w-4 h-4" /> Request Review
              </button>
            )}
            {canEdit && (
              <button onClick={() => navigate(`/dashboard?openReport=${report.id}`)}
                className="btn-secondary text-sm py-2 px-3 flex items-center gap-1.5">
                <Pencil className="w-4 h-4" /> Edit
              </button>
            )}
            {!canApprove ? null : reviewed ? null : canActOn ? (
              <button onClick={() => setShowApproveModal(true)} className="btn-primary text-sm py-2 px-3 flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4" /> Approve
              </button>
            ) : (
              <button disabled title="Unavailable while the report is processing" className="text-sm py-2 px-3 flex items-center gap-1.5 rounded-btn border border-dashed border-gray-200 text-gray-400 cursor-not-allowed">
                <Lock className="w-3.5 h-3.5" /> Approve
              </button>
            )}
            {!canExportReport ? null : canActOn ? (
              <button onClick={() => setShowExportModal(true)} className="btn-secondary text-sm py-2 px-3 flex items-center gap-1.5">
                <Download className="w-4 h-4" /> Export
              </button>
            ) : (
              <button disabled title="Unavailable while the report is processing" className="text-sm py-2 px-3 flex items-center gap-1.5 rounded-btn border border-dashed border-gray-200 text-gray-400 cursor-not-allowed">
                <Lock className="w-3.5 h-3.5" /> Export
              </button>
            )}
          </div>
        </div>

        {/* Preview body */}
        <div className="card p-4 sm:p-6">
          {mode === 'desktop' ? (
            report.content ? (
              <ReportMarkdown content={report.content} />
            ) : (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                <FileText className="w-10 h-10 text-gray-300" />
                <p className="text-sm text-gray-400">No report content yet.</p>
              </div>
            )
          ) : (
            <>
              {pdfLoading && (
                <div className="flex flex-col items-center justify-center py-20 gap-3 bg-gray-50 rounded-xl border border-gray-200">
                  <RefreshCw className="w-8 h-8 text-brand-500 animate-spin" />
                  <p className="text-sm text-gray-500 font-medium">Rendering PDF…</p>
                </div>
              )}
              {!pdfLoading && pdfUrl && (
                <iframe src={pdfUrl} title="PDF Preview" className="w-full rounded-xl border border-gray-200" style={{ height: '80vh' }} />
              )}
              {!pdfLoading && !pdfUrl && (
                <div className="flex flex-col items-center justify-center py-20 gap-3 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                  <FileText className="w-10 h-10 text-gray-300" />
                  <p className="text-sm text-gray-400">{pdfError ? 'PDF preview failed to load.' : 'PDF preview not loaded yet.'}</p>
                  <button onClick={loadPdfPreview} className="btn-primary text-sm py-2 px-4 flex items-center gap-2">
                    <RefreshCw className="w-4 h-4" /> {pdfError ? 'Retry' : 'Load PDF Preview'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {canShowComments && (
          <div className="mt-5">
            <CommentsPanel
              sections={sections}
              fetchComments={() => reportsAPI.getComments(report.id)}
              onAdd={(payload) => reportsAPI.addComment(report.id, payload)}
              onResolve={(commentId) => reportsAPI.resolveComment(report.id, commentId)}
              onReopen={(commentId) => reportsAPI.reopenComment(report.id, commentId)}
              myPermission={myAccess}
            />
          </div>
        )}
      </div>

      <AnimatePresence>
        {showExportModal && (
          <ExportOptionsModal report={report} allowedExports={allowedExports} onExport={handleExport} onClose={() => setShowExportModal(false)} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showApproveModal && (
          <ApproveModal
            report={report}
            onClose={() => setShowApproveModal(false)}
            onApproved={(updates) => {
              setReport((prev) => ({ ...prev, ...updates, status: 'finalized' }));
              setShowApproveModal(false);
              setPdfUrl((prev) => { if (prev) window.URL.revokeObjectURL(prev); return null; });
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showShareModal && (
          <ShareReportModal
            report={report}
            onClose={() => setShowShareModal(false)}
            onReportUpdate={(updates) => setReport((prev) => ({ ...prev, ...updates }))}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showRequestReviewModal && (
          <RequestReviewModal
            report={report}
            currentUid={user?.uid}
            onClose={() => setShowRequestReviewModal(false)}
            onRequested={(reviewRequestResult) => {
              setReport((prev) => ({ ...prev, reviewRequest: reviewRequestResult }));
              setShowRequestReviewModal(false);
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {reviewResponseDecision && (
          <ReviewResponseModal
            decision={reviewResponseDecision}
            onClose={() => setReviewResponseDecision(null)}
            onSubmit={async (notes) => {
              try {
                const res = await reportsAPI.reviewResponse(report.id, { decision: reviewResponseDecision, notes });
                toast.success(reviewResponseDecision === 'rejected' ? 'Review declined' : 'Sent back for changes');
                setReport((prev) => ({ ...prev, reviewRequest: res.data?.reviewRequest, status: 'draft' }));
                setReviewResponseDecision(null);
              } catch (err) {
                toast.error(err?.response?.data?.error || 'Could not submit response');
              }
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
