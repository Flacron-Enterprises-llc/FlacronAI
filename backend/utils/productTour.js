// Interactive product tour: the state the dashboard needs to decide whether to
// start the walkthrough by itself. It lives on the user's own doc as
// `productTour`; a missing field means "never seen", so the tour starts once on
// the next dashboard visit. Finishing or skipping both mean "seen" -- it never
// starts by itself again, and Help -> "Replay app tour" is always available.
//
// Duplicated enum values (not labels) live in frontend/src/tour/tourSteps.js,
// the same small-duplication precedent as utils/onboarding.js.

const TOUR_STATUSES = ['completed', 'skipped'];
const TOUR_SOURCES = ['auto', 'replay'];
const STEP_ID = /^[a-z0-9-]{1,40}$/;

// Validates a client report and returns the Firestore fields to merge, or an
// `{ error, code }` for a 400. `existing` is the stored productTour (or undefined).
const buildTourUpdate = (body, existing, now = new Date()) => {
  const { status, source = 'auto', version, lastStepId, stepsViewed, totalSteps } = body || {};
  if (!TOUR_STATUSES.includes(status)) return { error: 'status must be completed or skipped', code: 'INVALID_TOUR_STATUS' };
  if (!TOUR_SOURCES.includes(source)) return { error: 'source must be auto or replay', code: 'INVALID_TOUR_SOURCE' };
  if (!Number.isInteger(version) || version < 1 || version > 1000) return { error: 'version must be a positive integer', code: 'INVALID_TOUR_VERSION' };
  if (lastStepId !== undefined && lastStepId !== null && (typeof lastStepId !== 'string' || !STEP_ID.test(lastStepId))) {
    return { error: 'Invalid step id', code: 'INVALID_TOUR_STEP' };
  }
  const count = (v) => (Number.isInteger(v) && v >= 0 && v <= 100 ? v : null);

  const at = now.toISOString();
  const previous = existing && typeof existing === 'object' ? existing : {};
  const productTour = {
    status,
    version,
    lastStepId: lastStepId || null,
    stepsViewed: count(stepsViewed),
    totalSteps: count(totalSteps),
    firstSeenAt: previous.firstSeenAt || at,
    updatedAt: at,
    replayCount: (Number.isInteger(previous.replayCount) ? previous.replayCount : 0) + (source === 'replay' ? 1 : 0),
    // Once completed it stays completed: skipping a later replay doesn't undo that.
    completedAt: status === 'completed' ? at : previous.completedAt || null,
  };
  return { productTour };
};

module.exports = { TOUR_STATUSES, TOUR_SOURCES, buildTourUpdate };
