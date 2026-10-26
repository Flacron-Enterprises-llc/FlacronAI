import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { FormError } from '@/features/auth/components/FormError';
import type { Report, ReportPhotoRecord } from '@/services/api/reports';
import { hasStuckPhotos, type ReportActions } from '../reportActions';
import { StatusBadge } from '../components/StatusBadge';

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
}

const FIELD_ROWS: [string, string][] = [
  ['claimNumber', 'Claim number'],
  ['insuredName', 'Insured'],
  ['propertyAddress', 'Property address'],
  ['lossType', 'Loss type'],
  ['lossDate', 'Date of loss'],
  ['reportType', 'Report type'],
];

export function OverviewTab({ report, actions, retryingAnalysis, actionError, onRetryAnalysis, onRespondToReview }: OverviewTabProps) {
  const theme = useTheme();
  const excluded = excludedPhotos(report);
  const capacityExcluded = excluded.filter((p) => p.capacityRejected).length;
  const review = report.reviewRequest;
  const card = { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, borderRadius: theme.radii.card };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <StatusBadge status={report.status} />
      </View>

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
        <ThemedText variant="body" color="muted" style={styles.processing}>
          FlacronAI is still analyzing the uploaded photos and drafting this report. This usually takes a minute — this screen updates
          automatically.
        </ThemedText>
      ) : (
        <>
          <ThemedText variant="subtitle" style={styles.sectionTitle}>
            Draft content
          </ThemedText>
          <ThemedText variant="caption" color="muted" style={styles.disclaimer}>
            Super Intelligence draft for licensed-adjuster review — not a final professional determination.
          </ThemedText>
          <View style={[styles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, borderRadius: theme.radii.card }]}>
            <ThemedText variant="body">{report.content || 'No content yet.'}</ThemedText>
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
    marginBottom: 12,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth * 2,
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
  processing: {
    marginTop: 8,
  },
  sectionTitle: {
    marginBottom: 4,
  },
  disclaimer: {
    marginBottom: 10,
  },
});
