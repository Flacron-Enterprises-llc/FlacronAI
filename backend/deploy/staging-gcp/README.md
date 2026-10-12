# QA staging backend — Google Cloud Run

The only QA staging host (the former EC2 host was deleted 2026-10-12; `../staging/` keeps the
secret-entry script). Runs only in the isolated Firebase/GCP project **`flacronai-staging-qa`**
(Firestore `nam5`, Storage `flacronai-staging-qa.firebasestorage.app` in `us-central1`).
Production (AWS ECS + Firebase `flacronai-c8dab`) is never referenced.

URL: `https://flacronai-staging-api-93799061110.us-central1.run.app/api/v1`

| Setting | Value | Why |
| --- | --- | --- |
| Service | `flacronai-staging-api`, `us-central1` | Tier-1 region (free tier), next to Firestore/Storage |
| Billing | instance-based (`--no-cpu-throttling`) | AI pipelines keep running after the HTTP response |
| Scale | min 0, max 1 instance, 1 vCPU / 2 GiB | No idle cost; caps worst-case spend; single owner for timers |
| Secrets | Secret Manager `backend-env` (dotenv) mounted at `/secrets/app.env`, `node --env-file` | One active version = inside the free tier |
| Runtime identity | `staging-api@flacronai-staging-qa.iam.gserviceaccount.com` | Only `secretAccessor` on `backend-env` |
| Stripe | company **sandbox** only; FlacronAI products tagged `app_id=flacronai`; price IDs in `deploy-cloudrun.sh` | Professional $39.99 / Agency $99.99 monthly (= `frontend/src/data/plans.js`). Annual + Enterprise not configured |
| Webhook | `we_1UPLFoKFLhrvSzkgTH4oAhOY` → `/api/v1/payment/webhook` | Shared sandbox: events from other Flacron products also arrive and are ignored |

## Update a key (never on the command line, never printed)
```powershell
# 1. hidden prompt (paste with right-click / Shift+Insert — Ctrl+V does NOT paste in raw mode)
node backend\deploy\staging\set-staging-secret.js --key STRIPE_SECRET_KEY
#    or from the clipboard:  Get-Clipboard | node backend\deploy\staging\set-staging-secret.js --stdin-key STRIPE_SECRET_KEY
# 2. copy to Secret Manager, redeploy, retire old versions
bash backend/deploy/staging-gcp/sync-secret.sh            # Git Bash; OMIT=ANTHROPIC_API_KEY to leave a key out
```
`set-staging-secret.js` only accepts its allowlisted field names, refuses secrets as arguments,
validates formats before writing, and never prints names it does not know. `build-env.js`
refuses placeholder, foreign-project or live-Stripe values.

## Verify a tester account (staging sends no email)
Staging has no email provider, so verification/password-reset mails are skipped. After an
approved tester signs up in the QA app: `bash backend/deploy/staging-gcp/verify-tester.sh <email>`
(needs gcloud as a project owner; staging only — production auth is unchanged).

## Limits and recovery after scale-to-zero
- Request and non-streamed response bodies ≤ 32 MiB (HTTP/1). Mobile stages one photo
  (≤ 10 MB) per request; a very large PDF export could exceed it.
- The instance stops after ~15 idle minutes. Clients poll `analysis-status` during generation,
  which keeps it up. If it is stopped mid-run (deploy, crash), the Firestore lease goes stale
  after `PIPELINE_STALE_MS` (10 min): the next status read marks the report failed/retryable and
  **Retry** resumes only the unfinished work (concurrent retries → one runs, the other 409).
  Recovery is not automatic — it needs a status read + user Retry.
- Incomplete account deletions are finished by the sweeper ~30 s after an instance starts and
  every 5 min while it runs; with no traffic they wait until the next request starts an instance.
  An always-on fix (Cloud Scheduler ping or min-instances 1) was deliberately not added.
- Push outbox worker is disabled on staging (`PUSH_NOTIFICATIONS_ENABLED=false`).

## Deploy / test settings
```bash
bash backend/deploy/staging-gcp/deploy-cloudrun.sh
# temporary test-only overrides (the next normal deploy removes them):
EXTRA_ENV="PIPELINE_HEARTBEAT_MS=10000,ACCOUNT_DELETION_SWEEP_INTERVAL_MS=20000,ACCOUNT_DELETION_SWEEP_STALE_MS=30000" \
  bash backend/deploy/staging-gcp/deploy-cloudrun.sh
```
