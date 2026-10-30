import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { Icon } from '@/components/ui/Icon';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { usersApi } from '@/services/api/users';
import { userScopedKey } from '@/services/localData/userDataLifecycle';
import { useTheme } from '@/theme';
import { buildTourSteps, TOUR_VERSION } from './tourSteps';

type Listener = () => void;
const replayListeners = new Set<Listener>();

/** Help → "Replay app tour". The tour lives on the Dashboard, so callers navigate there first. */
export function requestTourReplay(): void {
  replayListeners.forEach((l) => l());
}

const SEEN_KEY = 'product_tour_seen_v';

/**
 * Mobile version of the web interactive tour (frontend/src/tour). Starts by itself once per user — completion is the
 * same server field the web uses (`productTour.version`), so finishing on either platform counts for both. A local
 * per-user flag stops it re-appearing if the save fails while offline.
 */
export function ProductTour() {
  const theme = useTheme();
  const { userProfile, firebaseUser } = useAuth();
  const uid = firebaseUser?.uid ?? null;
  const [visible, setVisible] = useState(false);
  const [source, setSource] = useState<'auto' | 'replay'>('auto');
  const [index, setIndex] = useState(0);
  const viewed = useRef(1);
  const steps = buildTourSteps(userProfile?.tier);

  useEffect(() => {
    if (!uid || !userProfile) return;
    if ((userProfile.productTour?.version ?? 0) >= TOUR_VERSION) return;
    let active = true;
    AsyncStorage.getItem(userScopedKey(uid, SEEN_KEY + TOUR_VERSION))
      .then((seen) => {
        if (active && !seen) {
          setSource('auto');
          setIndex(0);
          viewed.current = 1;
          setVisible(true);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [uid, userProfile]);

  useEffect(() => {
    const l = () => {
      setSource('replay');
      setIndex(0);
      viewed.current = 1;
      setVisible(true);
    };
    replayListeners.add(l);
    return () => {
      replayListeners.delete(l);
    };
  }, []);

  const close = (status: 'completed' | 'skipped') => {
    setVisible(false);
    if (uid) AsyncStorage.setItem(userScopedKey(uid, SEEN_KEY + TOUR_VERSION), '1').catch(() => undefined);
    usersApi
      .recordProductTour({
        status,
        source,
        version: TOUR_VERSION,
        lastStepId: steps[index]?.id,
        stepsViewed: viewed.current,
        totalSteps: steps.length,
      })
      .catch(() => undefined);
  };

  const step = steps[index];
  if (!step) return null;
  const last = index === steps.length - 1;
  const next = () => {
    if (last) return close('completed');
    setIndex((i) => i + 1);
    viewed.current = Math.max(viewed.current, index + 2);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => close('skipped')}>
      <View style={styles.backdrop}>
        <View
          accessibilityViewIsModal
          style={[styles.sheet, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}
        >
          <View style={styles.top}>
            <View style={[styles.iconTile, { backgroundColor: theme.colors.primarySoft }]}>
              <Icon name={step.icon} size={22} color={theme.colors.primary} />
            </View>
            <ThemedText variant="caption" color="muted">
              {index + 1} of {steps.length}
            </ThemedText>
          </View>
          <ThemedText variant="title" accessibilityRole="header" style={styles.title}>
            {step.title}
          </ThemedText>
          <ThemedText variant="body" color="muted" style={styles.body}>
            {step.body}
          </ThemedText>
          {step.where ? (
            <View style={[styles.where, { backgroundColor: theme.colors.surface }]}>
              <Icon name="map-pin" size={14} color={theme.colors.navy} />
              <ThemedText variant="caption" style={{ color: theme.colors.navy, flex: 1 }}>
                {step.where}
              </ThemedText>
            </View>
          ) : null}
          <View style={styles.dots}>
            {steps.map((s, i) => (
              <View
                key={s.id}
                style={[styles.dot, { backgroundColor: i === index ? theme.colors.primary : theme.colors.border }]}
              />
            ))}
          </View>
          <View style={styles.actions}>
            {index > 0 ? (
              <View style={styles.flex}>
                <PrimaryButton variant="secondary" label="Back" onPress={() => setIndex((i) => i - 1)} />
              </View>
            ) : null}
            <View style={styles.flex}>
              <PrimaryButton label={last ? 'Finish' : 'Next'} onPress={next} />
            </View>
          </View>
          {!last ? (
            <Pressable onPress={() => close('skipped')} accessibilityRole="button" hitSlop={8} style={styles.skip}>
              <ThemedText variant="body" color="muted">
                Skip tour
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,22,51,0.55)', justifyContent: 'flex-end', padding: 16 },
  sheet: { borderRadius: 20, borderWidth: 1, padding: 20, width: '100%', maxWidth: 520, alignSelf: 'center', marginBottom: 16 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  iconTile: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { marginBottom: 8 },
  body: { lineHeight: 22 },
  where: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, padding: 10, marginTop: 12 },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center', marginVertical: 16 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  actions: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  skip: { alignSelf: 'center', marginTop: 12, minHeight: 44, justifyContent: 'center' },
});
