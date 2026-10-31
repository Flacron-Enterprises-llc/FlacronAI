# QA APK login: diagnosis and production sign-in (QA federation)

Status (2026-10-26): **approved design implemented.** The token exchange (§3) is in the code (commit `9566676`
on `integration/web-mobile-combined`) and deployed to the staging API (Cloud Run revision
`flacronai-staging-api-00014-x9g`; rollback: `00012-fzl`). The QA APK workflow builds from `qa/web-mobile-combined`
(commit `2935138`). No production configuration, user account or credential was changed.

Verified:
- **Unit and route tests:** backend 1437/0 (12 federation tests), mobile 527/0 (12 federation-flow tests plus guard tests).
- **Live staging-only checks:** 8/8. The endpoint is live, rejects garbage and staging-audience tokens, leaves
  native staging sessions working, and deletes its disposable account afterwards.

Pending:
- **Live check with a real production sign-in:** the run was blocked because it would create disposable production
  accounts. It needs an approved test account or a tester on a device.
- **New APK:** needs the `qa-android` GitHub environment and the staging Workload Identity provider to allow
  `qa/web-mobile-combined`.
- **Physical-device checks:** install, email/password sign-in, MFA step, sign-out, account switching.

How it works now: the user signs in with their FlacronAI website account in the QA app, which uses the production
project for identity only. `POST /auth/federated/exchange` verifies the token and lets production check MFA and
revocation, then returns a 1-hour staging session for a passwordless staging copy of the account. Everything else
stays in staging.

Actual limitations:
- A production password change or sign-out-everywhere ends QA access at the next renewal, within 1 hour, not instantly.
- A production ID token issued before such a change is still accepted until it expires (up to 1 hour), because
  staging has no production credential to check revocation.
- **Google sign-in is disabled in this release.** Against the production identity project, Firebase creates a
  production account for any unknown Google user, and only a production change (a blocking function or disabling
  sign-up) could prevent that. Deleting it afterwards would still be a production side effect, so the QA app has no
  federated Google path at all, and the build guard rejects any Google client ID.

The sections below are the original diagnosis and proposal.

## 1. Confirmed cause of "Invalid email or password"

| Item | Finding |
|---|---|
| Installed build | Latest App Distribution release `03hc2qep8422o` (2026-10-12), GitHub run `38232943094`, commit `c13e632` on `qa/android-qa-apk`. All three releases report `1.0.0 (1)`, so the screen cannot tell them apart, but no mobile code changed after `c13e632`. |
| Firebase / backend | Auth: staging project `flacronai-staging-qa`. API: `flacronai-staging-api` (Cloud Run, staging). |
| Account | `admin@flacronenterprises.com` does **not exist** in staging Auth (0 users). |
| Sanitized error | Staging returns `INVALID_LOGIN_CREDENTIALS` (email-enumeration protection is on, so a missing account and a wrong password look the same). The app maps it to "Invalid email or password". |
| Cause | A **missing staging account**, not a wrong password, provider mismatch or backend fault. The QA app never checks production, so production credentials can never work in the current build. |
| Tester allowlist | None in the app or backend. The App Distribution group `qa-testers` only controls who can download. (`STORE_SANDBOX_TESTER_EMAILS` is unrelated: store-purchase sandbox.) |
| Staging email | Staging has no email provider (SES not configured), so backend verification and reset emails are skipped (`backend/deploy/staging-gcp/verify-tester.sh`). |

## 2. Google sign-in findings

- The button is disabled because `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` was empty in the `qa` build. The APK is a native
  Gradle build, so the native module is included. The "EAS development build" note was wrong for this APK and has been
  corrected in `SocialSignInButtons.tsx`.
- APK signer (read from the distributed APK): SHA-1 `F0:AB:78:0B:36:AA:57:15:2C:38:AB:A4:9C:97:07:C5:56:3A:16:C9`,
  SHA-256 `87974bb7f248213ed69f750248a89a1758f342c43e426cc8d337e3533f92a0b3`. Both are registered on the staging
  Firebase Android app.
- Staging Auth has **no Google provider enabled**.
- **Blocker for staging-project Google sign-in:** the QA APK uses the production package `com.flacronenterprises.flacronai`
  and the company signing key. Production (`flacronai-c8dab`) already owns Android OAuth clients for that package with
  both SHA-1s. Google allows a package + SHA-1 pair in only one Android OAuth client, so staging cannot get one for the
  current APK identity. Staging-project Google sign-in therefore needs a distinct QA package (e.g.
  `com.flacronenterprises.flacronai.qa`) or a distinct QA signing key: a native change and a new APK.
- With the production-identity design below, Google sign-in uses production's **existing** Android and web OAuth
  clients. That needs no production configuration change and no package change.

