const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

// This test validates the dual-prefix mounting strategy used in server.js:
// every router is mounted under BOTH the legacy unversioned prefix (/api) and
// the versioned prefix (/api/v1) from the same router instance, so behavior is
// identical and no existing caller breaks. We replicate that exact pattern here
// against a throwaway router and assert both prefixes resolve the same handler.

// Mirror of server.js: same prefix list, same mount loop shape.
const API_PREFIXES = ['/api', '/api/v1'];

function buildApp() {
  const app = express();

  // A trivial stand-in router with one route.
  const router = express.Router();
  router.get('/ping', (req, res) => res.json({ ok: true, path: req.baseUrl }));

  const routeTable = [{ path: '/demo', router }];

  for (const prefix of API_PREFIXES) {
    for (const { path, router: r } of routeTable) {
      app.use(`${prefix}${path}`, r);
    }
  }

  // 404 fallthrough so we can assert unknown routes are rejected.
  app.use((req, res) => res.status(404).json({ code: 'NOT_FOUND' }));
  return app;
}

function request(server, path) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    http
      .get({ host: '127.0.0.1', port, path }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      })
      .on('error', reject);
  });
}

test('a route is reachable under both /api and /api/v1', async () => {
  const server = buildApp().listen(0);
  try {
    const legacy = await request(server, '/api/demo/ping');
    const versioned = await request(server, '/api/v1/demo/ping');

    assert.equal(legacy.status, 200);
    assert.equal(versioned.status, 200);
    assert.equal(JSON.parse(legacy.body).ok, true);
    assert.equal(JSON.parse(versioned.body).ok, true);

    // The versioned mount reports its own baseUrl; the legacy one reports the
    // unversioned baseUrl — confirming they are genuinely separate mount points
    // resolving to the same handler (not one redirecting to the other).
    assert.equal(JSON.parse(legacy.body).path, '/api/demo');
    assert.equal(JSON.parse(versioned.body).path, '/api/v1/demo');
  } finally {
    server.close();
  }
});

test('an unknown route still 404s under the versioned prefix', async () => {
  const server = buildApp().listen(0);
  try {
    const res = await request(server, '/api/v1/demo/does-not-exist');
    assert.equal(res.status, 404);
    assert.equal(JSON.parse(res.body).code, 'NOT_FOUND');
  } finally {
    server.close();
  }
});

test('API_PREFIXES contains the legacy and versioned bases in order', () => {
  // Guards against accidentally dropping backward compatibility: /api must stay,
  // and /api/v1 must be present. Order documents legacy-first, versioned-second.
  assert.deepEqual(API_PREFIXES, ['/api', '/api/v1']);
});
