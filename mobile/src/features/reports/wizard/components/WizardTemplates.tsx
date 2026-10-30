import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { Card, Icon } from '@/components/ui';
import { apiErrorMessage, useApiResource } from '@/hooks/useApiResource';
import { reportsApi, type ReportTemplate } from '@/services/api/reports';
import { useTheme } from '@/theme';
import type { WizardFields } from '../wizardTypes';

/** The same field subset the web saves as a template (Dashboard.jsx handleSaveTemplate). */
export const TEMPLATE_FIELD_KEYS = [
  'lossType',
  'reportType',
  'propertyDetails',
  'lossDescription',
  'damagesObserved',
  'recommendations',
  'additionalNotes',
] as const;

export function pickTemplateFields(fields: WizardFields): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of TEMPLATE_FIELD_KEYS) if (fields[key]) out[key] = fields[key];
  return out;
}

interface Props {
  fields: WizardFields;
  onApply: (template: ReportTemplate) => void;
}

/** Web "My Templates" card: load a saved template into the form, or save the current loss details as one. */
export function WizardTemplates({ fields, onApply }: Props) {
  const theme = useTheme();
  const list = useApiResource(() => reportsApi.listTemplates().then((r) => r.templates));
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [open, setOpen] = useState(false);
  const templates = list.data ?? [];

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return setMessage({ tone: 'error', text: 'Enter a template name.' });
    setSaving(true);
    setMessage(null);
    try {
      await reportsApi.saveTemplate(trimmed, pickTemplateFields(fields));
      setName('');
      setMessage({ tone: 'ok', text: 'Template saved.' });
      list.refresh();
    } catch (err) {
      setMessage({ tone: 'error', text: apiErrorMessage(err, 'Could not save template.') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={styles.card}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.head}
      >
        <Icon name="folder" color={theme.colors.primary} />
        <ThemedText variant="body" style={[styles.flex, { fontFamily: theme.typography.fontFamily.bodySemiBold }]}>
          My Templates{templates.length ? ` (${templates.length})` : ''}
        </ThemedText>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} color={theme.colors.muted} />
      </Pressable>
      {open ? (
        <View style={styles.body}>
          {list.error && !list.data ? (
            <ThemedText variant="caption" color="muted">
              Templates are unavailable right now.
            </ThemedText>
          ) : templates.length === 0 ? (
            <ThemedText variant="caption" color="muted">
              No saved templates yet. Fill in the loss details, then save them here to reuse.
            </ThemedText>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {templates.map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => {
                    onApply(t);
                    setMessage({ tone: 'ok', text: `Loaded "${t.name}".` });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Load template ${t.name}`}
                  style={[styles.chip, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}
                >
                  <ThemedText variant="caption">{t.name}</ThemedText>
                </Pressable>
              ))}
            </ScrollView>
          )}
          <View style={styles.saveRow}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Template name"
              placeholderTextColor={theme.colors.muted}
              accessibilityLabel="Template name"
              maxLength={100}
              style={[styles.input, { color: theme.colors.ink, borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}
            />
            <Pressable
              onPress={save}
              disabled={saving}
              accessibilityRole="button"
              style={[styles.saveBtn, { backgroundColor: theme.colors.primary, opacity: saving ? 0.6 : 1 }]}
            >
              <ThemedText variant="caption" style={styles.saveText}>
                {saving ? 'Saving…' : 'Save'}
              </ThemedText>
            </Pressable>
          </View>
          {message ? (
            <ThemedText
              variant="caption"
              accessibilityLiveRegion="polite"
              style={{ color: message.tone === 'ok' ? theme.colors.success : theme.colors.error, marginTop: 6 }}
            >
              {message.text}
            </ThemedText>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 16, paddingVertical: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  flex: { flex: 1 },
  body: { paddingBottom: 10 },
  chips: { gap: 8, paddingVertical: 4 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, minHeight: 36, justifyContent: 'center' },
  saveRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  input: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 44 },
  saveBtn: { borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center', minHeight: 44 },
  saveText: { color: '#FFFFFF', fontFamily: 'Inter_600SemiBold' },
});
