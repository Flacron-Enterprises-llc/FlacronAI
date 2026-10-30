import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { Card, Icon } from '@/components/ui';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { useTheme } from '@/theme';
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  MAX_DOCUMENTS,
  documentError,
  documentMimeType,
  formatBytes,
  type WizardDocument,
} from '../documents';

interface Props {
  documents: WizardDocument[];
  onAdd: (doc: WizardDocument) => void;
  onRemove: (localId: string) => void;
}

/** Web "Supporting Documents" (Dashboard.jsx photos step): PDF / Word / text files sent with Generate Report. Uses the
 * system document picker (Files / Drive / iCloud). Requires expo-document-picker in the native build. */
export function SupportingDocuments({ documents, onAdd, onRemove }: Props) {
  const theme = useTheme();
  const [errors, setErrors] = useState<string[]>([]);

  const pick = async () => {
    setErrors([]);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ALLOWED_DOCUMENT_MIME_TYPES,
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (res.canceled) return;
      const problems: string[] = [];
      const added: WizardDocument[] = [...documents];
      for (const asset of res.assets) {
        const problem = documentError({ name: asset.name, mimeType: asset.mimeType, size: asset.size ?? null }, added);
        if (problem) {
          problems.push(problem);
          continue;
        }
        const doc: WizardDocument = {
          localId: `${Date.now()}-${added.length}`,
          uri: asset.uri,
          name: asset.name,
          mimeType: documentMimeType(asset.name, asset.mimeType) as string,
          size: asset.size ?? null,
        };
        added.push(doc);
        onAdd(doc);
      }
      setErrors(problems);
    } catch {
      setErrors(['The document picker could not be opened.']);
    }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Icon name="paperclip" color={theme.colors.primary} />
        <ThemedText variant="body" style={[styles.flex, { fontFamily: theme.typography.fontFamily.bodySemiBold }]}>
          Supporting Documents
        </ThemedText>
        <ThemedText variant="caption" color="muted">
          {documents.length} / {MAX_DOCUMENTS}
        </ThemedText>
      </View>
      <ThemedText variant="caption" color="muted" style={styles.hint}>
        Optional. PDF, Word or text files up to 10 MB each — stored with the report for reference.
      </ThemedText>
      {documents.map((d) => (
        <View key={d.localId} style={[styles.row, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
          <Icon name="file-text" color={theme.colors.muted} />
          <View style={styles.flex}>
            <ThemedText variant="body" numberOfLines={1}>
              {d.name}
            </ThemedText>
            <ThemedText variant="caption" color="muted">
              {formatBytes(d.size)}
            </ThemedText>
          </View>
          <Pressable onPress={() => onRemove(d.localId)} accessibilityRole="button" accessibilityLabel={`Remove ${d.name}`} hitSlop={8} style={styles.iconBtn}>
            <Icon name="x" color={theme.colors.error} />
          </Pressable>
        </View>
      ))}
      {errors.map((e) => (
        <ThemedText key={e} variant="caption" accessibilityRole="alert" style={{ color: theme.colors.error, marginBottom: 4 }}>
          {e}
        </ThemedText>
      ))}
      <PrimaryButton variant="secondary" icon="upload" label="Add documents" onPress={pick} disabled={documents.length >= MAX_DOCUMENTS} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 16, marginBottom: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  hint: { marginTop: 4, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 8 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
