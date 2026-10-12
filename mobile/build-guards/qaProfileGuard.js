// QA build guard (Phase 10 staging). The `qa` EAS profile runs in the shared `preview`
// EAS environment, whose EXPO_PUBLIC_FIREBASE_* / Google values are the PRODUCTION
// ones. eas.json `env` is expected to override them, but that precedence is enforced
// here instead of trusted: app.config.ts calls assertQaBuildEnv() whenever
// FLACRON_BUILD_PROFILE=qa, so `expo config` (and therefore the EAS build) fails
// before bundling if ANY value is not the staging one, the E2E hooks are enabled, or
// a production Firebase identifier is present. Plain CommonJS so both app.config.ts
// and Jest load it directly.
const crypto = require('crypto');
const fs = require('fs');

const STAGING = Object.freeze({
  EXPO_PUBLIC_APP_ENV: 'preview',
  EXPO_PUBLIC_API_BASE_URL: 'https://flacronai-staging-api-93799061110.us-central1.run.app/api/v1',
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'flacronai-staging-qa',
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'flacronai-staging-qa.firebaseapp.com',
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: 'flacronai-staging-qa.firebasestorage.app',
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '93799061110',
  EXPO_PUBLIC_FIREBASE_APP_ID: '1:93799061110:web:0a1717afd30aaa5268b157',
});
// sha256 of the staging project's (public) web API key — compared, never stored here.
const STAGING_API_KEY_SHA256 = '908729e676c3118890d696fd8057d9b51f96dba80aabc1aba1230b4b9ce5a2e4';
// Must be absent/empty in the handover build.
const MUST_BE_EMPTY = [
  'EXPO_PUBLIC_E2E_RUNTIME_CONFIG',
  'EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_URL',
  'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
];
const PRODUCTION_MARKERS = ['flacronai-c8dab', '773892679617'];
const ANDROID_PACKAGE = 'com.flacronenterprises.flacronai';
// Google sign-in is optional in the QA build; when set, the web client must belong to the
// staging project (OAuth client IDs are prefixed with the project number).
const STAGING_GOOGLE_CLIENT = /^93799061110-[a-z0-9]+\.apps\.googleusercontent\.com$/;

// Optional google-services.json (FCM for push). Written by CI from an environment secret,
// never committed; it must be the staging project's file for this package.
function googleServicesProblems(file) {
  if (!file) return [];
  let json;
  try {
    json = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return ['GOOGLE_SERVICES_JSON is not a readable JSON file'];
  }
  const problems = [];
  if (json?.project_info?.project_id !== STAGING.EXPO_PUBLIC_FIREBASE_PROJECT_ID) problems.push('google-services.json is not the flacronai-staging-qa file');
  if (json?.project_info?.project_number !== STAGING.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID) problems.push('google-services.json project number is not staging');
  const pkgs = (json?.client || []).map((c) => c?.client_info?.android_client_info?.package_name);
  if (!pkgs.includes(ANDROID_PACKAGE)) problems.push(`google-services.json has no client for ${ANDROID_PACKAGE}`);
  const raw = JSON.stringify(json);
  for (const marker of PRODUCTION_MARKERS) if (raw.includes(marker)) problems.push(`google-services.json references production (${marker})`);
  return problems;
}

function qaBuildProblems(env, expectedKeySha256 = STAGING_API_KEY_SHA256) {
  const problems = [];
  for (const [name, expected] of Object.entries(STAGING)) {
    if (env[name] !== expected) problems.push(`${name} is ${JSON.stringify(env[name] ?? null)}, expected the staging value`);
  }
  const key = env.EXPO_PUBLIC_FIREBASE_API_KEY || '';
  if (crypto.createHash('sha256').update(key).digest('hex') !== expectedKeySha256) {
    problems.push('EXPO_PUBLIC_FIREBASE_API_KEY is not the flacronai-staging-qa web API key');
  }
  for (const name of MUST_BE_EMPTY) {
    if (env[name]) problems.push(`${name} must be empty in the QA handover build`);
  }
  const webClient = env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (webClient && !STAGING_GOOGLE_CLIENT.test(webClient)) {
    problems.push('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not a flacronai-staging-qa OAuth client');
  }
  problems.push(...googleServicesProblems(env.GOOGLE_SERVICES_JSON));
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith('EXPO_PUBLIC_') || typeof value !== 'string') continue;
    for (const marker of PRODUCTION_MARKERS) {
      if (value.includes(marker)) problems.push(`${name} references production (${marker})`);
    }
  }
  return problems;
}

function assertQaBuildEnv(env = process.env) {
  const problems = qaBuildProblems(env);
  if (problems.length) {
    throw new Error(`QA build guard failed — refusing to build a QA APK that is not fully staging:\n- ${problems.join('\n- ')}`);
  }
  return {
    profile: 'qa',
    apiBaseUrl: env.EXPO_PUBLIC_API_BASE_URL,
    firebaseProjectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    firebaseAppId: env.EXPO_PUBLIC_FIREBASE_APP_ID,
    e2eRuntimeConfig: false,
    googleSignIn: Boolean(env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID),
    fcmConfigured: Boolean(env.GOOGLE_SERVICES_JSON),
  };
}

module.exports = { STAGING, STAGING_API_KEY_SHA256, qaBuildProblems, assertQaBuildEnv, googleServicesProblems };
