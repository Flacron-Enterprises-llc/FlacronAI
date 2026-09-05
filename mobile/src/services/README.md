# src/services/

External-facing integrations: the backend API client, secure token storage, push
notifications. **Empty in the foundation phase on purpose** — no API integration exists
yet, per the explicit scope boundary of Phase 1
(see `mobile/MOBILE_DEVELOPMENT_PHASES.md`).

## Convention (applies starting Phase 3/4)

```
src/services/
  api/
    client.ts        Base HTTP client — auth header attach, /api/v1 base URL, error envelope
    reports.ts        Typed methods for backend/routes/reports.js endpoints
    users.ts           ...users.js
    payment.ts          ...payment.js
    notifications.ts     ...notifications.js
  secure-storage.ts    Token persistence (expo-secure-store — never AsyncStorage for tokens)
  push.ts               Expo push token registration (Phase 6)
```

Rules that apply the moment this folder is populated (copied from the phase tracker so
they're visible at the point of use):

- Every method here must map to a route confirmed to exist in `backend/routes/*` — never
  an invented endpoint.
- All requests target `/api/v1/*` (the versioned prefix), not the legacy unversioned
  `/api` alias.
- The backend's response envelope is `{ success, error, code }`; the backend also
  distinguishes a genuinely invalid token (`401 INVALID_TOKEN`) from a transient
  verification failure (`503 AUTH_VERIFY_UNAVAILABLE`) — these must not be collapsed into
  one "auth failed" handler, or a transient hiccup will force an unnecessary re-login.
- Real production API base URL is not yet confirmed (see phase tracker §2/§10) — do not
  hardcode a guessed URL here when this file is first populated.
