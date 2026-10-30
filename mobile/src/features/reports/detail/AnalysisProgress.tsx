import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { Card, Icon, ProgressBar } from '@/components/ui';
import { reportsApi, type AnalysisStatus } from '@/services/api/reports';
import { useTheme } from '@/theme';

const POLL_MS = 4000;

/**
 * Web `analysis` view: live "X of Y photos analyzed" from `GET /:id/analysis-status` while the background pipeline
 * runs. The report screen's own polling still decides when the report leaves `processing`; this only shows progress,
 * and keeps the last good reading on a failed poll instead of flashing an error.
 */
export function AnalysisProgress({ reportId }: { reportId: string }) {
  const theme = useTheme();
  const [data, setData] = useState<AnalysisStatus | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const res = await reportsApi.getAnalysisStatus(reportId);
        if (!active) return;
        setData(res);
        setLoadError(false);
      } catch {
        if (active) setLoadError(true);
      }
      if (active) timer = setTimeout(tick, POLL_MS);
    };
    tick();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [reportId]);

  const done = data ? data.analyzed + data.needsAttention + data.failed : 0;
  const analyzing = !!data && data.totalPhotos > 0 && done < data.totalPhotos;
  const percent = data && data.totalPhotos > 0 ? (done / data.totalPhotos) * 100 : 0;

  return (
    <Card style={styles.card}>
      <View style={[styles.badge, { backgroundColor: theme.colors.primary }]}>
        <Icon name="zap" size={26} color="#FFFFFF" />
      </View>
      <ThemedText variant="caption" color="primary" style={styles.kicker}>
        POWERED BY FLACRON ENGINE
      </ThemedText>
      <ThemedText variant="subtitle" accessibilityRole="header" style={styles.center}>
        {!data
          ? loadError
            ? 'Couldn’t load analysis progress'
            : 'Starting analysis…'
          : analyzing
            ? 'FLACRON ENGINE is analyzing your inspection'
            : 'Drafting your report'}
      </ThemedText>
      {data && data.totalPhotos > 0 ? (
        <>
          <ThemedText variant="body" color="muted" style={[styles.center, styles.gap]}>
            {data.analyzed} of {data.totalPhotos} photos analyzed
            {data.needsAttention > 0 ? ` — ${data.needsAttention} need${data.needsAttention === 1 ? 's' : ''} attention` : ''}
          </ThemedText>
          <ProgressBar percent={percent} accessibilityLabel="Photos analyzed" />
        </>
      ) : null}
      {data?.generation?.status === 'analyzing' || (data && !analyzing) ? (
        <View style={[styles.row, styles.gap]}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <ThemedText variant="body" color="primary">
            Generating your draft report with FLACRON ENGINE…
          </ThemedText>
        </View>
      ) : null}
      <ThemedText variant="caption" color="muted" style={[styles.center, styles.gap]}>
        {loadError && !data
          ? 'Check your connection — this keeps retrying automatically.'
          : 'You can safely leave this screen — analysis continues in the background, and you will be notified when the draft is ready.'}
      </ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'stretch', marginBottom: 16, paddingVertical: 24 },
  badge: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 12 },
  kicker: { textAlign: 'center', letterSpacing: 0.8, fontFamily: 'Inter_600SemiBold', marginBottom: 6 },
  center: { textAlign: 'center' },
  gap: { marginTop: 10, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' },
});
