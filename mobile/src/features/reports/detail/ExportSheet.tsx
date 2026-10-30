import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/ThemedText';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useApiResource } from '@/hooks/useApiResource';
import { useTheme } from '@/theme';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { FormError } from '@/features/auth/components/FormError';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { usersApi } from '@/services/api/users';
import type { ExportFormat, ExportOptions } from '@/services/api/reports';
import { TEMP_FILE_NOTICE, useReportExport } from '../hooks/useReportExport';

const FORMATS: { id: ExportFormat; label: string; icon: IconName }[] = [
  { id: 'pdf', label: 'PDF', icon: 'file-text' },
  { id: 'docx', label: 'DOCX', icon: 'file' },
  { id: 'html', label: 'HTML', icon: 'code' },
];

/** Same plan → format map the web uses for display (Dashboard.jsx TIER_EXPORTS / backend config/tiers.js
 * exportFormats). Display only — the server rejects a format the plan doesn't include. */
export const TIER_EXPORTS: Record<string, ExportFormat[]> = {
  starter: ['pdf'],
  professional: ['pdf', 'docx', 'html'],
  agency: ['pdf', 'docx', 'html'],
  enterprise: ['pdf', 'docx', 'html'],
};

type ToggleKey = 'includeCoverPage' | 'includePhotoCaptions' | 'includePageNumbers' | 'includeAppendix' | 'includeCompanyBranding';

const TOGGLES: { key: ToggleKey; label: string; hint: string }[] = [
  { key: 'includeCoverPage', label: 'Include cover page', hint: 'Title, claim summary, and status on their own page' },
  { key: 'includePhotoCaptions', label: 'Include photo captions', hint: 'File name shown under each appendix photo' },
  { key: 'includePageNumbers', label: 'Include page numbers', hint: 'Adds "Page N" to the footer' },
  { key: 'includeAppendix', label: 'Include photo appendix', hint: 'The "Photo Documentation" section' },
  { key: 'includeCompanyBranding', label: 'Include company branding', hint: 'Your logo/name in the header and cover' },
];

const LAYOUTS = [1, 2, 4] as const;

interface ExportSheetProps {
  visible: boolean;
  reportId: string;
  /** A template's export preferences (`report.exportDefaults`) — only seeds the choices. */
  defaults?: Partial<ExportOptions> | null;
  onClose: () => void;
}

/** Web ExportOptionsModal: format (locked per plan), layout and content options, then export and hand the file to the
 * native share sheet (save to Files / send). */
