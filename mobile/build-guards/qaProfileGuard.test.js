const crypto = require('crypto');
const {
  STAGING,
  STAGING_API_KEY_SHA256,
  IDENTITY,
  IDENTITY_API_KEY_SHA256,
  IDENTITY_GOOGLE_WEB_CLIENT,
  qaBuildProblems,
  assertQaBuildEnv,
} = require('./qaProfileGuard');
const eas = require('../eas.json');

const KEY = 'test-staging-key';
const IDENTITY_KEY = 'test-identity-key';
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');

// The guard compares the keys by hash; unit tests pass the hashes of known test keys.
function envWith(overrides = {}) {
  return { ...STAGING, EXPO_PUBLIC_FIREBASE_API_KEY: KEY, ...IDENTITY, EXPO_PUBLIC_IDENTITY_FIREBASE_API_KEY: IDENTITY_KEY, ...overrides };
}
describe('qaProfileGuard', () => {
  const realHash = STAGING_API_KEY_SHA256;
  const problemsFor = (env) => qaBuildProblems(env, hash(KEY), hash(IDENTITY_KEY));

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
    expect(problems).toMatch(/GOOGLE_WEB_CLIENT_ID is not the identity project's Google web client/);
  });

  it('QA federation: accepts only the pinned identity Google web client', () => {
    expect(problemsFor(envWith({ EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: IDENTITY_GOOGLE_WEB_CLIENT }))).toEqual([]);
    for (const other of ['93799061110-abc123.apps.googleusercontent.com', '773892679617-abc123.apps.googleusercontent.com']) {
      expect(problemsFor(envWith({ EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: other })).join()).toMatch(/identity project's Google web client/);
    }
  });

  it('QA federation: identity settings must be the pinned production identity values', () => {
    const problems = problemsFor(
      envWith({
        EXPO_PUBLIC_IDENTITY_FIREBASE_PROJECT_ID: 'flacronai-staging-qa',
        EXPO_PUBLIC_IDENTITY_FIREBASE_API_KEY: 'other-key',
      })
    ).join(' | ');
    expect(problems).toMatch(/IDENTITY_FIREBASE_PROJECT_ID/);
    expect(problems).toMatch(/IDENTITY_FIREBASE_API_KEY is not the flacronai-c8dab web API key/);
    expect(problemsFor(envWith({ EXPO_PUBLIC_IDENTITY_FIREBASE_APP_ID: undefined })).join()).toMatch(/IDENTITY_FIREBASE_APP_ID/);
  });

  it('QA federation: production identifiers are allowed ONLY in identity settings', () => {
    expect(problemsFor(envWith({ EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: 'flacronai-c8dab.firebasestorage.app' })).join()).toMatch(
      /references production/
    );
    expect(problemsFor(envWith({ EXPO_PUBLIC_SOMETHING_ELSE: 'flacronai-c8dab' })).join()).toMatch(/SOMETHING_ELSE references production/);
  });

  describe('google-services.json', () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const write = (json) => {
      const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gs-')), 'google-services.json');
      fs.writeFileSync(f, JSON.stringify(json));
      return f;
    };
    const file = (projectId, number, pkg = 'com.flacronenterprises.flacronai') => ({
      project_info: { project_id: projectId, project_number: number },
      client: [{ client_info: { android_client_info: { package_name: pkg } } }],
    });

    it('accepts the staging file for this package', () => {
      expect(problemsFor(envWith({ GOOGLE_SERVICES_JSON: write(file('flacronai-staging-qa', '93799061110')) }))).toEqual([]);
    });

    it('rejects the production file, a wrong package and unreadable files', () => {
      const prod = problemsFor(envWith({ GOOGLE_SERVICES_JSON: write(file('flacronai-c8dab', '773892679617')) })).join('\n');
      expect(prod).toMatch(/not the flacronai-staging-qa file/);
      expect(prod).toMatch(/references production/);
      expect(
        problemsFor(envWith({ GOOGLE_SERVICES_JSON: write(file('flacronai-staging-qa', '93799061110', 'com.other')) })).join()
      ).toMatch(/no client for com.flacronenterprises.flacronai/);
      expect(problemsFor(envWith({ GOOGLE_SERVICES_JSON: '/nonexistent/google-services.json' })).join()).toMatch(/not a readable JSON/);
    });
  });

  it('rejects a non-staging API base URL', () => {
    expect(problemsFor(envWith({ EXPO_PUBLIC_API_BASE_URL: 'https://api.flacronai.com/api/v1' })).join()).toMatch(
      /EXPO_PUBLIC_API_BASE_URL/
    );
  });

  it('throws with every problem listed', () => {
    expect(() => assertQaBuildEnv({})).toThrow(/QA build guard failed/);
  });

  it('eas.json qa profile: staging data values + pinned identity values, guard enabled', () => {
    const qa = eas.build.qa;
    expect(qa.env.FLACRON_BUILD_PROFILE).toBe('qa');
    for (const [name, value] of Object.entries(STAGING)) expect(qa.env[name]).toBe(value);
    expect(hash(qa.env.EXPO_PUBLIC_FIREBASE_API_KEY)).toBe(realHash);
    expect(qa.env.EXPO_PUBLIC_E2E_RUNTIME_CONFIG).toBeUndefined();
    for (const [name, value] of Object.entries(IDENTITY)) expect(qa.env[name]).toBe(value);
    expect(hash(qa.env.EXPO_PUBLIC_IDENTITY_FIREBASE_API_KEY)).toBe(IDENTITY_API_KEY_SHA256);
    expect(qa.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID).toBe(IDENTITY_GOOGLE_WEB_CLIENT);
    expect(qa.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID).toBe('');
  });

  it('accepts the eas.json qa profile env as-is', () => {
    expect(() => assertQaBuildEnv(eas.build.qa.env)).not.toThrow();
  });
});
