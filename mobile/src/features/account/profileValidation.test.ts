import { buildProfileUpdate, changedFields, validateProfile, type ProfileValues } from './profileValidation';

const base: ProfileValues = { displayName: 'Alice', firstName: '', lastName: '', company: '', phone: '', address: '' };

describe('profile validation', () => {
  it('accepts a normal profile', () => {
    expect(validateProfile({ ...base, phone: '+1 (555) 010-0100', company: 'Acme' })).toEqual({});
  });

  it('requires a display name and enforces the server limits', () => {
    expect(validateProfile({ ...base, displayName: '   ' }).displayName).toBeTruthy();
    expect(validateProfile({ ...base, phone: '1'.repeat(41) }).phone).toMatch(/40/);
    expect(validateProfile({ ...base, company: 'x'.repeat(201) }).company).toMatch(/200/);
    expect(validateProfile({ ...base, address: 'x'.repeat(501) }).address).toMatch(/500/);
    expect(validateProfile({ ...base, phone: 'call me' }).phone).toBeTruthy();
  });
});

describe('protected fields', () => {
  it('only permitted profile fields are ever sent', () => {
    const update = buildProfileUpdate({
      displayName: ' Alice ',
      tier: 'enterprise',
      stripeTier: 'agency',
      adminTier: 'agency',
      storeEntitlement: {},
      teamOwnerId: 'x',
      teamRole: 'admin',
      mfaEnabled: false,
      email: 'evil@example.com',
    });
    expect(update).toEqual({ displayName: 'Alice' });
  });

  it('a save only includes fields that changed', () => {
    expect(changedFields(base, { ...base, company: ' Acme ' })).toEqual({ company: 'Acme' });
    expect(changedFields(base, { ...base })).toEqual({});
  });
});
