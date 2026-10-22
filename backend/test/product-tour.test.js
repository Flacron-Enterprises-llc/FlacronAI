const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTourUpdate } = require('../utils/productTour');

const NOW = new Date('2026-10-22T12:00:00.000Z');
const LATER = new Date('2026-11-01T09:30:00.000Z');

test('first completion records when the tour was seen and completed', () => {
  const { productTour, error } = buildTourUpdate({ status: 'completed', version: 1, lastStepId: 'finish', stepsViewed: 9, totalSteps: 9 }, undefined, NOW);
  assert.equal(error, undefined);
  assert.deepEqual(productTour, {
    status: 'completed',
    version: 1,
    lastStepId: 'finish',
    stepsViewed: 9,
    totalSteps: 9,
    firstSeenAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    replayCount: 0,
    completedAt: NOW.toISOString(),
  });
});

test('skipping counts as seen but not completed', () => {
  const { productTour } = buildTourUpdate({ status: 'skipped', version: 1, lastStepId: 'nav-generate' }, undefined, NOW);
  assert.equal(productTour.status, 'skipped');
  assert.equal(productTour.completedAt, null);
  assert.equal(productTour.firstSeenAt, NOW.toISOString());
});

test('a replay keeps the first-seen date, counts the replay and never un-completes', () => {
  const { productTour: first } = buildTourUpdate({ status: 'completed', version: 1 }, undefined, NOW);
  const { productTour: replay } = buildTourUpdate({ status: 'skipped', version: 1, source: 'replay' }, first, LATER);
  assert.equal(replay.firstSeenAt, NOW.toISOString());
  assert.equal(replay.updatedAt, LATER.toISOString());
  assert.equal(replay.replayCount, 1);
  assert.equal(replay.status, 'skipped');
  assert.equal(replay.completedAt, NOW.toISOString());
});

test('rejects bad input with a stable code', () => {
  const cases = [
    [{ status: 'started', version: 1 }, 'INVALID_TOUR_STATUS'],
    [{ status: 'completed', version: 1, source: 'email' }, 'INVALID_TOUR_SOURCE'],
    [{ status: 'completed', version: 0 }, 'INVALID_TOUR_VERSION'],
    [{ status: 'completed', version: '1' }, 'INVALID_TOUR_VERSION'],
    [{ status: 'completed', version: 1, lastStepId: 'Bad Step!' }, 'INVALID_TOUR_STEP'],
    [undefined, 'INVALID_TOUR_STATUS'],
  ];
  for (const [body, code] of cases) assert.equal(buildTourUpdate(body, undefined, NOW).code, code);
});

test('out-of-range counters are stored as null, not trusted', () => {
  const { productTour } = buildTourUpdate({ status: 'completed', version: 1, stepsViewed: -3, totalSteps: 5000 }, undefined, NOW);
  assert.equal(productTour.stepsViewed, null);
  assert.equal(productTour.totalSteps, null);
});
