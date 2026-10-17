# FlacronAI Multi-cloud — Progress Log

> Resume here. Infra/CI work happens in git worktree `E:\freelancing projects\FlacronAI-multicloud` (branch off `origin/main`).
> The original checkout `E:\freelancing projects\FlacronAI` (branch `flacron/improvements`) holds the owner's stale uncommitted local work. **Don't use or modify it.** GitHub `main` is the source of truth (owner, 2026-10-16).
> Owner decision 2026-10-17: **production on all three clouds (no staging), fix the AWS findings.**

## Status (2026-10-17): ✅ LIVE ON AWS + AZURE + IBM, AUTO-DEPLOYED FROM `main`

One push to `main` → tests → AWS, Azure, IBM deploy the same commit independently. Release `a48b5f7` (merge of PR #32) is running on all three, deployed entirely by the pipelines:

| Cloud | Frontend | API | Pipeline |
|---|---|---|---|
| AWS | https://flacronai.com | https://api.flacronai.com | `deploy-backend.yml` + Amplify |
| Azure | https://calm-ground-0fce9b20f.3.azurestaticapps.net | https://ca-flacronai-api-prod.mangoglacier-8dbdc9b8.eastus.azurecontainerapps.io | `deploy-multicloud.yml` / Deploy Azure |
| IBM | https://flacronai-web.2g1gauctre14.us-east.codeengine.appdomain.cloud | https://flacronai-api.2g1gauctre14.us-east.codeengine.appdomain.cloud | `deploy-multicloud.yml` / Deploy IBM Cloud |

Check any cloud: `curl <API>/health` → `version` = deployed commit, `platform` = aws|azure|ibm.

### Release history
- PR #31 (`3ce7716`): multicloud pipelines + AWS fixes. AWS + Amplify deployed; **Azure/IBM correctly blocked by the Trivy gate** (3 CRITICAL perl CVEs in the Debian base image).
- PR #32 (`a48b5f7`): `apt-get upgrade` in `backend/Dockerfile` (perl-base deb12u4, verified in the image). All three clouds deployed ✅.

### Done
**AWS (account 482881544977)**
- A1 ✅ live: every deploy registers a new task-def revision (`:8` was created automatically by the pipeline), test gate, `/health` version check, auto-rollback.
- A2 ✅ secrets in Secrets Manager `flacronai/production/app` (no static AWS keys left in it).
- A3 ✅ SES via task role `flacronai-backend-task-role` (revision `:9`, no static keys). **Proven** with a one-off ECS task using `:9` → SES simulator (`MessageId=010001a148a9bb9d…`). Interim IAM user `flacronai-ses-sender-aws` deleted.
- A4 ✅ deploys gated on tests (branch protection on `main` = owner decision).
- A5 ✅ `/health` ALB check, container health check, 90-day logs, SNS topic `flacronai-production-alerts` + 3 alarms.
- A6 ✅ ECR `flacronai-backend` tags IMMUTABLE.
- Bugs fixed: `FIREBASE_API_KEY` missing (login/MFA/account deletion broken); **SES key invalid: logs show 55 failed / 0 sent emails in the 30 days before the fix.**

**Azure** (rg `rg-flacronai-prod`, Terraform `infra/azure`): Container Apps API, Static Web App, ACR (pull via managed identity, verified with a forced new revision), Key Vault, Log Analytics. CI app `gh-flacronai-deploy-prod` (OIDC) with AcrPush + Contributor on the container app + SWA only. Rodrigue granted "RBAC Administrator" at subscription scope (2026-10-17).

**IBM** (RG `FlacronAI`, Terraform `infra/ibm`): Code Engine project `flacronai-prod` (api + web), ICR namespace `flacronai`. CI service ID `flacronai-deployer` scoped to that project + namespace (tested positive/negative).

## Validation evidence
- Same commit on all clouds via `/health` ✅ · frontends 200 + deep links ✅ · CORS ✅ · Firebase auth ✅
- **Failed build cannot deploy** ✅ proven live (PR #31: scan failed → Azure/IBM skipped, still serving the previous release)
- **Rollback** ✅ Azure: `rollback_sha=5c5682c` → served `5c5682c`, then `rollback_sha=a48b5f7` → back, healthy throughout. ✅ IBM failure path: a deploy whose image was missing failed, CE kept serving the healthy revision, and the workflow's rollback step ran. ⏳ IBM roll-back-to-previous-SHA: needs a second image in ICR (see below). AWS: circuit breaker with rollback + explicit rollback step.

## ⚠️ Lessons learned
- `ibmcloud cr image-rm <repo>:<tag>` deletes the **manifest**, i.e. every tag on that digest. That's how ICR lost `5c5682c` (it shared a digest with a test tag). To drop one tag, use `ibmcloud cr image-untag` (or `crane`), never `image-rm`.

## ⛔ Owner / admin actions
1. **Rodrigue**: the RBAC Administrator grant has **no condition**, so it can assign any role (including Owner). Recommend adding the "only these roles to service principals" condition (message drafted 2026-10-17).
2. **Google Cloud owner**: if the Maps browser key is referrer-restricted, add the Azure + IBM frontend hosts.
3. **Alerts**: subscribe an on-call email to SNS `flacronai-production-alerts`.
4. **Stripe**: `STRIPE_PRICE_PHOTOS_*` not set on any cloud, so photo add-on checkout can't work until the price IDs are supplied.
5. Optional DNS (`azure.flacronai.com` / `ibm.flacronai.com`) at the dns-parking.com registrar.
6. Old IBM key `FlacronAi API` (ApiKey-5badffe7…, 2026-01) on `flacronai-deployer`: delete if nobody uses it.

## Next (me / next session)
- IBM rollback test: after the next real release (two images in ICR), run *Deploy FlacronAI (Azure + IBM)* with `target=ibm`, `rollback_sha=<previous>`, then roll forward.
- Human E2E on each cloud: login (email + Google), report generation with photos, Stripe purchase + refund.
- `firebase-admin` 14 upgrade (node-forge HIGH advisory) in its own PR.
- 90-day rotation: ACR pull token (now unused: identity pull), IBM puller key, IBM CI key (`IBM_CLOUD_API_KEY`), SES multicloud key.
