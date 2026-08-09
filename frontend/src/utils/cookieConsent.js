// Cookie-consent store — single source of truth for what the visitor has allowed.
//
// Consent is persisted in localStorage with full metadata (categories, timestamp,
// policy version, and user id when known) so it can be audited and re-checked on
// return visits. Non-essential code (analytics, preference cookies) MUST call
// `hasConsent(category)` before running — see `gateNonEssential` below.
//
// Categories intentionally mirror the Cookies Policy page (Essential / Analytics /
// Preferences). Essential is always on and cannot be turned off.

export const COOKIE_CONSENT_KEY = 'flacron_cookie_consent';

// Bump this whenever the cookie categories or policy materially change. A stored
// consent with an older version is treated as "not yet decided" so the banner
// re-appears and we re-collect consent. Keep in sync with the Cookies Policy date.
export const COOKIE_POLICY_VERSION = '2026-03-01';

// Event other components can listen for to react to consent changes (e.g. the
// banner closing, analytics booting). Also used by the footer link to open the
// preference center.
export const CONSENT_CHANGED_EVENT = 'flacron:cookie-consent-changed';
export const OPEN_PREFERENCES_EVENT = 'flacron:open-cookie-preferences';

export const COOKIE_CATEGORIES = [
  {
    id: 'essential',
    label: 'Strictly Necessary',
    required: true,
    description:
      'Required for the site to work — sign-in, security, and secure payments. These cannot be switched off.',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    required: false,
    description:
      'Help us understand how the platform is used so we can improve it. Anonymized; no ad targeting.',
  },
  {
    id: 'preferences',
    label: 'Preferences',
    required: false,
    description:
      'Remember your settings (such as theme and layout) to personalize your experience.',
  },
];

const OPTIONAL_CATEGORIES = COOKIE_CATEGORIES.filter((c) => !c.required).map((c) => c.id);

// Some browsers send a Do Not Track signal. The Cookies Policy commits to honoring
// it, so we treat DNT as an implicit "reject non-essential" default until the
// visitor makes an explicit choice.
export function isDoNotTrackEnabled() {
  if (typeof navigator === 'undefined' && typeof window === 'undefined') return false;
  const dnt =
    (typeof navigator !== 'undefined' && (navigator.doNotTrack || navigator.msDoNotTrack)) ||
    (typeof window !== 'undefined' && window.doNotTrack);
  return dnt === '1' || dnt === 'yes';
}

// Read the stored consent record, or null if none/invalid/outdated.
export function getStoredConsent() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.categories) return null;
    // A consent captured under an older policy version no longer counts.
    if (parsed.version !== COOKIE_POLICY_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

// True once the visitor has made an explicit, current-version choice.
export function hasDecided() {
  return getStoredConsent() !== null;
}

// The gate every non-essential feature must pass through. Essential is always
// allowed; optional categories require a stored, granted consent.
export function hasConsent(category) {
  if (category === 'essential') return true;
  const consent = getStoredConsent();
  return Boolean(consent?.categories?.[category]);
}

// Build a normalized record. `granted` is a partial map of optional categories.
function buildRecord(granted, userId) {
  const categories = { essential: true };
  for (const id of OPTIONAL_CATEGORIES) {
    categories[id] = Boolean(granted?.[id]);
  }
  return {
    categories,
    version: COOKIE_POLICY_VERSION,
    // ISO 8601 timestamp of the decision, for auditability.
    timestamp: new Date().toISOString(),
    // Present only when the visitor is authenticated at decision time.
    userId: userId || null,
    dnt: isDoNotTrackEnabled(),
  };
}

// Persist a decision and notify listeners. `granted` is a map like
// { analytics: true, preferences: false }; omitted keys default to false.
export function saveConsent(granted, { userId } = {}) {
  const record = buildRecord(granted, userId);
  try {
    localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(record));
  } catch {
    // localStorage unavailable (private mode / disabled) — consent simply won't
    // persist; the banner will re-ask next load. We don't hard-fail the UI.
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: record }));
  }
  return record;
}

export function acceptAll(opts) {
  return saveConsent(
    OPTIONAL_CATEGORIES.reduce((acc, id) => ({ ...acc, [id]: true }), {}),
    opts,
  );
}

export function rejectNonEssential(opts) {
  return saveConsent(
    OPTIONAL_CATEGORIES.reduce((acc, id) => ({ ...acc, [id]: false }), {}),
    opts,
  );
}

// Ask the app to open the preference center (used by the footer link).
export function openCookiePreferences() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OPEN_PREFERENCES_EVENT));
  }
}

// Convenience wrapper for gating a side-effect behind a category. Runs `fn` only
// if the category is currently consented; otherwise re-runs it later if/when the
// visitor grants it. Returns an unsubscribe function.
export function gateNonEssential(category, fn) {
  if (hasConsent(category)) {
    fn();
    return () => {};
  }
  const handler = (e) => {
    if (e.detail?.categories?.[category]) {
      fn();
      window.removeEventListener(CONSENT_CHANGED_EVENT, handler);
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener(CONSENT_CHANGED_EVENT, handler);
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, handler);
  }
  return () => {};
}
