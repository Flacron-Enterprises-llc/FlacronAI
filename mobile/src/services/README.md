# src/services/

External-facing integrations: the backend API client, Firebase client, push notifications.
Populated starting Phase 3 (Authentication, 2026-09-08); Phase 4 (Backend/API Integration
Layer, 2026-09-16) extended `client.ts` in place and added the four resource clients below
— see the actual shape now:

```
src/services/
  api/
    client.ts            The one shared, typed HTTP client every resource client uses.
                         Phase 3: auth-header attach (Firebase ID token, one forced-
                         refresh retry on 401), X-MFA-Token attach + 403 MFA_REQUIRED
                         handling, /api/v1 base URL via config/env.ts. Phase 4 additions
                         (in place, same file — see its own header comment for the full
                         contract): bounded exponential-backoff-with-jitter retry (GET, or
                         a mutation explicitly marked `idempotent: true`, only), Retry-
                         After honored, offline short-circuit (offline.ts), timeout +
                         AbortSignal cancellation, query-string (`params`) and multipart
                         (`multipart: FormData`) support, a `responseType: 'binary'` mode
                         (`apiRequestBinary`) for photo/export/document downloads, and a
                         categorized `ApiRequestError` (`types/api.ts`'s `ApiErrorCategory`)
                         every resource-client method throws on failure.
    offline.ts            (Phase 4) Thin, defensive wrapper around
                         `@react-native-community/netinfo` — `isOffline()`/
                         `subscribeToConnectivity()`. Degrades to `null` ("unknown") rather
                         than throwing if the native module is unavailable.
    auth.ts               Typed wrappers for the auth/MFA endpoints mobile actually uses
                         (verify, forgot-password, send-verification, mfa/*, logout) —
                         deliberately NOT /auth/login or /auth/register, see
                         AUTHENTICATION_ARCHITECTURE.md §4/§10. Unchanged by Phase 4.
    users.ts              getProfile, updateProfile, recordRegistrationConsent (Phase 3);
                         + getUsage, updateNotificationPreferences (Phase 4)
    reports.ts            (Phase 4) dashboard summary, list/get/update, generate (+ photo
                         staging for the wizard), analysis-status/retry, photo gallery +
                         per-photo review, comments, versions, approve, review-response,
                         export + download, templates. See its own header comment for the
                         explicit out-of-scope list (sharing, archive/duplicate/delete,
                         photo reorder/annotations/regenerate, analyze-preview, add-photos).
    payment.ts            (Phase 4) Read-only: getCurrentSubscription, getInvoices; one
                         safe mutation: cancelSubscription (cancel-at-period-end only, no
                         charge). Deliberately excludes checkout-session creation/
                         confirmation — real-Stripe-charge routes, deferred to Phase 7
                         (Apple/Google IAP policy).
    notifications.ts      (Phase 4) list, markAsRead, markAllAsRead, plus
                         getPreferences/updatePreferences (thin wrappers over `users.ts` —
                         no dedicated preferences endpoint exists).
  firebase/
    client.ts             Firebase app/auth initialization with RN persistence
                         (getReactNativePersistence + AsyncStorage) — see that file's own
                         header comment for a real TypeScript/exports-map gap it works
                         around. Unchanged by Phase 4.
```

No `secure-storage.ts`/`push.ts` yet — Phase 3 didn't need either (Firebase's own RN
persistence covers session storage; push is Phase 6, and no device-token/push-sending
code exists anywhere in the backend yet — confirmed by Phase 4's own repo-wide search).
Add `secure-storage.ts` (`expo-secure-store`) only if a future phase needs to cache
something sensitive beyond Firebase's own managed session — never a manual duplicate of
the Firebase session token into `AsyncStorage`.

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
- A mutation is retried automatically ONLY when the resource-client method marks it
  `idempotent: true`, and only then because the specific backend route was confirmed (by
  reading its code, not assumed) to be safe to repeat — see each `idempotent: true` call
  site's own comment for the exact evidence. Never add `idempotent: true` to a new call
  without the same level of verification.
