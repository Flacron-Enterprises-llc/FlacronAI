const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isValidPermission,
  getReportAccess,
  hasReportAccess,
  computeExpiresAt,
  isShareExpired,
  slugifySectionTitle,
  sanitizeCommentBody,
  sanitizeGuestName,
  MAX_COMMENT_LENGTH,
} = require('../utils/reportAccess');

test('isValidPermission accepts only view/comment/review', () => {
  assert.equal(isValidPermission('view'), true);
  assert.equal(isValidPermission('comment'), true);
  assert.equal(isValidPermission('review'), true);
  assert.equal(isValidPermission('owner'), false);
  assert.equal(isValidPermission('admin'), false);
  assert.equal(isValidPermission(undefined), false);
});

test('getReportAccess resolves owner, a grant, or null', () => {
  const report = {
    userId: 'owner-uid',
    assignedUsers: [{ uid: 'reviewer-uid', permission: 'review' }, { uid: 'commenter-uid', permission: 'comment' }],
  };
  assert.equal(getReportAccess(report, { uid: 'owner-uid' }), 'owner');
  assert.equal(getReportAccess(report, { uid: 'reviewer-uid' }), 'review');
  assert.equal(getReportAccess(report, { uid: 'commenter-uid' }), 'comment');
  assert.equal(getReportAccess(report, { uid: 'stranger-uid' }), null);
  assert.equal(getReportAccess(report, null), null);
});

test('getReportAccess never grants access based on the grantee having no grant, regardless of any other field on user', () => {
  // A grantee's own account role/tier must never leak into this decision --
  // simulate a "user" object that looks like an org owner of THEIR OWN
  // account (teamOwnerId absent -> orgRoles.js would resolve them as
  // 'owner' of themselves) to prove that has no bearing here.
  const report = { userId: 'owner-uid', assignedUsers: [] };
  const stranger = { uid: 'stranger-uid', tier: 'enterprise', teamRole: undefined };
  assert.equal(getReportAccess(report, stranger), null);
});

test('hasReportAccess ranks view < comment < review, owner always passes', () => {
  const report = {
    userId: 'owner-uid',
    assignedUsers: [{ uid: 'viewer-uid', permission: 'view' }, { uid: 'commenter-uid', permission: 'comment' }, { uid: 'reviewer-uid', permission: 'review' }],
  };
  assert.equal(hasReportAccess(report, { uid: 'owner-uid' }, 'review'), true);
  assert.equal(hasReportAccess(report, { uid: 'viewer-uid' }, 'view'), true);
  assert.equal(hasReportAccess(report, { uid: 'viewer-uid' }, 'comment'), false);
  assert.equal(hasReportAccess(report, { uid: 'commenter-uid' }, 'comment'), true);
  assert.equal(hasReportAccess(report, { uid: 'commenter-uid' }, 'review'), false);
  assert.equal(hasReportAccess(report, { uid: 'reviewer-uid' }, 'review'), true);
  assert.equal(hasReportAccess(report, { uid: 'stranger-uid' }, 'view'), false);
});

test('computeExpiresAt returns null for no-expiry inputs and a correct future ISO string for named options', () => {
  const now = new Date('2026-08-19T00:00:00.000Z');
  assert.equal(computeExpiresAt(undefined, now), null);
  assert.equal(computeExpiresAt(null, now), null);
  assert.equal(computeExpiresAt('never', now), null);
  assert.equal(computeExpiresAt('24h', now), new Date('2026-08-20T00:00:00.000Z').toISOString());
  assert.equal(computeExpiresAt('7d', now), new Date('2026-08-26T00:00:00.000Z').toISOString());
  assert.equal(computeExpiresAt('30d', now), new Date('2026-09-18T00:00:00.000Z').toISOString());
});

test('computeExpiresAt throws on an invalid value rather than silently granting no expiry', () => {
  assert.throws(() => computeExpiresAt('3 weeks'), /Invalid expiresIn value/);
});

test('isShareExpired: revoked or past expiresAt is expired; no expiresAt is never expired; missing share is expired', () => {
  const now = new Date('2026-08-19T12:00:00.000Z');
  assert.equal(isShareExpired(null, now), true);
  assert.equal(isShareExpired({ revoked: true, expiresAt: null }, now), true);
  assert.equal(isShareExpired({ revoked: false, expiresAt: null }, now), false);
  assert.equal(isShareExpired({ revoked: false, expiresAt: '2026-08-19T11:59:59.000Z' }, now), true);
  assert.equal(isShareExpired({ revoked: false, expiresAt: '2026-08-19T12:00:00.000Z' }, now), true);
  assert.equal(isShareExpired({ revoked: false, expiresAt: '2026-08-19T12:00:01.000Z' }, now), false);
});

test('slugifySectionTitle is stable, lowercase, punctuation-stripped, and falls back to "general"', () => {
  assert.equal(slugifySectionTitle('Roof & Gutter Damage'), 'roof-gutter-damage');
  assert.equal(slugifySectionTitle('  Exterior Walls  '), 'exterior-walls');
  assert.equal(slugifySectionTitle(''), 'general');
  assert.equal(slugifySectionTitle(undefined), 'general');
  // Same title always produces the same slug regardless of section position.
  assert.equal(slugifySectionTitle('Roof Damage'), slugifySectionTitle('Roof Damage'));
});

test('sanitizeCommentBody strips control characters, trims, and caps length, without mangling normal punctuation', () => {
  assert.equal(sanitizeCommentBody('  hello <world> & "friends"  '), 'hello <world> & "friends"');
  assert.equal(sanitizeCommentBody('bad\x00\x01\x1Fchars'), 'badchars');
  const long = 'a'.repeat(MAX_COMMENT_LENGTH + 500);
  assert.equal(sanitizeCommentBody(long).length, MAX_COMMENT_LENGTH);
  assert.equal(sanitizeCommentBody(null), '');
  assert.equal(sanitizeCommentBody(undefined), '');
});

test('sanitizeGuestName strips control chars, trims, and caps at 120 chars', () => {
  assert.equal(sanitizeGuestName('  Jane Adjuster  '), 'Jane Adjuster');
  assert.equal(sanitizeGuestName('a'.repeat(200)).length, 120);
});
