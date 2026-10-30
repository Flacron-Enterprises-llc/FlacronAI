import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions, type View as RNView } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { Icon } from '@/components/ui/Icon';
import { PrimaryButton } from '@/features/auth/components/PrimaryButton';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { usersApi } from '@/services/api/users';
import { userScopedKey } from '@/services/localData/userDataLifecycle';
import { useTheme } from '@/theme';
import { buildTourSteps, TAB_ORDER, TOUR_VERSION } from './tourSteps';
import { measureTarget, tabRect, type Rect } from './tourTargets';

type Listener = () => void;
const replayListeners = new Set<Listener>();

/** Help → "Replay app tour". The tour lives on the Dashboard, so callers navigate there first. */
export function requestTourReplay(): void {
  replayListeners.forEach((l) => l());
}

const SEEN_KEY = 'product_tour_mobile_seen_v';
const PAD = 6;

/** True when this account has not yet finished or skipped the MOBILE tour. The web tour (`productTour`) is ignored on
 * purpose: the app's controls are different, so a web user opening the app for the first time still gets guided. */
export function shouldAutoStartMobileTour(profile: { productTourMobile?: { version?: number } | null } | null | undefined): boolean {
  return !!profile && (profile.productTourMobile?.version ?? 0) < TOUR_VERSION;
}

/**
 * Spotlight tour over the Dashboard: each step dims the screen except the real control it describes (Generate Report,
 * plan card, bell, search, and the tab-bar buttons) and places its card beside it. `screenRef` is the Dashboard's root
 * view, used to locate the tab bar beneath it. Completion → `POST /users/product-tour {platform:'mobile'}`, plus a local
 * per-user flag so an offline finish isn't shown again.
 */
