# FlacronAI Multi-cloud — Progress Log

> Resume here. Work happens in git worktree `E:\freelancing projects\FlacronAI-multicloud`, branch `multicloud/azure-ibm` (from `origin/main` @ `ef46186`).
> The original checkout `E:\freelancing projects\FlacronAI` (branch `flacron/improvements`) holds the owner's uncommitted local work and is stale. **Don't use it as source and don't modify it.** The owner confirmed GitHub `main` is the source of truth (2026-10-16).

## Status: Phase 1 + 2 DONE · Phase 3/4 design proposed · WAITING FOR APPROVAL (D1–D8 in deployment-plan.md)

### 2026-10-16
- Verified identities:
  - AWS `flacron-cloudadmin` → 482881544977, CloudAdminAccess (SSO; re-login: `aws sso login --profile flacron-cloudadmin`). The default profile has no creds; `btos` SSO token expired (not needed).
  - Azure → tenant 429aae01…, sub bce797d8… (Sponsorship), Contributor.
  - IBM → account 70ccc4b0…, us-east.
- AWS inventory → `aws-inventory.md` (Amplify `d3vae9bcin1ywn` + ECS `flacronai-production-cluster`; 6 findings A1–A6, not actioned).
- Azure: **no FlacronAI resources exist**. IBM: RG `FlacronAI` (empty) and service ID `flacronai-deployer` exist. No CE project or ICR namespace.
- Architecture: Azure = Container Apps + Static Web Apps + ACR + Key Vault; IBM = Code Engine (api + nginx web) + ICR.
- Docs written: all 8 files in `docs/multicloud/`.

## Next (after approval)
1. S1: Terraform (`infra/azure`, `infra/ibm`), `deploy-multicloud.yml`, app changes (CORS env, `/health` version, SWA config, web Dockerfile) → PR.
2. S2: provision staging. S3: validate. S4: merge. S5: prod plan.

## Blockers / open questions
- D1–D8 (deployment-plan.md).
- Azure role assignments need Owner/UAA (we have Contributor).
- IBM: no confirmed GitHub-OIDC federation, so the plan uses a scoped service-ID API key.
- Note: open branch `qa/android-qa-apk` mentions "Cloud Run staging" (GCP). Unrelated to this task; not inspected further.
