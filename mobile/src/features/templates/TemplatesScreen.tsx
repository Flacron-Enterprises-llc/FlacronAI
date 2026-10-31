import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ScreenContainer } from '@/components/ScreenContainer';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ThemedText } from '@/components/ThemedText';
import { Card, Icon } from '@/components/ui';
import { apiErrorMessage, useApiResource } from '@/hooks/useApiResource';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { StateMessage } from '@/features/reports/components/StateMessage';
import { reportsApi } from '@/services/api/reports';
import { useTheme } from '@/theme';

const FIELD_LABELS: Record<string, string> = {
  lossType: 'Loss type',
  reportType: 'Report type',
  propertyDetails: 'Property details',
  lossDescription: 'Loss description',
  damagesObserved: 'Damages observed',
  recommendations: 'Recommendations',
  additionalNotes: 'Additional notes',
};

/** Saved claim templates (the wizard's "My Templates"). Structural templates are designed in the web Template Builder. */
export function TemplatesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const list = useApiResource(() => reportsApi.listTemplates().then((r) => r.templates));
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remove = (id: string, name: string) =>
    Alert.alert(`Delete "${name}"?`, 'Reports created from it are not affected.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(id);
          setError(null);
          try {
            await reportsApi.deleteTemplate(id);
            list.refresh();
          } catch (err) {
            setError(apiErrorMessage(err, 'Could not delete the template.'));
          } finally {
            setDeleting(null);
          }
        },
      },
    ]);

  const templates = list.data ?? [];

  return (
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={theme.colors.primary} />}
      >
        <View style={styles.column}>
          <ScreenHeader title="Templates" subtitle="Reusable loss details you can load in Generate Report" />
          {error ? (
            <ThemedText variant="body" accessibilityRole="alert" style={{ color: theme.colors.error, marginBottom: 12 }}>
              {error}
            </ThemedText>
          ) : null}
          {list.loading && !list.data ? (
            <StateMessage title="Loading…" />
          ) : list.error && !list.data ? (
            <StateMessage title="Could not load templates" description={list.error} onRetry={list.retry} />
          ) : templates.length === 0 ? (
            <Card>
              <StateMessage
                title="No templates yet"
                description="In Generate Report, fill in the loss details and use My Templates → Save to create one."
                retryLabel="Generate Report"
                onRetry={() => router.push('/report/new')}
              />
            </Card>
          ) : (
            templates.map((t) => {
              const entries = Object.entries(t.fields ?? {}).filter(([, v]) => typeof v === 'string' && v);
              return (
                <Card key={t.id} style={styles.card}>
                  <View style={styles.head}>
                    <Icon name="folder" color={theme.colors.primary} />
                    <ThemedText variant="subtitle" numberOfLines={1} style={styles.flex}>
                      {t.name}
                    </ThemedText>
                    <Pressable
                      onPress={() => remove(t.id, t.name)}
                      disabled={deleting === t.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete template ${t.name}`}
                      hitSlop={8}
                      style={styles.iconBtn}
                    >
                      <Icon name="trash-2" color={theme.colors.error} />
                    </Pressable>
                  </View>
                  {entries.slice(0, 4).map(([k, v]) => (
                    <ThemedText key={k} variant="caption" color="muted" numberOfLines={1}>
                      {FIELD_LABELS[k] ?? k}: {String(v)}
                    </ThemedText>
                  ))}
                  <ThemedText variant="caption" color="muted" style={styles.date}>
                    Saved {new Date(t.createdAt).toLocaleDateString()}
                  </ThemedText>
                </Card>
              );
            })
          )}
          <View style={styles.cta}>
            <PrimaryButton icon="zap" label="Generate Report" onPress={() => router.push('/report/new')} />
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  column: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingBottom: 24 },
  card: { marginBottom: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  flex: { flex: 1 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  date: { marginTop: 6 },
  cta: { marginTop: 8 },
});
