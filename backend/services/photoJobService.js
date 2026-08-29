// Phase 7 (Async Photo Analysis Pipeline). Converts photo analysis + report
// generation from synchronous (blocking POST /generate) into a real
// background pipeline, using the in-process async queue approach the client
// chose (no new infra -- Firestore itself is the durable job-status store;
// there is no separate in-memory queue to lose track of, only the in-flight
// Node execution, which is the accepted, explicit tradeoff of this approach:
// it does not survive a Render restart mid-job).
//
// `analysisJobs` collection fields match spec §15's literal schema:
//   id, reportId, photoId, type ('photo_analysis'|'report_generation'),
//   status ('queued'|'analyzing'|'completed'|'needs_attention'|'failed'),
//   attemptCount, startedAt, completedAt, error.
//
// Report-level status reuses the existing simple vocabulary rather than the
// spec's full 10-state list (PHASES.md Phase 7 task 2 explicitly recommends a
// mapping layer over a breaking rename) -- 'processing' and 'failed' already
// existed as unused dead options in the frontend's status filter; this phase
// is what makes them real. 'draft'/'finalized'/'archived' are unchanged.
const { v4: uuidv4 } = require('uuid');
const { getFirestore, FieldValue } = require('../config/firebase');
const { analyzeImages, generateReport, checkQuality, buildEffectiveImageAnalysis } = require('./aiService');
const { emitEvent } = require('./webhookService');
const { downloadBuffer } = require('../config/storage');
const { appendTemplateSections } = require('../utils/richContent');
const { sendAnalysisCompletedEmail, sendReportCompletedEmail } = require('./emailService');
const { isNotificationEnabled } = require('../utils/notificationPrefs');
const { notifyUser, NOTIFICATION_TYPES } = require('../utils/notificationService');
const { getReportAccess } = require('../utils/reportAccess');
const { downloadPhotosForAnalysis } = require('../utils/photoRetrieval');

const MAX_GENERATION_ATTEMPTS = 2;
// Phase 8: an edited/added observation or note length cap, enforced
// server-side regardless of what the frontend already restricts client-side.
const MAX_OBSERVATION_LENGTH = 3000;
const MAX_NOTE_LENGTH = 1000;
// Phase 24 (Photo Quality Warnings, Ordering, Grouping & Annotations).
const MAX_ROOM_OR_AREA_LENGTH = 80;
const MAX_REORDER_PHOTOS = 200; // generous upper bound; reports cap at 100 uploaded photos
const MAX_ANNOTATION_SHAPES = 60;
const MAX_ANNOTATION_POINTS = 200; // per shape (freehand paths are the largest)
const ANNOTATION_SHAPE_TYPES = new Set(['arrow', 'circle', 'rect', 'freehand', 'measurement']);
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
// Statuses generateFromPhotoReview/regenerate may run against -- a report
// still 'processing' has no stable photos[]/content to build from yet, and
// 'failed' should be recovered via Retry Analysis, not this endpoint.
const REGENERATABLE_STATUSES = new Set(['draft', 'finalized']);
// Mirrors reports.js's own isReviewed() -- duplicated (not imported) to avoid
// a circular require (reports.js already requires this module).
const isReviewedStatus = (status) => status === 'finalized' || status === 'approved' || status === 'completed';

const nowIso = () => new Date().toISOString();

const DEFAULT_REVIEW = () => ({ status: 'pending', observation: null, note: '', reviewedBy: null, reviewedAt: null });

// Strips ASCII control characters (codes 0-31 and 127) from free-text user
// input, e.g. the Phase 24 room/area tag -- written as an explicit
// charCodeAt filter rather than a regex literal containing raw control-code
// escapes, which are easy to mis-author into a source file as literal bytes.
const stripControlChars = (str) => {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 32 && code !== 127) out += str[i];
  }
  return out;
};

// Merges a retry's fresh (partial) analysis result with the imageAnalysis
// already saved from a prior successful run, so re-analyzing just the photos
// that were previously stuck in 'needs_attention' doesn't silently discard
// the findings from every photo that already succeeded. Mirrors
// aiService.aggregateBatchResults' merge shape, but combines two already-
// aggregated results instead of raw per-batch ones (there's no raw batch
// data left to re-aggregate from once the first run has completed).
const SEVERITY_RANK = { Unknown: -1, Minor: 0, Moderate: 1, Severe: 2 };
const mergeImageAnalysis = (existing, fresh) => {
  if (!existing) return fresh;
  if (!fresh) return existing;
  const worseSeverity = (SEVERITY_RANK[existing.severity] ?? -1) >= (SEVERITY_RANK[fresh.severity] ?? -1)
    ? existing.severity : fresh.severity;
  return {
    summary: [existing.summary, fresh.summary].filter(Boolean).join(' '),
    severity: worseSeverity || 'Unknown',
    totalImagesAnalyzed: (existing.totalImagesAnalyzed || 0) + (fresh.totalImagesAnalyzed || 0),
    damages: [...(existing.damages || []), ...(fresh.damages || [])],
    // Phase 8: the raw per-photo AI classifications (pre-review), concatenated
    // the same way `damages` is -- kept only as batch-level context;
    // buildEffectiveImageAnalysis (aiService.js) is what report generation
    // actually reads for the reviewed, authoritative `damages`/`severity`.
    photos: [...(existing.photos || []), ...(fresh.photos || [])],
    itemsForProfessionalReview: [...new Set([
      ...(existing.itemsForProfessionalReview || []), ...(fresh.itemsForProfessionalReview || []),
    ])],
    documentationNotes: [existing.documentationNotes, fresh.documentationNotes].filter(Boolean).join(' '),
    imagesSkipped: existing.imagesSkipped || 0,
    imagesFailed: fresh.imagesFailed || 0, // the retry's own failure count supersedes the stale prior one
  };
};

// ── Job bookkeeping ─────────────────────────────────────────────────────────

