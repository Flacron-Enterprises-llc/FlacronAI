/**
 * Ambient augmentation for `@firebase/auth`'s React Native persistence helper.
 *
 * `getReactNativePersistence` genuinely exists and works at RUNTIME when imported from
 * `@firebase/auth` (Metro's package-exports resolution correctly follows that package's
 * own `"react-native"` export condition to `dist/rn/index.js`, which does export it —
 * verified directly by reading that file's contents and its own `.d.ts`). The gap is
 * TypeScript-only: `@firebase/auth`'s exports map lists a bare, unconditional `"types"`
 * key (`./dist/auth-public.d.ts`, the generic/browser declarations) ahead of its
 * `"react-native"` condition's own nested `"types"` entry in the same conditions object —
 * `tsc` (moduleResolution "bundler", even with `customConditions: ["react-native"]` set by
 * `expo/tsconfig.base`) resolves to that generic file regardless, which doesn't declare
 * this RN-only export. See `src/services/firebase/client.ts`'s header comment for the
 * full investigation. This declaration is the minimal, narrowly-scoped fix: it adds
 * exactly the one missing symbol, with the exact signature copied from
 * `@firebase/auth`'s own `dist/rn/src/platform_react_native/persistence/react_native.d.ts`
 * — nothing invented. Remove this file if a future `@firebase/auth` release fixes the
 * exports-map ordering (re-check by running `tsc --noEmit` after any `firebase`/
 * `@firebase/auth` version bump; the error will resurface here first if still needed).
 */
import type { Persistence } from 'firebase/auth';

declare module '@firebase/auth' {
  /** Minimal `AsyncStorage`-shaped interface — matches
   * `@react-native-async-storage/async-storage`'s public API exactly. */
  interface ReactNativeAsyncStorage {
    setItem(key: string, value: string): Promise<void>;
    getItem(key: string): Promise<string | null>;
    removeItem(key: string): Promise<void>;
  }

  export function getReactNativePersistence(storage: ReactNativeAsyncStorage): Persistence;
}