export function ProductTour({ screenRef }: { screenRef: RefObject<RNView | null> }) {
  const theme = useTheme();
  const { width: winW, height: winH } = useWindowDimensions();
  const { userProfile, firebaseUser } = useAuth();
  const uid = firebaseUser?.uid ?? null;
  const [visible, setVisible] = useState(false);
  const [source, setSource] = useState<'auto' | 'replay'>('auto');
  const [index, setIndex] = useState(0);
  const [hole, setHole] = useState<Rect | null>(null);
  const viewed = useRef(1);
  const steps = buildTourSteps(userProfile?.tier);
  const step = steps[index];

  const open = useCallback((from: 'auto' | 'replay') => {
    setSource(from);
    setIndex(0);
    setHole(null);
    viewed.current = 1;
    setVisible(true);
  }, []);

  useEffect(() => {
    if (!uid || !shouldAutoStartMobileTour(userProfile)) return;
    let active = true;
    AsyncStorage.getItem(userScopedKey(uid, SEEN_KEY + TOUR_VERSION))
      .then((seen) => {
        // Give the dashboard a moment to lay out so the first targets can be measured.
        if (active && !seen) setTimeout(() => active && open('auto'), 600);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [uid, userProfile, open]);

  useEffect(() => {
    const l = () => open('replay');
    replayListeners.add(l);
    return () => {
      replayListeners.delete(l);
    };
  }, [open]);

  // Measure the current step's control whenever the step (or the window) changes.
  useEffect(() => {
    if (!visible || !step?.target) return;
    let active = true;
    const target = step.target;
    (async () => {
      let rect: Rect | null = null;
      if (target.kind === 'control') {
        rect = await measureTarget(target.id);
      } else {
        const screen = await new Promise<Rect | null>((resolve) => {
          const node = screenRef.current;
          if (!node) return resolve(null);
          node.measureInWindow((x, y, w, h) => resolve(w > 0 ? { x, y, width: w, height: h } : null));
        });
        rect = screen ? tabRect(screen, winH, winW, TAB_ORDER.indexOf(target.tab), TAB_ORDER.length) : null;
      }
      const onScreen = rect && rect.y >= 0 && rect.y + rect.height <= winH + 1;
      if (active) setHole(onScreen ? rect : null);
    })();
    return () => {
      active = false;
    };
  }, [visible, step, screenRef, winH, winW]);

  const close = (status: 'completed' | 'skipped') => {
    setVisible(false);
    if (uid) AsyncStorage.setItem(userScopedKey(uid, SEEN_KEY + TOUR_VERSION), '1').catch(() => undefined);
    usersApi
      .recordProductTour({
        platform: 'mobile',
        status,
        source,
        version: TOUR_VERSION,
        lastStepId: steps[index]?.id,
        stepsViewed: viewed.current,
        totalSteps: steps.length,
      })
      .catch(() => undefined);
  };

  if (!step) return null;
  const last = index === steps.length - 1;
  const go = (next: number) => {
    setHole(null);
    setIndex(next);
    viewed.current = Math.max(viewed.current, next + 1);
  };
  const r = step.target ? hole : null;
  const dim = 'rgba(0,22,51,0.62)';
  // Card goes below the control when it sits in the top half, above it otherwise.
  const below = r ? r.y + r.height / 2 < winH / 2 : false;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => close('skipped')}>
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {r ? (
          <>
            <View style={[styles.dim, { backgroundColor: dim, top: 0, left: 0, right: 0, height: Math.max(0, r.y - PAD) }]} />
            <View style={[styles.dim, { backgroundColor: dim, top: r.y + r.height + PAD, left: 0, right: 0, bottom: 0 }]} />
            <View style={[styles.dim, { backgroundColor: dim, top: r.y - PAD, left: 0, width: Math.max(0, r.x - PAD), height: r.height + PAD * 2 }]} />
            <View style={[styles.dim, { backgroundColor: dim, top: r.y - PAD, left: r.x + r.width + PAD, right: 0, height: r.height + PAD * 2 }]} />
            <View
              pointerEvents="none"
              style={[
                styles.ring,
                { borderColor: theme.colors.primary, top: r.y - PAD, left: r.x - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 },
              ]}
            />
          </>
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: dim }]} />
        )}

        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            { backgroundColor: theme.colors.background, borderColor: theme.colors.border },
            r
              ? below
                ? { top: Math.min(r.y + r.height + PAD + 12, winH - 300) }
                : { bottom: Math.max(winH - (r.y - PAD) + 12, 16) }
              : { top: winH * 0.28 },
          ]}
        >
          <View style={styles.top}>
            <View style={[styles.iconTile, { backgroundColor: theme.colors.primarySoft }]}>
              <Icon name={step.icon} size={20} color={theme.colors.primary} />
            </View>
            <ThemedText variant="caption" color="muted">
              {index + 1} of {steps.length}
            </ThemedText>
          </View>
          <ThemedText variant="subtitle" accessibilityRole="header" style={styles.title}>
            {step.title}
          </ThemedText>
          <ThemedText variant="body" color="muted" style={styles.body}>
            {step.body}
          </ThemedText>
          <View style={styles.actions}>
            {index > 0 ? (
              <View style={styles.flex}>
                <PrimaryButton variant="secondary" label="Back" onPress={() => go(index - 1)} />
              </View>
            ) : null}
            <View style={styles.flex}>
              <PrimaryButton label={last ? 'Finish' : 'Next'} onPress={() => (last ? close('completed') : go(index + 1))} />
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
  dim: { position: 'absolute' },
  ring: { position: 'absolute', borderWidth: 3, borderRadius: 14 },
  sheet: { position: 'absolute', left: 16, right: 16, borderRadius: 20, borderWidth: 1, padding: 18, maxWidth: 520, alignSelf: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  iconTile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { marginBottom: 6, fontFamily: 'SpaceGrotesk_700Bold' },
  body: { lineHeight: 22 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  flex: { flex: 1 },
  skip: { alignSelf: 'center', marginTop: 8, minHeight: 44, justifyContent: 'center' },
});
