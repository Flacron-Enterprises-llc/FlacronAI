/**
 * Phase 8 — edit the permitted profile fields (same set as web Settings → Profile). Email, plan,
 * role and billing are shown elsewhere and never editable here.
 */
import { useState } from 'react';

import { ThemedText } from '@/components/ThemedText';
import { AuthTextInput } from '@/features/auth/components/AuthTextInput';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { useProfile } from '@/features/settings/hooks/useProfile';
import { AccountScaffold, Card, Notice } from '../components/AccountScaffold';
import { changedFields, PROFILE_LIMITS, validateProfile, type ProfileErrors, type ProfileValues } from '../profileValidation';

const FIELDS: { key: keyof ProfileValues; label: string; props?: object }[] = [
  { key: 'displayName', label: 'Display name', props: { autoComplete: 'name', textContentType: 'name' } },
  { key: 'firstName', label: 'First name', props: { autoComplete: 'given-name', textContentType: 'givenName' } },
  { key: 'lastName', label: 'Last name', props: { autoComplete: 'family-name', textContentType: 'familyName' } },
  { key: 'company', label: 'Company', props: { textContentType: 'organizationName' } },
  { key: 'phone', label: 'Phone', props: { keyboardType: 'phone-pad', autoComplete: 'tel', textContentType: 'telephoneNumber' } },
  { key: 'address', label: 'Address', props: { multiline: true, textContentType: 'fullStreetAddress' } },
];

export function ProfileScreen() {
  const { firebaseUser, userProfile } = useAuth();
  const { saveProfile, saving, saveError, clearSaveError } = useProfile();
  const [initial, setInitial] = useState<ProfileValues>(() => ({
    displayName: userProfile?.displayName ?? '',
    firstName: userProfile?.firstName ?? '',
    lastName: userProfile?.lastName ?? '',
    company: userProfile?.company ?? '',
    phone: userProfile?.phone ?? '',
    address: userProfile?.address ?? '',
  }));
  const [values, setValues] = useState<ProfileValues>(initial);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [saved, setSaved] = useState(false);

  const update = (key: keyof ProfileValues, v: string) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    setSaved(false);
    clearSaveError();
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const changes = changedFields(initial, values);
  const dirty = Object.keys(changes).length > 0;

  const save = async () => {
    const found = validateProfile(values);
    setErrors(found);
    if (Object.keys(found).length) return;
    if (!dirty) return;
    const ok = await saveProfile(changes);
    if (ok) {
      setInitial(values);
      setSaved(true);
    }
  };

  return (
    <AccountScaffold title="Profile">
      <Card>
        <ThemedText variant="caption" color="muted">
          Email
        </ThemedText>
        <ThemedText variant="body">{firebaseUser?.email ?? '—'}</ThemedText>
        <ThemedText variant="caption" color="muted" style={{ marginTop: 6 }}>
          Your email is your sign-in and can’t be changed in the app.
        </ThemedText>
      </Card>
      {FIELDS.map((f) => (
        <AuthTextInput
          key={f.key}
          label={f.label}
          value={values[f.key]}
          onChangeText={(v) => update(f.key, v)}
          error={errors[f.key]}
          maxLength={PROFILE_LIMITS[f.key] + 20}
          accessibilityLabel={f.label}
          {...f.props}
        />
      ))}
      {/* Phase 10 (found on a cloud Android emulator): the result notice sits next to the
          button the user just tapped — at the top of the form it was scrolled out of view. */}
      <Notice tone="error" text={saveError ? `${saveError} Your changes are still here — try again.` : null} />
      <Notice tone="success" text={saved ? 'Profile saved.' : null} />
      <PrimaryButton label={dirty ? 'Save changes' : 'No changes'} onPress={save} loading={saving} disabled={!dirty} />
    </AccountScaffold>
  );
}
