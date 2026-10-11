# QA staging backend — Google Cloud Run

Replaces the EC2 staging host (`../staging/`, kept for recovery) for mobile QA. Runs only in
the isolated Firebase/GCP project **`flacronai-staging-qa`** (Firestore `nam5`, Storage bucket
`flacronai-staging-qa.firebasestorage.app` in `us-central1`). Production (AWS ECS +
Firebase `flacronai-c8dab`) is never referenced.

| Setting | Value | Why |
| --- | --- | --- |
| Service | `flacronai-staging-api`, `us-central1` | Tier-1 region (free tier applies), next to Firestore/Storage |
| Billing | instance-based (`--no-cpu-throttling`) | AI pipelines keep running after the HTTP response |
| Scale | min 0, max 1 instance, 1 vCPU / 2 GiB | No idle cost; caps worst-case spend; single owner for timers |
| Secrets | one Secret Manager secret `backend-env` mounted at `/secrets/app.env`, loaded with `node --env-file` | One active version keeps Secret Manager inside its free tier |
| Runtime identity | `staging-api@flacronai-staging-qa.iam.gserviceaccount.com` | Only `secretmanager.secretAccessor` on `backend-env` |

## Limits that matter for QA
- Request **and** non-streamed response bodies are capped at 32 MiB (HTTP/1). Mobile stages one
  photo per request (≤10 MB), so uploads fit; a very large PDF export could exceed it.
- With min-instances 0 the instance stops after ~15 idle minutes. In-process workers (push outbox,
  account-deletion recovery) only run while an instance is up; interrupted AI pipelines are
  recovered through the Firestore lease (`pipelineLease`) on the next request/retry.

## Update secrets (values are never printed)
```bash
# base = AWS staging secret; overrides.json = {"ANTHROPIC_API_KEY": "...", ...} (delete after)
aws secretsmanager get-secret-value --profile flacron-qa --region us-east-1 \
  --secret-id flacronai/staging/app --query SecretString --output text \
| node backend/deploy/staging-gcp/build-env.js overrides.json \
| gcloud secrets versions add backend-env --project flacronai-staging-qa --data-file=-
```
`build-env.js` refuses to emit anything if a required key is missing or malformed (e.g. a
placeholder), belongs to another Firebase project, or is a live Stripe key. Afterwards destroy
the previous version (`gcloud secrets versions destroy <n> --secret backend-env`) so only one
version stays active, then redeploy.

## Deploy
```bash
bash backend/deploy/staging-gcp/deploy-cloudrun.sh
```
