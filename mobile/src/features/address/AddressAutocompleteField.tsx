import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { Badge, Card, Icon } from '@/components/ui';
import { apiErrorMessage, useApiResource } from '@/hooks/useApiResource';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { reportsApi, type AddressProfile } from '@/services/api/reports';
import { useTheme } from '@/theme';
import { fetchSuggestions, MIN_AUTOCOMPLETE_CHARS, newSessionToken, placesKey, type PlaceSuggestion } from './placesClient';

/** Wizard keys that carry a confirmed normalization to save on the report after Generate (never sent to /generate). */
export const NORM_TOKEN = '_normToken';
export const NORM_ORIGINAL = '_normOriginal';
export const NORM_OVERRIDES = '_normOverrides';

const EDITABLE: [string, string][] = [
  ['addressLine1', 'Street address'],
  ['addressLine2', 'Apt / suite'],
  ['city', 'City'],
  ['state', 'State'],
  ['postalCode', 'ZIP / postal code'],
  ['country', 'Country'],
];

interface Props {
  label: string;
  value: string;
  placeholder?: string;
  fields: Record<string, string>;
  setField: (key: string, value: string) => void;
}

/**
 * Web AddressAutocompleteField + PropertyProfileReview: suggestions after 3 characters (300 ms debounce, stale results
 * dropped, session token rotated after a pick); the pick is normalized by the server and shown for confirmation with
 * editable parts. Confirmed results are saved to the report after Generate. Falls back to plain typing whenever
 * Places or server normalization is unavailable.
 */
