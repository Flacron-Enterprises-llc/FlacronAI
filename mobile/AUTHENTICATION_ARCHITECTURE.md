# FlacronAI Mobile — Authentication Architecture

> **Status: Phase 3 IMPLEMENTED (partially complete — see §11 for exact scope/gaps).**
> §§1–10 below are the original 2026-09-08 audit and recommendation, kept unedited as the
> historical record the implementation was built from. **§11 (appended 2026-09-08, same
> day, later session) records the final pre-implementation security re-verification, what
> was actually built, and the honest completion status** — read §11 first if you only have
> time for one section. The §4 recommendation was adopted as written; no deviation.
>
> Every fact below was verified directly against the code during this audit (dated
> 2026-09-08). No credential value, API key, secret, or `.env` content appears anywhere in
> this document — only variable/field names and redacted references, per the audit's own
> constraints.

---

## 1. The single most important finding

**The web app's actual login/signup/logout/password-change UI does not call the backend's
REST `/auth/login`, `/auth/register`, `/auth/logout`, or `/auth/change-password`
endpoints at all.** This was verified two ways: by an independent code-reading agent and,
separately, by a direct `grep` for every `authAPI.*` call site in `frontend/src` (results
below). This single fact reshapes the entire Option A vs. Option B comparison in §3, so it
is stated first.

| Backend REST endpoint | Defined in `frontend/src/services/api.js:98-111`? | Actually called anywhere in `frontend/src`? |
|---|:---:|:---:|
| `POST /auth/register` | Yes (`authAPI.register`) | **No call site found anywhere** |
| `POST /auth/login` | Yes (`authAPI.login`) | **No call site found anywhere** |
| `POST /auth/logout` | Yes (`authAPI.logout`) | **No call site found anywhere** |
| `POST /auth/change-password` | Yes (`authAPI.changePassword`) | **No call site found anywhere** |
| `POST /auth/verify` | Yes (`authAPI.verify`) | Yes — `AuthContext.jsx:158,166`, fire-and-forget, audit-log only |
| `POST /auth/forgot-password` | Yes (`authAPI.forgotPassword`) | Yes — `Auth.jsx:295`, `Settings.jsx:409` |
| `POST /auth/send-verification` | Yes (`authAPI.sendVerification`) | Yes — `Auth.jsx:156,206`, `ProtectedRoute.jsx:88` |
| `GET /auth/mfa/status` | Yes | Yes — `Settings.jsx:310` |
| `POST /auth/mfa/setup` | Yes | Yes — `Settings.jsx:490` |
| `POST /auth/mfa/verify-setup` | Yes | Yes — `Settings.jsx:503` |
| `POST /auth/mfa/disable` | Yes | Yes — `Settings.jsx:520` |
| `POST /auth/mfa/verify` | Yes | Yes — `MfaGate.jsx:21` |
| `POST /auth/mfa/login-verify` | **Not even defined in `api.js`** | No |

Instead, the web app authenticates directly against the **Firebase JS SDK**:
- Signup → `createUserWithEmailAndPassword` (`AuthContext.jsx:174`)
- Login → `signInWithEmailAndPassword` (`AuthContext.jsx:157`)
- Google → `signInWithPopup` + `GoogleAuthProvider` (`AuthContext.jsx:164-165`)
- Logout → `signOut(auth)` only (`AuthContext.jsx:180`) — **no backend call**
- Password change → `updatePassword(currentUser, newPassword)` directly (`Settings.jsx:14,383`) — **no backend call**

**What this means:** the backend's REST `/auth/login` + `/auth/register` endpoints (which
mint a **custom JWT**, distinct from a genuine Firebase ID token — see §2.1) and the
entire `mfaRequired`/`mfaToken`/`/auth/mfa/login-verify` pre-session MFA-challenge path
exist in the code and are individually well-formed, but **are not exercised by any
confirmed real client today.** The web app's MFA gate instead happens *after* a normal
Firebase sign-in already succeeded, via `POST /auth/mfa/verify` (an
already-authenticated-session endpoint, gated by the same `authenticateToken` middleware
as everything else) — see `ProtectedRoute.jsx:114` + `MfaGate.jsx:21`.

A direct consequence: the `tokenVersion`-based revocation mechanism in
`middleware/auth.js` (§2.1) is checked **only** on the custom-JWT fallback verification
path — never on a genuine Firebase ID token. Since web never carries a custom JWT, this
mechanism is **not exercised by real production traffic today.** This is not a defect —
it is simply unused code paths sitting alongside the pattern that *is* actually used. This
fact directly informs the recommendation in §4.

*(This audit could not fully rule out some other, non-web consumer of `/auth/login`/
`/auth/register` existing somewhere outside this repository — e.g., a script, Postman
collection, or third-party integration. That is outside this audit's reach. It does not
change the recommendation below either way: mobile should mirror the web app's actual,
proven, production pattern.)*

---

## 2. Verified current architecture

### 2.1 Backend (`backend/routes/auth.js`, `backend/middleware/auth.js`)

| Endpoint | Method+path (file:line) | What it does | Success shape | Error codes |
|---|---|---|---|---|
| Register | `POST /auth/register` (auth.js:106-163) | Validates input → `authLimiter` → `auth.createUser()` (Firebase Admin) → writes `users/{uid}` Firestore doc (`tier:'starter'`, `tokenVersion:0`, etc.) → issues a **custom JWT** (`jwt.sign({uid,email,tokenVersion:0}, JWT_SECRET, {expiresIn:'7d'})`, line 148) | `201 {success,message,token,user}` | `400` validation, `409 EMAIL_EXISTS`, `500 REGISTER_ERROR` |
| Login | `POST /auth/login` (auth.js:166-221) | `authLimiter` → Firebase REST `signInWithPassword` → reads `users/{uid}`. If `mfaEnabled`, returns an MFA challenge instead of a session | `mfaEnabled=false`: `200 {success,token,user}` where `token` is the **real Firebase ID token**. `mfaEnabled=true`: `200 {success,mfaRequired:true,mfaToken}` (a separate short-lived JWT signed with a distinct `MFA_CHALLENGE_SECRET`) | `400` validation, `401 INVALID_CREDENTIALS`, `500 LOGIN_ERROR`/`CONFIG_ERROR` |
| MFA login-verify | `POST /auth/mfa/login-verify` (auth.js:226-270) | Consumes the `mfaToken` from Login above; verifies TOTP or a recovery code (consumes one recovery-code hash transactionally) | `200 {success,token,user}` where `token` is **yet another custom JWT** (not a Firebase ID token) | `401 MFA_SESSION_EXPIRED`, `401 INVALID_MFA_TOKEN`, `400 MFA_NOT_ENABLED`, `401 INVALID_MFA_CODE`, `500 MFA_VERIFY_ERROR` |
| MFA setup | `POST /auth/mfa/setup` (auth.js:273-283, `authenticateToken`) | Generates a TOTP secret, writes `mfaPendingSecret` | `200 {success,secret,qrCode}` | `500 MFA_SETUP_ERROR` |
| MFA verify-setup | `POST /auth/mfa/verify-setup` (auth.js:286-314) | Verifies the pending secret, writes `mfaEnabled,mfaSecret,mfaRecoveryCodeHashes,mfaEnabledAt` | `200 {success,message,recoveryCodes}` (plaintext codes shown once) | `400 NO_PENDING_MFA`, `400 INVALID_MFA_CODE`, `500 MFA_VERIFY_ERROR` |
| MFA disable | `POST /auth/mfa/disable` (auth.js:317-360) | Password OR TOTP/recovery code required; clears `mfaEnabled,mfaSecret,mfaRecoveryCodeHashes` | `200` message | `400`, `401 INVALID_PASSWORD`, `400 INVALID_MFA_CODE`, `500` |
| MFA status | `GET /auth/mfa/status` (auth.js:363-371) | Reads `mfaEnabled` | `200 {success,mfaEnabled}` | `500 MFA_STATUS_ERROR` |
| MFA verify (post-session gate) | `POST /auth/mfa/verify` (auth.js:377-398, `authenticateToken`) | The endpoint the web app **actually** uses to gate access after a normal Firebase login | `200 {success,method}` | `401 INVALID_MFA_CODE`, `500 MFA_VERIFY_ERROR` |
| Verify (audit ping) | `POST /auth/verify` (auth.js:417-429, `authenticateToken`) | Records a `login_success` audit-log entry (skipped if MFA-enabled) | `200 {success,user}` | `500 VERIFY_ERROR` |
| Logout | `POST /auth/logout` (auth.js:432-450, `authenticateToken`) | `getAuth().revokeRefreshTokens(uid)` + bumps Firestore `tokenVersion`+1 | `200` message (best-effort; errors only logged) | — |
| Refresh | `POST /auth/refresh` (auth.js:453-468) | Exchanges a Firebase refresh token via `securetoken.googleapis.com` | `200 {token,refreshToken}` | `400 NO_TOKEN`, `401 REFRESH_ERROR` |
| Forgot password | `POST /auth/forgot-password` (auth.js:471-486) | `getAuth().generatePasswordResetLink()` (no `actionCodeSettings` — uses Firebase's default hosted reset page) + sends email | Always `200 success:true` (anti-enumeration) | — |
| Send verification | `POST /auth/send-verification` (auth.js:489-526, `authenticateToken`) | Builds a **web** `continueUrl` (`FRONTEND_URL + '/dashboard'`, optionally `?pending_plan=...`) → `generateEmailVerificationLink` → sends email | `200` message | `500 VERIFY_EMAIL_ERROR` |
| Change password | `PUT /auth/change-password` (auth.js:529-549, `authenticateToken`) | `getAuth().updateUser(password)`, revokes refresh tokens, bumps `tokenVersion` | `200` message | `500 PASSWORD_ERROR` |

**`authenticateToken`** (`middleware/auth.js:75-176`) — the gate on every protected route:
1. No `Authorization: Bearer` header → `401 NO_TOKEN`.
2. Tries `getAuth().verifyIdToken()` (Firebase Admin SDK) first. One retry on a classified
   transient error (`isTransientAuthError`, lines 33-37).
3. If that fails, falls back to `jwt.verify(token, JWT_SECRET)` (the custom-JWT path used
   by register/mfa-login-verify tokens): checks `tokenVersion` match → `401
   TOKEN_REVOKED` on mismatch; checks `teamMembershipStatus==='suspended'` → `403
   TEAM_ACCESS_SUSPENDED`.
4. If both fail: `503 AUTH_VERIFY_UNAVAILABLE` if the original Firebase error was
   transient, else `401 INVALID_TOKEN`.
5. If the Firebase path succeeded but the Firestore profile lookup then fails: `503
   PROFILE_LOOKUP_FAILED` (distinct from an auth failure).
6. `isAuthVerificationWedged()` tracks `consecutiveTransientAuthFailures` reaching a
   threshold of 5, exposed to `server.js`'s `/health` endpoint for infra-level alerting.

Also present: `authenticateApiKey` (SHA-256 hashed `X-API-Key`, `401 NO_API_KEY`/`401
INVALID_API_KEY`), `authenticateAny` (Bearer or API key, `401 NO_AUTH`), `requireTier`
(`403 INSUFFICIENT_TIER`), `optionalAuth` (never errors, sets `req.user=null`).
**`requireAdmin` does not live here** — it's defined only in `backend/routes/sales.js:
137-142` as `req.user.email !== process.env.ADMIN_EMAIL`, a **different mechanism** than
`firestore.rules`' hardcoded `admin@flacronenterprises.com` literal (rules:14-15) — two
independent admin checks exist today, not one shared source.

**CORS** (`server.js:20-40`): allow-list includes `flacronai.vercel.app`, `flacronai.com`,
`www.flacronai.com`, plus dev localhost origins — but critically, **`if (!origin ...)
callback(null, true)`** (line 31): a request with **no `Origin` header at all is
explicitly allowed.** Native mobile HTTP clients (unlike browsers) typically don't send an
`Origin` header, so this already accommodates mobile without any change.

**Rate limits on auth:** `authLimiter` (auth.js:97-103) — 15 min window, max 10.
`mfaLimiter` (auth.js:64-71) — 10 min window, max 8, keyed by uid/mfaToken/IP.

**Account deletion** — `DELETE /users/account` (`users.js:703-773`): requires the current
password (re-verified via Firebase REST sign-in, `401 INVALID_PASSWORD` on mismatch);
blocks if the user owns an `enterpriseTeams` doc (`409 TEAM_OWNER_BLOCKED`); recursively
deletes reports + subcollections, batch-deletes several other owned collections, wipes
Storage under `users/{uid}/`, deletes the Firestore doc and the Firebase Auth user itself.

**Profile/tier loading** — `GET /users/profile` (`users.js:36-93`): auto-creates the
`users/{uid}` doc transactionally on first call if missing; returns `{success, user:
profile}` where `profile` includes `tier`, `onboardingCompleted`, etc. **No explicit
`role`/`permissions` field exists in this response — `tier` is the sole authorization
signal returned to the client** (org roles like owner/admin/manager live under teams, a
separate concern — see `WEB_TO_MOBILE_REUSE_STRATEGY.md` §2.3).

**Firestore rules gap (flagged, not confirmed as exploitable):** `firestore.rules`'
`users/{userId}` rule (lines 27-32) allows `update` for the doc's owner with no
field-level restriction visible in the ruleset. No `request.resource.data.diff()` guard
was found protecting `mfaEnabled`, `tokenVersion`, or `emailVerified` specifically from a
**direct Firestore client-SDK write** (as opposed to going through the backend's Admin-SDK
endpoints, which do enforce this correctly). Today, the web app never writes these fields
directly — always through the backend — so this is not a *currently exploited* gap, but
it is a real one worth a dedicated security-rules review outside this audit's scope
(flagged in §6's threat table).

### 2.2 Frontend (`frontend/src/context/AuthContext.jsx`, `ProtectedRoute.jsx`, `Auth.jsx`)

- **`AuthContext.jsx`** (256 lines) wires `onAuthStateChanged` on mount (lines 75-101):
  sets `user`, sets `emailVerified` from `firebaseUser.emailVerified`, and — if a user
  exists — fetches the backend profile via `usersAPI.getProfile()`. A 10s fallback timeout
  force-clears `loading` for slow-network/placeholder-config edge cases (line 78).
  Signup/login/Google-login each reset a local `mfaVerified` boolean to `false` before
  calling Firebase, then fire `authAPI.verify()` fire-and-forget for audit logging only.
  **No browser storage is used in this file at all** — Firebase's SDK manages its own
  session persistence internally.
- **`ProtectedRoute.jsx`** (154 lines) gates, in exact order: (1) loading, (2)
  unauthenticated → redirect to `/login`, (3) profile-load-failure → retry screen, (4)
  **email-verification gate** (`!emailVerified && !isGoogleUser` → blocking "Verify Your
  Email" screen; Google-authenticated users skip this, since Google accounts are
  pre-verified), (5) **MFA gate** (`userProfile?.mfaEnabled && !mfaVerified` →
  `<MfaGate/>`), (6) onboarding redirect, (7) tier-based access control.
- **`Auth.jsx`** (669 lines) is the actual login/signup UI. Forgot-password is a modal
  posting to `authAPI.forgotPassword` and always shows a generic "reset link sent"
  message. Uses `sessionStorage` (not `localStorage`) only to persist a pending
  pricing-plan selection across the auth redirect (`flac_pending_plan` key).
- **`frontend/src/config/firebase.js`** — plain `initializeApp` + `getAuth(app)` +
  `getFirestore(app)` + `new GoogleAuthProvider().addScope('email').addScope('profile')`.
  **No explicit `setPersistence` call exists anywhere in the repo** — web relies on
  Firebase's default `browserLocalPersistence` (IndexedDB-backed).
- **`frontend/src/services/api.js`** — request interceptor tries `auth.currentUser` →
  `getIdToken()` first; only falls back to `localStorage.getItem('flac_token')` if no
  Firebase user exists. **No code path anywhere in the reviewed frontend ever *sets* this
  `flac_token` key** — it appears to be a dormant/legacy fallback, not a currently
  populated mechanism. Response interceptor: on a first 401, force-refreshes the Firebase
  ID token once and retries; if that also fails, clears the dormant `localStorage` key and
  hard-redirects to `/login` (unless already on an auth page).

### 2.3 Deep-link / continue-URL behavior (critical gap for mobile)

- **Email verification**: `auth.js:500-506` builds `continueUrl = FRONTEND_URL +
  '/dashboard' [+ '?pending_plan=...']`, then `generateEmailVerificationLink(email, {url:
  continueUrl})`. This is a **web URL**, and clicking it lands on the web dashboard.
- **Password reset**: `auth.js:477` calls `generatePasswordResetLink(email)` with **no**
  second argument — no custom `continueUrl`/`actionCodeSettings` at all. The reset link
  uses **Firebase's own default hosted action-handler page**, not even the FlacronAI web
  domain.
- **No `actionCodeSettings` object exists anywhere in the repository** (zero matches).
  **No custom URL scheme / deep-link handling exists anywhere** (zero matches for
  `flacronai://` as an auth-related link). **No frontend route handles Firebase's
  `mode=verifyEmail`/`resetPassword`/`oobCode` query parameters** (zero matches for
  `oobCode`, `verifyPasswordResetCode`, `confirmPasswordReset`, `applyActionCode`).
- **Conclusion: mobile deep-link handling for email verification / password reset is
  entirely greenfield.** There is no existing pattern to "adapt" — this must be designed
  from scratch (see §7).

### 2.4 Duplicate-account prevention (as it exists today)

`Auth.jsx:221,271` catches Firebase's `auth/account-exists-with-different-credential`
error code and shows a friendly message. **No `linkWithCredential` call exists anywhere**
— there is no programmatic account-merging. Today's behavior relies entirely on
Firebase Authentication's own default collision detection at sign-in time (governed by
the project's "one account per email address" setting, which this audit cannot verify
without Firebase console access — see §9 unresolved items).

---

## 3. Strategy comparison

### Option A — Firebase JS SDK on React Native

