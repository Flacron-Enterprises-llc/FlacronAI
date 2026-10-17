# FlacronAI — Multi-cloud Deployment Plan

> **2026-10-17 update:** the owner chose **production directly, no staging**. Decisions applied: D1/D2/D3 → all clouds use the production Firebase, Stripe and SES (Stripe webhook stays registered on AWS only; the Firestore state is shared, so a checkout started on any cloud is processed once). D6 → Azure Storage state. D8 → all three serve production on their own URLs; `flacronai.com` DNS stays on AWS. Current status lives in `progress.md`; the S1–S5 staging stages below are superseded.

> Target end state: `push main → CI tests → { AWS (existing, untouched), Azure, IBM }` — independent jobs, same Git SHA, separate config/secrets/infra.

## Pipeline shape

```
push to main (FlacronAI repo)
   │
   ├── deploy-backend.yml  (EXISTING AWS backend — unchanged)
   ├── Amplify Git build   (EXISTING AWS frontend — unchanged)
   │
   └── deploy-multicloud.yml (NEW)
         ci  ──► backend: npm ci · lint · test · docker build · in-container /health
             └─► frontend: npm ci · lint · test · build
         │  (needs: ci — a failed build never reaches deploy)
         ├── azure  (environment azure-staging → later azure-production w/ approval)
         │     build image :<sha> → Trivy → push ACR → az containerapp update --image :<sha>
         │     → wait revision healthy → GET /health == 200 and version == <sha>
         │     → build SPA with Azure VITE_* → deploy SWA → smoke GET /
         │     on failure: reactivate previous revision (automatic step) 
         └── ibm    (environment ibm-staging → later ibm-production w/ approval)
               build image :<sha> → Trivy → push us.icr.io/flacronai → ibmcloud ce app update --image :<sha>
               → wait ready → /health check (version == <sha>)
               → build nginx web image with IBM VITE_* → ce app update → smoke GET /
               on failure: ce app update --image :<previous verified sha>
```

- Azure and IBM jobs don't depend on each other, and **neither touches AWS**. Their failure can't affect `deploy-backend.yml` (a separate workflow).
- Manual rollback: `workflow_dispatch` input `rollback_sha` per cloud. It redeploys an already-scanned image tag without rebuilding.
- Each cloud reports its own status check in GitHub (`multicloud / azure`, `multicloud / ibm`).
- **Same-SHA verification**: add a `version` field (the `GIT_SHA` env, set at deploy time) to `/health`. CI asserts it on every cloud. This is a one-line additive backend change and also helps AWS if its pipeline sets the var.

## Required small app changes (via PR to main, reviewed)
1. `backend/server.js`: `CORS_ADDITIONAL_ORIGINS` (comma-separated) appended to `allowedOrigins`.
2. `backend/server.js`: `/health` returns `version: process.env.GIT_SHA || 'unknown'`.
3. `frontend/staticwebapp.config.json` (Azure SPA fallback + headers mirroring `vercel.json`/Amplify rules).
4. `frontend/Dockerfile.web` + `frontend/nginx.conf` (IBM static web container, unprivileged, port 8080).
5. Infra: `infra/azure/` and `infra/ibm/` Terraform (`azurerm`, `ibm` providers); `envs/staging.tfvars`, `envs/production.tfvars`. Remote state: Azure Storage container `tfstate` in `rg-flacronai-tfstate`; IBM state in a COS bucket in RG `FlacronAI` (or Azure backend for both; decision D6).

## Rollout stages
| Stage | What | Approval |
|---|---|---|
| S0 | Discovery + docs (this) | done |
| S1 | Write Terraform + workflows + app changes on branch `multicloud/azure-ibm`, open PR | none (no cloud changes) |
| S2 | Provision **staging** infra (Azure RG, ACR, KV, ACA, SWA; IBM CE project, ICR namespace) | **paid resources + IAM — needs approval** |
| S3 | Load staging secrets, first manual deploy, validation (`test-results.md`) | secrets owner |
| S4 | Merge PR → automatic staging deploys on push to main | PR review |
| S5 | Production plan: prod infra, `*-production` envs with reviewers, DNS decision | separate approval |

## Decisions needed from the owner

| ID | Decision | Recommendation |
|---|---|---|
| **D1** | Which Firebase project does staging use? Pointing staging at the **production** Firebase means staging writes real Firestore data and can email real users. | Create a separate Firebase project `flacronai-staging` (free Spark/Blaze), or accept the prod project read/write with a test-only account. |
| **D2** | Stripe in staging | **Test-mode** keys + a separate test webhook endpoint per cloud. Never register prod webhooks to Azure/IBM. |
| **D3** | Email in staging | Use the SES sandbox / a separate verified sender, or leave AWS creds unset (email is skipped gracefully). |
| **D4** | Approve staging spend (≈ $6–25/month combined) | yes |
| **D5** | IAM changes: Azure role assignments + Entra apps (needs Owner/UAA); IBM policies on `flacronai-deployer` + new `flacronai-ce-puller` | yes |
| **D6** | Terraform state location | Azure Storage (one backend for both clouds, RBAC + versioning) |
| **D7** | GitHub repo admin: create environments, protect `main`, add required checks | yes (needs repo admin) |
| **D8** | Final production meaning: active-active (all 3 serve users) or warm standby? With a shared prod Firestore, Stripe webhook stays on AWS only. | Warm standby on Azure/IBM until a DNS/traffic strategy is chosen |

## Explicitly out of scope / untouched
AWS resources and `deploy-backend.yml`; Amplify; any other app's Azure RG/ACR/App Service/Container App; IBM projects `adsgen*`, `flacronar`, `flacronbuild`, `flacronsports*`, `rapid-claim-pro-project`; DNS (external registrar); Firebase/Stripe production config.
