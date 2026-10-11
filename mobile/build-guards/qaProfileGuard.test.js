const crypto = require('crypto');
const { STAGING, STAGING_API_KEY_SHA256, qaBuildProblems, assertQaBuildEnv } = require('./qaProfileGuard');
const eas = require('../eas.json');

const KEY = 'test-staging-key';
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');

// The guard compares the key by hash; unit tests pass the hash of a known test key.
function envWith(overrides = {}) {
  return { ...STAGING, EXPO_PUBLIC_FIREBASE_API_KEY: KEY, ...overrides };
}
describe('qaProfileGuard', () => {
  const realHash = STAGING_API_KEY_SHA256;
  const problemsFor = (env) => qaBuildProblems(env, hash(KEY));

  it('rejects the shared preview (production) Firebase values', () => {
    const problems = problemsFor(
      envWith({
        EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'flacronai-c8dab',
        EXPO_PUBLIC_FIREBASE_APP_ID: '1:773892679617:android:x',
      })
    );
    expect(problems.join('\n')).toMatch(/EXPO_PUBLIC_FIREBASE_PROJECT_ID/);
    expect(problems.join('\n')).toMatch(/references production/);
  });

  it('rejects a wrong API key, E2E hooks, emulator and Google client IDs', () => {
    const problems = problemsFor(
      envWith({
        EXPO_PUBLIC_FIREBASE_API_KEY: 'production-key',
        EXPO_PUBLIC_E2E_RUNTIME_CONFIG: '1',
        EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_URL: 'http://10.0.2.2:9099',
        EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'x.apps.googleusercontent.com',
      })
    ).join('\n');
    expect(problems).toMatch(/FIREBASE_API_KEY is not the flacronai-staging-qa/);
    expect(problems).toMatch(/E2E_RUNTIME_CONFIG must be empty/);
    expect(problems).toMatch(/AUTH_EMULATOR_URL must be empty/);
    expect(problems).toMatch(/GOOGLE_WEB_CLIENT_ID must be empty/);
  });

  it('rejects a non-staging API base URL', () => {
    expect(problemsFor(envWith({ EXPO_PUBLIC_API_BASE_URL: 'https://api.flacronai.com/api/v1' })).join()).toMatch(
      /EXPO_PUBLIC_API_BASE_URL/
    );
  });

  it('throws with every problem listed', () => {
    expect(() => assertQaBuildEnv({})).toThrow(/QA build guard failed/);
  });

  it('eas.json qa profile carries exactly the staging values and enables the guard', () => {
    const qa = eas.build.qa;
    expect(qa.env.FLACRON_BUILD_PROFILE).toBe('qa');
    for (const [name, value] of Object.entries(STAGING)) expect(qa.env[name]).toBe(value);
    expect(hash(qa.env.EXPO_PUBLIC_FIREBASE_API_KEY)).toBe(realHash);
    expect(qa.env.EXPO_PUBLIC_E2E_RUNTIME_CONFIG).toBeUndefined();
    expect(qa.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID).toBe('');
    expect(qa.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID).toBe('');
  });

  it('accepts the eas.json qa profile env as-is', () => {
    expect(() => assertQaBuildEnv(eas.build.qa.env)).not.toThrow();
  });
});
