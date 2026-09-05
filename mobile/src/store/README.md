# src/store/

App-wide client state (authenticated user, session status, and any state genuinely shared
across unrelated features). Empty in the foundation phase — there is no state to manage
yet, and no library has been chosen.

## Open decision (see `mobile/MOBILE_DEVELOPMENT_PHASES.md` §10)

The state-management mechanism is **not decided**. It should be picked in Phase 3
(Authentication) once there's a real, concrete state shape to design around (the
authenticated user/session), rather than guessed now. Candidates to weigh at that point:
React Context + hooks (zero extra dependency, fine at this app's likely size) vs. a small
external store (Zustand is the common current choice for Expo apps that outgrow Context).
Do not default to Redux without a specific reason — it is unlikely to be justified for an
app this size.

Whatever is chosen, keep server-state (reports, photos, etc. — anything that mirrors
backend data) out of this store; that belongs behind `src/services/api/*` with its own
caching approach (e.g. TanStack Query), decided in Phase 4 alongside the API client.
