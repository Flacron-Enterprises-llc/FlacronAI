# src/features/

Feature-oriented modules. Empty in the foundation phase on purpose — no feature exists
yet (see `mobile/MOBILE_DEVELOPMENT_PHASES.md`, Phase 1 is intentionally screen-less
beyond a branded placeholder).

## Convention (applies starting Phase 3 — Authentication)

Each feature gets its own subfolder, self-contained:

```
src/features/<feature>/
  screens/       Screen-level components rendered by routes in app/
  components/    Components used only within this feature
  hooks/         Hooks used only within this feature
  types.ts       Feature-local types (shared types still live in src/types/)
```

Routes in `app/` stay thin — they import and render a screen from the matching
`src/features/<feature>/screens/` module rather than containing feature logic directly.
This keeps the router tree (which Expo Router treats as the file-based route source of
truth) free of business logic, so routing structure and feature logic can change
independently.

First feature to land here: `src/features/auth/` (Phase 3).
