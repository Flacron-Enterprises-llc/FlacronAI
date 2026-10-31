#!/usr/bin/env node
// Verifies a built QA APK (the final artifact, not just the config that produced it):
//   node build-guards/verifyQaApk.js <path-to.apk>
// Checks: APK signing block present; embedded app config carries extra.qaBuild with the
// staging values (stamped by app.config.ts only after qaProfileGuard passed); the
// embedded JS bundle (Hermes bytecode, no Metro needed) contains the staging Firebase
// project + staging API host, the identity-only production project (QA federation), and
// none of production's DATA identifiers (API host, storage bucket, Android/iOS app),
// tunnel hosts or test-credential names. Exits 1 on any failure.
const fs = require('fs');
const zlib = require('zlib');
const { STAGING, IDENTITY } = require('./qaProfileGuard');

const FORBIDDEN = [
  'api.flacronai.com',
  'flacronai-c8dab.firebasestorage.app',
  'flacronai-c8dab.appspot.com',
  '1:773892679617:android:',
  '1:773892679617:ios:',
  // Production OAuth client IDs: Google sign-in stays off in the federated QA build.
  '773892679617-',
  'trycloudflare',
  'E2E_PASSWORD',
  'e2e-runtime-override-enabled',
];
const REQUIRED = [
  STAGING.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  new URL(STAGING.EXPO_PUBLIC_API_BASE_URL).host,
  IDENTITY.EXPO_PUBLIC_IDENTITY_FIREBASE_PROJECT_ID,
];

// Minimal ZIP reader (central directory) — APKs are ZIP files.
function readZipEntries(buf, wanted) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 5, 6]));
  if (eocd < 0) throw new Error('not a zip/apk');
  let p = buf.readUInt32LE(eocd + 16);
  const count = buf.readUInt16LE(eocd + 10);
  const out = {};
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28);
    const elen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString();
    if (wanted.includes(name)) {
      const lnlen = buf.readUInt16LE(local + 26);
      const lelen = buf.readUInt16LE(local + 28);
      const data = buf.slice(local + 30 + lnlen + lelen, local + 30 + lnlen + lelen + csize);
      out[name] = method === 8 ? zlib.inflateRawSync(data) : data;
    }
    p += 46 + nlen + elen + clen;
  }
  return out;
}

const count = (buf, s) => {
  let n = 0;
  let i = 0;
  const needle = Buffer.from(s);
  while ((i = buf.indexOf(needle, i)) >= 0) {
    n++;
    i++;
  }
  return n;
};

function verifyArtifact({ apk, appConfig, bundle }) {
  const problems = [];
  const checks = [];
  if (apk) {
    if (apk.includes(Buffer.from('APK Sig Block 42'))) checks.push('APK v2+ signing block present');
    else problems.push('APK signing block not found (unsigned?)');
  }
  if (!appConfig) problems.push('embedded app config (assets/app.config) missing');
  else {
    const qa = JSON.parse(appConfig.toString('utf8')).extra?.qaBuild;
    if (!qa) problems.push('extra.qaBuild missing — the QA guard did not run for this build');
    else {
      if (qa.firebaseProjectId !== STAGING.EXPO_PUBLIC_FIREBASE_PROJECT_ID) problems.push(`qaBuild.firebaseProjectId=${qa.firebaseProjectId}`);
      if (qa.apiBaseUrl !== STAGING.EXPO_PUBLIC_API_BASE_URL) problems.push(`qaBuild.apiBaseUrl=${qa.apiBaseUrl}`);
      if (qa.e2eRuntimeConfig !== false) problems.push('qaBuild.e2eRuntimeConfig is not false');
      if (qa.identityProjectId !== IDENTITY.EXPO_PUBLIC_IDENTITY_FIREBASE_PROJECT_ID) problems.push(`qaBuild.identityProjectId=${qa.identityProjectId}`);
      checks.push(`embedded config: data ${qa.firebaseProjectId} / ${qa.apiBaseUrl}; identity ${qa.identityProjectId}`);
    }
  }
  if (!bundle) problems.push('embedded JS bundle (assets/index.android.bundle) missing');
  else {
    for (const s of REQUIRED) (count(bundle, s) > 0 ? checks : problems).push(`bundle ${count(bundle, s) > 0 ? 'contains' : 'is MISSING'} ${s}`);
    for (const s of FORBIDDEN) if (count(bundle, s) > 0) problems.push(`bundle contains forbidden string ${s}`);
    checks.push(`bundle free of: ${FORBIDDEN.join(', ')}`);
  }
  return { ok: problems.length === 0, problems, checks };
}

function verifyApkFile(path) {
  const apk = fs.readFileSync(path);
  const e = readZipEntries(apk, ['assets/app.config', 'assets/index.android.bundle']);
  return verifyArtifact({ apk, appConfig: e['assets/app.config'], bundle: e['assets/index.android.bundle'] });
}

if (require.main === module) {
  const r = verifyApkFile(process.argv[2]);
  r.checks.forEach((c) => console.log(`  [ok]   ${c}`));
  r.problems.forEach((p) => console.log(`  [FAIL] ${p}`));
  console.log(r.ok ? 'QA APK verified.' : 'QA APK verification FAILED.');
  process.exit(r.ok ? 0 : 1);
}

module.exports = { verifyArtifact, verifyApkFile, readZipEntries };
