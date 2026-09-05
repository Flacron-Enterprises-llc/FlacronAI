import type { ExpoConfig } from 'expo/config';

// FlacronAI mobile app configuration.
//
// All identifiers below are client-confirmed (see mobile/MOBILE_DEVELOPMENT_PHASES.md §2)
// and must not change without client sign-off. This file intentionally configures
// identity/build metadata only — no authentication, API base URL usage, or feature
// wiring belongs here (see Phase boundaries in the phase tracker).

const config: ExpoConfig = {
  name: 'FlacronAI',
  slug: 'flacronai',
  owner: 'flacron-enterprises-llc',
  version: '1.0.0',
  scheme: 'flacronai',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/images/icon.png',

  ios: {
    bundleIdentifier: 'com.flacronenterprises.flacronai',
    supportsTablet: true,
    // The default Expo template's newer "Icon Composer" (.icon bundle) format was
    // deliberately not used here — there is no real multi-layer icon source asset for
    // it yet. The classic universal `icon` field above is used for iOS as well as
    // Android/web. Revisit as an optional visual-polish item in the Store Preparation
    // phase, not before.
  },

  android: {
    package: 'com.flacronenterprises.flacronai',
    adaptiveIcon: {
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundColor: '#FFFFFF',
    },
    // Tablet support on Android is a responsive-layout and testing concern, not a
    // config flag — no restrictive screen-size or orientation lock is applied here.
  },

  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },

  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        imageWidth: 220,
        backgroundColor: '#FFFFFF',
      },
    ],
  ],

  experiments: {
    typedRoutes: true,
  },

  // Ties runtime compatibility for EAS Update to the actual native fingerprint of this
  // config + the installed dependencies, instead of a manually-bumped version number.
  // This is Expo's current recommended default — unvalidated against a real EAS Update
  // or native build in this foundation phase (see decisions log).
  runtimeVersion: {
    policy: 'fingerprint',
  },

  extra: {
    eas: {
      projectId: 'c8227fa0-8a62-4e51-8ccc-c8feb58d0466',
    },
  },
};

export default config;
