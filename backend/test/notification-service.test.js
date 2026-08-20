const test = require('node:test');
const assert = require('node:assert/strict');
const { NOTIFICATION_TYPES, buildNotification } = require('../utils/notificationService');

// buildNotification is pure (no Firestore), so it's unit-testable directly --
// same split this codebase already uses for reportAccess.js (Phase 19): pure
// logic gets node:test coverage here, the actual Firestore read/write/counter
// behavior (createNotification/listNotifications/markAsRead/markAllAsRead,
// which all depend on a real `db`) is verified against the real project by
// the isolated live-API pass, exactly like Phase 19's own test split.

test('every notification type produces a non-empty title, and a report-scoped link when reportId is given', () => {
  for (const type of Object.values(NOTIFICATION_TYPES)) {
    const withReport = buildNotification(type, { reportId: 'r1', claimNumber: 'CLM-1' });
    assert.ok(withReport.title && withReport.title.length > 0, `${type} must have a title`);
    assert.equal(typeof withReport.body, 'string');
    if (type !== NOTIFICATION_TYPES.TEAM_INVITATION && type !== NOTIFICATION_TYPES.SUBSCRIPTION_ISSUE) {
      assert.equal(withReport.link, '/reports/r1/preview', `${type} should link to the report when reportId is given`);
    }
  }
});

test('an unknown type never throws and returns an empty, non-crashing shape', () => {
  const result = buildNotification('not_a_real_type', { reportId: 'r1' });
  assert.equal(result.title, 'Notification');
  assert.equal(result.body, '');
  assert.equal(result.link, null);
});

test('team invitation and subscription issue link to dashboard/subscriptions, never a report, even if reportId is (incorrectly) passed', () => {
  const invite = buildNotification(NOTIFICATION_TYPES.TEAM_INVITATION, { reportId: 'r1', ownerName: 'Alex', role: 'adjuster' });
  assert.equal(invite.link, '/dashboard');
  assert.match(invite.body, /Alex/);
  assert.match(invite.body, /adjuster/);

  const billing = buildNotification(NOTIFICATION_TYPES.SUBSCRIPTION_ISSUE, { reportId: 'r1' });
  assert.equal(billing.link, '/subscriptions');
});

test('review-declined wording differs between rejected and changes_requested', () => {
  const rejected = buildNotification(NOTIFICATION_TYPES.REVIEW_DECLINED, { decision: 'rejected', reviewerName: 'Sam', claimNumber: 'CLM-9' });
  const changes = buildNotification(NOTIFICATION_TYPES.REVIEW_DECLINED, { decision: 'changes_requested', reviewerName: 'Sam', claimNumber: 'CLM-9' });
  assert.equal(rejected.title, 'Review declined');
  assert.equal(changes.title, 'Changes requested');
  assert.match(rejected.body, /declined to review/);
  assert.match(changes.body, /requested changes/);
});

test('export-completed body reflects the requested format, uppercased', () => {
  const pdf = buildNotification(NOTIFICATION_TYPES.EXPORT_COMPLETED, { format: 'pdf', claimNumber: 'CLM-2' });
  assert.match(pdf.body, /PDF/);
});

test('a notification with no claimNumber falls back to generic wording, never "claim undefined"', () => {
  const result = buildNotification(NOTIFICATION_TYPES.REPORT_APPROVED, { reportId: 'r1' });
  assert.doesNotMatch(result.body, /undefined/);
  assert.match(result.body, /your report/i);
});
