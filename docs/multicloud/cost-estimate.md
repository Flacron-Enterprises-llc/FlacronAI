# FlacronAI — Multi-cloud Cost Estimate

> Estimates from list prices I know as of 2026-10. **Verify in the Azure Pricing Calculator / IBM Cost Estimator before approving.** USD per month, 730 h. Region: Azure eastus, IBM us-east.
> Azure runs on the **Microsoft Azure Sponsorship** subscription. Spend draws down sponsorship credit, and some services/SKUs may be restricted under sponsorship offers. If credit runs out, resources are disabled, not billed to a card. Check the remaining balance at microsoftazuresponsorships.com.

## Staging (requested first)

| Cloud | Item | Config | Est. / month |
|---|---|---|---|
| Azure | Container Apps (API) | 1 vCPU / 2 Gi, **min 0**, max 2 — light QA traffic is mostly inside the monthly free grant (180k vCPU-s, 360k GiB-s, 2M requests) | $0 – 5 |
| Azure | Static Web Apps | Free tier | $0 |
| Azure | Container Registry | Basic (shared staging+prod) | ~$5 |
| Azure | Key Vault | Standard, few hundred ops | < $1 |
| Azure | Log Analytics | ~1 GB ingest, 30-day retention | $0 – 3 |
| **Azure staging total** | | | **≈ $6 – 14** |
| IBM | Code Engine (API) | 1 vCPU / 4 GB, **min 0**, max 2 — mostly within the free tier (100k vCPU-s, 200k GB-s, 100k requests) | $0 – 8 |
| IBM | Code Engine (web/nginx) | 0.25 vCPU / 0.5 GB, min 0 | $0 – 1 |
| IBM | Container Registry | namespace `flacronai`, retention 20 images (~2–4 GB) | $0 – 2 |
| **IBM staging total** | | | **≈ $0 – 11** |

Code Engine and Container Apps scale-to-zero cause a **cold start** (several seconds) on the first request after idle. That's acceptable for staging but not for production.

## Production (later, separate approval)

| Cloud | Item | Config | Est. / month |
|---|---|---|---|
| Azure | Container Apps | 1 vCPU / 2 Gi, **min 1**, max 3 (always-on active rate, after free grant) | ~$70 – 75 |
| Azure | Static Web Apps | Standard (custom domain SLA, more bandwidth) | $9 |
| Azure | ACR + Key Vault + Log Analytics | | ~$8 – 15 |
| **Azure prod total** | | | **≈ $90 – 100** |
| IBM | Code Engine API | 1 vCPU / 4 GB, **min 1**, max 3 | ~$120 – 125 |
| IBM | Code Engine web | min 1 (avoid cold start) 0.25 vCPU / 0.5 GB | ~$25 |
| IBM | ICR + optional Cloud Logs | | $2 – 30 |
| **IBM prod total** | | | **≈ $150 – 180** |

Option: IBM API at 1 vCPU / 2 GB cuts about $18. Decide after staging memory metrics (Node API likely < 500 MB).

## Not included
- Third-party usage (Anthropic, Stripe, SES, Firebase, Google Maps, Realty API): billed per call. Shared across clouds, so no increase unless traffic is split *and* added.
- Egress beyond free allowances, custom-domain certificates (managed/free on both), IBM Secrets Manager (not proposed).
