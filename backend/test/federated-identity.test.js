const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { FakeFirestore } = require('./helpers/fakeFirestore');

// QA federation (services/federatedIdentity.js): production identity -> isolated
// staging session. Production verification and the production API are faked; no
// real Firebase project, account or network is touched.
const PROD = 'flacronai-c8dab';
const STAGING = 'flacronai-staging-qa';
const now = () => Math.floor(Date.now() / 1000);

const setEnv = (overrides = {}) => {
  Object.assign(process.env, {
    FEDERATED_PROD_LOGIN_ENABLED: 'true',
    PROD_IDENTITY_PROJECT_ID: PROD,
    PROD_IDENTITY_API_BASE_URL: 'https://api.example.test/api/v1',
    FIREBASE_PROJECT_ID: STAGING,
  });
  delete process.env.FEDERATED_SESSION_MAX_AGE_SECONDS;
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
};

const fed = () => {
  delete require.cache[require.resolve('../services/federatedIdentity')];
  return require('../services/federatedIdentity');
};

const prodClaims = (extra = {}) => ({
  uid: 'prodUid1',
  sub: 'prodUid1',
  aud: PROD,
  iss: `https://securetoken.google.com/${PROD}`,
  email: 'user@example.com',
  email_verified: true,
  auth_time: now() - 30,
  firebase: { sign_in_provider: 'password' },
  ...extra,
});

function fakeStagingAuth(users = {}) {
  const calls = { created: [], claims: [], tokens: [], updated: [] };
  const notFound = () => Object.assign(new Error('not found'), { code: 'auth/user-not-found' });
  return {
    calls,
    users,
    getUser: async (uid) => {
      if (!users[uid]) throw notFound();
      return users[uid];
    },
    getUserByEmail: async (email) => {
      const u = Object.values(users).find((x) => x.email === email);
      if (!u) throw notFound();
      return u;
    },
    createUser: async (props) => {
      calls.created.push(props);
      users[props.uid] = { ...props, customClaims: null };
      return users[props.uid];
    },
    setCustomUserClaims: async (uid, claims) => {
      calls.claims.push({ uid, claims });
      users[uid].customClaims = claims;
    },
    updateUser: async (uid, patch) => {
      calls.updated.push({ uid, patch });
      Object.assign(users[uid], patch);
    },
    createCustomToken: async (uid, claims) => {
      calls.tokens.push({ uid, claims });
      return `custom:${uid}`;
    },
  };
}

// prodApi fake: mfaEnabled flag, valid code, optional status override.
function fakeProdApi({ mfaEnabled = false, validCode = '123456', statusCode = 200, throws = false } = {}) {
  const calls = [];
  const fn = async (base, path, idToken, opts = {}) => {
    calls.push({ base, path, method: opts.method || 'GET', body: opts.body });
    if (throws) throw new Error('ECONNREFUSED');
    if (path === '/auth/mfa/status') {
      return statusCode === 200 ? { status: 200, data: { success: true, mfaEnabled } } : { status: statusCode, data: { code: 'TOKEN_REVOKED' } };
    }
    if (path === '/auth/mfa/verify') {
      if (opts.body.code === validCode) return { status: 200, data: { success: true, method: 'totp' } };
      return { status: 401, data: { success: false, code: 'INVALID_MFA_CODE' } };
    }
    return { status: 404, data: {} };
  };
  fn.calls = calls;
  return fn;
}

const run = (input, { claims = prodClaims(), verifyThrows = false, db = new FakeFirestore(), stagingAuth = fakeStagingAuth(), prodApi = fakeProdApi() } = {}) =>
  fed().exchangeForStagingSession(input, {
    db,
    stagingAuth,
    callProductionApi: prodApi,
    verifyIdentityToken: async (token, projectId) => {
      assert.equal(projectId, PROD, 'verifies against the identity project');
      if (verifyThrows) throw new Error('bad signature');
      return claims;
    },
  });

test('disabled unless explicitly enabled, and never on the identity project itself', async () => {
  setEnv({ FEDERATED_PROD_LOGIN_ENABLED: undefined });
  assert.equal((await run({ idToken: 't' })).body.code, 'FEDERATED_LOGIN_DISABLED');
  setEnv({ FIREBASE_PROJECT_ID: PROD });
  assert.equal(fed().getFederationConfig().enabled, false, 'the production backend can never federate');
  assert.equal((await run({ idToken: 't' })).status, 404);
  setEnv({ PROD_IDENTITY_API_BASE_URL: 'http://insecure.example' });
  assert.equal(fed().getFederationConfig().enabled, false);
});

