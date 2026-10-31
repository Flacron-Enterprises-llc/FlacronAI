import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { Badge, Card, Icon } from '@/components/ui';
import { apiErrorMessage, useApiResource } from '@/hooks/useApiResource';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { documentsApi } from '@/services/api/documents';
import { reportsApi, type Report } from '@/services/api/reports';
import { ApiRequestError } from '@/types/api';
import { useTheme } from '@/theme';
import {
  CANONICAL_CONFIDENCE_OPTIONS,
  CANONICAL_STATUS_OPTIONS,
  CANONICAL_UNIT_OPTIONS,
  buildCanonicalEstimatePayload,
  buildPriceSuggestionsRequestPayload,
  computeEstimatePreviewTotals,
  draftFromServerEstimate,
  emptyCanonicalLineItem,
  emptyLabeledAmount,
  lineUnitPrice,
  mergeProposedPricingIntoLineItems,
  reorderLineItems,
  validateCanonicalEstimateDraft,
  validatePriceSuggestionsRequest,
  type CanonicalDraft,
  type DraftAmount,
  type DraftLineItem,
  type PriceSuggestion,
  type ServerCanonicalEstimate,
} from './canonicalEstimate';
import { money } from './documentCalcs';
import { DocSheet, Disclaimer, Field, NumField, RowCard, SectionLabel, Toggle, TotalsBox, TwoCol } from './formKit';

type AmountKey = 'permits' | 'generalConditions' | 'manualAdjustments';
const AMOUNT_GROUPS: { key: AmountKey; label: string; taxableDefault: boolean }[] = [
  { key: 'permits', label: 'Permits', taxableDefault: false },
  { key: 'generalConditions', label: 'General Conditions', taxableDefault: true },
  { key: 'manualAdjustments', label: 'Manual Adjustments', taxableDefault: true },
];

