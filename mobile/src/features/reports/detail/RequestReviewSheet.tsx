import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ThemedText';
import { Icon } from '@/components/ui';
import { apiErrorMessage, useApiResource } from '@/hooks/useApiResource';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { FormError } from '@/features/auth/components/FormError';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { reportsApi, type ReviewRequest } from '@/services/api/reports';
import { ROLE_LABELS, teamsApi } from '@/services/api/teams';
import { useTheme } from '@/theme';

/** Web "Request Review" modal (ReportPreviewPage): pick an active teammate (from GET /teams/members, same filter as the
 * web — has an account, not you, not suspended), optional note, send. */
export function RequestReviewSheet({
  reportId,
  onClose,
  onRequested,
}: {
  reportId: string;
  onClose: () => void;
  onRequested: (reviewRequest: ReviewRequest) => void;
}) {
  const theme = useTheme();
  const { firebaseUser } = useAuth();
  const members = useApiResource(() => teamsApi.members().then((r) => r.members));
  const [selected, setSelected] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eligible = (members.data ?? []).filter((m) => m.userId && m.userId !== firebaseUser?.uid && m.status !== 'suspended');

  const send = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await reportsApi.requestReview(reportId, selected, notes.trim() || undefined);
      onRequested(res.reviewRequest);
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not request a review.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.fill, { backgroundColor: theme.colors.background }]}>
        <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
          <View style={styles.head}>
            <ThemedText variant="title" accessibilityRole="header" style={styles.fill}>
              Request Review
            </ThemedText>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} style={styles.close}>
              <Icon name="x" size={22} />
            </Pressable>
          </View>
          <ThemedText variant="body" color="muted" style={styles.mb}>
            Ask a teammate to review this draft. They can comment, review photos and approve it.
          </ThemedText>
          {members.loading ? (
            <ThemedText variant="body" color="muted">
              Loading team members…
            </ThemedText>
          ) : eligible.length === 0 ? (
            <ThemedText variant="body" color="muted" style={styles.mb}>
              No other active team members found. Team review is available on Enterprise organizations; your organization
              admin can invite reviewers.
            </ThemedText>
          ) : (
            eligible.map((m) => {
              const on = selected === m.userId;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => setSelected(m.userId as string)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  style={[
                    styles.option,
                    { borderColor: on ? theme.colors.primary : theme.colors.border, backgroundColor: on ? theme.colors.primarySoft : theme.colors.surface },
                  ]}
                >
                  <Icon name={on ? 'check-circle' : 'circle'} color={on ? theme.colors.primary : theme.colors.muted} />
                  <View style={styles.fill}>
                    <ThemedText variant="body" numberOfLines={1}>
                      {m.email}
                    </ThemedText>
                    <ThemedText variant="caption" color="muted">
                      {ROLE_LABELS[m.role] ?? m.role}
                    </ThemedText>
                  </View>
                </Pressable>
              );
            })
          )}
          <ThemedText variant="caption" color="muted" style={styles.label}>
            NOTES (OPTIONAL)
          </ThemedText>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            multiline
            maxLength={1000}
            accessibilityLabel="Notes for the reviewer"
            style={[styles.input, { color: theme.colors.ink, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
          />
          <FormError message={error} />
          <PrimaryButton icon="send" label="Send Request" onPress={send} loading={busy} disabled={!selected} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pad: { padding: 16, paddingBottom: 40 },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  mb: { marginBottom: 12 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  label: { letterSpacing: 0.6, fontFamily: 'Inter_600SemiBold', marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, minHeight: 90, padding: 10, textAlignVertical: 'top', marginBottom: 12 },
});
