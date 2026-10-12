#!/usr/bin/env node
// Creates/updates Secrets Manager secret `flacronai/staging/app` (JSON) WITHOUT printing values.
// Only the field names in FIELDS are accepted; anything else is refused without being echoed
// (a mistyped argument can itself be a secret). Run interactively:
//   node backend/deploy/staging/set-staging-secret.js --key STRIPE_SECRET_KEY     (hidden prompt)
//   Get-Clipboard | node backend/deploy/staging/set-staging-secret.js --stdin-key STRIPE_SECRET_KEY
//   node backend/deploy/staging/set-staging-secret.js --firebase-sa <service-account.json>
//   node backend/deploy/staging/set-staging-secret.js --set ADMIN_EMAIL=qa-admin@example.com
// --set is for NON-secret fields only. Fields not in FIELDS that are already stored (e.g. a
// mistyped name) are removed on the next write. JWT_SECRET is generated when missing.
// Env: AWS_CLI, AWS_PROFILE_NAME.
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const NAME = 'flacronai/staging/app';
const STAGING_PROJECT = 'flacronai-staging-qa';
// name -> { secret: may only arrive via prompt/stdin; valid: format check before writing }
const FIELDS = {
  ANTHROPIC_API_KEY: { secret: true, valid: (v) => /^sk-ant-[\w-]{20,}$/.test(v) },
  STRIPE_SECRET_KEY: { secret: true, valid: (v) => /^(sk|rk)_test_\w{20,}$/.test(v) },
  STRIPE_WEBHOOK_SECRET: { secret: true, valid: (v) => /^whsec_\w{20,}$/.test(v) },
  JWT_SECRET: { secret: true, valid: (v) => v.length >= 32 },
  ADMIN_EMAIL: { secret: false, valid: (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) },
  FIREBASE_API_KEY: { secret: false, valid: (v) => /^AIza[\w-]{35}$/.test(v) },
  FIREBASE_STORAGE_BUCKET: { secret: false, valid: (v) => v === `${STAGING_PROJECT}.firebasestorage.app` },
  FIREBASE_PROJECT_ID: { secret: false, sa: true, valid: (v) => v === STAGING_PROJECT },
  FIREBASE_CLIENT_EMAIL: { secret: false, sa: true, valid: (v) => v.endsWith(`@${STAGING_PROJECT}.iam.gserviceaccount.com`) },
  FIREBASE_CLIENT_ID: { secret: false, sa: true, valid: (v) => /^\d+$/.test(v) },
  FIREBASE_PRIVATE_KEY_ID: { secret: true, sa: true, valid: (v) => /^[0-9a-f]{40}$/.test(v) },
  FIREBASE_PRIVATE_KEY: { secret: true, sa: true, valid: (v) => v.includes('BEGIN PRIVATE KEY') },
};
const REQUIRED = Object.keys(FIELDS);

class UsageError extends Error {}

// Raw-mode keystrokes / paste chunks -> value. Ctrl+V in raw mode sends \u0016 instead of
// pasting; that control code was once stored as the key. Control characters are dropped.
function applyKeystrokes(value, chunk) {
  let v = value;
  for (const ch of chunk) {
    if (ch === '\r' || ch === '\n') return { value: v.trim(), done: true };
    if (ch === '\u0003') return { value: '', done: true, cancelled: true };
    if (ch === '\u007f' || ch === '\b') v = v.slice(0, -1);
    else if (ch >= ' ') v += ch;
  }
  return { value: v, done: false };
}

const fieldName = (k) => {
  if (!Object.prototype.hasOwnProperty.call(FIELDS, k)) throw new UsageError('unsupported field name (not shown — it may be a secret). Supported: ' + Object.keys(FIELDS).join(', '));
  return k;
};

// Parses argv into {ops}; never includes argument text in errors.
function parseArgs(argv) {
  const ops = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { if (i + 1 >= argv.length) throw new UsageError(`${a} needs a value`); return argv[++i]; };
    if (a === '--firebase-sa') ops.push({ type: 'sa', file: next() });
    else if (a === '--key') ops.push({ type: 'prompt', key: fieldName(next()) });
    else if (a === '--stdin-key') ops.push({ type: 'stdin', key: fieldName(next()) });
    else if (a === '--set') {
      const raw = next();
      const eq = raw.indexOf('=');
      const key = fieldName(eq > 0 ? raw.slice(0, eq) : raw);
      if (FIELDS[key].secret) throw new UsageError(`${key} is secret: use --key or --stdin-key, never a command-line argument`);
      if (FIELDS[key].sa) throw new UsageError(`${key} comes from --firebase-sa`);
      ops.push({ type: 'set', key, value: eq > 0 ? raw.slice(eq + 1) : '' });
    } else throw new UsageError('unknown option (not shown). Options: --key, --stdin-key, --set, --firebase-sa');
  }
  if (ops.filter((o) => o.type === 'stdin').length > 1) throw new UsageError('only one --stdin-key per run');
  return ops;
}