test('rejects unverifiable, wrong-audience/issuer, unverified-email and other-provider tokens', async () => {
  setEnv();
  assert.equal((await run({ idToken: 't' }, { verifyThrows: true })).body.code, 'INVALID_IDENTITY_TOKEN');
  assert.equal((await run({ idToken: 't' }, { claims: prodClaims({ aud: STAGING }) })).body.code, 'INVALID_IDENTITY_TOKEN');
  assert.equal((await run({ idToken: 't' }, { claims: prodClaims({ iss: 'https://evil' }) })).body.code, 'INVALID_IDENTITY_TOKEN');
  assert.equal((await run({ idToken: 't' }, { claims: prodClaims({ email_verified: false }) })).body.code, 'IDENTITY_EMAIL_NOT_VERIFIED');
  assert.equal(
    (await run({ idToken: 't' }, { claims: prodClaims({ firebase: { sign_in_provider: 'anonymous' } }) })).body.code,
    'IDENTITY_PROVIDER_NOT_ALLOWED'
  );
});

test('production revocation / outage fails closed', async () => {
  setEnv();
  const revoked = await run({ idToken: 't' }, { prodApi: fakeProdApi({ statusCode: 401 }) });
  assert.equal(revoked.status, 401);
  assert.equal(revoked.body.code, 'IDENTITY_SESSION_REJECTED');
  const down = await run({ idToken: 't' }, { prodApi: fakeProdApi({ throws: true }) });
  assert.equal(down.status, 503);
  assert.equal(down.body.code, 'IDENTITY_UNAVAILABLE');
});

test('no MFA: creates a passwordless staging shadow and a short-lived custom token; copies no profile/roles', async () => {
  setEnv();
  const db = new FakeFirestore();
  const stagingAuth = fakeStagingAuth();
  const prodApi = fakeProdApi();
  const claims = prodClaims({ name: 'Real User' });
  const r = await run({ idToken: 'prodtoken' }, { db, stagingAuth, prodApi, claims });
  assert.equal(r.status, 200);
  assert.equal(r.body.customToken, 'custom:prodUid1');
  assert.equal(r.body.expiresIn, 3600);
  assert.deepEqual(stagingAuth.calls.created, [{ uid: 'prodUid1', email: 'user@example.com', emailVerified: true, displayName: 'Real User' }]);
  assert.equal(stagingAuth.calls.created[0].password, undefined, 'no staging password');
  assert.deepEqual(stagingAuth.calls.claims, [{ uid: 'prodUid1', claims: { federated: true } }]);
  const { claims: tokenClaims } = stagingAuth.calls.tokens[0];
  assert.equal(tokenClaims.federated, true);
  assert.equal(tokenClaims.prodAuthTime, claims.auth_time);
  assert.equal(tokenClaims.fedProvider, 'password');
  assert.ok(Math.abs(tokenClaims.fedAt - now()) <= 2);
  assert.equal(db.store.has('users/prodUid1'), false, 'profile is created later with staging defaults');
  assert.deepEqual(prodApi.calls.map((c) => c.path), ['/auth/mfa/status'], 'production is only read');
});

test('MFA: required, verified by production, bound to that production sign-in for re-exchange', async () => {
  setEnv();
  const db = new FakeFirestore();
  const stagingAuth = fakeStagingAuth();
  const prodApi = fakeProdApi({ mfaEnabled: true });
  const claims = prodClaims();
  const ctx = { db, stagingAuth, prodApi, claims };

  const missing = await run({ idToken: 't' }, ctx);
  assert.equal(missing.status, 401);
  assert.equal(missing.body.code, 'FEDERATED_MFA_REQUIRED');
  assert.equal(stagingAuth.calls.tokens.length, 0, 'no session before MFA');

  const wrong = await run({ idToken: 't', mfaCode: '000000' }, ctx);
  assert.equal(wrong.body.code, 'INVALID_MFA_CODE');
  assert.equal(stagingAuth.calls.tokens.length, 0);

  const ok = await run({ idToken: 't', mfaCode: '123456' }, ctx);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.mfaVerified, true);
  assert.ok(prodApi.calls.some((c) => c.path === '/auth/mfa/verify' && c.method === 'POST'));

  // Same production sign-in (refreshed token, same auth_time): no new prompt.
  const again = await run({ idToken: 't2' }, ctx);
  assert.equal(again.status, 200);

  // A NEW production sign-in needs the code again.
  const fresh = await run({ idToken: 't3' }, { ...ctx, claims: prodClaims({ auth_time: claims.auth_time + 100 }) });
  assert.equal(fresh.body.code, 'FEDERATED_MFA_REQUIRED');

  // Binding expires after 12h.
  const { MFA_BINDING_TTL_SECONDS } = fed();
  db.store.get('federatedSessions/prodUid1').data.mfa[String(claims.auth_time)] = now() - MFA_BINDING_TTL_SECONDS - 5;
  assert.equal((await run({ idToken: 't4' }, ctx)).body.code, 'FEDERATED_MFA_REQUIRED');
});