| Consideration | Finding |
|---|---|
| RN/Expo compatibility | The modular Firebase JS SDK (`firebase` npm package, v9+) officially supports React Native for **Auth, Firestore, and Storage** via REST-based calls under the hood — no native module required for basic email/password auth. This is the same package family already used by web (`frontend/src/config/firebase.js`), so the exact same `EXPO_PUBLIC_FIREBASE_*` config values already scaffolded (empty) in `mobile/.env.example` can be reused as-is. |
| Secure session persistence | Requires explicit RN persistence setup: `initializeAuth(app, {persistence: getReactNativePersistence(AsyncStorage)})` (Firebase's own documented pattern), using `@react-native-async-storage/async-storage`. **This is a real trade-off, not a minor detail**: Firebase's RN persistence layer is designed around AsyncStorage's API shape, not `expo-secure-store`'s — AsyncStorage is unencrypted device storage (SharedPreferences on Android, a plist-backed file on iOS), unlike SecureStore's Keychain/Keystore backing. See §6 for how this is weighed and mitigated. |
| Firebase ID-token refresh | Handled automatically and silently by the SDK (same as web) — no manual refresh logic needed for the common case. |
| Email verification | `sendEmailVerification(user)` is a direct SDK call; can also continue using the backend's `POST /auth/send-verification` for parity/observability (recommended — see §4). |
| Password reset | `sendPasswordResetEmail(auth, email)` is a direct SDK call, or reuse `POST /auth/forgot-password` (recommended, matches web's actual pattern and its anti-enumeration behavior). |
| Google Sign-In | Firebase JS SDK's `signInWithPopup`/`signInWithRedirect` are **browser-only** and do not work in RN. Native credential exchange is required: `@react-native-google-signin/google-signin` obtains a native Google ID token, which is then fed into `signInWithCredential(auth, GoogleAuthProvider.credential(idToken))`. This requires a **development build** (not Expo Go — see below) and platform-specific OAuth client IDs (§7). |
| Sign in with Apple | Similarly requires `expo-apple-authentication` (native) to obtain an Apple identity token, then `signInWithCredential(auth, new OAuthProvider('apple.com').credential({idToken, rawNonce}))`. Also requires a development build and Apple Developer capability configuration (§7). |
| Backend verification compatibility | **Excellent** — the resulting Firebase ID token is verified by `authenticateToken`'s **primary** path (`getAuth().verifyIdToken()`), the exact same path already exercised successfully by all of web's real traffic today. No new backend code path is exercised. |
| Firebase iOS/Android app registration | **Not required** for the JS-SDK-only approach to basic email/password auth — the web Firebase config object works identically on RN. Registration (and `google-services.json`/`GoogleService-Info.plist`) **is** required specifically to obtain the platform-specific OAuth client IDs needed for native Google/Apple sign-in (§7), not for the SDK itself. |
| Native configuration files | None needed for email/password auth. `google-services.json`/`GoogleService-Info.plist` become necessary once native Google Sign-In is added (already anticipated — both filenames are pre-listed in `mobile/.gitignore` from Phase 1). |
| Expo Go vs. development build | Email/password auth via the JS SDK **works fine in Expo Go** (pure JS, matches Phase 1's existing Expo Go validation). **Native Google/Apple Sign-In do NOT work in Expo Go** — they require an EAS development build, since Expo Go cannot include arbitrary native modules. This is a real testing-workflow change from Phase 1 (see §8). |
| Bundle/native dependency impact | Minimal for the JS-SDK-only path (`firebase` + `@react-native-async-storage/async-storage`, both pure-JS/lightweight-native). Adding native Google/Apple sign-in adds real native modules requiring a rebuild of the dev client whenever they change. |
| MFA compatibility | FlacronAI's MFA is a **custom TOTP system built entirely in the FlacronAI backend** (not Firebase's built-in phone/SMS MFA) — it is triggered *after* a normal Firebase sign-in, via `POST /auth/mfa/verify`, exactly matching how web already works. Fully compatible with Option A, no conflict with Firebase's own MFA feature (which isn't used here at all). |

### Option B — Existing backend REST authentication

| Consideration | Finding |
|---|---|
| Existing `/api/v1/auth` endpoints | Fully exist and are individually well-formed (§2.1) — but **are not used by the one real client (web) that exists today** (§1). Building mobile primarily around them means mobile would be the **first real consumer** of `/auth/login`, `/auth/register`, the `mfaRequired`/`mfaToken` challenge flow, and `/auth/mfa/login-verify` — none of which have any production usage history to derive confidence from. |
| Token type and expiry | `/auth/register` and `/auth/mfa/login-verify` mint a **custom JWT** (7-day expiry per register; not explicitly re-confirmed for the mfa-login-verify variant — worth confirming before use), backed by `tokenVersion` for revocation. `/auth/login` (non-MFA path) returns a **genuine Firebase ID token** instead — i.e., **the token type returned by this REST surface is inconsistent depending on which endpoint issued it**, a real design inconsistency to inherit if Option B is chosen as the primary path. |
| Refresh-token mechanism | `POST /auth/refresh` exists for Firebase-token refresh via `securetoken.googleapis.com`. No equivalent refresh endpoint exists for the **custom JWT** variant (register/mfa-login-verify) — those are long-lived (7 days) with no refresh path found, meaning a custom-JWT session can only be renewed by a full re-login once it expires. |
| SecureStore requirements | A single opaque JWT string fits SecureStore's size limits easily — this is actually **simpler and more secure** to store than Option A's Firebase SDK session blob, since the app fully controls a small, well-understood string. This is Option B's clearest advantage. |
| Email verification / password reset | Same backend endpoints are available either way (`/auth/send-verification`, `/auth/forgot-password`) — no difference between options here. |
| Google/Apple sign-in compatibility | The backend has **no REST endpoint for exchanging a native Google/Apple credential for a session token** — `/auth/login` only accepts email+password. Option B alone cannot support social sign-in at all without a **new backend endpoint** (a real gap, not simply "adaptation"). |
| MFA challenge flow | The `mfaRequired`/`mfaToken`/`/auth/mfa/login-verify` flow is real, but exists in production code with **zero confirmed usage** by any current client — building mobile's *primary* MFA path on it means debugging a code path with no operational history, when a proven alternative (mirror web's post-session `/auth/mfa/verify` gate) already exists and works. |
| Token revocation | `tokenVersion` revocation works correctly for custom JWTs but, per §1, **is not exercised by any Firebase-ID-token-bearing client** — if mobile used custom JWTs as its primary token (full Option B), this mechanism would actually be *exercised for the first time in production* by mobile, which is a meaningful behavior change to validate carefully, not just "reuse." |
| Backend error handling | Fully shared regardless of option — the `{success,error,code}` envelope and 401/403/503 distinctions apply identically to any bearer token type. |
| Offline/retry behavior | No difference — this is a client-side concern independent of which token type is used. |
| Genuinely supports all client requirements without duplicating/weakening security? | **No, not on its own.** Full Option B would require inventing new backend endpoints for social-credential exchange (duplicating logic Firebase already provides for free via Option A), and would mean mobile's very first production exercise of an otherwise-dormant JWT/tokenVersion/MFA-challenge code path — a materially higher risk than mirroring an already-proven pattern. |

---

## 4. Recommendation

**Primary recommendation: a precisely-scoped hybrid, weighted heavily toward Option A,
that mirrors the web app's *actual* (not theoretical) working pattern.**

- **Identity operations use the Firebase Client SDK directly**, exactly as web does:
  `createUserWithEmailAndPassword`, `signInWithEmailAndPassword`, `signOut`,
  `sendPasswordResetEmail`/reuse of `POST /auth/forgot-password`,
  `sendEmailVerification`/reuse of `POST /auth/send-verification`. Session persistence
  uses Firebase's documented React Native persistence (`initializeAuth` +
  `getReactNativePersistence(AsyncStorage)`).
- **Social sign-in uses native provider SDKs that produce a credential, then hand it to
  Firebase**: `@react-native-google-signin/google-signin` → `signInWithCredential` with a
  `GoogleAuthProvider.credential(...)`; `expo-apple-authentication` → `signInWithCredential`
  with an `OAuthProvider('apple.com').credential(...)`. Neither requires a new backend
  endpoint — the resulting Firebase ID token flows into the backend exactly like an
  email/password session does.
- **Every backend REST call (`/api/v1/*`) sends the Firebase ID token as `Authorization:
  Bearer <idToken>`.** The backend remains the **sole source of truth** for profile, tier,
  entitlements, MFA state, and report data — mobile never re-derives an authorization
  decision locally (per `WEB_TO_MOBILE_REUSE_STRATEGY.md` §5).
- **MFA is handled exactly like web**: after a successful Firebase sign-in, check
  `userProfile.mfaEnabled` (from `GET /users/profile`); if true, gate the app behind a
  native TOTP-entry screen that calls the already-proven `POST /auth/mfa/verify` — **not**
  the untested `mfaRequired`/`mfaToken`/`/auth/mfa/login-verify` path.
- **Backend REST `/auth/login`, `/auth/register`, and `/auth/mfa/login-verify` are
  deliberately NOT used by mobile.** They remain available in the codebase (no backend
  change is proposed or needed) but mobile does not build its primary flow on
  unexercised code.
