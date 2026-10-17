# FlacronAI — Azure Architecture

> Status: **DISCOVERY DONE / DESIGN PROPOSED — nothing provisioned** (awaiting approval, see `deployment-plan.md`).
> Tenant `429aae01-ef3d-4e76-9ef0-38a293e867c7`, subscription `Microsoft Azure Sponsorship` (`bce797d8-a46b-4f3a-930a-db2851eb2d80`).
> Developer identity `umer@FlacronEnterprises.onmicrosoft.com` — **Contributor @ subscription** (cannot create role assignments; see "Admin approvals").

## 1. Existing estate (read-only discovery, 2026-10-16)

**No FlacronAI resources exist in Azure** (no resource group, resource, or Entra app registration matching `flacronai`).

| Resource group | Region | Contents (other apps — DO NOT TOUCH) |
|---|---|---|
| AdsGen-rg | centralus | App Service `AdsGen`, ACR `adsgenacr` |
| FlacronResourceGroup | eastus | App Service `flacronbuild-app`, ACR `flacronregistry` |
| flacronconnect-rg | eastus | App Services `flacronconnect-api/-web`, ACR `flacronconnectacr` (Standard) |
| FlacronSports-RG | eastus | App Services `flacronsports-backend/-frontend`, ACR `flacronsportsacr` |
| CryptoPilotRG | eastus | Container Apps env `CryptoPilotEnv` + 2 apps, ACR `cryptopilotacr`, Log Analytics |
| rg-rapidclaimpro | eastus | App Services `rapidclaimpro-web/-server`, ACR `acrrapidclaimpro` |
| flacron-saas-accelerator-rg, flacron-marketplace | eastus2 | App Services, Key Vault `flacron-marketplace-kv` |
| rg-az-vm, NetworkWatcherRG | — | infra |

Org conventions observed: per-app RG, per-app Basic ACR, Linux container App Services; **every ACR has admin user enabled** (we will not copy that). Resource providers `Microsoft.App`, `ContainerRegistry`, `Web`, `KeyVault`, `ManagedIdentity`, `OperationalInsights` are registered.

## 2. Application requirements that drive the choice

- Frontend = Vite static SPA (no SSR, no API routes). Needs SPA fallback + security headers. API URL and Firebase config are **build-time** (`VITE_*`), so each cloud needs its own build of the same commit.
- Backend = stateless Express container, port 3000, `/health`, all state in Firebase (Firestore + Storage). Multipart uploads go through the API into Firebase Storage (no local disk). **No schedulers/cron/queues in code** → no duplicate-job risk. Stripe webhook is inbound only (idempotent via `processedWebhooks`).
- Prod size on AWS: 1 vCPU / 3 GB, 1 task.

## 3. Proposed design

| Concern | Choice | Why |
|---|---|---|
| Backend | **Azure Container Apps** (Consumption), env `cae-flacronai-<env>` | Same container image as ECS, revision-based rollback, built-in TLS ingress, scale-to-zero for staging |
| Frontend | **Azure Static Web Apps** (Free for staging, Standard for prod) | Genuinely static build; global CDN, free managed TLS, `staticwebapp.config.json` for SPA fallback/headers |
| Registry | **New** ACR `acrflacronai` (Basic, **admin user disabled**) | Don't share other apps' registries |
| Secrets | **Key Vault** `kv-flacronai-<env>` (RBAC mode, soft-delete + purge protection) → Container App secret refs via managed identity | No secrets in IaC/state |
| Runtime identity | User-assigned MI `id-flacronai-api-<env>`: `AcrPull` on ACR, `Key Vault Secrets User` on vault | No registry passwords |
| Logs/metrics | Log Analytics `log-flacronai-<env>` (30-day retention) + Container Apps system/console logs | |
| CI identity | Entra app `gh-flacronai-deploy-<env>` with **federated credentials** (GitHub OIDC, subject `repo:Flacron-Enterprises-llc/FlacronAI:environment:azure-<env>`) | No client secret |
| Region | `eastus` (matches org + close to AWS us-east-1) | |

### Resource names (staging)
`rg-flacronai-staging` · `acrflacronai` (shared by staging+prod, separate repos/tags) · `cae-flacronai-staging` · `ca-flacronai-api-staging` · `swa-flacronai-staging` · `kv-flacronai-stg` · `id-flacronai-api-staging` · `log-flacronai-staging`. Tags: `app=flacronai`, `env=staging`, `owner=flacron-enterprises`, `managed-by=terraform`.

### Container App settings
- 1.0 vCPU / 2 Gi (Consumption max per replica is 4 vCPU / 8 Gi; 2 Gi is ample — AWS headroom of 3 GB is unused by a Node API, verify with metrics).
- Ingress external, target port 3000, HTTPS only. Probes: liveness + readiness `GET /health`.
- Scale: staging min 0 / max 2; prod min 1 / max 3 (HTTP concurrency rule).
- Revision mode **single**, image tag = Git SHA. Rollback = re-activate previous revision / redeploy previous SHA.

### Expected URLs
- API: `https://ca-flacronai-api-staging.<env-hash>.eastus.azurecontainerapps.io`
- Web: `https://<generated>.azurestaticapps.net`
- Custom domains (e.g. `azure-staging.flacronai.com`) are optional and need DNS records at the external registrar (`dns-parking.com`).

## 4. Parity gaps / differences vs AWS

1. Backend CORS allow-list is hard-coded (`backend/server.js:22-29`); new frontend origins need a small code change (`CORS_ADDITIONAL_ORIGINS` env, comma-separated).
2. Express has no `trust proxy`. Behind ACA/SWA (and already behind the ALB) `req.ip` is the proxy, which affects per-IP rate limits. Pre-existing; to fix in a separate reviewed change.
3. Stripe webhook only reaches one endpoint per registration — staging needs its own **test-mode** endpoint.

## 5. Admin approvals required (Contributor can't do these)

- Role assignments (`AcrPull`, `Key Vault Secrets User`, deploy roles for the CI app) need **Owner / User Access Administrator** or **RBAC Administrator** on `rg-flacronai-*`.
- Creating Entra app registrations may be restricted by tenant policy. If it is, a Global/Application Administrator must create `gh-flacronai-deploy-*`.
