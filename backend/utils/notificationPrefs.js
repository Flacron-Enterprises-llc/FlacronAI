// Phase 18 (Settings Completion). Single source of truth for the 6 spec'd
// notification preference keys, shared by users.js (persisting the raw
// preference object) and every event site that actually sends a gated email
// (photoJobService.js, reports.js, payment.js) -- so "supported" always means
// the same 6 keys in both places, never a silently-drifting duplicate list.
const NOTIFICATION_KEYS = [
  'reportCompleted',
  'analysisCompleted',
  'reviewRequested',
  'reportApproved',
  'reportShared',
  'billing',
];

// Every preference defaults to enabled (opt-out, not opt-in) -- these are
// transactional/operational emails about the user's own account activity,
// not marketing (Golden Rule #5 only requires opt-in consent for marketing).
const DEFAULT_NOTIFICATIONS = Object.fromEntries(NOTIFICATION_KEYS.map((k) => [k, true]));

// Strips any unknown key and coerces every known key to a real boolean, so a
// malformed/partial client payload can never silently store `undefined`,
// a string, or an unrecognized key that a future typo'd call site might
// mistakenly gate on.
const sanitizeNotifications = (input, existing = {}) => {
  const merged = { ...DEFAULT_NOTIFICATIONS, ...existing, ...(input && typeof input === 'object' ? input : {}) };
  const out = {};
  for (const key of NOTIFICATION_KEYS) out[key] = merged[key] !== false;
  return out;
};

// Defaults to true (enabled) when the key has never been explicitly set,
// matching the opt-out default above -- never silently gate a real event by
// treating "not yet set" as "off".
const isNotificationEnabled = (notifications, key) => notifications?.[key] !== false;

module.exports = { NOTIFICATION_KEYS, DEFAULT_NOTIFICATIONS, sanitizeNotifications, isNotificationEnabled };
