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
import { subscribeToMfaRequired } from '@/services/api/client';
import { clearMfaAssertion, setMfaAssertion } from '@/services/mfaAssertionStorage';
import { isFirebaseConfigured } from '@/config/firebaseConfig';
import type { AuthStatus, UserProfile } from '../types';
import { computeAuthStatus } from './authStatus';
import { signInWithGoogle } from '../services/googleSignIn';
import { signInWithApple } from '../services/appleSignIn';

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

  const autoRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoRetryAttempt = useRef(0);

  const fetchUserProfile = useCallback(
    async (opts: { block?: boolean; retries?: number } = {}): Promise<UserProfile | null> => {
      const { block = false, retries = 0 } = opts;
      if (block) {
        setProfileLoading(true);
        setProfileError(null);
      }

      let lastError: unknown = null;
      try {
        for (let attempt = 0; attempt <= retries; attempt += 1) {
          try {
            const res = await usersApi.getProfile();
            setUserProfile(res.user);
            setProfileError(null);
            return res.user;
          } catch (err) {
            lastError = err;
            if (attempt < retries) {
              await wait(600 * (attempt + 1));
            }
          }
        }
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
      setFirebaseUser(user);
      setEmailVerified(user?.emailVerified ?? false);
      if (user) {
        setUserProfile(null);
        await fetchUserProfile({ block: true, retries: 2 });
      } else {
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
      setLoading(false);
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

  const login = useCallback(async (email: string, password: string) => {
    setMfaVerified(false);
    await clearMfaAssertion();
    await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
    authApi.verify().catch(() => {});
  }, []);

  const loginWithGoogle = useCallback(async () => {
    setMfaVerified(false);
    await clearMfaAssertion();
    const outcome = await signInWithGoogle();
    if (outcome.status === 'success') {
      authApi.verify().catch(() => {});
    }
    return outcome.status;
  }, []);

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
    await signOut(getFirebaseAuth());
    setFirebaseUser(null);
    setUserProfile(null);
    setProfileError(null);
    setEmailVerified(false);
    setMfaVerified(false);
    await clearMfaAssertion();
  }, []);

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
