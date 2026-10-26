/**
 * The single source of truth for mobile auth/session state — mirrors
 * `frontend/src/context/AuthContext.jsx` behavior exactly where the underlying mechanism
 * is identical (same Firebase project, same backend `GET /users/profile` contract), and
 * documents where mobile deliberately differs (see inline comments below and
 * AUTHENTICATION_ARCHITECTURE.md §4/§5/§6).
 *
 * Ordinary logout is intentionally LOCAL-ONLY, matching web exactly (2026-09-08 rollout-
 * safety correction, AUTHENTICATION_ARCHITECTURE.md §12.3): it clears the local Firebase
 * session and the stored MFA assertion, nothing more. An earlier version of this file called
 * the backend's `POST /auth/logout` here too ("a deliberate mobile improvement over web") —
 * that call is now removed. `/auth/logout` is reserved as an explicit all-sessions/
 * future-refresh revocation operation, not something ordinary Sign Out should invoke
 * silently on either platform; see that route's own header comment in
 * `backend/routes/auth.js` for its exact semantics. `authApi.logout` still exists as a typed
 * wrapper for a future explicit "sign out everywhere" action, if one is ever built — it is
 * simply not called from this function.
 *
 * Deliberate scope reduction vs. web (documented, not a silent omission): web's background
 * profile-refetch-with-backoff also listens for `window.online`/`visibilitychange` browser
 * events to retry immediately on reconnect. React Native has no such built-in browser
 * event; adding `@react-native-community/netinfo` purely for this optimization was judged
 * not worth a new dependency for Phase 3 — the timed backoff retry (below) still recovers
 * without it, just not instantly on reconnect. `AppState` (already available, no new
 * dependency) is used instead to retry when the app returns to the foreground, which
 * covers the most common real-world case (backgrounding during a network blip).
 */
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile as firebaseUpdateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';

import { getFirebaseAuth } from '@/services/firebase/client';
import { authApi } from '@/services/api/auth';
import { usersApi } from '@/services/api/users';
import { setFederatedSessionRefresher, subscribeToMfaRequired } from '@/services/api/client';
import { isFederatedLoginEnabled } from '@/config/identityConfig';
import { ApiRequestError } from '@/types/api';
import { clearMfaAssertion, setMfaAssertion } from '@/services/mfaAssertionStorage';
import { prepareLocalDataForUser, wipeLocalUserData } from '@/services/localData/userDataLifecycle';
import { runSignOutTasks } from '../signOutTasks';
import { clearPendingReport } from '@/features/navigation/pendingDeepLink';
import { isFirebaseConfigured } from '@/config/firebaseConfig';
import type { AuthStatus, UserProfile } from '../types';
import { computeAuthStatus } from './authStatus';
import { signInWithGoogle, signOutOfGoogle } from '../services/googleSignIn';
import { signInWithApple } from '../services/appleSignIn';
import {
  FederatedSignInError,
  exchangeToStaging,
  signInToIdentityWithGoogle,
  signInToIdentityWithPassword,
  signOutIdentity,
  stagingSessionClaims,
} from '../services/federatedLogin';

// QA federation: re-exchange this long before the backend's 1h session max age.
const FEDERATED_REFRESH_LEAD_SECONDS = 10 * 60;
const FEDERATED_SESSION_MAX_AGE_SECONDS = 60 * 60;

