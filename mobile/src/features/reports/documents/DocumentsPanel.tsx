import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { Card, Icon, type IconName } from '@/components/ui';
import { useApiResource } from '@/hooks/useApiResource';
import { notifyReportsChanged } from '@/features/reports/reportsEvents';
import { StatusBadge } from '@/features/reports/components/StatusBadge';
import { reportsApi, type Report } from '@/services/api/reports';
import { useTheme } from '@/theme';
import { CoverageLetterSheet } from './CoverageLetterSheet';
import { DetailedEstimateSheet } from './DetailedEstimateSheet';
import { InvoiceSheet } from './InvoiceSheet';
import { MoldSupplementSheet } from './MoldSupplementSheet';
import { PropertyIntelligenceSheet } from './PropertyIntelligenceSheet';
import { RepairEstimateSheet } from './RepairEstimateSheet';
import { money } from './documentCalcs';

export const STRUCTURED_DOCUMENT_TYPES = ['RepairEstimate', 'Invoice', 'CoverageDeterminationLetter'];

const TYPE_LABEL: Record<string, string> = {
  RepairEstimate: 'Repair Estimate',
  Invoice: 'Invoice',
  CoverageDeterminationLetter: 'Coverage Determination Letter',
  MoldSupplement: 'Mold Assessment Supplement',
};

/** The web report header summary line for a derived document. */
export function documentSummary(r: Report): string | null {
  const t = (r.totals ?? {}) as Record<string, number>;
  const rev = `Rev. ${String(r.revision ?? 0)}`;
  switch (r.documentType) {
    case 'RepairEstimate':
      return `Repair Estimate ${String(r.estimateNumber ?? '')} · ${rev} · Total ${money(t.grandTotal)}`;
    case 'Invoice':
      return `Invoice ${String(r.invoiceNumber ?? '')} · ${rev} · Total Due ${money(t.balanceDue)}`;
    case 'CoverageDeterminationLetter':
      return `Coverage Determination Letter · ${rev} · Initial Payment (ACV) ${money(t.initialPayment)}`;
    case 'MoldSupplement':
      return `Mold Assessment Supplement — related claim ${String(r.relatedClaimId ?? r.claimNumber)}`;
    default:
      return null;
  }
}

type Sheet = 'estimate' | 'revise-estimate' | 'invoice' | 'revise-invoice' | 'letter' | 'revise-letter' | 'mold' | 'detailed' | 'property' | null;

interface Props {
  report: Report;
  isOwner: boolean;
  /** Owner (canEditReports) or review grantee — the server enforces team capabilities. */
  canEdit: boolean;
  isReviewed: boolean;
  onChanged: () => void;
}

/**
 * Web ReportPreviewPage document actions (2495–2724). Primary report: Repair Estimate + Mold Supplement (owner),
 * Coverage Letter (owner, once reviewed), Detailed Estimate (anyone; editable with edit access), Property Details
 * (edit access), plus the linked documents. Derived document: summary, link back, Revise (edit access) and — on an
 * estimate — Invoice (owner, locked until the estimate is approved). Hidden while the report is processing.
 */
