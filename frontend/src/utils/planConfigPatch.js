// Phase 48. Pure diffing/validation logic for the admin PlanConfig editor,
// extracted from AdminPlanConfig.jsx so it is unit-testable without
// rendering the page (this repo's established convention for UI-adjacent
// pure logic -- see canonicalEstimateEditor.js, photoCapacityDisplay.js).
// The server (planConfigAdmin.js) is the actual source of truth for what a
// patch may contain -- this module only avoids sending a no-op/invalid
// request and gives the admin fast client-side feedback; it never replaces
// server-side validation.
export const PLAN_IDS = ['starter', 'professional', 'agency', 'enterprise'];
export const UNLIMITED = 'unlimited';

const isPositiveIntegerOrUnlimited = (v) => v === UNLIMITED || (Number.isInteger(v) && v >= 0);

// Builds the SAME shape planConfigAdmin.js's updatePlanConfigFields expects
// -- only the fields that actually differ from the last-loaded server view,
// so a save never resends (and therefore never risks clobbering) untouched
// values.
export const buildPlanConfigPatch = (form, base) => {
  const patch = {};
  const changedPlans = {};
  for (const id of PLAN_IDS) {
    if (form.plans[id].basePhotoLimit !== base.plans[id].basePhotoLimit) {
      changedPlans[id] = { basePhotoLimit: form.plans[id].basePhotoLimit };
    }
  }
  if (Object.keys(changedPlans).length) patch.plans = changedPlans;
  if (form.addOnsEnabled !== base.addOnsEnabled) patch.addOnsEnabled = form.addOnsEnabled;
  // watermarkPolicyEnabled is intentionally never sent: it has no enforced
  // behavior and the server rejects it (planConfigAdmin.js ADMIN_EDITABLE_KEYS).
  const changedLabels = {};
  for (const id of PLAN_IDS) {
    if (form.displayLabels[id] !== base.displayLabels[id]) changedLabels[id] = form.displayLabels[id];
  }
  if (Object.keys(changedLabels).length) patch.displayLabels = changedLabels;
  return patch;
};

// Fast client-side feedback only -- the server re-validates everything
// (planConfigAdmin.js's validatePatchShape + validatePlanConfig) and is the
// only path that can actually reject/accept a write.
export const validatePlanConfigForm = (form, changeSummary) => {
  const issues = [];
  for (const id of PLAN_IDS) {
    const v = form.plans[id]?.basePhotoLimit;
    if (!isPositiveIntegerOrUnlimited(v)) issues.push(`${id}: photo limit must be a non-negative whole number or "unlimited"`);
  }
  for (const id of PLAN_IDS) {
    if (!form.displayLabels[id] || !form.displayLabels[id].trim()) issues.push(`${id}: display label cannot be empty`);
  }
  if (!changeSummary || !changeSummary.trim()) issues.push('A change summary is required before publishing.');
  return issues;
};

export const isPlanConfigFormDirty = (form, base) => JSON.stringify(form) !== JSON.stringify(base);
