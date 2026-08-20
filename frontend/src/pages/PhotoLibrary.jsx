import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Image as ImageIcon, Search, RefreshCw, AlertCircle, ExternalLink,
  SlidersHorizontal, AlertTriangle, LayoutGrid, Layers,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import { reportsAPI, photosAPI } from '../services/api';
import { ReviewStatusDot, PhotoAnalysisPanel, QualityWarningBadge, effectiveObservation } from '../components/PhotoReview.jsx';
import PhotoAnnotator from '../components/PhotoAnnotator.jsx';
import { PHOTO_LOCATIONS, PHOTO_CATEGORIES, PHOTO_ANALYSIS_STATUSES, PHOTO_SORTS } from '../utils/photoTaxonomy';
import { formatStatus } from '../utils/formatStatus';
import useEscapeToClose from '../hooks/useEscapeToClose';

const DEBOUNCE_MS = 350;
const entryKey = (e) => `${e.reportId}:${e.photoId}`;
const UNASSIGNED_AREA = '__unassigned__';

const DEFAULT_FILTERS = {
  claim: '', location: '', category: '', status: '', inclusion: '', dateFrom: '', dateTo: '', search: '', sort: 'newest', area: '',
};

// Phase 24: one grid tile, shared between the flat and "Group by Area" views.
function PhotoTile({ entry: e, thumbUrl, onOpen }) {
  const excluded = e.review?.status === 'excluded';
  return (
    <button type="button" onClick={onOpen}
      title={e.fileName} aria-label={`Open ${e.fileName || 'photo'} from claim ${e.claimNumber || 'unknown'}`}
      className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 group focus:outline-none focus:ring-2 focus:ring-brand-500">
      {thumbUrl ? (
        <img src={thumbUrl} alt={e.fileName || 'Report photo'} className={`w-full h-full object-cover ${excluded ? 'opacity-40' : ''}`} />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          {e.hasThumbnail
            ? <RefreshCw className="w-4 h-4 text-gray-300 animate-spin" />
            : <ImageIcon className="w-5 h-5 text-gray-300" />}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5 text-left">
        <p className="text-[10px] text-white/90 truncate">{e.claimNumber || 'No claim number'}</p>
      </div>
      {e.reviewable && (
        <span className="absolute bottom-1 left-1"><ReviewStatusDot status={e.review?.status || 'pending'} /></span>
      )}
      {e.qualityWarning && (
        <span className="absolute top-1 right-1"><QualityWarningBadge qualityWarning qualityReasons={e.qualityReasons} compact /></span>
      )}
    </button>
  );
}

// Phase 22 (Photo Analysis Library). A standalone cross-report photo search
// page -- every photo the caller can see through an owned, Phase-19-assigned,
// or shared report, in one filterable/searchable grid, instead of only being
// browsable one report's upload step at a time. Reuses PhotoAnalysisPanel
// (Phase 8's exact per-photo review UI, extracted in this phase) for the
// expanded view, so Edit/Approve/Exclude/Restore behave identically to the
// report editor's own gallery -- gated by each entry's own `canReview`
// (server-computed from the caller's per-report access tier, never trusted
// from the client).
export default function PhotoLibrary() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [claimInput, setClaimInput] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const [entries, setEntries] = useState([]);
  const [thumbUrls, setThumbUrls] = useState({});
  const [totalCount, setTotalCount] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  const [activeKey, setActiveKey] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [editText, setEditText] = useState('');
  const [noteText, setNoteText] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);
  // Phase 24: area tagging + annotation editor state for the expanded photo,
  // plus a "Group by Area" toggle for the currently loaded page of results.
  const [areaText, setAreaText] = useState('');
  const [areaSaving, setAreaSaving] = useState(false);
  const [groupByArea, setGroupByArea] = useState(false);
  const [annotatorOpen, setAnnotatorOpen] = useState(false);
  const [annotationsSaving, setAnnotationsSaving] = useState(false);
  const [annotationsError, setAnnotationsError] = useState(null);
  const [previewNaturalSize, setPreviewNaturalSize] = useState(null);

  const latestRequestId = useRef(0);
  const abortRef = useRef(null);

  // Debounce the two free-text inputs so every keystroke doesn't fire a
  // request -- discrete filters (selects/dates) below apply immediately,
  // matching AuditLogViewer.jsx's established split.
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, claim: claimInput.trim() })), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [claimInput]);
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, search: searchInput.trim() })), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchThumbnails = useCallback((list) => {
    list.filter((e) => e.hasThumbnail).forEach((e) => {
      const key = entryKey(e);
      reportsAPI.getPhotoImageBlob(e.reportId, e.photoId, 'thumbnail')
        .then((res) => {
          const url = URL.createObjectURL(res.data);
          setThumbUrls((prev) => ({ ...prev, [key]: url }));
        })
        .catch(() => { /* this one photo's thumbnail failed -- leave the placeholder icon */ });
    });
  }, []);

  const fetchPage = useCallback((cursor, { append } = {}) => {
    const requestId = ++latestRequestId.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (append) setLoadingMore(true); else { setLoading(true); setError(false); }

    const params = { limit: 30, sort: filters.sort };
    if (filters.claim) params.claim = filters.claim;
    if (filters.location) params.location = filters.location;
    if (filters.category) params.category = filters.category;
    if (filters.status) params.status = filters.status;
    if (filters.inclusion) params.inclusion = filters.inclusion;
    if (filters.dateFrom) params.dateFrom = filters.dateFrom;
    if (filters.dateTo) params.dateTo = filters.dateTo;
    if (filters.search) params.search = filters.search;
    if (filters.area) params.area = filters.area;
    if (cursor) params.cursor = cursor;

    photosAPI.list(params, controller.signal)
      .then((res) => {
        if (requestId !== latestRequestId.current) return;
        const list = res.data.photos || [];
        setEntries((prev) => (append ? [...prev, ...list] : list));
        setTotalCount(res.data.totalCount || 0);
        setTruncated(!!res.data.truncated);
        setNextCursor(res.data.nextCursor || null);
        fetchThumbnails(list);
      })
      .catch((err) => {
        if (requestId !== latestRequestId.current || err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        setError(true);
      })
      .finally(() => {
        if (requestId !== latestRequestId.current) return;
        setLoading(false);
        setLoadingMore(false);
      });
  }, [filters, fetchThumbnails]);

  useEffect(() => {
    fetchPage(null);
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  useEffect(() => () => {
    Object.values(thumbUrls).forEach((u) => URL.revokeObjectURL(u));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearFilters = () => { setClaimInput(''); setSearchInput(''); setFilters(DEFAULT_FILTERS); };
  const filtersActive = Object.entries(filters).some(([k, v]) => k !== 'sort' && v);

  const activePhoto = entries.find((e) => entryKey(e) === activeKey) || null;

  useEffect(() => {
    if (!activePhoto) { setPreviewUrl(null); return undefined; }
    setEditText(effectiveObservation(activePhoto));
    setNoteText(activePhoto.review?.note || '');
    setAreaText(activePhoto.roomOrArea || '');
    setAnnotatorOpen(false);
    setAnnotationsError(null);
    setPreviewNaturalSize(null);
    if (!activePhoto.hasThumbnail) { setPreviewUrl(null); return undefined; }
    let cancelled = false;
    let url;
    setPreviewLoading(true);
    reportsAPI.getPhotoImageBlob(activePhoto.reportId, activePhoto.photoId, 'full')
      .then((res) => { if (!cancelled) { url = URL.createObjectURL(res.data); setPreviewUrl(url); } })
      .catch(() => { if (!cancelled) toast.error('Could not load full-size photo'); })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  useEscapeToClose(() => setActiveKey(null), !!activeKey);

  const doReview = async (photoId, action, payload) => {
    if (!activePhoto) return;
    setReviewSaving(true);
    try {
      const res = await reportsAPI.updatePhotoReview(activePhoto.reportId, photoId, action, payload);
      const updated = res.data.photo;
      setEntries((prev) => prev.map((e) => (
        e.reportId === activePhoto.reportId && e.photoId === photoId
          ? { ...e, review: updated.review }
          : e
      )));
      setEditText(effectiveObservation({ analysis: activePhoto.analysis, review: updated.review }));
      setNoteText(updated.review?.note || '');
      const messages = { edit: 'Observation updated', approve: 'Photo approved', exclude: 'Photo excluded from report', include: 'Photo restored', note: 'Note saved' };
      toast.success(messages[action] || 'Photo review updated');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not update photo review');
    } finally {
      setReviewSaving(false);
    }
  };

  // Phase 24: room/area tagging reuses the same review-action route as
  // approve/edit/exclude/note (a 'set_area' action) -- own saving flag so
  // it doesn't disable the observation Save Edit button and vice versa.
  const doSetArea = async (photoId, roomOrArea) => {
    if (!activePhoto) return;
    setAreaSaving(true);
    try {
      const res = await reportsAPI.updatePhotoReview(activePhoto.reportId, photoId, 'set_area', { roomOrArea });
      const updated = res.data.photo;
      setEntries((prev) => prev.map((e) => (
        e.reportId === activePhoto.reportId && e.photoId === photoId ? { ...e, roomOrArea: updated.roomOrArea } : e
      )));
      toast.success('Area updated');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not update area');
    } finally {
      setAreaSaving(false);
    }
  };

  // Phase 24: full-list-replace annotation save with optimistic-concurrency
  // protection via `expectedUpdatedAt` (see photoJobService.updatePhotoAnnotations).
  const doSaveAnnotations = async (photoId, shapes) => {
    if (!activePhoto) return;
    setAnnotationsSaving(true);
    setAnnotationsError(null);
    try {
      const res = await reportsAPI.updatePhotoAnnotations(
        activePhoto.reportId, photoId, shapes, activePhoto.annotations?.updatedAt ?? null
      );
      const updated = res.data.photo;
      setEntries((prev) => prev.map((e) => (
        e.reportId === activePhoto.reportId && e.photoId === photoId ? { ...e, annotations: updated.annotations } : e
      )));
      toast.success('Annotations saved');
      setAnnotatorOpen(false);
    } catch (err) {
      const code = err.response?.data?.code;
      setAnnotationsError(
        code === 'STALE_UPDATE'
          ? 'These annotations changed elsewhere. Close and reopen this photo to reload the latest version.'
          : (err.response?.data?.error || 'Could not save annotations')
      );
    } finally {
      setAnnotationsSaving(false);
    }
  };

  const activePhotoForPanel = activePhoto && {
    id: activePhoto.photoId,
    reviewable: activePhoto.reviewable,
    analysisStatus: activePhoto.analysisStatus,
    analysis: activePhoto.location || activePhoto.category || activePhoto.observation
      ? { location: activePhoto.location, category: activePhoto.category, severity: activePhoto.severity, observation: activePhoto.observation, confidence: activePhoto.confidence }
      : null,
    review: activePhoto.review,
    qualityWarning: activePhoto.qualityWarning,
    qualityReasons: activePhoto.qualityReasons,
    roomOrArea: activePhoto.roomOrArea,
    annotations: activePhoto.annotations,
  };

  // Phase 24: distinct custom (non-taxonomy) area values actually present in
  // the currently loaded window, so the area filter/group view can offer
  // them too -- never fabricated, only what's really there.
  const customAreas = [...new Set(
    entries.map((e) => e.roomOrArea).filter((a) => a && !PHOTO_LOCATIONS.includes(a))
  )].sort();

  const groupedEntries = groupByArea
    ? entries.reduce((acc, e) => {
      const key = e.roomOrArea || 'Unassigned';
      (acc[key] = acc[key] || []).push(e);
      return acc;
    }, {})
    : null;

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-5">
          <h1 className="text-xl font-bold text-gray-900">Photo Library</h1>
          <p className="text-xs text-gray-500 mt-0.5">Search and review every photo across your reports, including reports shared with you.</p>
        </div>

        <div className="card p-4 mb-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input type="text" value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search filename, observation, claim, address..." aria-label="Search photos"
                className="input text-sm py-2 pl-9 w-full" />
            </div>
            <input type="text" value={claimInput} onChange={(e) => setClaimInput(e.target.value)}
              placeholder="Claim number" aria-label="Filter by claim number" className="input text-sm py-2 w-40" />
            <select value={filters.sort} onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))}
              aria-label="Sort photos" className="input text-sm py-2 w-auto">
              {PHOTO_SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <SlidersHorizontal className="w-4 h-4 text-gray-400 shrink-0" />
            <select value={filters.location} onChange={(e) => setFilters((f) => ({ ...f, location: e.target.value }))}
              aria-label="Filter by location" className="input text-xs py-1.5 px-2 w-auto">
              <option value="">All Locations</option>
              {PHOTO_LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <select value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
              aria-label="Filter by category" className="input text-xs py-1.5 px-2 w-auto">
              <option value="">All Categories</option>
              {PHOTO_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              aria-label="Filter by analysis status" className="input text-xs py-1.5 px-2 w-auto">
              <option value="">All Analysis Statuses</option>
              {PHOTO_ANALYSIS_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select value={filters.inclusion} onChange={(e) => setFilters((f) => ({ ...f, inclusion: e.target.value }))}
              aria-label="Filter by included or excluded" className="input text-xs py-1.5 px-2 w-auto">
              <option value="">Included &amp; Excluded</option>
              <option value="included">Included Only</option>
              <option value="excluded">Excluded Only</option>
            </select>
            <input type="date" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
              aria-label="Uploaded from date" className="input text-xs py-1.5 px-2 w-auto" />
            <span className="text-gray-400 text-xs">to</span>
            <input type="date" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
              aria-label="Uploaded to date" className="input text-xs py-1.5 px-2 w-auto" />
            <select value={filters.area} onChange={(e) => setFilters((f) => ({ ...f, area: e.target.value }))}
              aria-label="Filter by room or area" className="input text-xs py-1.5 px-2 w-auto">
              <option value="">All Areas</option>
              <option value={UNASSIGNED_AREA}>Unassigned</option>
              {PHOTO_LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
              {customAreas.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <button
              type="button"
              onClick={() => setGroupByArea((g) => !g)}
              aria-pressed={groupByArea}
              title="Group the currently loaded photos by area"
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border ${
                groupByArea ? 'bg-brand-500 text-white border-brand-500' : 'bg-bg text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              <Layers className="w-3.5 h-3.5" /> Group by Area
            </button>
            {filtersActive && (
              <button onClick={clearFilters} className="text-xs font-semibold text-brand-600 hover:text-brand-700 ml-auto shrink-0">
                Clear Filters
              </button>
            )}
          </div>
          {groupByArea && (
            <p className="text-[11px] text-gray-400 flex items-center gap-1">
              <LayoutGrid className="w-3 h-3" /> Grouping applies to the photos currently loaded below, not your entire library at once.
            </p>
          )}
        </div>

        {!loading && !error && (
          <p className="text-xs text-gray-500 mb-3">
            {totalCount} photo{totalCount === 1 ? '' : 's'} found
            {truncated && ' (showing results from your most recent reports only)'}
          </p>
        )}

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {[...Array(12)].map((_, i) => <div key={i} className="skeleton aspect-square rounded-xl" />)}
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
            <p className="text-gray-600 text-sm font-medium mb-3">Could not load your photos.</p>
            <button onClick={() => fetchPage(null)} className="btn-secondary text-sm py-2 px-4 inline-flex items-center gap-2">
              <RefreshCw className="w-4 h-4" /> Retry
            </button>
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-gray-200 rounded-xl">
            <ImageIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">{filtersActive ? 'No photos match these filters.' : 'No photos yet — generate a report with photos to see them here.'}</p>
            {filtersActive && <button onClick={clearFilters} className="mt-3 text-xs font-semibold text-brand-600 hover:text-brand-700">Clear Filters</button>}
          </div>
        ) : (
          <>
            {groupByArea ? (
              Object.entries(groupedEntries).sort(([a], [b]) => a.localeCompare(b)).map(([area, list]) => (
                <div key={area} className="mb-6">
                  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    {area} <span className="text-gray-400 font-normal">({list.length})</span>
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                    {list.map((e) => <PhotoTile key={entryKey(e)} entry={e} thumbUrl={thumbUrls[entryKey(e)]} onOpen={() => setActiveKey(entryKey(e))} />)}
                  </div>
                </div>
              ))
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {entries.map((e) => (
                  <PhotoTile key={entryKey(e)} entry={e} thumbUrl={thumbUrls[entryKey(e)]} onOpen={() => setActiveKey(entryKey(e))} />
                ))}
              </div>
            )}
            {nextCursor && (
              <div className="flex justify-center mt-5">
                <button onClick={() => fetchPage(nextCursor, { append: true })} disabled={loadingMore}
                  className="btn-secondary text-sm py-2 px-5 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                  {loadingMore ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                  {loadingMore ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {activePhoto && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4" role="dialog" aria-modal="true"
          aria-label={`Photo analysis for ${activePhoto.fileName || 'photo'}`} onClick={() => setActiveKey(null)}>
          <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                {!activePhoto.hasThumbnail ? (
                  <div className="w-full h-64 flex flex-col items-center justify-center bg-black/40 rounded-xl text-white/70 gap-2">
                    <AlertTriangle className="w-6 h-6" />
                    <p className="text-xs">This photo's image is unavailable.</p>
                  </div>
                ) : previewLoading || !previewUrl ? (
                  <div className="w-full h-64 flex items-center justify-center"><RefreshCw className="w-6 h-6 text-white animate-spin" /></div>
                ) : annotatorOpen && previewNaturalSize ? (
                  <div className="bg-bg rounded-xl p-3">
                    <PhotoAnnotator
                      imageUrl={previewUrl}
                      imageWidth={previewNaturalSize.width}
                      imageHeight={previewNaturalSize.height}
                      initialShapes={activePhoto.annotations?.shapes || []}
                      capturedAt={activePhoto.capturedAt}
                      readOnly={!activePhoto.canReview}
                      saving={annotationsSaving}
                      saveError={annotationsError}
                      onSave={(shapes) => doSaveAnnotations(activePhoto.photoId, shapes)}
                      onClose={() => setAnnotatorOpen(false)}
                    />
                  </div>
                ) : (
                  <img
                    src={previewUrl}
                    alt={activePhoto.fileName || 'Report photo'}
                    onLoad={(ev) => setPreviewNaturalSize({ width: ev.target.naturalWidth, height: ev.target.naturalHeight })}
                    className="w-full h-full max-h-[75vh] object-contain rounded-xl bg-black"
                  />
                )}
              </div>
              <div className="bg-bg rounded-xl p-4 space-y-3 text-left max-h-[75vh] overflow-y-auto">
                <div className="pb-2 border-b border-gray-100">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900 truncate">{activePhoto.claimNumber || 'No claim number'}</p>
                    <Link to={`/reports/${activePhoto.reportId}/preview`} className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1 shrink-0">
                      Open Report <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                  <p className="text-xs text-gray-500 truncate">{activePhoto.insuredName} · {activePhoto.propertyAddress}</p>
                  {!activePhoto.canReview && (
                    <p className="text-[11px] text-gray-400 mt-1">
                      {formatStatus(activePhoto.myPermission)} access — read only.
                    </p>
                  )}
                </div>
                {!annotatorOpen && (
                  <PhotoAnalysisPanel
                    photo={activePhotoForPanel}
                    canReview={activePhoto.canReview}
                    reviewSaving={reviewSaving}
                    editText={editText}
                    onEditTextChange={setEditText}
                    noteText={noteText}
                    onNoteTextChange={setNoteText}
                    onReview={doReview}
                    areaValue={areaText}
                    onAreaValueChange={setAreaText}
                    areaSaving={areaSaving}
                    onSaveArea={doSetArea}
                    onOpenAnnotator={activePhoto.hasThumbnail ? () => setAnnotatorOpen(true) : undefined}
                  />
                )}
              </div>
            </div>
            <div className="flex items-center justify-between mt-3 text-white">
              <p className="text-sm font-medium truncate">{activePhoto.fileName}</p>
              <button onClick={() => setActiveKey(null)} className="btn-secondary text-xs py-1.5 px-3">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
