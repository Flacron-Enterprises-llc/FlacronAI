// Prints the public VITE_* build config used by the AWS Amplify production
// build, with VITE_API_URL replaced by the target cloud's API. These values are
// public by design (they ship in the browser bundle). Output formats:
//   --format dotenv     -> KEY=value lines (for frontend/.env.production.local)
//   --format buildargs  -> --build-arg KEY=value ... (for docker / az acr build)
//   --format github     -> KEY=value lines for $GITHUB_ENV
// Usage: node frontend-build-env.js --api-url https://... [--format dotenv]
const { execFileSync } = require('child_process');

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const apiUrl = arg('api-url');
const format = arg('format', 'dotenv');
if (!apiUrl) { console.error('usage: --api-url <https://...>'); process.exit(2); }

const app = JSON.parse(execFileSync('aws', ['amplify', 'get-app', '--app-id', 'd3vae9bcin1ywn',
  '--profile', process.env.FLACRON_AWS_PROFILE || 'flacron-cloudadmin', '--region', 'us-east-1', '--output', 'json'], { encoding: 'utf8' })).app;
const vars = Object.fromEntries(Object.entries(app.environmentVariables || {}).filter(([k]) => k.startsWith('VITE_')));
vars.VITE_API_URL = apiUrl;

const lines = Object.entries(vars).sort(([a], [b]) => a.localeCompare(b));
if (format === 'buildargs') process.stdout.write(lines.map(([k, v]) => `--build-arg ${k}=${v}`).join(' '));
else process.stdout.write(lines.map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