const createAnalysisJobs = async (reportId, photoIds) => {
  const db = getFirestore();
  const batch = db.batch();
  const jobs = photoIds.map((photoId) => {
    const id = uuidv4();
    const ref = db.collection('analysisJobs').doc(id);
    const job = {
      id, reportId, photoId, type: 'photo_analysis', status: 'queued',
      attemptCount: 0, startedAt: null, completedAt: null, error: null, createdAt: nowIso(),
    };
    batch.set(ref, job);
    return job;
  });
  if (jobs.length) await batch.commit();
  return jobs;
};

const createGenerationJob = async (reportId) => {
  const db = getFirestore();
  const id = uuidv4();
  const job = {
    id, reportId, photoId: null, type: 'report_generation', status: 'queued',
    attemptCount: 0, startedAt: null, completedAt: null, error: null, createdAt: nowIso(),
  };
  await db.collection('analysisJobs').doc(id).set(job);
  return job;
};

// Marks every 'photo_analysis' job for the given photoIds with the same
// update in one batched write (independent docs -- no transaction needed,
// unlike the report doc's shared `photos` array below).
const updateJobsForPhotos = async (reportId, photoIds, updates) => {
  if (!photoIds.length) return;
  const db = getFirestore();
  const snap = await db.collection('analysisJobs')
    .where('reportId', '==', reportId)
    .where('type', '==', 'photo_analysis')
    .where('photoId', 'in', photoIds.slice(0, 30)) // Firestore 'in' caps at 30 -- batches are already <=10, always well under
    .get();
  const batch = db.batch();
  snap.docs.forEach((doc) => batch.update(doc.ref, updates));
  await batch.commit();
};

const updateJob = async (jobId, updates) => {
  await getFirestore().collection('analysisJobs').doc(jobId).update(updates);
};

// Atomically patches the report doc's embedded `photos[]` array for just the
// given photoIds. Uses a transaction because multiple vision batches can
// complete concurrently (VISION_BATCH_CONCURRENCY=3) and each only knows
// about its own slice of photos -- a plain read-modify-write here would risk
// losing one batch's update if two finish close together; Firestore retries
// a transaction whose read was invalidated by another commit, so this is safe.
const patchPhotosAnalysisStatus = async (reportId, photoIds, analysisStatus, extra = {}) => {
  if (!photoIds.length) return;
  const db = getFirestore();
  const ref = db.collection('reports').doc(reportId);
  const idSet = new Set(photoIds);
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) return;
    const photos = doc.data().photos || [];
    const updated = photos.map((p) => (idSet.has(p.id) ? { ...p, analysisStatus, ...extra } : p));
    tx.update(ref, { photos: updated, updatedAt: nowIso() });
  });
};

// Phase 8: same transactional pattern as patchPhotosAnalysisStatus above, but
// also writes each photo's own structured `analysis` result (not one shared
// value for the whole batch -- `perPhotoAnalysis` is a Map keyed by photoId).
// Preserves each photo's existing `review` state untouched (or initializes it
// if somehow missing -- e.g. a report whose photos predate this field),
// exactly like patchPhotosAnalysisStatus preserves it via `...p`.
const applyBatchAnalysisResults = async (reportId, photoIds, perPhotoAnalysis, analysisStatus, analysisError) => {
  if (!photoIds.length) return;
  const db = getFirestore();
  const ref = db.collection('reports').doc(reportId);
  const idSet = new Set(photoIds);
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) return;
    const photos = doc.data().photos || [];
    const updated = photos.map((p) => {
      if (!idSet.has(p.id)) return p;
      const analysis = perPhotoAnalysis.get(p.id) || p.analysis || null;
      return { ...p, analysisStatus, analysisError, analysis, review: p.review || DEFAULT_REVIEW() };
    });
    tx.update(ref, { photos: updated, updatedAt: nowIso() });
  });
};

// Builds the `onBatchComplete` hook analyzeImages() calls once per settled
// batch (Phase 7), extended (Phase 8) to also distribute that batch's
// per-photo AI classifications onto the matching photoId in report.photos[]
// -- `batchPhotoIds[i]` and `result.result.photos[i]` are the same photo, by
// construction (aiService.js guarantees `photos.length === imageBlocks.length`
// for a successful batch; see normalizePhotoEntries). Shared by
// runReportPipeline and runPhotoAnalysisOnly so both write photos identically.
const makeOnBatchComplete = (reportId) => async (batchPhotoIds, result) => {
  const analysisStatus = result.ok ? 'completed' : 'needs_attention';
  const perPhotoAnalysis = new Map();
  if (result.ok) {
    const photosArr = result.result.photos || [];
    batchPhotoIds.forEach((id, idx) => {
      const p = photosArr[idx];
      if (p) {
        perPhotoAnalysis.set(id, {
          location: p.location, category: p.category, severity: p.severity,
          observation: p.observation, confidence: p.confidence,
        });
      }
    });
  }
  await Promise.all([
    applyBatchAnalysisResults(reportId, batchPhotoIds, perPhotoAnalysis, analysisStatus, result.ok ? null : result.error),
    updateJobsForPhotos(reportId, batchPhotoIds, {
      status: analysisStatus,
      attemptCount: FieldValue.increment(result.attempts || 1),
      completedAt: nowIso(),
      error: result.ok ? null : result.error,
    }),
  ]);
};

// Appends a version-history entry, mirroring reports.js's own recordVersion()
// (duplicated rather than imported, to avoid a circular require -- reports.js
// requires this module, so this module can't require reports.js back).
const recordVersion = async (reportId, { action, by, content, note = '' }) => {
  try {
    await getFirestore().collection('reports').doc(reportId).collection('versions').add({
      action, by: by || 'system', note, content, at: nowIso(),
    });
  } catch (e) {
    console.warn('[photoJobService] version record failed:', e.message);
  }
};

// ── Status read (GET /:id/analysis-status) ──────────────────────────────────