## 3. Can production users sign in to the QA APK while QA stays isolated?

**Yes, with a token exchange.** Production Auth only proves who the user is. All QA state stays in staging.

1. The QA app keeps a second Firebase client app configured with the production project's **public** web config.
   It is used only for `signInWithEmailAndPassword` / Google `signInWithCredential`. The app never calls sign-up,
   password, email or delete APIs on it.
2. The app sends the production ID token to a new staging endpoint, `POST /auth/federated/exchange`.
3. The staging backend verifies the token with a second firebase-admin app initialised with **only**
   `projectId: flacronai-c8dab`. ID token verification needs no credential, so staging holds **no production
   credential** and cannot change production identities, even by a bug. It requires `email_verified`, then
   issues a **staging** custom token for a staging "shadow" user (uid = production uid, email copied, marked
   `federated: true`).
4. The app signs in to staging Auth with that custom token. From then on, every existing staging code path works
   unchanged against staging data.

### Isolation, mapped to the current code

| Concern | Behaviour |
|---|---|
| Profiles, reports, files, notifications, background jobs | Staging Firestore, Storage, FCM and Cloud Run only, keyed by the shadow uid. The existing staging code is unchanged. |
| Billing | Staging Stripe (test key) and store sandboxes only. Live subscriptions cannot be reached. |
| Account deletion | `accountDeletionCleanup` calls `getAuth().deleteUser` on **staging** (deletes the shadow only) and cancels staging test-mode Stripe only. The production identity is untouched. The tombstone blocks re-exchange unless an admin clears it. |
| Password change / reset | Must be blocked for federated shadows (backend rejects `/auth/change-password`, `/users/change-password`, `/auth/forgot-password`; the app hides them and links to flacronai.com). Otherwise they would only set a confusing staging password. Production recovery stays on the website. |
| MFA | MFA is the app's own TOTP, stored in Firestore. Staging **cannot see** production enrolment, and a shared secret would weaken production. Recommended: require a separate QA TOTP enrolment for federated users. Without it, a production password alone opens QA (test data only). |
| Session revocation | Production sign-out-everywhere / password change revokes production refresh tokens. The app re-exchanges on launch, on foreground and at least hourly, and the staging middleware rejects federated sessions not re-verified within 60 minutes. Residual window: about 1 hour. |
| Roles | Taken only from staging (`ADMIN_EMAIL` in the staging secret, staging Firestore roles). Production admin rights are never copied. A staging admin must be granted explicitly. |
| Notifications | Production's backend is not involved, so it sends no emails or new-device alerts. Staging has no SES, and FCM goes only to QA devices. |
| Email collision | If a native staging account already uses the email, the exchange is refused (or an admin links the accounts). Do **not** pre-create a staging account for an email that should use this flow. |

### Unavoidable production impact (no production configuration changes)

- QA sign-ins hit production Firebase Auth: they update `lastLoginAt`, use quota and share rate limits. Repeated
  failed QA attempts can briefly trigger production's `too-many-requests` lockout for that account's web sign-in.
- Production refresh tokens live on QA devices until signed out or revoked.
- A **first-time Google user** (no FlacronAI account yet) gets a bare production Auth record when signing in from
  QA (no profile, no data, no emails). The app should detect `isNewUser`, sign out and point to flacronai.com.
  Fully preventing it would need a production blocking function, which is a production change.

### Work required (after approval)

- Backend (staging only, behind a flag such as `FEDERATED_PROD_LOGIN_ENABLED`, off by default): exchange endpoint,
  identity-only admin app, federated checks in `middleware/auth.js`, guards on the three password routes, QA MFA
  policy, tests. Allow `PROD_IDENTITY_PROJECT_ID` in `backend/deploy/staging-gcp/build-env.js` and
  `set-staging-secret.js`.
- Mobile: production identity client, exchange and re-exchange loop, hidden password/email management for federated
  accounts, `isNewUser` handling. `qa` profile env: production public web config and
  `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` = production web client ID.
- Release: staging backend deploy plus a new QA APK from the combined branch (the QA workflow currently refuses
  non-QA branches). Both need publishing approval.

## 4. Safest alternative if production auth must not be touched at all

Separate staging accounts. A staging admin creates the account (no password set) and sends a reset link through
Firebase's built-in mailer for the staging project, which is independent of SES. The user chooses a QA-only password.
Delivery still has to be confirmed with a real inbox before relying on it. Google sign-in then needs the distinct QA
package or signing key from §2. Production users must keep a second password, which does not meet "existing
credentials".

## 5. Exposed password

The address in the screenshot does not exist in staging. If that password is valid anywhere, it is the
**production** account's. The account owner should change it on flacronai.com (Settings → Security), which
revokes all sessions. It was not tested against production and not reset by us.
