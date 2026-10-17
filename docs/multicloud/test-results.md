# FlacronAI — Multi-cloud Test Results

> Evidence log. ✅ = verified by a real request/command (date, command noted). ⏳ = pending (reason given).
> Release under test: commit `5c5682c` (origin/main `ef46186` + multicloud changes), image digest
> `sha256:525cb1bbf1c061af2d676f815b9531bbff8136a7977dd8d3cb2943a2a35cc759` — **identical in ACR and ICR** (`crane digest`).

## Endpoints

| Cloud | Frontend | API |
|---|---|---|
| AWS | https://flacronai.com | https://api.flacronai.com |
| Azure | https://calm-ground-0fce9b20f.3.azurestaticapps.net | https://ca-flacronai-api-prod.mangoglacier-8dbdc9b8.eastus.azurecontainerapps.io |
| IBM | https://flacronai-web.2g1gauctre14.us-east.codeengine.appdomain.cloud | https://flacronai-api.2g1gauctre14.us-east.codeengine.appdomain.cloud |

## Results (2026-10-16/17)

| Check | AWS | Azure | IBM |
|---|---|---|---|
| `GET /health` 200 | ✅ | ✅ `version=5c5682c…`, `platform=azure` | ✅ `version=5c5682c…`, `platform=ibm` |
| Platform health probes use `/health` | ✅ ALB TG `/health` + ECS container health check (HEALTHY) | ✅ startup/liveness/readiness probes, revision Healthy | ✅ readiness + liveness probes, app Ready 3/3 |
| Firebase Admin + Auth REST reachable (`POST /api/auth/login`, bad creds → `401 INVALID_CREDENTIALS`, not `CONFIG_ERROR`) | ✅ (was broken before — `FIREBASE_API_KEY` missing, fixed) | ✅ | ✅ |
| CORS: own frontend origin allowed | ✅ | ✅ `access-control-allow-origin` = SWA host | ✅ = CE web host |
| Frontend 200 + SPA deep links (`/pricing`, `/dashboard`) | ✅ (Amplify, unchanged) | ✅ | ✅ |
| Security headers (XFO DENY, nosniff, Referrer-Policy, HSTS) | ✅ (unchanged) | ✅ | ✅ |
| Bundle calls only its own cloud's API | n/a | ✅ (0 refs to IBM, 1 to Azure API) | ✅ (0 refs to `api.flacronai.com`) |
| TLS | ✅ ALB TLS1.3 policy | ✅ managed (ACA + SWA) | ✅ managed (CE) |
| Email (SES) | ✅ **fixed** — old key was invalid (`InvalidClientTokenId`); new send-only key verified via SES mailbox simulator | ✅ scoped send-only key (same verification path) | ✅ same |
| Firebase Google sign-in domain authorised | ✅ | ✅ added to Firebase authorized domains | ✅ added |
| Runtime secrets not in plaintext config | ✅ moved to Secrets Manager (`flacronai/production/app`) | ✅ Key Vault refs via managed identity | ✅ CE secret (encrypted) |
| CI identity least-privilege | ✅ OIDC, ECR repo + one ECS service + PassRole for 2 roles | ⏳ needs Owner role assignments (`infra/azure/admin-role-assignments.sh`) | ✅ tested: push+deploy FlacronAI OK; other project/namespace **DENIED** |
| Workflow lint | ✅ actionlint clean (all 3 workflows) | ✅ | ✅ |
| CI: failing tests block deploy | ✅ by construction (`needs: test`) — ⏳ first live run after merge | same | same |
| Rollback | ✅ ECS circuit breaker + explicit rollback step; previous revision `:7` kept | ✅ workflow restores previous image on failed verify; `rollback_sha` dispatch | ✅ same |
| Stripe checkout end-to-end (real card) | ⏳ needs a human test purchase / refund — webhook stays AWS-only by design | ⏳ | ⏳ |
| Report generation (Claude) + photo upload | ⏳ needs a logged-in test account | ⏳ | ⏳ |
| Google Maps (browser key) on new domains | n/a | ⏳ key may be referrer-restricted — admin must add the 2 hosts (see progress.md) | ⏳ |
| AWS production unaffected | ✅ `api.flacronai.com/health` 200 after every change; ECS rollouts COMPLETED | | |

## Frontend tests on latest main
`vitest`: 34/34 files, 328 tests pass (with placeholder Firebase env, as CI now sets). ESLint: 0 errors, 14 warnings.