const getAnalysisStatus = async (reportId, uid) => {
  const db = getFirestore();
  const reportDoc = await db.collection('reports').doc(reportId).get();
  if (!reportDoc.exists || reportDoc.data().userId !== uid) return null;
  const report = reportDoc.data();

  const jobsSnap = await db.collection('analysisJobs').where('reportId', '==', reportId).get();
  const photoJobs = jobsSnap.docs.map((d) => d.data()).filter((j) => j.type === 'photo_analysis');
  const generationJob = jobsSnap.docs.map((d) => d.data()).find((j) => j.type === 'report_generation') || null;

  const counts = { queued: 0, analyzing: 0, completed: 0, needs_attention: 0, failed: 0 };
  photoJobs.forEach((j) => { counts[j.status] = (counts[j.status] || 0) + 1; });

  return {
    reportStatus: report.status,
    pipelineError: report.pipelineError || null,
    totalPhotos: photoJobs.length,
    analyzed: counts.completed,
    queued: counts.queued,
    analyzing: counts.analyzing,
    needsAttention: counts.needs_attention,
    failed: counts.failed,
    generation: generationJob ? { status: generationJob.status, error: generationJob.error } : null,
  };
};

// ── The pipeline itself ──────────────────────────────────────────────────────

// One retry on top of generateReport()'s own internal Claude->watsonx
// fallback -- covers a transient failure of BOTH providers in the same instant.
const generateReportWithRetry = async (reportData, imageAnalysis, photoCount) => {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    try {
      return await generateReport(reportData, imageAnalysis, photoCount);
    } catch (err) {
      lastErr = err;
      console.warn(`Report generation attempt ${attempt}/${MAX_GENERATION_ATTEMPTS} failed:`, err.message);
    }
  }
  throw lastErr;
};

// Runs entirely in the background -- the caller (POST /generate) never awaits
// this; it fires this off after already responding to the client with the
// newly-created 'processing' report. Never throws (a catch-all wraps the
// whole body) -- a report must never be left stuck in 'processing' forever
// just because something here threw unexpectedly.
const runReportPipeline = async ({ reportId, uid, analyzableImages, reportData, userEmail, existingImageAnalysis = null }) => {
  const db = getFirestore();
  const reportRef = db.collection('reports').doc(reportId);
  // Declared here (not inside the try block below) so the outer catch-all --
  // which must handle a throw from ANY stage, including before this is set --
  // can still read it safely for the analysis-failed notification.
  let notifyUserData = {};

  try {
    const photoIds = analyzableImages.map((img) => img.photoId);
    // A retry that only needs to re-run report generation (no photos stuck)
    // must not wipe out image analysis that already succeeded the first time.
    let imageAnalysis = existingImageAnalysis;

    // Phase 18 (Notifications): fetched once, reused for both the
    // analysis-completed and report-completed emails below -- a single extra
    // read per pipeline run (this function already does several).
    const notifyUserDoc = await db.collection('users').doc(uid).get();
    notifyUserData = notifyUserDoc.data() || {};

    if (analyzableImages.length > 0) {
      await updateJobsForPhotos(reportId, photoIds, { status: 'analyzing', startedAt: nowIso() });
      await patchPhotosAnalysisStatus(reportId, photoIds, 'analyzing');

      const freshAnalysis = await analyzeImages(analyzableImages, {
        onBatchComplete: makeOnBatchComplete(reportId),
        claimType: reportData.claimType,
      });
      // A retry only ever covers the SUBSET of photos previously stuck in
      // 'needs_attention' -- merge with whatever already-successful analysis
      // exists rather than replacing it, so those findings aren't lost.
      const mergedBase = existingImageAnalysis ? mergeImageAnalysis(existingImageAnalysis, freshAnalysis) : freshAnalysis;

      // Phase 8: read back the report's own photos[] -- by now every batch's
      // onBatchComplete (awaited above, since analyzeImages doesn't resolve
      // until every batch, including its hook, has settled) has already
      // written each analyzed photo's `.analysis` + `.review` (defaulted
      // 'pending' at upload time). This is the authoritative per-photo state
      // -- including photos from an EARLIER successful run, on a retry -- so
      // building the report's actual `imageAnalysis` input from it (instead
      // of from the raw batch aggregate) reflects any review already done and
      // never double-counts a retry's subset against the merged raw totals.
      const freshDoc = await reportRef.get();
      imageAnalysis = buildEffectiveImageAnalysis(mergedBase, freshDoc.data()?.photos || []);

      // Phase 18 (Notifications): gated by 'analysisCompleted', fire-and-forget.
      if (userEmail && isNotificationEnabled(notifyUserData.notifications, 'analysisCompleted')) {
        sendAnalysisCompletedEmail(userEmail, notifyUserData.displayName, {
          reportId, claimNumber: reportData.claimNumber || null, photoCount: analyzableImages.length,
        }).catch((err) => console.warn('[Email] analysis-completed notification failed:', err.message));
      }
      // Phase 20: the in-app bell entry is gated by the same preference but
      // NOT by `userEmail` -- it fires on a retry too (retryFailedAnalysis
      // deliberately passes userEmail: null to skip the email, but a
      // user-initiated retry succeeding is still worth a bell entry).
      if (isNotificationEnabled(notifyUserData.notifications, 'analysisCompleted')) {
        notifyUser(db, uid, NOTIFICATION_TYPES.ANALYSIS_COMPLETED, {
          reportId, claimNumber: reportData.claimNumber || null, photoCount: analyzableImages.length,
        }).catch((err) => console.warn('[Notifications] analysis-completed notification failed:', err.message));
      }
    }

    const generationJobSnap = await db.collection('analysisJobs')
      .where('reportId', '==', reportId).where('type', '==', 'report_generation').limit(1).get();
    const generationJobId = generationJobSnap.empty ? null : generationJobSnap.docs[0].id;
    if (generationJobId) await updateJob(generationJobId, { status: 'analyzing', startedAt: nowIso(), attemptCount: FieldValue.increment(1) });

    let content, modelUsed, qualityCheck;
    try {
      const gen = await generateReportWithRetry(reportData, imageAnalysis, analyzableImages.length);
      // Phase 13: a template's custom sections are guaranteed to appear via
      // this deterministic append, not left to the AI prompt's guidance alone.
      content = appendTemplateSections(gen.content, reportData.templateSections);
      modelUsed = gen.modelUsed;
      qualityCheck = await checkQuality(content);
    } catch (genErr) {
      if (generationJobId) await updateJob(generationJobId, { status: 'failed', error: genErr.message, completedAt: nowIso() });
      await reportRef.update({ status: 'failed', pipelineError: genErr.message, updatedAt: nowIso() });
      // Phase 20: no dedicated "analysis failed" preference exists (Phase 18
      // defined 6 keys, not 7) -- reusing 'analysisCompleted' for the failure
      // case too is a deliberate, documented choice, the same posture Phase
      // 19 took reusing 'reviewRequested' for both directions of that
      // lifecycle rather than fabricating a new toggle.
      if (isNotificationEnabled(notifyUserData.notifications, 'analysisCompleted')) {
        notifyUser(db, uid, NOTIFICATION_TYPES.ANALYSIS_FAILED, {
          reportId, claimNumber: reportData.claimNumber || null,
        }).catch((err) => console.warn('[Notifications] analysis-failed notification failed:', err.message));
      }
      return;
    }
    if (generationJobId) await updateJob(generationJobId, { status: 'completed', completedAt: nowIso() });

    await reportRef.update({
      content, modelUsed, imageAnalysis, qualityScore: qualityCheck.score,
      status: 'draft', pipelineError: null, updatedAt: nowIso(),
    });
    await recordVersion(reportId, { action: 'generated', by: userEmail || uid, content, note: `Generated via ${modelUsed}` });

    // Only count a report against the monthly limit once it actually
    // succeeds -- a rare total-provider outage shouldn't cost the user a slot.
    const userRef = db.collection('users').doc(uid);
    await db.runTransaction(async (tx) => {
      const userDoc = await tx.get(userRef);
      const data = userDoc.data() || {};
      tx.set(userRef, {
        reportsGenerated: (data.reportsGenerated || 0) + 1,
        reportsThisMonth: (data.reportsThisMonth || 0) + 1,
        updatedAt: nowIso(),
      }, { merge: true });
    });

    emitEvent(uid, 'report.generated', {
      reportId, status: 'draft', claimNumber: reportData.claimNumber || null, createdAt: nowIso(),
    }).catch(() => {});
    // Phase 18 (Notifications): gated by 'reportCompleted', fire-and-forget.
    if (userEmail && isNotificationEnabled(notifyUserData.notifications, 'reportCompleted')) {
      sendReportCompletedEmail(userEmail, notifyUserData.displayName, {
        reportId, claimNumber: reportData.claimNumber || null,
      }).catch((err) => console.warn('[Email] report-completed notification failed:', err.message));
    }
    // Phase 20: this IS "report ready for review" in this codebase's real
    // state machine -- a report becomes 'draft' (awaiting the owner's own
    // review) at the exact instant generation completes, there is no separate
    // later moment to notify a second time for the same transition.
    if (isNotificationEnabled(notifyUserData.notifications, 'reportCompleted')) {
      notifyUser(db, uid, NOTIFICATION_TYPES.REPORT_COMPLETED, {
        reportId, claimNumber: reportData.claimNumber || null,
      }).catch((err) => console.warn('[Notifications] report-completed notification failed:', err.message));
    }
  } catch (err) {
    console.error(`[photoJobService] pipeline failed unexpectedly for report ${reportId}:`, err);
    await reportRef.update({ status: 'failed', pipelineError: err.message, updatedAt: nowIso() }).catch(() => {});
    // Phase 20: notifyUserData stays `{}` (never a ReferenceError) if the
    // pipeline threw before that read completed -- isNotificationEnabled
    // defaults an unset key to true, so this still fires in that case.
    if (isNotificationEnabled(notifyUserData.notifications, 'analysisCompleted')) {
      notifyUser(db, uid, NOTIFICATION_TYPES.ANALYSIS_FAILED, {
        reportId, claimNumber: reportData?.claimNumber || null,
      }).catch(() => {});
    }
  }
};

