# FlacronAI Web-to-Mobile Reuse Strategy

> **Status: documentation only.** This file establishes what the FlacronAI mobile app
> should reuse from the existing web/backend system and what must be built natively for
> React Native. **No implementation described here has started.** Phase 2 and every later
> phase in [`MOBILE_DEVELOPMENT_PHASES.md`](./MOBILE_DEVELOPMENT_PHASES.md) remain **not
> started**. Nothing in this document authorizes any code change, dependency change,
> config change, API change, or platform-account action.
>
> **Every future mobile phase must read this file before implementation begins.** If a
> phase's plan conflicts with a classification or risk noted here, resolve the conflict in
> this file first (updating it if the underlying code has changed), not by improvising in
> the phase itself.

---

## 1. Framing

FlacronAI mobile is a **native companion to the existing product** — not an unrelated
product, not a from-scratch rewrite, and not a separate business. Concretely:

- Mobile and web share the **same** Firebase project, the **same** Firestore data model
  and collections, the **same** backend (Node/Express on AWS ECR/ECS), the **same** user
  accounts, the **same** subscription tiers and entitlement rules, and the **same**
  business rules for report generation, review, and finalization.
- Platform-independent logic (entitlement checks, report state machine, AI-caution
  language rules, validation rules that mirror server behavior) should be **reused through
  the existing API**, not reimplemented client-side with independent judgment calls.
- Web-only UI/browser code (React DOM, Tailwind, `react-router-dom`, `localStorage`,
  `<input type="file">`/drag-and-drop, `signInWithPopup`, `<iframe>` PDF preview, `<a
  download>`) must **not** be copied into React Native — see §4.
- The existing web frontend and backend remain **unaffected** by mobile work. Any backend
  change mobile eventually needs (push device-token storage, IAP receipt validation, etc.)
  is **additive only**, independently reviewed, and requires explicit approval before it
  touches `backend/` at all — see §5.

This document does not decide ambiguous product scope. Where scope is genuinely
undecided, it is marked **"Requires client decision"** in the matrices below, not resolved
by assumption.

---

## 2. Evidence-based reuse matrix

Every row below is grounded in the current codebase (file/module cited). Classifications
used:

- **Reuse through existing API** — mobile calls the same backend endpoint(s) web already
  uses; no new backend work.
- **Adapt for React Native** — the underlying rule/contract is reused, but the client-side
  implementation must be rewritten in RN idioms (not copy-pasted JSX/DOM).
- **Share only contract/type/constant** — only the shape of data (status enums, tier
  names, error codes) is shared; UI and flow are independently built.
- **Rebuild as native UI** — web UI concept is reused conceptually; screen must be built
  from scratch as native components.
- **Backend addition required later** — no backend capability exists yet; mobile cannot
  reuse something that isn't there. Requires a separate, explicitly approved backend task.
- **Web-only / not applicable to mobile** — this concern doesn't exist for a native app
  (e.g., browser CORS) or is explicitly out of scope.
- **Requires client decision** — scope is genuinely ambiguous; do not assume.

### 2.1 User accounts, identity, and authentication