export function DocumentsPanel({ report, isOwner, canEdit, isReviewed, onChanged }: Props) {
  const theme = useTheme();
  const router = useRouter();
  const [sheet, setSheet] = useState<Sheet>(null);
  const type = report.documentType as string | undefined;
  const busy = report.status === 'processing' || report.regenerating === true;
  const children = useApiResource(
    () => (isOwner && (!type || type === 'RepairEstimate') ? reportsApi.list({ relatedReportId: report.id, limit: 100 }).then((r) => r.data) : Promise.resolve([] as Report[])),
    [report.id, isOwner, type]
  );
  if (busy || report.status === 'archived') return null;

  const open = (r: Report) => {
    notifyReportsChanged();
    onChanged();
    router.push({ pathname: '/report/[id]', params: { id: r.id } });
  };
  const saved = () => {
    notifyReportsChanged();
    onChanged();
  };

  const actions: { icon: IconName; label: string; onPress: () => void; disabled?: boolean; note?: string }[] = [];
  if (!type) {
    if (isOwner) actions.push({ icon: 'dollar-sign', label: 'Repair Estimate', onPress: () => setSheet('estimate') });
    actions.push({ icon: 'list', label: 'Detailed Estimate (Section 7)', onPress: () => setSheet('detailed') });
    if (canEdit) actions.push({ icon: 'home', label: 'Property Details (Section 3)', onPress: () => setSheet('property') });
    if (isOwner && isReviewed) actions.push({ icon: 'mail', label: 'Coverage Letter', onPress: () => setSheet('letter') });
    if (isOwner) actions.push({ icon: 'droplet', label: 'Mold Supplement', onPress: () => setSheet('mold') });
  } else {
    if (canEdit && type === 'RepairEstimate') actions.push({ icon: 'edit-3', label: 'Revise Estimate', onPress: () => setSheet('revise-estimate') });
    if (canEdit && type === 'Invoice') actions.push({ icon: 'edit-3', label: 'Revise Invoice', onPress: () => setSheet('revise-invoice') });
    if (canEdit && type === 'CoverageDeterminationLetter') actions.push({ icon: 'edit-3', label: 'Revise Letter', onPress: () => setSheet('revise-letter') });
    if (isOwner && type === 'RepairEstimate')
      actions.push({
        icon: isReviewed ? 'file-plus' : 'lock',
        label: 'Invoice',
        onPress: () => setSheet('invoice'),
        disabled: !isReviewed,
        note: isReviewed ? undefined : 'Approve and finalize the Repair Estimate before generating an Invoice.',
      });
  }

  const summary = documentSummary(report);
  const linked = children.data ?? [];

  return (
    <View style={styles.wrap}>
      {summary ? (
        <Card style={styles.mb}>
          <ThemedText variant="body" style={{ fontFamily: theme.typography.fontFamily.bodySemiBold }}>
            {summary}
          </ThemedText>
          {report.relatedReportId ? (
            <Pressable onPress={() => router.push({ pathname: '/report/[id]', params: { id: String(report.relatedReportId) } })} accessibilityRole="link" style={styles.link}>
              <ThemedText variant="body" color="primary">
                {type === 'Invoice' ? 'View linked estimate' : 'View linked report'}
              </ThemedText>
            </Pressable>
          ) : null}
        </Card>
      ) : null}

      {actions.length ? (
        <>
          <ThemedText variant="subtitle" accessibilityRole="header" style={styles.mbs}>
            Documents
          </ThemedText>
          <View style={styles.grid}>
            {actions.map((a) => (
              <Pressable
                key={a.label}
                onPress={a.onPress}
                disabled={a.disabled}
                accessibilityRole="button"
                accessibilityState={{ disabled: !!a.disabled }}
                accessibilityHint={a.note}
                style={[styles.action, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, opacity: a.disabled ? 0.55 : 1 }]}
              >
                <Icon name={a.icon} color={theme.colors.primary} />
                <ThemedText variant="caption" style={styles.actionLabel}>
                  {a.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>
          {actions.find((a) => a.note) ? (
            <ThemedText variant="caption" color="muted" style={styles.mbs}>
              {actions.find((a) => a.note)?.note}
            </ThemedText>
          ) : null}
        </>
      ) : null}

      {linked.length ? (
        <>
          <ThemedText variant="subtitle" accessibilityRole="header" style={[styles.mbs, styles.mt]}>
            Linked documents
          </ThemedText>
          <Card padded={false} style={styles.mb}>
            {linked.map((d) => (
              <Pressable key={d.id} onPress={() => router.push({ pathname: '/report/[id]', params: { id: d.id } })} accessibilityRole="button" style={[styles.row, { borderBottomColor: theme.colors.border }]}>
                <View style={styles.flex}>
                  <ThemedText variant="body" numberOfLines={1}>
                    {TYPE_LABEL[String(d.documentType)] ?? 'Report'}
                  </ThemedText>
                  <ThemedText variant="caption" color="muted" numberOfLines={1}>
                    {documentSummary(d)}
                  </ThemedText>
                </View>
                <StatusBadge status={d.status} />
              </Pressable>
            ))}
          </Card>
        </>
      ) : null}

      {sheet === 'estimate' && <RepairEstimateSheet report={report} mode="create" onClose={() => setSheet(null)} onSaved={open} />}
      {sheet === 'revise-estimate' && <RepairEstimateSheet report={report} mode="revise" onClose={() => setSheet(null)} onSaved={saved} />}
      {sheet === 'invoice' && <InvoiceSheet doc={report} mode="create" onClose={() => setSheet(null)} onSaved={open} />}
      {sheet === 'revise-invoice' && <InvoiceSheet doc={report} mode="revise" onClose={() => setSheet(null)} onSaved={saved} />}
      {sheet === 'letter' && <CoverageLetterSheet doc={report} mode="create" onClose={() => setSheet(null)} onSaved={open} />}
      {sheet === 'revise-letter' && <CoverageLetterSheet doc={report} mode="revise" onClose={() => setSheet(null)} onSaved={saved} />}
      {sheet === 'mold' && <MoldSupplementSheet report={report} onClose={() => setSheet(null)} onCreated={open} />}
      {sheet === 'detailed' && <DetailedEstimateSheet report={report} canEdit={canEdit} onClose={() => { setSheet(null); onChanged(); }} />}
      {sheet === 'property' && <PropertyIntelligenceSheet reportId={report.id} onClose={() => setSheet(null)} onSaved={saved} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 8 },
  mb: { marginBottom: 12 },
  mbs: { marginBottom: 8 },
  mt: { marginTop: 8 },
  link: { minHeight: 44, justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  action: { flexBasis: '47%', flexGrow: 1, borderWidth: 1, borderRadius: 14, padding: 12, minHeight: 64, gap: 6 },
  actionLabel: { fontFamily: 'Inter_600SemiBold' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth },
  flex: { flex: 1 },
});