// Used by POST /:id/images (adding photos to an already-generated report) --
// same background analysis mechanics as the main pipeline, but deliberately
// does NOT touch report `content`/generation (this endpoint has never
// regenerated report text when photos are added after the fact, and Phase 7
// doesn't change that scope) or the monthly usage counters (those are
// charged once, at report creation, not per photo added afterward).
const runPhotoAnalysisOnly = async ({ reportId, uid, claimNumber, claimType, analyzableImages, existingImageAnalysis = null }) => {
  const db = getFirestore();
  const reportRef = db.collection('reports').doc(reportId);
  if (analyzableImages.length === 0) return;

  // Phase 20: this path never had an email hook (Phase 18 only wired the
  // main generate pipeline), but it's still a genuine "photo analysis
  // completed/failed" event -- the in-app bell fires here too, gated by the
  // same 'analysisCompleted' preference as the main pipeline. Best-effort: a
  // missing/unreadable user doc must never break the analysis itself.
  const notifyUserData = uid
    ? await db.collection('users').doc(uid).get().then((d) => d.data() || {}).catch(() => ({}))
    : {};

  try {
    const photoIds = analyzableImages.map((img) => img.photoId);
    await updateJobsForPhotos(reportId, photoIds, { status: 'analyzing', startedAt: nowIso() });
    await patchPhotosAnalysisStatus(reportId, photoIds, 'analyzing');

    const freshAnalysis = await analyzeImages(analyzableImages, {
      onBatchComplete: makeOnBatchComplete(reportId),
      claimType,
    });

    const merged = existingImageAnalysis ? mergeImageAnalysis(existingImageAnalysis, freshAnalysis) : freshAnalysis;
    await reportRef.update({ imageAnalysis: merged, updatedAt: nowIso() });
    if (uid && isNotificationEnabled(notifyUserData.notifications, 'analysisCompleted')) {
      notifyUser(db, uid, NOTIFICATION_TYPES.ANALYSIS_COMPLETED, {
        reportId, claimNumber: claimNumber || null, photoCount: analyzableImages.length,
      }).catch(() => {});
    }
  } catch (err) {
    console.error(`[photoJobService] add-photos analysis failed for report ${reportId}:`, err);
    if (uid && isNotificationEnabled(notifyUserData.notifications, 'analysisCompleted')) {
      notifyUser(db, uid, NOTIFICATION_TYPES.ANALYSIS_FAILED, { reportId, claimNumber: claimNumber || null }).catch(() => {});
    }
    // Best-effort: mark whichever of these new photos are still stuck as
    // needs_attention rather than leaving them silently 'analyzing' forever.
    const photoIds = analyzableImages.map((img) => img.photoId);
    await patchPhotosAnalysisStatus(reportId, photoIds, 'needs_attention', { analysisError: err.message }).catch(() => {});
  }
};