function Chips({ options, value, onChange, disabled }: { options: readonly string[]; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const on = o === value;
        return (
          <Pressable
            key={o}
            disabled={disabled}
            onPress={() => onChange(o)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={[styles.chip, { borderColor: on ? theme.colors.primary : theme.colors.border, backgroundColor: on ? theme.colors.primarySoft : theme.colors.background }]}
          >
            <ThemedText variant="caption">{o}</ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Web CanonicalEstimateEditor ("Detailed Estimate (Section 7)") on the primary report. Read-only when the report is
 * finalized or the viewer can't edit. Saves send `baseRevision`; a REVISION_CONFLICT offers Discard & Reload. The
 * Flacron Engine pricing panel (Professional+) only proposes editable costs; nothing counts until applied and saved.
 */
export function DetailedEstimateSheet({ report, canEdit, onClose }: { report: Report; canEdit: boolean; onClose: () => void }) {
  const theme = useTheme();
  const readOnly = report.status === 'finalized' || !canEdit;
  const [server, setServer] = useState<ServerCanonicalEstimate | null>(null);
  const [draft, setDraft] = useState<CanonicalDraft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [changeSummary, setChangeSummary] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [priceTargets, setPriceTargets] = useState<Set<string>>(new Set());
  const profile = ((report.propertyProfile as { fields?: Record<string, { value?: unknown }> } | undefined)?.fields ?? {}) as Record<string, { value?: unknown }>;
  const [loc, setLoc] = useState({
    country: String(profile.countryCode?.value ?? profile.country?.value ?? ''),
    state: String(profile.stateCode?.value ?? profile.state?.value ?? ''),
    city: String(profile.city?.value ?? ''),
    postalCode: String(profile.postalCode?.value ?? ''),
  });
  const [pricing, setPricing] = useState<{ proposalId: string; items: PriceSuggestion[] } | null>(null);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [pricingBusy, setPricingBusy] = useState(false);
  const [pricingMsg, setPricingMsg] = useState<string | null>(null);
  const photos = useApiResource(() => reportsApi.getPhotos(report.id).then((r) => r.photos), [report.id]);

  const load = async () => {
    setLoadError(null);
    try {
      const res = await documentsApi.getCanonicalEstimate(report.id);
      setServer(res.estimate);
      setDraft(draftFromServerEstimate(res.estimate));
      setDirty(false);
      setConflict(false);
    } catch (err) {
      setLoadError(apiErrorMessage(err, 'Could not load the estimate.'));
    }
  };
  useEffect(() => {
    (async () => {
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.id]);

  if (!draft) {
    return (
      <DocSheet title="Detailed Estimate (Section 7)" error={loadError} primaryLabel={loadError ? 'Retry' : undefined} onPrimary={load} onClose={onClose}>
        {!loadError ? (
          <ThemedText variant="body" color="muted">
            Loading…
          </ThemedText>
        ) : null}
      </DocSheet>
    );
  }

  const change = (patch: Partial<CanonicalDraft>) => {
    setDirty(true);
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };
  const setLine = (i: number, patch: Partial<DraftLineItem>) => change({ lineItems: draft.lineItems.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const setAmount = (key: AmountKey, i: number, patch: Partial<DraftAmount>) => change({ [key]: draft[key].map((r, j) => (j === i ? { ...r, ...patch } : r)) } as Partial<CanonicalDraft>);
  const totals = computeEstimatePreviewTotals(draft);
  const serverTotals = (server?.totals ?? {}) as { grandTotal?: number };

  const save = async () => {
    const invalid = validateCanonicalEstimateDraft(draft.lineItems);
    if (invalid) return setError(invalid);
    setSaving(true);
    setError(null);
    try {
      const res = await documentsApi.saveCanonicalEstimate(report.id, buildCanonicalEstimatePayload(server, draft, changeSummary));
      setServer(res.estimate);
      setDraft(draftFromServerEstimate(res.estimate));
      setDirty(false);
      setChangeSummary('');
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'REVISION_CONFLICT') setConflict(true);
      setError(apiErrorMessage(err, 'Could not save the estimate.'));
    } finally {
      setSaving(false);
    }
  };

  const generatePricing = async (regenerate: boolean) => {
    const targets = draft.lineItems.filter((l) => priceTargets.has(l.id));
    const invalid = validatePriceSuggestionsRequest(loc, targets);
    if (invalid) return setPricingMsg(invalid);
    setPricingBusy(true);
    setPricingMsg(null);
    try {
      const res = await documentsApi.priceSuggestions(report.id, buildPriceSuggestionsRequestPayload(loc, draft.currency, targets, regenerate));
      setPricing({ proposalId: res.proposalId, items: res.items });
      setAccepted(new Set(res.items.map((i) => i.suggestionId)));
    } catch (err) {
      setPricingMsg(apiErrorMessage(err, 'Preliminary pricing is unavailable right now. You can still enter prices manually.'));
    } finally {
      setPricingBusy(false);
    }
  };

  const applyPricing = () => {
    if (!pricing) return;
    const res = mergeProposedPricingIntoLineItems(draft.lineItems, pricing.proposalId, pricing.items, [...accepted]);
    change({ lineItems: res.lineItems });
    setPricing(null);
    setPricingMsg(
      `${res.applied.length} item${res.applied.length === 1 ? '' : 's'} applied${res.skipped.length ? `, ${res.skipped.length} skipped (manual price override)` : ''}. Nothing is saved until you tap Save.`
    );
  };

  return (
    <DocSheet
      title="Detailed Estimate (Section 7)"
      subtitle={`${server ? `Revision ${server.revision}` : 'No estimate saved yet'} — Preliminary / Editable${readOnly ? ' · read-only' : ''}`}
      dirty={dirty}
      error={error}
      busy={saving}
      primaryLabel={readOnly ? undefined : 'Save Detailed Estimate'}
      onPrimary={save}
      onClose={onClose}
    >
      {conflict ? (
        <Card style={[styles.mb, { borderColor: theme.colors.warning }]}>
          <ThemedText variant="body">Someone else saved this estimate while you were editing.</ThemedText>
          <View style={styles.mt}>
            <PrimaryButton variant="secondary" icon="refresh-cw" label="Discard & Reload" onPress={load} />
          </View>
        </Card>
      ) : null}
      <Disclaimer text="Every figure here is entered manually or accepted from a preliminary suggestion, and computed automatically. FlacronAI's Super Intelligence never decides a dollar amount." />
      <TwoCol>
        <Field label="Currency" value={draft.currency} onChangeText={(v) => change({ currency: v })} maxLength={3} autoCapitalize="characters" editable={!readOnly} />
        <Field label="Location / region" value={draft.region} onChangeText={(v) => change({ region: v })} maxLength={200} editable={!readOnly} />
      </TwoCol>
      <TwoCol>
        <NumField label="O&P %" value={draft.overheadProfitPercent} onChangeText={(v) => change({ overheadProfitPercent: v })} editable={!readOnly} />
        <NumField label="Sales tax %" value={draft.taxRatePercent} onChangeText={(v) => change({ taxRatePercent: v })} editable={!readOnly} />
      </TwoCol>

      <SectionLabel>Line items</SectionLabel>
      {draft.lineItems.map((li, i) => {
        const expanded = open === li.id;
        const up = lineUnitPrice(li);
        return (
          <RowCard
            key={li.id}
            title={li.description || `Item ${i + 1}`}
            onRemove={
              !readOnly && draft.lineItems.length > 1
                ? () =>
                    Alert.alert('Remove this line item?', undefined, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: () => change({ lineItems: draft.lineItems.filter((x) => x.id !== li.id) }) },
                    ])
                : undefined
            }
          >
            <View style={styles.badges}>
              {li.pricingSource === 'ai_suggested' ? <Badge label="Flacron Engine priced" tone="brand" icon="zap" /> : null}
              {li.overrideActive ? <Badge label="Manual price override" tone="warning" /> : null}
              {li.evidencePhotoIds.length ? <Badge label={`${li.evidencePhotoIds.length} photo(s) linked`} tone="info" /> : null}
            </View>
            <TwoCol>
              <Field label="Room / area *" value={li.room} onChangeText={(v) => setLine(i, { room: v })} maxLength={100} editable={!readOnly} />
              <Field label="Category *" value={li.category} onChangeText={(v) => setLine(i, { category: v })} maxLength={60} editable={!readOnly} />
            </TwoCol>
            <Field label="Description *" value={li.description} onChangeText={(v) => setLine(i, { description: v })} maxLength={300} editable={!readOnly} />
            <TwoCol>
              <NumField label="Qty *" value={li.quantity} onChangeText={(v) => setLine(i, { quantity: v })} editable={!readOnly} />
              <NumField label="Material $" value={li.materialUnitCost} onChangeText={(v) => setLine(i, { materialUnitCost: v })} editable={!readOnly && !li.overrideActive} />
              <NumField label="Labor $" value={li.laborUnitCost} onChangeText={(v) => setLine(i, { laborUnitCost: v })} editable={!readOnly && !li.overrideActive} />
              <NumField label="Equipment $" value={li.equipmentUnitCost} onChangeText={(v) => setLine(i, { equipmentUnitCost: v })} editable={!readOnly && !li.overrideActive} />
            </TwoCol>
            <ThemedText variant="caption" color="muted">
              Unit
            </ThemedText>
            <Chips options={CANONICAL_UNIT_OPTIONS} value={li.unit} onChange={(v) => setLine(i, { unit: v })} disabled={readOnly} />
            <ThemedText variant="body" style={styles.mbs}>
              Unit price {money(up)} · Line total {money(up * (Number(li.quantity) || 0))}
            </ThemedText>
            <Toggle label="Taxable" value={li.taxable} onChange={(v) => setLine(i, { taxable: v })} disabled={readOnly} />
            {!readOnly ? (
              <Toggle
                label="Price this (Flacron Engine)"
                value={priceTargets.has(li.id)}
                onChange={(v) => setPriceTargets((s) => { const n = new Set(s); if (v) n.add(li.id); else n.delete(li.id); return n; })}
              />
            ) : null}
            <View style={styles.inline}>
              <Pressable onPress={() => setOpen(expanded ? null : li.id)} accessibilityRole="button" accessibilityState={{ expanded }} style={styles.link}>
                <ThemedText variant="body" color="primary">
                  {expanded ? 'Hide details' : 'Details'}
                </ThemedText>
              </Pressable>
              {!readOnly ? (
                <>
                  <Pressable onPress={() => change({ lineItems: reorderLineItems(draft.lineItems, i, -1) })} disabled={i === 0} accessibilityRole="button" accessibilityLabel="Move up" style={styles.iconBtn}>
                    <Icon name="arrow-up" color={i === 0 ? theme.colors.border : theme.colors.ink} />
                  </Pressable>
                  <Pressable onPress={() => change({ lineItems: reorderLineItems(draft.lineItems, i, 1) })} disabled={i === draft.lineItems.length - 1} accessibilityRole="button" accessibilityLabel="Move down" style={styles.iconBtn}>
                    <Icon name="arrow-down" color={i === draft.lineItems.length - 1 ? theme.colors.border : theme.colors.ink} />
                  </Pressable>
                </>
              ) : null}
            </View>
            {expanded ? (
              <>
                <TwoCol>
                  <Field label="Trade" value={li.trade} onChangeText={(v) => setLine(i, { trade: v })} maxLength={60} editable={!readOnly} />
                  <Field label="Repair action" value={li.repairAction} onChangeText={(v) => setLine(i, { repairAction: v })} maxLength={60} editable={!readOnly} />
                </TwoCol>
                <TwoCol>
                  <Field label="Material" value={li.material} onChangeText={(v) => setLine(i, { material: v })} maxLength={150} editable={!readOnly} />
                  <Field label="Damage type" value={li.damageType} onChangeText={(v) => setLine(i, { damageType: v })} maxLength={100} editable={!readOnly} />
                </TwoCol>
                <ThemedText variant="caption" color="muted">
                  Confidence
                </ThemedText>
                <Chips options={CANONICAL_CONFIDENCE_OPTIONS} value={li.confidence} onChange={(v) => setLine(i, { confidence: v })} disabled={readOnly} />
                <ThemedText variant="caption" color="muted">
                  Status
                </ThemedText>
                <Chips options={CANONICAL_STATUS_OPTIONS} value={li.lineStatus} onChange={(v) => setLine(i, { lineStatus: v })} disabled={readOnly} />
                <Field label="Assumptions" value={li.assumptions} onChangeText={(v) => setLine(i, { assumptions: v })} maxLength={500} multiline editable={!readOnly} />
                <Toggle label="Manually override unit price" value={li.overrideActive} onChange={(v) => setLine(i, { overrideActive: v })} disabled={readOnly} />
                {li.overrideActive ? (
                  <TwoCol>
                    <NumField label="Override unit price" value={li.unitPriceOverride} onChangeText={(v) => setLine(i, { unitPriceOverride: v })} editable={!readOnly} />
                    <Field label="Reason *" value={li.overrideReason} onChangeText={(v) => setLine(i, { overrideReason: v })} maxLength={300} editable={!readOnly} />
                  </TwoCol>
                ) : null}
                {(photos.data ?? []).length ? (
                  <>
                    <ThemedText variant="caption" color="muted">
                      Evidence photos
                    </ThemedText>
                    <View style={styles.chips}>
                      {(photos.data ?? []).map((p) => {
                        const on = li.evidencePhotoIds.includes(p.id);
                        return (
                          <Pressable
                            key={p.id}
                            disabled={readOnly || (!on && li.evidencePhotoIds.length >= 30)}
                            onPress={() => setLine(i, { evidencePhotoIds: on ? li.evidencePhotoIds.filter((x) => x !== p.id) : [...li.evidencePhotoIds, p.id] })}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: on }}
                            style={[styles.chip, { borderColor: on ? theme.colors.primary : theme.colors.border, backgroundColor: on ? theme.colors.primarySoft : theme.colors.background }]}
                          >
                            <ThemedText variant="caption" numberOfLines={1}>
                              {String(p.roomOrArea || p.fileName)}
                            </ThemedText>
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                ) : null}
              </>
            ) : null}
          </RowCard>
        );
      })}
      {!readOnly ? (
        <PrimaryButton variant="secondary" icon="plus" label="Add line item" disabled={draft.lineItems.length >= 500} onPress={() => change({ lineItems: [...draft.lineItems, emptyCanonicalLineItem()] })} />
      ) : null}

      {AMOUNT_GROUPS.map((g) => (
        <View key={g.key}>
          <SectionLabel>{g.label}</SectionLabel>
          {draft[g.key].map((r, i) => (
            <RowCard key={r.id} title={r.description || `${g.label} ${i + 1}`} onRemove={readOnly ? undefined : () => change({ [g.key]: draft[g.key].filter((x) => x.id !== r.id) } as Partial<CanonicalDraft>)}>
              <TwoCol>
                <Field label="Description *" value={r.description} onChangeText={(v) => setAmount(g.key, i, { description: v })} maxLength={300} editable={!readOnly} />
                <NumField label="Amount" value={r.amount} onChangeText={(v) => setAmount(g.key, i, { amount: v })} editable={!readOnly} />
              </TwoCol>
              <Toggle label="Taxable" value={r.taxable} onChange={(v) => setAmount(g.key, i, { taxable: v })} disabled={readOnly} />
            </RowCard>
          ))}
          {!readOnly ? (
            <PrimaryButton
              variant="secondary"
              icon="plus"
              label={`Add ${g.label.toLowerCase()}`}
              disabled={draft[g.key].length >= 50}
              onPress={() => change({ [g.key]: [...draft[g.key], emptyLabeledAmount(g.taxableDefault)] } as Partial<CanonicalDraft>)}
            />
          ) : null}
        </View>
      ))}

      <TotalsBox
        rows={[
          ['Line-Item Subtotal', money(totals.lineSubtotal)],
          ['Permits', money(totals.permitsTotal)],
          ['General Conditions', money(totals.gcTotal)],
          ['Adjustments', money(totals.adjTotal)],
          ['Direct Cost', money(totals.directCost)],
          [`O&P (${draft.overheadProfitPercent || 0}%)`, money(totals.op)],
          ['Taxable Basis (excludes O&P)', money(totals.taxableBasis)],
          [`Tax (${draft.taxRatePercent || 0}%)`, money(totals.tax)],
          ['Total Estimate', money(totals.grandTotal), true],
        ]}
        note={server ? `Last saved (Rev. ${server.revision}) authoritative total: ${money(serverTotals.grandTotal)}` : 'Preview only — the server computes the saved total.'}
      />

      {!readOnly ? (
        <>
          <SectionLabel>Preliminary pricing (Flacron Engine)</SectionLabel>
          <Disclaimer text="Suggests a preliminary, editable material/labor/equipment cost for the items you mark “Price this” — never a final price. Every suggestion must be reviewed and accepted before it counts toward the estimate. Available on Professional plans and above." />
          <TwoCol>
            <Field label="Country *" value={loc.country} onChangeText={(v) => setLoc({ ...loc, country: v })} maxLength={60} />
            <Field label="State" value={loc.state} onChangeText={(v) => setLoc({ ...loc, state: v })} maxLength={60} />
          </TwoCol>
          <TwoCol>
            <Field label="City" value={loc.city} onChangeText={(v) => setLoc({ ...loc, city: v })} maxLength={100} />
            <Field label="Postal code" value={loc.postalCode} onChangeText={(v) => setLoc({ ...loc, postalCode: v })} maxLength={20} />
          </TwoCol>
          <PrimaryButton
            variant="secondary"
            icon="zap"
            label={pricing ? 'Regenerate' : `Generate (${priceTargets.size} selected)`}
            loading={pricingBusy}
            onPress={() => generatePricing(!!pricing)}
          />
          {pricingMsg ? (
            <ThemedText variant="caption" accessibilityLiveRegion="polite" style={styles.mt}>
              {pricingMsg}
            </ThemedText>
          ) : null}
          {pricing ? (
            <Card style={styles.mt}>
              {pricing.items.map((s) => {
                const on = accepted.has(s.suggestionId);
                return (
                  <Pressable
                    key={s.suggestionId}
                    onPress={() => setAccepted((a) => { const n = new Set(a); if (n.has(s.suggestionId)) n.delete(s.suggestionId); else n.add(s.suggestionId); return n; })}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    style={styles.suggestion}
                  >
                    <Icon name={on ? 'check-square' : 'square'} color={on ? theme.colors.primary : theme.colors.muted} />
                    <View style={styles.flex}>
                      <ThemedText variant="body" numberOfLines={2}>
                        {s.description} · {s.room}
                      </ThemedText>
                      <ThemedText variant="caption" color="muted">
                        {money(s.materialUnitCost)} + {money(s.laborUnitCost)} + {money(s.equipmentUnitCost)} = {money(s.unitPrice)} · Line {money(s.lineTotal)} · Confidence {s.confidence}
                      </ThemedText>
                    </View>
                  </Pressable>
                );
              })}
              <View style={styles.actions}>
                <View style={styles.flex}>
                  <PrimaryButton variant="secondary" label="Cancel" onPress={() => setPricing(null)} />
                </View>
                <View style={styles.flex}>
                  <PrimaryButton label={`Apply ${accepted.size} Accepted`} onPress={applyPricing} disabled={!accepted.size} />
                </View>
              </View>
            </Card>
          ) : null}
          <SectionLabel>Save</SectionLabel>
          <Field label="Change summary (optional)" value={changeSummary} onChangeText={(v) => { setDirty(true); setChangeSummary(v); }} maxLength={300} multiline />
        </>
      ) : null}
    </DocSheet>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 6 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, minHeight: 34, justifyContent: 'center', maxWidth: 220 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  link: { minHeight: 44, justifyContent: 'center', marginRight: 'auto' },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  mb: { marginBottom: 12 },
  mbs: { marginBottom: 4 },
  mt: { marginTop: 10 },
  flex: { flex: 1 },
  suggestion: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
});
