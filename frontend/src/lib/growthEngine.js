// Flacron Growth Engine (FCGE): lifecycle analytics, support chat and offers
// for FlacronAI, all controlled from the Growth Engine dashboard.
//
// Same consent-gated install as Flacron Lead / Flacron Energy:
//   1. `window.FCGE` is created here as a queue as soon as this module loads.
//      It makes no request; calls only land in memory.
//   2. The SDK (`fcge.min.js`, which sends the queue and also brings the
//      support chat widget and any popups configured in the Growth Engine) is
//      appended to <head> only once the visitor has allowed analytics cookies
//      (utils/cookieConsent.js), including consent given later in the visit.
//
// Every helper is a no-op without consent and never throws: analytics must
// never be the reason an action fails. Payment and subscription events are
// deliberately absent -- the Growth Engine receives this Stripe account's
// webhooks (filtered by app_id=flacron-ai), so sending them here would double count.

import { hasConsent } from '../utils/cookieConsent.js';

// The key is the Growth Engine's publishable key: it is meant to ship to the
// browser (like a Stripe publishable key) and grants no server-side access.
export const GROWTH_ENGINE = {
  appId: 'cmujjiqvv01jtjy1jqji20aru',
  key: 'pk_live_2eced1144c7e66fae6a703a9002169ecb9d46b6430e449ae',
  endpoint: 'https://dleleyb9ufrgz.cloudfront.net',
  sdkUrl: 'https://dleleyb9ufrgz.cloudfront.net/sdk/fcge.min.js',
};

// `VITE_FCGE_DISABLED=true` keeps a local or staging build from reporting into the live app.
export const growthEngineEnabled = import.meta.env.VITE_FCGE_DISABLED !== 'true';

const METHODS = ['identify', 'track', 'registerWebinar', 'page', 'showForm', 'reset'];

/** The install snippet's first script: config plus a stub per method that queues its call. */
export function installGrowthEngineQueue() {
  if (!growthEngineEnabled || typeof window === 'undefined' || window.FCGE) return;
  const fcge = { appId: GROWTH_ENGINE.appId, key: GROWTH_ENGINE.key, endpoint: GROWTH_ENGINE.endpoint, q: [] };
  METHODS.forEach((m) => {
    fcge[m] = function queued() {
      fcge.q.push([m, arguments]);
    };
  });
  window.FCGE = fcge;
}

installGrowthEngineQueue();

function fcge() {
  if (!growthEngineEnabled || typeof window === 'undefined') return null;
  const client = window.FCGE;
  if (!client || typeof client.track !== 'function') return null;
  if (!hasConsent('analytics')) return null;
  return client;
}

/** Load the SDK into <head>, once. Call only after analytics consent. */
export function loadGrowthEngineSdk() {
  if (!growthEngineEnabled || typeof document === 'undefined') return;
  if (document.querySelector(`script[src="${GROWTH_ENGINE.sdkUrl}"]`)) return;
  const script = document.createElement('script');
  script.src = GROWTH_ENGINE.sdkUrl;
  script.async = true;
  document.head.appendChild(script);
}

/**
 * Lifecycle events the Growth Engine's journeys are keyed on:
 * user_registered, email_verified, onboarding_completed, feature_used,
 * usage_limit_90, usage_limit_100, pricing_page_visited, upgrade_clicked,
 * checkout_started, demo_requested.
 */
export function trackGrowthEvent(event, properties) {
  try {
    fcge()?.track(event, properties);
  } catch {
    // Analytics must never be the reason an action fails.
  }
}

/**
 * The actions that count as using the product -- the meaningful ones only, so
 * `feature_used` reads as adoption rather than noise. Call after the request succeeded.
 * Features: report_generated, report_finalized, report_exported, report_shared,
 * template_created, crm_client_created, team_member_invited, product_tour_completed.
 */
export function trackFeatureUsed(feature, properties) {
  trackGrowthEvent('feature_used', { ...properties, feature });
}

export function trackPageView(path) {
  try {
    fcge()?.page({ path });
  } catch {
    // As above.
  }
}

let lastIdentity = null;

