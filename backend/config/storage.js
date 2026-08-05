// Firebase Storage-backed file storage.
//
// Replaces the old local-disk uploads (Render has no persistent disk, so
// disk files were lost on every deploy and served world-readable). All
// artifacts now live in the Firebase Storage bucket:
//   users/{uid}/reports/{reportId}/{file}   — claim photos (private)
//   users/{uid}/exports/{file}              — generated reports (private)
//   users/{uid}/logos/{file}                — profile branding logo (token URL)
//   users/{uid}/whitelabel/{file}           — white-label logo (token URL)
//
// Private objects (photos, exports) are read server-side via downloadBuffer()
// or delivered through authenticated routes. Branding logos get a stable
// Firebase download-token URL so the frontend can display them long-term.

const { randomUUID } = require('crypto');
const { getBucket } = require('./firebase');

const BUCKET_NAME =
  process.env.FIREBASE_STORAGE_BUCKET ||
  `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`;

// ── Object-path builders ────────────────────────────────────────────────────────
const reportImageObject = (uid, reportId, filename) => `users/${uid}/reports/${reportId}/${filename}`;
const exportObject      = (uid, filename)            => `users/${uid}/exports/${filename}`;
const logoObject        = (uid, filename)            => `users/${uid}/logos/${filename}`;
const whiteLabelObject  = (uid, filename)            => `users/${uid}/whitelabel/${filename}`;

// ── Core operations ───────────────────────────────────────────────────────────
// Uploads a buffer. When `publicToken` is set, attaches a Firebase download
// token and returns a stable `url` the browser can load; otherwise the object
// stays private (read via downloadBuffer / signed URL only).
const uploadBuffer = async (objectPath, buffer, contentType, { publicToken = false } = {}) => {
  const file = getBucket().file(objectPath);
  const metadata = { contentType };
  let token;
  if (publicToken) {
    token = randomUUID();
    metadata.metadata = { firebaseStorageDownloadTokens: token };
  }
  await file.save(buffer, { metadata, resumable: false });
  return { objectPath, url: publicToken ? tokenUrl(objectPath, token) : null };
};

// Stable, non-expiring browser URL for a token-tagged (branding) object.
const tokenUrl = (objectPath, token) =>
  `https://firebasestorage.googleapis.com/v0/b/${BUCKET_NAME}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;

const downloadBuffer = async (objectPath) => {
  const [buf] = await getBucket().file(objectPath).download();
  return buf;
};

const objectExists = async (objectPath) => {
  const [ok] = await getBucket().file(objectPath).exists();
  return ok;
};

const deleteObject = async (objectPath) => {
  if (!objectPath) return;
  try {
    await getBucket().file(objectPath).delete({ ignoreNotFound: true });
  } catch (err) {
    console.warn('[Storage] delete failed for', objectPath, '-', err.message);
  }
};

const deleteObjects = async (objectPaths = []) => {
  await Promise.all(objectPaths.filter(Boolean).map(deleteObject));
};

// Wipes every object under a path prefix — used for full account deletion
// (users/{uid}/) so photos/exports/logos are removed without having to track
// every individual object path.
const deletePrefix = async (prefix) => {
  try {
    await getBucket().deleteFiles({ prefix, force: true });
  } catch (err) {
    console.warn('[Storage] deletePrefix failed for', prefix, '-', err.message);
  }
};

// Time-limited read URL (used where a direct browser link is acceptable).
const getSignedUrl = async (objectPath, expiresMs = 24 * 60 * 60 * 1000) => {
  const [url] = await getBucket()
    .file(objectPath)
    .getSignedUrl({ action: 'read', expires: Date.now() + expiresMs });
  return url;
};

module.exports = {
  BUCKET_NAME,
  reportImageObject,
  exportObject,
  logoObject,
  whiteLabelObject,
  uploadBuffer,
  tokenUrl,
  downloadBuffer,
  objectExists,
  deleteObject,
  deleteObjects,
  deletePrefix,
  getSignedUrl,
};
