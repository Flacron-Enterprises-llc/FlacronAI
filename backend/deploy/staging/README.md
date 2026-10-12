# FlacronAI backend — isolated QA staging (AWS EC2 + Firebase staging)

> **2026-10-12: the EC2 staging host and its EIP, security group, build bucket and log group were deleted.** QA staging now runs on Cloud Run — see `../staging-gcp/README.md`. Only `set-staging-secret.js` (AWS secret `flacronai/staging/app`, the key-entry source for `../staging-gcp/sync-secret.sh`) is still in use; the EC2 scripts are kept for reference.


Access, cost and approvals: **[ACCESS_REQUEST.md](ACCESS_REQUEST.md)**. Nothing is provisioned until
the IAM items, company Firebase billing and cost approval in that document are complete.

| File | Purpose |
|---|---|
| `deploy-staging.sh` | Idempotent provision + redeploy: security group, build bucket, log group, EC2 instance, Elastic IP, source bundle, remote deploy via SSM |
| `remote-deploy.sh` | Runs on the instance via SSM: builds the image, starts `app` + `caddy` (automatic HTTPS), health-checks |
| `boot.js` | Container entrypoint: expands the Secrets Manager JSON into env, then starts `server.js` |
| `set-staging-secret.js` | Fills `flacronai/staging/app` from hidden prompts / a key file (refuses live Stripe keys and non-staging service accounts) |
| `budget-staging.sh` | AWS Budget for tag `cost-center=flacronai-staging-qa`: alerts at $25/$50/$100 (notifications only) |
| `pause-staging.sh` | `stop` / `start` / `status`; stopped ≈ $5/month, same hostname afterwards |
| `teardown-staging.sh` | Removes all staging AWS resources (keeps secret, IAM role, budget, Firebase project) |
| `iam/*.json` | Trust/permission policies (also inlined in ACCESS_REQUEST.md) |

## Order of operations (after approvals)
1. Ibrahim: ACCESS_REQUEST §A1–A3. Rodrigue/Laiba: §B1–B4, hostname decision §C, cost approval §E.
2. `aws login --profile flacron-qa` if the session expired (interactive; browser + code).
3. Firebase (staging only): create Firestore, deploy rules/indexes (§B5).
4. `node set-staging-secret.js …` (§F).
5. `AWS_CLI="/c/Program Files/Amazon/AWSCLIV2/aws.exe" bash deploy-staging.sh` → prints the Elastic IP.
   Add the DNS A record, then `STAGING_HOST=staging-api.flacronai.com bash deploy-staging.sh`.
6. Stripe sandbox webhook → `https://<host>/api/v1/payment/webhook`, secret piped with
   `--stdin-key STRIPE_WEBHOOK_SECRET`, then redeploy.
7. `bash budget-staging.sh`.
8. Verify: `/health` 200, valid certificate, `/api/v1/billing/status` 401 without a token, then the
   authenticated flows (two disposable accounts: isolation, photo upload, generation, approval,
   export, deletion).
9. QA APK: in `mobile/eas.json` profile `qa`, replace `REPLACE_WITH_STAGING_HOST` (e.g.
   `staging-api.flacronai.com`) and `REPLACE_WITH_STAGING_FIREBASE_WEB_API_KEY`. The web API key is a
   public client identifier: `firebase apps:sdkconfig WEB 1:93799061110:web:0a1717afd30aaa5268b157
   --project flacronai-staging-qa`. Then run `cd mobile && eas build -p android --profile qa`. This
   uses one Android build from the free plan; the APK is signed by EAS with the JS bundled (no Metro).
10. Post-build checks (mandatory before handover):
    - **Build log:** the "Environment variables" section shows the `qa` profile overriding every
      `EXPO_PUBLIC_FIREBASE_*` value from the shared `preview` environment.
    - **Staging Firebase only:** install the APK, sign up a disposable account, then confirm it
      appears in staging (`firebase auth:export /tmp/u.json --project flacronai-staging-qa`, then
      delete the file) and **not** in production.
    - **No test hooks:** opening `flacronai://e2e-config?...` must have no effect, because the
      override is compiled out.

Local evidence (2026-10-11): an `expo export --no-bytecode` with the `qa` values produced a bundle
with 9× `flacronai-staging-qa` and 0× each of the production project ID/number, tunnel hosts,
test-password names and the E2E flag. The gate compiles to `isE2ERuntimeConfigEnabled(env, void 0)`,
which is always false.

## Notes
- `TRUST_PROXY_HOPS=1`: Caddy is the only proxy in front of the app.
- In-process background jobs survive normal operation, but a redeploy/restart cancels jobs in flight
  (use "Retry analysis"). Avoid deploying while testers are generating reports.
- The instance has no SSH port; use SSM (Run Command / Session Manager).
- Application containers cannot reach instance credentials (IMDSv2, hop limit 1).