| Functional area | Current source | Current responsibility | Classification | Reuse approach | Mobile destination | Required adaptation | Risks / dependencies | Phase |
|---|---|---|---|---|---|---|---|---|
| Auth contract & envelope | `backend/routes/auth.js` (register 106-163, login 166-221, verify 417-429, logout 432-450, refresh 453-468) mounted at both `/api` and `/api/v1` (`server.js:169,189-194`) | Register/login/logout/refresh, returns `{token,user}` or `{success:false,error,code}` | **Corrected 2026-09-08** (was: "Reuse through existing API — Call `/api/v1/auth/*` directly"). A dedicated Phase 3 audit (see [`AUTHENTICATION_ARCHITECTURE.md`](./AUTHENTICATION_ARCHITECTURE.md)) found, via repo-wide grep, that the web app's own login/signup/logout/password-change UI **never calls** `POST /auth/login`, `/auth/register`, `/auth/logout`, or `/auth/change-password` — it authenticates directly via the Firebase Client SDK instead. These endpoints exist and work, but are **not** proven by any current real client. **Recommended reuse approach is now: mirror the web app's actual Firebase-SDK pattern** (Firebase Client SDK for identity, backend REST only for profile/MFA/audit endpoints that web *does* use) — see that document §4 for the full comparison and rationale. This is a recommendation pending approval, not yet decided. | `mobile/src/services/api/auth.ts` (now expected to be a thin wrapper around Firebase Auth + the specific backend endpoints web actually uses, not a client for `/auth/login`+`/auth/register`) | None to the contract itself; RN client persists the Firebase session via RN persistence, not the custom JWT this row previously assumed as primary — see `AUTHENTICATION_ARCHITECTURE.md` §6 | Backend mints a **custom JWT** on register (auth.js:148) but a **Firebase idToken** on non-MFA login (auth.js:209) — a real inconsistency in the unused REST path, one more reason mobile should not build primarily on it; full detail and a specific recommendation now exist in `AUTHENTICATION_ARCHITECTURE.md`, resolving what this row previously left as an open question | Phase 3 |
| Token storage | Web: Firebase SDK's own persistence + a `localStorage` fallback in `frontend/src/services/api.js:31-33,65` (confirmed dormant/legacy — no code path sets that key) | Session persistence across reloads | Adapt for React Native | **Refined 2026-09-08**: mirror web's actual pattern — the Firebase session itself is persisted by the Firebase SDK's own React Native persistence (`AsyncStorage`-backed, per Firebase's documented RN pattern), not manually by the app. `expo-secure-store` is reserved for anything the app itself needs to cache beyond Firebase's managed session (ideally nothing) — see `AUTHENTICATION_ARCHITECTURE.md` §6 for the full storage table and the accepted AsyncStorage trade-off | Firebase SDK's RN persistence (`AsyncStorage`-backed) for the session; `expo-secure-store` only for any app-managed extra, never a manual duplicate of the Firebase session token | `localStorage` does not exist in RN; the dormant web fallback should not be ported at all (not even as a "fallback" — it has no populating code path on web either) | Web-only pattern; do not port `localStorage` reads/writes | Phase 3 |
| Session/token revocation | `backend/middleware/auth.js:75-176` — `tokenVersion` check on custom JWT, `TOKEN_REVOKED` (118)/`INVALID_TOKEN` (144)/`AUTH_VERIFY_UNAVAILABLE` (142, 503) | Immediate logout-everywhere on password change/logout | Reuse through existing API | Client must branch on these exact codes: `TOKEN_REVOKED` → force re-login, `AUTH_VERIFY_UNAVAILABLE` → transient-retry, never a silent retry loop | `mobile/src/services/api-client.ts` interceptor | None to backend; RN client must implement the same three-way branch web already does | Getting this wrong causes either premature logout (503 misread as 401) or a stuck session | Phase 3/4 |
| Email verification | `POST /auth/send-verification` (auth.js:489-526) | Sends verification email with a **web** dashboard continue-URL | Adapt for React Native | Reuse the send endpoint; the continue-URL behavior needs a mobile decision | New deep-link handler | Backend's verification link currently points at web (open question §10 item 7 in phase tracker) — do not assume it "just works" for a mobile deep link without that decision | Verification completing in a mobile browser vs. returning to app is unresolved | Phase 3 |
| Forgot / reset password | `POST /auth/forgot-password` (auth.js:471-486) | Always-200 response (anti-enumeration) | Reuse through existing API | Same endpoint, native form | `mobile/src/features/auth/*` | None | None beyond standard UX (native email-app hand-off) | Phase 3 |
| MFA / TOTP + recovery codes | `auth.js:226-398` — `/mfa/login-verify`, `/mfa/setup`, `/mfa/verify-setup`, `/mfa/disable`, `/mfa/status`, `/mfa/verify` | Full TOTP challenge/enroll/disable flow, `mfaRequired` gate on login | **Corrected 2026-09-08**: Reuse through existing API, but **not all of the listed endpoints equally** — web's actual MFA gate uses `/mfa/setup`, `/mfa/verify-setup`, `/mfa/disable`, `/mfa/status`, and `/mfa/verify` (a post-Firebase-login gate). `/mfa/login-verify` (the pre-session `mfaRequired`/`mfaToken` challenge) is **not called by web at all** and should likewise not be mobile's primary MFA path — see `AUTHENTICATION_ARCHITECTURE.md` §1/§4/§5.11 | `mobile/src/features/auth/mfa/*` | QR code rendering needs a native/RN library (not the web `qrcode` package's DOM output) | MFA parity for v1 is an open question (§10.3 in phase tracker) — could be deferred as a documented v1 limitation | Phase 3 (or deferred — client decision) |
| Google social login | Web: `signInWithPopup` (`AuthContext.jsx:162-165`) — **browser-only API, does not exist in RN** | Google OAuth via popup | Rebuild as native UI | Contract is the same (Firebase idToken reaches backend the same way via `/auth/verify`), but the client mechanism is entirely different | Native Google Sign-In (`expo-auth-session` or equivalent) | `signInWithPopup` must **not** be ported; this is the clearest "web-only, do not copy" case in the whole auth surface | If Apple Sign-In ships, Apple requires it be offered alongside any third-party social login (App Store policy) | Phase 3 |
| Self-service account deletion | `DELETE /users/account` (`backend/routes/users.js:703`, password re-check) | Delete own account | Reuse through existing API | Same endpoint | `mobile/src/features/settings/*` | None to backend; RN needs a native password re-entry modal | Backend requires `FIREBASE_API_KEY` set for the password re-check to work at all (per root `CLAUDE.md` §5 security notes) — a prod-readiness dependency, not a mobile-code risk | Phase 8 |
| Admin identity model | `backend/routes/sales.js:137-142` — `req.user.email !== process.env.ADMIN_EMAIL`; also hardcoded in `backend/firestore.rules:15` | Single-admin-email model, not RBAC | Web-only / not applicable to mobile | Admin panel is explicitly out of scope for the mobile app (no mobile admin surface planned) | N/A | N/A | If a mobile admin surface is ever requested, it inherits the same single-admin limitation as web — flag as a client decision, not solved here | N/A |

### 2.2 Firebase project, data model, and API contract

| Functional area | Current source | Current responsibility | Classification | Reuse approach | Mobile destination | Required adaptation | Risks / dependencies | Phase |
|---|---|---|---|---|---|---|---|---|
| Firebase project | Single project backing both `frontend/src/config/firebase.js` and (per `mobile/MOBILE_DEVELOPMENT_PHASES.md` §2 identifiers) the same EAS/Firebase org | Identity provider + Firestore + Storage backing | Reuse unchanged | Register iOS/Android "apps" on the **same** existing Firebase project (additive; does not touch web's app registration) | Firebase console config for mobile | Mobile needs its own `google-services.json` / `GoogleService-Info.plist` — git-ignored per `mobile/.gitignore`, never committed as a placeholder | Requires Firebase console access; must not create a second/parallel Firebase project | Phase 3 |
| Firestore collections | `backend/firestore.rules` — `users`, `reports`, `apiKeys`, `apiUsage`, `crmClients`, `crmAppointments`, `crmClaims`, `salesLeads`, `enterpriseClients` (rules:27-82) | Data model + access rules | Reuse unchanged | Mobile never talks to Firestore directly for anything backend-mediated — it goes through the same REST API web uses | N/A (API-mediated) | None — see §5, mobile must not duplicate authorization decisions client-side | `notifications` collection has **no** firestore.rules entry (written/read only via backend Admin SDK) — confirms notifications must stay API-mediated, not read directly from a mobile Firestore client SDK | N/A |
| API base path | `backend/server.js:169,189-194` — `/api` (legacy) and `/api/v1` mounted on identical routers | Versioned contract | Reuse through existing API | Mobile must exclusively target `/api/v1/*`, per `mobile/MOBILE_DEVELOPMENT_PHASES.md` Phase 4 scope, matching this repo's own prior incident (a fabricated `api.flacronai.com` domain had to be removed — see root `PROGRESS.md` 2026-08-01/08-12 entries) | `mobile/src/services/api/*` | **Real production API base URL is still unconfirmed** — do not invent one; this is the #1 blocking open question (phase tracker §10.1). **Updated 2026-09-08 (Phase 2 audit):** confirmed empirically, not just by absence of evidence, that `https://flacronai.com` is NOT this origin — three safe, unauthenticated GETs (`/api/v1`, `/api/`, `/health`) all returned Vercel's static SPA `index.html` (`text/html`), never backend JSON. `frontend/vercel.json` has no `/api` rewrite rule, confirming there is no same-origin reverse proxy on the frontend host. No ALB DNS name, custom domain, or ECS task definition is committed anywhere in the repository | Guessing a URL would repeat a documented past Golden Rule #1 violation | Phase 2/4 |
| Error response envelope | `backend/server.js` global handler (`success:false, error, code, request_id` — e.g. lines 58-59, 212-223) | Uniform error shape across all routes | Share only contract/type/constant | Define a shared TypeScript response type in mobile matching this exact shape | `mobile/src/types/api.ts` | None — this is already a stable, versioned-feeling contract | Do not invent new error codes; if a code is undocumented, treat it as unknown/generic, don't guess its meaning | Phase 4 |
| Rate limiting | `server.js:52-70` global 1000/15min; `authLimiter`/`mfaLimiter` in `auth.js:64-71,97-103` | Abuse protection | Reuse unchanged | Mobile clients hit the same limits as web — no special mobile allowance exists | N/A | Client should implement backoff/retry-aware UX for `RATE_LIMITED` (429) | A single mobile user generating many requests (e.g. aggressive photo-upload retries) counts against the same bucket as web | Phase 4 |

### 2.3 Entitlements, tiers, and roles

| Functional area | Current source | Current responsibility | Classification | Reuse approach | Mobile destination | Required adaptation | Risks / dependencies | Phase |
|---|---|---|---|---|---|---|---|---|
| Tier definitions | `backend/config/tiers.js:1-58` — `starter/professional/agency/enterprise`, `TIER_ORDER`, `getBaseTier`, `canGenerate`, `isAtLeastTier` | Single source of truth for what each tier includes | Share only contract/type/constant | Mirror the tier **names** and **feature flags** as a read-only TypeScript constant for UI display only; never let the client decide access | `mobile/src/types/tiers.ts` (display-only mirror) | Mobile must call the server for the authoritative decision on every gated action — a locally mirrored constant is for showing/hiding UI affordances only, never for enforcement | If tiers.js changes (new tier, renamed flag), the mobile mirror silently drifts — see §5 for the process to avoid this | Phase 4 |
| Entitlement enforcement | `backend/middleware/auth.js:278-294` (`requireTier`), enforced server-side on every gated route (`crm.js:8`, `teams.js:20`, `whitelabel.js:11`) | Server-side gate, non-bypassable | Reuse through existing API | Mobile must never locally decide "user is Agency, show CRM" as a security boundary — only as a UX hint backed by a real 403 `INSUFFICIENT_TIER` from the server | All gated features | None to backend | This is Golden Rule #4 from root `CLAUDE.md` — applies identically to mobile | All phases touching gated features |
| Org roles | `backend/utils/orgRoles.js` — owner/admin/manager + assignable adjuster/inspector/reviewer/viewer (legacy `editor` noted) | Team permission matrix | Share only contract/type/constant | Mirror role names for display; permission decisions stay server-side | `mobile/src/types/roles.ts` | None | Teams/enterprise mobile scope is itself an open client decision (see §3 feature-parity map) | Requires client decision on whether teams ships in mobile v1 at all |

### 2.4 Reports: generation, review, approval, collaboration

| Functional area | Current source | Current responsibility | Classification | Reuse approach | Mobile destination | Required adaptation | Risks / dependencies | Phase |
|---|---|---|---|---|---|---|---|---|
| Report generation | `POST /reports/generate` (`reports.js:599`), multipart photos+docs, async AI pipeline | Create a report from wizard data + photos | Reuse through existing API | Same endpoint; multipart body assembled natively | `mobile/src/features/reports/generate/*` | Multipart construction in RN uses `FormData` with `{uri,name,type}` file objects from `expo-image-picker`/`expo-camera`, not a DOM `File` object | Upload reliability on cellular networks is a real native concern (retry/backoff), distinct from web's LAN-biased assumptions | Phase 5 |
| Immediate photo staging | `POST /reports/photos/stage`, `GET /photos/stage/:draftId` (`reports.js:468,534`) | Upload-as-you-go during the wizard (already a pattern web itself moved to per root `PROGRESS.md` 2026-08-20 entry) | Reuse through existing API | Same staging endpoints, same "X / 100" pattern | `mobile/src/features/reports/photos/*` | None to contract | Matches native UX well already (mobile networks benefit even more from incremental upload than web did) | Phase 5 |
| AI image analysis | `backend/services/aiService.js` `analyzeImages` (2489-2543), `CLAUDE_IMAGE_TYPES = {jpeg,png,gif,webp}` (line 19), batch size 10, `MAX_PHOTOS=100` (`reports.js:125`) | Claude-vision analysis with cautious-language framing | Reuse through existing API | Server does all AI work; mobile never calls Anthropic/watsonx directly | N/A (server-mediated) | Mobile must ensure captured photos are one of the 4 supported formats before upload (HEIC/HEIF from iOS camera must be converted or will be silently skipped server-side) | **Real risk**: iOS default capture format is HEIC — if mobile uploads HEIC as-is, analysis silently degrades exactly like unsupported formats already do on web (per root `CLAUDE.md` known-issues) | Phase 5 |
| AI cautious-language rule | `aiService.js:119` (verbatim: *"Use cautious, observational language... Never state conclusions as established fact."*) | Golden Rule #2 enforcement | Reuse unchanged | This is a **server-side prompt rule** — mobile does not need to (and must not) re-implement or restate AI caution logic client-side; it only needs to render whatever cautious text the server returns | N/A (server-mediated) | None | Do not write a second, independent "cautious language" implementation on the client — see §5 | N/A |
| Review / approval / finalization | `PUT /reports/:id` (edit, reopens finalized→draft on content change, `reports.js:1763-1771`), `POST /:id/approve` (1811, requires signature+`confirmReview`), `isReviewed()` (2700-2701) | Human-in-the-loop sign-off gate (Golden Rule #3) | Reuse through existing API | Same state machine and same endpoints; native form for the signature fields | `mobile/src/features/reports/review/*` | None to contract | Do not let mobile mark a report reviewed/finalized through any path other than this endpoint | Phase 5 |
| Comments & replies | `reports.js:2585-2696` — threaded comments (`parentId`), resolve/reopen, plus public guest variant on share links | Collaboration on a report | Reuse through existing API | Same endpoints | `mobile/src/features/reports/comments/*` | Native comment UI (list + reply composer) — the web `CommentsPanel.jsx` component itself is not portable (React DOM), but the underlying comment thread contract is | Comments/replies parity for mobile v1 is not explicitly requested by the client yet — flag in feature-parity map | Phase 5 (or deferred) |
| Version history | `reports.js:2016` (`GET /:id/versions`), `recordVersion()` helper (216-228) | Audit trail of report edits | Reuse through existing API | Same endpoint, read-only list view | `mobile/src/features/reports/history/*` | None | Lower priority than core generate/review/approve/export loop — candidate for v1 deferral | Deferred candidate |
| Templates | Two systems: simple field-snapshot templates (`reports.js:391-456`) and a richer template-builder (`templateService`, used at generate-time `reports.js:930-964`) | Reusable report starting points | Requires client decision | The simple version (list/save/delete a field snapshot) is a small, reusable API surface; the richer template-builder's *creation/editing* UI is a large web feature not yet scoped for mobile | `mobile/src/features/reports/templates/*` (read/apply only, if in scope) | Template **creation/editing** likely stays web-only for v1 (large form-builder-like surface); template **application** during generation is a much smaller lift | Do not assume template authoring ships on mobile v1 — explicitly flagged in feature-parity map | Requires client decision |
| Export (PDF/DOCX/HTML) | `POST /:id/export` (4290), `properPdfGenerator.js`/`documentGenerator.js` (buffer-based, no disk I/O), draft watermark logic (`properPdfGenerator.js:230-243`) | Render final documents | Reuse through existing API | Server renders; mobile receives bytes | `mobile/src/features/reports/export/*` | Web's "Reviewing Adjuster Sign-Off" / DRAFT watermark language is server-generated — mobile does not reimplement it, just displays/shares the resulting file | See next row (download/share is the actual native-adaptation point) | Phase 5 |
| Download / share of exported file | `GET /:id/download` (`reports.js:4779`), proxies bytes from Storage; web: `getDownloadUrl` returns a **plain URL string requiring an already-authenticated browser session** (`api.js:189`) — **not a signed/public URL** | Deliver the exported file to the user | Adapt for React Native | The *authenticated-fetch-then-save* pattern must be rebuilt: fetch with the bearer token via the API client, write to `expo-file-system`, then present iOS/Android's native share sheet | `mobile/src/services/api/reports.ts` + `expo-file-system`/`expo-sharing` | Web's plain "point a link at it" pattern (`<a href download>`) does **not** work in RN without a real authenticated fetch first — this is one of the clearest web-pattern traps to avoid copying | If copied naively (treating the download URL as a public link), it will simply fail with a 401 in a mobile webview/browser | Phase 5 |
| PDF preview | Web: `<iframe>` at `ReportPreviewPage.jsx:1635`, `Dashboard.jsx:3437`, `EnterpriseDashboard.jsx:982` | In-browser PDF preview | Rebuild as native UI | `<iframe>` has no RN equivalent | Native PDF viewer (`expo-file-system` download + a PDF-render library, or open in system viewer) | Full rebuild, not adaptation | None beyond standard native PDF-viewing library choice | Phase 5 |
| Photo review gallery | `reports.js:4902-5219` — per-photo review/reorder/annotate | Photo-level QA before finalizing | Reuse through existing API | Same endpoints; native gesture-based reorder/annotate UI | `mobile/src/features/reports/photos/gallery/*` | Web drag-and-drop (`Dashboard.jsx:1436,1677,3049-3057`, browser `DataTransfer` API) has no RN equivalent — native long-press/drag gesture libraries needed instead | Photo annotation UI is a meaningfully large native-UI lift, not a thin adaptation | Phase 5 |

### 2.5 Notifications

| Functional area | Current source | Current responsibility | Classification | Reuse approach | Mobile destination | Required adaptation | Risks / dependencies | Phase |
|---|---|---|---|---|---|---|---|---|
| In-app notification feed | `backend/routes/notifications.js` (`GET /`, `POST /:id/read`, `POST /mark-all-read`), `backend/utils/notificationService.js` (`NOTIFICATION_TYPES`) | In-app-only feed backed by Firestore `notifications` collection + `unreadNotificationCount` | Reuse through existing API | Same endpoints for an in-app notification list on mobile | `mobile/src/features/notifications/*` | None to contract | None beyond standard list/pagination UI | Phase 5/6 |
| Push notifications | **Confirmed: does not exist anywhere in the backend.** No device-token storage, no FCM/APNs/Expo-push call sites found in `notificationService.js` or `notifications.js` | N/A — genuinely absent today | Backend addition required later | A device-token field/subcollection + registration endpoint + a call from existing `notifyUser()` call sites to fan out via Expo's push service, exactly as scoped in `MOBILE_DEVELOPMENT_PHASES.md` Phase 6 | `mobile/src/services/push.ts` (client) + new backend endpoint (separate approval) | This is a **net-new backend capability**, not a reuse of an existing one — do not describe it as "reusing" push, since nothing to reuse exists | Requires separate explicit approval before any `backend/` change, per Phase 6 scope and Golden Rule-equivalent git-safety rules in the phase tracker §11 | Phase 6 |

### 2.6 Subscriptions, payments, and entitlement sync

| Functional area | Current source | Current responsibility | Classification | Reuse approach | Mobile destination | Required adaptation | Risks / dependencies | Phase |
|---|---|---|---|---|---|---|---|---|
| Stripe Checkout (web) | `backend/routes/payment.js:46` (`create-checkout-session`), `:168` (`webhook`, signature-verified, idempotent via `processedWebhooks`), `:275/:317/:345/:372` (subscription/invoices/cancel) | Web subscription purchase + lifecycle | Web-only / not applicable to mobile (for purchase) | **Stripe Checkout must not be used for a mobile in-app subscription purchase** — conflicts with Apple/Google store policy for digital subscriptions | N/A for purchase flow | See IAP row below | Attempting to route a mobile subscription purchase through Stripe Checkout risks app-store rejection | N/A |
| Subscription **state** (read-only) | `GET /payment/current-subscription`, `GET /payment/invoices` (`payment.js:275,345`) | Read the current tier/invoice history | Reuse through existing API | Mobile can safely **read** subscription state through these existing endpoints even before Phase 7 (IAP) ships | `mobile/src/features/billing/status/*` | None | Read-only use is low-risk and does not touch store-billing policy at all | Phase 4 (read) / Phase 7 (purchase) |
| Entitlement single-source-of-truth | `tiers.js` `getBaseTier`/`TIER_ORDER`, set only by webhook/admin (per root `CLAUDE.md` §4) | Whatever purchase channel a user came from, tier lives in one Firestore field | Backend addition required later (for IAP channel only) | Apple/Google purchase receipts must map to the **same** tier enum via a new server-side receipt-validation endpoint, so tier is never channel-specific | New backend endpoint (separate approval) + `mobile/src/features/billing/*` | Must mirror the existing `processedWebhooks` idempotency pattern (`payment.js`) for Apple Server Notifications v2 / Google RTDN | Highest-risk phase per the phase tracker's own flag (Phase 7) — cross-channel entitlement conflicts (a Stripe web subscriber opening the mobile app, or vice versa) is an explicit open question | Phase 7 |
| IAP-vs-Stripe policy | N/A — no code decides this today | What a Stripe web subscriber sees/can do on mobile, and vice versa | Requires client decision | Do not build a specific behavior here until decided | N/A | N/A | Listed as open question §10 item 5 in the phase tracker already; repeated here because it's the single highest-risk unresolved item in this whole audit | Must resolve before Phase 7 |

### 2.7 Brand and presentation resources

| Functional area | Current source | Current responsibility | Classification | Reuse approach | Mobile destination | Required adaptation | Risks / dependencies | Phase |
|---|---|---|---|---|---|---|---|---|
| Brand colors | `frontend/tailwind.config.js:27-39,68-80,103-116` (`brandOrange`/`brandNavy` scales + semantic aliases); already ported verbatim into `mobile/src/theme/colors.ts:10-40` | Single source of truth for color | Reuse unchanged (already done) | **Already complete** — light/dark palettes match exactly, per direct comparison; no further action needed | `mobile/src/theme/colors.ts` (done) | None — keep in sync going forward: any future change to `tailwind.config.js` colors must be mirrored here manually (no shared package, see §5) | Drift risk only if one side changes without the other being updated | Done (Phase 1); maintain going forward |
| Typography | `tailwind.config.js:118-121` (Space Grotesk display / Inter body); ported into `mobile/src/theme/typography.ts:10-25` | Type pairing | Reuse unchanged (already done) | Already complete | `mobile/src/theme/typography.ts` (done) | Uses `@expo-google-fonts/*` packages instead of the web's `<link>`-loaded fonts — already the correct RN-native approach | None | Done (Phase 1) |
| Spacing / radii | `tailwind.config.js:122-130` (`rounded-btn`/`rounded-card`, shadow tokens); ported into `mobile/src/theme/spacing.ts:3-16` | Design system scale | Reuse unchanged (already done) | Already complete; mobile's broader spacing scale (xs4…xxl48) is a reasonable mobile-only addition, not drift | `mobile/src/theme/spacing.ts` (done) | None | None | Done (Phase 1) |
| Logo / image assets | `frontend/public/logo-mark.svg` (confirmed to exist) rasterized via `sharp` into `mobile/assets/images/{icon,brand-mark,splash-icon,android-icon-foreground,favicon}.png` | Brand mark across platforms | Reuse unchanged (already done) | Already complete for the app-icon/splash/in-app-mark set | `mobile/assets/images/*` (done) | `og-image.png` (social meta) and web-specific favicon sizes are web-only concerns, not needed on mobile | None | Done (Phase 1) |
| User-facing terminology | Root `CLAUDE.md` Golden Rule #2 language, `aiService.js:119` cautious-language rule, "Reviewing Adjuster Sign-Off" (`properPdfGenerator.js:798`) | Consistent, compliant product voice | Share only contract/type/constant | Mobile copy must reuse the same terms ("Reviewing Adjuster," "DRAFT — PENDING ADJUSTER REVIEW," cautious AI phrasing) rather than inventing parallel wording | Mobile UI copy | None — this is a wording-consistency requirement, not a code dependency | Inventing different terminology on mobile would create user-facing inconsistency and risk drifting from the Golden Rule #2 language the web app was specifically audited against | All phases with user-facing report copy |
| Empty/loading/error state patterns | Web has both real usage (`EnterpriseOnboarding.jsx`'s `SkeletonPortal`) and **dead, unused** components (`frontend/src/components/{EmptyState,SkeletonLoader,Modal}.jsx` — confirmed unused in root `CLAUDE.md`'s own audit) | Loading/empty/error UX conventions | Share only contract/type/constant | Reuse the *pattern* (skeleton-while-loading, explicit empty states, explicit error states with retry) as a design convention; do not port the unused React components themselves | Native equivalents in `mobile/src/components/*` | The unused web components are explicitly **not** a reuse source — they're dead code even on web | None | Ongoing, as each screen is built |

### 2.8 Legal / support / about content

| Functional area | Current source | Current responsibility | Classification | Reuse approach | Mobile destination | Required adaptation | Risks / dependencies | Phase |
|---|---|---|---|---|---|---|---|---|
| Privacy Policy, Terms, Cookies Policy, FAQs, About, Contact | `frontend/src/pages/{PrivacyPolicy,TermsOfService,CookiesPolicy,FAQs,About,Contact}.jsx` (confirmed real, non-stub content, 99–389 lines each) | Legal/informational copy | Reuse through existing API / share content only | Mobile should source the **same copy** — either by linking out to the web pages, or by rendering the same text natively (a content decision, not a code one) | `mobile/app/(tabs)/settings/legal/*` or in-app browser links | Contact form's consent checkbox behavior (Golden Rule #5 — never pre-checked) must be preserved if rebuilt natively, not just copied structurally | Authoring new legal copy is explicitly out of scope per the phase tracker (Phase 8) | Phase 8 |

---

## 3. Web-only implementations that must not be copied directly

These are concrete, evidence-confirmed patterns in the current web app that have **no
direct RN equivalent** and would be a mistake to port as-is:

| Web pattern | Evidence | Why it doesn't translate | What replaces it on mobile |
|---|---|---|---|
| React DOM components / JSX pages | All of `frontend/src/pages/*`, `frontend/src/components/*` | RN uses native host components (`View`/`Text`/etc.), not DOM elements | New RN screen components, built to the same information architecture, not copy-pasted |
| Tailwind / browser CSS | `frontend/tailwind.config.js`, `frontend/src/index.css` | No CSS engine in RN | `mobile/src/theme/*` (already ported as design **tokens**, not CSS) |
| Browser routing | `react-router-dom` (site-wide) | No URL bar / browser history stack on native | Expo Router (`mobile/app/*`), already the chosen mobile navigation framework |
| `localStorage`/session assumptions | `frontend/src/services/api.js:31-33,65`; `frontend/src/pages/Auth.jsx:73-206`; `ThemeContext.jsx`; `cookieConsent.js`; `CommentsPanel.jsx`; `GlobalSearch.jsx` | `localStorage` doesn't exist in RN | `expo-secure-store` for tokens; `AsyncStorage`/`SecureStore` only for genuinely non-sensitive per-viewer state |
| Browser popup social login | `signInWithPopup` (`AuthContext.jsx:162-165`) | Popups are a browser concept | Native Google Sign-In / Sign in with Apple flow |
| DOM file input + drag-and-drop | `<input type="file">` (`Dashboard.jsx:3037,3056`), `e.dataTransfer.files` drag-drop (`Dashboard.jsx:1436,1677,3049-3057`) | No DOM `File`/`DataTransfer` API in RN | `expo-image-picker` / `expo-camera` |
| Browser PDF preview via `<iframe>` | `ReportPreviewPage.jsx:1635`, `Dashboard.jsx:3437`, `EnterpriseDashboard.jsx:982` | No `<iframe>` in RN | Native PDF viewer component or system viewer hand-off |
| Browser download via `<a download>` / unauthenticated-looking link | `Dashboard.jsx:754,796,1965,2258`; `api.js:189` (`getDownloadUrl` returns a plain URL requiring an already-authenticated session) | RN has no browser download manager; the URL itself isn't a signed/public link | Authenticated fetch → `expo-file-system` → `expo-sharing` share sheet |
| Web push assumptions | **N/A — confirmed no push implementation exists on web either** (see §2.5) | There is nothing web-specific to avoid copying here; this is a from-scratch native buildout | Native push permission + Expo push token registration (Phase 6) |
| Stripe Checkout (redirect-based) for subscription purchase | `payment.js:46` `create-checkout-session`, server-redirect flow | Apple/Google policy prohibits routing a digital subscription purchase through an external payment flow inside an app | Apple In-App Purchase / Google Play Billing (Phase 7) |

---

## 4. Native mobile implementations required

These have no meaningful web equivalent to adapt from — they are net-new native work:

- **React Native screen components** — built against the same information architecture as
  the web pages/flows, not against their JSX.
- **Expo Router navigation** — already the chosen framework (`mobile/MOBILE_DEVELOPMENT_PHASES.md`
  §2 "Architecture decisions").
- **Secure token storage** — `expo-secure-store`, never `AsyncStorage`, per the phase
  tracker's Phase 3 security note. **Clarified during Phase 3 implementation
  (2026-09-08):** this rule governs any token the app itself manages by hand. It does
  **not** forbid Firebase's own official React Native session persistence
  (`initializeAuth` + `getReactNativePersistence(AsyncStorage)`), which is Firebase's
  documented, industry-standard mechanism for this exact SDK — not something built here.
  This is a deliberate, approved exception, not an oversight — see
  `AUTHENTICATION_ARCHITECTURE.md` §6 and §11.1 item 3 for the full trade-off and why no
  token is ever additionally duplicated into a second storage location.
- **Native social authentication** — Google (mandatory-paired Apple Sign-In on iOS if
  Google ships, per App Store rules) — replaces `signInWithPopup`.
- **Mobile deep links** — for email-verification/reset continue-URLs (open question §10
  item 7 in the phase tracker) and eventually for shared-report links.
- **Camera and photo-library access** — `expo-image-picker`/`expo-camera`, replacing
  `<input type="file">` and browser drag-and-drop.
- **Device file storage / share sheet** — `expo-file-system`/`expo-sharing`, replacing
  `<a download>`.
- **Push permission and device-token handling** — genuinely new on both sides (§2.5); no
  backend capability exists yet to reuse.
- **Phone/tablet responsive layouts** — iOS `supportsTablet: true` is already configured
  (`mobile/app.config.ts`, confirmed in phase tracker §8); Android has no restrictive
  screen-size lock, by design.
- **Apple In-App Purchase** and **Google Play Billing** — Phase 7, highest-risk phase.
- **Native accessibility and platform permissions** — camera/photo-library/push permission
  prompts, VoiceOver/TalkBack support — none of this exists in the web codebase to reuse.

---

## 5. Preventing duplicated business logic (web/mobile drift)

- **Backend remains the single source of truth** for authorization, entitlements, report
  state transitions, and payment/entitlement verification. Every gated action in §2.3 is
  enforced server-side today (`requireTier`, `isReviewed()`, `canGenerate()`) — mobile must
  call the same checks through the API, never re-derive the answer locally.
- **Mobile consumes verified APIs; it does not duplicate security decisions.** A locally
  mirrored tier constant (§2.3) is for UI display only (e.g., graying out a CRM tab before
  the request even goes out) — it is never the actual gate. The actual gate is always the
  server's 403/`INSUFFICIENT_TIER` (or equivalent) response.
- **Mobile-side validation may improve UX but never replaces backend validation.** E.g.,
  client-side "this field looks required" hints are fine; they must not be treated as a
  substitute for whatever the server itself validates on `POST /reports/generate` or
  `PUT /:id`.
- **No shared package is created by this documentation task**, and none should be created
  by a future phase without first re-auditing whether it would create frontend/backend
  build coupling. Today, brand tokens (§2.7) and API contract shapes (§2.2) are
  **manually mirrored** between `frontend/` and `mobile/` — this is intentional
  duplication-with-discipline, not an oversight, per the existing Phase 1 architecture
  decision ("Dependency isolation... no shared package").
- **Do not refactor existing `frontend/`/`backend/` code merely to make it "more
  reusable."** If a future phase is tempted to extract a shared constant/type file, that is
  itself a decision requiring its own audit and explicit approval — not a byproduct of
  mobile work.
- **Any future backend addition (push device-token endpoint, IAP receipt-validation
  endpoint) is additive only**, independently reviewed, and explicitly approved before
  `backend/` is touched — exactly as already stated in `MOBILE_DEVELOPMENT_PHASES.md`
  Phases 6 and 7.

---

## 6. Feature-parity map

Classifications:

- **Required v1** — needed for a usable first mobile release.
- **Optional/deferred** — reasonable to ship after v1.
- **Web-only candidate** — plausibly never needed on mobile at all.
- **Client confirmation required** — genuinely ambiguous; do not decide unilaterally.

| Web feature | Required v1 | Optional/deferred | Web-only candidate | Client confirmation required | Backend API available today? | Planned mobile phase |
|---|:---:|:---:|:---:|:---:|---|---|
| Register / login / logout / password reset | ✓ | | | | Yes (`auth.js`) | Phase 3 |
| Email verification | ✓ | | | | Yes, but continue-URL is web-shaped | Phase 3 |
| MFA / TOTP + recovery codes | | | | **✓** | Yes (`auth.js` mfa/*) | Phase 3 (if confirmed) |
| Report generation wizard (claim → property → loss → photos → review) | ✓ | | | | Yes (`reports.js:599`) | Phase 5 |
| Photo capture/upload + AI analysis | ✓ | | | | Yes (`reports.js`, `aiService.js`) | Phase 5 |
| Review / approve / finalize | ✓ | | | | Yes (`reports.js:1811`) | Phase 5 |
| Export (PDF/DOCX/HTML) + share-sheet delivery | ✓ | | | | Yes (`reports.js:4290,4779`) | Phase 5 |
| In-app notifications | | ✓ | | | Yes (`notifications.js`) | Phase 5/6 |
| Push notifications | | ✓ | | | **No — backend addition required** | Phase 6 |
| Comments & replies on reports | | ✓ | | **✓** | Yes (`reports.js:2585`) | Deferred / confirm |
| Version history | | ✓ | | | Yes (`reports.js:2016`) | Deferred |
| Template creation/editing | | | | **✓** | Partially (apply yes; author is a large surface) | Requires client decision |
| Template application (use existing template at generate time) | | ✓ | | | Yes | Deferred |
| Analytics dashboard (`Analytics.jsx`) | | | | **✓** | Yes (`analytics.js`) | Requires client decision |
| CRM (clients/appointments/claims) | | | | **✓** | Yes, Agency+ (`crm.js`) | Requires client decision |
| Teams / org administration | | | | **✓** | Yes, Enterprise (`teams.js`) | Requires client decision |
| Enterprise portal / dashboard | | | | **✓** | Yes (`EnterpriseDashboard.jsx` + APIs) | Requires client decision |
| White-label branding | | | **✓** (likely) | **✓** | Yes, Enterprise (`whitelabel.js`) | Requires client decision |
| Admin panel | | | **✓** (likely) | | Yes, single-email admin | Web-only unless explicitly requested |
| Audit logs | | | | **✓** | Yes (`sales.js` admin/audit-logs) | Requires client decision |
| Legal/support/about content | ✓ | | | | Content, not API | Phase 8 |
| Settings / profile / account deletion | ✓ | | | | Yes (`users.js`) | Phase 8 |
| Subscription status (read-only) | ✓ | | | | Yes (`payment.js` current-subscription) | Phase 4 |
| Subscription purchase (IAP) | ✓ | | | **✓** (IAP-vs-Stripe policy) | No — backend addition required | Phase 7 |
| Mobile-initiated management of a Stripe-originated web subscription | | | | **✓** | Partially (cancel exists; policy undecided) | Requires client decision, Phase 7 |

Client decisions specifically flagged, per the task's required callouts:

- **CRM** — in/out of mobile v1 scope.
- **Team and organization administration** — in/out of mobile v1 scope.
- **Enterprise portal** — in/out of mobile v1 scope.
- **White-label functionality** — in/out of mobile v1 scope (likely web-only, not confirmed).
- **Audit logs** — in/out of mobile v1 scope (likely admin-only, not confirmed).
- **Analytics depth** — full `Analytics.jsx` parity vs. a lighter mobile summary.
- **Template creation/editing** — whether authoring ships on mobile at all, vs. apply-only.
- **MFA parity** — ship at mobile launch vs. documented v1 limitation.
- **Mobile subscription management** — what a mobile user can do to their own subscription.
- **Stripe-originated subscription management inside mobile** — whether mobile can
  view/cancel a subscription that originated on web via Stripe, given store policy
  constraints on referencing external purchases.

---

## 7. Validation notes for this document

- Every file/line citation above was verified by direct code inspection (four parallel
  read-only audits covering auth/tiers, reports/export/AI, CRM/teams/whitelabel/admin, and
  frontend brand/legal content) during this documentation session, 2026-09-08.
- No endpoint, module, or completed feature described here is invented — anything not
  confirmed in code is explicitly marked "Backend addition required later" or "Requires
  client decision," never presented as already existing.
- Where the mobile phase tracker's existing claims were independently re-checked (e.g.,
  `frontend/public/logo-mark.svg` existing, `/api/v1` dual-mount, brand-token parity in
  `mobile/src/theme/*`), they held up under direct verification — no contradictions found.
- This document does not fabricate a production API base URL, App Store/Play Console
  identifiers beyond those already confirmed in the phase tracker, or any statistic/claim
  about the product.
