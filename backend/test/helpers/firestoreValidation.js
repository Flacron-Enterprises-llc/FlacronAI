// Test-only: runs data through the REAL Firestore client's document
// validation (the same check that rejects e.g. `undefined` values in
// production) without any network, credentials, or emulator. A write batch
// validates synchronously inside `batch.set()`; the batch is never
// committed, so nothing is ever sent anywhere.
//
// Why this exists: FakeFirestore stores whatever it is given, so a payload
// real Firestore would reject (`Cannot use "undefined" as a Firestore
// value`) passed every test while failing every sparse production lookup --
// see property-intelligence-store.test.js / property-intelligence-realtyapi
// -e2e.test.js's regression tests.
const { Firestore } = require('firebase-admin/firestore');
const { FakeFirestore } = require('./fakeFirestore');

let validator = null;
const getValidator = () => {
  if (!validator) validator = new Firestore({ projectId: 'offline-validation-only' });
  return validator;
};

// Throws the real SDK's validation error if `data` is not a valid Firestore
// document; returns silently otherwise.
const assertValidFirestoreDocument = (data, { merge = false } = {}) => {
  const db = getValidator();
  const ref = db.collection('validation').doc('doc');
  db.batch().set(ref, data, merge ? { merge: true } : undefined);
};

// FakeFirestore whose doc().set()/update() first apply real Firestore
// document validation -- opt-in by construction, so every existing
// `new FakeFirestore()` across the suite is unaffected.
class ValidatingFakeFirestore extends FakeFirestore {
  _doc(path) {
    const ref = super._doc(path);
    const { set, update } = ref;
    ref.set = async (data) => {
      assertValidFirestoreDocument(data);
      return set(data);
    };
    ref.update = async (patch) => {
      assertValidFirestoreDocument(patch, { merge: true });
      return update(patch);
    };
    return ref;
  }
}

module.exports = { assertValidFirestoreDocument, ValidatingFakeFirestore };
