// Sync FlacronAI production runtime config: AWS (source of truth) -> Azure.
//  - sensitive values -> Key Vault secrets (lower-kebab names), via temp files, never logged
//  - plain values     -> infra/azure/production.generated.auto.tfvars.json (gitignored)
// Usage: node sync-secrets-azure.js --vault kv-flacronai-prod --web-url https://<swa-host>
const { execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const { load } = require('./aws-source');

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const vault = arg('vault');
const webUrl = arg('web-url');
if (!vault || !webUrl) { console.error('usage: --vault <kv> --web-url <https://...>'); process.exit(2); }

const { plain, sensitive } = load();
const az = process.platform === 'win32' ? 'az.cmd' : 'az';

let n = 0;
for (const [k, v] of Object.entries(sensitive)) {
  const name = k.toLowerCase().replace(/_/g, '-');
  const tmp = path.join(os.tmpdir(), `kv-${process.pid}-${n}`);
  fs.writeFileSync(tmp, v, { mode: 0o600 });
  try {
    execFileSync(az, ['keyvault', 'secret', 'set', '--vault-name', vault, '--name', name, '--file', tmp, '--encoding', 'utf-8', '--output', 'none'],
      // Windows can only launch az.cmd through a shell; all args are fixed values.
      { stdio: ['ignore', 'ignore', 'pipe'], shell: process.platform === 'win32' });
    n++;
  } finally { fs.rmSync(tmp, { force: true }); }
}
console.log(`Key Vault ${vault}: ${n} secrets set (${Object.keys(sensitive).sort().join(', ')})`);

const plainEnv = {
  ...plain,
  NODE_ENV: 'production',
  PORT: '3000',
  FRONTEND_URL: webUrl,
  CORS_ADDITIONAL_ORIGINS: webUrl,
  DEPLOY_PLATFORM: 'azure',
};
const out = path.join(__dirname, '..', 'azure', 'production.generated.auto.tfvars.json');
fs.writeFileSync(out, JSON.stringify({ plain_env: plainEnv }, null, 2));
console.log('wrote', out, '-', Object.keys(plainEnv).length, 'plain vars');