// ── Retry (POST /:id/analysis/retry) ────────────────────────────────────────

// Re-runs analysis for just the photos stuck in 'needs_attention' (re-reading
// their already-uploaded bytes from Storage -- nothing needs re-uploading),
// and/or re-runs report generation if that stage is what failed. Fires the
// same background pipeline shape as the initial run, scoped to what's broken.
const retryFailedAnalysis = async (reportId, uid) => {
  const db = getFirestore();
  const reportRef = db.collection('reports').doc(reportId);
  const reportDoc = await reportRef.get();
  if (!reportDoc.exists || reportDoc.data().userId !== uid) return { success: false, code: 'NOT_FOUND' };
  const report = reportDoc.data();

  // Idempotency fix (production incident: generation "takes excessively
  // long", partly driven by duplicate/overlapping pipeline runs for the same
  // report): a report already mid-pipeline (the initial run, or an earlier
  // retry) is still 'processing' -- a repeated "Retry Analysis" click, or the
  // frontend's status-poll racing a manual retry, must not fire a SECOND
  // concurrent runReportPipeline that re-downloads and re-analyzes whatever
  // photos happen to be 'needs_attention' at that instant while the first
  // run is still working. Checked before NOTHING_TO_RETRY below so it wins
  // even when the in-flight run hasn't flagged any photo needs_attention yet.
  if (report.status === 'processing') {
    return {
      success: false,
      code: 'ALREADY_PROCESSING',
      error: 'This report is already being processed. Please wait for it to finish before retrying.',
    };
  }

  const stuckPhotos = (report.photos || []).filter((p) => p.analysisStatus === 'needs_attention');
  const generationFailed = report.status === 'failed';

  if (stuckPhotos.length === 0 && !generationFailed) {
    return { success: false, code: 'NOTHING_TO_RETRY', error: 'Nothing needs retrying on this report.' };
  }

  await reportRef.update({ status: 'processing', pipelineError: null, updatedAt: nowIso() });

  // Perf fix: re-download each stuck photo's already-stored display-tier
  // bytes (no re-upload -- the objects are already in Storage from the
  // original run) with bounded concurrency instead of one at a time -- this
  // used to be a sequential `for..of` loop, so a retry with many stuck
  // photos spent seconds just re-fetching bytes before a single Claude call
  // could even start. A photo whose object is genuinely missing/unreadable
  // is still left 'needs_attention' rather than the retry silently
  // pretending it covered it.
  const retryImages = await downloadPhotosForAnalysis(stuckPhotos, downloadBuffer);

  const reportData = {
    claimNumber: report.claimNumber, insuredName: report.insuredName, propertyAddress: report.propertyAddress,
    lossDate: report.lossDate, lossType: report.lossType, reportType: report.reportType,
    additionalNotes: report.additionalNotes, propertyDetails: report.propertyDetails,
    lossDescription: report.lossDescription, damagesObserved: report.damagesObserved, recommendations: report.recommendations,
    // Phase 13: preserved from the original generation so a retry re-applies
    // the same template guidance/sections instead of silently losing them.
    templateGuidance: report.templateGuidance || null,
    templateSections: report.templateSections || null,
    // claimType/lossType-selected document architectures (Phases 31-35) must
    // survive a retry too, or a stuck Liability/Commercial/Flood/Theft/Auto
    // report would silently fall back to the generic template on retry.
    claimType: report.claimType || '',
    claimantName: report.claimantName || '',
    claimantContact: report.claimantContact || '',
    propertyManagerName: report.propertyManagerName || '',
    propertyManagerContact: report.propertyManagerContact || '',
    roofType: report.roofType || '',
    roofAge: report.roofAge || '',
    tenantSuiteCount: report.tenantSuiteCount || '',
    policyNumber: report.policyNumber || '',
    floodZone: report.floodZone || '',
    lowestFloorElevation: report.lowestFloorElevation || '',
    baseFloodElevation: report.baseFloodElevation || '',
    floodEventSource: report.floodEventSource || '',
    reportedCrest: report.reportedCrest || '',
    policeIncidentNumber: report.policeIncidentNumber || '',
    pointsOfEntry: report.pointsOfEntry || '',
    vin: report.vin || '',
    vehicleMakeModelYear: report.vehicleMakeModelYear || '',
    odometer: report.odometer || '',
    licensePlate: report.licensePlate || '',
    vehicleColor: report.vehicleColor || '',
  };

  // Fire the same pipeline shape, scoped to just what needs retrying. If only
  // generation failed (no stuck photos), analyzableImages is empty and the
  // existing imageAnalysis is reused instead of blanking it out.
  runReportPipeline({
    reportId,
    uid,
    analyzableImages: retryImages,
    reportData,
    userEmail: null,
    existingImageAnalysis: report.imageAnalysis || null,
  }).catch((err) => console.error('[photoJobService] retry pipeline failed:', err.message));

  return { success: true };
};

// ── Per-photo review (Phase 8: Per-Photo Analysis Review UI) ───────────────

