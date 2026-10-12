import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { AuthTextInput } from '@/features/auth/components/AuthTextInput';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { FormError } from '@/features/auth/components/FormError';
import type { Report } from '@/services/api/reports';
import { SegmentedControl } from '../components/SegmentedControl';
import { MAX_REVIEW_NOTES, useReviewResponse, type ReviewDecision } from '../hooks/useReviewResponse';

interface ReviewResponseSheetProps {
  visible: boolean;
  report: Report;
  onClose: () => void;
  onResponded: (report: Report) => void;
}

const DECISIONS: { value: ReviewDecision; label: string }[] = [
  { value: 'changes_requested', label: 'Request changes' },
  { value: 'rejected', label: 'Reject' },
];

/** Sends the reviewer's decision back to the report owner. Approving instead goes through the
 * Approve & finalize attestation. */
export function ReviewResponseSheet({ visible, report, onClose, onResponded }: ReviewResponseSheetProps) {
  const theme = useTheme();
  const [decision, setDecision] = useState<ReviewDecision>('changes_requested');
  const [notes, setNotes] = useState('');
  const { respond, submitting, error, clearError } = useReviewResponse(report, (updated) => {
    onResponded(updated);
    setNotes('');
    onClose();
  });

  const handleSend = async () => {
    clearError();
    await respond(decision, notes);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.colors.background, borderTopLeftRadius: theme.radii.card, borderTopRightRadius: theme.radii.card },
          ]}
        >
          <ScrollView keyboardShouldPersistTaps="handled">
            <ThemedText variant="title" style={styles.title}>
              Respond to review request
            </ThemedText>
            <ThemedText variant="caption" color="muted" style={styles.subtitle}>
              {report.reviewRequest?.requestedByEmail
                ? `Requested by ${report.reviewRequest.requestedByEmail}. `
                : ''}
              To approve instead, close this and use Approve &amp; finalize.
            </ThemedText>

            <SegmentedControl options={DECISIONS} value={decision} onChange={setDecision} />

            <View style={styles.notes}>
              <AuthTextInput
                label={decision === 'changes_requested' ? 'What needs to change? (optional)' : 'Reason (optional)'}
                value={notes}
                onChangeText={(v) => setNotes(v.slice(0, MAX_REVIEW_NOTES))}
                multiline
                numberOfLines={4}
              />
              <ThemedText variant="caption" color="muted">
                {notes.length}/{MAX_REVIEW_NOTES}
              </ThemedText>
            </View>

            <FormError message={error} />

            <View style={styles.actions}>
              <View style={styles.actionBtn}>
                <PrimaryButton label="Cancel" onPress={onClose} variant="secondary" disabled={submitting} />
              </View>
              <View style={styles.actionBtn}>
                <PrimaryButton label="Send response" onPress={handleSend} loading={submitting} />
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    maxHeight: '88%',
    padding: 20,
  },
  title: {
    marginBottom: 6,
  },
  subtitle: {
    marginBottom: 16,
  },
  notes: {
    marginTop: 16,
    marginBottom: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 24,
  },
  actionBtn: {
    flex: 1,
  },
});
