import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { Badge, Icon } from '@/components/ui';
import { apiErrorMessage, useApiResource } from '@/hooks/useApiResource';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { documentsApi, type PropertyLookupResult } from '@/services/api/documents';
import { useTheme } from '@/theme';
import { DocSheet, Disclaimer, SectionLabel } from './formKit';

/** Same keys/labels as the web FIELD_GROUPS (frontend/src/utils/propertyIntelligence.js). */
export const PROPERTY_FIELDS: { key: string; label: string; unitKey?: string; currencyKey?: string }[] = [
  { key: 'parcelNumber', label: 'Parcel / APN' },
  { key: 'propertyType', label: 'Property Type' },
  { key: 'yearBuilt', label: 'Year Built' },
  { key: 'livingAreaValue', label: 'Living Area', unitKey: 'livingAreaUnit' },
  { key: 'lotSizeValue', label: 'Lot Size', unitKey: 'lotSizeUnit' },
  { key: 'bedrooms', label: 'Bedrooms' },
  { key: 'bathrooms', label: 'Bathrooms' },
  { key: 'stories', label: 'Stories' },
  { key: 'garageType', label: 'Garage Type' },
  { key: 'garageSpaces', label: 'Garage Spaces' },
  { key: 'roofType', label: 'Roof Type' },
  { key: 'exteriorConstruction', label: 'Exterior Construction' },
  { key: 'foundationType', label: 'Foundation' },
  { key: 'heatingType', label: 'Heating' },
  { key: 'coolingType', label: 'Cooling' },
  { key: 'assessedValue', label: 'Assessed Value', currencyKey: 'assessedValueCurrency' },
  { key: 'propertyTaxAnnual', label: 'Annual Property Tax', currencyKey: 'propertyTaxCurrency' },
  { key: 'lastSaleDate', label: 'Last Sale Date' },
  { key: 'lastSalePrice', label: 'Last Sale Price', currencyKey: 'lastSalePriceCurrency' },
  { key: 'ownerOnRecord', label: 'Owner on Record (Public Records)' },
  { key: 'floodZone', label: 'Flood Zone' },
  { key: 'hazardSummary', label: 'Hazard Summary' },
  { key: 'footprintAreaValue', label: 'Building Footprint', unitKey: 'footprintAreaUnit' },
];

/** The web getLookupResultView messages for outcomes that have nothing to review. */
export function lookupMessage(r: PropertyLookupResult): string | null {
  if ((r.status === 'full' || r.status === 'partial') && r.fields && Object.keys(r.fields).length) return null;
  if (r.status === 'no_match') return 'No public-record match was found for this address. You can continue with manual entry.';
  if (r.status === 'ambiguous') return 'Multiple property records matched this address -- please try a more specific address.';
  if (r.status === 'not_eligible')
    return r.reason === 'country_not_supported'
      ? 'Detailed property records are only available for U.S. addresses. You can continue with manual entry.'
      : 'Property records need a confirmed, complete U.S. address (street, city and ZIP code). Please re-confirm the address above.';
  return 'No property details were returned for this address. You can try again or continue with manual entry.';
}

const show = (v: unknown) => (v == null || v === '' ? '' : String(v));

/** Web PropertyIntelligenceModal (Section 3): look up public-record details for the confirmed address, choose which
 * fields to confirm (editing any value records a user override), then save. Informational only. */