test('deleted QA account, conflicting staging account and disabled shadow are refused', async () => {
  setEnv();
  const db = new FakeFirestore();
  db.store.set('deletedAccounts/prodUid1', { version: 1, data: { completed: true } });
  assert.equal((await run({ idToken: 't' }, { db })).body.code, 'ACCOUNT_DELETED');

  const nativeSameEmail = fakeStagingAuth({ other: { uid: 'other', email: 'user@example.com', customClaims: null } });
  const r = await run({ idToken: 't' }, { stagingAuth: nativeSameEmail });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'STAGING_EMAIL_IN_USE');
  assert.equal(nativeSameEmail.calls.created.length, 0);

  const nativeSameUid = fakeStagingAuth({ prodUid1: { uid: 'prodUid1', email: 'user@example.com', customClaims: null } });
  assert.equal((await run({ idToken: 't' }, { stagingAuth: nativeSameUid })).body.code, 'STAGING_UID_CONFLICT');

  const disabled = fakeStagingAuth({ prodUid1: { uid: 'prodUid1', email: 'user@example.com', customClaims: { federated: true }, disabled: true } });
  assert.equal((await run({ idToken: 't' }, { stagingAuth: disabled })).body.code, 'ACCOUNT_DISABLED');
});

test('existing shadow is reused; a changed production email is synced', async () => {
  setEnv();
  const stagingAuth = fakeStagingAuth({ prodUid1: { uid: 'prodUid1', email: 'old@example.com', customClaims: { federated: true } } });
  const r = await run({ idToken: 't' }, { stagingAuth });
  assert.equal(r.status, 200);
  assert.equal(stagingAuth.calls.created.length, 0);
  assert.deepEqual(stagingAuth.calls.updated, [{ uid: 'prodUid1', patch: { email: 'user@example.com', emailVerified: true } }]);
});

test('federatedSessionProblem: custom-token sessions only, expiring after the max age', () => {
  setEnv();
  const { federatedSessionProblem } = fed();
  const base = { federated: true, firebase: { sign_in_provider: 'custom' }, fedAt: now() - 10, prodAuthTime: now() - 20 };
  assert.equal(federatedSessionProblem(base), null);
  assert.equal(federatedSessionProblem({ ...base, fedAt: now() - 3601 }), 'FEDERATED_SESSION_EXPIRED');
  assert.equal(federatedSessionProblem({ ...base, fedAt: now() + 600 }), 'FEDERATED_SESSION_EXPIRED');
  assert.equal(federatedSessionProblem({ ...base, firebase: { sign_in_provider: 'password' } }), 'FEDERATED_SESSION_INVALID');
  assert.equal(federatedSessionProblem({ ...base, fedAt: undefined }), 'FEDERATED_SESSION_INVALID');
  setEnv({ FEDERATED_SESSION_MAX_AGE_SECONDS: '999999' });
  assert.equal(fed().federatedSessionProblem({ ...base, fedAt: now() - 3601 }), 'FEDERATED_SESSION_EXPIRED', 'max age is capped at 1h');
  setEnv({ FEDERATED_PROD_LOGIN_ENABLED: 'false' });
  assert.equal(fed().federatedSessionProblem(base), 'FEDERATED_LOGIN_DISABLED');
});

// ── Middleware + route guards with the real authenticateToken ──────────────────
const firebaseConfigPath = require.resolve('../config/firebase');
const resetPaths = [
  firebaseConfigPath,
  require.resolve('../middleware/auth'),
  require.resolve('../routes/auth'),
  require.resolve('../routes/users'),
  require.resolve('../services/federatedIdentity'),
];

