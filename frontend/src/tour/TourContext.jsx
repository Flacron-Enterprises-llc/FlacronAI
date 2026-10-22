import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { usersAPI } from '../services/api.js';
import { getAdminEmail } from '../utils/adminEmail.js';
import { trackFeatureUsed } from '../lib/growthEngine.js';
import { TOUR_VERSION, buildTourSteps, resolveTourRole } from './tourSteps.js';
import { START_TOUR_EVENT } from './tourEvents.js';
import ProductTour from './ProductTour.jsx';

const TourContext = createContext({ active: false, step: null });

export const useTour = () => useContext(TourContext);

// The dashboard's sidebar is what the tour highlights, so it only starts once that is on screen.
const ANCHOR = '[data-tour="nav-home"]';
const AUTO_START_DELAY_MS = 900;

const seenKey = (uid) => `flacron_tour_seen_${uid}`;
const seenLocally = (uid) => {
  try {
    return Number(localStorage.getItem(seenKey(uid)) || 0) >= TOUR_VERSION;
  } catch {
    return false;
  }
};
const rememberLocally = (uid) => {
  try {
    localStorage.setItem(seenKey(uid), String(TOUR_VERSION));
  } catch {
    // Storage blocked: the server copy still stops it from starting again.
  }
};

/** Resolves once `selector` is in the DOM (or after `timeoutMs`, with false). */
function waitFor(selector, timeoutMs = 6000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (document.querySelector(selector)) return resolve(true);
      if (Date.now() - started > timeoutMs) return resolve(false);
      return setTimeout(tick, 120);
    };
    tick();
  });
}

/**
 * Owns the interactive app tour: starts it by itself once on a user's first
 * dashboard visit (after the onboarding wizard), restarts it on "Replay app
 * tour", and records completion on the user's profile so it never starts by
 * itself again (POST /api/users/product-tour, with a localStorage fallback).
 */
export function TourProvider({ children }) {
  const { user, userProfile, tier, refreshProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [run, setRun] = useState(null); // { steps, index, source }
  const pendingReplay = useRef(false);
  const autoStartedFor = useRef(null);
  const viewed = useRef(new Set());

  const uid = user?.uid || null;
  const onDashboard = location.pathname === '/dashboard';

  const begin = useCallback(
    async (source) => {
      if (!(await waitFor(ANCHOR))) return;
      const role = resolveTourRole(userProfile, uid);
      const steps = buildTourSteps({
        firstName: userProfile?.firstName || userProfile?.displayName?.split(' ')[0],
        tier,
        role,
        userType: userProfile?.onboardingUserType,
        company: userProfile?.company,
        isPlatformAdmin: Boolean(user?.email && user.email.trim().toLowerCase() === getAdminEmail()),
        hasSupportChat: Boolean(document.querySelector('[data-fcge-chat]')),
      });
      viewed.current = new Set([steps[0].id]);
      setRun({ steps, index: 0, source });
    },
    [user, uid, userProfile, tier],
  );

  // First dashboard visit: once per account (server flag), never mid-onboarding.
  useEffect(() => {
    if (!onDashboard || !uid || !userProfile || run) return undefined;
    if (autoStartedFor.current === uid) return undefined;
    if (userProfile.onboardingCompleted === false) return undefined;
    if ((userProfile.productTour?.version || 0) >= TOUR_VERSION || seenLocally(uid)) return undefined;
    autoStartedFor.current = uid;
    const timer = setTimeout(() => void begin('auto'), AUTO_START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [onDashboard, uid, userProfile, run, begin]);

  // "Replay app tour" from anywhere: go to the dashboard first if needed.
  useEffect(() => {
    const onStart = () => {
      if (!uid) return;
      if (window.location.pathname !== '/dashboard') {
        pendingReplay.current = true;
        navigate('/dashboard');
        return;
      }
      void begin('replay');
    };
    window.addEventListener(START_TOUR_EVENT, onStart);
    return () => window.removeEventListener(START_TOUR_EVENT, onStart);
  }, [uid, navigate, begin]);

  useEffect(() => {
    if (onDashboard && pendingReplay.current) {
      pendingReplay.current = false;
      void begin('replay');
    }
  }, [onDashboard, begin]);

  // Signing out (or another account signing in) ends a running tour.
  useEffect(() => {
    setRun(null);
  }, [uid]);

  const end = useCallback(
    (status) => {
      if (!run) return;
      const step = run.steps[run.index];
      setRun(null);
      if (!uid) return;
      rememberLocally(uid);
      if (status === 'completed') trackFeatureUsed('product_tour_completed', { source: run.source, steps: run.steps.length });
      usersAPI
        .saveProductTour({
          status,
          source: run.source,
          version: TOUR_VERSION,
          lastStepId: step?.id,
          stepsViewed: viewed.current.size,
          totalSteps: run.steps.length,
        })
        .then(() => refreshProfile())
        .catch((err) => console.warn('[Tour] could not save progress:', err?.message));
    },
    [run, uid, refreshProfile],
  );

  const go = useCallback((delta) => {
    setRun((current) => {
      if (!current) return current;
      const index = Math.min(current.steps.length - 1, Math.max(0, current.index + delta));
      viewed.current.add(current.steps[index].id);
      return { ...current, index };
    });
  }, []);

  const value = useMemo(
    () => ({ active: Boolean(run), step: run ? run.steps[run.index] : null }),
    [run],
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      {run && (
        <ProductTour
          steps={run.steps}
          index={run.index}
          onNext={() => go(1)}
          onBack={() => go(-1)}
          onSkip={() => end('skipped')}
          onFinish={(cta) => {
            end('completed');
            if (cta === 'generate') document.querySelector('[data-tour="nav-generate"]')?.click();
          }}
        />
      )}
    </TourContext.Provider>
  );
}