export function ExportSheet({ visible, reportId, defaults, onClose }: ExportSheetProps) {
  const theme = useTheme();
  const router = useRouter();
  const { userProfile } = useAuth();
  const usage = useApiResource(() => usersApi.getUsage().then((r) => r.usage), [], visible);
  const tier = usage.data?.tier ?? userProfile?.tier ?? 'starter';
  const allowed = TIER_EXPORTS[tier] ?? ['pdf'];
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [toggles, setToggles] = useState<Record<ToggleKey, boolean>>({
    includeCoverPage: defaults?.includeCoverPage ?? true,
    includePhotoCaptions: defaults?.includePhotoCaptions ?? true,
    includePageNumbers: defaults?.includePageNumbers ?? true,
    includeAppendix: defaults?.includeAppendix ?? true,
    includeCompanyBranding: defaults?.includeCompanyBranding ?? true,
  });
  const [layout, setLayout] = useState<1 | 2 | 4>(
    defaults?.photoLayout && LAYOUTS.includes(defaults.photoLayout) ? defaults.photoLayout : 2
  );
  const [notice, setNotice] = useState<string | null>(null);
  const { exportAndShare, exporting, error, clearError } = useReportExport(reportId);

  const handleExport = async () => {
    clearError();
    setNotice(null);
    const outcome = await exportAndShare({ format, includeImages: true, photoLayout: layout, ...toggles });
    if (outcome.status === 'shared') onClose();
    else if (outcome.status === 'saved-only' || outcome.status === 'share-failed') {
      setNotice(
        outcome.status === 'saved-only' ? outcome.reason : `Sharing didn’t complete (${outcome.message}). ${TEMP_FILE_NOTICE}`
      );
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
          <ScrollView contentContainerStyle={styles.scroll}>
            <ThemedText variant="title" accessibilityRole="header" style={styles.title}>
              Export Report
            </ThemedText>

            <ThemedText variant="caption" color="muted" style={styles.label}>
              FORMAT
            </ThemedText>
            <View style={styles.formats}>
              {FORMATS.map((f) => {
                const locked = !allowed.includes(f.id);
                const selected = format === f.id;
                return (
                  <Pressable
                    key={f.id}
                    onPress={() => (locked ? router.push('/subscription') : setFormat(f.id))}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, disabled: locked }}
                    accessibilityLabel={locked ? `${f.label}, not included in your plan` : f.label}
                    style={[
                      styles.format,
                      {
                        borderColor: selected ? theme.colors.primary : theme.colors.border,
                        backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surface,
                        opacity: locked ? 0.55 : 1,
                      },
                    ]}
                  >
                    <Icon name={locked ? 'lock' : f.icon} color={selected ? theme.colors.primary : theme.colors.muted} />
                    <ThemedText variant="body" style={{ fontFamily: theme.typography.fontFamily.bodySemiBold }}>
                      {f.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
            {allowed.length < FORMATS.length ? (
              <ThemedText variant="caption" color="muted" style={styles.hint}>
                DOCX and HTML are included from the Professional plan. Tap a locked format to see plans.
              </ThemedText>
            ) : null}

            <ThemedText variant="caption" color="muted" style={styles.label}>
              PHOTOS PER PAGE
            </ThemedText>
            <View style={styles.formats}>
              {LAYOUTS.map((n) => (
                <Pressable
                  key={n}
                  onPress={() => setLayout(n)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: layout === n }}
                  accessibilityLabel={`${n} photo${n === 1 ? '' : 's'} per page`}
                  style={[
                    styles.format,
                    {
                      borderColor: layout === n ? theme.colors.primary : theme.colors.border,
                      backgroundColor: layout === n ? theme.colors.primarySoft : theme.colors.surface,
                    },
                  ]}
                >
                  <ThemedText variant="body" style={{ fontFamily: theme.typography.fontFamily.bodySemiBold }}>
                    {n}
                  </ThemedText>
                </Pressable>
              ))}
            </View>

            {TOGGLES.map((t) => (
              <View key={t.key} style={[styles.toggle, { borderBottomColor: theme.colors.border }]}>
                <View style={styles.flex}>
                  <ThemedText variant="body">{t.label}</ThemedText>
                  <ThemedText variant="caption" color="muted">
                    {t.hint}
                  </ThemedText>
                </View>
                <Switch
                  value={toggles[t.key]}
                  onValueChange={(v) => setToggles((s) => ({ ...s, [t.key]: v }))}
                  trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                  accessibilityLabel={t.label}
                />
              </View>
            ))}

            <ThemedText variant="caption" color="muted" style={styles.notice}>
              Reports that are not approved yet export with a DRAFT watermark. Exports with many photos can take a couple of
              minutes; then choose where to save or send the file.
            </ThemedText>

            <FormError message={error} />
            {!!notice && (
              <ThemedText variant="caption" color="muted" style={styles.notice}>
                {notice}
              </ThemedText>
            )}

            <View style={styles.actions}>
              <View style={styles.flex}>
                <PrimaryButton label="Cancel" onPress={onClose} variant="secondary" disabled={exporting} />
              </View>
              <View style={styles.flex}>
                <PrimaryButton icon="download" label="Export & share" onPress={handleExport} loading={exporting} />
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,22,51,0.45)' },
  sheet: { maxHeight: '90%', width: '100%', maxWidth: 640, alignSelf: 'center' },
  scroll: { padding: 20 },
  title: { marginBottom: 16 },
  label: { letterSpacing: 0.6, fontFamily: 'Inter_600SemiBold', marginBottom: 8 },
  formats: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  format: { flex: 1, minHeight: 56, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 4 },
  hint: { marginTop: -4, marginBottom: 12 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  flex: { flex: 1 },
  notice: { marginVertical: 12 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 8, marginBottom: 8 },
});