- ~~One deliberate improvement over web: mobile's logout **should** call `POST
  /auth/logout`...~~ **SUPERSEDED 2026-09-08 (final correction pass) — this recommendation
  was implemented, then reverted.** Ordinary Sign Out on both web and mobile is now
  local-only by design: an explicit, security-triggered event (a password change) is what
  reaches server-side revocation, not routine sign-out on either platform. See §12.3 for
  the full reasoning and current, accurate behavior. Kept here, struck through, as an
  honest record of what this original audit recommended — not a description of current
  behavior.

**Why this is the primary recommendation, not Option B or a 50/50 hybrid:** the strongest
evidence in this entire audit is that **web itself does not trust its own REST
`/auth/login`/`/auth/register`/`/auth/mfa/login-verify` surface for real authentication.**
Building mobile primarily around a path the existing product doesn't rely on would mean
debugging both mobile *and* a previously-unexercised part of the backend simultaneously,
and would still require inventing new backend work for social sign-in either way (Option
A gets social sign-in "for free" through Firebase's own credential model). Mirroring the
proven pattern is the lower-risk, evidence-grounded choice, and it fully satisfies "same
accounts and data on web and mobile" — both clients end up as peers presenting the same
kind of Firebase ID token to the same backend, verified by the same, already-exercised
primary path in `authenticateToken`.

**Main rejected alternative:** full Option B (backend REST as mobile's *primary* auth
mechanism, using its custom JWTs). Rejected specifically because (a) it requires a new,
unbuilt backend endpoint for social-credential exchange regardless, (b) it would make
mobile the first real-world exerciser of the `mfaRequired`/custom-JWT/`tokenVersion`
machinery with no production track record to lean on, and (c) it introduces a second,
divergent notion of "the user's session" (custom JWT vs. Firebase ID token) across web and
mobile simultaneously, which is exactly the kind of drift `WEB_TO_MOBILE_REUSE_STRATEGY.md`
§5 warns against.

**Duplicate-account prevention:** rely on Firebase Authentication's existing default
collision behavior (the same `auth/account-exists-with-different-credential` error web
already surfaces, per §2.4) rather than building new account-linking logic. Confirming
whether the Firebase project has "one account per email address" enabled is a genuine
open item for whoever has Firebase console access (§9) — this audit could not verify it
without that access, and mobile's UX for this error should not be finalized until it is
confirmed.

---

## 5. Complete mobile authentication flows

For each flow: existing reusable endpoint/service, mobile-native component required,
token/session behavior, security checks, error states, deep-link requirement, and any
unresolved dependency.

### 5.1 Email/password signup
- **Reuse:** Firebase `createUserWithEmailAndPassword`; backend `POST
  /auth/send-verification` right after.
- **Native component:** signup form screen (`mobile/src/features/auth/*`).
- **Token/session:** Firebase issues an ID token + refresh token immediately on
  account creation; persisted via RN persistence.
- **Security checks:** client-side password-strength check mirroring
  `frontend/src/utils/passwordValidation.js`'s rules (UX only — Firebase enforces the
  real minimum server-side); consent/terms checkbox, unchecked by default, matching web.
- **Error states:** `auth/email-already-in-use`, `auth/weak-password`,
  `auth/network-request-failed` (mirror web's retry-once-after-1.2s pattern from
  `AuthContext.jsx:16-24`).
- **Deep-link requirement:** none for signup itself.
- **Unresolved dependency:** none blocking; Firebase app registration not required for
  this flow specifically (§3).

### 5.2 Email verification
- **Reuse:** `POST /auth/send-verification` (currently builds a **web** continue-URL —
  see §2.3).
- **Native component:** a "check your email" screen with a resend button (mirroring
  `Auth.jsx`'s 60s cooldown) and an "I've verified" button that calls Firebase's
  `user.reload()` then re-checks `emailVerified` (mirrors `AuthContext.jsx:204-209`).
- **Token/session:** unchanged; `emailVerified` becomes `true` on the existing session
  once the link is followed and the user returns to the app.
- **Security checks:** none beyond what Firebase already enforces.
- **Error states:** resend rate-limited (`authLimiter`-adjacent); network failure.
- **Deep-link requirement:** **real, unresolved.** The link generated today points at
  the web dashboard. See §7 for what's needed to make it return to the app instead —
  **requires a client decision** (open question, phase tracker §10 item 7).
- **Unresolved dependency:** the deep-link decision above.

### 5.3 Verified-user login
- **Reuse:** Firebase `signInWithEmailAndPassword`; backend `POST /auth/verify` (audit
  log, fire-and-forget, non-blocking — mirror `AuthContext.jsx:157-158` exactly); `GET
  /users/profile` to load tier/MFA state.
- **Native component:** login form screen.
- **Token/session:** Firebase ID token attached to all subsequent API calls.
- **Security checks:** none beyond Firebase's own.
- **Error states:** `auth/wrong-password`, `auth/user-not-found` (Firebase's modern SDKs
  may report both as `auth/invalid-credential` — verify against the installed SDK
  version during implementation, not assumed here), `auth/too-many-requests`.
- **Deep-link requirement:** none.
- **Unresolved dependency:** none.

### 5.4 Unverified-user login / access blocking
- **Reuse:** same as 5.3, plus the same gating logic as `ProtectedRoute.jsx:61-112`.
- **Native component:** a blocking "Verify Your Email" screen shown in place of the main
  app shell — not a modal, an actual gate, mirroring web exactly. Must skip this gate for
  Google-authenticated users (`isGoogleUser` check, `ProtectedRoute.jsx:62`), and will
  need an equivalent check for Apple-authenticated users once that ships (Apple accounts
  are also pre-verified — confirm this holds for Sign in with Apple's Firebase provider
  during implementation).
- **Token/session:** session exists but the app shell is not shown.
- **Security checks:** this is a **client-side UX gate only** — it does not by itself
  prevent an unverified user from calling backend APIs directly with a valid Firebase ID
  token, exactly as is true on web today. If stricter server-side enforcement is desired,
  that is a **new backend consideration**, not something mobile can add unilaterally.
- **Error states:** resend failures, `reload()` failures.
- **Deep-link requirement:** shares the unresolved dependency from 5.2.

### 5.5 Forgot / reset password
- **Reuse:** `POST /auth/forgot-password` (always-200, anti-enumeration, matches web).
- **Native component:** a "forgot password" form/modal.
- **Token/session:** none — this flow doesn't touch the current session at all.
- **Security checks:** none beyond what the backend already does.
- **Error states:** network failure only (the endpoint never reports "email not found").
- **Deep-link requirement:** **real, unresolved** — the reset link uses Firebase's
  *default* hosted page today (not even the web app's own domain — see §2.3). A mobile
  user completing password reset will land in a browser on Firebase's generic page, not
  back in the app. This is a separate, arguably more pressing gap than email
  verification's, since it currently doesn't even return to *web*.
- **Unresolved dependency:** the deep-link decision in §7.

### 5.6 Logout
- **Reuse:** Firebase `signOut(auth)` **plus** `POST /auth/logout` (the deliberate
  improvement over web noted in §4).
- **Native component:** none beyond a logout button/menu item.
- **Token/session:** Firebase SDK clears its persisted session; app should also
  explicitly clear any locally-cached, non-Firebase-managed state (e.g. a cached
  `mfaVerified` flag).
- **Security checks:** none additional.
- **Error states:** `POST /auth/logout` is best-effort server-side (errors only logged,
  per `auth.js:432-450`) — mobile should still sign the user out locally even if that
  call fails, never block logout on it.
- **Deep-link requirement:** none.
- **Unresolved dependency:** none.

### 5.7 Persisted-session restoration (app relaunch)
- **Reuse:** Firebase's own RN-persisted session, restored automatically by
  `onAuthStateChanged` on app start (mirrors `AuthContext.jsx:75-101`), followed by a
  fresh `GET /users/profile` call.
- **Native component:** an app-startup loading/splash state (already exists in `app/
  _layout.tsx` from Phase 1) shown until the auth state resolves.
- **Token/session:** the SDK silently refreshes the ID token as needed.
- **Security checks:** re-fetch the profile on every relaunch rather than trusting a
  stale cached tier/MFA value — mirrors web's `fetchUserProfile` re-fetch on every
  `onAuthStateChanged` firing.
- **Error states:** profile-fetch failure → the same "Account data unavailable" retry
  screen pattern as `ProtectedRoute.jsx:37-59`.
- **Deep-link requirement:** none.
- **Unresolved dependency:** confirming Firebase JS SDK's RN persistence behaves
  identically across a full app-kill-and-relaunch (not just a background/foreground
  cycle) — a real-device test item for Phase 3, not assumed here.

### 5.8 Expired / revoked token
- **Reuse:** the exact three-way branch already in `middleware/auth.js` and already
  handled by web's response interceptor (`api.js:45-71`): a genuinely expired Firebase ID
  token triggers a normal SDK-managed silent refresh (most common case, invisible to the
  user); a `401 TOKEN_REVOKED` (custom-JWT path only — see §1, not expected to occur for
  a Firebase-ID-token-based mobile client under normal operation, but the client must
  still handle it defensively) forces a full re-login, never a retry loop; a `503
  AUTH_VERIFY_UNAVAILABLE` is treated as transient and retried with backoff, never
  treated as "logged out."
- **Native component:** none beyond the API client's interceptor logic
  (`mobile/src/services/api-client.ts`, Phase 4 scope).
- **Token/session:** as above.
- **Security checks:** never silently retry a `401`/`TOKEN_REVOKED` forever.
- **Error states:** covered above.
- **Deep-link requirement:** none.
- **Unresolved dependency:** none — this is a Phase 4 (API client) concern more than a
  Phase 3 (identity) concern, flagged here for completeness since it's part of the token
  lifecycle.

### 5.9 Google Sign-In
- **Reuse:** none directly reusable from web (`signInWithPopup` is browser-only, §2.1) —
  but the *destination* (`signInWithCredential`) and the backend contract are identical
  to email/password once a Firebase user session exists.
- **Native component:** `@react-native-google-signin/google-signin`'s native sign-in UI,
  wired to produce a Google ID token → `GoogleAuthProvider.credential(idToken)` →
  `signInWithCredential(auth, credential)`.
- **Token/session:** identical to email/password once the Firebase session exists.
- **Security checks:** handle `auth/account-exists-with-different-credential` exactly as
  web does (§2.4) — do not attempt custom linking without a resolved decision (§9).
- **Error states:** user-cancelled sign-in, network failure, the account-collision case
  above.
- **Deep-link requirement:** none (native SDK flow, not a browser redirect).
- **Unresolved dependency:** Google OAuth client IDs for Android/iOS (§7) — **requires
  Google Cloud/Firebase console access**, not something this audit can create.

### 5.10 Sign in with Apple
- **Reuse:** same destination pattern as Google — `signInWithCredential` with an
  `OAuthProvider('apple.com')` credential.
- **Native component:** `expo-apple-authentication`'s native sign-in UI/button (Apple's
  Human Interface Guidelines require this exact button style when offered).
- **Token/session:** identical pattern to Google/email.
- **Security checks:** Apple's privacy-relay email addresses (`@privaterelay.appleid.com`)
  should be treated as valid, real email addresses by the account system — no special
  handling was found to need building beyond what Firebase's Apple provider already does.
- **Error states:** user-cancelled, network failure, account collision.
- **Deep-link requirement:** none.
- **Unresolved dependency:** Apple Developer "Sign In with Apple" capability + Firebase
  console Apple-provider configuration (§7) — **requires Apple Developer account access**
  Flacron Enterprises LLC already holds per the phase tracker's ownership rules.
  **Policy note:** per Apple App Store guidelines, if Google Sign-In is offered on iOS,
  Sign in with Apple is **mandatory** alongside it — already noted in the phase tracker's
  Phase 3 scope.

### 5.11 MFA/TOTP challenge
- **Reuse:** `GET /users/profile` (`mfaEnabled` field) → `POST /auth/mfa/verify` — the
  proven, already-authenticated-session path (§1, §4) — **not** `/auth/mfa/login-verify`.
- **Native component:** a TOTP code-entry screen, rendered in place of the app shell
  (mirrors `MfaGate.jsx`'s role in the component tree, `ProtectedRoute.jsx:114`).
- **Token/session:** the Firebase session already exists at this point; a local
  `mfaVerified` flag (in-memory or a short-lived non-sensitive cache) gates the rest of
  the app, mirroring web's React-state-only `mfaVerified` (never persisted to disk on
  web — mobile should match this, not cache it across app restarts).
- **Security checks:** this is, like 5.4, a **client-side gate** layered on top of an
  already-valid Firebase session — mirrors an existing web characteristic, not a new
  weakness introduced by mobile.
- **Error states:** `401 INVALID_MFA_CODE`, `mfaLimiter` rate-limiting (10 min/8
  attempts).
- **Deep-link requirement:** none.
- **Unresolved dependency:** MFA parity for mobile v1 is itself an open product decision
  (phase tracker §10 item 3) — this flow describes *how* to build it if/when confirmed
  in scope, not a decision that it ships in v1.

### 5.12 Recovery-code login
- **Reuse:** same `POST /auth/mfa/verify` endpoint accepts a recovery code in place of a
  TOTP code (confirmed by the shared verification logic backing both `/auth/mfa/verify`
  and `/auth/mfa/login-verify` in the backend — the recovery-code check is not
  endpoint-specific).
- **Native component:** the same TOTP screen with a "use a recovery code instead" toggle
  (mirrors typical web UX for this pattern; verify web actually offers this toggle during
  implementation — not explicitly confirmed in this audit's scope).
- **Token/session, security checks, error states, deep-link:** identical to 5.11.
- **Unresolved dependency:** same as 5.11, plus confirming recovery-code UX parity with
  web during implementation.

### 5.13 Account disabled/deleted
- **Reuse:** Firebase Admin's `disabled` flag on the Auth user (if ever set — no code
  path in this repo currently sets it, so this is a hypothetical-but-real case to handle
  defensively) surfaces as `auth/user-disabled` on the client SDK; a fully deleted account
  (`DELETE /users/account`, `users.js:703-773`) simply means the account no longer exists
  — any subsequent sign-in attempt fails normally (`auth/user-not-found`).
- **Native component:** a generic "this account is no longer available" error state.
- **Token/session:** any cached session for a deleted account should fail on the next
  `authenticateToken` call (Firebase will reject a token for a deleted user).
- **Security checks:** none beyond surfacing the error clearly.
- **Error states:** `auth/user-disabled`, `auth/user-not-found`.
- **Deep-link requirement:** none.
- **Unresolved dependency:** none.

### 5.14 Transient backend/Firebase failure
- **Reuse:** the exact `503 AUTH_VERIFY_UNAVAILABLE` vs. `401 INVALID_TOKEN` distinction
  already built into `middleware/auth.js` (§2.1) — mobile must branch on this exactly
  like a correct client should, never collapsing both into one "auth failed" handler.
- **Native component:** a transient-error banner/retry affordance, not a forced logout.
- **Token/session:** session preserved; retry with backoff.
- **Security checks:** never treat a `503` as grounds to clear the session.
- **Error states:** covered above; also covers plain network failures
  (`auth/network-request-failed`, mirroring `AuthContext.jsx:16-24`'s retry-once pattern).
- **Deep-link requirement:** none.
- **Unresolved dependency:** none.

### 5.15 Switching between web and mobile using the same account
- **Reuse:** this "just works" as a consequence of §4's recommendation — both clients
  are Firebase-authenticated peers against the **same** Firebase project and the **same**
  backend `users/{uid}` Firestore doc. A report created on mobile is immediately visible
  on web and vice versa (already true of the existing web-only product, extended for
  free by not inventing a parallel mobile-only session model).
- **Native component:** none — this is an emergent property, not a built feature.
- **Token/session:** each platform holds its own independent Firebase session (its own
  ID/refresh token pair) for the same user — this is normal, expected multi-device
  Firebase behavior, not a conflict.
- **Security checks:** logging out on mobile does **not** log the user out on web (each
  session is independent) unless `POST /auth/logout`'s `revokeRefreshTokens` call is
  relied upon for a "log out everywhere" feature — which, per §1's limitation, only
  blocks *future* refreshes, not an already-valid, still-live ID token on the other
  device. Document this precisely if a "log out everywhere" feature is ever requested —
  it cannot be instantaneous with the current architecture on either platform.
- **Error states:** none specific.
- **Deep-link requirement:** none.
- **Unresolved dependency:** none.

---

## 6. Security and storage design

**What goes where:**

| Data | Storage | Why |
|---|---|---|
| Firebase session (ID token, refresh token) | Firebase SDK's own RN persistence (`AsyncStorage`-backed, via `getReactNativePersistence`) | This is Firebase's own documented, industry-standard mechanism — not something the app manages by hand. Millions of production apps rely on this exact pattern; it is an accepted trade-off (see the risk table below), not a red flag unique to this project. |
| Any additional token the app might cache itself (should be avoided if possible) | If unavoidable, `expo-secure-store` — **never** a manual duplicate in `AsyncStorage` | SecureStore is Keychain/Keystore-backed; duplicating a sensitive token into plain AsyncStorage on top of Firebase's own persistence would only add risk with no benefit. |
| MFA-verified flag for the current session | In-memory (React state) only, mirroring web exactly (`AuthContext.jsx`'s `mfaVerified` is never persisted) | Persisting this across app restarts would mean a device that's merely re-opened (not re-authenticated) skips the MFA gate — a real weakening of the control's intent. |
| Non-sensitive UI preferences (theme, last-viewed tab, etc.) | Plain `AsyncStorage` | Not sensitive; no reason to burden SecureStore's smaller storage budget with it. |
| Password, TOTP codes, recovery codes (in transit through the app) | Never persisted anywhere, in memory only for the duration of the request | Standard practice; also never logged (see below). |

**Token refresh and revocation:** rely on the Firebase SDK's automatic silent refresh;
branch explicitly on `401 TOKEN_REVOKED` vs. `503 AUTH_VERIFY_UNAVAILABLE` vs. plain `401
INVALID_TOKEN` per §5.8 — never collapse these into one handler.

**Safe logout cleanup:** call `signOut(auth)` (clears the Firebase-managed session) and
`POST /auth/logout` (best-effort, per §5.6); clear the in-memory `mfaVerified` flag; clear
any React-context user/profile state; do not attempt to clear `AsyncStorage` wholesale
(would also wipe unrelated non-auth preferences) — clear only auth-related keys if any
exist outside Firebase's own managed storage.

**Preventing authenticated-screen flashes:** gate the initial route decision on the
*first* `onAuthStateChanged` callback resolving (mirroring web's `loading` state,
`AuthContext.jsx:78,93`) — never render a default "logged out" or "logged in" screen
optimistically before that first callback fires. Keep the existing Phase 1
`app/_layout.tsx` splash-retention pattern until auth state is known.

**No password/token logging:** no `console.*` call should ever include a password, TOTP
code, recovery code, Firebase ID/refresh token, or API response body that might contain
one — mirrors the discipline already established in `mobile/src/config/env.ts` (Phase 2),
which never logs its own resolved values either.

**Request timeout and retry boundaries:** mirror web's existing pattern
(`frontend/src/services/api.js`): one retry on a 401 (force-refresh-then-retry), one
retry on 429 (after a fixed delay), retry-with-backoff on classified-transient
503/network errors — never an unbounded retry loop for any of these.

**401/403/transient 503/MFA-specific response handling:** covered in detail across §5.3,
5.4, 5.8, 5.11 above — the short version is: `401` on a Firebase-verifiable token almost
always means "refresh and retry once, then treat as logged out"; `403` means a real
authorization decision that must be respected as-is (never retried); `503
AUTH_VERIFY_UNAVAILABLE`/`PROFILE_LOOKUP_FAILED` means "the backend is having a moment,"
never "log the user out"; MFA-specific `401 INVALID_MFA_CODE` means "let the user retry
the code," not a session-level failure.

**Duplicate social/email account protection:** rely on Firebase's existing default
collision behavior (§2.4) — do not build custom linking logic without a resolved product
decision (§9).

**Server-side authorization as the source of truth:** restated from
`WEB_TO_MOBILE_REUSE_STRATEGY.md` §5 — every gated action's real answer comes from the
backend's response (`403 INSUFFICIENT_TIER`, etc.), never from a locally cached tier
value used as an enforcement decision.

### Threat / risk table

| Risk | Likelihood/Impact | Mitigation |
|---|---|---|
| Firebase RN session persisted in unencrypted `AsyncStorage` | Real, industry-standard trade-off; impact limited to a device already compromised at the OS/filesystem level | Accept as Firebase's documented posture; never duplicate the token into a second storage location; rely on OS app-sandboxing as the primary defense, same as Firebase's own guidance for every RN app using this pattern |
| `tokenVersion` revocation not exercised for Firebase-ID-token clients (§1) | Real, pre-existing product characteristic, not introduced by mobile | **SUPERSEDED 2026-09-08**: the recommendation that mobile's logout call `POST /auth/logout` was implemented, then reverted — see §12.3. Ordinary logout is local-only on both platforms now; server-side revocation is triggered only by an explicit password change. |
| Firestore `users/{userId}` update rule has no field-level guard on `mfaEnabled`/`tokenVersion`/`emailVerified` (§2.1) | Currently not exploited (web never writes these client-side) but a latent gap | Mobile must **never** write these fields via a direct Firestore client SDK call — always through the backend's Admin-SDK-mediated endpoints, exactly like web. Recommend a dedicated Firestore-rules hardening pass as separate, backend-owned follow-up work (out of this audit's scope) |
| Email-verification/password-reset links point at web/Firebase-default pages, not the app (§2.3) | Real UX gap, not a security vulnerability per se | Design mobile-appropriate `actionCodeSettings`/deep-linking (§7) before shipping Phase 3's verification/reset flows — flagged as unresolved, not silently worked around |
| Mobile becomes the first real exerciser of `/auth/login`'s `mfaRequired`/`mfaToken` path if Option B were chosen | Avoided entirely by this document's recommendation (§4) | N/A — mitigated by architecture choice, not by a runtime control |
| Duplicate accounts via unlinked Google/Apple/email identities sharing an email | Depends on an unconfirmed Firebase console setting (§2.4, §9) | Confirm the "one account per email" setting before finalizing UX for the collision error; do not build custom linking without that confirmation |
| Native Google/Apple credential exchanged for a Firebase session, but the corresponding Firebase provider is misconfigured | Would surface as a hard sign-in failure, not a silent security gap | Standard implementation-time verification against a real Firebase test account before Phase 3 is considered complete |

---

## 7. Native provider and deep-link requirements (identification only — nothing created here)

- **Firebase iOS/Android app registration**: not required for basic email/password auth
  (§3). **Is** required to obtain platform-specific Google/Apple OAuth client
  configuration. Requires **Firebase console access** (already available per the phase
  tracker's confirmed EAS/Firebase ownership under `flacron-enterprises-llc`).
- **Google OAuth client IDs for Android/iOS**: obtained via Google Cloud Console (linked
  to the same Firebase project) — distinct from the "Web client ID" the web app's popup
  flow already uses. Requires the confirmed `com.flacronenterprises.flacronai` bundle
  ID/package name (already fixed, phase tracker §2) to be registered against these
  client IDs. **Requires Google Cloud/Firebase console access.**
- **Android SHA certificate fingerprints**: needed when a real (non-Expo-Go) Android
  build's signing certificate is known — i.e., once EAS build credentials exist. Not
  needed for Expo Go testing of email/password auth; **is** needed before Android Google
  Sign-In can work in a development or production build. **Requires EAS build
  credentials to exist first** (a later, build-time dependency, not something this audit
  can produce now).
- **Apple Sign-In capability**: enabled on the App ID in the Apple Developer portal
  (`com.flacronenterprises.flacronai`), plus a Services ID/Team ID/private key configured
  in Firebase's Apple provider settings. **Requires Apple Developer account access**
  (Flacron Enterprises LLC-owned, per phase tracker ownership rules).
- **URL scheme `flacronai`**: already configured in `mobile/app.config.ts` (Phase 1,
  unchanged by this audit) — available to use as the basis for a custom deep link (e.g.
  `flacronai://auth/verified`) if that approach is chosen for §5.2/§5.5, pending the
  client decision in §9.
- **Email-verification and password-reset return links**: currently web-only/
  Firebase-default (§2.3). Two realistic options to resolve this, **neither implemented
  by this audit**: (a) configure `actionCodeSettings` with `handleCodeInApp: true` and a
  Firebase Dynamic-Links-free custom domain or the app's own `flacronai://` scheme, so
  the link opens directly in the app; or (b) keep the link web-based but have the web
  page detect a mobile user-agent and offer a "return to app" affordance. This is a
  **product/design decision requiring your input**, not something to default into
  silently.
- **Expo Go vs. development build**: email/password auth (Option A's core) works in
  Expo Go, consistent with Phase 1's existing validation. Native Google/Apple Sign-In
  require an **EAS development build** — Expo Go cannot load their native modules. This
  is a real, concrete change to the Phase 1 testing workflow, addressed in §8.

---

## 8. Development testing strategy

Given the confirmed environment facts from Phase 1/2 (§10 of the phase tracker):

- **Android Emulator** can reach a local backend at `http://10.0.2.2:3000/api/v1`
  (already documented in `mobile/README.md`'s "Running on different targets" table) —
  usable for email/password auth testing against a real local dev backend today, no new
  work needed.
- **Physical Android device** needs the development machine's current LAN IP (never
  hardcoded — already enforced by `mobile/src/config/env.ts`'s Phase 2 addendum) for
  actual API/auth traffic. **Correction (2026-09-08 follow-up audit): `npx expo start
  --tunnel` does NOT substitute for this.** Tunnel mode only carries Metro's JS-bundle
  traffic (port 8081) to Expo Go; it has no effect on `EXPO_PUBLIC_API_BASE_URL` requests,
  which go straight from the phone to `http://<host>:3000` regardless of how Metro was
  started. Phase 1's own successful tunnel-mode device test (§4/§8 of the phase tracker)
  only exercised the app shell loading — it made no backend API calls — so it does not
  demonstrate that tunnel mode reaches the backend, and it doesn't. See `README.md`'s
  "Running on different targets" table for the corrected guidance.
- **Windows "Public" network firewall** previously blocked direct LAN access to Metro
  outright (Phase 1 finding). For Phase 3's auth testing, the backend (port 3000) needs
  the same treatment: either switch the network profile to `Private` (see
  `Get-NetConnectionProfile` in `README.md`) so an inbound firewall rule for Node/port 3000
  is possible, or run a second, separate tunnel pointed at port 3000 (not Metro's). This
  audit does not perform any firewall change itself.
- **Production/preview API origin remains unresolved** (Phase 2, phase tracker §10 item
  1) — Phase 3's auth testing should target the **confirmed local-dev origin** exclusively
  (`http://localhost:3000/api/v1` for iOS Simulator/web, the per-target values above for
  Android/physical device) against a real local `backend/` instance. **Do not invent a
  production URL to test against** — this would repeat the exact category of error this
  repository has already had to correct once (the fabricated `api.flacronai.com`
  incident referenced throughout `MOBILE_DEVELOPMENT_PHASES.md`).
- **Email/password auth**: fully testable in Expo Go against a local dev backend, using
  a real dev Firebase account. No native module, no development build required.
- **Google/Apple Sign-In**: **cannot** be tested in Expo Go at all (native modules).
  Requires building and installing an EAS **development build** (`eas build --profile
  development`) on a real device or simulator — a genuinely new step beyond Phase 1's
  Expo-Go-only validation. This should be planned for explicitly when Phase 3
  implementation begins, not discovered mid-phase.
- **MFA/recovery-code flows**: testable against the local dev backend using a real dev
  account with MFA enabled via the *web* app first (since there's no faster way to
  enable MFA on an account than the already-working web Settings page) — no new backend
  test infrastructure is needed.
- **Recommended safest physical-device auth-test sequence, corrected 2026-09-08**: (1)
  iOS Simulator or Expo web against `localhost` first — zero network complexity, exercises
  the same auth code paths; (2) Android Emulator against `10.0.2.2` — still fully local, no
  firewall exposure, closest thing to a "real device" without one; (3) only once (1)/(2)
  pass, a physical Android phone on the **same Wi-Fi** as the dev machine, with the
  machine's network profile set to `Private` and an inbound firewall allow-rule for port
  3000, using `EXPO_PUBLIC_API_BASE_URL=http://<LAN-IP>:3000/api/v1` — Metro itself can run
  in either LAN or tunnel mode for this, since only the backend connection matters here, not
  the bundler connection. Do not rely on Metro tunnel mode to make the backend reachable
  (see correction above) and do not test over a network Windows classifies "Public" without
  first switching it, per the Phase 1 finding.

---

## 9. Unresolved decisions (requires your input, not decided here)

1. **MFA parity for mobile v1** — ship at launch (via the proven `/auth/mfa/verify` gate
   described in §5.11) or document as a v1 limitation. (Phase tracker §10 item 3.)
2. **Email-verification / password-reset deep-link approach** — custom `actionCodeSettings`
   + `flacronai://` scheme, vs. a web-based "return to app" affordance, vs. something
   else. (§7; phase tracker §10 item 7 — this document narrows that open question to two
   concrete options rather than resolving it.)
3. **"One account per email address" Firebase project setting** — this audit could not
   verify it without Firebase console access; it determines the exact UX needed for
   §5.9/§5.10's account-collision case. **Requires Firebase console access to check.**
4. **PARTIALLY RESOLVED 2026-09-08, scope deliberately corrected same day.** Ordinary
   logout still cannot, and per the rollout-safety correction now deliberately does not,
   invalidate an already-issued ID token instantly — that limitation described here
   remains true for logout specifically (see §12.3: an earlier version of this fix made
   logout do exactly that, which a review correctly flagged as silently turning ordinary
   Sign Out into an all-devices kill, and it was reverted). What IS fixed: an explicit
   security event (password change) now does invalidate every other session instantly, via
   a `tokenValidAfter` timestamp (not a JTI denylist; smaller change, same effect, zero
   extra Firestore reads). A dedicated "log out everywhere" *feature* (a user-initiated
   action distinct from both logout and password change) remains unbuilt and still
   requires a product decision if ever wanted — it would reuse the same primitive from a
   new, explicit trigger.
5. **Auth client strategy sign-off** — this document's recommendation (§4) directly
   answers phase tracker §10 item 2, but is presented here as a recommendation **pending
   your approval**, not a decision already made.

---

## 10. Implementation boundaries for Phase 3 (once approved)

Restated from the phase tracker's existing Phase 3 scope, refined by this audit:

- **In scope**: Firebase JS SDK integration with RN persistence; native Google Sign-In
  and Sign in with Apple via credential exchange into Firebase; `expo-secure-store`
  usage limited to whatever the app itself needs beyond Firebase's own session (ideally
  nothing extra); reuse of `POST /auth/verify`, `/auth/send-verification`,
  `/auth/forgot-password`, `/auth/mfa/status`, `/auth/mfa/setup`, `/auth/mfa/verify-setup`,
  `/auth/mfa/verify`, `/auth/mfa/disable`, `/auth/logout`, `DELETE /users/account`.
- **Explicitly out of scope for Phase 3** (unchanged from the existing tracker): any
  dashboard data fetch beyond a logged-in confirmation call; the backend REST
  `/auth/login`/`/auth/register`/`/auth/mfa/login-verify` path as mobile's primary
  mechanism (per §4's recommendation); any new backend endpoint (social-credential
  exchange is handled entirely client-side via Firebase, requiring no backend change);
  any Firestore-rules change (flagged as separate follow-up work in §6, not Phase 3
  work); any credential creation, OAuth client creation, or Apple/Google console
  configuration performed by this audit or without your explicit action.
- **Completion criteria** (unchanged): a real account authenticates end-to-end on both
  platforms, tested per §8's strategy, against the confirmed local-dev origin.

---

## 11. Phase 3 implementation — final security re-verification, what was built, and status
*(appended 2026-09-08, same day as §§1–10, a later session — implementation session)*

### 11.1 Final security verification (re-checked against current code before writing any code)

1. **Is MFA enforced server-side, or only through the web UI?** — **Only through the
   client UI, on both web and (necessarily, by construction) mobile.** Re-confirmed by a
   repo-wide grep for `mfaEnabled`/`mfaVerified` across `backend/`: the only matches are in
   `backend/routes/auth.js` (the MFA endpoints themselves) and
   `backend/services/organizationService.js` (unrelated — org role resolution, not auth
   gating). **`backend/middleware/auth.js`'s `authenticateToken` — the gate on every
   protected route, including `reports.js`, `users.js`, `payment.js`, etc. — never checks
   `mfaEnabled` or any MFA-verified state.** A valid Firebase ID token is sufficient to
   call any protected endpoint regardless of whether the account has MFA enabled or
   whether the MFA challenge was ever completed. This is a real, current, pre-existing gap
   on web today — mobile does not introduce it, and mobile's MFA screen is, by necessity,
   exactly the same kind of client-side gate web's `MfaGate.jsx` already is (confirmed by
   `POST /auth/mfa/verify`'s own comment in `auth.js`: *"this only confirms possession of
   the second factor before unlocking the app UI"* — it does not mint a different,
   more-privileged token). **Per the task's explicit instruction, no backend change was
   made or proposed to close this gap** — implementing genuine server-side MFA enforcement
   would require every protected route (or `authenticateToken` itself) to check
   `mfaEnabled` against a per-session "MFA completed" signal, which does not exist in the
   token itself today (the Firebase ID token carries no MFA-completion claim). **This
   remains an open, reported gap**, not something Phase 3 could or did close.
2. **Does backend logout/token revocation apply to Firebase sessions?** — **Partially,
   confirmed by direct re-read of `POST /auth/logout` (`auth.js:432-450`).**
   `getAuth().revokeRefreshTokens(uid)` immediately blocks any *future* silent token
   refresh for that user, and bumps `tokenVersion` (which only matters for the
   custom-JWT fallback path, not Firebase ID tokens — see §1). **It does not, and by
   Firebase's own design cannot, invalidate an already-issued, still-valid Firebase ID
   token before its natural ≤1-hour expiry.** Mobile's `AuthProvider.logout()` calls this
   endpoint (a deliberate improvement over web, which skips it — §4) for the partial
   benefit it provides, and this limitation is surfaced in code comments at the exact call
   site, not just here.
3. **What is the officially supported Firebase React Native persistence mechanism for the
   installed versions?** — `initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) })`,
   using `@react-native-async-storage/async-storage`. Confirmed empirically, not just from
   docs: `firebase@12.18.0`'s own `firebase/auth` wrapper re-exports everything from
   `@firebase/auth@1.13.5` (`export * from '@firebase/auth'`), whose `package.json`
   `exports` map has a `"react-native"` condition resolving to a build that genuinely
   contains `getReactNativePersistence` (read directly:
   `node_modules/@firebase/auth/dist/rn/index.rn.d.ts`). **A real, separate gap was found
   and fixed along the way**: `@firebase/auth`'s own `exports` map lists an unconditional
   `"types"` key ahead of its `"react-native"` condition's nested `"types"` entry, which
   makes TypeScript (even with `expo/tsconfig.base`'s `customConditions: ["react-native"]`)
   resolve `getReactNativePersistence` to a generic declaration file that doesn't declare
   it — a real, current TypeScript-only gap in the `firebase`/`@firebase/auth` npm
   packages themselves (matches several open `firebase-js-sdk` GitHub issues). Fixed via a
   minimal, narrowly-scoped ambient type augmentation
   (`src/types/firebase-rn.d.ts`) with the exact signature copied from `@firebase/auth`'s
   own `.d.ts` — not invented — plus importing `initializeAuth`/`getReactNativePersistence`
   directly from `@firebase/auth` in `src/services/firebase/client.ts` (documented in that
   file's header). Verified correct at the RUNTIME level (not just typecheck) by a clean
   `npx expo export` for both iOS and Android (see §11.7) — the real compiled bundle
   resolves and includes this code path without error.
   **AsyncStorage trade-off, stated explicitly (not glossed over)**: this persists the
   Firebase session (ID token, refresh token) in `AsyncStorage`, which is **unencrypted**
   on-device storage (SharedPreferences on Android, a plist-backed file on iOS) — unlike
   `expo-secure-store`'s Keychain/Keystore backing. This is Firebase's own documented,
   industry-standard RN pattern, not a shortcut taken here; the mitigation is OS-level app
   sandboxing, the same posture the vast majority of production RN apps using this exact
   SDK pattern rely on. No token is ever additionally duplicated into a second storage
   location.
4. **Account-linking behavior for email, Google, and Apple providers** — unchanged from
   §2.4, re-confirmed: `Auth.jsx` (web) catches
   `auth/account-exists-with-different-credential` and shows a message; **no
   `linkWithCredential` call exists anywhere in the repo**. Mobile's `googleSignIn.ts`/
   `appleSignIn.ts` do not add any linking logic either — per §4's recommendation, this
   relies entirely on Firebase's own default collision behavior. The Firebase project's
   "one account per email address" setting remains unverifiable without console access
   (§9 item 3, still open).
5. **Which features require an Expo development build instead of Expo Go?** — Re-verified
   directly against the installed packages' own source, not assumed from the earlier
   audit:
   - **Google Sign-In (`@react-native-google-signin/google-signin`) requires a
     development build.** Confirmed by reading `NativeGoogleSignin.d.ts`: it's a
     TurboModule (`export declare const NativeModule: Spec`), and the underlying JS
     implementation calls `TurboModuleRegistry.getEnforcing(...)` at module-load time,
     which throws immediately if the native module isn't linked — true in Expo Go by
     construction (third-party native modules aren't bundled into the Expo Go client app).
     **This is why `src/features/auth/services/googleSignIn.ts` never statically imports
     that package** — it's lazily `require()`'d only inside `signInWithGoogle()`, which is
     itself only reachable once `isGoogleSignInConfigured()` is true (never in this repo's
     current state, since no Google OAuth client ID exists yet) — see that file's header
     comment for the full reasoning. Verified this doesn't break Expo Go for the rest of
     the app via a clean `npx expo export` (§11.7).
   - **Sign in with Apple (`expo-apple-authentication`) — CORRECTION to the original §3/§7
     audit above, which said it "also requires a development build."** Direct verification
     (reading `ExpoAppleAuthentication.js`'s source, and Apple's own current Expo docs)
     shows this is a first-party Expo SDK module that degrades gracefully
     (`requireOptionalNativeModule(...) || <fallback with isAvailableAsync() => false>`)
     rather than throwing when unavailable, and **Expo's own documentation states
     explicitly: "You can test this library in Expo Go on iOS without following any of the
     instructions above."** It is therefore safe to import statically (done in
     `appleSignIn.ts`) and the native sign-in picker itself is Expo-Go-testable on iOS —
     with the caveat that the identifiers Apple returns differ from a real standalone
     build, and completing an actual Firebase sign-in still additionally requires the
     Apple Developer "Sign In with Apple" capability + Firebase console Apple-provider
     configuration (neither exists yet), so it remains "prepared and implemented," not
     functionally complete, until that manual configuration happens. The `ios.usesAppleSignIn`
     entitlement + `expo-apple-authentication` config plugin WERE safely added to
     `app.config.ts` this phase (no secret/credential required for that specific addition —
     see §11.4).
   - **Email/password auth** (Firebase JS SDK) works fully in Expo Go, unchanged from the
     original audit.

### 11.2 Architecture decision — confirmed, adopted as written

The §4 recommendation (Firebase Client SDK for identity, native credential exchange for
Google/Apple into Firebase, backend REST for profile/MFA/audit only, backend
`/auth/login`+`/auth/register`+`/auth/mfa/login-verify` deliberately unused) was
implemented exactly as specified. **One real-code detail the original audit missed**,
found while implementing sign-up: the actual web sign-up flow (`Auth.jsx`'s
`persistSignupProfileDetails`) does more than call Firebase's `createUserWithEmailAndPassword`
— it also calls `usersAPI.getProfile()` (which auto-creates the default Firestore profile
doc transactionally) → `usersAPI.updateProfile({firstName,lastName,company,displayName})`
→ `usersAPI.recordRegistrationConsent(policyVersion)` (Golden Rule #5's required Terms/
Privacy consent record) → `authAPI.sendVerification()`, all non-blocking after the Firebase
user is created. Mobile's `SignUpScreen.tsx` mirrors this exact sequence, including reusing
the same `REGISTRATION_POLICY_VERSION` constant value (`'2026-03-01'`, kept in sync via a
comment on both sides) — not a simplified version of it.

### 11.3 Flows implemented (see §5 above for the full per-flow spec each of these follows)

| Flow | Status | Notes |
|---|---|---|
| Email/password sign-up | Implemented | First/last name, work email, optional company, password+confirm, Terms checkbox (never pre-checked), full backend profile/consent contract (§11.2) |
| Email/password login | Implemented | Loading + duplicate-submit prevention, sanitized error messages |
| Email verification | Implemented, with the documented limitation | Uses the existing web-continue-URL behavior as-is (opens in-browser, lands on the web dashboard) per the task's explicit instruction not to invent an unverified deep-link flow; "I've Verified My Email" reloads the Firebase user and re-checks |
| Forgot password | Implemented, with the documented limitation | Same anti-enumeration backend behavior; reset completes on **Firebase's own default hosted page** (not even the web domain — confirmed unchanged in `auth.js:477`) |
| Logout + session restoration | Implemented | ~~Backend `/auth/logout` call added (mobile-only improvement over web, §4)~~ **SUPERSEDED 2026-09-08 — that call was removed, see §12.3; logout is local-only, matching web.** Splash held until both fonts AND first auth-state resolution complete (unaffected by the correction) |
| Google Sign-In | Implemented, configuration-gated/blocked | Code complete; blocked on a real Google OAuth client ID (console access required, §7) and an EAS development build |
| Sign in with Apple | Implemented, configuration-gated/blocked | Code complete, entitlement enabled in `app.config.ts`; blocked on Apple Developer capability + Firebase console Apple-provider config (§7) |
| MFA/TOTP + recovery-code challenge | Implemented, with the server-side gap stated in §11.1 item 1 | Uses the proven `POST /auth/mfa/verify` gate, not the untested `/auth/mfa/login-verify` path, per §4 |
| Route guards | Implemented | Expo Router `Stack.Protected`, fail-closed, single `computeAuthStatus()` pure decision function — see §11.5 |
| Account-data-unavailable recovery | Implemented (not in the original task list, added as a necessary consequence) | A signed-in user whose profile fetch fails needs a real route to land on — see §11.6 |

### 11.4 Files created/modified

**New:**
`src/config/firebaseConfig.ts` (+`.test.ts`), `src/types/firebase-rn.d.ts`,
`src/types/api.ts`, `src/services/firebase/client.ts`,
`src/services/api/{client,auth,users}.ts`,
`src/features/auth/{types,constants}.ts`,
`src/features/auth/context/{AuthProvider,authStatus}.ts(x)` (+`.test.ts`/`.test.tsx`),
`src/features/auth/utils/{validation,errorMessages}.ts` (+`.test.ts`),
`src/features/auth/services/{googleSignIn,appleSignIn}.ts` (+`.test.ts` for googleSignIn),
`src/features/auth/components/{AuthTextInput,PasswordInput,PrimaryButton,FormError,TermsCheckbox,SocialSignInButtons,AuthFormScroll}.tsx`,
`src/features/auth/screens/{LoginScreen,SignUpScreen,ForgotPasswordScreen,VerifyEmailScreen,MfaScreen,ConfigRequiredScreen,AccountUnavailableScreen}.tsx`,
`app/{login,signup,forgot-password,verify-email,mfa,account-unavailable}.tsx`,
`app/(app)/{_layout,home}.tsx`, `jest.config.js`, `jest.setup.js`.

**Modified:** `app/_layout.tsx` (route guards + splash gating), `app/index.tsx` (now the
single anchor/redirect route — the Phase 1 branded placeholder moved to `app/(app)/home.tsx`
as the new protected placeholder, per the task's "placeholder protected content only"
instruction), `app.config.ts` (`ios.usesAppleSignIn` + `expo-apple-authentication` plugin —
both safe, credential-free additions), `.env.example` (Firebase + Google client ID
variable names, no values), `tsconfig.json` (`types: ["jest"]`), `package.json` (deps +
`test` script), this file, `MOBILE_DEVELOPMENT_PHASES.md`, `README.md`.

**Untouched, confirmed:** `frontend/`, `backend/` — `git status --porcelain frontend
backend` empty throughout this session (checked repeatedly, including at the end — see
final report).

### 11.5 Route guard design

`app/_layout.tsx` uses Expo Router's `Stack.Protected` (the current official pattern,
verified against Expo's live documentation this session), with every guard condition
computed from one pure function, `computeAuthStatus()`
(`src/features/auth/context/authStatus.ts`), fed by `AuthProvider`'s React state. Fail-closed
by construction: every protected group has an explicit boolean guard; `app/index.tsx` is
the one always-reachable, unguarded anchor route, and it renders nothing (`return null`)
while `status === 'loading'` rather than guessing a destination — the splash screen stays
up for that entire window (`SplashScreenController` in `app/_layout.tsx`), so no protected
or wrong-auth-state content can ever flash before the first Firebase auth-state resolution
completes.

### 11.6 Deviation from the original task list, and why

The task's flow list didn't include an "account data unavailable" screen, but building the
route-guard state machine surfaced a real correctness bug during implementation: a signed-in
Firebase user whose backend profile fetch genuinely fails (mirrors a real, previously-live
web incident documented at length in `backend/middleware/auth.js`'s own comments —
`AUTH_VERIFY_UNAVAILABLE`/`PROFILE_LOOKUP_FAILED`) has `firebaseUser` set but no profile —
routing them to `/login` would loop forever, since `Stack.Protected`'s `signed-out` guard is
`false` for them (they do have a Firebase session) and would bounce them straight back to
the anchor route, which would send them to `/login` again. `account-unavailable.tsx` (→
`AccountUnavailableScreen`, mirroring `ProtectedRoute.jsx`'s existing inline "Account data
unavailable" card) with its own guard and a `retryProfile()`/`logout()` action closes this
gap. This was added because leaving it out would have shipped a real infinite-redirect bug,
not as unrequested scope creep.

### 11.7 Tests and validation results (all commands run from `mobile/`, this session)

| Command | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npx expo lint` | 0 errors, 0 warnings |
| `npx expo-doctor` | 21/21 checks passed |
| `npx expo install --check` | Dependencies up to date |
| `npx expo config --json` (development env) | Identity unchanged: `name`/`slug`/`owner`/`version`/`scheme`/`ios.bundleIdentifier`/`android.package`/`extra.eas.projectId` all match the confirmed table in the phase tracker §2; `ios.usesAppleSignIn: true` newly present, as intended |
| `npx jest` | **6 suites, 59 tests, all passing** (re-run 3× to rule out flakiness — stable) |
| `npx expo export --platform ios` | Clean bundle, 1236 modules, 0 errors — proves the full module graph (including `firebase`, `@firebase/auth`, AsyncStorage, `expo-apple-authentication`, and the lazily-guarded `@react-native-google-signin/google-signin` path) resolves and compiles for real, not just under Jest's mocked environment |
| `npx expo export --platform android` | Clean bundle, 0 errors — same proof, second platform |
| `git status --porcelain frontend backend` | Empty throughout |
| Secret/credential scan (`AIza...`, `-----BEGIN`, `sk_live`/`sk_test`, `AKIA...`, inline password/secret assignments) across the full diff + every new file | No matches |
| `git check-ignore -v .env .env.local node_modules .expo` | All correctly ignored |
| `find` for `google-services.json`/`GoogleService-Info.plist`/`*serviceAccount*` | None created |
| `git diff --check` | Clean (only benign LF→CRLF line-ending notices, not whitespace errors) |

**Test coverage by requirement category** (task §7's list):
- **Signup/login validation, strong-password rules** — `utils/validation.test.ts` (18
  tests): min-length/uppercase/lowercase/number/special-character rules individually and
  combined, email format, full sign-up/login validators including the Terms-checkbox
  requirement and the login/signup password-strength asymmetry (mirrors
  `Auth.jsx`'s own comment: password strength is enforced at signup, not login, so a
  legacy account with an older, weaker password already on file can still sign in).
- **Auth-state restoration, route-guard decisions, unverified-user blocking, MFA
  routing** — `context/authStatus.test.ts` (11 tests) exercises the exact pure decision
  function every guard uses — loading→signed-out→profile-fetch-in-flight→
  profile-unavailable→needs-email-verification (and the Google/Apple exemption)→needs-mfa
  (and the ordering between the email-verification and MFA gates)→authenticated — **plus**
  `context/AuthProvider.test.tsx` (6 tests, using `@testing-library/react-native` with
  Firebase/backend mocked at the module boundary) exercises the same behavior through the
  real `AuthProvider` component: real `onAuthStateChanged` restoration, blocking an
  unverified user, and NOT blocking a Google-authenticated one.
- **Email-verification refresh** — covered at the state-machine level (mfa/verification
  gate transitions above); `VerifyEmailScreen`'s own `reloadUser()`-then-recheck flow is
  not independently unit-tested (would need a fuller component-level test — judged lower
  value than the state-machine coverage given time, see below).
- **Logout cleanup** — `context/AuthProvider.test.tsx`: asserts logout calls **both** the
  backend `/auth/logout` endpoint and Firebase `signOut`, clears session state back to
  `signed-out`, and — critically — still signs the user out locally even when the
  best-effort backend call rejects (never lets a network hiccup trap a user mid-logout).
- **Firebase/backend error mapping** — `utils/errorMessages.test.ts` (11 tests): every
  mapped Firebase code, confirms an *unmapped* code/message is never leaked to the user,
  confirms `ApiRequestError` code-to-message mapping, and the `isTransientErrorCode()`
  helper that prevents `AUTH_VERIFY_UNAVAILABLE`/`PROFILE_LOOKUP_FAILED` from ever being
  treated as a sign-out reason.
- **MFA routing/handling** — covered by `authStatus.test.ts`'s MFA-gate cases above (the
  actual TOTP-code submission call isn't separately unit-tested — it's a thin wrapper
  around `authApi.mfaVerify()`, already covered by `services/api/auth.ts`'s design and the
  backend contract re-verified in §11.1).
- **Social-provider configuration gating** — `services/googleSignIn.test.ts` (3 tests):
  confirms `isGoogleSignInConfigured()` is false in this repo's real current state, and —
  the one this test suite cares most about — confirms `signInWithGoogle()` throws a clear
  "not configured" error and **never reaches the lazy `require()` of the native module**
  when unconfigured (the exact Expo Go crash risk this architecture is designed to avoid).
  Apple's equivalent (`isAppleSignInAvailable()`) isn't separately unit-tested — its only
  real logic is a `Platform.OS === 'ios'` check plus a pass-through to a first-party Expo
  API that already degrades gracefully by design (verified by reading its source in
  §11.1 item 5), judged not to need its own test given how thin it is.
- **Resolved Expo configuration and identifier checks** — `expo config --json`, this
  table's own row above.
- **Secret/credential scan, `git diff --check`, frontend/backend isolation** — this
  table's own rows above.

**Not done — physical/simulator device run in Expo Go**: static validation (typecheck,
lint, doctor, and — the strongest proxy available without a device — a full `expo export`
for both platforms, which compiles the real production module graph, not a mocked test
environment) all passed. An actual on-device Expo Go run (like Phase 1's physical Android
phone test) requires a human to scan a QR code / interact with a real device or simulator,
which this session could not do autonomously. **Recommended before considering Phase 3
fully validated**: run `npx expo start` (or `--tunnel`, per `README.md`'s existing
Windows-firewall guidance) and walk through sign-up → email verification (check the
verification email arrives and its link's behavior) → sign-out → sign-in → forgot-password
on a real device, against a locally-running `backend/` with a real dev Firebase project —
this still requires the Firebase config gap in §11.8 to be closed first.

### 11.8 Firebase/Google/Apple manual setup still required (none of this was created by this session — all require console/portal access this session doesn't have)

1. **Register an iOS and Android "app" on the existing `flacronai` Firebase project**, and
   populate `EXPO_PUBLIC_FIREBASE_*` in a local `.env.local` (git-ignored) — until this is
   done, the app correctly shows `ConfigRequiredScreen` instead of attempting to
   initialize Firebase with blanks (verified — see `src/config/firebaseConfig.ts` and
   `AuthProvider`'s early-exit, both exercised by tests).
   **Android — CONFIRMED 2026-09-09 (manual console check, reported by client, not
   independently re-derived by this session): app "FlacronAI Mobile" already registered
   in the correct existing project `flacronai-c8dab`, package
   `com.flacronenterprises.flacronai`; a SHA-1 fingerprint is already attached;
   `google-services.json` is available for download. Not yet downloaded, placed, or
   committed in this repo — see item 3 and §11.8a below.** iOS app registration: still
   not started (see the new §11.8b below).
2. **Google OAuth client ID(s)** (Web + optionally iOS-specific) from Google Cloud/Firebase
   console, set as `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`/`EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` —
   until then, `isGoogleSignInConfigured()` stays false and the button stays disabled
   (verified by test).
3. **`@react-native-google-signin/google-signin`'s Expo config plugin** needs to be added
   to `app.config.ts` **once** the above client IDs (or a `google-services.json`/
   `GoogleService-Info.plist`) exist — deliberately NOT added yet, since adding it now with
   no real values would misconfigure every build silently.
4. **Apple Developer "Sign In with Apple" capability** enabled on the
   `com.flacronenterprises.flacronai` App ID, and the **Apple provider configured in the
   Firebase console** (Services ID/Team ID/private key) — the `usesAppleSignIn`
   entitlement + config plugin are already wired in `app.config.ts` (safe, credential-free),
   but a real sign-in cannot complete without this.
5. **An EAS development build** to test Google Sign-In at all (Expo Go cannot load it —
   §11.1 item 5); Apple Sign-In's native picker can be tested in Expo Go on iOS today, but
   a full round-trip Firebase sign-in still needs item 4 above.
6. Android SHA certificate fingerprints for Google Sign-In — needed once real EAS build
   signing credentials exist (a later, build-time dependency; correctly out of reach right
   now per the phase tracker's own git/build-safety rules).
   **Update 2026-09-09: an SHA-1 is already attached to the Firebase Android app (see item
   1). Read-only check this session (`eas build:list --platform android` → empty array)
   confirms zero EAS builds have ever run for this project, so no EAS-managed Android
   keystore/signing credential exists yet — the attached SHA-1 cannot be an EAS build
   certificate and did not come from this repo/session. Its actual source (e.g. a local
   debug keystore, or one added manually) is unknown to this session and was not guessed.
   `eas credentials` was deliberately not run interactively (no `--non-interactive` flag
   exists for it, and it can offer to generate/replace credentials — out of scope per
   instruction). Net effect: Google Sign-In on a real EAS development build will need a
   fingerprint matching whatever keystore that build actually signs with — likely a new
   EAS-managed one the first time `eas build -p android --profile development` runs — added
   to Firebase alongside (not replacing) the existing entry. SHA-256 is not strictly
   required for the Google Sign-In OAuth client itself, but Firebase recommends adding it
   too (used for Play Integrity/App Check and Dynamic Links) — add from the same keystore
   when convenient, not blocking.
   Re-confirmed 2026-09-09 (client's own manual console + CLI check, same session): SHA-1
   source still unknown; no EAS Android build or EAS-managed signing credential exists.
   Unchanged from the above.**

### 11.8c Console-verified provider/status findings (2026-09-09, manually checked by client — not independently re-derived by this session; identifiers redacted per instruction)

- **Email/Password provider:** confirmed enabled.
- **Google provider:** confirmed enabled; a Web OAuth client ID already exists for it
  (value not recorded here — public identifier, held in `.env.local` only once supplied).
- **Account linking:** set to "Link accounts that use the same email" — i.e. one account per
  email address across providers, consistent with the web app's existing behavior and with
  what Phase 3's design already assumes (§9 of this document).
- **Apple Sign-In capability:** was previously **disabled** on App ID
  `com.flacronenterprises.flacronai`; the client manually enabled and saved it in the Apple
  Developer portal, under the Flacron Enterprises LLC team, this session. No Services ID,
  key, or credential was created — enabling the capability on the App ID is the only change
  made.
- **No new resource created**: no new Firebase project/app, Android app, Apple App ID, OAuth
  client, Services ID, or private key. Firebase ownership/members/roles and unrelated
  settings unchanged.
- **iOS Firebase app: confirmed does NOT exist yet** (checked Project settings → General →
  Your apps — Android tile present, no iOS tile).
- **OAuth client inventory (Google Cloud project matching `flacronai-c8dab`): confirmed
  Web + Android client types exist; no iOS OAuth client exists yet** (consistent with no
  iOS Firebase app existing — Firebase/Google typically provision an iOS OAuth client
  alongside iOS app registration when Google Sign-In is enabled for that app).
- **Apple Services ID: confirmed does NOT exist yet** (checked Apple Developer → Identifiers
  → Services IDs — only the App ID `com.flacronenterprises.flacronai` exists; the Sign In
  with Apple *capability* on that App ID was enabled this session, per above, but no
  separate Services ID has been created).
- **Firebase Apple provider: confirmed disabled/unconfigured** (checked Authentication →
  Sign-in method → Apple — not yet enabled, no Services ID/Team ID/Key ID/private key
  entered).
- All three remaining gaps (iOS Firebase app, iOS OAuth client, Apple Services ID + key +
  Firebase Apple provider config) require a **creation**, not just a read — each needs your
  explicit approval before being actioned, per the task's stop conditions. Not created this
  session.

### 11.8d iOS Firebase app registration — COMPLETED 2026-09-09 (client-performed, approved)

- iOS app registered in the existing `flacronai-c8dab` project: nickname
  `FlacronAI Mobile (iOS)`, bundle ID `com.flacronenterprises.flacronai` (matches
  `app.config.ts` exactly). No App Store ID or Team ID entered (not needed yet). Existing
  Android/Web apps unmodified.
- `GoogleService-Info.plist` was downloaded by the client to their own Downloads folder,
  **outside this repository** — not placed in `mobile/`, not committed, not read by this
  session. Per §11.8/§11.8b, the current JS-SDK-based architecture does not require this
  file to be placed in the repo; it stays outside until/unless a native config plugin
  genuinely needs it (re-confirm at that time).
- **iOS OAuth client: confirmed auto-created** by Firebase alongside the iOS app
  registration — Google Cloud Credentials now shows Web + Android + iOS client types, no
  manual/duplicate creation performed (client's own console check, 2026-09-09).

### 11.8e `mobile/.env.local` populated from downloaded plist — COMPLETED 2026-09-09

- Client downloaded `GoogleService-Info.plist` to their own Downloads folder (outside the
  repo). Re-confirmed against current `app.config.ts`: no `googleServicesFile` field, no
  plugin referencing it — the JS-SDK-based architecture does **not** require this file
  inside the repo, so it was read in place and **not copied into `mobile/`**.
- Parsed locally via a one-off script (values never printed in full to any terminal output
  or this document — only redacted/masked forms and length checks were emitted):
  `BUNDLE_ID` matched `com.flacronenterprises.flacronai` ✅; `PROJECT_ID` matched
  `flacronai-c8dab` ✅.
- Wrote `mobile/.env.local` (new file, git-ignored) with the 6 required
  `EXPO_PUBLIC_FIREBASE_*` values from the plist (`authDomain` derived as
  `flacronai-c8dab.firebaseapp.com`) plus `EXPO_PUBLIC_APP_ENV=development` and the
  confirmed local-dev `EXPO_PUBLIC_API_BASE_URL`. `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` /
  `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` left blank — out of this step's scope (Google
  Sign-In stays gated/disabled until those are separately supplied).
- Verified: `git check-ignore -v mobile/.env.local` confirms it matches
  `mobile/.gitignore:45` (`.env*.local`); `git status --porcelain mobile/` shows nothing
  for `.env.local` or any `GoogleService-Info.plist`; no such plist exists anywhere under
  `mobile/` in the repo; `mobile/.env.example` re-confirmed unchanged/placeholder-only
  (its Firebase/Google keys are still blank).
- Next: proceed to Apple Services ID setup (approved to start; key creation and Firebase
  Apple provider enablement remain separately gated, per instruction).

### 11.8f Apple Services ID created — COMPLETED 2026-09-09 (client-performed, approved)

- Created under the verified **Flacron Enterprises LLC** Apple team (Team ID `YULB83U95Z`
  — a public team identifier, not a secret, same status as the Firebase project ID):
  - Description: `FlacronAI Web Authentication`
  - Identifier: `com.flacronenterprises.flacronai.auth`
  - Availability re-confirmed before creation (searched Services IDs list, not found);
    review screen confirmed correct team/description/identifier before Register was
    clicked; post-Register confirmed present in the Identifiers list.
- No private key created. No other identifier/certificate/App ID modified. No existing
  resource touched.
- Next: configure "Sign in with Apple" on this Services ID (Primary App ID + Domains +
  Return URL, derived from the confirmed `flacronai-c8dab` project, verified before
  saving) — still no private key, still no Firebase Apple provider change.

### 11.8a Android — local/EAS configuration cross-check (read-only, 2026-09-09)

- `app.config.ts` `android.package` = `com.flacronenterprises.flacronai` — **matches** the
  confirmed Firebase Android app's package exactly.
- No `google-services.json` config plugin entry exists yet in `app.config.ts` (by design —
  see item 3 above); `@react-native-google-signin/google-signin` (`^16.1.5`) and
  `expo-apple-authentication` are already present in `package.json` as dependencies, unused
  until configured.
- Remaining Android steps, in order: (1) place the already-available `google-services.json`
  at the path `app.config.ts` will expect once the plugin is added (not done this session —
  file was not downloaded); (2) obtain a Google OAuth **Android** client ID (Firebase
  auto-creates one from the SHA-1 + package once Google Sign-In is enabled as a provider —
  needs console access, not attempted this session); (3) add the
  `@react-native-google-signin/google-signin` config plugin to `app.config.ts` once both of
  the above exist; (4) populate `EXPO_PUBLIC_FIREBASE_*` + `EXPO_PUBLIC_GOOGLE_*` in
  `.env.local`; (5) run a real `eas build -p android --profile development` (separate
  explicit approval required — not triggered this session) to get an EAS-managed keystore,
  then add *that* build's SHA-1 (and optionally SHA-256) to Firebase alongside the existing
  one before Google Sign-In can complete on that build.

### 11.8b iOS — next registration steps (not started)

1. In Firebase Console → Project settings → the existing `flacronai-c8dab` project → "Add
   app" → iOS, bundle ID `com.flacronenterprises.flacronai` (must match `app.config.ts`
   `ios.bundleIdentifier` exactly, already set). Confirm first whether an iOS app already
   exists (per the client's own ownership rules) before adding one.
2. Download the resulting `GoogleService-Info.plist` (kept git-ignored, never committed —
   already covered by `.gitignore`).
3. Populate the same `EXPO_PUBLIC_FIREBASE_*` values in `.env.local` (iOS and Android apps
   on the same Firebase project typically share `authDomain`/`projectId`/
   `messagingSenderId`/`storageBucket`; only `apiKey` and `appId` are usually
   platform-specific — confirm both against the actual downloaded files, not assumed).
4. Google Sign-In **iOS** OAuth client ID — obtained from Firebase/Google Cloud console once
   the iOS app + Google provider are configured; only needed if the iOS flow requires a
   distinct client ID from the Web one (`EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` is already
   documented as optional in `.env.example`).
5. Apple Sign-In remains gated on §11.8 item 4 (App ID capability + Firebase Apple
   provider), independent of the iOS Firebase app registration itself.

### 11.9 MFA and logout/revocation gaps — restated plainly, per the task's explicit requirement to report rather than paper over

*Both gaps below were accurate as of this Phase 3 implementation session. **Both are now
resolved** — see §12 (2026-09-08, same-day follow-up implementation). Left as-written here
for an honest historical record of what Phase 3 itself did and did not close.*

- **MFA is a client-side UI gate only, on both web and mobile — confirmed, not assumed
  (§11.1 item 1).** Closing this would require a backend change (e.g., `authenticateToken`
  checking an MFA-completion signal, which the current Firebase ID token carries no claim
  for) — **out of scope for Phase 3 per the task's own instruction not to modify
  `backend/`.** Flagged here as the single most important open item for whoever reviews
  this work. **→ RESOLVED, see §12.**
- **Logout cannot instantly invalidate an already-issued Firebase ID token on another
  device** — only future refreshes are blocked (§11.1 item 2, unchanged from the original
  audit's §5.15/§6). A "log out everywhere" feature, if ever wanted, needs a new backend
  mechanism (e.g., a server-side ID-token-JTI denylist) — not attempted here, per §9 item 4
  of the original audit (still an open product decision, not a Phase 3 blocker). **→
  STILL TRUE FOR ORDINARY LOGOUT, BY DESIGN — see §12.3.** A `tokenValidAfter` mechanism
  with exactly this effect was built, but a rollout-safety review correctly determined it
  must not fire on ordinary logout (that would silently turn Sign Out into an all-devices
  kill) — it fires only on an explicit password change instead. A dedicated "log out
  everywhere" feature remains unbuilt and would reuse this same primitive if ever wanted.

### 11.10 Phase 3 status: **partially complete**

**Complete and genuinely validated**: the full authentication *architecture* (Firebase
Client SDK identity, backend REST for profile/MFA/audit, route guards, session
restoration/persistence, logout with the backend-call improvement over web, error
handling/sanitization, all client-side validation) — implemented, statically verified
(typecheck/lint/doctor/bundle-export on both platforms all clean), and covered by 59
passing automated tests across the state-machine, validation, error-mapping, and
provider-configuration-gating logic.

**Not complete, and cannot be from inside this codebase alone**:
- Google Sign-In and Sign in with Apple are implemented but **functionally blocked** on
  Firebase/Google/Apple console and portal configuration this session has no access to
  (§11.8) — correctly marked "blocked," not silently treated as done, per the task's own
  instruction.
- MFA server-side enforcement gap (§11.9) — reported, not fixed, since fixing it requires
  a `backend/` change explicitly out of scope for this phase.
- No physical-device/simulator Expo Go run was performed this session (§11.7) — static and
  bundle-level validation only.
- Email-verification and password-reset deep-linking back into the app remain unbuilt, per
  the task's own explicit instruction to use the existing web/hosted behavior as-is and
  document the limitation rather than invent one (done — see §11.3's table).

**Recommended next action**: supply the Firebase iOS/Android app registration (§11.8 item
1) so the app can move past `ConfigRequiredScreen`, then perform a real on-device Expo Go
walkthrough of the email/password flows against a local `backend/` instance before
considering Phase 3 fully closed. Google/Apple sign-in and the MFA server-side gap remain
correctly blocked pending, respectively, console/portal access and an explicit decision on
whether a `backend/` change to enforce MFA is wanted.

---

## 12. MFA server-side enforcement + logout/session revocation — IMPLEMENTED, ENFORCEMENT DISABLED (2026-09-08)

*Status: implemented and tested this session, approved beforehand, in two passes. The first
pass implemented unconditional enforcement; a separation review then correctly identified
that shipping it as-is would risk breaking the LIVE production web app the moment
`backend/` deploys ahead of `frontend/` (every already-live MFA-enabled user would get
`403` on every protected route), and that an earlier version of the logout fix would have
silently turned ordinary Sign Out into an all-devices session kill. Both were corrected in
this same session, in place, before anything was deployed: enforcement is now gated behind
`MFA_ENFORCEMENT_ENABLED`, defaulting safely disabled, and `/auth/logout`'s scope was
narrowed back to ordinary, single-session sign-out (see §12.3). This section documents the
corrected, final implementation — enforcement is implemented and tested, but **NOT enabled
in production**; that is a separate, later, explicit step (§12.9).*

Also supersedes an earlier same-day chat recommendation (a persistent Firebase custom
claim), which a follow-up review caught as insufficient before anything was implemented,
and corrects two inaccuracies a second follow-up review caught in the design below before
implementation began (the `auth_time` device-binding claim, and the physical-device tunnel
guidance in §8/README.md).

**Why a persistent Firebase custom claim (`mfaVerified: true`) was rejected.** Custom claims
live on the Firebase **user record**, not on a single sign-in. Once set, every future ID
token minted for that uid — a new login next week, a second device, a session restored
after logout/re-login — would carry the claim until something explicitly clears it. There
is no natural "new login" hook that clears a user-level claim, so this design would let one
successful TOTP entry silently cover **all future sessions and devices**, which is a real
MFA bypass, not an enforcement mechanism. Rejected before implementation.

**Options compared** (unchanged from the design review): (1) short-lived backend-signed MFA
session assertion — **chosen**; (2) Firebase-native MFA (Identity Platform) — rejected,
would require migrating existing TOTP enrollment data and a paid upgrade; (3) a server-side
session record (Firestore/cache) — rejected, needs either a second Firestore read or a new
cache layer neither of which this fix requires.

### 12.1 What "auth_time binding" actually guarantees — corrected claim

The assertion binds to the Firebase ID token's `auth_time` claim (stable across silent
token refreshes of the *same* sign-in, but new on every fresh login, including a re-login
on the same device). **Corrected framing: this binds the assertion to a Firebase sign-in
event / session family, not to one physical device.** It reliably prevents replaying one
login's completed MFA against a *different* sign-in event (any fresh login, on any device,
always gets a new `auth_time`, so the old assertion won't verify against it). It does
**not** provide independent device-level isolation: a party that already holds both a valid
Firebase session (ID token or refresh token) **and** this assertion for that exact session
can keep using both together regardless of physical device — the same blast radius as
stealing the Firebase session itself. This is stated plainly rather than oversold; the
security value is "closes the MFA-bypass gap for the account's protected API surface,"
not "makes stolen tokens harmless."

### 12.2 Assertion design (implemented)

- **Signing key**: `` `${JWT_SECRET}::mfa-session` `` — reuses the existing backend-only
  `JWT_SECRET`, purpose-suffixed exactly like `routes/auth.js`'s own pre-existing
  `MFA_CHALLENGE_SECRET` pattern. **No new secret/env var was added** — nothing to add to
  `.env.example` or the Render dashboard for this.
- **Token type field**: every assertion carries `typ: 'mfa_session_v1'`, checked on verify,
  so it can never be accepted anywhere a real Firebase ID token, a custom JWT, or the
  separate pre-login `MFA_CHALLENGE_SECRET` token is expected, and vice versa.
- **Payload**: `{ typ, uid, authTime, tokenVersion, iat, exp }` — no TOTP code, no recovery
  code, no secret of any kind (`backend/test/mfa-assertion.test.js` asserts the exact key
  set).
- **TTL**: 12 hours (`MFA_ASSERTION_TTL_SECONDS`, `backend/utils/mfaAssertion.js`) — long
  enough to cover a normal working session without forcing repeated TOTP entry on every
  silent ~1h Firebase ID-token refresh; short enough to bound a leaked assertion's useful
  life. Not tied to the Firebase ID token's own refresh cadence.
- **Issuance**: `POST /auth/mfa/verify` and `POST /auth/mfa/verify-setup`, additively —
  `mfaAssertion` is a new field alongside every existing response field, never a
  replacement.
- **Transport**: `X-MFA-Token` request header, alongside the existing
  `Authorization: Bearer <Firebase ID token>`.
- **Rollout flag — `MFA_ENFORCEMENT_ENABLED`** (`backend/utils/mfaAssertion.js`'s
  `isMfaEnforcementEnabled()`, documented in `.env.example`): a plain feature toggle, **not
  a secret** — safe to log/inspect, read fresh from `process.env` on every request (never
  cached at module load, so it can be toggled at runtime via a config/redeploy without a
  code change, and so tests can flip it per-test). Defaults **safely disabled** — only the
  literal string `'true'` turns enforcement on. See §12.9 for the exact activation
  procedure and verification checklist.
- **Verification** (`backend/middleware/auth.js`, `authenticateToken`, Firebase-ID-token
  branch only): after the existing Firebase-token verify and the Firestore user-doc read it
  already performs, if `userData.mfaEnabled`, **`isMfaEnforcementEnabled()` is true**, and
  the request's exact method+path isn't in the bootstrap exemption list (§12.4), require
  `X-MFA-Token`, verify its signature/type/expiry, then check `decoded.uid ===
  firebaseDecoded.uid`, `decoded.authTime === firebaseDecoded.auth_time`, and
  `decoded.tokenVersion === (userData.tokenVersion || 0)` — the last check reuses the user
  document this request already fetched, **zero additional Firestore reads**. Any mismatch
  → `403 MFA_REQUIRED`. **While the flag is disabled** (the default), this whole check is
  skipped entirely — a missing, expired, malformed, or wrong-purpose assertion never
  rejects anything, and existing production behavior for every user (MFA-enabled or not)
  is unchanged. **Assertion issuance and both clients' store/attach/clear support are NOT
  gated by this flag** — they run unconditionally, which is what lets backend and client
  changes deploy safely ahead of the flag ever being flipped on.
- **CORS**: `X-MFA-Token` was added to `backend/config/corsOptions.js`'s
  `CORS_ALLOWED_HEADERS` (consumed by `server.js`'s `cors()` setup). Without this, a
  browser's preflight (OPTIONS) request for any cross-origin call carrying the header would
  be rejected before it ever reached the server — required the moment any client attaches
  the header at all, independent of the enforcement flag.
- **Revocation**: bumping the user document's `tokenVersion` immediately invalidates any
  outstanding assertion for that account. `POST /auth/logout` still does this (unchanged,
  pre-existing behavior). `POST /auth/change-password` and `PUT /users/change-password`
  also do this (the latter is the route the web UI's own client-side-Firebase
  password-change flow does *not* currently call — see §12.3's honest caveat).
- **Scope, deliberately**: only the genuine-Firebase-ID-token branch of `authenticateToken`
  enforces this. The custom-JWT fallback branch (used only by `/auth/register` and
  `/auth/mfa/login-verify`, confirmed unused by both the real web and mobile clients, which
  authenticate via the Firebase Client SDK directly) is untouched — MFA, when already
  enabled at that moment, is already required before either of those mints a JWT, so the
  narrow residual gap is a custom JWT obtained *before* MFA was enabled, still valid, held
  across a *later* MFA enrollment within the same 7-day token lifetime. Not closed here —
  closing it would mean inventing a session-family binding for a token type with no
  `auth_time` equivalent, judged out of this fix's minimal scope.
- **API-key requests (`authenticateApiKey`) and `optionalAuth` are untouched** — a separate,
  non-interactive access mechanism and a best-effort/non-blocking gate respectively; neither
  gates the account's genuinely protected surface the way `authenticateToken` does.

### 12.3 Logout / already-issued-token revocation — CORRECTED scope (ordinary Sign Out ≠ all-devices kill)

**An earlier version of this fix, in this same session, briefly made `/auth/logout` bump
`tokenValidAfter` (see below), which would have silently turned every ordinary Sign Out
into an immediate all-devices session kill. A separation review correctly caught this
before anything shipped, and it was reverted.** The final, implemented behavior
deliberately draws a hard line between two different things:

- **Ordinary Sign Out (`POST /auth/logout`) — ALWAYS single-session-scoped in intent, not
  an explicit security operation.** Exact semantics (documented directly above the route in
  `routes/auth.js`, so any future caller reads it before adding a new call site):
  `getAuth().revokeRefreshTokens(uid)` blocks *future* silent token refresh, on every
  device — this is pre-existing, unchanged Firebase behavior (Firebase has no per-device
  revocation primitive), not new. The `tokenVersion` bump invalidates any outstanding
  custom JWT and any outstanding MFA assertion for the account (also pre-existing). **It
  does NOT touch `tokenValidAfter`** — an already-issued, still-valid Firebase ID token
  sitting in another tab/device stays usable until its own natural ~1h expiry. This is a
  deliberate, accepted limitation of ordinary Sign Out, not a bug.
- **An explicit all-sessions security event (`POST /auth/change-password`, `PUT
  /users/change-password`) — DOES bump `tokenValidAfter`.** A password change is exactly
  the kind of deliberate, security-sensitive action that should revoke every other session
  immediately, industry-standard practice, not a "silent" side effect of routine use.
  `tokenValidAfter` (Unix seconds) is checked in `authenticateToken` as `decoded.iat <
  userData.tokenValidAfter` — the same `iat`-vs-validSince comparison Firebase's own
  `checkRevoked` option performs internally, evaluated here against a timestamp this app
  already controls (reusing the SAME user document `authenticateToken` already loaded for
  the MFA check above — **zero additional Firestore reads**) instead of `checkRevoked`'s
  extra network round-trip per verification (deliberately not enabled). Absent for any
  account that has never changed its password through these endpoints — fully backward
  compatible, no migration.
- **Same-second precision, verified by test**: the comparison uses strict `<`, not `<=`, so
  a legitimate fresh login that happens to land in the exact same whole Unix second as a
  password-change revocation event is **not** falsely rejected (`backend/test/
  mfa-enforcement.test.js`'s dedicated same-second case). The accepted trade-off is the
  narrow reverse edge case — a token minted in that exact same second, just before the
  change, surviving one extra second — judged negligible next to the cost of locking out a
  real concurrent login.
- **There is still no "log out this device only" vs. "log out everywhere" distinction** —
  if a dedicated "sign out everywhere" feature is ever wanted, it should reuse the
  `tokenValidAfter` primitive already built here (bump it from a new, explicit,
  user-initiated action), not extend ordinary Sign Out's scope.

**RESOLVED 2026-09-08 (final correction pass) — corrected to a single-authority sequence,
after an intermediate version had a real duplicate-mutation and false-success bug.**
Originally, Settings.jsx's password-change UI called Firebase's own client-side
`reauthenticateWithCredential()` + `updatePassword()` directly and never touched
`/users/change-password` at all, so changing a password from Settings never triggered any
server-side revocation. A first fix (superseded, see below) additively called the backend
endpoint AFTER the client-side `updatePassword()` had already succeeded, best-effort — this
had two real problems, both caught before anything shipped further: (1) the password was
mutated **twice** per user action (once client-side via Firebase, once server-side via the
same backend endpoint, which independently calls the Admin SDK's `updateUser` too); (2) a
backend failure was silently swallowed, so the UI could show "Password changed
successfully" even when the server-side revocation genuinely failed.

**Confirmed by direct inspection, not assumed, before designing the fix**: `backend/routes/
users.js`'s `PUT /users/change-password` takes only `newPassword` in its request body — no
`currentPassword` field exists, and the handler never re-verifies the current password
server-side (no `verifyPassword()`-style call, unlike `/mfa/disable`). It trusts the
already-authenticated session and performs the real mutation itself via the Admin SDK
(`getAuth().updateUser(uid, { password })`), then bumps `tokenVersion`/`tokenValidAfter`.
This means Firebase's client-side `reauthenticateWithCredential()` is the **only** place
the current password is actually verified anywhere in this whole flow — a fact the
corrected sequence below depends on being true, and which is now proven by a real
integration test (`backend/test/password-change-contract.test.js`), not assumed.

**Final, corrected sequence** (`frontend/src/pages/Settings.jsx`'s `handlePasswordChange`):
1. Unchanged: client-side `reauthenticateWithCredential()` — this is Firebase's recent-login
   protection and the sole current-password check in the flow. Must succeed first, and the
   current password is still live/unchanged at this point.
2. **`await usersAPI.changePassword(newPassword)`** (`PUT /users/change-password`) — the
   backend is now the **single authority** for the actual password mutation and the
   revocation side effect. The client-side `updatePassword()` call was **removed entirely**
   — the password is now mutated exactly once, server-side.
3. On a rejection from step 2 (awaited, not fire-and-forget): a real, actionable
   `toast.error` (using the backend's own error message when present) is shown, the
   function returns immediately, and the success toast / form-clear / MFA-assertion-clear
   below never execute — no false success is possible.
4. Only after step 2 resolves successfully: clear the form, clear the local MFA assertion
   (client-side hygiene matching the server-side revocation that already happened), show
   the success toast.

No UI redesign — same fields, same validation guards, same toast library and error-message
style already used elsewhere in this file.

**Test evidence.** `frontend/src/__tests__/settingsPasswordChangeScope.test.js` (7 tests,
source-level — no jsdom/RTL in this project, same constraint as `authLogoutScope.test.js`):
reauthentication textually precedes the backend call; no client-side `updatePassword(
currentUser` call site exists anywhere in the function (nor is `updatePassword` imported
from `firebase/auth` at all anymore); `usersAPI.changePassword(` appears exactly once
(single mutation call site); the backend call has its own dedicated `catch` that shows an
error toast and `return`s before the success toast is reachable; form/MFA-assertion
clearing happens only after the backend call; existing client-side validation guards are
untouched; no `console.*` call anywhere in the function includes the current password, new
password, or the reauthentication credential. `backend/test/
password-change-contract.test.js` (7 tests, a real Express app + the real
`PUT /users/change-password` route, only Firebase Admin faked — the strongest practical
integration-level proof available without a browser): confirms the endpoint accepts
`newPassword` alone and silently ignores a (deliberately wrong) `currentPassword` field if
one is sent, proving the "no server-side current-password check" claim above rather than
assuming it; a successful request calls the Admin SDK's `updateUser` exactly once; a
successful request bumps both `tokenVersion` and `tokenValidAfter`; a **failed** Admin SDK
mutation returns `success: false` and leaves both revocation fields untouched (proving a
backend failure can never look like a successful, revoked change); a weak password is
rejected before any mutation is attempted; the plaintext new password is never echoed back
in any response body.

**Server-side recent-authentication requirement — `requireRecentAuth` (2026-09-08 follow-up,
IMPLEMENTED).** Everything above still left one real gap: the backend trusted the
already-authenticated session alone, with nothing checking that a reauthentication had
actually just happened. A stolen-but-still-valid Firebase ID token (e.g. lifted from an
old, otherwise-idle browser tab/session, up to its natural ~1h lifetime) could call `PUT
/users/change-password` directly and succeed, with zero proof of recent reauthentication,
since the route itself never re-verifies the current password (§12.3 above). This is now
closed server-side, not just relied on client-side:

- **`backend/middleware/auth.js`'s `requireRecentAuth`** requires the verified Firebase ID
  token behind the request to carry an `auth_time` claim (Firebase's own record of when the
  underlying sign-in/reauthentication happened — never anything client-supplied) within the
  last **`RECENT_AUTH_WINDOW_SECONDS` = 5 minutes**, plus a **`RECENT_AUTH_CLOCK_SKEW_SECONDS`
  = 30 seconds** tolerance in both directions (guards a genuinely-recent `auth_time` that
  looks slightly "future" due to ordinary clock drift, as much as it guards the staleness
  check itself). Missing, non-numeric, future-beyond-tolerance, or stale-beyond-window
  `auth_time` are all rejected identically: **`403 RECENT_LOGIN_REQUIRED`**.
- **Zero extra Firestore reads or re-verification.** It reads only `req.mfaContext.authTime`
  — the same value `authenticateToken` already decoded from the verified token and attached
  for its own genuine-Firebase-ID-token branch (originally added for the MFA-assertion check,
  §12.1/§12.2) — so this costs nothing beyond what every authenticated request already pays.
- **Custom-JWT fallback: rejected outright, by design, not weakened for it.**
  `authenticateToken`'s custom-JWT branch never sets `req.mfaContext` at all — that token
  type carries no `auth_time` claim (it's a bespoke 7-day bearer token, not a Firebase
  sign-in event). `requireRecentAuth` treats an absent `req.mfaContext` exactly like a
  missing claim: reject. This was a deliberate design choice, not an oversight — the Firebase
  check was never weakened to accommodate the legacy path. Web and mobile both send a
  Firebase ID token for every authenticated request once signed in (the custom JWT is only
  register's brief bootstrap fallback, §1); a caller that genuinely only holds a custom JWT
  already has a secure path available — sign in through Firebase (as reaching Settings
  already requires) to obtain a real ID token — rather than this middleware trusting an
  unverifiable claim of recency.
- **Applied to both password-mutating routes on the identical contract**: `PUT
  /users/change-password` (what the web UI actually calls) and `POST
  /auth/change-password` (not currently called by any client, but a live, reachable route on
  the same `authenticateToken` contract with the identical "no server-side current-password
  check" shape — leaving it unprotected would have been a real bypass of the exact gap this
  closes). Both are wired as `authenticateToken, requireRecentAuth, [validators], handler`.
- **Frontend sequence, updated** (`frontend/src/pages/Settings.jsx`'s `handlePasswordChange`):
  immediately after `reauthenticateWithCredential()` succeeds, the client now calls
  `currentUser.getIdToken(true)` to force-refresh the cached Firebase ID token, so its
  `auth_time` claim actually reflects the reauthentication that just happened rather than
  whatever token was cached before the form was opened — `getIdToken(true)` updates the SDK's
  cache synchronously, so the very next (non-forced) `getIdToken()` call inside `api.js`'s
  request interceptor, the one that actually attaches the `Authorization` header, returns
  this same fresh token. A `RECENT_LOGIN_REQUIRED` response from the backend call now gets
  its own dedicated, safe, actionable toast (distinct from the generic backend-error message)
  and still returns before any success state, same as every other backend-call failure. On
  **confirmed** success, the flow now additionally signs the user out locally and redirects
  to `/login`: the backend call that just succeeded already bumped `tokenValidAfter`
  server-side, so the ID token still cached in this tab would fail `TOKEN_REVOKED` on its
  very next authenticated request anyway — proactively signing out avoids stranding the user
  on a page whose session the server already considers dead, and requires them to log back in
  with the new password (proving the new password actually works end-to-end).
- **Test evidence.** `backend/test/require-recent-auth.test.js` (12 unit tests against the
  middleware directly — no Express app or Firebase needed, it's a pure function of
  `req.mfaContext`): recent, exactly-now, and just-inside-the-window `auth_time` all pass;
  stale (well past window+skew) and exactly-at-the-boundary `auth_time` are both rejected
  (the boundary case proving the check is strict, not off-by-one permissive); a missing
  `mfaContext` (simulating a custom-JWT-authenticated request) is rejected; `undefined`,
  non-numeric, and `NaN` `authTime` values are all rejected; a far-future `authTime` is
  rejected while one within the clock-skew tolerance is accepted; and a forged
  `req.body`/`req.query` claim of recency has zero effect (the middleware never reads either).
  `backend/test/password-change-contract.test.js` gained 5 new end-to-end tests through the
  real Express app + real `PUT /users/change-password` route (only Firebase Admin faked): a
  recent `auth_time` succeeds; a stale one (20 minutes) is rejected with `403
  RECENT_LOGIN_REQUIRED` and never reaches the Admin SDK mutation or bumps any revocation
  field; a future `auth_time` is rejected the same way; a missing/`null` `auth_time` is
  rejected the same way; and a forged `authTime`/`reauthenticatedAt` field in the request
  body cannot override a genuinely stale real `auth_time`. `frontend/src/__tests__/
  settingsPasswordChangeScope.test.js` gained 3 new source-level tests (10 total now): the
  force-refresh call (matched by its real call shape, `currentUser.getIdToken(true)`, not a
  comment mentioning the bare method name) happens after reauthentication and before the
  backend call; the `RECENT_LOGIN_REQUIRED` branch shows its own dedicated message and still
  gates the success path; and the sign-out + `/login` redirect happens only after the success
  toast, never on any failure path (including the `RECENT_LOGIN_REQUIRED` one). One
  incidental fix along the way: `backend/test/logout-revocation-scope.test.js` had used a
  fixed, long-past `auth_time` constant that had nothing to do with what that file actually
  tests (revocation *scope*, not recency) — now that both change-password routes it exercises
  sit behind `requireRecentAuth`, that fixed constant would have made every request to them
  403 for an unrelated reason, so it was changed to a freshly-computed timestamp.
- **`requireRecentAuth` is unconditional, unlike the MFA-assertion check** — it is not gated
  behind `MFA_ENFORCEMENT_ENABLED` or any other rollout flag, because it only ever activates
  on the two password-change routes (a narrow, already-rarely-hit surface) and its failure
  mode is "ask the user to reauthenticate," not "lock them out of the whole app" — there is no
  equivalent rollout-safety concern to the MFA-enforcement flag's "could lock out every
  existing MFA user in production the moment it flips on."

**Client logout calls — BOTH platforms are now local-only, matching each other exactly.**
Web's `AuthContext.jsx` `logout()` does not call the backend (unchanged from the previous
correction pass). **Mobile's `AuthProvider.tsx` `logout()` no longer calls the backend
`POST /auth/logout` endpoint either** — a final review confirmed this session that mobile
still called it (a pre-existing Phase 3 behavior, previously left alone as "already safe"
since `/auth/logout`'s own scope had already been narrowed), and correctly judged that
ordinary Sign Out should be identically local-only on both platforms for the same reason
logout was scoped away from `tokenValidAfter` in the first place: an explicit,
security-triggered revocation (password change) should be the only thing that reaches
`/auth/logout`-adjacent server-side revocation, not routine sign-out on any platform.
`authApi.logout`'s typed wrapper still exists (unused by ordinary logout) for a future
explicit "sign out everywhere" action, if one is ever built — no new UI was added for it.
Both clients now perform identical local-only cleanup: clear the Firebase session, clear
the stored MFA assertion, reset local MFA-verified state.

**tokenValidAfter is NOT perfect immediate revocation — the residual window is real and
intentional, not an oversight.** The strict `<` comparison (§12.2/§12.3 above) means a
Firebase ID token whose `iat` lands in the exact same whole Unix second as a
password-change revocation event is **not** rejected — it remains valid for the rest of
its natural ~1h lifetime, exactly as if no revocation had happened. This is a deliberate,
bounded, sub-one-second trade-off (never larger than one second, and only reachable by a
token minted in that exact second, before the change) accepted specifically to guarantee
the opposite, more likely failure mode — a legitimate concurrent login being falsely
rejected — cannot happen. Do not describe this mechanism as "instant" or "perfect"
revocation in any future documentation; "immediately, with a sub-second residual window
for tokens minted in the same second as the revocation" is the accurate claim.

### 12.4 Bootstrap exemption list (implemented, minimal, exact METHOD + path)

`backend/middleware/auth.js`'s `MFA_ASSERTION_EXEMPT_ROUTES`, matched as exact `` `${method}
${path}` `` pairs (not path alone — so a hypothetical future non-exempt method reusing one
of these paths is never accidentally exempted by name), scoped to the `/auth` router only
(matched against `req.baseUrl`, so it can never leak into an unrelated router):

| Method + path | Why it must stay reachable without an assertion |
|---|---|
| `GET /mfa/status` | Lets a client check whether MFA is enabled before knowing whether to show the gate at all. |
| `POST /mfa/verify` | The endpoint that *issues* the assertion — cannot require what it's about to hand out. |
| `POST /mfa/verify-setup` | Same, for first-time enrollment. |
| `POST /mfa/disable` | See below — protected by its own, arguably stronger, in-body check instead. |
| `POST /logout` | Sign Out must always work, even mid-lockout. |
| `POST /verify` | Called immediately post-Firebase-sign-in, before any client has a chance to obtain an assertion. |
| `POST /send-verification` | So an MFA-enabled account whose email verification lapses isn't deadlocked between the email-verification screen and an unreachable MFA gate. |

**`POST /mfa/disable` specifically**: exempt from `X-MFA-Token` not because it needs no
proof, but because its own request body already requires **equivalent, arguably stronger**
proof — the account's current password, or a freshly-verified TOTP/recovery code
(`verifySecondFactor`, checked inside the route handler itself). An assertion only proves
MFA was completed at some point up to 12h ago; requiring a *fresh* check here, as the route
already did before this fix, is the more conservative choice, not a gap.

### 12.5 Client storage and lifecycle (implemented)

- **Web**: `sessionStorage` (`frontend/src/services/mfaAssertion.js`) — tab-scoped, not
  `localStorage`. Attached as `X-MFA-Token` by `api.js`'s request interceptor. Cleared on
  logout, sign-out/auth-state-change, MFA disable, and (client-side hygiene only, per the
  §12.3 caveat) password change. On a `403 MFA_REQUIRED` response, the interceptor clears it
  and dispatches a `flac:mfa-required` `window` event; `AuthContext.jsx` listens and drops
  `mfaVerified` to `false`, which `ProtectedRoute.jsx`'s existing
  `userProfile?.mfaEnabled && !mfaVerified` check already turns back into `<MfaGate/>` —
  no new routing logic needed, no protected content left rendered past that state flip.
- **Mobile**: `expo-secure-store` (`mobile/src/services/mfaAssertionStorage.ts`,
  Keychain/Keystore-backed — a genuinely new direct dependency, added via `npx expo install
  expo-secure-store` and its config plugin declared in `app.config.ts`, no options set).
  Attached as `X-MFA-Token` by `api/client.ts`. Cleared on logout and sign-out (Firebase
  `onAuthStateChanged` firing with no user). On a `403 MFA_REQUIRED`, `client.ts` clears it
  and notifies subscribers via a small in-module pub-sub (React Native has no `window` to
  dispatch a DOM event on); `AuthProvider.tsx` subscribes and drops `mfaVerified` to
  `false`, which Expo Router's existing `Stack.Protected guard={status === 'needs-mfa'}`
  (vs. `'authenticated'`) already turns back into `MfaScreen` with no flash, per the same
  fail-closed mechanism Phase 3 already relies on.
- Neither client ever stores a password, TOTP code, or recovery code.

### 12.6 Files touched (cumulative across all correction passes)

`backend/utils/mfaAssertion.js` (new — assertion sign/verify + `isMfaEnforcementEnabled()`),
`backend/middleware/auth.js` (this pass: adds `requireRecentAuth` + its
`RECENT_AUTH_WINDOW_SECONDS`/`RECENT_AUTH_CLOCK_SKEW_SECONDS` constants, see the
"Server-side recent-authentication requirement" block in §12.3), `backend/routes/auth.js`
(this pass: wires `requireRecentAuth` into `POST /change-password`), `backend/routes/
users.js` (this pass: wires `requireRecentAuth` into `PUT /change-password`),
`backend/config/corsOptions.js` (new — extracted, testable CORS header/method allowlist),
`backend/server.js` (consumes `corsOptions.js`), `backend/.env.example` (documents
`MFA_ENFORCEMENT_ENABLED`), `frontend/src/services/mfaAssertion.js` (new),
`frontend/src/services/api.js`, `frontend/src/context/AuthContext.jsx`,
`frontend/src/components/MfaGate.jsx`, `frontend/src/pages/Settings.jsx` (rewritten again
this pass — adds the `getIdToken(true)` force-refresh, `RECENT_LOGIN_REQUIRED` handling, and
the post-success sign-out + `/login` redirect, see §12.3),
`mobile/src/services/mfaAssertionStorage.ts` (new), `mobile/src/services/api/client.ts`,
`mobile/src/services/api/auth.ts`, `mobile/src/features/auth/context/AuthProvider.tsx`
(logout call removed, prior pass — unchanged this pass),
`mobile/src/features/auth/screens/MfaScreen.tsx`, `mobile/src/types/api.ts`,
`mobile/app.config.ts`, `mobile/package.json`/`package-lock.json` (added
`expo-secure-store`).

### 12.7 Tests (all passing — see §11.7-style validation log below)

Backend — 17 new tests this pass on top of the prior pass's total of 521 (538 total in the
full suite now): `mfa-assertion.test.js`, `mfa-enforcement.test.js` (32, including the
enforcement-flag disabled/explicit-false/enabled cases, exact-method-vs-path-exemption
cases, expired/wrong-purpose assertion cases, and the same-second `tokenValidAfter` edge
case), `mfa-verify-route.test.js` (+2), `cors-options.test.js` (3), `logout-revocation-
scope.test.js` (3, `auth_time` constant switched from a fixed past epoch to a fresh
timestamp this pass — see the recent-auth block in §12.3 for why), `password-change-
contract.test.js` (12 total now — the original 7 plus **5 new this pass** proving
`requireRecentAuth` end-to-end through the real route: a recent `auth_time` succeeds; a
stale one is rejected with `403 RECENT_LOGIN_REQUIRED` and never reaches the mutation or
bumps any revocation field; a future `auth_time` is rejected the same way; a missing/`null`
`auth_time` is rejected the same way; a forged `authTime` field in the request body cannot
override a genuinely stale real one), and **`require-recent-auth.test.js` (new this pass,
12 unit tests against the middleware directly)**: recent/exactly-now/just-inside-window
`auth_time` pass; stale and exactly-at-the-boundary `auth_time` are both rejected (proving
the check is strict, not off-by-one permissive); a missing `mfaContext` (simulating a
custom-JWT-authenticated request) is rejected; `undefined`/non-numeric/`NaN` values are all
rejected; a far-future `authTime` is rejected while one within clock-skew tolerance is
accepted; a forged `req.body`/`req.query` claim of recency has zero effect. Full backend
suite: **538/538 passing.**

Frontend — 6 tests from the prior pass (`authLogoutScope.test.js`, `apiMfaHeader.test.js`,
unchanged) plus `settingsPasswordChangeScope.test.js`, now **10 tests** (7 from the prior
pass's rewrite, **+3 new this pass**: the `getIdToken(true)` force-refresh happens after
reauthentication and before the backend call, matched by its real call shape so a comment
mentioning the method name can't false-match; `RECENT_LOGIN_REQUIRED` gets its own dedicated
message and still gates the success path; the sign-out + `/login` redirect happens only
after the success toast, never on any failure path). Full frontend suite: **64/64 passing.**

Mobile — unchanged this pass (this correction was scoped to web's password-change
sequence and its backend contract only; mobile has no password-change screen implemented
yet, Phase 3 remains partially complete). From the prior pass: `AuthProvider.test.tsx`'s
logout-cleanup describe block was rewritten (2 tests, same count, content changed) to
assert `mockLogout` (the backend `/auth/logout` mock) is **never** called by ordinary Sign
Out. Full mobile suite, re-verified this pass with no code changes: **72/72 passing.**

### 12.8 Compatibility

Additive and opt-in per `mfaEnabled`; non-MFA and Google-provider accounts are unaffected on
both platforms (verified by test). **Enforcement itself ships disabled** (§12.9) —
deploying backend and client changes no longer needs to be atomic or coordinated the way an
always-on enforcement check would have required; either can deploy independently, in any
order, with zero effect on any live user, MFA-enabled or not, until the flag is
deliberately turned on later. `X-MFA-Token` is CORS-allowed the moment any client attaches
it, independent of the flag, so there is no separate "CORS not ready yet" window to worry
about either.

### 12.9 Activation procedure and verification checklist (NOT performed — for when you decide to enable enforcement)

**Preconditions** (all already true as of this session): backend deployed with assertion
issuance + enforcement code present (flag still `false`/unset); web frontend deployed with
`api.js`'s header attachment, `403 MFA_REQUIRED` handling, and `MfaGate.jsx`/`Settings.jsx`
assertion storage; mobile build includes the equivalent `mobile/src/services/api/client.ts`
+ `mfaAssertionStorage.ts` + `AuthProvider.tsx`/`MfaScreen.tsx` support (not yet possible in
production — mobile is still blocked on §11.8's Firebase/Google/Apple console
configuration and has never been built/published).

**Activation steps**:
1. Confirm every live client (web, and mobile once published) that could reach a protected
   API is running a build that includes the header-attach/clear/403-handling support above
   — an old cached web bundle without it would 403-loop an MFA user the instant the flag
   flips, since it would never send `X-MFA-Token` at all.
2. Set `MFA_ENFORCEMENT_ENABLED=true` in the backend's environment (Render dashboard) and
   redeploy/restart.
3. Immediately verify, against the real production API, in this order:
   - A **non-MFA** test account can still use every protected feature normally (proves the
     flag didn't regress the majority of users).
   - An **MFA-enabled** test account: sign in → MFA gate appears → verify TOTP → protected
     routes work immediately (proves the assertion is issued and accepted end-to-end).
   - The same MFA-enabled account, after clearing its stored assertion manually (e.g.
     dev-tools `sessionStorage.removeItem`) or waiting past 12h: next protected call
     returns `403 MFA_REQUIRED` and the UI returns to the MFA gate without flashing
     protected content (proves fail-closed behavior is real, not just unit-tested).
   - `/auth/mfa/status`, `/auth/mfa/disable` (with password or code), and `/auth/logout`
     all remain reachable for an MFA-enabled account with no assertion (proves the
     bootstrap exemption list is correct in production, not just in tests).
   - A cross-origin request from the real deployed frontend origin carrying `X-MFA-Token`
     is not rejected by CORS (proves the preflight fix is live).
4. Monitor error rates / support channels for a spike in `MFA_REQUIRED` responses from
   accounts that should have valid assertions — the fastest sign something client-side was
   missed.
5. **Rollback**: set `MFA_ENFORCEMENT_ENABLED` back to `false`/unset and redeploy — this
   alone fully restores current behavior with no code change or data migration, since
   nothing about assertion issuance or storage depends on the flag.

None of the above has been performed this session — production enforcement remains OFF,
per explicit instruction.

---

## 13. Re-validation pass (2026-09-08, continuation session) — no regressions, blockers unchanged

*A later, separate session, same calendar day. Scope: re-verify current state and complete
any remaining safe, non-console, non-device work for Phase 3. No code was written; this
section records validation only.*

**Pre-work safety check**: `git status --porcelain` matched the exact file list left by
the prior session (same modified files, same untracked files) — nothing had been stashed,
reset, committed, or discarded in between. Confirmed before any command was run.

**Full validation matrix re-run, all green except one new, unrelated, minor finding**:

| Check | Result |
|---|---|
| `mobile`: `npx tsc --noEmit` | 0 errors |
| `mobile`: `npx expo lint` | 0 errors, 0 warnings |
| `mobile`: `npx jest` | 8 suites, 72 tests, all passing |
| `mobile`: `npx expo-doctor` | **20/21** (was 21/21 — see finding below) |
| `mobile`: `npx expo install --check` | Found outdated: `expo@57.0.20` (expected `~57.0.21`), `expo-router@57.0.19` (expected `~57.0.20`) |
| `backend`: `npm test` (full suite) | **538/538 passing**, including all 65 tests across `cors-options`, `logout-revocation-scope`, `mfa-assertion`, `mfa-enforcement`, `mfa-verify-route`, `password-change-contract`, `require-recent-auth` |
| `backend`: `npm run lint` | 0 errors, pre-existing warnings only (matches `CLAUDE.md`'s documented baseline) |
| `frontend`: `npx vitest run` (full suite) | **64/64 passing**, including all 23 tests across `apiMfaHeader`, `authLogoutScope`, `mfaAssertion`, `settingsPasswordChangeScope` |
| `frontend`: `npm run lint` | 0 errors, pre-existing warnings only |
| `git diff --check` | Clean — only benign LF→CRLF conversion notices, no real whitespace errors |
| Secret/credential scan (`AIza...`, `-----BEGIN`, `sk_live`/`sk_test`, `AKIA...`) across the full diff + every untracked file | No real matches — the one hit was this document's own §11.7 table describing the scan pattern itself, not a secret |
| `git check-ignore -v` on `mobile/.env.local`, `mobile/google-services.json`, `mobile/GoogleService-Info.plist` | All three correctly ignored |
| Backend/frontend change-scope check (`git diff --stat` against every modified file) | Backend: exactly `auth.js`/`users.js`/`server.js`/`middleware/auth.js`/`.env.example`, all MFA/logout/password-change-shaped diffs. Frontend: exactly `AuthContext.jsx`/`MfaGate.jsx`/`Settings.jsx`/`api.js`. No unrelated file touched. |
| EAS ownership re-check (`whoami` + `project:info`) | Unchanged: user `laibanoreen`, owner `flacron-enterprises-llc`, slug `flacronai`, project ID `c8227fa0-8a62-4e51-8ccc-c8feb58d0466` |

**New finding (minor, unrelated to authentication, not fixed this session)**: `expo` and
`expo-router` are each one patch version behind what the installed Expo SDK 57 expects
(`57.0.20`→`~57.0.21`, `57.0.19`→`~57.0.20`) — an upstream patch release published after
the prior session wrote this document, not a regression caused by any change here. Left
unfixed deliberately: bumping a dependency/lockfile is outside this session's authorized
"authentication only" scope, and `expo install --fix` would touch `package.json`/
`package-lock.json` beyond auth code. Flagged for a separate, explicit decision — does not
block or change Phase 3's status.

**Firebase project cross-check (read-only, no console access)**: confirmed the Firebase
project in use is `flacronai-c8dab` (from `backend/.env.example`'s non-blank
`FIREBASE_STORAGE_BUCKET=flacronai-c8dab.firebasestorage.app` — already public knowledge
per `CLAUDE.md`'s Tech Stack section, not a secret). `mobile/.env.local` still does not
exist in this checkout, so `EXPO_PUBLIC_FIREBASE_*` remain entirely unpopulated and the app
still correctly shows `ConfigRequiredScreen` — unchanged from §11.8. No Firebase CLI is
installed or authenticated in this environment (checked: `firebase --version` fails to
resolve), so no additional read-only project/app/provider check beyond what's stated above
was possible without console access this session doesn't have.

**Device/emulator availability (checked, not assumed)**: no `adb`, no Android `emulator`
binary, no `ANDROID_HOME`/`ANDROID_SDK_ROOT`, and no physical device attached in this
environment — it is a headless CLI session. Physical-device and emulator-based Expo Go
validation remain **not performed**, for the same reason as the original Phase 3
implementation session (§11.7/§11.10): no device was available, not that it was skipped.

**Conclusion**: no regression found anywhere; every previously-passing check still passes
exactly as documented. Phase 3's status is **unchanged** — still "implemented, partially
complete." All remaining blockers require either console/portal access (Firebase
iOS/Android app registration, Google OAuth client IDs, Apple Developer capability +
Firebase Apple-provider config — §11.8) or a physical device/emulator (§11.7), neither of
which this session has. No code, configuration, dependency, or `.env.local` file was
created, changed, or removed this session — this section is a validation record only.

## 14. Apple Sign-In anti-replay nonce fix — IMPLEMENTED 2026-09-09

*Console-side work landed first this session (§11.8d-§11.8f): iOS Firebase app registered,
`.env.local` populated, Apple Services ID created, Firebase Apple provider enabled (native
identity-token exchange only — Services ID/OAuth code flow correctly left blank, confirmed
from `appleSignIn.ts` itself before any Firebase config was saved). This section covers the
one real code gap that review surfaced: `signInWithApple()` was calling
`provider.credential({ idToken, rawNonce: undefined })` — no nonce was ever generated or
sent to Apple at all.*

**Why this mattered**: without a nonce, Firebase has no way to bind one specific Apple
identity token to one specific sign-in attempt. Apple/Firebase's own documented native-iOS
pattern exists specifically to close this gap: send Apple the SHA-256 hash of a fresh random
value (Apple embeds that hash, unmodified, as the token's `nonce` claim), then give Firebase
the original raw value so `signInWithCredential` can re-hash and verify the match itself.
Skipping this doesn't break normal sign-in (which is why it went unnoticed), it just removes
replay protection silently.

**Fix** (`mobile/src/features/auth/services/appleSignIn.ts`):
- Added `expo-crypto` (`~57.0.2`, SDK-57-compatible, installed via `npx expo install
  expo-crypto` — the only dependency/version change this session).
- `rawNonce = Crypto.randomUUID()` generated fresh on every call (cryptographically secure
  per `expo-crypto`'s own documented implementation).
- `hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,
  rawNonce)` sent to Apple as `signInAsync({ ..., nonce: hashedNonce })`.
- The original `rawNonce` (never the hash) passed to
  `provider.credential({ idToken, rawNonce })` — matches Firebase's documented iOS pattern
  exactly.
- Cancellation and missing-identity-token error paths unchanged.

**Tests added** (`mobile/src/features/auth/services/appleSignIn.test.ts`, 5 new, all
passing): Apple receives the hash and never the raw value; Firebase receives the raw value
and never the hash or `undefined`; a fresh nonce is generated on every call (no reuse across
attempts); cancellation and missing-token paths still short-circuit before Firebase is ever
reached.

**Validation this session** (`mobile/`):

| Check | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npx jest` | 9 suites, 77 tests, all passing — 5 of these are the new `appleSignIn.test.ts` (no prior test file existed for this service) |
| `npx expo lint` | 0 errors |
| `npx expo-doctor` | 20/21 checks pass — the 1 failure is a **pre-existing**, unrelated `expo`/`expo-router` patch-version drift already flagged in §13, not introduced or touched by this fix |
| `npx expo install --check` | same pre-existing drift only; `expo-crypto` itself resolved at the correct SDK-57-compatible version |
| `git status --porcelain frontend backend` | empty — untouched |

**Scope discipline**: only `appleSignIn.ts` (+ its new test file) and the `expo-crypto`
dependency addition (`package.json`/`package-lock.json`) changed. No other auth file, no
`backend/`, no `frontend/`, no MFA-enforcement flag, no build/commit/push, no Phase 4 work.

## 15. Google Sign-In config-plugin wiring — IMPLEMENTED 2026-09-09, one value still pending

**Inspection findings** (`googleSignIn.ts`, `.env.example`, `app.config.ts`, the installed
`@react-native-google-signin/google-signin@16.1.5` package's own config-plugin source
`plugin/build/withGoogleSignIn.js`):

- `googleSignIn.ts` calls `GoogleSignin.configure({ webClientId, iosClientId? })` and gates
  everything on `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` alone (`isGoogleSignInConfigured()`) — a
  **Web** OAuth client ID is the one value required for the JS side; `iosClientId` is
  optional.
- The package ships **two** config-plugin variants (read directly from its source, not
  assumed): passing an `options` object (`{ iosUrlScheme }`) selects the "without Firebase"
  path — sets only the iOS Info.plist URL scheme, touches nothing on Android; omitting
  `options` selects the "with Firebase" path, which requires `ios.googleServicesFile` **and**
  `android.googleServicesFile` in `app.config.ts` — i.e. committing both native config
  files into the repo.
- **Chosen: the options-based ("without Firebase") variant** — consistent with this app's
  established architecture (plain `firebase` JS SDK, no `@react-native-firebase`, no native
  Google config files committed — see §11.8a/§14). This means **`google-services.json` is
  NOT required** for Android under this variant: `@react-native-google-signin`'s native
  Android sign-in flow verifies the calling app against Google Cloud's registered SHA-1 +
  package name at sign-in time, not from a bundled file. The client was correctly *not*
  asked to download it.
- `iosUrlScheme` and the optional iOS-specific client ID both come from the already
  Downloads-folder-resident `GoogleService-Info.plist` (`REVERSED_CLIENT_ID` and
  `CLIENT_ID` respectively) — read locally via a one-off script, values never printed in
  full to any terminal output or this document, only redacted/masked forms and a
  format-validation boolean (`REVERSED_CLIENT_ID` confirmed to start with
  `com.googleusercontent.apps.`, matching the plugin's own validation).

**Implemented**:
- `app.config.ts` — added the `@react-native-google-signin/google-signin` plugin entry with
  `iosUrlScheme` set to the real value (a public identifier, not a secret — same status as
  the bundle ID; this is why it's acceptable in this tracked config file, unlike the
  Firebase values which stay in `.env.local`). Removed the now-stale "not added yet" comment
  it replaces.
- `mobile/.env.local` — `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` populated from the plist's
  `CLIENT_ID`. `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` remains blank — this value does **not**
  exist in the plist (it's a separate OAuth client, visible only in Firebase Console →
  Authentication → Sign-in method → Google → Web SDK configuration) and must come from the
  client.
- A **data-corruption near-miss, caught and fixed within this session**: the first-pass
  automation script re-wrote `app.config.ts` using PowerShell's default (non-UTF-8) text
  encoding, mangling every pre-existing em-dash/section-sign character in the file into
  mojibake. Caught immediately via the harness's own file-changed-on-disk diff, confirmed
  with `grep -c "â€" app.config.ts .env.local` (0 matches after the fix), and corrected by
  rewriting the file with the correct UTF-8 content restored (the newly-added
  Google Sign-In block itself was ASCII-only and unaffected). No other file was touched by
  the corrupted write. Recorded here for full transparency, not because it went unnoticed.

**Validation this session** (`mobile/`):

| Check | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npx jest` | 9 suites, 77 tests, all passing (unchanged — no test logic touched this step) |
| `npx expo lint` | 0 errors |
| `npx expo-doctor` | 20/21 — same pre-existing, unrelated `expo`/`expo-router` patch-version drift as §13/§14, untouched |
| `npx expo config --json` (resolved-config check) | resolves cleanly, exit 0, no stderr — confirms the plugin runs without throwing; confirmed exactly one `googleusercontent`-scheme entry present in the resolved iOS `Info.plist` URL types, without printing the value |
| `git check-ignore -v mobile/.env.local` | matches `mobile/.gitignore:45` |
| `git status --porcelain frontend backend` | unchanged from session start |
| repo-wide check for a copied `GoogleService-Info.plist`/`google-services.json` | none found — both platform files stay outside the repo, as required |

**Google Sign-In build-readiness (update 2026-09-09 — Web client ID supplied):** the client
downloaded the existing Android `google-services.json` to their Downloads folder (kept
outside the repo, never copied in — confirmed by repo-wide search). Parsed locally via a
one-off script (values never printed in full, only redacted/masked forms and boolean
checks):
- `project_info.project_id` confirmed matching `flacronai-c8dab` ✅
- Exactly one `client[]` entry's `android_client_info.package_name` confirmed matching
  `com.flacronenterprises.flacronai` ✅
- Exactly one `oauth_client` entry with `client_type: 3` (Web) found within that client
  entry — its `client_id` written to `mobile/.env.local`'s
  `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (previously blank).

Both `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` and `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` in
`.env.local` are now non-blank, so `isGoogleSignInConfigured()` will evaluate `true` in a
real Expo/EAS build (Jest still shows the "not configured" path — expected and
unchanged, see `googleSignIn.test.ts`'s own header comment: Jest never loads `.env.local`,
only the Expo/EAS build pipeline does).

**Re-validated after this step**: `tsc` 0 errors; jest 9/9 suites, 77/77 tests (unchanged,
confirms `.env.local` values don't affect Jest as designed); `expo lint` 0 errors;
`expo config --json` resolves cleanly (exit 0, no stderr); `expo-doctor` 20/21 (same
pre-existing, unrelated version-drift finding); `git check-ignore -v mobile/.env.local`
still matches `.gitignore:45`; `frontend`/`backend` diff unchanged from session start; no
`google-services.json` anywhere under `mobile/` in the repo.

**Google Sign-In is now code/config build-ready.** The only remaining Android blocker is
the one already flagged (§11.8 item 6, unchanged by this step): the existing SHA-1's origin
is unknown and no EAS-managed Android signing credential/build exists yet
(`eas build:list` still empty as of this session) — Google Sign-In cannot be exercised on a
real Android build until an EAS development build is produced and *that* build's own
SHA-1 (and optionally SHA-256) is added to Firebase alongside the existing entry. This is a
build/credential step, explicitly not performed here (no build triggered, no credential
generated, per instruction).

## 16. EAS environment variables + Expo/expo-router patch update — COMPLETED 2026-09-09/10

**EAS Environment Variables** (approved action 1): confirmed the exact 8-name list first —
the 6 `EXPO_PUBLIC_FIREBASE_*` values + `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` +
`EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` — deliberately excluding `EXPO_PUBLIC_APP_ENV` (already
per-profile in `eas.json`) and `EXPO_PUBLIC_API_BASE_URL` (local/session-specific, must stay
out of EAS per instruction). `eas env:list development --scope project` first confirmed
**zero** existing variables — no conflict, safe to proceed. Created via `eas env:set`
(current, non-deprecated command) for each, reading values out of `.env.local` inside a
script (values never typed literally by the assistant, never printed — even the CLI's own
success-message output was redacted before being surfaced). All 8 confirmed present via a
second `env:list` call, masked (`*****`, "sensitive" visibility) — matches the requested
Sensitive tier. Local `.env.local` and `.env.example` untouched by this step.

**Expo/expo-router patch update** (approved action 2): `npx expo install expo expo-router`
first failed with a transient `ECONNRESET` (flaky network, already a known condition on
this machine per `CLAUDE.md`) after partially bumping `package.json`'s `expo` entry but
before touching `expo-router` or actually installing; a plain retry of the same idempotent
command succeeded cleanly the second time. Confirmed installed:
`expo@57.0.21` (was `57.0.20`), `expo-router@57.0.20` (was `57.0.19`) — both now exactly the
versions `expo-doctor`/`expo install --check` expected.

**Full validation, all green — the drift finding from §13/§14/§15 is now fully resolved**:

| Check | Result |
|---|---|
| `npx expo install --check` | "Dependencies are up to date" |
| `npx expo-doctor` | **21/21 checks passed** (was 20/21 — the patch-drift finding is gone) |
| `npx tsc --noEmit` | 0 errors |
| `npx expo lint` | 0 errors |
| `npx jest` | 9 suites, 77/77 passing, unchanged |
| `npx expo config --json` | resolves cleanly, exit 0; confirmed exactly one `googleusercontent` scheme entry present |
| `eas env:list development` | all 8 names present, values masked (sensitive) |
| `git check-ignore -v mobile/.env.local` | still matches `.gitignore:45` |
| repo-wide search for a copied `GoogleService-Info.plist`/`google-services.json` | none found |
| `git status --porcelain frontend backend` | unchanged from session start |
| diff scan for leaked secrets in tracked files (`app.config.ts`/`.env.example`/`eas.json`) | only the intentional, already-documented-as-public `iosUrlScheme` in `app.config.ts` (§15) — no Firebase API key, no `firebaseapp.com` domain, nothing else |

**Exact diff (against last commit, `mobile/` only, this cumulative Phase 3 work — not yet
committed)**: `package.json` +18/-5 (adds `expo-crypto` + the patch bumps; the other
`dependencies`/`devDependencies` lines shown in a full diff — `firebase`, `@react-native-google-signin/google-signin`,
`jest`, `@testing-library/react-native`, etc. — predate this session, from earlier Phase 3
work, never committed); `package-lock.json` a large mechanical diff from npm's own
resolution (expected for an SDK dependency-tree update, not hand-edited); `app.config.ts`
+34 lines (the Google Sign-In plugin block, §15); `.env.example` diff predates this session,
unrelated, confirmed placeholder-only. No `backend/`/`frontend/` file appears in any diff.

**Not performed, per instruction**: no EAS build triggered, no signing credential
created/rotated, no Firebase fingerprint added, no backend tunnel started, no commit/push/
deploy, MFA enforcement untouched, Phase 4 not started.

## 17. First Android EAS development build — COMPLETED 2026-09-10 (client-approved)

- First attempt failed pre-flight (no cloud/credential step reached): `expo-dev-client` was
  missing, required by the existing `developmentClient: true` profile. Installed
  (`npx expo install expo-dev-client`); `tsc`/`expo-doctor` (21/21) re-confirmed clean; build
  retried and succeeded.
- **Build `6c609bb0-9d54-4134-ad4d-68ec9ba7c3df`** — confirmed via `eas build:view --json`
  (not assumed): `status: FINISHED`, `distribution: INTERNAL`, `buildProfile: development`,
  `appIdentifier: com.flacronenterprises.flacronai`, owner `flacron-enterprises-llc`. No
  submission field present — not submitted to any store. New EAS-managed Android keystore
  generated in the cloud (confirmed in the build log: "Generating keystore in the
  cloud... Created keystore") — no prior credential existed, nothing reused/replaced.
- **Artifact expiry: created 2026-09-10, expires 2026-09-24 — 14 days, not 30** (an earlier
  same-session chat message incorrectly said "standard 30-day" without having verified it;
  corrected here — that unverified figure was never written into any doc file, only said in
  chat).
- Install link: `https://expo.dev/accounts/flacron-enterprises-llc/projects/flacronai/builds/6c609bb0-9d54-4134-ad4d-68ec9ba7c3df`
  (QR also present in the build's own log output).
- Metro started in tunnel mode (`expo start --tunnel --dev-client`) — confirmed "Tunnel
  connected. Tunnel ready." in its log — same proven mechanism as Phase 1's device test.
- **`eas credentials -p android` cannot be driven non-interactively from this session — a
  confirmed hard limitation, not a menu-navigation guess.** Two separate attempts (with and
  without piped stdin) both immediately returned `Input is required, but stdin is not
  readable` before displaying any menu at all — this prompt library requires a real TTY,
  which the shell this session runs commands through does not provide.
- **Resolved instead by reading the certificate straight off the signed APK artifact**
  (2026-09-10, client-directed): fetched the artifact URL via `eas build:view --json`,
  downloaded the APK to a scratch temp folder outside the repo, and inspected its signing
  certificate directly — no `eas credentials`, no keystore download/export. Neither
  `keytool`, `apksigner`, nor `jar` is installed in this environment; `unzip`ping the APK
  showed no `META-INF/*.RSA` (this build uses APK Signature Scheme **v2 only**, no legacy
  v1/JAR signing), so a small, from-scratch Python parser (kept only in the local scratch
  temp folder, not the repo) walked the documented APK Signing Block format directly:
  ZIP EOCD → central-directory offset → the 16-byte `APK Sig Block 42` magic and matching
  size fields immediately before it → the `0x7109871a` (v2) ID-value pair → signer →
  signed-data → first X.509 certificate (DER), extracted with a working sanity check
  (both signing-block size fields cross-validated equal before trusting the parse).
  `openssl x509 -fingerprint` on that DER certificate produced the fingerprints below.
  **Package/build association verified via the build record, not the certificate itself**
  (an X.509 signing cert doesn't encode an Android package name) — the artifact URL was
  taken directly from this exact build's `eas build:view --json` output, which already
  states `appIdentifier: com.flacronenterprises.flacronai`; independently, the
  certificate's `notBefore` (2026-09-10 06:32:16 UTC) lands within a minute of this build's
  own `createdAt` (06:33:15 UTC) and the log's "Generating keystore in the cloud" step —
  consistent with a keystore freshly generated for this exact build, not a stale/unrelated
  one.
  - **SHA-1**: `F0:AB:78:0B:36:AA:57:15:2C:38:AB:A4:9C:97:07:C5:56:3A:16:C9`
  - **SHA-256**: `87:97:4B:B7:F2:48:21:3E:D6:9F:75:02:48:A8:9A:17:58:F3:42:C4:3E:42:6C:C8:D3:37:E3:53:3F:92:A0:B3`
  - The APK (255 MB), the extracted `cert.der`, and the parser script were all deleted from
    the local scratch temp folder immediately after use — confirmed via `git status
    --porcelain mobile/` showing no `.apk`/`cert.der` entry (they were never inside the
    repo to begin with). No private-key material was ever read or exposed — only the
    public certificate embedded in the already-signed, publicly-downloadable APK.

## 18. Android runtime authentication testing — PASSED — Phase 3 CLOSED (2026-09-10/11)

*All items below are the client's own direct reports from testing the installed EAS
development build (`6c609bb0-9d54-4134-ad4d-68ec9ba7c3df`) on a physical Android device,
first over a public tunnel then over a direct LAN connection (see §19) — not independently
re-verified by this session beyond the log/account diagnosis in the forgot-password item.*

### 18.1 Passed

- **Signup** (email/password) — passed.
- **Email verification** — passed.
- **Email/password login** — passed (confirmed both standalone and as the first step of the
  MFA flow below).
- **Session restoration** (app closed/reopened while still signed in) — passed.
- **Logout** — passed.
- **Forgot-password flow** — passed end-to-end using a second registered account (full
  reset completed). See §18.2 for the one-account anomaly encountered along the way.
- **Google Sign-In** — passed.
- **MFA/TOTP** — passed: the MFA challenge correctly appeared before the Welcome/home
  screen, an incorrect code was correctly rejected with the expected error, a current valid
  Google Authenticator code was accepted, and login completed successfully.

### 18.2 Forgot-password anomaly on one account — diagnosed, root-caused, NOT an app defect

One test account did not receive its reset email while other accounts
did, across 8 consecutive attempts in a ~22-minute window. Read-only diagnosis (this
session, before any code change, no repeated live resends triggered — see the diagnosis
turn for full detail):
- Confirmed the mobile app calls the **backend** endpoint (`POST /auth/forgot-password`),
  not the Firebase Client SDK directly — matching the architecture's original design.
- Backend logs showed every attempt for this account, and only this account, failing at
  `admin.auth().generatePasswordResetLink()` with `INTERNAL ASSERT FAILED: Unable to create
  the email action link` — a documented firebase-admin-node failure mode, occurring
  **before** the app's AWS SES send step is ever reached.
- The Firebase user record was confirmed to exist, `emailVerified: true`, `disabled: false`,
  single `password` provider — a normally-provisioned account, not a broken one.
- Reproducing the identical `generatePasswordResetLink()` call once, in isolation (no email
  sent by this call either way), **succeeded** immediately after.
- **Conclusion: transient Firebase-side throttling/rate-limiting on repeated
  password-reset-link generation for one account, triggered by rapid repeated testing —
  not account-specific email delivery/filtering, and not an application defect.** The
  backend's intentional anti-enumeration design (always returning success to the client) is
  working as designed; it just also makes this class of transient failure invisible to the
  client, which is why it looked like a delivery issue from the outside. No code was
  changed. A possible future improvement (internal-logging/alerting only, never
  client-facing) is flagged for later, not actioned here.

### 18.3 Explicitly deferred — do not claim as validated

**iOS/Apple runtime testing has not been performed** — no iPhone/iOS device or simulator was
available this session. This is a genuine gap, not a pass, and this documentation set does
**not** claim full release validation: Apple Sign-In's native flow, iOS session
handling, iOS-specific Firebase config, and general iOS UI/UX remain unverified on real
hardware. Static iOS configuration (bundle ID, Firebase iOS app registration, `usesAppleSignIn`,
plugin wiring) is in place per §11.8b/§11.8d-f, but that is configuration, not runtime
validation.

### 18.4 Phase 3 status: **CLOSED**

Phase 3 — Authentication is now complete across all four required dimensions:
- **Implementation**: full auth architecture, all flows, route guards, error handling (§11).
- **Configuration**: Firebase Android+iOS apps, Email/Password + Google + Apple providers,
  Google/Apple OAuth clients, EAS environment variables, all console-side dependencies
  closed (§11.8-§17).
- **Automated validation**: `tsc`/lint/jest (77/77)/`expo-doctor`/resolved-config all
  passing (§8/§16/§18.5 below).
- **Android runtime validation**: the full authentication matrix (§18.1) passed on a real
  physical device against a real local backend.

**Not claimed complete**: iOS runtime validation (§18.3, explicitly deferred). Server-side
MFA enforcement remains implemented-but-disabled by design (§12.9) — a separate, later,
explicit activation decision, not a Phase 3 gap.

### 18.5 Session closure — infrastructure teardown and final validation (2026-09-11)

- **Metro and backend dev servers stopped** — confirmed via health-check requests failing
  after stop, and via `Get-NetTCPConnection` showing ports 3000/8081 free.
- **Temporary firewall rules removed — CONFIRMED.** Client ran both
  `Remove-NetFirewallRule` commands in an elevated PowerShell; this session verified via
  `netsh advfirewall firewall show rule name="..."` for both exact rule names — both
  return "No rules match the specified criteria." No LAN/dev port exposure remains.
- **`mobile/.env.local`** `EXPO_PUBLIC_API_BASE_URL` restored to the confirmed local-dev
  default (`http://localhost:3000/api/v1`, matching `.env.example`'s documented
  iOS-Simulator/Expo-web value) — the temporary LAN IP value removed. File remains
  git-ignored/untracked (re-confirmed via `git check-ignore -v`).
- **Final validation**: `tsc --noEmit` 0 errors; `jest` 9 suites/77 tests, all passing;
  `expo lint` 0 errors; `expo config --json` resolves cleanly. `expo-doctor` shows a
  **new, time-based** patch-version drift (12 packages) that appeared naturally since the
  previous session (Expo published newer SDK-57 patches overnight) — not caused by
  anything changed this session (no dependency was added/upgraded today), out of scope for
  this closure, flagged for a future task.
- **Git/secret checks**: `frontend`/`backend` diff unchanged from this session's start;
  `mobile/` diff scope unchanged (only the already-documented tracked files); no
  `.env.local`, APK, plist, or `google-services.json` tracked; the only public identifier
  present in a tracked file (`app.config.ts`'s `iosUrlScheme`) re-confirmed intentional and
  non-secret per §15/§16.
- Nothing committed, pushed, deployed, or submitted. MFA enforcement untouched (still
  disabled). Phase 4 not started.
