const { test } = require('node:test');
const assert = require('node:assert');
const {
  NOTIFICATION_KEYS,
  DEFAULT_NOTIFICATIONS,
  sanitizeNotifications,
  isNotificationEnabled,
} = require('../utils/notificationPrefs');

test('DEFAULT_NOTIFICATIONS enables every known key', () => {
  for (const key of NOTIFICATION_KEYS) assert.strictEqual(DEFAULT_NOTIFICATIONS[key], true);
});

test('sanitizeNotifications drops unknown keys', () => {
  const out = sanitizeNotifications({ reportCompleted: false, totallyMadeUp: true });
  assert.strictEqual(out.totallyMadeUp, undefined);
  assert.strictEqual(out.reportCompleted, false);
  assert.strictEqual(Object.keys(out).length, NOTIFICATION_KEYS.length);
});

test('sanitizeNotifications coerces non-boolean values to a real boolean', () => {
  const out = sanitizeNotifications({ billing: 'yes', reportShared: 0, reviewRequested: undefined });
  assert.strictEqual(out.billing, true); // truthy non-false survives as true
  assert.strictEqual(out.reportShared, true); // only === false is treated as off
  assert.strictEqual(out.reviewRequested, true); // undefined -> default enabled
});

test('sanitizeNotifications merges over existing preferences rather than resetting them', () => {
  const existing = { reportCompleted: false, analysisCompleted: false };
  const out = sanitizeNotifications({ billing: false }, existing);
  assert.strictEqual(out.reportCompleted, false);
  assert.strictEqual(out.analysisCompleted, false);
  assert.strictEqual(out.billing, false);
  assert.strictEqual(out.reportApproved, true); // untouched, defaults on
});

test('sanitizeNotifications never throws on malformed input', () => {
  assert.doesNotThrow(() => sanitizeNotifications(null));
  assert.doesNotThrow(() => sanitizeNotifications('not an object'));
  assert.doesNotThrow(() => sanitizeNotifications(42));
});

test('isNotificationEnabled defaults to true when never explicitly set', () => {
  assert.strictEqual(isNotificationEnabled({}, 'billing'), true);
  assert.strictEqual(isNotificationEnabled(undefined, 'billing'), true);
  assert.strictEqual(isNotificationEnabled(null, 'billing'), true);
});

test('isNotificationEnabled respects an explicit false, and anything else counts as on', () => {
  assert.strictEqual(isNotificationEnabled({ billing: false }, 'billing'), false);
  assert.strictEqual(isNotificationEnabled({ billing: true }, 'billing'), true);
  assert.strictEqual(isNotificationEnabled({ billing: 0 }, 'billing'), true);
});
