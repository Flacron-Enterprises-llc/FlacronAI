#!/usr/bin/env node
// Builds the staging backend dotenv file for Cloud Run WITHOUT printing values.
// stdin  : JSON object of current values (e.g. the AWS `flacronai/staging/app` secret).
// argv   : optional path to a JSON file of overrides (delete it afterwards).
// stdout : dotenv text, piped straight into `gcloud secrets versions add --data-file=-`.
// stderr : key names + validation result only.
// Exits non-zero (writing nothing to stdout) if any required key is missing, malformed,
// belongs to another Firebase project, or is a live Stripe key.
const fs = require('fs');

const STAGING_PROJECT = 'flacronai-staging-qa';
// Format checks, not just presence: a 1-character placeholder must never count as "present".
const RULES = {
  FIREBASE_PROJECT_ID: (v) => v === STAGING_PROJECT,
  FIREBASE_STORAGE_BUCKET: (v) => v === `${STAGING_PROJECT}.firebasestorage.app`,
  FIREBASE_CLIENT_EMAIL: (v) => v.endsWith(`@${STAGING_PROJECT}.iam.gserviceaccount.com`),
  FIREBASE_PRIVATE_KEY: (v) => v.includes('BEGIN PRIVATE KEY'),
  FIREBASE_API_KEY: (v) => /^AIza[\w-]{35}$/.test(v),
  ANTHROPIC_API_KEY: (v) => /^sk-ant-[\w-]{20,}$/.test(v),
  STRIPE_SECRET_KEY: (v) => /^(sk|rk)_test_\w{20,}$/.test(v),
  STRIPE_WEBHOOK_SECRET: (v) => /^whsec_\w{20,}$/.test(v),
  JWT_SECRET: (v) => v.length >= 32,
  ADMIN_EMAIL: (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
};
// Set as plain Cloud Run env vars by deploy-cloudrun.sh; never taken from the secret.
const PLATFORM_KEYS = new Set(['PORT', 'NODE_ENV']);

const base = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
const overrides = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) : {};
const env = { ...base, ...overrides };
// ALLOW_MISSING=KEY,KEY: deploy without these (their features report "unavailable"); any
// placeholder value for them is DROPPED rather than shipped.
const allowMissing = new Set((process.env.ALLOW_MISSING || '').split(',').filter(Boolean));
for (const key of allowMissing) {
  if (env[key] && !RULES[key]?.(String(env[key]))) delete env[key];
  if (!env[key]) {
    delete RULES[key];
    console.error(`${key} omitted (ALLOW_MISSING)`);
  }
}

const problems = [];
if (/^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY || '')) problems.push('STRIPE_SECRET_KEY is a LIVE key (staging is sandbox only)');
for (const [key, ok] of Object.entries(RULES)) {
  const v = env[key] == null ? '' : String(env[key]);
  if (!v) problems.push(`${key} missing`);
  else if (!ok(v)) problems.push(`${key} malformed`);
}
for (const [key, v] of Object.entries(env)) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(key)) problems.push(`invalid key name ${key}`);
  if (String(v).includes('"')) problems.push(`${key} contains a double quote`);
}
if (problems.length) {
  console.error(`refusing to build env: ${problems.join('; ')}`);
  process.exit(1);
}

const lines = Object.entries(env)
  .filter(([k, v]) => !PLATFORM_KEYS.has(k) && v !== '' && v != null)
  .map(([k, v]) => `${k}="${String(v).replace(/\r?\n/g, '\\n')}"`);
process.stdout.write(`${lines.join('\n')}\n`);
console.error(`env ok (${lines.length} keys): ${Object.keys(env).filter((k) => !PLATFORM_KEYS.has(k)).sort().join(', ')}`);
