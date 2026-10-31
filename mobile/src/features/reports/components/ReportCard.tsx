import { StyleSheet, Text, View } from 'react-native';

import { LossPill } from '@/components/brand/Fields';
import { ScalePressable } from '@/components/brand/ScalePressable';
import { Icon } from '@/components/ui/Icon';
import { AuthenticatedThumb } from '@/features/photos/components/AuthenticatedThumb';
import { reportsApi, type Report } from '@/services/api/reports';
import { brand, shadows } from '@/theme/brand';
import { StatusBadge } from './StatusBadge';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

/** First photo that was actually stored (thumbnail-capable) — the card's cover image. */
function coverPhotoId(report: Report): string | null {
  const photo = (report.photos ?? []).find((p) => p && p.id && p.status !== 'failed' && p.status !== 'duplicate');
  return photo ? photo.id : null;
}

/** Reference project card: cover photo, insured/property name, address, loss-type pill + status, date and photo count. */
export function ReportCard({
  report,
  onPress,
  onLongPress,
  selected,
}: {
  report: Report;
  onPress: () => void;
  onLongPress?: () => void;
  /** Bulk-selection mode: `true`/`false` shows a checkbox; `undefined` = normal card. */
  selected?: boolean;
}) {
  const cover = coverPhotoId(report);
  const title = report.insuredName || `Claim ${report.claimNumber}`;

  return (
    <ScalePressable
      onPress={onPress}
      onLongPress={onLongPress}
      pressScale={0.98}
      accessibilityRole={selected === undefined ? 'button' : 'checkbox'}
      accessibilityState={selected === undefined ? undefined : { checked: selected }}
      accessibilityLabel={`${title}, claim ${report.claimNumber}, ${report.status}`}
      style={[styles.card, shadows.card, selected && styles.selected]}
    >
      <View style={styles.thumb}>
        {cover ? (
          <AuthenticatedThumb
            scope="report-card"
            cacheKey={`${report.id}-${cover}`}
            fetcher={() => reportsApi.getPhotoImage(report.id, cover, 'thumbnail')}
          />
        ) : (
          <View style={styles.thumbEmpty}>
            <Icon name="home" size={26} color={brand.navy} />
          </View>
        )}
        {selected !== undefined ? (
          <View style={[styles.check, selected && styles.checkOn]}>
            {selected ? <Icon name="check" size={14} color="#FFFFFF" /> : null}
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.address} numberOfLines={1}>
          {report.propertyAddress || `Claim ${report.claimNumber}`}
        </Text>
        <View style={styles.tags}>
          <LossPill lossType={report.lossType} />
          <StatusBadge status={report.status} compact />
        </View>
        <View style={styles.meta}>
          <Text style={styles.metaText} numberOfLines={1}>
            {formatDate(report.updatedAt || report.createdAt)}
          </Text>
          <View style={styles.photos}>
            <Icon name="camera" size={12} color={brand.muted} />
            <Text style={styles.metaText}>{report.imageCount ?? 0}</Text>
          </View>
        </View>
      </View>
      <Icon name="chevron-right" size={22} color={brand.orange} />
    </ScalePressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: brand.card,
    borderRadius: 16,
    padding: 10,
    paddingRight: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: brand.line,
  },
  selected: { borderColor: brand.orange, borderWidth: 2 },
  thumb: { width: 88, height: 76, borderRadius: 12, overflow: 'hidden', backgroundColor: '#E9EEF6' },
  thumbEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  check: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(0,26,66,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: brand.orange, borderColor: brand.orange },
  body: { flex: 1, minWidth: 0, gap: 3 },
  title: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 15.5, color: brand.ink },
  address: { fontFamily: 'Inter_400Regular', fontSize: 12.5, color: brand.muted },
  tags: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 1 },
  metaText: { fontFamily: 'Inter_400Regular', fontSize: 11.5, color: brand.muted },
  photos: { flexDirection: 'row', alignItems: 'center', gap: 3 },
});
