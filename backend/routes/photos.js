// Phase 22 (Photo Analysis Library) -- GET /api/photos, a standalone
// cross-report photo search endpoint. There is no dedicated `photos`
// Firestore collection (see backend/utils/photoLibrary.js's header): every
// photo lives inside its owning report's `photos[]` array. This route
// reuses Phase 19/20's exact access-scoping precedent (search.js) -- a
// bounded, permission-scoped read of the caller's OWN reports plus reports
// specifically ASSIGNED to them (never any wider organization pool) --
// followed by an in-memory flatten/filter/sort/paginate pass over that
// already-authorized window. The scoping happens here, server-side, before
// anything is flattened; only the requested page is ever sent to the client,
// and never a full-resolution image (those are fetched one at a time,
// per-photo, through the existing authenticated
// GET /reports/:id/photos/:photoId/image proxy, which Phase 22 also fixed to
// accept any of the caller's owned/assigned/shared reports, not just owned).
const express = require('express');
const router = express.Router();
const { getFirestore } = require('../config/firebase');
const { authenticateAny, requireApiScope } = require('../middleware/auth');
const { getReportAccess } = require('../utils/reportAccess');
const { hasCapability } = require('../utils/orgRoles');
const {
  isValidSort,
  isValidInclusionState,
  toLibraryEntry,
  matchesFilters,
  sortEntries,
  paginate,
} = require('../utils/photoLibrary');

const photosRead = requireApiScope('reports:read');

// Bounded scan window -- mirrors search.js's MAX_REPORTS_SCANNED precedent.
// Unlike search (which only ever needs the top few matches), this route
// paginates over the FULL scoped window, so the bound is generous rather
// than tight; `truncated` is returned honestly if a real account ever
// exceeds it, rather than silently pretending the result set is complete.
const MAX_REPORTS_SCANNED = 1000;

// Synthesizes photo entries from a report's `photos[]`, or from a legacy
// flat `imagePaths[]` list -- mirrors GET /api/reports/:id/photos's own
// synthesis exactly (same field derivation: `hasThumbnail`/`hasOriginal` are
// booleans derived from the raw Storage path fields, never the paths
// themselves; every real `photos[]` record is `reviewable: true`, a legacy
// imagePaths-derived entry is `reviewable: false`), so a pre-Phase-6 report
// surfaces the same honest "not reviewable, no thumbnail, no analysis"
// entries here as it does in the single-report gallery, rather than being
// silently dropped from the library or wrongly shown as having no thumbnail.
const extractPhotos = (report) => {
  if (Array.isArray(report.photos)) {
    return report.photos.map((p, i) => ({
      id: p.id,
      fileName: p.fileName,
      status: p.status,
      hasThumbnail: !!p.thumbnailPath,
      uploadedAt: p.uploadedAt,
      analysisStatus: p.analysisStatus || null,
      analysis: p.analysis || null,
      review: p.review || null,
      reviewable: true,
      // Phase 24 additions -- see photoBatchProcessor.js/photoLibrary.js.
      position: Number.isFinite(p.position) ? p.position : i,
      qualityWarning: !!p.qualityWarning,
      qualityReasons: p.qualityReasons || [],
      roomOrArea: p.roomOrArea || null,
      annotations: p.annotations || null,
    }));
  }
  return (report.imagePaths || []).map((_, i) => ({
    id: `legacy-${i}`,
    fileName: `Photo ${i + 1}`,
    status: 'uploaded',
    hasThumbnail: false,
    uploadedAt: report.createdAt || null,
    analysisStatus: null,
    analysis: null,
    review: null,
    reviewable: false,
    position: i,
    qualityWarning: false,
    qualityReasons: [],
    roomOrArea: null,
    annotations: null,
  }));
};

router.get('/', authenticateAny, photosRead, async (req, res) => {
  try {
    const db = getFirestore();
    const uid = req.user.uid;

    const sort = isValidSort(req.query.sort) ? req.query.sort : 'newest';
    const inclusion = isValidInclusionState(req.query.inclusion) ? req.query.inclusion : null;

    const [ownSnap, assignedSnap] = await Promise.all([
      db.collection('reports').where('userId', '==', uid).limit(MAX_REPORTS_SCANNED).get(),
      db
        .collection('reports')
        .where('assignedUserUids', 'array-contains', uid)
        .limit(MAX_REPORTS_SCANNED)
        .get(),
    ]);

    // A report could in theory appear in both snapshots (never happens in
    // practice -- an owner is never also their own grantee) -- de-dup by id
    // either way, same as search.js.
    const reportDocsById = new Map();
    ownSnap.docs.forEach((d) => reportDocsById.set(d.id, d));
    assignedSnap.docs.forEach((d) => {
      if (!reportDocsById.has(d.id)) reportDocsById.set(d.id, d);
    });

    const truncated =
      ownSnap.docs.length >= MAX_REPORTS_SCANNED || assignedSnap.docs.length >= MAX_REPORTS_SCANNED;

    let entries = [];
    for (const doc of reportDocsById.values()) {
      const report = doc.data();
      if (report.status === 'archived') continue;
      const access = getReportAccess(report, req.user);
      if (!access) continue; // defensive -- both source queries are already scoped to this uid
      // Mirrors PUT /reports/:id/photos/:photoId/review's exact dual-path
      // check: on the owner path, review/edit rights additionally depend on
      // the caller's OWN team-role capability (a restricted role like
      // Inspector may own reports but still lack canEditReports); on a
      // Phase 19 grantee path, capability comes entirely from the grant tier
      // ('review'), never from the grantee's own account role.
      const canReview = access === 'owner' ? hasCapability(req.user, 'canEditReports') : access === 'review';
      for (const photo of extractPhotos(report)) {
        // A failed/duplicate upload attempt never has viewable image bytes --
        // the per-report gallery gates preview the same way (Dashboard.jsx's
        // ReportPhotoGallery: `p.status === 'uploaded' && setPreviewId(...)`).
        if (photo.status && photo.status !== 'uploaded') continue;
        entries.push(toLibraryEntry(report, doc.id, photo, access, canReview));
      }
    }

    entries = entries.filter((e) =>
      matchesFilters(e, {
        claim: req.query.claim,
        location: req.query.location,
        category: req.query.category,
        analysisStatus: req.query.status,
        inclusion,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        search: req.query.search,
        area: req.query.area,
      })
    );

    entries = sortEntries(entries, sort);

    const { page, nextCursor, totalCount } = paginate(entries, req.query.cursor, req.query.limit);

    return res.json({
      success: true,
      photos: page,
      nextCursor,
      totalCount,
      truncated,
    });
  } catch (err) {
    console.error('Photo library error:', err.message);
    return res
      .status(500)
      .json({ success: false, error: 'Failed to fetch photos', code: 'PHOTO_LIBRARY_ERROR' });
  }
});

module.exports = router;
