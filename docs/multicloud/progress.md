# FlacronAI Multi-cloud — Progress Log

> Resume here. Work happens in git worktree `E:\freelancing projects\FlacronAI-multicloud`, branch `multicloud/azure-ibm` (from `origin/main` @ `ef46186`).
> The original checkout `E:\freelancing projects\FlacronAI` (branch `flacron/improvements`) holds the owner's stale uncommitted local work. **Don't use or modify it.** GitHub `main` is the source of truth (owner, 2026-10-16).
> Owner decision 2026-10-17: **production on all three clouds (no staging), fix the AWS findings, list the admin permissions needed.**

## Status: Azure + IBM PRODUCTION LIVE (manual bootstrap, commit `5c5682c`) · AWS fixed · CI/CD written, waiting on PR merge + Azure admin

### Done
**AWS (production, account 482881544977)**
- A2 ✅ 11 plaintext secrets → Secrets Manager `flacronai/production/app`; task def `:6` → `:7`.
- **Bug fixed** ✅ `FIREBASE_API_KEY` was missing in prod (login/MFA/account-deletion returned `CONFIG_ERROR`); added.
- **Bug fixed** ✅ production SES key was **invalid** (all transactional email failing). New send-only IAM user `flacronai-ses-sender-aws`, verified via SES simulator.
- A5 ✅ ALB TG health check `/` → `/health` (enables restart when Firebase auth wedges); ECS container health check; log retention 90 d; SNS topic `flacronai-production-alerts` + alarms (unhealthy hosts, 5xx, no running tasks).
- A3 (part 1) ✅ task role `flacronai-backend-task-role` (SES send on flacronenterprises.com only) attached in `:7` with `SES_USE_DEFAULT_CREDENTIALS=true`.
- A1 ✅ (code) `deploy-backend.yml` now gates on tests, builds immutable SHA tag, registers a new task-def revision per deploy, verifies `/health` version, auto-rollback. Deploy role got `RegisterTaskDefinition`/`DescribeTaskDefinition` + `PassRole` (2 ECS roles only); OIDC trust also accepts `environment:aws-production`.
- Rollback points: task defs `:5` (original), `:6`, `:7`.

**Azure (sub bce797d8…, rg `rg-flacronai-prod`, eastus)** — Terraform `infra/azure` (state: `stflacronaitfstate/tfstate/azure/production.tfstate`)
- ACR `acrflacronai` (admin off, pull via repo-scoped token), Key Vault `kv-flacronai-prod` (access-policy mode, purge protection), UAMI, Log Analytics, Container Apps env + `ca-flacronai-api-prod` (1 vCPU/2Gi, min 1/max 3, probes), Static Web App `swa-flacronai-prod` (Standard), Entra app `gh-flacronai-deploy-prod` + federated credential (`environment:azure-production`).

**IBM (account 70ccc4b0…, RG `FlacronAI`, us-east)** — Terraform `infra/ibm` (state: same storage account, `ibm/production.tfstate`)
- CE project `flacronai-prod`: apps `flacronai-api` (1 vCPU/4G, min 1/max 3) + `flacronai-web` (nginx, min 1); ICR namespace `flacronai` (retention 20); service ID `flacronai-ce-puller` (Reader on namespace); `flacronai-deployer` got CE Writer on the project + ICR Writer on the namespace. Tested: positive + negative.

**GitHub**: environments `aws-production`, `azure-production`, `ibm-production` (main only); env variables set; `IBM_CLOUD_API_KEY` secret (new key `github-actions-ibm-production-20261017`).
**Firebase**: Azure + IBM frontend hosts added to Auth authorized domains.

## ⛔ Needs someone else (admin / owner) — LIST FOR THE ADMIN
1. **Azure Owner** (`rodrigue@FlacronEnterprises.onmicrosoft.com`) runs `infra/azure/admin-role-assignments.sh` — 4 role assignments, each scoped to one FlacronAI resource (AcrPush + Contributor on the container app + Contributor on the SWA for the CI app; AcrPull for the API identity). Until then the Azure CI job fails (IBM/AWS unaffected); the live Azure deployment keeps running.
2. **Google Cloud (Firebase project `flacronai-c8dab`) owner**: if `VITE_GOOGLE_MAPS_BROWSER_KEY` is HTTP-referrer-restricted, add `calm-ground-0fce9b20f.3.azurestaticapps.net/*` and `flacronai-web.2g1gauctre14.us-east.codeengine.appdomain.cloud/*`.
3. **Repo owner**: review + merge the PR from `multicloud/azure-ibm` → `main` (merging triggers all three pipelines).
4. **Alerts**: subscribe an on-call email to SNS topic `flacronai-production-alerts` (subscription needs the recipient to confirm).
5. **DNS (optional, for branded URLs)**: at the `dns-parking.com` registrar, CNAMEs for e.g. `azure.flacronai.com` / `ibm.flacronai.com`, then bind in SWA/CE + add to Firebase authorized domains + CORS.
6. **Stripe/AI keys**: `STRIPE_PRICE_PHOTOS_*` env vars are used by code but not set anywhere — photo add-on checkout cannot work on any cloud until the owner supplies the Stripe price IDs.

## Next steps after merge (me / next session)
- Watch the first runs: `deploy-backend.yml` (AWS) and `deploy-multicloud.yml` (Azure+IBM) must all report the merge SHA in `/health`.
- A3 part 2: once AWS runs the new image, register a revision without `AWS_ACCESS_KEY_ID/SECRET` secrets (task role takes over), then delete IAM user `flacronai-ses-sender-aws`.
- A6: set ECR `flacronai-backend` tag immutability to IMMUTABLE (new workflow no longer pushes `:latest`).
- Old IBM key `FlacronAi API` (ApiKey-5badffe7…, 2026-01) on `flacronai-deployer`: owner decides whether to delete (unknown holder).
- Rotation (90 d): ACR pull token, IBM puller key, IBM CI key, SES multicloud key.
- Human E2E: test account login (email + Google), report generation with photos, Stripe test-clock/real-card purchase + refund on each cloud.
