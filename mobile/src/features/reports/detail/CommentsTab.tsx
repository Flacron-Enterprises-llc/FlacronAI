import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { AuthTextInput } from '@/features/auth/components/AuthTextInput';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { useReportComments } from '../hooks/useReportComments';
import { LoadingState, StateMessage } from '../components/StateMessage';

export function CommentsTab({ reportId }: { reportId: string }) {
  const theme = useTheme();
  const { comments, loading, error, posting, retry, addComment, setResolved } = useReportComments(reportId);
  const [draft, setDraft] = useState('');

  if (loading) return <LoadingState label="Loading comments…" />;
  if (error && comments.length === 0) return <StateMessage title="Could not load comments" description={error} onRetry={retry} />;

  const handleSend = async () => {
    const text = draft;
    setDraft('');
    const ok = await addComment(text);
    if (!ok) setDraft(text); // preserve what was typed if the send failed
  };

  const topLevel = comments.filter((c) => !c.parentId);
  const repliesFor = (id: string) => comments.filter((c) => c.parentId === id);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={80}>
      <ScrollView contentContainerStyle={styles.content}>
        {topLevel.length === 0 && (
          <ThemedText variant="body" color="muted" style={styles.empty}>
            No comments yet.
          </ThemedText>
        )}
        {topLevel.map((comment) => (
          <View key={comment.id}>
            <View
              style={[
                styles.bubble,
                { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, borderRadius: theme.radii.card },
              ]}
            >
              <ThemedText variant="body">{comment.body}</ThemedText>
              <Pressable onPress={() => setResolved(comment.id, !comment.resolved)} style={styles.resolveBtn}>
                <ThemedText variant="caption" style={{ color: comment.resolved ? theme.colors.success : theme.colors.muted }}>
                  {comment.resolved ? '✓ Resolved' : 'Mark resolved'}
                </ThemedText>
              </Pressable>
            </View>
            {repliesFor(comment.id).map((reply) => (
              <View
                key={reply.id}
                style={[styles.bubble, styles.reply, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}
              >
                <ThemedText variant="body">{reply.body}</ThemedText>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>

      <View style={styles.composer}>
        <View style={styles.composerInput}>
          <AuthTextInput label="Add a comment" value={draft} onChangeText={setDraft} placeholder="Type a comment…" />
        </View>
        <PrimaryButton label="Send" onPress={handleSend} loading={posting} disabled={!draft.trim()} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    paddingBottom: 12,
  },
  empty: {
    textAlign: 'center',
    marginTop: 24,
  },
  bubble: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    padding: 12,
    marginBottom: 10,
  },
  reply: {
    marginLeft: 20,
  },
  resolveBtn: {
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  composer: {
    paddingTop: 8,
  },
  composerInput: {
    marginBottom: 4,
  },
});