// Applies one Edit/Approve/Exclude/Include(restore)/Add-Note action to a
// single photo on a report, inside a transaction (same reasoning as
// applyBatchAnalysisResults above: the analysis pipeline can still be
// writing other photos' `analysisStatus`/`.analysis` to this same `photos[]`
// array concurrently, and a plain read-modify-write here could lose one of
// those updates -- or vice versa). Cross-report access is prevented by the
// `getReportAccess` check (owner OR a Phase 19 grantee -- the route above
// already verified the grantee's permission tier is 'review', this is
// defense-in-depth against a zero-access caller only, not a re-check of
// tier adequacy); a stale/unknown photoId is rejected (404-shaped code)
// rather than silently creating or misapplying an update.
const updatePhotoReview = async (reportId, uid, photoId, action, payload = {}) => {
  if (typeof photoId !== 'string' || photoId.startsWith('legacy-')) {
    return { success: false, code: 'NOT_REVIEWABLE', error: 'Review is not available for photos uploaded before this feature — re-upload the photo to enable review.' };
  }

  const db = getFirestore();
  const ref = db.collection('reports').doc(reportId);

  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists || !getReportAccess(doc.data(), { uid })) return { success: false, code: 'NOT_FOUND' };
    const photos = doc.data().photos || [];
    const idx = photos.findIndex((p) => p.id === photoId);
    if (idx === -1) return { success: false, code: 'PHOTO_NOT_FOUND', error: 'Photo not found on this report.' };
    const photo = photos[idx];

    // Phase 24: the room/area tag is a plain field on the photo itself, not
    // part of the accept/reject-observation `review` sub-object above -- it
    // doesn't require analysis to exist and works even on a photo whose AI
    // analysis is still queued or unavailable.
    if (action === 'set_area') {
      const raw = stripControlChars(String(payload.roomOrArea ?? '')).trim();
      if (raw.length > MAX_ROOM_OR_AREA_LENGTH) {
        return { success: false, code: 'VALIDATION_ERROR', error: `Area exceeds the ${MAX_ROOM_OR_AREA_LENGTH}-character limit.` };
      }
      const now = nowIso();
      const updatedPhoto = { ...photo, roomOrArea: raw || null };
      const updatedPhotos = [...photos];
      updatedPhotos[idx] = updatedPhoto;
      tx.update(ref, { photos: updatedPhotos, updatedAt: now });
      return { success: true, photo: updatedPhoto };
    }

    if (['approve', 'edit'].includes(action)) {
      if (['queued', 'analyzing'].includes(photo.analysisStatus)) {
        return { success: false, code: 'ANALYSIS_PENDING', error: 'This photo is still being analyzed — try again shortly.' };
      }
      if (!photo.analysis) {
        return { success: false, code: 'ANALYSIS_NOT_AVAILABLE', error: 'No analysis is available for this photo yet.' };
      }
    }

    const prevReview = photo.review || DEFAULT_REVIEW();
    let review = { ...prevReview };
    const now = nowIso();

    switch (action) {
      case 'approve':
        // Accepting the AI's own text as-is -- clears any prior edit so the
        // effective observation reverts to analysis.observation, not a stale edit.
        review = { ...review, status: 'approved', observation: null, reviewedBy: uid, reviewedAt: now };
        break;
      case 'edit': {
        const text = String(payload.observation || '').trim();
        if (!text) return { success: false, code: 'VALIDATION_ERROR', error: 'An observation is required.' };
        if (text.length > MAX_OBSERVATION_LENGTH) {
          return { success: false, code: 'VALIDATION_ERROR', error: `Observation exceeds the ${MAX_OBSERVATION_LENGTH}-character limit.` };
        }
        review = { ...review, status: 'edited', observation: text, reviewedBy: uid, reviewedAt: now };
        break;
      }
      case 'exclude':
        review = { ...review, status: 'excluded', reviewedBy: uid, reviewedAt: now };
        break;
      case 'include':
        if (review.status !== 'excluded') {
          return { success: false, code: 'NOT_EXCLUDED', error: 'This photo is not currently excluded.' };
        }
        // Restore to 'edited' if there's a preserved edit to go back to, else 'pending'.
        review = { ...review, status: review.observation ? 'edited' : 'pending', reviewedBy: uid, reviewedAt: now };
        break;
      case 'note': {
        const note = String(payload.note ?? '').trim();
        if (note.length > MAX_NOTE_LENGTH) {
          return { success: false, code: 'VALIDATION_ERROR', error: `Note exceeds the ${MAX_NOTE_LENGTH}-character limit.` };
        }
        review = { ...review, note, reviewedBy: uid, reviewedAt: now };
        break;
      }
      default:
        return { success: false, code: 'INVALID_ACTION', error: 'Unknown review action.' };
    }

    const updatedPhoto = { ...photo, review };
    const updatedPhotos = [...photos];
    updatedPhotos[idx] = updatedPhoto;
    tx.update(ref, { photos: updatedPhotos, updatedAt: now });
    return { success: true, photo: updatedPhoto };
  });
};

// Phase 24 (Ordering): persists a caller-supplied display order for a
// report's photos as an integer `position` on each record. `order` must be
// an exact permutation of the report's current photo ids -- not a superset,
// subset, or an id from a different report -- rejected otherwise so a
// malformed/stale client payload can never silently drop or duplicate a
// photo's position. No stale-update check here: unlike annotations (a full
// shape-list replace, where losing a concurrent edit is real data loss),
// two people reordering the same report's photos at once is a rare,
// low-stakes "last drag wins" case -- Firestore's transaction still prevents
// any corruption, matching how the review actions above have always worked.
const reorderPhotos = async (reportId, uid, order) => {
  if (!Array.isArray(order) || order.length === 0 || order.length > MAX_REORDER_PHOTOS) {
    return { success: false, code: 'VALIDATION_ERROR', error: 'A non-empty array of photo ids is required.' };
  }
  if (!order.every((id) => typeof id === 'string' && id.length > 0)) {
    return { success: false, code: 'VALIDATION_ERROR', error: 'Every photo id must be a non-empty string.' };
  }

  const db = getFirestore();
  const ref = db.collection('reports').doc(reportId);

  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists || !getReportAccess(doc.data(), { uid })) return { success: false, code: 'NOT_FOUND' };
    const photos = doc.data().photos || [];
    const currentIds = photos.map((p) => p.id);
    const isExactPermutation =
      order.length === currentIds.length &&
      new Set(order).size === order.length &&
      order.every((id) => currentIds.includes(id));
    if (!isExactPermutation) {
      return {
        success: false,
        code: 'VALIDATION_ERROR',
        error: 'The provided order must include exactly the photos currently on this report, each exactly once.',
      };
    }
    const positionById = new Map(order.map((id, i) => [id, i]));
    const now = nowIso();
    const updatedPhotos = photos.map((p) => ({ ...p, position: positionById.get(p.id) }));
    tx.update(ref, { photos: updatedPhotos, updatedAt: now });
    return { success: true, photos: updatedPhotos };
  });
};

