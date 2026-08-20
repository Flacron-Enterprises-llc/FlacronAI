import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Printer, FileText, ShieldCheck, AlertCircle, Clock, Ban } from 'lucide-react';
import { reportsAPI } from '../services/api';
import ReportMarkdown from '../components/ReportMarkdown';
import CommentsPanel from '../components/CommentsPanel';
import { parseReportSections } from '../utils/reportSections';

export default function SharedReport() {
  const { token } = useParams();
  const [report, setReport] = useState(null);
  const [permission, setPermission] = useState('view');
  const [isDraft, setIsDraft] = useState(false);
  // Phase 19: 'loading' | 'ok' | 'notfound' | 'expired'
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    document.title = 'Shared Inspection Report — FlacronAI';
    const meta = document.createElement('meta');
    meta.name = 'robots'; meta.content = 'noindex,nofollow';
    document.head.appendChild(meta);
    (async () => {
      try {
        const res = await reportsAPI.getShared(token);
        setReport(res.data.report);
        setPermission(res.data.permission || 'view');
        setIsDraft(!!res.data.isDraft);
        setStatus('ok');
      } catch (err) {
        setStatus(err?.response?.status === 410 ? 'expired' : 'notfound');
      }
    })();
    return () => { document.head.removeChild(meta); };
  }, [token]);

  const sections = useMemo(() => (report ? parseReportSections(report.content) : []), [report]);

  const fetchComments = useCallback(() => reportsAPI.getSharedComments(token), [token]);
  const onAdd = useCallback((payload) => reportsAPI.addSharedComment(token, payload), [token]);
  const onResolve = useCallback((commentId) => reportsAPI.resolveSharedComment(token, commentId), [token]);
  const onReopen = useCallback((commentId) => reportsAPI.reopenSharedComment(token, commentId), [token]);

  if (status === 'loading') {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading report…</div>;
  }
  if (status === 'expired') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-4">
        <Clock className="w-12 h-12 text-gray-300 mb-4" />
        <h1 className="text-xl font-bold text-gray-900">This link has expired</h1>
        <p className="text-gray-500 mt-2 max-w-sm">Ask the report owner for a new secure link.</p>
      </div>
    );
  }
  if (status === 'notfound') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-4">
        <AlertCircle className="w-12 h-12 text-gray-300 mb-4" />
        <h1 className="text-xl font-bold text-gray-900">Report not available</h1>
        <p className="text-gray-500 mt-2 max-w-sm">This share link is invalid, has been revoked, or the report is no longer available.</p>
      </div>
    );
  }

  // Comment/Review permission links may point at an unreviewed draft (Golden
  // Rule #3): show it, but never let it be mistaken for a final report.
  const showComments = permission === 'comment' || permission === 'review';

  return (
    <div className="min-h-screen bg-bg py-8 px-4 print:bg-gray-50 print:py-0">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6 print:hidden">
          <div className="flex items-center gap-2">
            <img src="/logo-mark.svg" alt="FlacronAI" className="w-8 h-8" />
            <span className="font-bold text-gray-900">Flacron<span className="text-brand-600">AI</span></span>
          </div>
          <div className="flex items-center gap-2">
            {permission !== 'view' && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-navy-500/10 text-navy-700 border border-navy-500/30 capitalize">
                {permission} access
              </span>
            )}
            <button onClick={() => window.print()} className="btn-secondary text-sm py-2 px-4 flex items-center gap-2">
              <Printer className="w-4 h-4" /> Print / Save PDF
            </button>
          </div>
        </div>

        {isDraft && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 print:hidden">
            <Ban className="w-4 h-4 shrink-0" />
            <span><strong>DRAFT — pending review.</strong> This report has not been finalized; content may still change.</span>
          </div>
        )}

        <div className="bg-bg border border-gray-200 rounded-2xl p-6 sm:p-10 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-4">
            <FileText className="w-4 h-4" /> Inspection Report · Claim {report.claimNumber || '—'}
          </div>
          <ReportMarkdown content={report.content} />

          {report.signature?.name && (
            <div className="mt-8 pt-4 border-t border-gray-200 flex items-start gap-2 text-sm text-gray-600">
              <ShieldCheck className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
              <span>Electronically signed by <span className="font-semibold text-gray-800">{report.signature.name}</span>{report.signature.title ? `, ${report.signature.title}` : ''}{report.signature.signedAt ? ` on ${new Date(report.signature.signedAt).toLocaleString()}` : ''}.</span>
            </div>
          )}
          <p className="mt-6 text-[11px] text-gray-400">Prepared with the FLACRON ENGINE and reviewed by a licensed adjuster. This document does not constitute a final determination of cause, coverage, liability, or loss value.</p>
        </div>

        {showComments && (
          <div className="mt-5 print:hidden">
            <CommentsPanel
              sections={sections}
              fetchComments={fetchComments}
              onAdd={onAdd}
              onResolve={onResolve}
              onReopen={onReopen}
              myPermission={permission}
              requireGuestName
            />
          </div>
        )}
      </div>
    </div>
  );
}
