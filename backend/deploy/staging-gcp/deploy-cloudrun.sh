#!/usr/bin/env bash
# Deploys the QA staging backend to Cloud Run in the ISOLATED staging project.
# Never touches production (AWS ECS / Firebase flacronai-c8dab). Usage, from the repo root:
#   bash backend/deploy/staging-gcp/deploy-cloudrun.sh
# Prereqs (one-time, see README.md): APIs enabled, runtime service account, secret
# `backend-env` holding the dotenv built by build-env.js.
set -euo pipefail
GCLOUD="${GCLOUD:-gcloud}"
PROJECT="flacronai-staging-qa"; REGION="us-central1"; SERVICE="flacronai-staging-api"
RUNTIME_SA="staging-api@${PROJECT}.iam.gserviceaccount.com"
ANTHROPIC_MODEL="${ANTHROPIC_MODEL:-claude-opus-4-8}"
# Flacron Enterprises LLC Default workspace (public ID). Needed because the staging key is a
# personal key not scoped to a workspace; see backend/config/anthropic.js.
ANTHROPIC_WORKSPACE_ID="${ANTHROPIC_WORKSPACE_ID:-wrkspc_01D4FayqjbuFp69h9229gA8x}"
# Stripe SANDBOX (test-mode) price IDs — public identifiers, FlacronAI products tagged
# app_id=flacronai. Amounts match frontend/src/data/plans.js + backend/config/tiers.js
# (Professional $39.99/mo, Agency $99.99/mo). Annual + Enterprise intentionally unset on staging.
STRIPE_PRICES="STRIPE_PRICE_PROFESSIONAL=price_1UPcOyKFLhrvSzkg7dPnG7Xj,STRIPE_PRICE_AGENCY=price_1UPcP0KFLhrvSzkg6A4SrFRM"
STRIPE_PRICES="$STRIPE_PRICES,STRIPE_PRICE_PHOTOS_25_TEST=price_1UIUkOKFLhrvSzkg9I0WIWon,STRIPE_PRICE_PHOTOS_50_TEST=price_1UIV9bKFLhrvSzkgVDMHa5mS"
STRIPE_PRICES="$STRIPE_PRICES,STRIPE_PRICE_PHOTOS_100_TEST=price_1UIVCHKFLhrvSzkgYqxn3oMW,STRIPE_PRICE_PHOTOS_250_TEST=price_1UIVEGKFLhrvSzkgdFMg3Vsv"
REPO_ROOT="$(git rev-parse --show-toplevel)"

# Hard guard: refuse to run against any other project.
[ "$PROJECT" = "flacronai-staging-qa" ] || { echo "refusing: not the staging project" >&2; exit 1; }

# Cost guards: scale to zero when idle, at most ONE instance (bounds worst-case spend and
# keeps in-process timers/leases single-owner). CPU stays allocated between requests
# (instance-based billing) because report AI pipelines run in the background after the
# HTTP response; with request-based billing that work would be CPU-throttled.
"$GCLOUD" run deploy "$SERVICE" \
  --project "$PROJECT" --region "$REGION" \
  --source "$REPO_ROOT/backend" \
  --service-account "$RUNTIME_SA" \
  --allow-unauthenticated \
  --no-cpu-throttling --cpu 1 --memory 2Gi \
  --min-instances 0 --max-instances 1 --concurrency 40 --timeout 600 \
  --set-secrets "/secrets/app.env=backend-env:latest" \
  --command node --args="--env-file=/secrets/app.env,server.js" \
  --set-env-vars "NODE_ENV=production,TRUST_PROXY_HOPS=1,FRONTEND_URL=https://flacronai.com,PUSH_NOTIFICATIONS_ENABLED=false,STORE_BILLING_ACCEPT_SANDBOX=true,ANTHROPIC_MODEL=${ANTHROPIC_MODEL},ANTHROPIC_WORKSPACE_ID=${ANTHROPIC_WORKSPACE_ID},${STRIPE_PRICES}${EXTRA_ENV:+,$EXTRA_ENV}" \
  --labels "env=staging,app=flacronai" \
  --quiet

URL="$("$GCLOUD" run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format='value(status.url)' | tr -d '\r')"
echo "deployed: $URL"
curl -fsS "$URL/health" && echo
