# src/hooks/

Shared custom hooks used across more than one feature. Empty in the foundation phase —
`src/theme/index.ts`'s `useTheme()` is the only hook the app currently needs, and it lives
in `theme/` (it's a theme concern, not a cross-feature one).

## Convention

Add a hook here only once at least two features need it (e.g. `useAuthUser()` once both
the dashboard and settings features need the current user). A hook needed by only one
feature belongs in that feature's own `src/features/<feature>/hooks/` instead
(see `src/features/README.md`) — promote it here later if a second feature ends up needing
the same thing.
