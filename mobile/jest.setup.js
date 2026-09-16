// Mocks native modules that have no implementation available under Jest's Node test
// environment (there is no real device/simulator running). AsyncStorage backs Firebase's
// RN session persistence (src/services/firebase/client.ts) — without this mock, merely
// importing that chain throws "[@RNC/AsyncStorage]: NativeModule: AsyncStorage is null."
// even in tests that never touch storage directly, per the package's own documented Jest
// integration: https://react-native-async-storage.github.io/async-storage/docs/advanced/jest
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Same problem, same fix, for @react-native-community/netinfo (Phase 4 — services/api/
// offline.ts): its native event-emitter setup throws under Jest's Node environment without
// this official mock, even for a test that only imports the module transitively.
jest.mock('@react-native-community/netinfo', () => require('@react-native-community/netinfo/jest/netinfo-mock'));
