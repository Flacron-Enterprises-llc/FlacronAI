import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { AuthTextInput } from '@/features/auth/components/AuthTextInput';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { useReportComments } from '../hooks/useReportComments';
import { LoadingState, StateMessage } from '../components/StateMessage';

export function CommentsTab({ reportId, canComment }: { reportId: string; canComment: boolean }) {
  const theme = useTheme();
  const { comments, loading, error, actionError, clearActionError, posting, retry, addComment, setResolved } = useReportComments(reportId);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; author: string } | null>(null);

  if (loading && comments.length === 0) return <LoadingState label="Loading comments…" />;
  if (error && comments.length === 0) return <StateMessage title="Could not load comments" description={error} onRetry={retry} />;

  const handleSend = async () => {
    const text = draft;
    const parent = replyTo;
    setDraft('');
    const ok = await addComment(text, parent?.id);
    if (!ok) setDraft(text); // preserve what was typed if the send failed
    else setReplyTo(null);
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
              <Meta comment={comment} />
              <ThemedText variant="body">{comment.body}</ThemedText>
              {canComment && !comment.resolved ? (
                <Pressable
                  onPress={() => setReplyTo({ id: comment.id, author: String(comment.authorName || 'comment') })}
                  style={styles.resolveBtn}
                  accessibilityRole="button"
                  hitSlop={8}
                >
                  <ThemedText variant="caption" color="primary">
                    Reply
                  </ThemedText>
                </Pressable>
              ) : null}
              {canComment ? (
                <Pressable onPress={() => setResolved(comment.id, !comment.resolved)} style={styles.resolveBtn} accessibilityRole="button">
                  <ThemedText variant="caption" style={{ color: comment.resolved ? theme.colors.success : theme.colors.muted }}>
                    {comment.resolved ? '✓ Resolved' : 'Mark resolved'}
                  </ThemedText>
                </Pressable>
              ) : (
                comment.resolved && (
                  <ThemedText variant="caption" style={[styles.resolveBtn, { color: theme.colors.success }]}>
                    ✓ Resolved
                  </ThemedText>
                )
              )}
            </View>
            {repliesFor(comment.id).map((reply) => (
              <View
                key={reply.id}
                style={[styles.bubble, styles.reply, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}
              >
                <Meta comment={reply} />
                <ThemedText variant="body">{reply.body}</ThemedText>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>

      {/* Post/resolve failures show here; the comment list above stays as it was. */}
      {!!actionError && (
        <Pressable
          onPress={clearActionError}
          accessibilityRole="button"
          style={[styles.banner, { backgroundColor: theme.colors.error + '1A', borderRadius: theme.radii.btn }]}
        >
          <ThemedText variant="caption" style={{ color: theme.colors.error }}>
            {actionError} Tap to dismiss.
          </ThemedText>
        </Pressable>
      )}

      {canComment ? (
        <View style={styles.composer}>
          {replyTo ? (
            <Pressable onPress={() => setReplyTo(null)} accessibilityRole="button" style={styles.replying}>
              <ThemedText variant="caption" color="muted">
                Replying to {replyTo.author} · Cancel
              </ThemedText>
            </Pressable>
          ) : null}
          <View style={styles.composerInput}>
            <AuthTextInput
              label={replyTo ? 'Reply' : 'Add a comment'}
              value={draft}
              onChangeText={setDraft}
              placeholder={replyTo ? 'Type a reply…' : 'Type a comment…'}
            />
          </View>
          <PrimaryButton label="Send" onPress={handleSend} loading={posting} disabled={!draft.trim()} />
        </View>
      ) : (
        <ThemedText variant="caption" color="muted" style={styles.composer}>
          You have view-only access, so you can’t add comments.
        </ThemedText>
      )}
    </KeyboardAvoidingView>
  );
}

function Meta({ comment }: { comment: { authorName?: unknown; authorEmail?: unknown; createdAt?: unknown } }) {
  const who = String(comment.authorName || comment.authorEmail || '');
  const when = typeof comment.createdAt === 'string' ? new Date(comment.createdAt).toLocaleString() : '';
  if (!who && !when) return null;
  return (
    <ThemedText variant="caption" color="muted" style={styles.meta}>
      {[who, when].filter(Boolean).join(' · ')}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  meta: {
    marginBottom: 4,
  },
  replying: {
    marginBottom: 4,
  },
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
    borderWidth: 1,
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
  banner: {
    padding: 10,
    marginTop: 8,
  },
  composerInput: {
    marginBottom: 4,
  },
});
