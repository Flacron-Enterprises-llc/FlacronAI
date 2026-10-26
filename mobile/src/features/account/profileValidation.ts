/**
 * Phase 8 — profile form validation + the ONLY fields the app ever sends to
 * `PUT /users/profile`. Limits mirror the backend's express-validator rules
 * (`backend/routes/users.js`). Tier, billing, team, role and security fields are never part
 * of a profile update — the server ignores them and Firestore rules reject them too.
 */
export const PROFILE_FIELDS = ['displayName', 'firstName', 'lastName', 'company', 'phone', 'address'] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];
export type ProfileValues = Record<ProfileField, string>;
export type ProfileErrors = Partial<Record<ProfileField, string>>;

export const PROFILE_LIMITS: Record<ProfileField, number> = {
  displayName: 100,
  firstName: 100,
  lastName: 100,
  company: 200,
  phone: 40,
  address: 500,
};

const PHONE_PATTERN = /^[0-9+().\-\s]*$/;

export function validateProfile(values: ProfileValues): ProfileErrors {
  const errors: ProfileErrors = {};
  for (const field of PROFILE_FIELDS) {
    const v = (values[field] ?? '').trim();
    if (v.length > PROFILE_LIMITS[field]) errors[field] = `Must be ${PROFILE_LIMITS[field]} characters or fewer.`;
  }
  if (!errors.displayName && !(values.displayName ?? '').trim()) errors.displayName = 'Enter a display name.';
  if (!errors.phone && !PHONE_PATTERN.test((values.phone ?? '').trim())) {
    errors.phone = 'Use digits and + ( ) - . only.';
  }
  return errors;
}

/** Trimmed values for permitted fields only; anything else passed in is dropped. */
export function buildProfileUpdate(values: Partial<Record<string, unknown>>): Partial<ProfileValues> {
  const out: Partial<ProfileValues> = {};
  for (const field of PROFILE_FIELDS) {
    const v = values[field];
    if (typeof v === 'string') out[field] = v.trim();
  }
  return out;
}

/** Only the fields that actually changed (so a save never rewrites untouched values). */
export function changedFields(initial: ProfileValues, current: ProfileValues): Partial<ProfileValues> {
  const update = buildProfileUpdate(current);
  const out: Partial<ProfileValues> = {};
  for (const field of PROFILE_FIELDS) {
    if (update[field] !== undefined && update[field] !== (initial[field] ?? '').trim()) out[field] = update[field];
  }
  return out;
}