// Phase 24 (Annotations): validates a client-supplied shape list before it
// ever reaches Firestore -- bounded count/point/string sizes, an allowlist
// of shape types, and numeric-only coordinates. Returns `{ shapes }` on
// success or `{ error }` on the first problem found (fail-fast, not a
// full error list -- consistent with this file's other validation blocks).
const validateAnnotationShapes = (shapes) => {
  if (!Array.isArray(shapes)) return { error: 'Annotations must be an array.' };
  if (shapes.length > MAX_ANNOTATION_SHAPES) {
    return { error: `A photo can have at most ${MAX_ANNOTATION_SHAPES} annotations.` };
  }
  const sanitized = [];
  for (let i = 0; i < shapes.length; i++) {
    const s = shapes[i];
    if (!s || typeof s !== 'object') return { error: `Annotation ${i + 1} is invalid.` };
    const type = String(s.type || '');
    if (!ANNOTATION_SHAPE_TYPES.has(type)) return { error: `Annotation ${i + 1} has an unsupported type.` };
    if (!Array.isArray(s.points) || s.points.length === 0) {
      return { error: `Annotation ${i + 1} is missing points.` };
    }
    if (s.points.length > MAX_ANNOTATION_POINTS) {
      return { error: `Annotation ${i + 1} has too many points (max ${MAX_ANNOTATION_POINTS}).` };
    }
    const points = [];
    for (const p of s.points) {
      // Coordinates are normalized (0..1) fractions of the photo's displayed
      // width/height, not raw pixels -- resolution-independent, and a
      // generous but bounded range guards against wildly out-of-range or
      // non-finite values (NaN/Infinity from a malformed client payload).
      const x = Number(p?.x);
      const y = Number(p?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < -1 || x > 2 || y < -1 || y > 2) {
        return { error: `Annotation ${i + 1} has an invalid coordinate.` };
      }
      points.push({ x, y });
    }
    const color = typeof s.color === 'string' && HEX_COLOR_RE.test(s.color) ? s.color : '#FD4403';
    const strokeWidthNum = Number(s.strokeWidth);
    const strokeWidth = Number.isFinite(strokeWidthNum) ? Math.min(Math.max(strokeWidthNum, 1), 20) : 3;
    const id = typeof s.id === 'string' && s.id.length > 0 && s.id.length <= 64 ? s.id : uuidv4();
    const label = typeof s.label === 'string' ? stripControlChars(s.label).trim().slice(0, 120) : '';
    sanitized.push({ id, type, points, color, strokeWidth, label });
  }
  return { shapes: sanitized };
};

// Phase 24 (Annotations): replaces the FULL shape list for one photo in a
// single save (the editor UI sends the complete, current list after every
// edit -- there's no partial/incremental shape-patch operation). Guards
// against clobbering a concurrent editor's work with `expectedUpdatedAt`:
// the caller must pass back whatever `photo.annotations?.updatedAt ?? null`
// it last loaded; a mismatch means someone else saved in the meantime, and
// this returns STALE_UPDATE instead of silently overwriting their shapes.
// This is deliberately scoped to annotations only (not reorder/set_area
// above) -- a lost shape-list edit is real, invisible data loss, whereas a
// lost reorder or area-tag edit is a cheap, visible "type it again."
const updatePhotoAnnotations = async (reportId, uid, photoId, shapes, expectedUpdatedAt) => {
  if (typeof photoId !== 'string' || photoId.startsWith('legacy-')) {
    return {
      success: false,
      code: 'NOT_REVIEWABLE',
      error: 'Annotations are not available for photos uploaded before this feature — re-upload the photo to enable it.',
    };
  }
  const validated = validateAnnotationShapes(shapes);
  if (validated.error) return { success: false, code: 'VALIDATION_ERROR', error: validated.error };

  const db = getFirestore();
  const ref = db.collection('reports').doc(reportId);

  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists || !getReportAccess(doc.data(), { uid })) return { success: false, code: 'NOT_FOUND' };
    const photos = doc.data().photos || [];
    const idx = photos.findIndex((p) => p.id === photoId);
    if (idx === -1) return { success: false, code: 'PHOTO_NOT_FOUND', error: 'Photo not found on this report.' };

    const currentUpdatedAt = photos[idx].annotations?.updatedAt ?? null;
    if (expectedUpdatedAt !== currentUpdatedAt) {
      return {
        success: false,
        code: 'STALE_UPDATE',
        error: 'These annotations changed since you loaded them. Reload the photo and try again.',
      };
    }

    const now = nowIso();
    const annotations = { shapes: validated.shapes, updatedAt: now, updatedBy: uid };
    const updatedPhoto = { ...photos[idx], annotations };
    const updatedPhotos = [...photos];
    updatedPhotos[idx] = updatedPhoto;
    tx.update(ref, { photos: updatedPhotos, updatedAt: now });
    return { success: true, photo: updatedPhoto };
  });
};

