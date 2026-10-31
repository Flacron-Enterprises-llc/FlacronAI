import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { apiErrorMessage, useApiResource } from '@/hooks/useApiResource';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { documentsApi } from '@/services/api/documents';
import { REVIEWED_STATUSES, reportsApi, type Report } from '@/services/api/reports';
import { useTheme } from '@/theme';
import { coverageTotals, money, todayIso, type DepreciationRow, type Determination, type EstimateLine } from './documentCalcs';
import { DocSheet, Disclaimer, Field, NumField, RowCard, SectionLabel, TotalsBox, TwoCol } from './formKit';

const str = (v: unknown, d = '') => (v == null ? d : String(v));
const DETERMINATIONS: Determination[] = ['approved', 'denied', 'pending'];

interface Item {
  item: string;
  determination: Determination;
  policyBasis: string;
  relatedLineItemCodes: string[];
  pendingNote: string;
}

/** Web CoverageLetterModal. Every decision and policy basis is entered by the adjuster of record; payment figures are
 * computed from items marked Approved against the linked, approved Repair Estimate. Create on a reviewed base report;
 * revise on the letter itself. */
export function CoverageLetterSheet({ doc, mode, onClose, onSaved }: { doc: Report; mode: 'create' | 'revise'; onClose: () => void; onSaved: (r: Report) => void }) {
  const theme = useTheme();
  const letter = mode === 'revise' ? doc : null;
  const estimates = useApiResource(
    () =>
      mode === 'create'
        ? reportsApi.list({ relatedReportId: doc.id, documentType: 'RepairEstimate', limit: 100 }).then((r) => r.data.filter((e) => (REVIEWED_STATUSES as readonly string[]).includes(e.status)))
        : Promise.resolve([] as Report[]),
    [doc.id, mode]
  );
  const [estimateId, setEstimateId] = useState<string | null>(null);
  const chosen = mode === 'create' ? (estimates.data ?? []).find((e) => e.id === (estimateId ?? (estimates.data?.length === 1 ? estimates.data[0].id : null))) : null;
  const lines = ((mode === 'revise' ? letter?.estimateLineItemsSnapshot : chosen?.lineItems) as EstimateLine[] | undefined) ?? [];
  const deps = ((mode === 'revise' ? letter?.estimateDepreciationScheduleSnapshot : chosen?.depreciationSchedule) as DepreciationRow[] | undefined) ?? [];
  const codes = lines.map((l) => l.code);

  const a = (letter?.addressee ?? {}) as { name?: string; address?: string };
  const adj = (letter?.adjusterOfRecord ?? {}) as { name?: string; title?: string; phone?: string; email?: string };
  const ded = (letter?.deductible ?? {}) as { description?: string; amount?: number };
  const [f, setF] = useState({
    addresseeName: str(a.name, doc.insuredName),
    addresseeAddress: str(a.address, doc.propertyAddress),
    letterDate: str(letter?.letterDate, todayIso()),
    determinationSummary: str(letter?.determinationSummary),
    adjName: str(adj.name),
    adjTitle: str(adj.title),
    adjPhone: str(adj.phone),
    adjEmail: str(adj.email),
    deductibleDescription: str(ded.description),
    deductibleAmount: str(ded.amount, '0'),
    changeSummary: '',
  });
  const [limits, setLimits] = useState<{ coverageType: string; description: string; limit: string }[]>(
    ((letter?.coverageLimits as Record<string, unknown>[]) ?? [{ coverageType: '', description: '', limit: '0' }]).map((l) => ({ coverageType: str(l.coverageType), description: str(l.description), limit: str(l.limit, '0') }))
  );
  const [items, setItems] = useState<Item[]>(
    ((letter?.perItemDetermination as Record<string, unknown>[]) ?? [{ item: '', determination: 'approved', policyBasis: '', relatedLineItemCodes: [] }]).map((i) => ({
      item: str(i.item),
      determination: (i.determination as Determination) ?? 'approved',
      policyBasis: str(i.policyBasis),
      relatedLineItemCodes: (i.relatedLineItemCodes as string[]) ?? [],
      pendingNote: str(i.pendingNote),
    }))
  );
  const [steps, setSteps] = useState<{ heading: string; text: string }[]>(
    ((letter?.rightsAndNextSteps as Record<string, unknown>[]) ?? [{ heading: '', text: '' }]).map((s) => ({ heading: str(s.heading), text: str(s.text) }))
  );
  const [enclosures, setEnclosures] = useState<string[]>((letter?.enclosures as string[]) ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => {
    setDirty(true);
    setF((s) => ({ ...s, [k]: v }));
  };
  const upd = <T,>(setter: (fn: (xs: T[]) => T[]) => void, i: number, patch: Partial<T>) => {
    setDirty(true);
    setter((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  };
  const totals = coverageTotals(lines, deps, items, f.deductibleAmount);

  const save = async () => {
    if (mode === 'create' && !chosen) return setError('Choose an approved Repair Estimate.');
    if (mode === 'revise' && !f.changeSummary.trim()) return setError('Describe what changed in this revision.');
    setBusy(true);
    setError(null);
    const body = {
      ...(mode === 'create' ? { estimateId: chosen!.id } : { changeSummary: f.changeSummary.trim() }),
      addressee: { name: f.addresseeName.trim(), address: f.addresseeAddress.trim() },
      adjusterOfRecord: { name: f.adjName.trim(), title: f.adjTitle.trim(), phone: f.adjPhone.trim(), email: f.adjEmail.trim() },
      letterDate: f.letterDate.trim(),
      determinationSummary: f.determinationSummary.trim(),
      deductible: { description: f.deductibleDescription.trim(), amount: Number(f.deductibleAmount) || 0 },
      coverageLimits: limits.map((l) => ({ coverageType: l.coverageType.trim(), description: l.description.trim(), limit: Number(l.limit) || 0 })),
      perItemDetermination: items.map((i) => ({
        item: i.item.trim(),
        determination: i.determination,
        policyBasis: i.policyBasis.trim(),
        relatedLineItemCodes: i.determination === 'approved' ? i.relatedLineItemCodes.filter((c) => codes.includes(c)) : [],
        ...(i.determination === 'pending' ? { pendingNote: i.pendingNote.trim() } : {}),
      })),
      rightsAndNextSteps: steps.map((s) => ({ heading: s.heading.trim(), text: s.text.trim() })),
      enclosures: enclosures.map((e) => e.trim()).filter(Boolean),
    };
    try {
      const res = mode === 'revise' ? await documentsApi.reviseCoverageLetter(doc.id, body) : await documentsApi.createCoverageLetter(doc.id, body);
      onSaved(res.report);
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save the letter.'));
    } finally {
      setBusy(false);
    }
  };

  const chip = (on: boolean) => [styles.chip, { borderColor: on ? theme.colors.primary : theme.colors.border, backgroundColor: on ? theme.colors.primarySoft : theme.colors.background }];

  return (
    <DocSheet
      title={mode === 'revise' ? `Revise Coverage Letter (Rev. ${Number(letter?.revision ?? 0) + 1})` : 'Coverage Determination Letter'}
      subtitle={`Claim ${doc.claimNumber}`}
      dirty={dirty}
      error={error}
      busy={busy}
      primaryLabel={mode === 'revise' ? 'Save Revision' : 'Generate Letter'}
      primaryDisabled={mode === 'create' && !chosen}
      onPrimary={save}
      onClose={onClose}
    >
      <Disclaimer text={'Every coverage decision, policy basis, and rights/next-steps entry below is entered by you, the licensed adjuster of record — FlacronAI never drafts or suggests any of it. Payment figures are calculated automatically from items marked "Approved". Jurisdiction-specific wording has not been reviewed by legal/compliance counsel — confirm that review before production use.'} />
      {mode === 'create' ? (
        <>
          <SectionLabel>Linked repair estimate</SectionLabel>
          {estimates.loading ? (
            <ThemedText variant="body" color="muted">
              Loading approved estimates…
            </ThemedText>
          ) : (estimates.data ?? []).length === 0 ? (
            <ThemedText variant="body" color="muted">
              No finalized (approved) Repair Estimate is linked to this report. Create and approve one first.
            </ThemedText>
          ) : (
            (estimates.data ?? []).map((e) => {
              const on = chosen?.id === e.id;
              const totalsE = (e.totals ?? {}) as { grandTotal?: number };
              return (
                <Pressable key={e.id} onPress={() => setEstimateId(e.id)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[...chip(on), styles.option]}>
                  <ThemedText variant="body">
                    {str(e.estimateNumber)} · Rev. {str(e.revision, '0')} · {money(totalsE.grandTotal)}
                  </ThemedText>
                </Pressable>
              );
            })
          )}
        </>
      ) : null}

      <SectionLabel>Addressee</SectionLabel>
      <Field label="Name *" value={f.addresseeName} onChangeText={set('addresseeName')} maxLength={150} />
      <Field label="Address *" value={f.addresseeAddress} onChangeText={set('addresseeAddress')} maxLength={300} multiline />
      <TwoCol>
        <Field label="Letter date *" value={f.letterDate} onChangeText={set('letterDate')} placeholder="YYYY-MM-DD" maxLength={10} />
        <Field label="Determination summary *" value={f.determinationSummary} onChangeText={set('determinationSummary')} placeholder="e.g. Partial Approval" maxLength={150} />
      </TwoCol>
      <SectionLabel>Adjuster of record</SectionLabel>
      <TwoCol>
        <Field label="Name *" value={f.adjName} onChangeText={set('adjName')} maxLength={150} />
        <Field label="Title *" value={f.adjTitle} onChangeText={set('adjTitle')} maxLength={150} />
      </TwoCol>
      <TwoCol>
        <Field label="Phone" value={f.adjPhone} onChangeText={set('adjPhone')} maxLength={40} keyboardType="phone-pad" />
        <Field label="Email" value={f.adjEmail} onChangeText={set('adjEmail')} maxLength={150} keyboardType="email-address" autoCapitalize="none" />
      </TwoCol>

      <SectionLabel>Applicable policy coverages</SectionLabel>
      {limits.map((l, i) => (
        <RowCard key={i} title={l.coverageType || `Coverage ${i + 1}`} onRemove={limits.length > 1 ? () => { setDirty(true); setLimits(limits.filter((_, j) => j !== i)); } : undefined}>
          <TwoCol>
            <Field label="Coverage type *" value={l.coverageType} maxLength={80} onChangeText={(v) => upd(setLimits, i, { coverageType: v })} />
            <NumField label="Limit" value={l.limit} onChangeText={(v) => upd(setLimits, i, { limit: v })} />
          </TwoCol>
          <Field label="Description *" value={l.description} maxLength={300} onChangeText={(v) => upd(setLimits, i, { description: v })} />
        </RowCard>
      ))}
      <PrimaryButton variant="secondary" icon="plus" label="Add coverage" disabled={limits.length >= 20} onPress={() => { setDirty(true); setLimits([...limits, { coverageType: '', description: '', limit: '0' }]); }} />
      <TwoCol>
        <Field label="Deductible description *" value={f.deductibleDescription} onChangeText={set('deductibleDescription')} maxLength={200} />
        <NumField label="Deductible amount" value={f.deductibleAmount} onChangeText={set('deductibleAmount')} />
      </TwoCol>

      <SectionLabel>Item-by-item determination</SectionLabel>
      {items.map((it, i) => (
        <RowCard key={i} title={it.item || `Item ${i + 1}`} onRemove={items.length > 1 ? () => { setDirty(true); setItems(items.filter((_, j) => j !== i)); } : undefined}>
          <Field label="Item *" value={it.item} maxLength={200} onChangeText={(v) => upd(setItems, i, { item: v })} />
          <View style={styles.chips}>
            {DETERMINATIONS.map((d) => (
              <Pressable key={d} onPress={() => upd(setItems, i, { determination: d })} accessibilityRole="radio" accessibilityState={{ selected: it.determination === d }} style={chip(it.determination === d)}>
                <ThemedText variant="caption">{d.charAt(0).toUpperCase() + d.slice(1)}</ThemedText>
              </Pressable>
            ))}
          </View>
          <Field label="Policy basis *" value={it.policyBasis} maxLength={500} multiline onChangeText={(v) => upd(setItems, i, { policyBasis: v })} />
          {it.determination === 'pending' ? (
            <Field label="Pending note *" value={it.pendingNote} maxLength={500} multiline onChangeText={(v) => upd(setItems, i, { pendingNote: v })} />
          ) : it.determination === 'approved' ? (
            <>
              <ThemedText variant="caption" color="muted">
                Estimate line items covered (at least one)
              </ThemedText>
              <View style={styles.chips}>
                {codes.map((c) => {
                  const on = it.relatedLineItemCodes.includes(c);
                  return (
                    <Pressable
                      key={c}
                      onPress={() => upd(setItems, i, { relatedLineItemCodes: on ? it.relatedLineItemCodes.filter((x) => x !== c) : [...it.relatedLineItemCodes, c] })}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      style={chip(on)}
                    >
                      <ThemedText variant="caption">{c}</ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}
        </RowCard>
      ))}
      <PrimaryButton variant="secondary" icon="plus" label="Add item" disabled={items.length >= 200} onPress={() => { setDirty(true); setItems([...items, { item: '', determination: 'approved', policyBasis: '', relatedLineItemCodes: [], pendingNote: '' }]); }} />
      <TotalsBox
        rows={[
          ['Approved RCV', money(totals.approvedRCV)],
          ['Deductible', `(${money(totals.deductible)})`],
          ['Recoverable depreciation withheld', `(${money(totals.recoverableDepreciationWithheld)})`],
          ['Initial Payment (ACV)', money(totals.initialPayment), true],
        ]}
        note={`${totals.approvedCount} approved · ${totals.deniedCount} denied · ${totals.pendingCount} pending. Preview only — the server recomputes.`}
      />

      <SectionLabel>Rights & next steps</SectionLabel>
      {steps.map((s, i) => (
        <RowCard key={i} title={s.heading || `Section ${i + 1}`} onRemove={steps.length > 1 ? () => { setDirty(true); setSteps(steps.filter((_, j) => j !== i)); } : undefined}>
          <Field label="Heading *" value={s.heading} maxLength={150} onChangeText={(v) => upd(setSteps, i, { heading: v })} />
          <Field label="Text *" value={s.text} maxLength={1000} multiline onChangeText={(v) => upd(setSteps, i, { text: v })} />
        </RowCard>
      ))}
      <PrimaryButton variant="secondary" icon="plus" label="Add section" disabled={steps.length >= 20} onPress={() => { setDirty(true); setSteps([...steps, { heading: '', text: '' }]); }} />
      <SectionLabel>Enclosures</SectionLabel>
      {enclosures.map((e, i) => (
        <RowCard key={i} title={`Enclosure ${i + 1}`} onRemove={() => { setDirty(true); setEnclosures(enclosures.filter((_, j) => j !== i)); }}>
          <Field label="Enclosure" value={e} maxLength={200} onChangeText={(v) => { setDirty(true); setEnclosures(enclosures.map((x, j) => (j === i ? v : x))); }} />
        </RowCard>
      ))}
      <PrimaryButton variant="secondary" icon="plus" label="Add enclosure" disabled={enclosures.length >= 20} onPress={() => { setDirty(true); setEnclosures([...enclosures, '']); }} />
      {mode === 'revise' ? <Field label="Change summary *" value={f.changeSummary} onChangeText={set('changeSummary')} maxLength={300} multiline /> : null}
    </DocSheet>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 6 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, minHeight: 36, justifyContent: 'center' },
  option: { borderRadius: 12, minHeight: 48, marginBottom: 8 },
});
