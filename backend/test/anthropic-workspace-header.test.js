const test = require('node:test');
const assert = require('node:assert/strict');

// A key not scoped to a workspace needs anthropic-workspace-id on every request;
// the shared client sends it only when ANTHROPIC_WORKSPACE_ID is configured.
const fresh = (env) => {
  Object.assign(process.env, env);
  delete require.cache[require.resolve('../config/anthropic')];
  return require('../config/anthropic');
};
const fakeKey = () => ['sk', 'ant', 'test', 'Z'.repeat(24)].join('-');

async function capturedHeaders(client) {
  let seen;
  const fetchStub = async (url, init) => { seen = new Headers(init.headers); return new Response('{"input_tokens":1}', { status: 200, headers: { 'content-type': 'application/json' } }); };
  await client.withOptions({ fetch: fetchStub, maxRetries: 0 }).messages.countTokens({ model: 'claude-opus-4-8', messages: [{ role: 'user', content: 'x' }] });
  return seen;
}

test('sends anthropic-workspace-id when ANTHROPIC_WORKSPACE_ID is set', async () => {
  const { getClient } = fresh({ ANTHROPIC_API_KEY: fakeKey(), ANTHROPIC_WORKSPACE_ID: ' wrkspc_test123 ' });
  assert.equal((await capturedHeaders(getClient())).get('anthropic-workspace-id'), 'wrkspc_test123');
});

test('omits the header for workspace-scoped keys (no ANTHROPIC_WORKSPACE_ID)', async () => {
  delete process.env.ANTHROPIC_WORKSPACE_ID;
  const { getClient } = fresh({ ANTHROPIC_API_KEY: fakeKey() });
  assert.equal((await capturedHeaders(getClient())).get('anthropic-workspace-id'), null);
});
