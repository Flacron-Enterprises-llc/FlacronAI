// STAGING entrypoint (App Runner StartCommand: `node deploy/staging/boot.js`).
// App Runner injects the whole Secrets Manager secret `flacronai/staging/app` (a JSON object) as
// APP_SECRETS_JSON; expand its keys into process.env (never overriding explicit env), drop the blob,
// then start the normal server. Values are never logged.
const raw = process.env.APP_SECRETS_JSON;
delete process.env.APP_SECRETS_JSON;
if (raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error('[staging-boot] APP_SECRETS_JSON is not valid JSON');
    process.exit(1);
  }
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) process.env[key] = String(value);
  }
  console.log(`[staging-boot] loaded ${Object.keys(parsed).length} secret keys`);
}
require('../../server.js');
