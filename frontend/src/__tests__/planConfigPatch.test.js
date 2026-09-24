import { describe, it, expect } from 'vitest';
import { buildPlanConfigPatch, validatePlanConfigForm, isPlanConfigFormDirty, UNLIMITED } from '../utils/planConfigPatch';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = {
  plans: {
    starter: { basePhotoLimit: 25 },
    professional: { basePhotoLimit: 100 },
    agency: { basePhotoLimit: 250 },
    enterprise: { basePhotoLimit: UNLIMITED },
  },
  addOnsEnabled: false,
  watermarkPolicyEnabled: true,
  displayLabels: { starter: 'Starter', professional: 'Professional', agency: 'Agency', enterprise: 'Enterprise' },
};

describe('buildPlanConfigPatch', () => {
  it('returns an empty patch when nothing changed', () => {
    expect(buildPlanConfigPatch(BASE, BASE)).toEqual({});
  });

  it('includes only the changed tier\'s basePhotoLimit, never untouched tiers', () => {
    const form = { ...BASE, plans: { ...BASE.plans, starter: { basePhotoLimit: 30 } } };
    const patch = buildPlanConfigPatch(form, BASE);
    expect(patch).toEqual({ plans: { starter: { basePhotoLimit: 30 } } });
  });

  it('supports flipping a tier to explicit unlimited', () => {
    const form = { ...BASE, plans: { ...BASE.plans, agency: { basePhotoLimit: UNLIMITED } } };
    const patch = buildPlanConfigPatch(form, BASE);
    expect(patch.plans.agency.basePhotoLimit).toBe(UNLIMITED);
  });

  it('includes addOnsEnabled only when changed', () => {
    const form = { ...BASE, addOnsEnabled: true };
    expect(buildPlanConfigPatch(form, BASE)).toEqual({ addOnsEnabled: true });
  });

  it('never sends watermarkPolicyEnabled (unenforced; the server rejects it) even if it differs', () => {
    const form = { ...BASE, watermarkPolicyEnabled: false };
    expect(buildPlanConfigPatch(form, BASE)).toEqual({});
  });

  it('includes only the changed display label', () => {
    const form = { ...BASE, displayLabels: { ...BASE.displayLabels, starter: 'Starter Plan' } };
    expect(buildPlanConfigPatch(form, BASE)).toEqual({ displayLabels: { starter: 'Starter Plan' } });
  });

  it('never includes reportsPerMonth or any field outside the allowlisted shape', () => {
    const form = { ...BASE, plans: { ...BASE.plans, starter: { basePhotoLimit: 30 } } };
    const patch = buildPlanConfigPatch(form, BASE);
    expect('reportsPerMonth' in (patch.plans?.starter || {})).toBe(false);
    expect(Object.keys(patch)).toEqual(['plans']);
  });
});

describe('validatePlanConfigForm', () => {
  it('accepts a valid form with a change summary', () => {
    expect(validatePlanConfigForm(BASE, 'raise starter limit')).toEqual([]);
  });

  it('rejects a missing change summary', () => {
    expect(validatePlanConfigForm(BASE, '')).toContain('A change summary is required before publishing.');
  });

  it('rejects a negative/non-integer basePhotoLimit', () => {
    const form = { ...BASE, plans: { ...BASE.plans, starter: { basePhotoLimit: -1 } } };
    expect(validatePlanConfigForm(form, 'x').some((m) => m.includes('starter'))).toBe(true);
    const form2 = { ...BASE, plans: { ...BASE.plans, starter: { basePhotoLimit: 12.5 } } };
    expect(validatePlanConfigForm(form2, 'x').some((m) => m.includes('starter'))).toBe(true);
  });

  it('accepts explicit unlimited', () => {
    const form = { ...BASE, plans: { ...BASE.plans, agency: { basePhotoLimit: UNLIMITED } } };
    expect(validatePlanConfigForm(form, 'x')).toEqual([]);
  });

  it('rejects an empty display label', () => {
    const form = { ...BASE, displayLabels: { ...BASE.displayLabels, starter: '  ' } };
    expect(validatePlanConfigForm(form, 'x').some((m) => m.includes('display label'))).toBe(true);
  });
});

describe('isPlanConfigFormDirty', () => {
  it('is false for an unchanged form', () => {
    expect(isPlanConfigFormDirty(BASE, BASE)).toBe(false);
  });
  it('is true once any field changes', () => {
    expect(isPlanConfigFormDirty({ ...BASE, addOnsEnabled: true }, BASE)).toBe(true);
  });
});

describe('AdminPlanConfig page: only enforced settings are editable', () => {
  const source = readFileSync(fileURLToPath(new URL('../pages/AdminPlanConfig.jsx', import.meta.url)), 'utf8');

  it('renders no watermarkPolicyEnabled control and never binds it into form state', () => {
    expect(source).not.toMatch(/form\.watermarkPolicyEnabled/);
    expect(source).not.toMatch(/watermarkPolicyEnabled:\s*!!/);
    expect(source).not.toMatch(/Watermark policy enabled/);
  });

  it('still exposes the enforced controls (photo limits, add-ons toggle, display labels)', () => {
    expect(source).toMatch(/setPlanLimit\(/);
    expect(source).toMatch(/form\.addOnsEnabled/);
    expect(source).toMatch(/setLabel\(/);
  });
});