/** FCGE.identify for the signed-in user; repeated calls with the same traits are dropped. */
export function identifyGrowthUser(identity) {
  const client = fcge();
  if (!client || !identity?.email) return;
  const traits = { email: identity.email, externalUserId: identity.id };
  const name = identity.name?.trim();
  if (name && name !== identity.email) traits.name = name;
  for (const key of ['firstName', 'lastName', 'company', 'role', 'plan', 'phone']) {
    if (identity[key]) traits[key] = identity[key];
  }
  if (typeof identity.marketingConsent === 'boolean') traits.marketingConsent = identity.marketingConsent;
  if (identity.properties) traits.properties = identity.properties;
  const fingerprint = JSON.stringify(traits);
  if (fingerprint === lastIdentity) return;
  try {
    client.identify(traits);
    lastIdentity = fingerprint;
  } catch {
    // As above.
  }
}

/** Forget the last identity so the next sign-in (or a later consent) identifies again. */
export function resetGrowthIdentity() {
  lastIdentity = null;
}

/**
 * Sign-out: forget the identity here and in the SDK so the next person on this
 * browser isn't attributed to the last user. Not consent-gated -- forgetting
 * someone is always allowed, and without the SDK the call only lands in the queue.
 */
export function signOutGrowthUser() {
  resetGrowthIdentity();
  if (!growthEngineEnabled || typeof window === 'undefined') return;
  try {
    if (typeof window.FCGE?.reset === 'function') window.FCGE.reset();
  } catch {
    // As above.
  }
}

const USAGE_STORAGE_KEY = 'flacron_fcge_usage_reported';
const reportedInMemory = new Set();

function usageReported() {
  try {
    const raw = window.sessionStorage.getItem(USAGE_STORAGE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set(reportedInMemory);
  }
}

function rememberUsage(reported) {
  reported.forEach((key) => reportedInMemory.add(key));
  try {
    window.sessionStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(Array.from(reported)));
  } catch {
    // Storage blocked: the in-memory copy still dedupes this page load.
  }
}

/**
 * Report the monthly report allowance crossing 90% and 100%, each once per
 * month per browser session. Unlimited (-1) or unknown limits never report.
 */
export function reportUsageThreshold(resource, used, limit) {
  if (typeof used !== 'number' || typeof limit !== 'number' || limit <= 0) return;
  const ratio = used / limit;
  if (ratio < 0.9 || !fcge()) return;
  const month = new Date().toISOString().slice(0, 7);
  const reported = usageReported();
  const due = [];
  if (!reported.has(`90:${resource}:${month}`)) due.push(['usage_limit_90', `90:${resource}:${month}`]);
  if (ratio >= 1 && !reported.has(`100:${resource}:${month}`)) due.push(['usage_limit_100', `100:${resource}:${month}`]);
  if (due.length === 0) return;
  for (const [event, key] of due) {
    reported.add(key);
    trackGrowthEvent(event, { resource, used, limit });
  }
  rememberUsage(reported);
}

// ── Offer hand-off ───────────────────────────────────────────────────────────
// Growth Engine webinar / giveaway links open FlacronAI with ?code=&fcge_ref=.
// They're kept for the session (survive sign-up / sign-in) and sent with the
// checkout request; the backend applies the code and stamps fcge_ref on the
// Stripe session so the engine credits the offer. Needed to honour the offer
// the visitor clicked, so it isn't consent-gated, and it never leaves this app
// except in the visitor's own checkout request.

const HANDOFF_KEY = 'flacron_fcge_handoff';
const REF = /^[A-Za-z0-9_\-.]{10,400}$/;
const CODE = /^[A-Z0-9][A-Z0-9_-]{1,39}$/;

export function captureOfferHandoff(search) {
  if (typeof window === 'undefined') return;
  let params;
  try {
    params = new URLSearchParams(search ?? window.location.search);
  } catch {
    return;
  }
  const code = params.get('code')?.trim().toUpperCase();
  const ref = params.get('fcge_ref')?.trim();
  const next = {
    ...(code && CODE.test(code) ? { promoCode: code } : {}),
    ...(ref && REF.test(ref) ? { fcgeRef: ref } : {}),
  };
  if (!next.promoCode && !next.fcgeRef) return;
  try {
    window.sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({ ...getOfferHandoff(), ...next }));
  } catch {
    // Storage blocked: the offer just won't survive a reload.
  }
}

export function getOfferHandoff() {
  try {
    const raw = window.sessionStorage.getItem(HANDOFF_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      ...(typeof parsed.promoCode === 'string' && CODE.test(parsed.promoCode) ? { promoCode: parsed.promoCode } : {}),
      ...(typeof parsed.fcgeRef === 'string' && REF.test(parsed.fcgeRef) ? { fcgeRef: parsed.fcgeRef } : {}),
    };
  } catch {
    return {};
  }
}
