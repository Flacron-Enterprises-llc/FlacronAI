# FlacronAI — Multi-cloud Security Matrix

> Principle: separate identities for **humans**, **CI/CD**, and **runtime**; least privilege; short-lived credentials wherever the provider supports them; no secrets in Git, Terraform state, or image layers.

## Identities

| Cloud | Purpose | Identity | Auth method | Scope / permissions | Credential lifetime | Status |
|---|---|---|---|---|---|---|
| AWS | CI deploy (existing) | `FlacronAI-GitHubActions-DeployRole` | GitHub OIDC (`ref:refs/heads/main`) | ECR push + ECS update (inline) | per-run STS | Exists — **unchanged** |
| AWS | Runtime | `ecsTaskExecutionRole` (shared) + static SES keys in env | — | — | long-lived keys ⚠️ | Exists — see aws-inventory A2/A3 |
| Azure | Human | `umer@FlacronEnterprises.onmicrosoft.com` | Entra | Contributor @ subscription | session | Exists |
| Azure | CI deploy (staging) | Entra app `gh-flacronai-deploy-staging` | **Workload identity federation**, subject `repo:Flacron-Enterprises-llc/FlacronAI:environment:azure-staging` | `AcrPush` on `acrflacronai`; `Container Apps Contributor` on `ca-flacronai-api-staging`; `Website Contributor` on `swa-flacronai-staging` (for deploy-token retrieval) | per-run token, **no secret** | Proposed — needs admin |
| Azure | CI deploy (prod) | `gh-flacronai-deploy-prod` | federation, subject `…:environment:azure-production` | same, on prod resources | per-run | Later |
| Azure | Runtime API | User-assigned MI `id-flacronai-api-<env>` | Managed identity | `AcrPull` on ACR, `Key Vault Secrets User` on `kv-flacronai-<env>` | platform-managed | Proposed — needs admin |
| Azure | Terraform apply (bootstrap) | Human (Contributor) + an admin for role assignments | az login | RG-scoped resources | session | Proposed |
| IBM | Human | `umerali7454@gmail.com` (AG_IAM_ADMIN, AG_IAM_PROD…) | IBMid | broad admin ⚠️ | session | Exists — **not used for CI** |
| IBM | CI deploy | Service ID `flacronai-deployer` (exists) | API key in GitHub environment secret (no supported GitHub-OIDC flow confirmed) | **To add:** Code Engine `Writer`+`Operator` on projects `flacronai-staging`/`flacronai-prod` only; Container Registry `Writer` on namespace `flacronai` only; `Viewer` on RG `FlacronAI` | API key, **90-day rotation** | Proposed — IAM change, needs approval |
| IBM | Registry pull (runtime) | Service ID `flacronai-ce-puller` | API key held in a CE registry secret | Container Registry `Reader` on namespace `flacronai` | 90-day rotation | Proposed |
| GitHub | Prod gate | Environments `azure-staging`, `ibm-staging`, `azure-production`, `ibm-production` | Required reviewers on `*-production`, branch filter `main` | — | — | Proposed (needs repo admin) |

## Secrets handling

| Secret class | AWS (today) | Azure | IBM |
|---|---|---|---|
| Stripe secret + webhook secret | task-def env ⚠️ | Key Vault → ACA secret ref (MI) | CE secret |
| Firebase service-account key | task-def env ⚠️ | Key Vault | CE secret |
| JWT secret, AI keys, Google Maps, Realty | env / Secrets Manager | Key Vault | CE secret |
| SES (email) | static IAM keys ⚠️ | Key Vault — **a separate IAM user/key scoped to `ses:SendEmail` on `flacronenterprises.com` only** (AWS-side change → approval) | CE secret (same scoped key) |
| `VITE_*` (public by design: Firebase web config, Maps browser key) | Amplify env | GitHub environment variables | GitHub environment variables |

Values are never copied by me from AWS. The owner loads them into Key Vault / CE secrets directly (scripted prompt, nothing echoed). Staging must use **separate** values (see deployment-plan decisions D1–D3).

## Supply chain / pipeline controls
- Images tagged with immutable Git SHA; ACR/ICR deploys reference the SHA, never `latest`.
- Trivy scan in CI; **fail on CRITICAL** (HIGH reported). Plus ACR Defender (optional) / IBM Vulnerability Advisor.
- Tests (`npm ci`, lint, `npm test` backend + frontend, docker build + in-container `/health`) must pass before any cloud job starts (`needs:`).
- Third-party actions pinned to commit SHAs. `permissions:` minimal per job (`id-token: write` only where federating).
- `concurrency` per cloud+env, `cancel-in-progress: false`.

## Network / data
- TLS everywhere (ACA ingress, SWA, CE domain); HTTPS-only flags on.
- Claim data stays in Firebase (encrypted at rest by Google). No data copied to Azure/IBM storage.
- Backend CORS allow-list extended per environment, never `*`.
