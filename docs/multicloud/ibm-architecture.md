# FlacronAI — IBM Cloud Architecture

> Status: **DISCOVERY DONE / DESIGN PROPOSED — nothing provisioned** (awaiting approval).
> Account `Flacron Enterprises LLC` (`70ccc4b0a53d41c2ad1d89152260017a`), region **us-east**. CLI user `umerali7454@gmail.com`.

## 1. Existing estate (read-only discovery, 2026-10-16)

### FlacronAI-specific resources that ALREADY exist
| Resource | Detail | Reuse? |
|---|---|---|
| Resource group **`FlacronAI`** (`4c8f03e177774e8a86d09e9281acd504`) | Empty — no service instances | **Yes** — dedicated, matches app |
| Service ID **`flacronai-deployer`** (`ServiceId-49a8f98d-…`) | Policy: Viewer, Editor, Operator, Service Configuration Reader, Key Manager on **the resource group object only** (`resourceType=resource-group`). That grants no rights over services *inside* the RG, so it can't deploy to Code Engine or push to ICR yet. | **Yes**, with added scoped policies (IAM change → approval) |
| API key `FlacronAi API` (`ApiKey-5badffe7-…`) on that service ID | Created 2026-01-04, no meaningful expiry, value unknown to us | **No** — create a fresh, rotated key stored only in a GitHub environment secret. Owner decides whether to delete the old one. |
| watsonx.ai service (`flacron-watsonx.ai`, us-south, RG `RG_FlacronBuild_PROD`) | Used by the app's text fallback (`WATSONX_*`) | External dependency only; not moved |

No Code Engine project, ICR namespace, or image for FlacronAI exists.

### Other apps — DO NOT TOUCH
Code Engine projects (all us-east): `adsgen-project`, `adsgen-project-prod`, `flacronar`, `flacronbuild`, `flacronsports`, `flacronsports-prod`, `rapid-claim-pro-project`. ICR namespaces: `ce--70ccc-25k2s47ngd35`, `flacronbuild`, `flacronsports`, `flacronsports-ns`, `rapidclaimpro`. No Secrets Manager instance. No trusted profiles.

⚠️ The CLI's current target resource group is `RG_RapidClaimPro`. All our commands must pass `-g FlacronAI` explicitly or retarget, so nothing lands in another app's RG.

## 2. Proposed design

| Concern | Choice |
|---|---|
| Backend | Code Engine app `flacronai-api` in **new** project `flacronai-staging` (later `flacronai-prod`), RG `FlacronAI` |
| Frontend | Code Engine app `flacronai-web` running an unprivileged nginx image (`nginxinc/nginx-unprivileged`, port 8080) that serves the Vite `dist/` with SPA fallback + security headers. Scale-to-zero in staging. (COS static website can't do managed TLS on a custom domain without CIS; CE gives TLS on its own domain.) |
| Registry | ICR namespace **`flacronai`** in `us.icr.io`, RG `FlacronAI`. Image tags = Git SHA. Retention policy keeps the last 20. Vulnerability Advisor scans. |
| Registry pull | Code Engine **registry access via a service ID scoped to `Reader` on namespace `flacronai`**. Use a trusted profile if CE supports it for pulls in this account (verify at provisioning). |
| Secrets | Code Engine **secrets** (`flacronai-api-secrets`), encrypted at rest, injected as env. IBM Secrets Manager isn't provisioned in the account and adds cost; defer unless required. |
| Logs/monitoring | IBM Cloud Logs + Monitoring instances are optional add-ons (cost); CE app logs are available via `ibmcloud ce app logs` meanwhile. |
| Sizing | API: 1 vCPU / 4 GB (valid CE combo), staging min 0 / max 2, prod min 1 / max 3. Web: 0.25 vCPU / 0.5 GB, min 0. |
| Health | CE readiness probe `GET /health` (port 3000). |

### Expected URLs
`https://flacronai-api.<project-subdomain>.us-east.codeengine.appdomain.cloud` and `https://flacronai-web.<project-subdomain>.us-east.codeengine.appdomain.cloud`. Custom domains need DNS at the external registrar plus a TLS cert/secret in CE.

## 3. CI/CD authentication (honest status)

IBM trusted profiles support federation through an identity provider or a compute resource. I found **no IBM-documented GitHub Actions OIDC → trusted profile flow** (2026-10-16 search). Until one is confirmed:
- GitHub Actions uses an **API key of `flacronai-deployer`**, stored only as a secret in the protected GitHub environments `ibm-staging` / `ibm-production`. Its policies are limited to: Code Engine `Writer` + `Operator` on the two FlacronAI projects only, Container Registry `Writer` on namespace `flacronai` only, `Viewer` on RG `FlacronAI`.
- Rotation: 90 days, documented in `security-matrix.md`.
- Runtime workloads get **no** IBM API key (the app doesn't call IBM APIs except watsonx through its own `WATSONX_API_KEY`).

## 4. Parity gaps

Same as Azure: CORS allow-list code change, `trust proxy`, separate Stripe test webhook for staging. CE request timeout max is 600 s (AI generation fits; ALB idle timeout on AWS is the default 60 s, so CE is more lenient).
