import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { Card } from '@/components/ui';
import { apiErrorMessage } from '@/hooks/useApiResource';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { documentsApi } from '@/services/api/documents';
import type { Report } from '@/services/api/reports';
import { useTheme } from '@/theme';
import { invoiceTotals, lineTotalCents, money, todayIso, type EstimateLine } from './documentCalcs';
import { DocSheet, Disclaimer, Field, NumField, RowCard, SectionLabel, TotalsBox, TwoCol } from './formKit';

const str = (v: unknown, d = '') => (v == null ? d : String(v));
const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

interface Payment {
  date: string;
  description: string;
  method: string;
  amount: string;
}
interface ChangeOrder {
  coNumber: string;
  description: string;
  amount: string;
}

/** Web InvoiceModal. Create: `doc` is the FINALIZED Repair Estimate. Revise: `doc` is the invoice. Services Rendered and
 * the O&P % are frozen from the estimate and can't be edited; the due date is always invoice date + 30 days. */
export function InvoiceSheet({ doc, mode, onClose, onSaved }: { doc: Report; mode: 'create' | 'revise'; onClose: () => void; onSaved: (r: Report) => void }) {
  const theme = useTheme();
  const inv = mode === 'revise' ? doc : null;
  const services = ((mode === 'revise' ? doc.servicesRendered : doc.lineItems) as EstimateLine[] | undefined) ?? [];
  const opPercent = Number(doc.overheadProfitPercent ?? 0);
  const billTo = (inv?.billTo ?? {}) as { name?: string; address?: string };
  const remitTo = (inv?.remitTo ?? {}) as { name?: string; instructions?: string };
  const [f, setF] = useState({
    billToName: str(billTo.name, doc.insuredName),
    billToAddress: str(billTo.address, doc.propertyAddress),
    invoiceNumber: str(inv?.invoiceNumber, `INV-${doc.claimNumber}-01`).slice(0, 40),
    invoiceDate: str(inv?.invoiceDate, todayIso()),
    jobNumber: str(inv?.jobNumber),
    taxRatePercent: str(inv?.taxRatePercent, '0'),
    paymentTerms: str(inv?.paymentTerms, 'Net 30 days from invoice date.'),
    warrantyText: str(inv?.warrantyText),
    remitName: str(remitTo.name),
    remitInstructions: str(remitTo.instructions),
    changeSummary: '',
  });
  const [payments, setPayments] = useState<Payment[]>(
    ((inv?.paymentHistory as Record<string, unknown>[]) ?? []).map((p) => ({ date: str(p.date), description: str(p.description), method: str(p.method), amount: str(p.amount) }))
  );
  const [cos, setCos] = useState<ChangeOrder[]>(
    ((inv?.changeOrderLog as Record<string, unknown>[]) ?? []).map((c) => ({ coNumber: str(c.coNumber), description: str(c.description), amount: str(c.amount) }))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => {
    setDirty(true);
    setF((s) => ({ ...s, [k]: v }));
  };
  const totals = invoiceTotals(services, opPercent, f.taxRatePercent, payments);

  const save = async () => {
    if (mode === 'revise' && !f.changeSummary.trim()) return setError('Describe what changed in this revision.');
    setBusy(true);
    setError(null);
    const body = {
      billTo: { name: f.billToName.trim(), address: f.billToAddress.trim() },
      remitTo: { name: f.remitName.trim(), instructions: f.remitInstructions.trim() },
      invoiceNumber: f.invoiceNumber.trim(),
      invoiceDate: f.invoiceDate.trim(),
      jobNumber: f.jobNumber.trim(),
      taxRatePercent: Number(f.taxRatePercent) || 0,
      paymentTerms: f.paymentTerms.trim(),
      warrantyText: f.warrantyText.trim(),
      paymentHistory: payments.map((p) => ({ date: p.date.trim(), description: p.description.trim(), method: p.method.trim(), amount: Number(p.amount) })),
      changeOrderLog: cos.map((c) => ({ coNumber: c.coNumber.trim(), description: c.description.trim(), amount: Number(c.amount) })),
      ...(mode === 'revise' ? { changeSummary: f.changeSummary.trim() } : {}),
    };
    try {
      const res = mode === 'revise' ? await documentsApi.reviseInvoice(doc.id, body) : await documentsApi.createInvoice(doc.id, body);
      onSaved(res.report);
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save the invoice.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DocSheet
      title={mode === 'revise' ? `Revise Invoice (Rev. ${Number(inv?.revision ?? 0) + 1})` : 'Generate Invoice'}
      subtitle={`Claim ${doc.claimNumber}`}
      dirty={dirty}
      error={error}
      busy={busy}
      primaryLabel={mode === 'revise' ? 'Save Revision' : 'Generate Invoice'}
      onPrimary={save}
      onClose={onClose}
    >
      <Disclaimer text="Services Rendered is reused from the linked Repair Estimate and cannot be edited here. FlacronAI's Super Intelligence never generates or determines any dollar figure in this document." />
      <SectionLabel>Bill to</SectionLabel>
      <Field label="Name *" value={f.billToName} onChangeText={set('billToName')} maxLength={150} />
      <Field label="Address *" value={f.billToAddress} onChangeText={set('billToAddress')} maxLength={300} multiline />
      <SectionLabel>Invoice details</SectionLabel>
      <TwoCol>
        <Field label="Invoice number *" value={f.invoiceNumber} onChangeText={set('invoiceNumber')} maxLength={40} />
        <Field label="Invoice date *" value={f.invoiceDate} onChangeText={set('invoiceDate')} placeholder="YYYY-MM-DD" maxLength={10} />
      </TwoCol>
      <TwoCol>
        <Field label="Due date (invoice date + 30 days)" value={addDays(f.invoiceDate, 30)} editable={false} />
        <Field label="Job number" value={f.jobNumber} onChangeText={set('jobNumber')} maxLength={40} />
      </TwoCol>

      <SectionLabel>Services rendered</SectionLabel>
      <Card padded={false}>
        {services.map((l, i) => (
          <View key={`${l.code}-${i}`} style={[styles.svc, { borderBottomColor: theme.colors.border }]}>
            <View style={styles.flex}>
              <ThemedText variant="body" numberOfLines={2}>
                {l.code} · {l.description}
              </ThemedText>
              <ThemedText variant="caption" color="muted">
                {l.qty} {l.unit} × {money(Number(l.unitPrice))}
              </ThemedText>
            </View>
            <ThemedText variant="body">{money(lineTotalCents(l) / 100)}</ThemedText>
          </View>
        ))}
      </Card>
      <NumField label="Sales tax %" value={f.taxRatePercent} onChangeText={set('taxRatePercent')} />
      <TotalsBox
        rows={[
          ['Services Subtotal', money(totals.servicesSubtotal)],
          [`O&P (${opPercent}%)`, money(totals.overheadProfit)],
          ['Combined Subtotal', money(totals.combinedSubtotal)],
          ['Sales Tax', money(totals.tax)],
          ['Payments Received', `(${money(totals.paymentsReceivedTotal)})`],
          ['Total Due', money(totals.balanceDue), true],
        ]}
        note="Preview only — the server recomputes every total."
      />

      <SectionLabel>Payment history</SectionLabel>
      {payments.map((p, i) => (
        <RowCard key={i} title={`Payment ${i + 1}`} onRemove={() => { setDirty(true); setPayments(payments.filter((_, j) => j !== i)); }}>
          <TwoCol>
            <Field label="Date *" value={p.date} placeholder="YYYY-MM-DD" maxLength={10} onChangeText={(v) => { setDirty(true); setPayments(payments.map((x, j) => (j === i ? { ...x, date: v } : x))); }} />
            <NumField label="Amount *" value={p.amount} onChangeText={(v) => { setDirty(true); setPayments(payments.map((x, j) => (j === i ? { ...x, amount: v } : x))); }} />
          </TwoCol>
          <TwoCol>
            <Field label="Description *" value={p.description} maxLength={200} onChangeText={(v) => { setDirty(true); setPayments(payments.map((x, j) => (j === i ? { ...x, description: v } : x))); }} />
            <Field label="Method *" value={p.method} maxLength={50} onChangeText={(v) => { setDirty(true); setPayments(payments.map((x, j) => (j === i ? { ...x, method: v } : x))); }} />
          </TwoCol>
        </RowCard>
      ))}
      <PrimaryButton variant="secondary" icon="plus" label="Add payment" disabled={payments.length >= 100} onPress={() => { setDirty(true); setPayments([...payments, { date: todayIso(), description: '', method: '', amount: '0' }]); }} />

      <SectionLabel>Change order log</SectionLabel>
      <ThemedText variant="caption" color="muted" style={styles.mb}>
        For reference only — change orders are not automatically added to the totals.
      </ThemedText>
      {cos.map((c, i) => (
        <RowCard key={i} title={c.coNumber || `Change order ${i + 1}`} onRemove={() => { setDirty(true); setCos(cos.filter((_, j) => j !== i)); }}>
          <TwoCol>
            <Field label="CO number *" value={c.coNumber} maxLength={20} onChangeText={(v) => { setDirty(true); setCos(cos.map((x, j) => (j === i ? { ...x, coNumber: v } : x))); }} />
            <NumField label="Amount" value={c.amount} onChangeText={(v) => { setDirty(true); setCos(cos.map((x, j) => (j === i ? { ...x, amount: v } : x))); }} />
          </TwoCol>
          <Field label="Description *" value={c.description} maxLength={200} onChangeText={(v) => { setDirty(true); setCos(cos.map((x, j) => (j === i ? { ...x, description: v } : x))); }} />
        </RowCard>
      ))}
      <PrimaryButton variant="secondary" icon="plus" label="Add change order" disabled={cos.length >= 50} onPress={() => { setDirty(true); setCos([...cos, { coNumber: '', description: '', amount: '0' }]); }} />

      <SectionLabel>Terms & remittance</SectionLabel>
      <Field label="Payment terms" value={f.paymentTerms} onChangeText={set('paymentTerms')} maxLength={500} multiline />
      <Field label="Warranty" value={f.warrantyText} onChangeText={set('warrantyText')} maxLength={1000} multiline />
      <Field label="Remit-to name *" value={f.remitName} onChangeText={set('remitName')} maxLength={150} />
      <Field label="Remittance instructions *" value={f.remitInstructions} onChangeText={set('remitInstructions')} maxLength={500} multiline />
      {mode === 'revise' ? <Field label="Change summary *" value={f.changeSummary} onChangeText={set('changeSummary')} maxLength={300} multiline /> : null}
    </DocSheet>
  );
}

const styles = StyleSheet.create({
  svc: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  flex: { flex: 1 },
  mb: { marginBottom: 8 },
});
