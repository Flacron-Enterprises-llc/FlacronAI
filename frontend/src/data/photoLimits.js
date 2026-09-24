// Phase 48 correction (2026-09-22): FALLBACK-ONLY. This file is never
// rendered directly by any page as an authoritative value -- it exists
// solely as the loading/network-failure fallback consumed by
// `utils/publicPlanConfigStore.js` (backing the `usePublicPlanConfig` hook),
// mirroring backend/config/planConfig.js's FALLBACK_CONFIG.plans exactly.
//
// The original version of this phase used this constant as the PRIMARY
// source for six static marketing pages -- that was itself a second,
// independently-stale source of truth (an admin publishing a PlanConfig
// change would update Pricing.jsx but never these pages). The correction:
// pages needing an EXACT tier number now read live data through the shared
// store (FAQs.jsx, Pricing.jsx); pages that were only using a number for
// illustrative prose now use non-numeric wording instead ("scales with your
// plan") and no longer import this file at all.
//
// If PlanConfig's built-in mapping ever changes, change it here AND in
// backend/config/planConfig.js's FALLBACK_CONFIG -- both must stay in sync
// since this is what a failed/loading fetch degrades to.
export const PHOTO_LIMITS = Object.freeze({
  starter: 25,
  professional: 100,
  agency: 250,
});

export const MAX_PHOTO_LIMIT = Math.max(...Object.values(PHOTO_LIMITS)); // 250 (Agency) -- Enterprise is unlimited, not a number
