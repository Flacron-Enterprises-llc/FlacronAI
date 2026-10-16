// Sync FlacronAI production runtime config: AWS (source of truth) -> IBM Code Engine.
//  - sensitive values -> generic CE secret `flacronai-api-secrets` (env-file via temp file, never logged)
//  - plain values     -> infra/ibm/production.generated.auto.tfvars.json (gitignored)
// Prereq: `ibmcloud ce project select --name flacronai-prod`
// Usage: node sync-secrets-ibm.js --web-url https://flacronai-web.<sub>.us-east.codeengine.appdomain.cloud
const { execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const { load } = require('./aws-source');

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const webUrl = arg('web-url');
if (!webUrl) { console.error('usage: --web-url <https://...>'); process.exit(2); }

const { plain, sensitive } = load();
const ic = process.platform === 'win32' ? 'ibmcloud.exe' : 'ibmcloud';
const SECRET = 'flacronai-api-secrets';

// One file per key (--from-file KEY=path) keeps multi-line values such as the
// Firebase private key intact.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-'));
try {
  const args = [];
  for (const [k, v] of Object.entries(sensitive)) {
    const f = path.join(dir, k);
    fs.writeFileSync(f, v, { mode: 0o600 });
    args.push('--from-file', `${k}=${f}`);
  }
  let exists = true;
  try { execFileSync(ic, ['ce', 'secret', 'get', '--name', SECRET], { stdio: 'ignore' }); } catch { exists = false; }
  execFileSync(ic, ['ce', 'secret', exists ? 'update' : 'create', '--name', SECRET, ...(exists ? [] : ['--format', 'generic']), ...args, '--quiet'],
    { stdio: ['ignore', 'ignore', 'pipe'] });
  console.log(`CE secret ${SECRET} ${exists ? 'updated' : 'created'}: ${Object.keys(sensitive).sort().join(', ')}`);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

const plainEnv = {
  ...plain,
  NODE_ENV: 'production',
  PORT: '3000',
  FRONTEND_URL: webUrl,
  CORS_ADDITIONAL_ORIGINS: webUrl,
  DEPLOY_PLATFORM: 'ibm',
};
const out = path.join(__dirname, '..', 'ibm', 'production.generated.auto.tfvars.json');
fs.writeFileSync(out, JSON.stringify({ plain_env: plainEnv }, null, 2));
console.log('wrote', out, '-', Object.keys(plainEnv).length, 'plain vars');
