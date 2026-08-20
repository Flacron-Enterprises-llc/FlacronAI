import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, AlertTriangle } from 'lucide-react';
import { reportsAPI } from '../services/api';

// Phase 10 (Report Review Checklist & Approval Modal). Pure read-only summary
// of real report data -- never fabricates a completion count or percentage;
// every number shown is derived directly from the report doc / the per-photo
// review state (Phase 8), so an incomplete report always reads as incomplete.
const countSections = (content) => {
  if (typeof content !== 'string' || !content.trim()) return 0;
  const matches = content.match(/^##\s+.+$/gm);
  return matches ? matches.length : 0;
};

function ChecklistRow({ ok, label, detail }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      {ok ? (
        <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
      ) : (
        <Circle className="w-4 h-4 text-gray-300 mt-0.5 shrink-0" />
      )}
      <div className="min-w-0">
        <p className={`text-xs font-medium ${ok ? 'text-gray-700' : 'text-gray-500'}`}>{label}</p>
        {detail && <p className="text-[11px] text-gray-400 mt-0.5">{detail}</p>}
      </div>
    </div>
  );
}

// `photos` (optional): pass the live per-photo review list when the caller
// already keeps one in sync (e.g. Dashboard.jsx's interactive Photo Review
// gallery, which can change moment-to-moment via Approve/Exclude/Edit
// actions that this component has no other way to observe). When omitted,
// this component fetches its own copy of GET /:id/photos -- correct for
// callers with no interactive gallery of their own (e.g. EnterpriseDashboard).
export default function ReportReviewChecklist({ report, photos: photosProp }) {
  const [fetchedPhotos, setFetchedPhotos] = useState(null);

  useEffect(() => {
    if (photosProp !== undefined) return undefined;
    if (!report?.id || !(report.imageCount > 0)) {
      setFetchedPhotos([]);
      return undefined;
    }
    let cancelled = false;
    reportsAPI
      .getPhotos(report.id)
      .then((res) => { if (!cancelled) setFetchedPhotos(res.data?.photos || []); })
      .catch(() => { if (!cancelled) setFetchedPhotos([]); });
    return () => { cancelled = true; };
  }, [report?.id, report?.imageCount, photosProp]);

  if (!report) return null;

  const photoList = photosProp !== undefined ? photosProp || [] : fetchedPhotos;
  const hasPhotos = (report.imageCount || 0) > 0;

  const reviewablePhotos = (photoList || []).filter((p) => p.reviewable);
  const analyzedPhotos = reviewablePhotos.filter((p) => p.analysisStatus === 'completed');
  const unreviewedPhotos = analyzedPhotos.filter((p) => (p.review?.status || 'pending') === 'pending');
  const excludedPhotos = analyzedPhotos.filter((p) => p.review?.status === 'excluded');
  const reviewedCount = analyzedPhotos.length - unreviewedPhotos.length;
  const legacyOnly = hasPhotos && reviewablePhotos.length === 0;
  const photosStillLoading = hasPhotos && photoList === null;

  const claimComplete = !!(
    report.claimNumber &&
    report.insuredName &&
    report.propertyAddress &&
    report.lossDate
  );
  const inspectionComplete = !!(report.inspectionDate && report.inspectorName);
  const photosComplete =
    !hasPhotos || legacyOnly || photosStillLoading
      ? true
      : analyzedPhotos.length === reviewablePhotos.length && unreviewedPhotos.length === 0;
  const documents = report.documents || [];
  const documentationComplete = documents.length > 0;
  const sectionCount = countSections(report.content);
  const sectionsComplete = sectionCount > 0;

  let photoDetail;
  if (!hasPhotos) photoDetail = 'No photos uploaded on this report';
  else if (photosStillLoading) photoDetail = 'Loading photo review status…';
  else if (legacyOnly) photoDetail = `${report.imageCount} photo${report.imageCount === 1 ? '' : 's'} on this report predate per-photo review`;
  else
    photoDetail =
      `${analyzedPhotos.length} of ${reviewablePhotos.length} analyzed · ${reviewedCount} of ${analyzedPhotos.length} reviewed` +
      (excludedPhotos.length ? ` · ${excludedPhotos.length} excluded` : '');

  const warnings = [];
  if (!report.claimNumber) warnings.push('Claim number is missing from this report.');
  if (!photosStillLoading && excludedPhotos.length > 0) {
    warnings.push(`${excludedPhotos.length} photo${excludedPhotos.length === 1 ? '' : 's'} excluded from this report.`);
  }
  if (!photosStillLoading && unreviewedPhotos.length > 0) {
    warnings.push(`${unreviewedPhotos.length} photo${unreviewedPhotos.length === 1 ? '' : 's'} not yet reviewed.`);
  }
  if (!report.inspectionDate) warnings.push('Inspection date is missing from this report.');

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-800 mb-1">Review Checklist</h3>
      <p className="text-[11px] text-gray-400 mb-2">Reflects the report's current data — not a prediction of accuracy or completeness of findings.</p>
      <div className="divide-y divide-gray-50">
        <ChecklistRow
          ok={claimComplete}
          label="Claim Data"
          detail={claimComplete ? 'Claim number, insured, address, and loss date on file' : 'Missing one or more required claim fields'}
        />
        <ChecklistRow
          ok={inspectionComplete}
          label="Inspection Data"
          detail={inspectionComplete ? `Inspected ${report.inspectionDate}${report.inspectorName ? ` by ${report.inspectorName}` : ''}` : 'Inspection date and/or inspector name not recorded'}
        />
        <ChecklistRow ok={photosComplete} label="Photos" detail={photoDetail} />
        <ChecklistRow
          ok={documentationComplete}
          label="Documentation"
          detail={documentationComplete ? `${documents.length} supporting document${documents.length === 1 ? '' : 's'} attached` : 'No supporting documents attached'}
        />
        <ChecklistRow
          ok={sectionsComplete}
          label="Draft Sections"
          detail={sectionsComplete ? `${sectionCount} section${sectionCount === 1 ? '' : 's'} drafted` : 'No report content has been generated yet'}
        />
      </div>
      {warnings.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {warnings.map((w) => (
            <div key={w} className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
