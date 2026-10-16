# FlacronAI — AWS Production Inventory

> Read-only discovery, 2026-10-16. Profile `flacron-cloudadmin` (SSO role `CloudAdminAccess`), account **482881544977**, region **us-east-1**.
> No AWS resource was modified. No secret values were read or recorded — names/ARNs only.
> Source of truth for code: `origin/main` @ `ef46186` (GitHub `Flacron-Enterprises-llc/FlacronAI`).

## 1. Repository ↔ AWS mapping

| Repo part | AWS service | Resource | Deploy trigger |
|---|---|---|---|
| `frontend/` (React 18 + Vite 5, **static SPA, not Next.js**) | Amplify Hosting (platform `WEB`, static) | app `FlacronAI` / `d3vae9bcin1ywn`, branch `main` (PRODUCTION) | Amplify Git auto-build on push to `main` |
| `backend/` (Node 24 / Express, `backend/Dockerfile`) | ECS Fargate behind ALB | cluster `flacronai-production-cluster`, service `flacronai-backend-service` | GitHub Actions `.github/workflows/deploy-backend.yml` on push to `main` (`backend/**`) |
| `mobile/` (Expo) | not on AWS | — | — |

## 2. Frontend — Amplify

- App `d3vae9bcin1ywn`, default domain `d3vae9bcin1ywn.amplifyapp.com`, monorepo `appRoot: frontend`.
- buildSpec: `npm ci --cache .npm --prefer-offline` → `npm run build` → artifacts `dist/**`.
- Custom domain `flacronai.com` (apex + `www`) → branch `main`; rewrite `https://www.flacronai.com → https://flacronai.com` (301) + SPA fallback to `/index.html`.
- Served via CloudFront (`www` CNAME → `d34baby8kprjit.cloudfront.net`, Amplify-managed).
- App-level env var **names** (build-time, baked into the bundle): `VITE_API_URL`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_MEASUREMENT_ID`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_GOOGLE_MAPS_BROWSER_KEY`, plus `AMPLIFY_DIFF_DEPLOY`, `AMPLIFY_MONOREPO_APP_ROOT`.
- Code also reads `VITE_ADMIN_EMAIL` — **not set in Amplify** (client-side admin UI gate falls back to its default).
- No Amplify service role. Last 5 jobs all `SUCCEED`; latest job 42 built `ef46186` (= current `origin/main`).

## 3. Backend — ECS Fargate

| Item | Value |
|---|---|
| Cluster / service | `flacronai-production-cluster` / `flacronai-backend-service` — ACTIVE, desired 1, running 1 |
| Task definition | `flacronai-backend:5` — 1 vCPU / 3 GB, X86_64 Linux, Fargate |
| Running image | `flacronai-backend:1e12d78…` (latest backend-touching commit on main; `ef46186` was frontend-only) |
| Deployment | ROLLING 100%/200%, circuit breaker **enabled with rollback** |
| Networking | public subnets `subnet-02f0a49b7d0c9612d`, `subnet-01e2d9c6e0226a3a4`, `assignPublicIp: ENABLED`, VPC `vpc-03ddb1ac3f7859bea` |
| Task SG | `sg-05232602c52a5dd3c` (`flacronai-backend-sg`) — ingress TCP 3000 **only from ALB SG** `sg-00316d1c6746a3812` ✅ |
| Exec role | `service-role/ecsTaskExecutionRole` (shared); **no task role** |
| Container health check | none |
| Logs | CloudWatch `/ecs/flacronai-backend` — **retention: never expire** |
| Alarms | none (`flacronai*` prefix) |

### Runtime configuration (names only)
- `environment` (plaintext in the task definition): `NODE_ENV, PORT, FRONTEND_URL, ADMIN_EMAIL, JWT_SECRET, FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL, FIREBASE_CLIENT_ID, FIREBASE_STORAGE_BUCKET, ANTHROPIC_API_KEY, ANTHROPIC_MODEL, OPENAI_API_KEY, GEMINI_API_KEY, WATSONX_API_KEY, WATSONX_URL, WATSONX_MODEL, WATSONX_PROJECT_ID, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_{PROFESSIONAL,AGENCY,ENTERPRISE}[_ANNUAL], AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, SES_FROM_EMAIL, SES_FROM_NAME, SES_REPLY_TO, PROPERTY_INTELLIGENCE_ENABLED, REALTY_API_BASE_URL`
- `secrets` (Secrets Manager refs): `GOOGLE_MAPS_SERVER_KEY` ← `flacronai/production/google-maps-server-key`, `REALTY_API_KEY` ← `flacronai/production/realty-api-key`
- Other Secrets Manager entries: `flacronai/staging/app` (not referenced by prod). No SSM parameters.
- Used by code but **not set** in the task def: `FIREBASE_API_KEY` (needed by `/api/auth/login`, MFA verify, account deletion), `STRIPE_PRICE_PHOTOS_*` (photo add-on checkout), plus optional tuning vars.

