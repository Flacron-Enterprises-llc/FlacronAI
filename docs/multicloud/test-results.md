# FlacronAI — Multi-cloud Test Results

> Evidence log. Nothing is "production-ready" until every row has evidence.

## Baseline (AWS production, read-only, 2026-10-16)

| Check | Result | Evidence |
|---|---|---|
| `GET https://api.flacronai.com/health` | ✅ 200 | `{"status":"healthy","environment":"production"}` |
| `GET https://flacronai.com/` | ✅ 200 | curl |
| ECS service | ✅ 1/1 running, rollout COMPLETED, TG target healthy | `describe-services`, `describe-target-health` |
| Amplify `main` | ✅ last job SUCCEED on `ef46186` (= origin/main) | `list-jobs` |
| Backend image vs main | ✅ `1e12d78` = last backend-touching commit | task def `:5` |

## Azure staging — not deployed yet
## IBM staging — not deployed yet

| Area | Azure | IBM |
|---|---|---|
| Frontend renders | pending | pending |
| `/health` + version == SHA | pending | pending |
| Auth (Firebase login, MFA) | pending | pending |
| Firestore read/write | pending | pending |
| Storage upload/download | pending | pending |
| Report generation (Claude/watsonx) | pending | pending |
| Stripe test checkout + test webhook | pending | pending |
| Email behaviour | pending | pending |
| TLS (cert, HTTPS-only) | pending | pending |
| Identity permissions (negative tests) | pending | pending |
| Logs visible | pending | pending |
| CI: failed test blocks deploy | pending | pending |
| Rollback to previous SHA | pending | pending |
| AWS unaffected after deploys | pending | pending |
