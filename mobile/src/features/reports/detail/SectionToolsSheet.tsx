import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ThemedText';
import { Card, Icon } from '@/components/ui';
import { apiErrorMessage } from '@/hooks/useApiResource';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { FormError } from '@/features/auth/components/FormError';
import { reportsApi, type Report } from '@/services/api/reports';
import { useTheme } from '@/theme';
import { ReportMarkdown } from '../markdown/ReportMarkdown';
import { ASSIST_ACTIONS, parseReportSections, replaceSectionBody, type ReportSection } from '../sections/reportSections';

/**
 * Web SectionedReportEditor's per-section "FLACRON Tools" + "Regenerate Section". Suggestions stay separate (editable)
 * until Apply; Apply + Save writes the whole report through `PUT /reports/:id` like the web's Save Changes, and the
 * report still needs human approval. Owner only — the server returns 404 to review grantees.
 */
export function SectionToolsSheet({ report, onClose, onSaved }: { report: Report; onClose: () => void; onSaved: (content: string) => void }) {
  const theme = useTheme();
  const sections = parseReportSections(report.content ?? '');
  const [section, setSection] = useState<ReportSection | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<{ label: string; text: string } | null>(null);
  const [instructions, setInstructions] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (label: string, fn: () => Promise<{ suggestion: string }>) => {
    setRunning(label);
    setError(null);
    setSuggestion(null);
    try {
      const res = await fn();
      setSuggestion({ label, text: res.suggestion });
    } catch (err) {
      setError(apiErrorMessage(err, 'Super Intelligence could not complete this request.'));
    } finally {
      setRunning(null);
    }
  };

  const applyAndSave = async () => {
    if (!section || !suggestion) return;
    const content = replaceSectionBody(report.content ?? '', section.id, suggestion.text);
    setSaving(true);
    setError(null);
    try {
      await reportsApi.update(report.id, { content });
      onSaved(content);
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save the section.'));
    } finally {
      setSaving(false);
    }
  };

  const input = [styles.input, { color: theme.colors.ink, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }];

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.fill, { backgroundColor: theme.colors.background }]}>
        <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.head}>
            {section ? (
              <Pressable onPress={() => { setSection(null); setSuggestion(null); setError(null); }} accessibilityRole="button" accessibilityLabel="All sections" hitSlop={8} style={styles.iconBtn}>
                <Icon name="chevron-left" size={22} color={theme.colors.primary} />
              </Pressable>
            ) : null}
            <ThemedText variant="title" numberOfLines={1} accessibilityRole="header" style={styles.fill}>
              {section ? section.title : 'FLACRON Tools'}
            </ThemedText>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} style={styles.iconBtn}>
              <Icon name="x" size={22} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
            {!section ? (
              <>
                <ThemedText variant="body" color="muted" style={styles.mb}>
                  Choose a section to improve or regenerate with Super Intelligence. Suggestions stay separate until you apply them.
                </ThemedText>
                {sections.map((s) => (
                  <Pressable
                    key={s.id}
                    onPress={() => setSection(s)}
                    accessibilityRole="button"
                    style={[styles.sectionRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
                  >
                    <View style={styles.fill}>
                      <ThemedText variant="body" numberOfLines={1} style={{ fontFamily: theme.typography.fontFamily.bodySemiBold }}>
                        {s.title}
                      </ThemedText>
                      <ThemedText variant="caption" color="muted" numberOfLines={1}>
                        {s.body.replace(/\s+/g, ' ').slice(0, 100) || 'Empty section'}
                      </ThemedText>
                    </View>
                    <Icon name="chevron-right" color={theme.colors.muted} />
                  </Pressable>
                ))}
              </>
            ) : (
              <>
                <Card style={styles.mb}>
                  <ThemedText variant="caption" color="muted" style={styles.label}>
                    CURRENT
                  </ThemedText>
                  <ReportMarkdown content={section.body || '_Empty section_'} />
                </Card>
                <ThemedText variant="caption" color="muted" style={styles.label}>
                  FLACRON TOOLS
                </ThemedText>
                <View style={styles.chips}>
                  {ASSIST_ACTIONS.map((a) => (
                    <Pressable
                      key={a.id}
                      disabled={!!running}
                      onPress={() => run(a.label, () => reportsApi.assistSection(report.id, a.id, section.title, section.body))}
                      accessibilityRole="button"
                      style={[styles.chip, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, opacity: running && running !== a.label ? 0.5 : 1 }]}
                    >
                      {running === a.label ? <ActivityIndicator size="small" color={theme.colors.primary} /> : null}
                      <ThemedText variant="caption">{a.label}</ThemedText>
                    </Pressable>
                  ))}
                </View>
                <ThemedText variant="caption" color="muted" style={styles.label}>
                  REGENERATE SECTION
                </ThemedText>
                <TextInput
                  value={instructions}
                  onChangeText={setInstructions}
                  maxLength={2000}
                  multiline
                  placeholder="What would you like to change? (optional)"
                  placeholderTextColor={theme.colors.muted}
                  accessibilityLabel="Instructions for regenerating this section"
                  style={input}
                />
                <PrimaryButton
                  variant="secondary"
                  icon="refresh-cw"
                  label={suggestion?.label === 'Regenerated' ? 'Regenerate Again' : 'Regenerate Section'}
                  loading={running === 'Regenerated'}
                  disabled={!!running}
                  onPress={() => run('Regenerated', () => reportsApi.suggestSection(report.id, section.title, section.body, instructions.trim() || undefined))}
                />
                <FormError message={error} />
                {suggestion ? (
                  <View style={[styles.result, { borderColor: theme.colors.info + '66', backgroundColor: theme.colors.info + '10' }]}>
                    <ThemedText variant="caption" style={[styles.label, { color: theme.colors.info }]}>
                      {suggestion.label.toUpperCase()} — NOT APPLIED
                    </ThemedText>
                    <TextInput
                      value={suggestion.text}
                      onChangeText={(text) => setSuggestion({ ...suggestion, text })}
                      multiline
                      accessibilityLabel="Suggested section text"
                      style={[...input, styles.tall]}
                    />
                    <ThemedText variant="caption" color="muted" style={styles.mb}>
                      Applying replaces this section and saves the draft. The report still needs your review and approval.
                    </ThemedText>
                    <View style={styles.actions}>
                      <View style={styles.fill}>
                        <PrimaryButton variant="secondary" label="Discard" onPress={() => setSuggestion(null)} disabled={saving} />
                      </View>
                      <View style={styles.fill}>
                        <PrimaryButton icon="check" label="Apply & Save" onPress={applyAndSave} loading={saving} disabled={!suggestion.text.trim()} />
                      </View>
                    </View>
                  </View>
                ) : null}
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 8 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pad: { padding: 16, paddingBottom: 40 },
  mb: { marginBottom: 12 },
  label: { letterSpacing: 0.6, fontFamily: 'Inter_600SemiBold', marginTop: 8, marginBottom: 8 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, minHeight: 40 },
  input: { borderWidth: 1, borderRadius: 12, minHeight: 70, padding: 10, textAlignVertical: 'top', marginBottom: 10, fontSize: 15 },
  tall: { minHeight: 180 },
  result: { borderWidth: 1, borderRadius: 16, padding: 12, marginTop: 16 },
  actions: { flexDirection: 'row', gap: 10 },
});