export function PropertyIntelligenceSheet({ reportId, onClose, onSaved }: { reportId: string; onClose: () => void; onSaved: () => void }) {
  const theme = useTheme();
  const current = useApiResource(() => documentsApi.getPropertyIntelligence(reportId).then((r) => r.propertyIntelligence), [reportId]);
  const [result, setResult] = useState<PropertyLookupResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'lookup' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const existing = current.data;
  const confirmed = existing?.status === 'confirmed';
  const stale = existing?.status === 'stale';

  const lookup = async () => {
    setBusy('lookup');
    setError(null);
    try {
      const res = await documentsApi.lookupPropertyIntelligence(reportId, confirmed || stale);
      setResult(res);
      setSelected(new Set(Object.keys(res.fields ?? {}).filter((k) => res.fields![k]?.value != null && res.fields![k]?.value !== '')));
      setEdits({});
    } catch (err) {
      setError(apiErrorMessage(err, 'Property details could not be looked up.'));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!result?.lookupId) return;
    setBusy('save');
    setError(null);
    try {
      const overrides: Record<string, string> = {};
      for (const [k, v] of Object.entries(edits)) if (v !== show(result.fields?.[k]?.value)) overrides[k] = v;
      await documentsApi.confirmPropertyIntelligence(reportId, {
        mode: 'provider_confirmed',
        lookupId: result.lookupId,
        selectedKeys: [...selected],
        ...(Object.keys(overrides).length ? { overrides } : {}),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save the property details.'));
    } finally {
      setBusy(null);
    }
  };

  const message = result ? lookupMessage(result) : null;
  const disclaimer =
    result?.disclaimers?.[0] ??
    existing?.disclaimers?.[0] ??
    "Property data shown here is informational public-record data from a third-party source — not a coverage determination, appraisal, title report, flood certification, or legal verification, and does not replace the licensed adjuster's own review.";

  return (
    <DocSheet title="Property Details (Section 3)" error={error} onClose={onClose} dirty={!!result && !message}>
      <View style={styles.row}>
        {confirmed ? <Badge label="Confirmed" tone="success" /> : null}
        {stale ? <Badge label="Recheck recommended" tone="warning" /> : null}
      </View>
      {existing?.fields && Object.keys(existing.fields).length && !result ? (
        <>
          <SectionLabel>Saved property details</SectionLabel>
          {PROPERTY_FIELDS.filter((f) => existing.fields?.[f.key]?.value != null && existing.fields?.[f.key]?.value !== '').map((f) => (
            <View key={f.key} style={[styles.kv, { borderBottomColor: theme.colors.border }]}>
              <ThemedText variant="caption" color="muted" style={styles.flex}>
                {f.label}
              </ThemedText>
              <ThemedText variant="body">
                {show(existing.fields?.[f.key]?.value)} {f.unitKey ? show(existing.fields?.[f.unitKey]?.value) : ''}
              </ThemedText>
            </View>
          ))}
        </>
      ) : null}
      <View style={styles.mt}>
        <PrimaryButton icon="search" label={confirmed || stale ? 'Re-check property details' : 'Look up property details'} onPress={lookup} loading={busy === 'lookup'} disabled={!!busy} />
      </View>
      {message ? (
        <ThemedText variant="body" color="muted" style={styles.mt}>
          {message}
        </ThemedText>
      ) : null}
      {result && !message ? (
        <>
          <SectionLabel>Select fields to confirm</SectionLabel>
          {PROPERTY_FIELDS.filter((f) => result.fields?.[f.key]).map((f) => {
            const on = selected.has(f.key);
            return (
              <View key={f.key} style={[styles.pick, { borderColor: on ? theme.colors.primary : theme.colors.border }]}>
                <Pressable
                  onPress={() => setSelected((s) => { const n = new Set(s); if (n.has(f.key)) n.delete(f.key); else n.add(f.key); return n; })}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={f.label}
                  style={styles.check}
                >
                  <Icon name={on ? 'check-square' : 'square'} color={on ? theme.colors.primary : theme.colors.muted} />
                </Pressable>
                <View style={styles.flex}>
                  <ThemedText variant="caption" color="muted">
                    {f.label}
                    {f.unitKey && result.fields?.[f.unitKey] ? ` (${show(result.fields[f.unitKey].value)})` : ''}
                  </ThemedText>
                  <TextInput
                    value={edits[f.key] ?? show(result.fields?.[f.key]?.value)}
                    onChangeText={(v) => setEdits((e) => ({ ...e, [f.key]: v }))}
                    accessibilityLabel={`${f.label} value`}
                    style={[styles.input, { color: theme.colors.ink, borderColor: theme.colors.border }]}
                  />
                </View>
              </View>
            );
          })}
          <Disclaimer text={disclaimer} />
          <PrimaryButton icon="check" label="Confirm selected fields" onPress={save} loading={busy === 'save'} disabled={!!busy || selected.size === 0} />
        </>
      ) : (
        <Disclaimer text={disclaimer} />
      )}
    </DocSheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  mt: { marginTop: 12 },
  kv: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  flex: { flex: 1 },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, padding: 8, marginBottom: 8 },
  check: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, minHeight: 40, marginTop: 4 },
});
