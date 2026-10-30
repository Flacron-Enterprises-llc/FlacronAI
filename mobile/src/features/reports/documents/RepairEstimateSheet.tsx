import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { apiErrorMessage } from '@/hooks/useApiResource';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { documentsApi } from '@/services/api/documents';
import type { Report } from '@/services/api/reports';
import { depreciationRow, estimateTotals, lineTotalCents, money, todayIso } from './documentCalcs';
import { DocSheet, Disclaimer, Field, NumField, RowCard, SectionLabel, Toggle, TotalsBox, TwoCol } from './formKit';

interface Line {
  code: string;
  description: string;
  qty: string;
  unit: string;
  unitPrice: string;
  taxable: boolean;
}
interface Dep {
  item: string;
  condition: string;
  ageYears: string;
  lifeExpectancyYears: string;
  depreciationPercent: string;
  relatedLineItemCodes: string[];
}

const str = (v: unknown, d = '') => (v == null ? d : String(v));

/** Web RepairEstimateModal: header, line items (code/description/qty/unit/unit price/taxable), O&P and sales tax,
 * depreciation schedule, live preview. `report` is the parent report when creating, or the estimate when revising. */
export function RepairEstimateSheet({ report, mode, onClose, onSaved }: { report: Report; mode: 'create' | 'revise'; onClose: () => void; onSaved: (doc: Report) => void }) {
  const theme = useTheme();
  const src = mode === 'revise' ? report : null;
  const [estimateNumber, setEstimateNumber] = useState(str(src?.estimateNumber, `EST-${report.claimNumber}-01`).slice(0, 40));
  const [estimateDate, setEstimateDate] = useState(str(src?.estimateDate, todayIso()));
  const [priceListBasis, setPriceListBasis] = useState(str(src?.priceListBasis));
  const [preparedWith, setPreparedWith] = useState(str(src?.preparedWith));
  const [taxBasis, setTaxBasis] = useState(str(src?.taxBasis));
  const [op, setOp] = useState(str(src?.overheadProfitPercent, '10'));
  const [tax, setTax] = useState(str(src?.taxRatePercent, '0'));
  const [lines, setLines] = useState<Line[]>(
    Array.isArray(src?.lineItems) && (src!.lineItems as unknown[]).length
      ? (src!.lineItems as Record<string, unknown>[]).map((l) => ({
          code: str(l.code),
          description: str(l.description),
          qty: str(l.qty, '1'),
          unit: str(l.unit, 'EA'),
          unitPrice: str(l.unitPrice, '0'),
          taxable: l.taxable !== false,
        }))
      : [{ code: '', description: '', qty: '1', unit: 'EA', unitPrice: '0', taxable: true }]
  );
  const [deps, setDeps] = useState<Dep[]>(
    Array.isArray(src?.depreciationSchedule)
      ? (src!.depreciationSchedule as Record<string, unknown>[]).map((d) => ({
          item: str(d.item),
          condition: str(d.condition),
          ageYears: str(d.ageYears, '0'),
          lifeExpectancyYears: str(d.lifeExpectancyYears, '1'),
          depreciationPercent: str(d.depreciationPercent, '0'),
          relatedLineItemCodes: (d.relatedLineItemCodes as string[]) ?? [],
        }))
      : []
  );
  const [changeSummary, setChangeSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const touch = <T,>(fn: (v: T) => void) => (v: T) => {
    setDirty(true);
    fn(v);
  };
  const setLine = (i: number, patch: Partial<Line>) => {
    setDirty(true);
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  };
  const setDep = (i: number, patch: Partial<Dep>) => {
    setDirty(true);
    setDeps((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  };
  const totals = estimateTotals(lines, op, tax);
  const codes = lines.map((l) => l.code.trim()).filter(Boolean);

  const save = async () => {
    if (mode === 'revise' && !changeSummary.trim()) return setError('Describe what changed in this revision.');
    if (new Set(codes).size !== codes.length) return setError('Line item codes must be unique.');
    setBusy(true);
    setError(null);
    const body = {
      estimateNumber: estimateNumber.trim(),
      estimateDate: estimateDate.trim(),
      priceListBasis: priceListBasis.trim(),
      preparedWith: preparedWith.trim(),
      taxBasis: taxBasis.trim(),
      overheadProfitPercent: Number(op),
      taxRatePercent: Number(tax),
      lineItems: lines.map((l) => ({
        code: l.code.trim(),
        description: l.description.trim(),
        qty: Number(l.qty),
        unit: l.unit.trim(),
        unitPrice: Number(l.unitPrice),
        taxable: l.taxable,
      })),
      depreciationSchedule: deps.map((d) => ({
        item: d.item.trim(),
        condition: d.condition.trim(),
        ageYears: Number(d.ageYears),
        lifeExpectancyYears: Number(d.lifeExpectancyYears),
        depreciationPercent: Number(d.depreciationPercent),
        relatedLineItemCodes: d.relatedLineItemCodes.filter((c) => codes.includes(c)),
      })),
      changeSummary: mode === 'revise' ? changeSummary.trim() : 'Initial estimate created',
    };
    try {
      const res = mode === 'revise' ? await documentsApi.reviseEstimate(report.id, body) : await documentsApi.createEstimate(report.id, body);
      onSaved(res.report);
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save the estimate.'));
    } finally {
      setBusy(false);
    }
  };

  const nextRev = Number(src?.revision ?? 0) + 1;
  return (
    <DocSheet
      title={mode === 'revise' ? `Revise Repair Estimate (Rev. ${nextRev})` : 'Generate Repair Estimate'}
      subtitle={`Claim ${report.claimNumber}`}
      dirty={dirty}
      error={error}
      busy={busy}
      primaryLabel={mode === 'revise' ? 'Save Revision' : 'Generate Repair Estimate'}
      onPrimary={save}
      onClose={onClose}
    >
      <Disclaimer text="Enter quantities, unit rates, and percentages — every dollar amount is calculated automatically. FlacronAI's Super Intelligence never generates or determines any dollar figure in this document." />
      <TwoCol>
        <Field label="Estimate number *" value={estimateNumber} onChangeText={touch(setEstimateNumber)} maxLength={40} />
        <Field label="Estimate date" value={estimateDate} onChangeText={touch(setEstimateDate)} placeholder="YYYY-MM-DD" maxLength={10} />
      </TwoCol>
      <TwoCol>
        <Field label="Price list basis" value={priceListBasis} onChangeText={touch(setPriceListBasis)} maxLength={200} />
        <Field label="Prepared with" value={preparedWith} onChangeText={touch(setPreparedWith)} maxLength={200} />
      </TwoCol>

      <SectionLabel>Line items</SectionLabel>
      {lines.map((l, i) => (
        <RowCard key={i} title={`Item ${i + 1}${l.code ? ` · ${l.code}` : ''}`} onRemove={lines.length > 1 ? () => touch(setLines)(lines.filter((_, j) => j !== i)) : undefined}>
          <TwoCol>
            <Field label="Code *" value={l.code} onChangeText={(v) => setLine(i, { code: v })} maxLength={20} autoCapitalize="characters" />
            <Field label="Unit *" value={l.unit} onChangeText={(v) => setLine(i, { unit: v })} maxLength={10} autoCapitalize="characters" />
          </TwoCol>
          <Field label="Description *" value={l.description} onChangeText={(v) => setLine(i, { description: v })} maxLength={200} />
          <TwoCol>
            <NumField label="Qty *" value={l.qty} onChangeText={(v) => setLine(i, { qty: v })} />
            <NumField label="Unit price *" value={l.unitPrice} onChangeText={(v) => setLine(i, { unitPrice: v })} />
          </TwoCol>
          <Toggle label="Taxable" value={l.taxable} onChange={(v) => setLine(i, { taxable: v })} />
          <ThemedText variant="caption" color="muted">
            Line total {money(lineTotalCents(l) / 100)}
          </ThemedText>
        </RowCard>
      ))}
      <PrimaryButton
        variant="secondary"
        icon="plus"
        label="Add line item"
        disabled={lines.length >= 200}
        onPress={() => touch(setLines)([...lines, { code: '', description: '', qty: '1', unit: 'EA', unitPrice: '0', taxable: true }])}
      />

      <SectionLabel>Overhead, profit & tax</SectionLabel>
      <TwoCol>
        <NumField label="O&P % *" value={op} onChangeText={touch(setOp)} />
        <NumField label="Sales tax % *" value={tax} onChangeText={touch(setTax)} />
      </TwoCol>
      <Field label="Tax basis" value={taxBasis} onChangeText={touch(setTaxBasis)} maxLength={200} />
      <TotalsBox
        rows={[
          ['Subtotal', money(totals.subtotal)],
          ['Overhead & Profit', money(totals.overheadProfit)],
          ['Sales Tax', money(totals.tax)],
          ['Total Estimate (Draft)', money(totals.grandTotal), true],
        ]}
        note="Preview only — the server recomputes every total when you save."
      />

      <SectionLabel>Depreciation schedule</SectionLabel>
      {deps.map((d, i) => {
        const calc = depreciationRow({ ...d, ageYears: Number(d.ageYears), lifeExpectancyYears: Number(d.lifeExpectancyYears), depreciationPercent: Number(d.depreciationPercent) }, lines);
        return (
          <RowCard key={i} title={d.item || `Row ${i + 1}`} onRemove={() => touch(setDeps)(deps.filter((_, j) => j !== i))}>
            <TwoCol>
              <Field label="Item *" value={d.item} onChangeText={(v) => setDep(i, { item: v })} maxLength={200} />
              <Field label="Condition *" value={d.condition} onChangeText={(v) => setDep(i, { condition: v })} maxLength={40} />
            </TwoCol>
            <TwoCol>
              <NumField label="Age (yrs)" value={d.ageYears} onChangeText={(v) => setDep(i, { ageYears: v })} />
              <NumField label="Life (yrs)" value={d.lifeExpectancyYears} onChangeText={(v) => setDep(i, { lifeExpectancyYears: v })} />
              <NumField label="Depreciation %" value={d.depreciationPercent} onChangeText={(v) => setDep(i, { depreciationPercent: v })} />
            </TwoCol>
            <ThemedText variant="caption" color="muted">
              Line item codes (RCV = sum of their line totals)
            </ThemedText>
            <View style={styles.chips}>
              {codes.map((c) => {
                const on = d.relatedLineItemCodes.includes(c);
                return (
                  <Pressable
                    key={c}
                    onPress={() => setDep(i, { relatedLineItemCodes: on ? d.relatedLineItemCodes.filter((x) => x !== c) : [...d.relatedLineItemCodes, c] })}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    style={[styles.chip, { borderColor: on ? theme.colors.primary : theme.colors.border, backgroundColor: on ? theme.colors.primarySoft : theme.colors.background }]}
                  >
                    <ThemedText variant="caption">{c}</ThemedText>
                  </Pressable>
                );
              })}
            </View>
            <ThemedText variant="caption" color="muted">
              RCV {money(calc.rcv)} · Depreciation {money(calc.depreciationAmount)} · ACV {money(calc.acv)}
            </ThemedText>
          </RowCard>
        );
      })}
      <PrimaryButton
        variant="secondary"
        icon="plus"
        label="Add depreciation row"
        disabled={deps.length >= 100}
        onPress={() => touch(setDeps)([...deps, { item: '', condition: '', ageYears: '0', lifeExpectancyYears: '1', depreciationPercent: '0', relatedLineItemCodes: [] }])}
      />

      {mode === 'revise' ? (
        <>
          <SectionLabel>Revision</SectionLabel>
          <Field label="Change summary *" value={changeSummary} onChangeText={touch(setChangeSummary)} maxLength={300} multiline />
          <ThemedText variant="caption" color="muted" style={styles.mb}>
            Saving a revision reopens the estimate as a draft that must be approved again.
          </ThemedText>
        </>
      ) : null}
    </DocSheet>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 6 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, minHeight: 36, justifyContent: 'center' },
  mb: { marginBottom: 12 },
});
