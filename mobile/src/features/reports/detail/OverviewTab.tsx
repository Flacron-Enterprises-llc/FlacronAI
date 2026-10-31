import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { FormError } from '@/features/auth/components/FormError';
import type { Report, ReportPhotoRecord } from '@/services/api/reports';
import { hasStuckPhotos, type ReportActions } from '../reportActions';
import { StatusBadge } from '../components/StatusBadge';
import { ReportMarkdown } from '../markdown/ReportMarkdown';
import { AnalysisProgress } from './AnalysisProgress';
import { DocumentsPanel } from '../documents/DocumentsPanel';
import { injectSection3PropertyBlock, injectSection7Detail } from '../documents/displayContent';
import { documentsApi } from '@/services/api/documents';
import { useApiResource } from '@/hooks/useApiResource';
import { Icon } from '@/components/ui/Icon';

/** Photos `POST /generate` stored on the report but never analyzed — plan-limit demotions
 * (`capacityRejected`) and any other `failed` record. Exported for tests. */
export function excludedPhotos(report: Report): ReportPhotoRecord[] {
  return (report.photos ?? []).filter((p) => p.status === 'failed');
}

const REVIEW_STATUS_TEXT: Record<string, string> = {
  pending: 'Review requested — awaiting the reviewer.',
  approved: 'The reviewer approved this report.',
  changes_requested: 'The reviewer requested changes.',
  rejected: 'The reviewer rejected this report.',
};

interface OverviewTabProps {
  report: Report;
  actions: ReportActions;
  retryingAnalysis: boolean;
  actionError: string | null;
  onRetryAnalysis: () => void;
  onRespondToReview: () => void;
  onEdit: () => void;
  onSectionTools: () => void;
  onRequestReview: () => void;
  onChanged: () => void;
}

const FIELD_ROWS: [string, string][] = [
  ['claimNumber', 'Claim number'],
  ['insuredName', 'Insured'],
  ['propertyAddress', 'Property address'],
  ['claimType', 'Claim type'],
  ['lossType', 'Loss type'],
  ['lossDate', 'Date of loss'],
  ['reportType', 'Report type'],
  ['policyNumber', 'Policy number'],
  ['insuranceCompany', 'Insurance company'],
  ['inspectionDate', 'Inspection date'],
  ['inspectorName', 'Inspector'],
  ['templateName', 'Template'],
];

interface Signature {
  name?: string;
  title?: string;
  licenseNumber?: string;
  licenseState?: string;
  company?: string;
}