// Rebuilds report content from the CURRENT per-photo review state (task 4).
// A lightweight in-process mutex (`regenerating: true`, cleared in a
// finally-equivalent try/catch below) prevents two rapid duplicate clicks
// from both regenerating concurrently and racing on the final write --
// consistent with this project's existing in-process-only concurrency model
// (Phase 7's architecture decision; no external lock/queue infra).
const regenerateFromPhotoReview = async (reportId, uid, userEmail) => {
  const db = getFirestore();
  const ref = db.collection('reports').doc(reportId);

  const claim = await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists || doc.data().userId !== uid) return { ok: false, code: 'NOT_FOUND' };
    const data = doc.data();
    if (data.status === 'processing') {
      return { ok: false, code: 'REPORT_PROCESSING', error: 'This report is still being analyzed.' };
    }
    if (!REGENERATABLE_STATUSES.has(data.status)) {
      return { ok: false, code: 'INVALID_STATE', error: 'This report cannot be regenerated in its current state.' };
    }
    if (data.regenerating) {
      return { ok: false, code: 'ALREADY_REGENERATING', error: 'This report is already being regenerated.' };
    }
    if (!Array.isArray(data.photos) || data.photos.length === 0) {
      return { ok: false, code: 'NO_PHOTOS', error: 'This report has no photos to regenerate observations from.' };
    }
    tx.update(ref, { regenerating: true });
    return { ok: true, data };
  });
  if (!claim.ok) return { success: false, code: claim.code, error: claim.error };

  const { data } = claim;
  try {
    const imageAnalysis = buildEffectiveImageAnalysis(data.imageAnalysis, data.photos);
    const reportData = {
      claimNumber: data.claimNumber, insuredName: data.insuredName, insuredEmail: data.insuredEmail || '',
      propertyAddress: data.propertyAddress,
      lossDate: data.lossDate, lossType: data.lossType, reportType: data.reportType,
      additionalNotes: data.additionalNotes, propertyDetails: data.propertyDetails,
      lossDescription: data.lossDescription, damagesObserved: data.damagesObserved, recommendations: data.recommendations,
      // Phase 13: preserved so a manual regenerate-from-photo-review re-applies
      // the same template guidance/sections as the original generation.
      templateGuidance: data.templateGuidance || null,
      templateSections: data.templateSections || null,
      // Phase 31 (Liability Investigation Report): preserved so a regenerate
      // stays on the same document architecture as the original generation.
      claimType: data.claimType || '',
      claimantName: data.claimantName || '',
      claimantContact: data.claimantContact || '',
      // Phase 32 (Commercial Property Inspection Report): same reasoning.
      propertyManagerName: data.propertyManagerName || '',
      propertyManagerContact: data.propertyManagerContact || '',
      roofType: data.roofType || '',
      roofAge: data.roofAge || '',
      tenantSuiteCount: data.tenantSuiteCount || '',
      // Phase 33 (Flood (NFIP) Inspection Report): same reasoning -- a
      // regenerate stays on the Flood architecture when lossType === 'Flood'.
      policyNumber: data.policyNumber || '',
      floodZone: data.floodZone || '',
      lowestFloorElevation: data.lowestFloorElevation || '',
      baseFloodElevation: data.baseFloodElevation || '',
      floodEventSource: data.floodEventSource || '',
      reportedCrest: data.reportedCrest || '',
      // Phase 34 (Theft/Burglary Inspection Report): same reasoning -- a
      // regenerate stays on the Theft architecture when lossType === 'Theft'.
      policeIncidentNumber: data.policeIncidentNumber || '',
      pointsOfEntry: data.pointsOfEntry || '',
      // Phase 35 (Vehicle/Auto Inspection Report): same reasoning -- a
      // regenerate stays on the Vehicle architecture when claimType === 'Auto'.
      vin: data.vin || '',
      vehicleMakeModelYear: data.vehicleMakeModelYear || '',
      odometer: data.odometer || '',
      licensePlate: data.licensePlate || '',
      vehicleColor: data.vehicleColor || '',
      // Phase 36 (Mold Assessment Supplemental Report): same reasoning -- a
      // regenerate stays on the Mold architecture when documentType ===
      // 'MoldSupplement', reusing this same generic regenerate-from-photo-
      // review endpoint rather than needing a dedicated one.
      documentType: data.documentType || '',
      relatedClaimId: data.relatedClaimId || '',
      dateOfDiscovery: data.dateOfDiscovery || '',
    };
    const gen = await generateReport(reportData, imageAnalysis, imageAnalysis.totalImagesAnalyzed);
    const content = appendTemplateSections(gen.content, reportData.templateSections);
    const modelUsed = gen.modelUsed;
    const qualityCheck = await checkQuality(content);

    const updates = {
      content, modelUsed, imageAnalysis, qualityScore: qualityCheck.score,
      regenerating: false, updatedAt: nowIso(),
    };
    // Regenerating content is an edit -- an already-finalized report's
    // approval no longer reflects what's actually in it, so it must be
    // reopened as a draft and re-approved (Golden Rule #3), mirroring
    // PUT /:id's own content-changed-after-review handling in reports.js.
    if (isReviewedStatus(data.status)) {
      updates.status = 'draft';
      updates.reviewedBy = null;
      updates.reviewedByUid = null;
      updates.reviewedAt = null;
      updates.reviewedFromIp = null;
      updates.versionApproved = null;
      updates.signature = null;
    }
    await ref.update(updates);
    await recordVersion(reportId, {
      action: 'regenerated_from_photo_review',
      by: userEmail || uid,
      content,
      note: 'Regenerated using updated photo review (edits/exclusions applied).',
    });
    return { success: true, report: { ...data, ...updates } };
  } catch (err) {
    await ref.update({ regenerating: false }).catch(() => {});
    return { success: false, code: 'REGENERATE_FAILED', error: err.message || 'Regeneration failed.' };
  }
};

module.exports = {
  createAnalysisJobs,
  createGenerationJob,
  runReportPipeline,
  runPhotoAnalysisOnly,
  getAnalysisStatus,
  retryFailedAnalysis,
  // Phase 8 (Per-Photo Analysis Review UI)
  updatePhotoReview,
  regenerateFromPhotoReview,
  // Phase 24 (Photo Quality Warnings, Ordering, Grouping & Annotations)
  reorderPhotos,
  updatePhotoAnnotations,
  validateAnnotationShapes,
  // Exported for direct unit testing of the merge logic (Phase 7, PHASES.md)
  // without needing a real Firestore connection.
  mergeImageAnalysis,
};