### Load balancer / TLS / DNS
- ALB `flacronai-alb` (internet-facing), DNS `flacronai-alb-583452263.us-east-1.elb.amazonaws.com`.
- Listener 443 HTTPS, policy `ELBSecurityPolicy-TLS13-1-2-Res-PQ-2025-09`, ACM cert `api.flacronai.com` (ISSUED). Listener 80 → redirect HTTPS.
- Target group `flacronai-backend-tg`: HTTP health check path **`/`** (not `/health`), matcher 200, 30s. Target state: healthy.
- **DNS is NOT in Route 53.** `flacronai.com` NS = `ns1/ns2.dns-parking.com` (external registrar DNS). `api.flacronai.com` CNAME → ALB. Any new hostname must be added at the registrar by whoever controls it.
- Live check 2026-10-16: `https://api.flacronai.com/health` → 200 `{"status":"healthy","environment":"production"}`; `https://flacronai.com/` → 200.

### Registry
- ECR `flacronai-backend` — scan-on-push **on**, tag mutability **MUTABLE** (workflow also pushes `:latest`), AES256.

## 4. CI/CD — GitHub Actions → AWS

- Workflow `deploy-backend.yml`: push to `main` (paths `backend/**`) → OIDC assume `FlacronAI-GitHubActions-DeployRole` → build `linux/amd64` → push `:<sha>` + `:latest` → `aws ecs update-service --force-new-deployment` → `wait services-stable` → Slack notifications.
- OIDC role trust: `token.actions.githubusercontent.com`, `aud=sts.amazonaws.com`, `sub=repo:Flacron-Enterprises-llc/FlacronAI:ref:refs/heads/main` (duplicated entry, harmless). Inline policies `FlacronAI-ECR-Push`, `FlacronAI-ECS-Update-Policy`. ✅ no long-lived keys.
- Repo variables: `AWS_ACCOUNT_ID`, `AWS_REGION`, `AWS_ROLE_ARN`, `ECR_REPOSITORY`; secret `SLACK_WEBHOOK_URL`. Environment: `qa-android` only. **`main` has no branch protection.**
- `backend-pr-validation.yml` (PRs only): npm ci, audit, lint, full test suite, Docker build, in-container `/health`. **It does not gate the deploy** — a push straight to `main` deploys without tests.
- Recent `deploy-backend` runs: all success (latest 2026-09-25, PR #28).

## 5. Findings / risks in the existing AWS setup (NOT changed — recorded for the owner)

| # | Severity | Finding | Recommendation |
|---|---|---|---|
| A1 | **High** | Workflow's `--force-new-deployment` re-uses the task definition, which **pins an image SHA** (`:5` → `1e12d78`). Task defs `:3`–`:5` were registered by hand. A new backend push builds+pushes an image but ECS keeps running the old pinned SHA unless someone registers a new revision. | Render a new task-def revision with `aws-actions/amazon-ecs-render-task-definition` + `amazon-ecs-deploy-task-definition` in the workflow. |
| A2 | **High** | Secrets (Stripe secret + webhook secret, Firebase private key, JWT secret, AWS access keys, AI keys) are plaintext `environment` entries in the task definition (visible to anyone with `ecs:DescribeTaskDefinition`). | Move to Secrets Manager `secrets` refs (pattern already used for 2 keys). |
| A3 | Med | Container uses static `AWS_ACCESS_KEY_ID/SECRET` (for SES) instead of a task role. | Add a task role with `ses:SendEmail` scoped to the identity; drop the keys. |
| A4 | Med | Tests don't gate deploys; `main` unprotected. | Branch protection + required checks. |
| A5 | Low | TG health check `/`, no container health check, log retention infinite, no alarms. | `/health`, 30–90 day retention, 5xx/unhealthy-host alarms. |
| A6 | Low | ECR tags mutable + `:latest` pushed. | Immutable tags. |

These are outside this task's mandate (AWS must not be modified). They're listed so the owner can approve them separately.
