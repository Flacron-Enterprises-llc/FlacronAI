import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ThemedText';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { FormError } from '@/features/auth/components/FormError';
import { apiErrorMessage } from '@/hooks/useApiResource';
import { reportsApi, type Report } from '@/services/api/reports';
import { useTheme } from '@/theme';

interface Props {
  visible: boolean;
  report: Report;
  /** Legacy `approved`/`completed` reports reopen to draft when edited (server rule). */
  reopensApproval: boolean;
  onClose: () => void;
  onSaved: (patch: Partial<Report>) => void;
}

/**
 * Edit the whole draft (web "Save Changes" in the report editor, without the desktop section toolbar). The text is the
 * same Markdown the web editor saves, so headings and lists keep their formatting. Nothing is final until approval.
 * Mount it only while open so each opening starts from the report's current content.
 */
export function EditContentSheet({ visible, report, reopensApproval, onClose, onSaved }: Props) {
  const theme = useTheme();
  const [text, setText] = useState(report.content ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = text !== (report.content ?? '');

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await reportsApi.update(report.id, { content: text });
      onSaved({ content: text, ...(reopensApproval ? { status: 'draft' as const } : {}) });
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save your changes.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.fill, { backgroundColor: theme.colors.background }]}>
        <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.pad}>
            <ThemedText variant="title" accessibilityRole="header">
              Edit report
            </ThemedText>
            <ThemedText variant="caption" color="muted" style={styles.hint}>
              Use # for headings, - for bullet points and **text** for bold — the same formatting as the web editor.
              {reopensApproval ? ' Saving reopens this report as a draft that must be approved again.' : ''}
            </ThemedText>
            <FormError message={error} />
          </View>
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            textAlignVertical="top"
            autoCorrect
            accessibilityLabel="Report content"
            style={[
              styles.editor,
              { color: theme.colors.ink, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, fontFamily: theme.typography.fontFamily.body },
            ]}
          />
          <View style={[styles.pad, styles.actions]}>
            <View style={styles.flex}>
              <PrimaryButton variant="secondary" label="Cancel" onPress={onClose} disabled={saving} />
            </View>
            <View style={styles.flex}>
              <PrimaryButton label="Save changes" onPress={save} loading={saving} disabled={!dirty || !text.trim()} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pad: { paddingHorizontal: 16, paddingTop: 12 },
  hint: { marginTop: 4, marginBottom: 8 },
  editor: { flex: 1, marginHorizontal: 16, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 15, lineHeight: 22 },
  actions: { flexDirection: 'row', gap: 12, paddingBottom: 12 },
  flex: { flex: 1 },
});