function installRoutes({ decoded, users = {} }) {
  resetPaths.forEach((p) => delete require.cache[p]);
  const db = new FakeFirestore();
  db.store.set('users/prodUid1', { version: 1, data: { email: 'user@example.com', tier: 'starter', tokenVersion: 0 } });
  const stagingAuth = fakeStagingAuth(users);
  const resetLinks = [];
  require.cache[firebaseConfigPath] = {
    id: firebaseConfigPath,
    filename: firebaseConfigPath,
    loaded: true,
    exports: {
      getAuth: () => ({
        ...stagingAuth,
        verifyIdToken: async () => decoded,
        revokeRefreshTokens: async () => {},
        generatePasswordResetLink: async (email) => {
          resetLinks.push(email);
          return 'https://reset.example';
        },
      }),
      getFirestore: () => db,
      FieldValue: { serverTimestamp: () => new Date().toISOString(), increment: (n) => n },
      Timestamp: {},
      admin: {},
      initFirebase: () => {},
      getBucket: () => {},
    },
  };
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', require('../routes/auth'));
  app.use('/api/v1/users', require('../routes/users'));
  return { app, resetLinks };
}

async function withServer(app, fn) {
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  try {
    await fn(`http://127.0.0.1:${server.address().port}/api/v1`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

const call = async (base, method, path, body) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer staging-token' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

const federatedDecoded = (extra = {}) => ({
  uid: 'prodUid1',
  email: 'user@example.com',
  auth_time: now() - 5,
  iat: now() - 5,
  federated: true,
  fedAt: now() - 5,
  prodAuthTime: now() - 30,
  firebase: { sign_in_provider: 'custom' },
  ...extra,
});

test('middleware: expired or non-custom federated sessions are rejected; valid ones pass', async () => {
  setEnv();
  for (const [decoded, code] of [
    [federatedDecoded({ fedAt: now() - 4000 }), 'FEDERATED_SESSION_EXPIRED'],
    [federatedDecoded({ firebase: { sign_in_provider: 'password' } }), 'FEDERATED_SESSION_INVALID'],
  ]) {
    const { app } = installRoutes({ decoded });
    await withServer(app, async (base) => {
      const r = await call(base, 'GET', '/auth/mfa/status');
      assert.equal(r.status, 401);
      assert.equal(r.body.code, code);
    });
  }
  const { app } = installRoutes({ decoded: federatedDecoded() });
  await withServer(app, async (base) => {
    assert.equal((await call(base, 'GET', '/auth/mfa/status')).status, 200);
  });
});

test('password and MFA management are blocked for federated sessions; forgot-password sends nothing', async () => {
  setEnv();
  const { app, resetLinks } = installRoutes({
    decoded: federatedDecoded(),
    users: { prodUid1: { uid: 'prodUid1', email: 'user@example.com', customClaims: { federated: true } } },
  });
  await withServer(app, async (base) => {
    for (const [method, path, body] of [
      ['PUT', '/users/change-password', { newPassword: 'Str0ng!Passw0rd#2026' }],
      ['POST', '/auth/change-password', { newPassword: 'Str0ng!Passw0rd#2026' }],
      ['POST', '/auth/mfa/setup'],
      ['POST', '/auth/mfa/verify-setup', { code: '123456' }],
      ['POST', '/auth/mfa/disable', { code: '123456' }],
    ]) {
      const r = await call(base, method, path, body);
      assert.equal(r.status, 409, `${method} ${path}`);
      assert.equal(r.body.code, 'MANAGED_BY_PRODUCTION_ACCOUNT');
    }
    const fp = await fetch(`${base}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com' }),
    });
    assert.equal(fp.status, 200);
    assert.deepEqual(resetLinks, [], 'no staging reset link for a federated shadow');
  });
});

test('account deletion: federated needs a RECENT production sign-in; password path refused', async () => {
  setEnv();
  const stale = installRoutes({ decoded: federatedDecoded({ prodAuthTime: now() - 3000 }) });
  await withServer(stale.app, async (base) => {
    const r = await call(base, 'DELETE', '/users/account', { confirmation: 'DELETE' });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'RECENT_LOGIN_REQUIRED', 'a routine re-exchange is not a re-authentication');
    const p = await call(base, 'DELETE', '/users/account', { password: 'x' });
    assert.equal(p.status, 400);
    assert.equal(p.body.code, 'CONFIRMATION_REQUIRED');
  });
});

test('exchange route: validates input and returns the service result', async () => {
  setEnv({ FEDERATED_PROD_LOGIN_ENABLED: undefined });
  const { app } = installRoutes({ decoded: federatedDecoded() });
  await withServer(app, async (base) => {
    const bad = await fetch(`${base}/auth/federated/exchange`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(bad.status, 400);
    const off = await fetch(`${base}/auth/federated/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: 'x'.repeat(40) }),
    });
    assert.equal(off.status, 404);
    assert.equal((await off.json()).code, 'FEDERATED_LOGIN_DISABLED');
  });
});
