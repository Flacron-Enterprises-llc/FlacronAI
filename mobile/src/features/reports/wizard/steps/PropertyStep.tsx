import { ScrollView } from 'react-native';

import { AuthTextInput } from '@/features/auth/components/AuthTextInput';
import type { WizardFields } from '../wizardTypes';
import { PROPERTY_TYPES } from '../constants';
import { ChoiceChips } from '../components/ChoiceChips';

interface StepProps {
  fields: WizardFields;
  setField: (key: string, value: string) => void;
}

/** Required field regardless of claim type — `propertyAddress` is required server-side even
 * for an Auto claim (see `backend/routes/reports.js`'s required-fields check, which never
 * branches on `claimType`). Labeled "Location of loss" for Auto since it isn't a structure
 * there, matching the intent of the web wizard's own per-claim-type framing. */
export function PropertyStep({ fields, setField }: StepProps) {
  const isAuto = fields.claimType === 'Auto';

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <AuthTextInput
        label={isAuto ? 'Location of loss *' : 'Property address *'}
        value={fields.propertyAddress || ''}
        onChangeText={(v) => setField('propertyAddress', v)}
        placeholder={isAuto ? 'e.g. Intersection of 5th & Main St' : '123 Main St, Springfield, IL'}
      />

      {isAuto ? (
        <>
          <AuthTextInput label="VIN" value={fields.vin || ''} onChangeText={(v) => setField('vin', v)} autoCapitalize="characters" />
          <AuthTextInput
            label="Vehicle (make / model / year)"
            value={fields.vehicleMakeModelYear || ''}
            onChangeText={(v) => setField('vehicleMakeModelYear', v)}
            placeholder="e.g. 2021 Toyota Camry"
          />
          <AuthTextInput
            label="License plate"
            value={fields.licensePlate || ''}
            onChangeText={(v) => setField('licensePlate', v)}
            autoCapitalize="characters"
          />
          <AuthTextInput label="Vehicle color" value={fields.vehicleColor || ''} onChangeText={(v) => setField('vehicleColor', v)} />
        </>
      ) : (
        <ChoiceChips
          label="Property type"
          value={fields.propertyType || 'Single-Family Home'}
          options={PROPERTY_TYPES}
          onChange={(v) => setField('propertyType', v)}
        />
      )}
    </ScrollView>
  );
}

export function isPropertyStepValid(fields: WizardFields): boolean {
  return !!fields.propertyAddress?.trim();
}
