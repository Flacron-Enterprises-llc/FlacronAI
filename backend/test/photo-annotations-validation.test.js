const test = require('node:test');
const assert = require('node:assert/strict');
const { validateAnnotationShapes } = require('../services/photoJobService');

// Phase 24 (Annotations): validateAnnotationShapes is pure logic (no
// Firestore) -- the actual persistence (updatePhotoAnnotations, a Firestore
// transaction) is covered by this phase's live-API verification pass,
// matching this codebase's existing convention (see photo-job-service.test.js's
// header: Firestore-dependent functions are verified live, pure logic here).

const point = (x, y) => ({ x, y });

test('a well-formed shape list of every allowed type passes through with defaults filled in', () => {
  const shapes = [
    { type: 'arrow', points: [point(0.1, 0.1), point(0.5, 0.5)] },
    { type: 'circle', points: [point(0.2, 0.2), point(0.4, 0.4)] },
    { type: 'rect', points: [point(0.1, 0.1), point(0.9, 0.9)] },
    { type: 'freehand', points: [point(0, 0), point(0.1, 0.1), point(0.2, 0.05)] },
    { type: 'measurement', points: [point(0.3, 0.3), point(0.7, 0.7)] },
  ];
  const result = validateAnnotationShapes(shapes);
  assert.equal(result.error, undefined);
  assert.equal(result.shapes.length, 5);
  result.shapes.forEach((s) => {
    assert.equal(typeof s.id, 'string');
    assert.ok(s.id.length > 0);
    assert.equal(s.color, '#FD4403');
    assert.equal(s.strokeWidth, 3);
    assert.equal(s.label, '');
  });
});

test('rejects a non-array payload', () => {
  assert.ok(validateAnnotationShapes(null).error);
  assert.ok(validateAnnotationShapes('nope').error);
  assert.ok(validateAnnotationShapes({}).error);
});

test('rejects more than the maximum number of shapes', () => {
  const shapes = Array.from({ length: 61 }, () => ({ type: 'arrow', points: [point(0, 0), point(1, 1)] }));
  const result = validateAnnotationShapes(shapes);
  assert.match(result.error, /at most 60/);
});

test('rejects an unsupported shape type', () => {
  const result = validateAnnotationShapes([{ type: 'triangle', points: [point(0, 0), point(1, 1)] }]);
  assert.match(result.error, /unsupported type/);
});

test('rejects a shape with no points', () => {
  const result = validateAnnotationShapes([{ type: 'arrow', points: [] }]);
  assert.match(result.error, /missing points/);
});

test('rejects a shape with too many points (a runaway freehand path)', () => {
  const points = Array.from({ length: 201 }, (_, i) => point(i / 201, i / 201));
  const result = validateAnnotationShapes([{ type: 'freehand', points }]);
  assert.match(result.error, /too many points/);
});

test('rejects non-finite or out-of-range coordinates', () => {
  assert.ok(validateAnnotationShapes([{ type: 'arrow', points: [point(NaN, 0), point(1, 1)] }]).error);
  assert.ok(validateAnnotationShapes([{ type: 'arrow', points: [point(Infinity, 0), point(1, 1)] }]).error);
  assert.ok(validateAnnotationShapes([{ type: 'arrow', points: [point(5, 0), point(1, 1)] }]).error, 'x=5 is far outside the -1..2 tolerance band');
});

test('coerces an invalid color to the brand default rather than rejecting the whole shape', () => {
  const result = validateAnnotationShapes([{ type: 'arrow', points: [point(0, 0), point(1, 1)], color: 'javascript:alert(1)' }]);
  assert.equal(result.error, undefined);
  assert.equal(result.shapes[0].color, '#FD4403');
});

test('accepts a valid hex color as-is', () => {
  const result = validateAnnotationShapes([{ type: 'arrow', points: [point(0, 0), point(1, 1)], color: '#00FF00' }]);
  assert.equal(result.shapes[0].color, '#00FF00');
});

test('clamps strokeWidth into the 1-20 range rather than accepting an extreme value', () => {
  const result = validateAnnotationShapes([
    { type: 'arrow', points: [point(0, 0), point(1, 1)], strokeWidth: 999 },
    { type: 'arrow', points: [point(0, 0), point(1, 1)], strokeWidth: -5 },
  ]);
  assert.equal(result.shapes[0].strokeWidth, 20);
  assert.equal(result.shapes[1].strokeWidth, 1);
});

test('strips control characters and caps the length of a shape label', () => {
  const longLabel = 'x'.repeat(200);
  const result = validateAnnotationShapes([{ type: 'measurement', points: [point(0, 0), point(1, 1)], label: `badlabel${longLabel}` }]);
  assert.equal(result.shapes[0].label.length, 120);
  const hasControlChar = [...result.shapes[0].label].some((ch) => {
    const code = ch.charCodeAt(0);
    return code < 32 || code === 127;
  });
  assert.equal(hasControlChar, false);
});

test('preserves a caller-supplied id when valid, generates one otherwise', () => {
  const result = validateAnnotationShapes([
    { type: 'arrow', points: [point(0, 0), point(1, 1)], id: 'my-stable-id' },
    { type: 'arrow', points: [point(0, 0), point(1, 1)], id: 12345 },
  ]);
  assert.equal(result.shapes[0].id, 'my-stable-id');
  assert.notEqual(result.shapes[1].id, 12345);
  assert.equal(typeof result.shapes[1].id, 'string');
});

test('an empty array is valid (all annotations cleared)', () => {
  const result = validateAnnotationShapes([]);
  assert.equal(result.error, undefined);
  assert.deepEqual(result.shapes, []);
});
