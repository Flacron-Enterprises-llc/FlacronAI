import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Check, Loader2 } from 'lucide-react';
import { notificationsAPI } from '../services/api.js';

// Phase 20 (Notifications Center & Global Search). Polling (no websocket/SSE
// infra exists in this codebase) every POLL_MS while the tab is open, plus an
// immediate refetch whenever the dropdown is opened -- good enough for a
// per-account inbox without adding new real-time infrastructure.
const POLL_MS = 60000;

const timeAgo = (iso) => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
};

const NotificationBell = () => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorCode, setErrorCode] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const containerRef = useRef(null);
  const navigate = useNavigate();
  // Stale-response guard (same monotonic-id pattern as AuditLogViewer.jsx /
  // CommentsPanel.jsx) -- polling + a manual open + pagination can all race.
  const latestRequestId = useRef(0);

  const fetchPage = useCallback((pageToLoad, append) => {
    const requestId = ++latestRequestId.current;
    if (!append) setLoading(true);
    notificationsAPI
      .list({ page: pageToLoad, limit: 20 })
      .then((res) => {
        if (requestId !== latestRequestId.current) return;
        setUnreadCount(res.data.unreadCount || 0);
        setHasMore(!!res.data.hasMore);
        setPage(res.data.page || pageToLoad);
        setErrorCode(null);
        setItems((prev) => (append ? [...prev, ...res.data.notifications] : res.data.notifications));
      })
      .catch((err) => {
        if (requestId !== latestRequestId.current) return;
        setErrorCode(err?.response?.data?.code || 'FETCH_ERROR');
      })
      .finally(() => {
        if (requestId === latestRequestId.current) setLoading(false);
      });
  }, []);

  // Poll unread count quietly in the background (not the full list -- the
  // dropdown refetches its own first page whenever it's actually opened).
  const pollUnreadCount = useCallback(() => {
    const requestId = ++latestRequestId.current;
    notificationsAPI
      .list({ page: 1, limit: 1 })
      .then((res) => {
        if (requestId === latestRequestId.current) setUnreadCount(res.data.unreadCount || 0);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    pollUnreadCount();
    const interval = setInterval(pollUnreadCount, POLL_MS);
    return () => clearInterval(interval);
  }, [pollUnreadCount]);

  useEffect(() => {
    if (open) fetchPage(1, false);
  }, [open, fetchPage]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleItemClick = (item) => {
    setOpen(false);
    if (!item.read) {
      setUnreadCount((c) => Math.max(0, c - 1));
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
      notificationsAPI.markRead(item.id).catch(() => {});
    }
    if (item.link) navigate(item.link);
  };

  const handleMarkAllRead = () => {
    setUnreadCount(0);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    notificationsAPI.markAllRead().catch(() => {});
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((p) => !p)}
        className="relative p-2 rounded-xl hover:bg-gray-100 transition-colors"
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
        aria-expanded={open}
        title="Notifications"
      >
        <Bell className="w-5 h-5 text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-brand-500 text-white text-[10px] font-bold leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-80 max-w-[92vw] bg-bg border border-gray-200 rounded-xl shadow-xl shadow-black/10 overflow-hidden z-50"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <p className="text-sm font-semibold text-gray-900">Notifications</p>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                >
                  <Check className="w-3.5 h-3.5" />
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {loading && items.length === 0 && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                </div>
              )}
              {!loading && errorCode && items.length === 0 && (
                <p className="px-4 py-6 text-sm text-gray-500 text-center">Couldn't load notifications. Try again shortly.</p>
              )}
              {!loading && !errorCode && items.length === 0 && (
                <p className="px-4 py-8 text-sm text-gray-500 text-center">You're all caught up.</p>
              )}
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors ${
                    item.read ? '' : 'bg-brand-50/40'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!item.read && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />}
                    <div className={item.read ? 'pl-3.5' : ''}>
                      <p className="text-sm font-medium text-gray-900">{item.title}</p>
                      <p className="text-xs text-gray-600 mt-0.5">{item.body}</p>
                      <p className="text-[11px] text-gray-400 mt-1">{timeAgo(item.createdAt)}</p>
                    </div>
                  </div>
                </button>
              ))}
              {hasMore && (
                <button
                  onClick={() => fetchPage(page + 1, true)}
                  disabled={loading}
                  className="w-full py-2.5 text-xs font-medium text-brand-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  {loading ? 'Loading…' : 'Load more'}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationBell;
