# FlacronAI API changelog

## 2026-08-06

- Introduced explicit API versioning. All paths are now served under the versioned base `/api/v1`. The previous unversioned base `/api` continues to work as a backward-compatible alias (identical behavior) and may be deprecated in a future release; new integrations should use `/api/v1`.
- Updated the OpenAPI definition, Postman collection, and reference examples to use the `/api/v1` base.
- Added a `request_id` field to error responses and an `X-Request-Id` response header on every request to aid support and log correlation. A client-supplied `X-Request-Id` (safe characters only, max 64) is echoed back; otherwise one is generated.
- Clarified the test-environment guidance: there is no hosted sandbox and no separate test-key type; every API key is a live credential. To test safely, run a non-production deployment with isolated Firebase, storage, AI-provider, and Stripe test-mode credentials.

## 2026-08-02

- Added immutable, least-privilege API-key scopes for report read/write/generate/export and CRM read/write access. Missing permissions return `403 API_SCOPE_REQUIRED`.

- Published the first downloadable OpenAPI 3.0 definition and Postman collection.
- Clarified that integration authentication uses `X-API-Key`; login bearer tokens are for interactive web sessions.
- Documented that idempotency keys are not currently supported. Clients must avoid automatic retries for mutating requests unless they first reconcile the operation result.
- Documented that FlacronAI does not currently provide a public sandbox. Requests target the configured deployment and can affect its real tenant data.
- Added CRM client-profile, claim-profile, and dashboard-analytics endpoints to the application.
- Added detached report-section suggestions. Suggestions do not modify stored report content until explicitly accepted and saved by a reviewer.
- Strengthened finalized-report behavior: editing approved content reopens the report as a draft and clears the prior approval.

## 2026-07-21

- Added version history, report sharing, electronic sign-off, private exports, and server-side entitlement enforcement.
- Added API-key lifecycle management for Agency and Enterprise accounts.

This changelog records application API behavior. Deployment-specific hostnames, availability, and release timing depend on the environment running the backend.
