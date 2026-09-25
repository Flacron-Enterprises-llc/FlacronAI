const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeFirestore } = require('./helpers/fakeFirestore');
const { assertValidFirestoreDocument, ValidatingFakeFirestore } = require('./helpers/firestoreValidation');
const {
  createPropertyLookup,
  resolvePropertyLookup,
  getCachedPropertyValues,
  setCachedPropertyValues,
  removeUndefinedDeep,
} = require('../utils/propertyIntelligenceStore');

test('createPropertyLookup + resolvePropertyLookup: the same requesting uid can read back its own lookup', async () => {
  const db = new FakeFirestore();
  const { lookupId } = await createPropertyLookup(db, {
    reportId: 'report-1',
    requestedByUid: 'uid-1',
    status: 'full',
    fields: { parcelNumber: { value: 'PARC-1' } },
  });
  const record = await resolvePropertyLookup(db, { reportId: 'report-1', lookupId, requestedByUid: 'uid-1' });
  assert.equal(record.fields.parcelNumber.value, 'PARC-1');
});

test('resolvePropertyLookup: a different report id for the same lookupId is rejected (cross-report use)', async () => {
  const db = new FakeFirestore();
  const { lookupId } = await createPropertyLookup(db, { reportId: 'report-1', requestedByUid: 'uid-1', status: 'full', fields: {} });
  await assert.rejects(
    () => resolvePropertyLookup(db, { reportId: 'report-2', lookupId, requestedByUid: 'uid-1' }),
    (err) => err.code === 'PROPERTY_LOOKUP_NOT_FOUND'
  );
});

test('resolvePropertyLookup: a different uid than the one who requested it is rejected (cross-user use)', async () => {
  const db = new FakeFirestore();
  const { lookupId } = await createPropertyLookup(db, { reportId: 'report-1', requestedByUid: 'uid-1', status: 'full', fields: {} });
  await assert.rejects(
    () => resolvePropertyLookup(db, { reportId: 'report-1', lookupId, requestedByUid: 'uid-attacker' }),
    (err) => err.code === 'PROPERTY_LOOKUP_FORBIDDEN'
  );
});

test('resolvePropertyLookup: an unknown lookupId is rejected', async () => {
  const db = new FakeFirestore();
  await assert.rejects(
    () => resolvePropertyLookup(db, { reportId: 'report-1', lookupId: 'pl_forged', requestedByUid: 'uid-1' }),
    (err) => err.code === 'PROPERTY_LOOKUP_NOT_FOUND'
  );
});

test('resolvePropertyLookup: an expired lookup is rejected', async () => {
  const db = new FakeFirestore();
  const originalNow = Date.now;
  Date.now = () => new Date('2020-01-01T00:00:00Z').getTime();
  const { lookupId } = await createPropertyLookup(db, { reportId: 'report-1', requestedByUid: 'uid-1', status: 'full', fields: {} });
  Date.now = () => new Date('2030-01-01T00:00:00Z').getTime();
  try {
    await assert.rejects(
      () => resolvePropertyLookup(db, { reportId: 'report-1', lookupId, requestedByUid: 'uid-1' }),
      (err) => err.code === 'PROPERTY_LOOKUP_EXPIRED'
    );
  } finally {
    Date.now = originalNow;
  }
});

test('resolvePropertyLookup: is reusable (not single-consume) -- reading it twice both succeed', async () => {
  const db = new FakeFirestore();
  const { lookupId } = await createPropertyLookup(db, { reportId: 'report-1', requestedByUid: 'uid-1', status: 'full', fields: { yearBuilt: { value: 1998 } } });
  const first = await resolvePropertyLookup(db, { reportId: 'report-1', lookupId, requestedByUid: 'uid-1' });
  const second = await resolvePropertyLookup(db, { reportId: 'report-1', lookupId, requestedByUid: 'uid-1' });
  assert.deepEqual(first.fields, second.fields);
});

test('the shared cache never stores the ownership field, even if the caller passes it', async () => {
  const db = new FakeFirestore();
  await setCachedPropertyValues(db, 'fp-1', { yearBuilt: 1998, ownerOnRecord: 'Jane Doe' }, {});
  const cached = await getCachedPropertyValues(db, 'fp-1');
  assert.equal(cached.yearBuilt, 1998);
  assert.ok(!('ownerOnRecord' in cached), 'ownership must never land in the shared cross-report/user cache');
});

test('cache: a miss (no entry) returns null', async () => {
  const db = new FakeFirestore();
  assert.equal(await getCachedPropertyValues(db, 'fp-missing'), null);
});

test('cache: an expired entry is treated as a miss', async () => {
  const db = new FakeFirestore();
  await setCachedPropertyValues(db, 'fp-1', { yearBuilt: 1998 });
  const doc = db.store.get('propertyIntelligenceCache/fp-1');
  doc.data.expiresAt = new Date(Date.now() - 1000).toISOString();
  assert.equal(await getCachedPropertyValues(db, 'fp-1'), null);
});

// --- regression: sparse provider values vs. real Firestore validation -----
// A real, sparse RealtyAPI response normalizes to many `undefined` values;
// real Firestore rejects `undefined`, which made every such lookup a generic
// 500 in production while FakeFirestore (which validates nothing) passed.

test('removeUndefinedDeep: removes only undefined (keys + array elements, nested), keeps null/false/0/empty string/Date', () => {
  const when = new Date('2026-01-01T00:00:00Z');
  const cleaned = removeUndefinedDeep({
    a: undefined,
    n: null,
    f: false,
    z: 0,
    s: '',
    d: when,
    nested: { x: undefined, y: 1, deeper: { q: undefined, r: null } },
    list: [1, undefined, null, { k: undefined, v: 0 }],
  });
  assert.deepEqual(cleaned, {
    n: null,
    f: false,
    z: 0,
    s: '',
    d: when,
    nested: { y: 1, deeper: { r: null } },
    list: [1, null, { v: 0 }],
  });
  assert.ok(cleaned.d instanceof Date, 'non-plain objects are passed through untouched');
});

test('real Firestore validation rejects an undefined value (proves the validator used below is meaningful)', () => {
  assert.throws(
    () => assertValidFirestoreDocument({ values: { parcelNumber: undefined, yearBuilt: 1998 } }),
    /Cannot use "undefined" as a Firestore value/
  );
});

test('setCachedPropertyValues: a sparse values map (undefined fields) produces a document real Firestore accepts', async () => {
  const db = new ValidatingFakeFirestore();
  const sparse = {
    parcelNumber: undefined,
    propertyType: 'single_family',
    yearBuilt: 1998,
    roofType: undefined,
    garageSpaces: 0,
    lastSalePrice: undefined,
    lastSalePriceCurrency: undefined,
    hazardSummary: null,
  };
  await setCachedPropertyValues(db, 'fp-sparse', sparse, { providerRecordId: 'p-1' });

  const stored = db.store.get('propertyIntelligenceCache/fp-sparse').data;
  assert.doesNotThrow(() => assertValidFirestoreDocument(stored));
  assert.deepEqual(stored.values, { propertyType: 'single_family', yearBuilt: 1998, garageSpaces: 0, hazardSummary: null });

  const cached = await getCachedPropertyValues(db, 'fp-sparse');
  assert.equal(cached.garageSpaces, 0, 'a real 0 is preserved, never dropped');
  assert.equal(cached.hazardSummary, null, 'an explicit null is preserved');
  assert.ok(!('roofType' in cached));
});
