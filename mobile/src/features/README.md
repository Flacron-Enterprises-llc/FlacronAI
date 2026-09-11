# src/features/

Feature-oriented modules. `src/features/auth/` (Phase 3, 2026-09-08) is the first feature
built here, following the convention below.

## Convention

Each feature gets its own subfolder, self-contained. `auth`'s actual shape (a realistic
template for the next feature, not just the plan):

```
src/features/auth/
  context/       AuthProvider (React Context) + authStatus.ts (pure route-guard decision
                 function, deliberately extracted so it's unit-testable without mounting
                 React or touching Firebase)
  screens/       Screen-level components rendered by routes in app/
  components/    Reusable form components used only within this feature
  services/      Provider-specific integrations (googleSignIn.ts, appleSignIn.ts)
  utils/         validation.ts, errorMessages.ts — pure, testable helpers
  types.ts       Feature-local types (shared types still live in src/types/)
  constants.ts   Small feature-local constants (e.g. REGISTRATION_POLICY_VERSION, kept in
                 sync with frontend/src/pages/Auth.jsx's copy of the same value)
```

`hooks/` wasn't needed for auth (no cross-component hook beyond `useAuth()`, which lives in
`context/AuthProvider.tsx` since it's tightly coupled to that provider) — add it to a
feature only once a real need appears, per this same convention.

Routes in `app/` stay thin — they import and render a screen from the matching
`src/features/<feature>/screens/` module rather than containing feature logic directly
(see every file under `app/{login,signup,...}.tsx` for the actual pattern — each is a
one-line re-export). This keeps the router tree (which Expo Router treats as the
file-based route source of truth) free of business logic, so routing structure and
feature logic can change independently.
