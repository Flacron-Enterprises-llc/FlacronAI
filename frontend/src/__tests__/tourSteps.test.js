import { describe, it, expect } from 'vitest';
import { buildTourSteps, resolveTourRole, TOUR_VERSION } from '../tour/tourSteps.js';

const ids = (steps) => steps.map((s) => s.id);

describe('resolveTourRole', () => {
  it('treats solo accounts and team owners as owner', () => {
    expect(resolveTourRole({}, 'u1')).toBe('owner');
    expect(resolveTourRole({ teamOwnerId: 'u1', teamRole: 'viewer' }, 'u1')).toBe('owner');
  });

  it('uses the team role for members, viewer when unknown', () => {
    expect(resolveTourRole({ teamOwnerId: 'boss', teamRole: 'reviewer' }, 'u1')).toBe('reviewer');
    expect(resolveTourRole({ teamOwnerId: 'boss', teamRole: 'superuser' }, 'u1')).toBe('viewer');
    expect(resolveTourRole(null, 'u1')).toBe('viewer');
  });
});

describe('buildTourSteps', () => {
  it('always starts with a welcome and ends with finish, with backend-valid unique ids', () => {
    for (const role of ['owner', 'admin', 'manager', 'adjuster', 'inspector', 'reviewer', 'viewer']) {
      for (const tier of ['starter', 'professional', 'agency', 'enterprise']) {
        const steps = buildTourSteps({ role, tier });
        expect(steps[0].id).toBe('welcome');
        expect(steps.at(-1).id).toBe('finish');
        expect(new Set(ids(steps)).size).toBe(steps.length);
        // backend/utils/productTour.js accepts only these as lastStepId
        for (const id of ids(steps)) expect(id).toMatch(/^[a-z0-9-]{1,40}$/);
      }
    }
    expect(TOUR_VERSION).toBeGreaterThanOrEqual(1);
  });

  it('gives a starter owner the generate, billing and help steps but no team tools', () => {
    const steps = ids(buildTourSteps({ role: 'owner', tier: 'starter' }));
    expect(steps).toEqual(expect.arrayContaining(['nav-generate', 'usage-card', 'nav-reports', 'nav-billing', 'nav-settings', 'help-menu']));
    expect(steps).not.toContain('nav-crm');
    expect(steps).not.toContain('nav-organization');
  });

  it('adds CRM for agency and organization for an enterprise team manager', () => {
    expect(ids(buildTourSteps({ role: 'owner', tier: 'agency' }))).toContain('nav-crm');
    const manager = ids(buildTourSteps({ role: 'manager', tier: 'enterprise' }));
    expect(manager).toEqual(expect.arrayContaining(['nav-crm', 'nav-organization']));
    expect(manager).not.toContain('nav-billing');
  });

  it('keeps a reviewer on review: no generate, templates or billing, and no generate CTA', () => {
    const steps = buildTourSteps({ role: 'reviewer', tier: 'enterprise' });
    expect(ids(steps)).not.toContain('nav-generate');
    expect(ids(steps)).not.toContain('nav-templates');
    expect(ids(steps)).not.toContain('nav-billing');
    expect(steps.find((s) => s.id === 'nav-reports').title).toMatch(/review/i);
    expect(steps.at(-1).cta).toBeUndefined();
  });

  it('personalizes the welcome by name, onboarding answer and team membership', () => {
    const adjuster = buildTourSteps({ firstName: 'Dana', role: 'owner', userType: 'independent_adjuster' })[0];
    expect(adjuster.title).toBe('Welcome to FlacronAI, Dana');
    expect(adjuster.body).toMatch(/inspection photos/);
    const member = buildTourSteps({ role: 'inspector', company: 'Acme Claims' })[0];
    expect(member.body).toMatch(/Acme Claims’s team as Inspector/);
  });

  it('adds the support chat and platform admin steps only when they apply', () => {
    expect(ids(buildTourSteps({}))).not.toContain('support-chat');
    expect(ids(buildTourSteps({ hasSupportChat: true }))).toContain('support-chat');
    expect(ids(buildTourSteps({ isPlatformAdmin: true }))).toContain('platform-admin');
  });

  it('points every sidebar step at a data-tour anchor and offers a mobile fallback for the menu', () => {
    const steps = buildTourSteps({ role: 'owner', tier: 'enterprise', hasSupportChat: true });
    for (const s of steps.filter((x) => x.surface === 'sidebar')) expect(s.target).toMatch(/^\[data-tour="[a-z-]+"\]$/);
    expect(steps.find((s) => s.id === 'help-menu').mobileTarget).toBe('[data-tour="mobile-menu"]');
  });

  it('says Super Intelligence, never AI, in user-facing copy', () => {
    const text = buildTourSteps({ role: 'owner', tier: 'enterprise', hasSupportChat: true, isPlatformAdmin: true })
      .map((s) => `${s.title} ${s.body}`)
      .join(' ');
    expect(text).toMatch(/Super Intelligence/);
    expect(text.replace(/FlacronAI/g, '')).not.toMatch(/\bAI\b/);
  });
});
