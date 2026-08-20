import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, FileText, Camera, Users, X, Loader2 } from 'lucide-react';
import { searchAPI } from '../services/api.js';

// Phase 20 (Notifications Center & Global Search). Mounted once, near the
// root of the authenticated app, so CMD/CTRL+K works from anywhere -- see
// App.jsx. Debounced + cancellable (AbortController, not just a timer) so a
// fast typist never has an earlier, slower query's results clobber a later
// one's -- the classic stale-response race, solved here at the request layer
// instead of a response-side requestId guard (the more common pattern
// elsewhere in this codebase) since AbortController also stops the wasted
// backend work, not just the wasted render.
const DEBOUNCE_MS = 300;
const RECENT_KEY = 'flacron_recent_searches';
const MAX_RECENT = 5;

const readRecent = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((s) => typeof s === 'string').slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
};

const saveRecent = (query) => {
  try {
    const existing = readRecent().filter((s) => s.toLowerCase() !== query.toLowerCase());
    const next = [query, ...existing].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable (private mode / quota) -- recent searches are
    // a convenience, not a requirement, so this silently no-ops.
  }
};

// Renders `text` with the matched substring wrapped in <mark>, built from
// plain React text nodes (never dangerouslySetInnerHTML) -- the same
// plain-text-only rendering discipline Phase 19's CommentsPanel established
// for untrusted/user-authored strings.
const Highlight = ({ text, query }) => {
  if (!text) return null;
  if (!query) return <>{text}</>;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-brand-100 text-brand-800 rounded-sm">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
};

