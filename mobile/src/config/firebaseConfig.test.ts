import { getFirebaseConfig, isFirebaseConfigured, missingFirebaseConfigKeys } from './firebaseConfig';

/**
 * IMPORTANT — why this suite only exercises the "not configured" path, not the
 * "configured" positive path:
 *
 * `firebaseConfig.ts` deliberately reads `process.env.EXPO_PUBLIC_FIREBASE_*` as literal
 * member expressions (matching env.ts's established pattern) because Expo's Babel
 * pipeline (`babel-preset-expo`, used by both the real app bundle AND jest-expo's test
 * transform) statically inlines exactly that AST shape at TRANSFORM time, replacing each
 * expression with a literal — this is what makes `EXPO_PUBLIC_*` values reach a built
 * app binary at all, since a shipped app has no real OS-level environment to read from.
 * A consequence: mutating `process.env` inside a test body has no effect on a module
 * already transformed with different (or absent) values — the literal was baked in
 * before the test ever ran. Introducing indirection (reading through a parameter/object
 * instead of the literal `process.env.EXPO_PUBLIC_X` pattern) would make the module
 * testable but would BREAK it in the real app, since Babel's inliner only matches that
 * exact literal member-expression shape.
 *
 * This is not a workaround unique to this file — `mobile/MOBILE_DEVELOPMENT_PHASES.md`
 * §8 documents Phase 2 hitting the identical constraint for `env.ts` and deliberately
 * validating it in an isolated plain-Node process outside Jest/Metro's Babel pipeline
 * instead. This suite follows the same reasoning: it exercises the one path that's both
 * deterministic AND meaningful to assert on within Jest — the "not configured" state,
 * which also happens to be this repo's actual current state (no mobile Firebase app has
 * been registered yet) — plus `getFirebaseConfig()`'s throw behavior and message safety.
 */
describe('firebaseConfig — fail-fast Firebase config resolution', () => {
  it('reports not configured when EXPO_PUBLIC_FIREBASE_* is unset (this repo\'s real, current state)', () => {
    expect(isFirebaseConfigured()).toBe(false);
  });

  it('lists every required variable as missing when none are set', () => {
    expect(missingFirebaseConfigKeys()).toEqual([
      'EXPO_PUBLIC_FIREBASE_API_KEY',
      'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
      'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
      'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
      'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
      'EXPO_PUBLIC_FIREBASE_APP_ID',
    ]);
  });

  it('getFirebaseConfig() throws a clear, actionable error rather than initializing Firebase with blanks', () => {
    expect(() => getFirebaseConfig()).toThrow(/Missing Firebase config/);
  });

  it('getFirebaseConfig()\'s error message names the missing keys but never a value (there are none to leak here, but the message shape itself must stay key-names-only)', () => {
    try {
      getFirebaseConfig();
      throw new Error('expected getFirebaseConfig to throw');
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain('EXPO_PUBLIC_FIREBASE_API_KEY');
      expect(message).not.toMatch(/[:=]\s*\S+@\S+/); // no leaked "key: value"-shaped content
    }
  });
});
