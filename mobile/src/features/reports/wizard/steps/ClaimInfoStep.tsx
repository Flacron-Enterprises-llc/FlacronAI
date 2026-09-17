import { ScrollView } from 'react-native';

import { AuthTextInput } from '@/features/auth/components/AuthTextInput';
import type { WizardFields } from '../wizardTypes';
import { CLAIM_TYPES } from '../constants';
import { ChoiceChips } from '../components/ChoiceChips';

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

interface StepProps {
  fields: WizardFields;
  setField: (key: string, value: string) => void;
}

export function ClaimInfoStep({ fields, setField }: StepProps) {
  const email = fields.insuredEmail || '';

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <AuthTextInput
        label="Claim number *"
        value={fields.claimNumber || ''}
        onChangeText={(v) => setField('claimNumber', v)}
        placeholder="e.g. CLM-2026-00123"
        autoCapitalize="characters"
      />
      <AuthTextInput
        label="Insured name *"
        value={fields.insuredName || ''}
        onChangeText={(v) => setField('insuredName', v)}
        placeholder="e.g. Jordan Rivera"
      />
      <AuthTextInput
        label="Insured email *"
        value={email}
        onChangeText={(v) => setField('insuredEmail', v)}
        placeholder="name@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        error={email && !isValidEmail(email) ? 'Enter a valid email address' : undefined}
      />
      <ChoiceChips label="Claim type" value={fields.claimType || 'Property'} options={CLAIM_TYPES} onChange={(v) => setField('claimType', v)} />
      <AuthTextInput
        label="Policy number"
        value={fields.policyNumber || ''}
        onChangeText={(v) => setField('policyNumber', v)}
        placeholder="e.g. POL-4821093"
      />
      <AuthTextInput
        label="Insurance company"
        value={fields.insuranceCompany || ''}
        onChangeText={(v) => setField('insuranceCompany', v)}
        placeholder="e.g. Acme Mutual"
      />
    </ScrollView>
  );
}

export function isClaimInfoStepValid(fields: WizardFields): boolean {
  return !!(fields.claimNumber?.trim() && fields.insuredName?.trim() && isValidEmail(fields.insuredEmail || ''));
}