const GlobalSearch = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [results, setResults] = useState(null); // null = no query submitted yet this session
  const [loading, setLoading] = useState(false);
  const [errorCode, setErrorCode] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [recent, setRecent] = useState([]);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e) => {
      const isK = e.key === 'k' || e.key === 'K';
      if (isK && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((p) => !p);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    // A visible Search button (Navbar, mobile menu) can't reach this
    // component's own state directly since it's mounted once near the app
    // root (see App.jsx) -- it opens the palette via this custom event
    // instead of lifting state up through every layout that wants a trigger.
    const handleOpenEvent = () => setOpen(true);
    window.addEventListener('flacron:open-search', handleOpenEvent);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('flacron:open-search', handleOpenEvent);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setRecent(readRecent());
      // Autofocus after the mount/animation frame so the input actually exists.
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setQuery('');
      setDebounced('');
      setResults(null);
      setErrorCode(null);
      setActiveIndex(0);
      if (abortRef.current) abortRef.current.abort();
    }
  }, [open]);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    if (abortRef.current) abortRef.current.abort();
    if (debounced.length < 2) {
      setResults(debounced.length === 0 ? null : { reports: [], photos: [], team: [] });
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setErrorCode(null);
    searchAPI
      .search(debounced, controller.signal)
      .then((res) => {
        setResults(res.data);
        setActiveIndex(0);
        saveRecent(debounced);
        setRecent(readRecent());
      })
      .catch((err) => {
        if (err.code === 'ERR_CANCELED' || err.name === 'CanceledError') return;
        setErrorCode(err?.response?.data?.code || 'SEARCH_ERROR');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [debounced]);

  const flatResults = useMemo(() => {
    if (!results) return [];
    const reports = results.reports.map((r) => ({ kind: 'report', ...r, label: r.claimNumber || r.insuredName || 'Report' }));
    const photos = results.photos.map((p) => ({ kind: 'photo', ...p, label: p.fileName || 'Photo' }));
    const team = results.team.map((t) => ({ kind: 'team', ...t, label: t.email || 'Team member' }));
    return [...reports, ...photos, ...team];
  }, [results]);

  const handleSelect = useCallback(
    (item) => {
      if (!item?.link) return;
      setOpen(false);
      navigate(item.link);
    },
    [navigate]
  );

  const handleKeyNav = (e) => {
    if (flatResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % flatResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + flatResults.length) % flatResults.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSelect(flatResults[activeIndex]);
    }
  };

  const groupLabel = { report: 'Reports', photo: 'Photos', team: 'Team' };
  const groupIcon = { report: FileText, photo: Camera, team: Users };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-start justify-center pt-[10vh] px-4"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Global search"
            className="w-full max-w-xl bg-white rounded-2xl shadow-2xl shadow-black/30 border border-[#e5e7eb] overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#e5e7eb]">
              <Search className="w-4.5 h-4.5 text-gray-400 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyNav}
                placeholder="Search claims, reports, addresses, photos, team…"
                aria-label="Search"
                autoComplete="off"
                className="flex-1 bg-transparent border-none outline-none text-sm text-gray-900 placeholder:text-gray-400"
              />
              {loading && <Loader2 className="w-4 h-4 text-gray-400 animate-spin shrink-0" />}
              <button onClick={() => setOpen(false)} aria-label="Close search" className="p-1 rounded-lg hover:bg-gray-100 shrink-0">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {!results && recent.length > 0 && (
                <div className="py-2">
                  <p className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Recent</p>
                  {recent.map((r) => (
                    <button
                      key={r}
                      onClick={() => setQuery(r)}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-left text-sm text-gray-600 hover:bg-gray-50"
                    >
                      <Search className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                      {r}
                    </button>
                  ))}
                </div>
              )}

              {!results && recent.length === 0 && (
                <p className="px-4 py-8 text-sm text-gray-400 text-center">Start typing to search across your claims and team.</p>
              )}

              {results && query.trim().length < 2 && (
                <p className="px-4 py-8 text-sm text-gray-400 text-center">Keep typing — at least 2 characters.</p>
              )}

              {results && query.trim().length >= 2 && errorCode && (
                <p className="px-4 py-8 text-sm text-gray-500 text-center">Search failed. Try again.</p>
              )}

              {results && query.trim().length >= 2 && !errorCode && flatResults.length === 0 && !loading && (
                <p className="px-4 py-8 text-sm text-gray-400 text-center">No results for "{debounced}".</p>
              )}

              {results &&
                !errorCode &&
                ['report', 'photo', 'team'].map((kind) => {
                  const groupItems = flatResults.filter((i) => i.kind === kind);
                  if (groupItems.length === 0) return null;
                  const Icon = groupIcon[kind];
                  return (
                    <div key={kind} className="py-1">
                      <p className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                        {groupLabel[kind]}
                      </p>
                      {groupItems.map((item) => {
                        const globalIndex = flatResults.indexOf(item);
                        const active = globalIndex === activeIndex;
                        return (
                          <button
                            key={`${item.kind}-${item.id || item.reportId}-${item.photoId || ''}`}
                            onMouseEnter={() => setActiveIndex(globalIndex)}
                            onClick={() => handleSelect(item)}
                            className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors ${
                              active ? 'bg-brand-50 text-brand-700' : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            <Icon className="w-4 h-4 text-gray-400 shrink-0" />
                            <span className="flex-1 min-w-0 truncate">
                              <Highlight text={item.label} query={debounced} />
                              {item.kind === 'report' && item.insuredName && item.claimNumber && (
                                <span className="text-gray-400"> — {item.insuredName}</span>
                              )}
                              {item.kind === 'photo' && item.claimNumber && (
                                <span className="text-gray-400"> — claim {item.claimNumber}</span>
                              )}
                              {item.kind === 'team' && item.role && <span className="text-gray-400"> — {item.role}</span>}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
            </div>

            <div className="px-4 py-2 border-t border-[#e5e7eb] flex items-center gap-3 text-[11px] text-gray-400">
              <span><kbd className="px-1 py-0.5 rounded bg-gray-100 border border-gray-200">↑↓</kbd> navigate</span>
              <span><kbd className="px-1 py-0.5 rounded bg-gray-100 border border-gray-200">Enter</kbd> open</span>
              <span><kbd className="px-1 py-0.5 rounded bg-gray-100 border border-gray-200">Esc</kbd> close</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default GlobalSearch;
