import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { MessageSquare, CheckCircle2, RotateCcw, Send, Loader2 } from 'lucide-react';
import { slugifySectionTitle } from '../utils/reportSections';

// Phase 19 (Sharing Permissions, Expiry, Comments & Review Requests).
// Reusable comments UI for both authenticated in-app viewers (owner/team/
// assigned users, via ReportPreviewPage) and anonymous Comment/Review share
// links (via SharedReport.jsx) -- the parent injects the fetch/add/resolve/
// reopen calls so this component never needs to know which API surface
// (authenticated vs public share-token) it's talking to.
//
// `myPermission`: 'owner' | 'review' | 'comment' | 'view'. 'owner' and
// 'review' may add + resolve/reopen; 'comment' may only add; 'view' is
// read-only (the parent should not even mount this for a pure view-only
// grant, but every action here is also re-checked, so mounting it is safe).
export default function CommentsPanel({
  sections = [],
  fetchComments,
  onAdd,
  onResolve,
  onReopen,
  myPermission = 'view',
  requireGuestName = false,
}) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [guestName, setGuestName] = useState(() => sessionStorage.getItem('flacron_guest_name') || '');
  const [draft, setDraft] = useState('');
  const [draftSection, setDraftSection] = useState('general');
  const [replyDraft, setReplyDraft] = useState({});
  const [replyOpenFor, setReplyOpenFor] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyCommentId, setBusyCommentId] = useState(null);

  const canAdd = myPermission === 'owner' || myPermission === 'review' || myPermission === 'comment';
  const canManage = myPermission === 'owner' || myPermission === 'review';

  // Prevent a slower, stale request from a previous refresh overwriting a
  // newer one's result (same pattern as AuditLogViewer.jsx's Phase 17 fix).
  const latestRequestId = useRef(0);

  const load = useCallback(() => {
    const requestId = ++latestRequestId.current;
    setLoading(true);
    setError(false);
    fetchComments()
      .then((res) => {
        if (requestId !== latestRequestId.current) return;
        setComments(res.data?.comments || []);
      })
      .catch(() => {
        if (requestId !== latestRequestId.current) return;
        setError(true);
      })
      .finally(() => {
        if (requestId !== latestRequestId.current) return;
        setLoading(false);
      });
  }, [fetchComments]);

  useEffect(() => { load(); }, [load]);

  // A slug present in the CURRENT section list wins its title from there
  // (survives reorder/edit); a slug that no longer matches any section
  // falls back to the comment's own stored title, under "General".
  const currentSlugs = new Map(sections.map((s) => [slugifySectionTitle(s.title), s.title]));
  const sectionLabel = (anchor) => {
    if (!anchor) return 'General';
    if (currentSlugs.has(anchor.slug)) return currentSlugs.get(anchor.slug);
    return `${anchor.title} (section since edited)`;
  };
  const groupKey = (anchor) => (anchor && currentSlugs.has(anchor.slug) ? anchor.slug : anchor ? `stale:${anchor.slug}` : 'general');

  const groups = new Map();
  comments
    .filter((c) => !c.parentId)
    .forEach((c) => {
      const key = groupKey(c.sectionAnchor);
      if (!groups.has(key)) groups.set(key, { label: sectionLabel(c.sectionAnchor), items: [] });
      groups.get(key).items.push(c);
    });
  const repliesOf = (id) => comments.filter((c) => c.parentId === id);

  const submitGuestNameIfNeeded = () => {
    if (requireGuestName) {
      const trimmed = guestName.trim();
      if (!trimmed) {
        toast.error('Please enter your name to comment.');
        return null;
      }
      sessionStorage.setItem('flacron_guest_name', trimmed);
      return trimmed;
    }
    return undefined;
  };

  const handleAdd = async () => {
    const body = draft.trim();
    if (!body) return;
    const name = submitGuestNameIfNeeded();
    if (requireGuestName && name === null) return;
    setSubmitting(true);
    try {
      const sectionAnchor =
        draftSection === 'general' ? null : { title: sections.find((s) => slugifySectionTitle(s.title) === draftSection)?.title || draftSection };
      await onAdd({ body, sectionAnchor, guestName: name });
      setDraft('');
      load();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not add comment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = async (parentId) => {
    const body = (replyDraft[parentId] || '').trim();
    if (!body) return;
    const name = submitGuestNameIfNeeded();
    if (requireGuestName && name === null) return;
    setSubmitting(true);
    try {
      await onAdd({ body, parentId, guestName: name });
      setReplyDraft((prev) => ({ ...prev, [parentId]: '' }));
      setReplyOpenFor(null);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not add reply');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolve = async (id, resolved) => {
    setBusyCommentId(id);
    try {
      await (resolved ? onReopen(id) : onResolve(id));
      load();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not update comment');
    } finally {
      setBusyCommentId(null);
    }
  };

  const CommentRow = ({ comment, isReply = false }) => (
    <div className={isReply ? 'ml-8 mt-2' : 'mt-3'}>
      <div className={`rounded-lg border p-3 text-sm ${comment.resolved ? 'border-gray-100 bg-bg' : 'border-gray-200 bg-gray-50'}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="font-semibold text-gray-800">{comment.authorName}</span>
            {comment.authorIsGuest && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-gray-400">Guest</span>}
            <span className="ml-2 text-xs text-gray-400">{new Date(comment.createdAt).toLocaleString()}</span>
          </div>
          {comment.resolved && (
            <span className="shrink-0 flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-500/10 border border-green-500/30 rounded-full px-2 py-0.5">
              <CheckCircle2 className="w-3 h-3" /> Resolved
            </span>
          )}
        </div>
        <p className="mt-1.5 text-gray-700 whitespace-pre-wrap break-words">{comment.body}</p>
        <div className="mt-2 flex items-center gap-3">
          {!isReply && canAdd && (
            <button
              onClick={() => setReplyOpenFor(replyOpenFor === comment.id ? null : comment.id)}
              className="text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              Reply
            </button>
          )}
          {canManage && (
            <button
              onClick={() => handleResolve(comment.id, comment.resolved)}
              disabled={busyCommentId === comment.id}
              className="text-xs font-medium text-gray-500 hover:text-gray-700 flex items-center gap-1 disabled:opacity-50"
            >
              {busyCommentId === comment.id ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : comment.resolved ? (
                <RotateCcw className="w-3 h-3" />
              ) : (
                <CheckCircle2 className="w-3 h-3" />
              )}
              {comment.resolved ? 'Reopen' : 'Resolve'}
            </button>
          )}
        </div>
        {replyOpenFor === comment.id && (
          <div className="mt-2 flex items-start gap-2">
            <textarea
              value={replyDraft[comment.id] || ''}
              onChange={(e) => setReplyDraft((prev) => ({ ...prev, [comment.id]: e.target.value }))}
              rows={2}
              placeholder="Write a reply…"
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <button
              onClick={() => handleReply(comment.id)}
              disabled={submitting}
              className="btn-primary text-xs py-2 px-3 flex items-center gap-1 disabled:opacity-50 shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
      {repliesOf(comment.id).map((r) => (
        <CommentRow key={r.id} comment={r} isReply />
      ))}
    </div>
  );

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="w-4 h-4 text-brand-600" />
        <h3 className="text-sm font-bold text-gray-900">Comments</h3>
        {!!comments.length && <span className="text-xs text-gray-400">({comments.length})</span>}
      </div>

      {loading && <p className="text-sm text-gray-400 py-4 text-center">Loading comments…</p>}
      {!loading && error && <p className="text-sm text-red-500 py-4 text-center">Could not load comments.</p>}
      {!loading && !error && !comments.length && (
        <p className="text-sm text-gray-400 py-4 text-center">No comments yet.</p>
      )}
      {!loading && !error && !!groups.size && (
        <div className="space-y-4 max-h-[28rem] overflow-y-auto pr-1">
          {Array.from(groups.entries()).map(([key, group]) => (
            <div key={key}>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">{group.label}</div>
              {group.items.map((c) => (
                <CommentRow key={c.id} comment={c} />
              ))}
            </div>
          ))}
        </div>
      )}

      {canAdd ? (
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
          {requireGuestName && (
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Your name"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          )}
          {sections.length > 0 && (
            <select
              value={draftSection}
              onChange={(e) => setDraftSection(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              <option value="general">General (whole report)</option>
              {sections.map((s) => (
                <option key={s.id} value={slugifySectionTitle(s.title)}>{s.title}</option>
              ))}
            </select>
          )}
          <div className="flex items-start gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              placeholder="Add a comment…"
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <button
              onClick={handleAdd}
              disabled={submitting || !draft.trim()}
              className="btn-primary text-sm py-2 px-3 flex items-center gap-1.5 disabled:opacity-50 shrink-0"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-400">You have view-only access and cannot add comments.</p>
      )}
    </div>
  );
}
