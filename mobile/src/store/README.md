# src/store/

App-wide client state (authenticated user, session status, and any state genuinely shared
across unrelated features). Still empty — Phase 3 (Authentication) resolved the mechanism
decision below, but the state itself lives in `src/features/auth/context/AuthProvider.tsx`,
not here (see "Decision" below for why).

## Decision (Phase 3, 2026-09-08 — resolves the open question this file previously posed)

**React Context + hooks**, not an external store. `AuthProvider` (React Context) holds the
authenticated user/session state — the one concrete state shape that existed to design
around. No external state-management library was added: nothing about the auth state shape
(a handful of primitives — `firebaseUser`, `userProfile`, a derived `status` enum, a couple
of loading/error flags) justified Zustand/Redux's overhead, and the task's own guidance was
explicit not to add a state library "if React Context/hooks are sufficient." Revisit only if
a future phase's state shape genuinely outgrows Context (e.g., very frequent updates across
many unrelated consumers causing real re-render cost) — not preemptively.

This folder stays empty rather than housing `AuthProvider` directly because
`src/features/README.md`'s convention keeps feature state colocated with its feature
(`src/features/auth/context/`) — this folder is reserved for state genuinely shared
*across* unrelated features, which doesn't exist yet.

Whatever is chosen, keep server-state (reports, photos, etc. — anything that mirrors
backend data) out of this store; that belongs behind `src/services/api/*` with its own
caching approach (e.g. TanStack Query), decided in Phase 4 alongside the API client.
