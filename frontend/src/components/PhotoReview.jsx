import { CheckCircle, Pencil, Ban, MessageSquare, Sparkles, AlertTriangle, MapPin, PenLine } from 'lucide-react';
import { PHOTO_LOCATIONS } from '../utils/photoTaxonomy.js';

// Phase 8 (Per-Photo Analysis Review UI), extracted in Phase 22 (Photo
// Analysis Library) so the standalone /photos library can reuse the exact
// same badges/panel as the report editor's own photo gallery
// (Dashboard.jsx's ReportPhotoGallery) instead of a second, drifting copy.

// Per-photo upload-outcome indicator (Phase 6). `compact` renders an
// icon-only dot for tight grid-card corners; the default renders a labeled
// pill for list rows.
export function PhotoStatusBadge({ status, compact = false }) {
  const styles = {
    checking: { label: 'Checking', dot: 'bg-gray-400', pill: 'bg-gray-100 text-gray-600 border-gray-200' },
    ready: { label: 'Ready', dot: 'bg-green-500', pill: 'bg-green-500/10 text-green-600 border-green-500/20' },
    corrupt: { label: 'Failed', dot: 'bg-red-500', pill: 'bg-red-500/10 text-red-600 border-red-500/20' },
    duplicate: { label: 'Duplicate', dot: 'bg-amber-500', pill: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  };
  const s = styles[status] || styles.ready;
  if (compact) {
    if (status === 'ready') return null; // don't clutter every normal thumbnail with a badge
    return <span className={`w-2.5 h-2.5 rounded-full ${s.dot} ring-2 ring-white`} title={s.label} aria-label={s.label} />;
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${s.pill}`}>{s.label}</span>
  );
}

// Phase 24: a purely informational quality flag (low resolution and/or
// possibly blurry, per backend/utils/photoQuality.js's heuristic) -- the
// photo is never rejected for this, so the badge is a soft amber warning,
// not an error state like PhotoStatusBadge's red "Failed".
const QUALITY_REASON_LABELS = { low_resolution: 'Low resolution', blurry: 'Possibly blurry' };

export function QualityWarningBadge({ qualityWarning, qualityReasons = [], compact = false }) {
  if (!qualityWarning) return null;
  const label = qualityReasons.map((r) => QUALITY_REASON_LABELS[r] || r).join(' · ') || 'Quality warning';
  if (compact) {
    return (
      <span
        className="flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 ring-2 ring-white"
        title={label}
        aria-label={label}
      >
        <AlertTriangle className="w-2.5 h-2.5 text-white" />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border shrink-0 bg-amber-500/10 text-amber-700 border-amber-500/20">
      <AlertTriangle className="w-3 h-3" /> {label}
    </span>
  );
}

// Small colored dot indicating a reviewable photo's human review state,
// distinct from the upload-outcome badge above -- shown on each thumbnail.
export function ReviewStatusDot({ status }) {
  const styles = {
    pending: { dot: 'bg-gray-300', label: 'Not yet reviewed' },
    approved: { dot: 'bg-green-500', label: 'Approved' },
    edited: { dot: 'bg-blue-500', label: 'Edited' },
    excluded: { dot: 'bg-red-500', label: 'Excluded from report' },
  };
  const s = styles[status] || styles.pending;
  return <span className={`w-2.5 h-2.5 rounded-full ${s.dot} ring-2 ring-white`} title={s.label} aria-label={s.label} />;
}

export function ReviewStatusPill({ status }) {
  const styles = {
    pending: { label: 'Pending Review', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
    approved: { label: 'Approved', cls: 'bg-green-500/10 text-green-700 border-green-500/20' },
    edited: { label: 'Edited', cls: 'bg-blue-500/10 text-blue-700 border-blue-500/20' },
    excluded: { label: 'Excluded', cls: 'bg-red-500/10 text-red-700 border-red-500/20' },
  };
  const s = styles[status] || styles.pending;
  return <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${s.cls}`}>{s.label}</span>;
}

// The text report generation will actually use for this photo: the reviewer's
// edited replacement if present, otherwise the AI's own observation. Mirrors
// backend/services/aiService.js's buildEffectiveImageAnalysis exactly.
export const effectiveObservation = (photo) => {
  if (photo?.review?.status === 'edited' && photo.review.observation) return photo.review.observation;
  return photo?.analysis?.observation || '';
};

// The expanded photo's analysis + review-action panel (Phase 8's original
// modal content, generalized with `canReview` so a caller without edit
// permission on this specific report/photo -- e.g. a Phase 22 photo-library
// viewer with only 'view'/'comment' access, or Phase 19 read-only sharing --
// renders the exact same information as a plain read-only summary instead of
// silently hiding it or (worse) rendering controls that would 403 on submit.
export function PhotoAnalysisPanel({
  photo,
  canReview,
  reviewSaving,
  editText,
  onEditTextChange,
  noteText,
  onNoteTextChange,
  onReview,
  // Phase 24: room/area tagging works independently of AI analysis (a
  // photo still queued/unavailable can still be tagged), and annotating
  // is a separate action from all the review-state controls above --
  // both are optional props so callers that predate Phase 24 (none left
  // in this codebase, but defensively) don't need to pass them.
  areaValue,
  onAreaValueChange,
  areaSaving,
  onSaveArea,
  onOpenAnnotator,
}) {
  if (!photo) return null;

  if (!photo.reviewable) {
    return (
      <p className="text-sm text-gray-500">Review isn&apos;t available for photos uploaded before this feature — re-upload the photo to enable review.</p>
    );
  }

  const isExcluded = photo.review?.status === 'excluded';
  const hasAreaControls = typeof onSaveArea === 'function';
  const hasAnnotateControl = typeof onOpenAnnotator === 'function';

  const areaAndAnnotateRow = (hasAreaControls || hasAnnotateControl) && (
    <div className="flex flex-wrap items-end gap-2 pt-1">
      {hasAreaControls && (
        <div className="flex-1 min-w-[160px]">
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1">
            <MapPin className="w-3 h-3" /> Room / Area
          </label>
          {canReview ? (
            <div className="flex gap-2">
              <select
                value={PHOTO_LOCATIONS.includes(areaValue) ? areaValue : (areaValue ? 'Custom' : '')}
                onChange={(e) => onAreaValueChange(e.target.value === 'Custom' ? '' : e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                <option value="">Unassigned</option>
                {PHOTO_LOCATIONS.map((loc) => <option key={loc} value={loc}>{loc}</option>)}
                <option value="Custom">Custom…</option>
              </select>
              {(!PHOTO_LOCATIONS.includes(areaValue)) && (
                <input
                  type="text"
                  value={areaValue || ''}
                  onChange={(e) => onAreaValueChange(e.target.value)}
                  placeholder="Custom area name"
                  maxLength={80}
                  className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 flex-1 focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              )}
              <button
                onClick={() => onSaveArea(photo.id, areaValue)}
                disabled={areaSaving}
                className="btn-secondary text-xs py-1.5 px-3 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save
              </button>
            </div>
          ) : (
            <p className="text-sm text-gray-700">{photo.roomOrArea || 'Unassigned'}</p>
          )}
        </div>
      )}
      {hasAnnotateControl && (
        <button
          onClick={() => onOpenAnnotator(photo.id)}
          className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 shrink-0"
        >
          <PenLine className="w-3 h-3" /> {photo.annotations?.shapes?.length ? 'Edit Annotations' : 'Annotate'}
        </button>
      )}
    </div>
  );

  if (!photo.analysis) {
    return (
      <>
        <div className="flex flex-wrap gap-2">
          <QualityWarningBadge qualityWarning={photo.qualityWarning} qualityReasons={photo.qualityReasons} />
        </div>
        <p className="text-sm text-gray-500">
          {['queued', 'analyzing'].includes(photo.analysisStatus)
            ? 'FLACRON ENGINE is still analyzing this photo — check back shortly.'
            : photo.analysisStatus === 'needs_attention'
              ? 'Analysis needs attention for this photo. Retry analysis from the progress page, or exclude/note it below.'
              : 'No analysis is available for this photo.'}
        </p>
        {areaAndAnnotateRow}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <span className="text-xs px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-700 border border-brand-500/20">{photo.analysis.location}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200">{photo.analysis.category}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">Confidence: {photo.analysis.confidence}</span>
        <ReviewStatusPill status={photo.review?.status || 'pending'} />
        <QualityWarningBadge qualityWarning={photo.qualityWarning} qualityReasons={photo.qualityReasons} />
      </div>

      {areaAndAnnotateRow}

      {isExcluded && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center justify-between gap-2">
          <span className="text-sm text-red-700">Excluded — this photo will not appear in the report.</span>
          {canReview && (
            <button onClick={() => onReview(photo.id, 'include')} disabled={reviewSaving}
              className="btn-secondary text-xs py-1.5 px-3 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed">Restore</button>
          )}
        </div>
      )}

      {!isExcluded && (
        <>
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1 flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> AI-Suggested Observation
            </p>
            <p className="text-xs text-gray-500 italic">{photo.analysis.observation}</p>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Observation{photo.review?.status === 'edited' && <span className="text-blue-600 normal-case font-medium"> (edited{canReview ? ' by you' : ''})</span>}
            </label>
            {canReview ? (
              <textarea value={editText} onChange={e => onEditTextChange(e.target.value)} rows={3}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400" />
            ) : (
              <p className="text-sm text-gray-700 border border-gray-100 rounded-lg px-3 py-2 bg-gray-50">{effectiveObservation(photo)}</p>
            )}
          </div>
          {canReview && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => onReview(photo.id, 'edit', { observation: editText })}
                disabled={reviewSaving || !editText.trim() || editText.trim() === effectiveObservation(photo).trim()}
                className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed">
                <Pencil className="w-3 h-3" /> Save Edit
              </button>
              <button onClick={() => onReview(photo.id, 'approve')}
                disabled={reviewSaving || photo.review?.status === 'approved'}
                className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed">
                <CheckCircle className="w-3 h-3" /> Approve
              </button>
              <button onClick={() => onReview(photo.id, 'exclude')} disabled={reviewSaving}
                className="text-xs py-1.5 px-3 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed">
                <Ban className="w-3 h-3" /> Exclude From Report
              </button>
            </div>
          )}
        </>
      )}

      <div className="pt-2 border-t border-gray-100">
        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Note</label>
        {canReview ? (
          <>
            <textarea value={noteText} onChange={e => onNoteTextChange(e.target.value)} rows={2}
              placeholder="Add a note for your own reference..."
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400" />
            <button onClick={() => onReview(photo.id, 'note', { note: noteText })}
              disabled={reviewSaving || noteText.trim() === (photo.review?.note || '')}
              className="mt-2 btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed">
              <MessageSquare className="w-3 h-3" /> Save Note
            </button>
          </>
        ) : (
          <p className="text-sm text-gray-500 italic">{photo.review?.note || 'No note.'}</p>
        )}
      </div>
    </>
  );
}
