import { useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { FormError } from '@/features/auth/components/FormError';
import type { ExportFormat } from '@/services/api/reports';
import { ChoiceChips } from '../wizard/components/ChoiceChips';
import { useReportExport } from '../hooks/useReportExport';

const FORMATS: readonly ExportFormat[] = ['pdf', 'docx', 'html'];

interface ExportSheetProps {
  visible: boolean;
  reportId: string;
  onClose: () => void;
}

export function ExportSheet({ visible, reportId, onClose }: ExportSheetProps) {
  const theme = useTheme();
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [notice, setNotice] = useState<string | null>(null);
  const { exportAndShare, exporting, error, clearError } = useReportExport(reportId);

  const handleExport = async () => {
    clearError();
    setNotice(null);
    const outcome = await exportAndShare({ format, includeImages: true, includeCoverPage: true });
    if (outcome.status === 'shared') onClose();
    else if (outcome.status === 'saved-only' || outcome.status === 'share-failed') {
      setNotice(outcome.status === 'saved-only' ? outcome.reason : `Saved on-device, but sharing didn't complete: ${outcome.message}`);
    }
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
          <ThemedText variant="title" style={styles.title}>
            Export report
          </ThemedText>

          <ChoiceChips label="Format" value={format} options={FORMATS} onChange={(v) => setFormat(v as ExportFormat)} />

          <FormError message={error} />
          {!!notice && (
            <ThemedText variant="caption" color="muted" style={styles.notice}>
              {notice}
            </ThemedText>
          )}

          <View style={styles.actions}>
            <View style={styles.actionBtn}>
              <PrimaryButton label="Cancel" onPress={onClose} variant="secondary" disabled={exporting} />
            </View>
            <View style={styles.actionBtn}>
              <PrimaryButton label="Export & share" onPress={handleExport} loading={exporting} />
            </View>
          </View>
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
    padding: 20,
  },
  title: {
    marginBottom: 16,
  },
  notice: {
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 8,
  },
  actionBtn: {
    flex: 1,
  },
});
