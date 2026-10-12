const test = require('node:test');
const assert = require('node:assert/strict');
const { applyKeystrokes, parseArgs, buildNext, UsageError } = require('../deploy/staging/set-staging-secret');

// Fake values assembled at runtime so no key-shaped literal lives in the repo.
const fakeStripe = () => ['sk', 'test', 'Z'.repeat(30)].join('_');
const fakeAnthropic = () => ['sk', 'ant', 'api03', 'Z'.repeat(30)].join('-');

test('Ctrl+V (0x16) and other control characters are never captured as a value', () => {
  assert.deepEqual(applyKeystrokes('', '\u0016\r'), { value: '', done: true });
  assert.equal(applyKeystrokes('', 'ab\u0016c\u001b\n').value, 'abc');
});

test('a paste arriving as one chunk ending in Enter completes the value', () => {
  const r = applyKeystrokes('', `${fakeStripe()}\r`);
  assert.equal(r.done, true);
  assert.equal(r.value, fakeStripe());
});

test('backspace and Ctrl+C are handled', () => {
  assert.equal(applyKeystrokes('abc', '\u007f').value, 'ab');
  assert.equal(applyKeystrokes('abc', '\u0003').cancelled, true);
});

test('a secret passed where a field name belongs is refused without being echoed', () => {
  for (const argv of [['--set', fakeStripe()], ['--stdin-key', fakeStripe()], ['--key', fakeStripe()], [fakeStripe()]]) {
    assert.throws(() => parseArgs(argv), (e) => e instanceof UsageError && !e.message.includes(fakeStripe()));
  }
});

test('secret fields cannot be set as command-line arguments', () => {
  assert.throws(() => parseArgs(['--set', `STRIPE_SECRET_KEY=${fakeStripe()}`]),
    (e) => e instanceof UsageError && !e.message.includes(fakeStripe()));
});

test('supported options parse', () => {
  assert.deepEqual(parseArgs(['--stdin-key', 'ANTHROPIC_API_KEY']), [{ type: 'stdin', key: 'ANTHROPIC_API_KEY' }]);
  assert.deepEqual(parseArgs(['--set', 'ADMIN_EMAIL=qa@example.test']), [{ type: 'set', key: 'ADMIN_EMAIL', value: 'qa@example.test' }]);
});

test('unknown stored fields (e.g. a mistyped secret name) are removed; legitimate ones kept', () => {
  const current = { ADMIN_EMAIL: 'qa@example.test', [`${fakeStripe()}`]: 'x', JWT_SECRET: 'j'.repeat(40) };
  const r = buildNext(current, {});
  assert.equal(r.removedUnknown, 1);
  assert.deepEqual(Object.keys(r.next).sort(), ['ADMIN_EMAIL', 'JWT_SECRET']);
});

test('malformed supplied values are refused; stored placeholders are dropped', () => {
  assert.deepEqual(buildNext({}, { ANTHROPIC_API_KEY: '\u0016' }).problems, ['ANTHROPIC_API_KEY malformed']);
  const r = buildNext({ STRIPE_SECRET_KEY: '\u0016' }, { ANTHROPIC_API_KEY: fakeAnthropic() });
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.droppedMalformed, ['STRIPE_SECRET_KEY']);
  assert.ok(r.missing.includes('STRIPE_SECRET_KEY'));
});

test('a live Stripe key is refused', () => {
  const live = ['sk', 'live', 'Z'.repeat(30)].join('_');
  assert.ok(buildNext({}, { STRIPE_SECRET_KEY: live }).problems.length > 0);
});
