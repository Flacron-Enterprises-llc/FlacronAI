#!/usr/bin/env node
// Creates/updates Secrets Manager secret `flacronai/staging/app` (JSON) WITHOUT printing values.
// Existing keys are kept; only the keys you supply are replaced. Run interactively:
//   node backend/deploy/staging/set-staging-secret.js [--firebase-sa <service-account.json>] [--key NAME ...]
//   --firebase-sa : staging (flacronai-staging-qa) service-account key file; delete the file afterwards.
//   --key NAME    : prompt (hidden input) for NAME, e.g. --key STRIPE_SECRET_KEY --key ANTHROPIC_API_KEY
//   --set NAME=VALUE : non-secret value (e.g. FIREBASE_API_KEY web key, ADMIN_EMAIL)
//   --stdin-key NAME : read NAME's value from stdin (for piping from another CLI; never echoed)
// JWT_SECRET is generated (48 random bytes) the first time it is missing. Env: AWS_CLI, AWS_PROFILE_NAME.
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const AWS = process.env.AWS_CLI || 'aws';
const BASE = ['--profile', process.env.AWS_PROFILE_NAME || 'flacron-qa', '--region', 'us-east-1'];
const NAME = 'flacronai/staging/app';
const aws = (args) => execFileSync(AWS, [...args, ...BASE], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function hidden(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    let v = '';
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    const on = (ch) => {
      if (ch === '\r' || ch === '\n') {
        process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off('data', on);
        process.stdout.write('\n'); resolve(v.trim());
      } else if (ch === '\u0003') process.exit(1);
      else if (ch === '\u007f' || ch === '\b') v = v.slice(0, -1);
      else v += ch;
    };
    process.stdin.on('data', on);
  });
}
const readStdin = () => fs.readFileSync(0, 'utf8').trim();

(async () => {
  const argv = process.argv.slice(2);
  let current = {};
  let exists = true;
  try { current = JSON.parse(JSON.parse(aws(['secretsmanager', 'get-secret-value', '--secret-id', NAME, '--output', 'json'])).SecretString); }
  catch (e) { if (/ResourceNotFound/.test(String(e.stderr))) exists = false; else throw new Error('cannot read secret (access?)', { cause: e }); }

  const next = { ...current };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--firebase-sa') {
      const sa = JSON.parse(fs.readFileSync(argv[++i], 'utf8'));
      if (sa.project_id !== 'flacronai-staging-qa') throw new Error(`refusing: service account is for ${sa.project_id}, not flacronai-staging-qa`);
      Object.assign(next, {
        FIREBASE_PROJECT_ID: sa.project_id, FIREBASE_CLIENT_EMAIL: sa.client_email, FIREBASE_CLIENT_ID: sa.client_id,
        FIREBASE_PRIVATE_KEY_ID: sa.private_key_id, FIREBASE_PRIVATE_KEY: sa.private_key,
        FIREBASE_STORAGE_BUCKET: next.FIREBASE_STORAGE_BUCKET || `${sa.project_id}.firebasestorage.app`,
      });
    } else if (a === '--key') { const k = argv[++i]; next[k] = await hidden(`${k} (hidden): `); }
    else if (a === '--stdin-key') { next[argv[++i]] = readStdin(); }
    else if (a === '--set') { const [k, ...v] = argv[++i].split('='); next[k] = v.join('='); }
    else throw new Error(`unknown arg ${a}`);
  }
  if (!next.JWT_SECRET) next.JWT_SECRET = crypto.randomBytes(48).toString('base64url');
  if (/^sk_live_|^rk_live_/.test(next.STRIPE_SECRET_KEY || '')) throw new Error('refusing: live Stripe key — staging is sandbox only');

  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fas-')), 's.json');
  fs.writeFileSync(tmp, JSON.stringify(next), { mode: 0o600 });
  try {
    if (exists) aws(['secretsmanager', 'put-secret-value', '--secret-id', NAME, '--secret-string', `file://${tmp}`]);
    else aws(['secretsmanager', 'create-secret', '--name', NAME, '--description', 'FlacronAI staging backend (QA) - sandbox/staging values only',
      '--tags', 'Key=env,Value=staging', 'Key=app,Value=flacronai', 'Key=cost-center,Value=flacronai-staging-qa',
      '--secret-string', `file://${tmp}`]);
  } finally { fs.rmSync(path.dirname(tmp), { recursive: true, force: true }); }

  const required = ['FIREBASE_PROJECT_ID', 'FIREBASE_STORAGE_BUCKET', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'FIREBASE_API_KEY',
    'ANTHROPIC_API_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'JWT_SECRET', 'ADMIN_EMAIL'];
  console.log(`${exists ? 'updated' : 'created'} ${NAME}. keys present: ${Object.keys(next).sort().join(', ')}`);
  const missing = required.filter((k) => !next[k]);
  console.log(missing.length ? `still missing: ${missing.join(', ')}` : 'all required keys present');
})().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