export function OverviewTab({ report, actions, retryingAnalysis, actionError, onRetryAnalysis, onRespondToReview, onEdit, onSectionTools, onRequestReview, onChanged }: OverviewTabProps) {
  const theme = useTheme();
  const excluded = excludedPhotos(report);
  const capacityExcluded = excluded.filter((p) => p.capacityRejected).length;
  const review = report.reviewRequest;
  const card = { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, borderRadius: theme.radii.card };
  const signature = (report.signature ?? null) as Signature | null;
  // Display-only, like the web preview: Section 7 detail + confirmed Section 3 property block.
  const detail = useApiResource(
    () => (report.documentType || !report.content ? Promise.resolve('') : documentsApi.getCanonicalEstimate(report.id).then((r) => r.detailMarkdown || '').catch(() => '')),
    [report.id, report.updatedAt]
  );
  const displayContent = injectSection3PropertyBlock(
    injectSection7Detail(report.content ?? '', detail.data),
    typeof report.propertySection3Markdown === 'string' ? report.propertySection3Markdown : null
  );

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <StatusBadge status={report.status} />
        <ThemedText variant="caption" color="muted">
          {report.imageCount ?? 0} photo{report.imageCount === 1 ? '' : 's'} · Updated {new Date(report.updatedAt || report.createdAt).toLocaleDateString()}
        </ThemedText>
      </View>

      {actions.isReviewed && (report.reviewedBy || signature?.name) ? (
        <View style={[styles.card, card, { borderColor: theme.colors.success + '66' }]}>
          <View style={styles.inline}>
            <Icon name="check-circle" color={theme.colors.success} />
            <ThemedText variant="body" style={{ color: theme.colors.success, fontFamily: theme.typography.fontFamily.bodySemiBold }}>
              Approved{report.reviewedAt ? ` on ${new Date(String(report.reviewedAt)).toLocaleDateString()}` : ''}
            </ThemedText>
          </View>
          <ThemedText variant="body" style={styles.cardTextTight}>
            {signature?.name || report.reviewedBy}
            {signature?.title ? `, ${signature.title}` : ''}
          </ThemedText>
          {signature?.licenseNumber ? (
            <ThemedText variant="caption" color="muted">
              License {signature.licenseNumber}
              {signature.licenseState ? ` (${signature.licenseState})` : ''}
              {signature.company ? ` · ${signature.company}` : ''}
            </ThemedText>
          ) : null}
        </View>
      ) : null}

      {report.status === 'failed' && (
        <View style={[styles.card, card, { borderColor: theme.colors.error }]}>
          <ThemedText variant="subtitle" style={{ color: theme.colors.error }}>
            Report generation failed
          </ThemedText>
          <ThemedText variant="body" style={styles.cardText}>
            {report.pipelineError || 'FLACRON ENGINE was unable to complete this report.'}
          </ThemedText>
          {actions.canRetryAnalysis ? (
            <PrimaryButton label="Retry analysis" onPress={onRetryAnalysis} loading={retryingAnalysis} />
          ) : (
            <ThemedText variant="caption" color="muted">
              Only the report owner can retry the analysis.
            </ThemedText>
          )}
        </View>
      )}

      {report.status !== 'failed' && actions.canRetryAnalysis && hasStuckPhotos(report) && (
        <View style={[styles.card, card, { borderColor: theme.colors.warning }]}>
          <ThemedText variant="body" style={styles.cardText}>
            Some photos still need attention — their analysis didn’t complete.
          </ThemedText>
          <PrimaryButton label="Retry photo analysis" onPress={onRetryAnalysis} loading={retryingAnalysis} variant="secondary" />
        </View>
      )}

      <FormError message={actionError} />

      {!!review && (
        <View style={[styles.card, card]}>
          <ThemedText variant="caption" color="muted">
            Review request
          </ThemedText>
          <ThemedText variant="body" style={styles.cardText}>
            {actions.canRespondToReview
              ? `${review.requestedByEmail || 'The owner'} asked you to review this report.`
              : review.status === 'pending' && review.reviewerEmail
                ? `Awaiting review from ${review.reviewerEmail}.`
                : REVIEW_STATUS_TEXT[review.status] || `Review status: ${review.status}`}
          </ThemedText>
          {!!review.notes && review.status !== 'pending' && (
            <ThemedText variant="caption" color="muted" style={styles.cardText}>
              Reviewer notes: {review.notes}
            </ThemedText>
          )}
          {actions.canRespondToReview && (
            <PrimaryButton label="Request changes or reject" onPress={onRespondToReview} variant="secondary" />
          )}
        </View>
      )}

      {excluded.length > 0 && (
        <View style={[styles.card, card, { borderColor: theme.colors.warning }]}>
          <ThemedText variant="body" style={{ color: theme.colors.warning }}>
            {excluded.length} photo{excluded.length === 1 ? ' was' : 's were'} not included in this report
            {capacityExcluded > 0 ? ` (${capacityExcluded} over your plan’s photo limit)` : ''}.
          </ThemedText>
        </View>
      )}

      <View style={[styles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, borderRadius: theme.radii.card }]}>
        {FIELD_ROWS.map(([key, label]) => {
          const value = report[key];
          if (!value) return null;
          return (
            <View key={key} style={styles.row}>
              <ThemedText variant="caption" color="muted">
                {label}
              </ThemedText>
              <ThemedText variant="body" style={styles.rowValue}>
                {String(value)}
              </ThemedText>
            </View>
          );
        })}
      </View>

      {report.status === 'failed' ? null : report.status === 'processing' ? (
        <AnalysisProgress reportId={report.id} />
      ) : (
        <>
          <DocumentsPanel report={report} isOwner={actions.isOwner} canEdit={actions.hasEditAccess} isReviewed={actions.isReviewed} onChanged={onChanged} />
          <View style={styles.contentHead}>
            <ThemedText variant="subtitle" accessibilityRole="header" style={styles.flex}>
              Report
            </ThemedText>
            {actions.canEdit ? (
              <PrimaryButton variant="secondary" icon="edit-2" label="Edit" onPress={onEdit} />
            ) : null}
          </View>
          {actions.canUseSectionTools || actions.canRequestReview ? (
            <View style={styles.toolRow}>
              {actions.canUseSectionTools ? (
                <View style={styles.flex}>
                  <PrimaryButton variant="secondary" icon="star" label="FLACRON Tools" onPress={onSectionTools} />
                </View>
              ) : null}
              {actions.canRequestReview ? (
                <View style={styles.flex}>
                  <PrimaryButton variant="secondary" icon="user-check" label="Request Review" onPress={onRequestReview} />
                </View>
              ) : null}
            </View>
          ) : null}
          <ThemedText variant="caption" color="muted" style={styles.disclaimer}>
            Super Intelligence draft for licensed-adjuster review — not a final professional determination.
          </ThemedText>
          <View style={[styles.card, card, styles.paper, { backgroundColor: theme.colors.background }]}>
            {report.content ? <ReportMarkdown content={displayContent} /> : <ThemedText variant="body">No content yet.</ThemedText>}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 32,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTextTight: { marginTop: 6 },
  contentHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  flex: { flex: 1 },
  toolRow: { flexDirection: 'row', gap: 10, marginBottom: 8, marginTop: 4 },
  paper: { paddingVertical: 18 },
  card: {
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
  },
  cardText: {
    marginTop: 4,
    marginBottom: 10,
  },
  row: {
    marginBottom: 10,
  },
  rowValue: {
    marginTop: 2,
  },
  disclaimer: {
    marginBottom: 10,
  },
});
