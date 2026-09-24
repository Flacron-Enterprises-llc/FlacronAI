const admin = require('firebase-admin');
require('dotenv').config();

let firebaseApp;

// Local-emulator opt-in (Phase 46 live-validation support, 2026-09-22).
// Deliberately requires an EXPLICIT, unambiguous switch (`FIREBASE_EMULATOR
// === 'true'`) rather than inferring emulator use from the presence of
// *_EMULATOR_HOST alone -- a stray host var left set in a shell must never
// silently redirect traffic away from the real service-account path below.
// Refuses outright under NODE_ENV=production regardless of what's set, and
// fails closed (throws, never falls back to the cert() path or a placeholder
// credential) if the switch is on but the required host/project vars are
// missing -- an incomplete emulator config must be loud, not silently wrong.
const isEmulatorRequested = () => process.env.FIREBASE_EMULATOR === 'true';

const initFirebaseEmulator = () => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FIREBASE_EMULATOR=true is not allowed when NODE_ENV=production -- refusing to start.');
  }
  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!firestoreHost || !authHost || !projectId) {
    throw new Error(
      'FIREBASE_EMULATOR=true requires FIRESTORE_EMULATOR_HOST, FIREBASE_AUTH_EMULATOR_HOST, and FIREBASE_PROJECT_ID to all be set -- refusing to start with incomplete emulator config.'
    );
  }

  // No real credential is used or needed: with both emulator host vars set,
  // the Admin SDK routes every Firestore/Auth call to the local emulators,
  // which do not check a real service-account credential at all. This is
  // never a fallback for a missing/invalid real credential -- it is only
  // reachable via the explicit FIREBASE_EMULATOR=true switch checked above.
  firebaseApp = admin.initializeApp({
    projectId,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`,
  });
  console.log(`✅ Firebase Admin SDK initialized against LOCAL EMULATORS ONLY (Firestore ${firestoreHost}, Auth ${authHost}) -- never production`);
  return firebaseApp;
};

const initFirebase = () => {
  if (firebaseApp) return firebaseApp;

  if (isEmulatorRequested()) {
    return initFirebaseEmulator();
  }

  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : undefined;

  const serviceAccount = {
    type: 'service_account',
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: privateKey,
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
  };

  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`,
  });

  console.log('✅ Firebase Admin SDK initialized');
  return firebaseApp;
};

const getFirestore = () => {
  if (!admin.apps.length) initFirebase();
  return admin.firestore();
};

const getAuth = () => {
  if (!admin.apps.length) initFirebase();
  return admin.auth();
};

const getBucket = () => {
  if (!admin.apps.length) initFirebase();
  return admin.storage().bucket();
};

const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;

module.exports = { initFirebase, getFirestore, getAuth, getBucket, FieldValue, Timestamp, admin };
