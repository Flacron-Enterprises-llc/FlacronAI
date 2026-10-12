#!/usr/bin/env bash
# Marks a QA tester's STAGING account as email-verified. Staging has no email provider (SES is
# not configured there), so verification / password-reset emails are skipped. Run after the
# tester has signed up in the QA app:
#   bash backend/deploy/staging-gcp/verify-tester.sh tester@example.com
# Requires gcloud logged in as an owner of flacronai-staging-qa. Staging project only.
set -euo pipefail
GCLOUD="${GCLOUD:-gcloud}"; PROJECT="flacronai-staging-qa"
EMAIL="${1:?usage: verify-tester.sh <email>}"
TOKEN="$("$GCLOUD" auth print-access-token | tr -d '\r')"
API="https://identitytoolkit.googleapis.com/v1/projects/$PROJECT"
H=(-H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $PROJECT" -H "Content-Type: application/json")
UID_="$(curl -fsS "${H[@]}" "$API/accounts:lookup" -d "{\"email\":[\"$EMAIL\"]}" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const u=(JSON.parse(s).users||[])[0];process.stdout.write(u?u.localId:"")})')"
[ -n "$UID_" ] || { echo "no staging account for $EMAIL (sign up in the QA app first)" >&2; exit 1; }
curl -fsS "${H[@]}" "$API/accounts:update" -d "{\"localId\":\"$UID_\",\"emailVerified\":true}" > /dev/null
echo "verified $EMAIL on $PROJECT"