export function AddressAutocompleteField({ label, value, placeholder, fields, setField }: Props) {
  const theme = useTheme();
  const config = useApiResource(() => reportsApi.propertyLookupConfig());
  const autocomplete = !!placesKey() && config.data?.enabled !== false;
  const normalize = config.data?.serverNormalizationConfigured === true;
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [review, setReview] = useState<{ token: string; profile: AddressProfile; ambiguous: boolean; original: string } | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const session = useRef(newSessionToken());
  const seq = useRef(0);
  const skipNext = useRef(false);

  useEffect(() => {
    if (!autocomplete || !focused) return;
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const id = ++seq.current;
    const t = setTimeout(async () => {
      if (value.trim().length < MIN_AUTOCOMPLETE_CHARS) {
        setSuggestions([]);
        return;
      }
      setLoading(true);
      try {
        const list = await fetchSuggestions(value, session.current);
        if (id === seq.current) setSuggestions(list);
      } catch {
        if (id === seq.current) setSuggestions([]);
      } finally {
        if (id === seq.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [value, autocomplete, focused]);

  const clearNorm = () => {
    setField(NORM_TOKEN, '');
    setField(NORM_OVERRIDES, '');
  };

  const pick = async (s: PlaceSuggestion) => {
    skipNext.current = true;
    seq.current += 1;
    setSuggestions([]);
    setField('propertyAddress', s.text);
    session.current = newSessionToken();
    clearNorm();
    if (!normalize) return;
    setLoading(true);
    setNotice(null);
    try {
      const res = await reportsApi.normalizeAddress(s.placeId, s.text);
      setReview({ token: res.normalizationToken, profile: res.profile, ambiguous: res.ambiguous, original: s.text });
      setEdits({});
    } catch (err) {
      setNotice(`${apiErrorMessage(err, 'The address could not be verified.')} You can keep the address as typed.`);
    } finally {
      setLoading(false);
    }
  };

  const confirm = () => {
    if (!review) return;
    const f = review.profile.fields;
    const formatted = String(f.formattedAddress?.value ?? review.original);
    const overrides: Record<string, string> = {};
    for (const [k, v] of Object.entries(edits)) if (v !== String(f[k]?.value ?? '')) overrides[k] = v;
    const parts = (k: string) => overrides[k] ?? String(f[k]?.value ?? '');
    const display = Object.keys(overrides).length
      ? [parts('addressLine1'), parts('addressLine2'), parts('city'), [parts('state'), parts('postalCode')].filter(Boolean).join(' '), parts('country')].filter(Boolean).join(', ')
      : formatted;
    skipNext.current = true;
    setField('propertyAddress', display);
    setField(NORM_TOKEN, review.token);
    setField(NORM_ORIGINAL, review.original);
    setField(NORM_OVERRIDES, Object.keys(overrides).length ? JSON.stringify(overrides) : '');
    setReview(null);
    setNotice('Address confirmed. It will be saved with the report.');
  };

  return (
    <View style={styles.wrap}>
      <ThemedText variant="caption" color="muted" style={styles.label}>
        {label}
      </ThemedText>
      <View style={[styles.inputRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
        <Icon name="map-pin" color={theme.colors.muted} />
        <TextInput
          value={value}
          onChangeText={(v) => {
            setField('propertyAddress', v);
            if (fields[NORM_TOKEN]) clearNorm();
            setNotice(null);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.muted}
          accessibilityLabel={label}
          autoCorrect={false}
          style={[styles.input, { color: theme.colors.ink, fontFamily: theme.typography.fontFamily.body }]}
        />
        {loading ? <ActivityIndicator size="small" color={theme.colors.primary} /> : null}
        {fields[NORM_TOKEN] ? <Icon name="check-circle" color={theme.colors.success} /> : null}
      </View>
      {suggestions.length > 0 ? (
        <Card padded={false} style={styles.list}>
          {suggestions.map((s) => (
            <Pressable key={s.placeId} onPress={() => pick(s)} accessibilityRole="button" style={[styles.suggestion, { borderBottomColor: theme.colors.border }]}>
              <Icon name="map-pin" size={14} color={theme.colors.muted} />
              <ThemedText variant="body" style={styles.flex} numberOfLines={2}>
                {s.text}
              </ThemedText>
            </Pressable>
          ))}
          <ThemedText variant="caption" color="muted" style={styles.attrib}>
            Powered by Google
          </ThemedText>
        </Card>
      ) : null}
      {notice ? (
        <ThemedText variant="caption" color="muted" style={styles.notice}>
          {notice}
        </ThemedText>
      ) : null}
      {review ? (
        <Card style={styles.review}>
          <View style={styles.head}>
            <ThemedText variant="body" style={[styles.flex, { fontFamily: theme.typography.fontFamily.bodySemiBold }]}>
              {String(review.profile.fields.formattedAddress?.value ?? review.original)}
            </ThemedText>
            <Badge label={review.ambiguous ? 'Multiple matches' : 'Google-normalized'} tone={review.ambiguous ? 'warning' : 'info'} />
          </View>
          {review.original && review.original !== review.profile.fields.formattedAddress?.value ? (
            <ThemedText variant="caption" color="muted">
              Originally typed: {review.original}
            </ThemedText>
          ) : null}
          {EDITABLE.map(([k, l]) => (
            <View key={k} style={styles.field}>
              <ThemedText variant="caption" color="muted">
                {l}
              </ThemedText>
              <TextInput
                value={edits[k] ?? String(review.profile.fields[k]?.value ?? '')}
                onChangeText={(v) => setEdits((e) => ({ ...e, [k]: v }))}
                accessibilityLabel={l}
                style={[styles.small, { color: theme.colors.ink, borderColor: theme.colors.border }]}
              />
            </View>
          ))}
          <View style={styles.actions}>
            <View style={styles.flex}>
              <PrimaryButton variant="secondary" label="Use manual entry" onPress={() => { setReview(null); clearNorm(); }} />
            </View>
            <View style={styles.flex}>
              <PrimaryButton icon="check" label="Confirm address" onPress={confirm} />
            </View>
          </View>
        </Card>
      ) : null}
    </View>
  );
}

/** Wizard field → PUT /:id/property-profile body, or null when nothing was confirmed. */
export function propertyProfileFromFields(fields: Record<string, string>) {
  const token = fields[NORM_TOKEN];
  if (!token) return null;
  let overrides: Record<string, string> | undefined;
  try {
    overrides = fields[NORM_OVERRIDES] ? (JSON.parse(fields[NORM_OVERRIDES]) as Record<string, string>) : undefined;
  } catch {
    overrides = undefined;
  }
  return { mode: 'provider_confirmed' as const, normalizationToken: token, original: fields[NORM_ORIGINAL] || undefined, ...(overrides ? { overrides } : {}) };
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  label: { marginBottom: 4, fontFamily: 'Inter_500Medium' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 48 },
  input: { flex: 1, fontSize: 15, paddingVertical: 10 },
  list: { marginTop: 4 },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth },
  attrib: { padding: 8, textAlign: 'right' },
  notice: { marginTop: 6 },
  review: { marginTop: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  field: { marginTop: 8 },
  small: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, minHeight: 40, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  flex: { flex: 1 },
});
