# src/services/

External-facing integrations: the backend API client, Firebase client, push notifications.
Populated starting Phase 3 (Authentication, 2026-09-08) — see the actual shape below,
which Phase 4 extends rather than replaces.

```
src/services/
  api/
    client.ts        Fetch-based HTTP client — auth header attach (Firebase ID token),
                     /api/v1 base URL via config/env.ts, the retry contract below. Scoped
                     to what Phase 3 needed; Phase 4 adds reports.ts/payment.ts/
                     notifications.ts etc. for the rest of the backend surface.
    auth.ts           Typed wrappers for the auth/MFA endpoints mobile actually uses
                     (verify, forgot-password, send-verification, mfa/*, logout) —
                     deliberately NOT /auth/login or /auth/register, see
                     AUTHENTICATION_ARCHITECTURE.md §4/§10
    users.ts           getProfile, updateProfile, recordRegistrationConsent
  firebase/
    client.ts          Firebase app/auth initialization with RN persistence
                     (getReactNativePersistence + AsyncStorage) — see that file's own
                     header comment for a real TypeScript/exports-map gap it works around
```

No `secure-storage.ts`/`push.ts` yet — Phase 3 didn't need either (Firebase's own RN
persistence covers session storage; push is Phase 6). Add `secure-storage.ts`
(`expo-secure-store`) only if a future phase needs to cache something sensitive beyond
Firebase's own managed session — never a manual duplicate of the Firebase session token
into `AsyncStorage`.

Rules that apply here (copied from the phase tracker so they're visible at the point of
use):

- Every method here must map to a route confirmed to exist in `backend/routes/*` — never
  an invented endpoint.
- All requests target `/api/v1/*` (the versioned prefix), not the legacy unversioned
  `/api` alias.
- The backend's response envelope is `{ success, error, code }`; the backend also
  distinguishes a genuinely invalid token (`401 INVALID_TOKEN`) from a transient
  verification failure (`503 AUTH_VERIFY_UNAVAILABLE`) — these must not be collapsed into
  one "auth failed" handler, or a transient hiccup will force an unnecessary re-login.
  `api/client.ts` implements this exact branch — reuse it rather than re-deriving it.
- Real production API base URL is not yet confirmed (see phase tracker §2/§10) — do not
  hardcode a guessed URL here.
