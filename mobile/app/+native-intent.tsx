/**
 * Expo Router native-intent hook. Only one rewrite: the Phase 10 e2e launch link
 * (`flacronai://e2e-config?...`, read by src/config/e2eRuntimeConfig.ts) opens the app's start
 * route instead of an unmatched-route screen. Every other incoming link is passed through unchanged.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    if (/^(flacronai:\/\/)?\/?e2e-config(\?|$)/.test(path)) return '/';
  } catch {
    // fall through
  }
  return path;
}