function isSocialProviderUser(user: FirebaseUser | null): boolean {
  if (!user) return false;
  return user.providerData.some((p) => p.providerId === 'google.com' || p.providerId === 'apple.com');
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  status: AuthStatus;
  loading: boolean;
  profileLoading: boolean;
  profileError: string | null;
  emailVerified: boolean;
  isSocialProvider: boolean;
  mfaVerified: boolean;
  markMfaVerified: (mfaAssertion?: string) => void;
  /** QA federation: signed in with a FlacronAI website (production) account. */
  isFederated: boolean;
  /** QA federation: production MFA code still owed before a staging session exists. */
  federatedMfaPending: boolean;
  completeFederatedMfa: (code: string) => Promise<void>;
  /** QA federation: renews the staging session from the production sign-in. */
  refreshFederatedSession: () => Promise<boolean>;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<'success' | 'cancelled'>;
  loginWithApple: () => Promise<'success' | 'cancelled'>;
  register: (email: string, password: string, displayName: string) => Promise<FirebaseUser>;
  logout: () => Promise<void>;
  reloadUser: () => Promise<void>;
  refreshProfile: () => Promise<UserProfile | null>;
  retryProfile: () => Promise<UserProfile | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

const PROFILE_AUTO_RETRY_MAX = 4;

export function AuthProvider({ children }: PropsWithChildren) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  // Starts already-resolved (false) when Firebase isn't configured at all — there is
  // nothing to load, and setting this via setLoading() inside the effect below would be
  // a same-tick setState-in-effect (flagged by react-hooks/set-state-in-effect).
  const [loading, setLoading] = useState(() => isFirebaseConfigured());
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [mfaVerified, setMfaVerified] = useState(false);
  const [isFederated, setIsFederated] = useState(false);
  const [federatedMfaPending, setFederatedMfaPending] = useState(false);
  // QA federation bookkeeping: current staging uid, the session's exchange time, the
  // renewal timer, an in-flight renewal, and whether the next auth event is that renewal
  // (same account — must not wipe local data or reload the profile).
  const currentUid = useRef<string | null>(null);
  const fedAt = useRef<number | null>(null);
  const federatedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const federatedRefresh = useRef<Promise<boolean> | null>(null);
  const silentFederatedRefresh = useRef(false);
  const logoutRef = useRef<() => Promise<void>>(async () => {});

  const autoRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoRetryAttempt = useRef(0);
  // Bumped on every Firebase auth-state change. A profile response that started under an
  // earlier session (sign-out / account switch) is discarded instead of being shown for the
  // new one (Phase 9 hardening: account isolation).
  const authGeneration = useRef(0);

  const fetchUserProfile = useCallback(
    async (opts: { block?: boolean; retries?: number } = {}): Promise<UserProfile | null> => {
      const { block = false, retries = 0 } = opts;
      const generation = authGeneration.current;
      const stale = () => generation !== authGeneration.current;
      if (block) {
        setProfileLoading(true);
        setProfileError(null);
      }

      let lastError: unknown = null;
      try {
        for (let attempt = 0; attempt <= retries; attempt += 1) {
          try {
            const res = await usersApi.getProfile();
            if (stale()) return null;
            setUserProfile(res.user);
            setProfileError(null);
            return res.user;
          } catch (err) {
            if (stale()) return null;
            lastError = err;
            if (attempt < retries) {
              await wait(600 * (attempt + 1));
            }
          }
        }
        if (stale()) return null;
        console.error('fetchUserProfile error:', lastError instanceof Error ? lastError.message : lastError);
        setUserProfile(null);
        setProfileError('We could not load your account data. Please try again.');
        return null;
      } finally {
        if (block) setProfileLoading(false);
      }
    },
    []
  );

  const clearFederatedTimer = useCallback(() => {
    if (federatedTimer.current) clearTimeout(federatedTimer.current);
    federatedTimer.current = null;
  }, []);

  const refreshFnRef = useRef<() => Promise<boolean>>(async () => false);

  const scheduleFederatedRefresh = useCallback(
    (exchangedAt: number | null) => {
      clearFederatedTimer();
      fedAt.current = exchangedAt;
      if (!exchangedAt) return;
      const dueIn =
        exchangedAt + FEDERATED_SESSION_MAX_AGE_SECONDS - FEDERATED_REFRESH_LEAD_SECONDS - Math.floor(Date.now() / 1000);
      federatedTimer.current = setTimeout(() => {
        refreshFnRef.current().catch(() => {});
      }, Math.max(dueIn, 0) * 1000);
    },
    [clearFederatedTimer]
  );

  // QA federation: renews the staging session from the production sign-in. False when it
  // could not (offline, or MFA is owed again); signs out entirely when production no
  // longer accepts the sign-in (password changed, signed out everywhere, disabled, deleted).
  const refreshFederatedSession = useCallback(async (): Promise<boolean> => {
    if (!isFederatedLoginEnabled()) return false;
    if (federatedRefresh.current) return federatedRefresh.current;
    const run = (async () => {
      silentFederatedRefresh.current = true;
      try {
        const outcome = await exchangeToStaging({ forceRefresh: true });
        if (outcome === 'mfa_required') {
          // The production-MFA binding for this sign-in lapsed (12h): ask for the code.
          silentFederatedRefresh.current = false;
          setFederatedMfaPending(true);
          await signOut(getFirebaseAuth());
          return false;
        }
        const user = getFirebaseAuth().currentUser;
        if (user) {
          setFirebaseUser(user);
          scheduleFederatedRefresh((await stagingSessionClaims(user)).fedAt);
        }
        return true;
      } catch (err) {
        if ((err instanceof ApiRequestError && err.retryable) || (err as { code?: string })?.code === 'auth/network-request-failed') {
          return false;
        }
        silentFederatedRefresh.current = false;
        await logoutRef.current();
        return false;
      } finally {
        silentFederatedRefresh.current = false;
      }
    })();
    federatedRefresh.current = run;
    try {
      return await run;
    } finally {
      federatedRefresh.current = null;
    }
  }, [scheduleFederatedRefresh]);
  useEffect(() => {
    refreshFnRef.current = refreshFederatedSession;
  }, [refreshFederatedSession]);

  useEffect(() => (isFederatedLoginEnabled() ? setFederatedSessionRefresher(refreshFederatedSession) : undefined), [refreshFederatedSession]);

  // Renew on return to the foreground when the session is close to its max age.
  useEffect(() => {
    if (!isFederated) return undefined;
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || !fedAt.current) return;
      const age = Math.floor(Date.now() / 1000) - fedAt.current;
      if (age >= FEDERATED_SESSION_MAX_AGE_SECONDS - FEDERATED_REFRESH_LEAD_SECONDS) refreshFederatedSession().catch(() => {});
    });
    return () => sub.remove();
  }, [isFederated, refreshFederatedSession]);

  // Restore a persisted Firebase session on launch and react to sign-in/sign-out.
  useEffect(() => {
    if (!isFirebaseConfigured()) {
      // No Firebase config yet — `loading` already initialized to false above (see
      // ConfigRequiredScreen, rendered by the root layout instead of the normal auth flow).
      return undefined;
    }

    const auth = getFirebaseAuth();
    const timeout = setTimeout(() => setLoading(false), 10000);
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      clearTimeout(timeout);
      // QA federation renewal of the SAME account: keep data and profile as they are.
      if (user && silentFederatedRefresh.current && user.uid === currentUid.current) {
        setFirebaseUser(user);
        return;
      }
      currentUid.current = user?.uid ?? null;
      const generation = ++authGeneration.current;
      setFirebaseUser(user);
      setEmailVerified(user?.emailVerified ?? false);
      if (user) {
        setUserProfile(null);
        // A different account than last time on this device: drop the previous account's
        // drafts/cached files before anything of theirs could be shown.
        await prepareLocalDataForUser(user.uid);
        if (generation !== authGeneration.current) return;
        // QA federation: a restored session near/after its max age is renewed before any
        // data is requested; otherwise renewal is scheduled ahead of expiry.
        const claims = await stagingSessionClaims(user).catch(() => ({ federated: false, fedAt: null }));
        if (generation !== authGeneration.current) return;
        setIsFederated(claims.federated);
        if (claims.federated) {
          setFederatedMfaPending(false);
          const age = claims.fedAt ? Math.floor(Date.now() / 1000) - claims.fedAt : Number.POSITIVE_INFINITY;
          if (age >= FEDERATED_SESSION_MAX_AGE_SECONDS - FEDERATED_REFRESH_LEAD_SECONDS) {
            await refreshFnRef.current();
            if (generation !== authGeneration.current) return;
          } else {
            scheduleFederatedRefresh(claims.fedAt);
          }
        }
        await fetchUserProfile({ block: true, retries: 2 });
      } else {
        clearFederatedTimer();
        fedAt.current = null;
        setIsFederated(false);
        // Signed out (or no session restored): drop any stale MFA state -- a fresh
        // sign-in always needs its own fresh assertion (see mfaAssertionStorage.ts; a
        // stale one would fail its auth_time check anyway, this just avoids holding
        // onto it pointlessly).
        setUserProfile(null);
        setProfileError(null);
        setEmailVerified(false);
        setMfaVerified(false);
        await clearMfaAssertion();
      }
      // A newer auth event owns the loading state now.
      if (generation === authGeneration.current) setLoading(false);
    });

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drops back to the MFA gate the instant a protected request comes back
  // MFA_REQUIRED (assertion missing/expired/revoked) -- see client.ts's own comment.
  useEffect(() => subscribeToMfaRequired(() => setMfaVerified(false)), []);

  // Background auto-recovery with backoff when the profile fetch failed — mirrors
  // AuthContext.jsx's effect, minus the browser-only online/visibilitychange listeners
  // (see file header). Retries once more whenever the app returns to the foreground.
  useEffect(() => {
    if (!firebaseUser || !profileError) return undefined;

    let cancelled = false;
    autoRetryAttempt.current = 0;

    const attemptRetry = async () => {
      if (cancelled) return;
      autoRetryAttempt.current += 1;
      const result = await fetchUserProfile({ retries: 1 });
      if (cancelled || result) return;
      if (autoRetryAttempt.current < PROFILE_AUTO_RETRY_MAX) {
        const delay = Math.min(3000 * 2 ** (autoRetryAttempt.current - 1), 20000);
        autoRetryTimer.current = setTimeout(attemptRetry, delay);
      }
    };

    autoRetryTimer.current = setTimeout(attemptRetry, 3000);

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (cancelled || nextState !== 'active') return;
      if (autoRetryTimer.current) clearTimeout(autoRetryTimer.current);
      autoRetryAttempt.current = 0;
      attemptRetry();
    });

    return () => {
      cancelled = true;
      if (autoRetryTimer.current) clearTimeout(autoRetryTimer.current);
      appStateSub.remove();
    };
  }, [firebaseUser, profileError, fetchUserProfile]);

  // QA federation: production identity accepted -> staging session (or MFA owed). A wrong
  // or rate-limited MFA code keeps the production sign-in so the user can retry; any
  // other failure signs out of production so nothing is left half signed in.
  const finishFederatedSignIn = useCallback(async (mfaCode?: string) => {
    try {
      const outcome = await exchangeToStaging({ mfaCode });
      if (outcome === 'mfa_required') {
        setFederatedMfaPending(true);
        return;
      }
      setFederatedMfaPending(false);
      authApi.verify().catch(() => {});
    } catch (err) {
      const code = err instanceof ApiRequestError ? err.code : null;
      if (!(mfaCode && (code === 'INVALID_MFA_CODE' || code === 'MFA_RATE_LIMITED'))) {
        setFederatedMfaPending(false);
        await signOutIdentity();
      }
      throw err;
    }
  }, []);

  const completeFederatedMfa = useCallback((code: string) => finishFederatedSignIn(code.trim()), [finishFederatedSignIn]);

  const login = useCallback(
    async (email: string, password: string) => {
      setMfaVerified(false);
      await clearMfaAssertion();
      if (isFederatedLoginEnabled()) {
        setFederatedMfaPending(false);
        await signInToIdentityWithPassword(email, password);
        await finishFederatedSignIn();
        return;
      }
      await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
      authApi.verify().catch(() => {});
    },
    [finishFederatedSignIn]
  );

  const loginWithGoogle = useCallback(async () => {
    setMfaVerified(false);
    await clearMfaAssertion();
    if (isFederatedLoginEnabled()) {
      setFederatedMfaPending(false);
      const status = await signInToIdentityWithGoogle();
      if (status === 'cancelled') return 'cancelled';
      await finishFederatedSignIn();
      return 'success';
    }
    const outcome = await signInWithGoogle();
    if (outcome.status === 'success') {
      authApi.verify().catch(() => {});
    }
    return outcome.status;
  }, [finishFederatedSignIn]);

  const loginWithApple = useCallback(async () => {
    setMfaVerified(false);
    await clearMfaAssertion();
    const outcome = await signInWithApple();
    if (outcome.status === 'success') {
      authApi.verify().catch(() => {});
    }
    return outcome.status;
  }, []);

  const register = useCallback(async (email: string, password: string, displayName: string) => {
    // QA federation: accounts are created on the website only, never from the QA app.
    if (isFederatedLoginEnabled()) {
      throw new FederatedSignInError(
        'auth/federated-signup-disabled',
        'Create your account at flacronai.com, then sign in here with the same email and password.'
      );
    }
    setMfaVerified(false);
    await clearMfaAssertion();
    const auth = getFirebaseAuth();
    let result;
    try {
      result = await createUserWithEmailAndPassword(auth, email, password);
    } catch (err) {
      // Mirrors AuthContext.jsx's single retry-after-1.2s on a transient network blip.
      if ((err as { code?: string })?.code !== 'auth/network-request-failed') throw err;
      await wait(1200);
      result = await createUserWithEmailAndPassword(auth, email, password);
    }
    await firebaseUpdateProfile(result.user, { displayName });
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    // Local-only, matching web exactly — see file header for why the backend
    // POST /auth/logout call that used to be here was removed (2026-09-08
    // rollout-safety correction).
    // Pre-sign-out work (push-token removal) runs while the session still authenticates;
    // bounded and error-swallowing, so it can never block or fail Sign Out.
    await runSignOutTasks();
    clearFederatedTimer();
    await signOut(getFirebaseAuth());
    // Also forget the production sign-in (QA federation) and the Google account choice,
    // so the next sign-in can pick a different account.
    if (isFederatedLoginEnabled()) await signOutIdentity();
    else await signOutOfGoogle();
    setFederatedMfaPending(false);
    setIsFederated(false);
    setFirebaseUser(null);
    setUserProfile(null);
    setProfileError(null);
    setEmailVerified(false);
    setMfaVerified(false);
    await clearMfaAssertion();
    // Nothing from this account (wizard drafts, cached photos, exported files, a pending
    // report link) stays on the device after an explicit Sign Out.
    clearPendingReport();
    await wipeLocalUserData();
  }, [clearFederatedTimer]);
  useEffect(() => {
    logoutRef.current = logout;
  }, [logout]);

  const reloadUser = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (auth.currentUser) {
      await auth.currentUser.reload();
      setEmailVerified(auth.currentUser.emailVerified);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (firebaseUser) return fetchUserProfile();
    return null;
  }, [firebaseUser, fetchUserProfile]);

  const retryProfile = useCallback(async () => {
    if (firebaseUser) return fetchUserProfile({ block: true, retries: 2 });
    return null;
  }, [firebaseUser, fetchUserProfile]);

  const markMfaVerified = useCallback((mfaAssertion?: string) => {
    if (mfaAssertion) setMfaAssertion(mfaAssertion).catch(() => {});
    setMfaVerified(true);
  }, []);

  const isSocialProvider = isSocialProviderUser(firebaseUser);

  const status: AuthStatus = computeAuthStatus({
    loading,
    hasFirebaseUser: !!firebaseUser,
    profileLoading,
    profileError,
    userProfile,
    emailVerified,
    isSocialProvider,
    mfaVerified,
    federatedMfaPending,
  });

  const value: AuthContextValue = {
    firebaseUser,
    userProfile,
    status,
    loading,
    profileLoading,
    profileError,
    emailVerified,
    isSocialProvider,
    mfaVerified,
    markMfaVerified,
    isFederated,
    federatedMfaPending,
    completeFederatedMfa,
    refreshFederatedSession,
    login,
    loginWithGoogle,
    loginWithApple,
    register,
    logout,
    reloadUser,
    refreshProfile,
    retryProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