// Merges updates into the stored object: unknown stored fields are removed (count only),
// every supplied value is validated, nothing is returned for writing if anything is wrong.
function buildNext(current, updates) {
  const next = {};
  let removedUnknown = 0;
  for (const [k, v] of Object.entries(current || {})) {
    if (Object.prototype.hasOwnProperty.call(FIELDS, k)) next[k] = v;
    else removedUnknown++;
  }
  const problems = [];
  for (const [k, v] of Object.entries(updates)) {
    if (!FIELDS[k].valid(String(v))) problems.push(`${k} malformed`);
    else next[k] = v;
  }
  if (/^(sk|rk)_live_/.test(String(next.STRIPE_SECRET_KEY || ''))) problems.push('STRIPE_SECRET_KEY is a live key (staging is sandbox only)');
  // Previously stored malformed values (e.g. the 1-character Ctrl+V placeholder) are dropped.
  const droppedMalformed = [];
  for (const [k, v] of Object.entries(next)) {
    if (!(k in updates) && !FIELDS[k].valid(String(v))) { delete next[k]; droppedMalformed.push(k); }
  }
  if (!next.JWT_SECRET) next.JWT_SECRET = crypto.randomBytes(48).toString('base64url');
  const missing = REQUIRED.filter((k) => !next[k]);
  return { next, problems, removedUnknown, droppedMalformed, missing };
}

function hidden(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    let v = '';
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    const on = (chunk) => {
      const r = applyKeystrokes(v, chunk);
      v = r.value;
      if (!r.done) return;
      process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off('data', on);
      process.stdout.write('\n');
      if (r.cancelled) process.exit(1);
      resolve(v);
    };
    process.stdin.on('data', on);
  });
}

async function main() {
  const AWS = process.env.AWS_CLI || 'aws';
  const BASE = ['--profile', process.env.AWS_PROFILE_NAME || 'flacron-qa', '--region', 'us-east-1'];
  const aws = (args) => execFileSync(AWS, [...args, ...BASE], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

  const ops = parseArgs(process.argv.slice(2));
  let current = {};
  let exists = true;
  try { current = JSON.parse(JSON.parse(aws(['secretsmanager', 'get-secret-value', '--secret-id', NAME, '--output', 'json'])).SecretString); }
  catch (e) { if (/ResourceNotFound/.test(String(e.stderr))) exists = false; else throw new UsageError('cannot read the secret (AWS session expired? run: aws login --profile flacron-qa)'); }

  const updates = {};
  for (const op of ops) {
    if (op.type === 'sa') {
      const sa = JSON.parse(fs.readFileSync(op.file, 'utf8'));
      if (sa.project_id !== STAGING_PROJECT) throw new UsageError(`refusing: service account is not for ${STAGING_PROJECT}`);
      Object.assign(updates, {
        FIREBASE_PROJECT_ID: sa.project_id, FIREBASE_CLIENT_EMAIL: sa.client_email, FIREBASE_CLIENT_ID: sa.client_id,
        FIREBASE_PRIVATE_KEY_ID: sa.private_key_id, FIREBASE_PRIVATE_KEY: sa.private_key,
      });
      if (!current.FIREBASE_STORAGE_BUCKET) updates.FIREBASE_STORAGE_BUCKET = `${STAGING_PROJECT}.firebasestorage.app`;
    } else if (op.type === 'prompt') updates[op.key] = await hidden(`${op.key} (hidden, right-click or Shift+Insert to paste): `);
    else if (op.type === 'stdin') updates[op.key] = fs.readFileSync(0, 'utf8').trim();
    else updates[op.key] = op.value;
  }

  const { next, problems, removedUnknown, droppedMalformed, missing } = buildNext(current, updates);
  if (problems.length) throw new UsageError(`refusing to save, nothing was written: ${problems.join('; ')}`);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fas-'));
  const tmp = path.join(dir, 's.json');
  fs.writeFileSync(tmp, JSON.stringify(next), { mode: 0o600 });
  try {
    if (exists) aws(['secretsmanager', 'put-secret-value', '--secret-id', NAME, '--secret-string', `file://${tmp}`]);
    else aws(['secretsmanager', 'create-secret', '--name', NAME, '--description', 'FlacronAI staging backend (QA) - sandbox/staging values only',
      '--tags', 'Key=env,Value=staging', 'Key=app,Value=flacronai', 'Key=cost-center,Value=flacronai-staging-qa',
      '--secret-string', `file://${tmp}`]);
  } catch { throw new UsageError('AWS write failed (values not shown)'); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }

  // Only allowlisted names are ever printed.
  console.log(`${exists ? 'updated' : 'created'} ${NAME}. updated: ${Object.keys(updates).sort().join(', ') || '(none)'}`);
  if (removedUnknown) console.log(`removed ${removedUnknown} unsupported field(s) (names not shown)`);
  if (droppedMalformed.length) console.log(`dropped previously stored malformed: ${droppedMalformed.join(', ')}`);
  console.log(missing.length ? `still missing: ${missing.join(', ')}` : 'all required keys present and well-formed');
}

if (require.main === module) {
  main().catch((e) => { console.error(e instanceof UsageError ? e.message : 'failed (details withheld to avoid printing secrets)'); process.exit(1); });
}

module.exports = { FIELDS, applyKeystrokes, parseArgs, buildNext, UsageError };
