// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");
const globals = require("globals");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  // Plain-Node build tooling (run by app.config.ts / CI, never bundled into the app).
  {
    files: ["build-guards/**/*.js"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["jest.setup.js", "**/*.test.js"],
    languageOptions: { globals: globals.jest },
  },
]);
