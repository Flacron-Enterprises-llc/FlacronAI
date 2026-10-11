const test = require('node:test');
const assert = require('node:assert/strict');

// Without an Anthropic key there is no vision provider. Callers mark photos
// 'analyzing' before calling analyzeImages, so it must still settle every photo
// through onBatchComplete (as a failed batch -> retryable), never leave them hanging.
delete process.env.ANTHROPIC_API_KEY;
const { analyzeImages } = require('../services/aiService');

test('analyzeImages without ANTHROPIC_API_KEY settles every photo as a failed batch', async () => {
  const calls = [];
  const result = await analyzeImages(
    [{ photoId: 'p1', buffer: Buffer.from('x'), mimetype: 'image/jpeg' }, { photoId: 'p2', buffer: Buffer.from('y'), mimetype: 'image/png' }],
    { onBatchComplete: async (ids, res) => calls.push({ ids, res }) }
  );
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].ids, ['p1', 'p2']);
  assert.equal(calls[0].res.ok, false);
  assert.match(calls[0].res.error, /unavailable/i);
  assert.match(result.summary, /unavailable/i);
});

test('analyzeImages without ANTHROPIC_API_KEY and no photos does not call the hook', async () => {
  let called = false;
  await analyzeImages([], { onBatchComplete: async () => { called = true; } });
  assert.equal(called, false);
});
