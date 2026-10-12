#!/usr/bin/env bash
# Copies the AWS staging secret (flacronai/staging/app) into Secret Manager `backend-env`
# WITHOUT printing values, redeploys Cloud Run, then destroys older versions so exactly one
# stays active (free tier). Run from the repo root after updating a key with
# backend/deploy/staging/set-staging-secret.js:
#   bash backend/deploy/staging-gcp/sync-secret.sh
# OMIT=KEY,KEY     leave these keys out (e.g. OMIT=ANTHROPIC_API_KEY while that key is unusable)
set -euo pipefail
export MSYS_NO_PATHCONV=1
GCLOUD="${GCLOUD:-gcloud}"; PROJECT="flacronai-staging-qa"; SECRET="backend-env"
HERE="$(cd "$(dirname "$0")" && pwd)"
command -v cygpath > /dev/null && HERE_NODE="$(cygpath -w "$HERE")" || HERE_NODE="$HERE"

aws secretsmanager get-secret-value --profile "${AWS_PROFILE_NAME:-flacron-qa}" --region us-east-1 \
  --secret-id flacronai/staging/app --query SecretString --output text \
| OMIT="${OMIT:-}" node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);for(const k of (process.env.OMIT||"").split(",").filter(Boolean))delete o[k];process.stdout.write(JSON.stringify(o))})' \
| ALLOW_MISSING="${OMIT:-}" node "$HERE_NODE/build-env.js" \
| "$GCLOUD" secrets versions add "$SECRET" --project "$PROJECT" --data-file=- --format='value(name)' > /dev/null

NEW="$("$GCLOUD" secrets versions list "$SECRET" --project "$PROJECT" --filter='state=enabled' --sort-by='~createTime' --limit 1 --format='value(name)' | tr -d '\r')"
echo "added $SECRET version $NEW; redeploying"
GCLOUD="$GCLOUD" bash "$HERE/deploy-cloudrun.sh"

for v in $("$GCLOUD" secrets versions list "$SECRET" --project "$PROJECT" --filter='state=enabled' --format='value(name)' | tr -d '\r'); do
  [ "$v" = "$NEW" ] || { "$GCLOUD" secrets versions destroy "$v" --secret "$SECRET" --project "$PROJECT" --quiet > /dev/null; echo "destroyed old version $v"; }
done
