// Extends jest-expo's preset with two fixes needed specifically because this app's auth
// module depends on `firebase`/`@firebase/*`, which jest-expo's default config doesn't
// anticipate (it's not a React Native-ecosystem package the preset special-cases):
//
// 1. `transformIgnorePatterns` — by default, jest-expo only transforms a known allow-list
//    of RN-ecosystem packages under node_modules (everything else is assumed to already
//    be plain CommonJS). `firebase`/`@firebase/*` ship raw ES modules, so they need to be
//    added to that allow-list or Jest fails to parse their `export`/`import` syntax.
// 2. `transform` — jest-expo's JS/TS transform key (`\.[jt]sx?$`) does not match `.mjs`
//    files. `@firebase/util` ships one (`dist/postinstall.mjs`, reached transitively via
//    `@firebase/app`) that also needs Babel to run over it for the same reason.
//
// See `src/services/firebase/client.ts` and `src/config/firebaseConfig.test.ts` for the
// related, separate TypeScript-only Firebase/RN resolution note — this file addresses the
// runtime Jest transform gap, a different problem from that one.
const jestExpoPreset = require('jest-expo/jest-preset');

module.exports = {
  ...jestExpoPreset,
  setupFiles: [...(jestExpoPreset.setupFiles ?? []), '<rootDir>/jest.setup.js'],
  transform: {
    ...jestExpoPreset.transform,
    '\\.mjs$': jestExpoPreset.transform['\\.[jt]sx?$'],
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|firebase|@firebase))',
    '/node_modules/react-native-reanimated/plugin/',
    '/node_modules/@react-native/babel-preset/',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/.expo/'],
};
