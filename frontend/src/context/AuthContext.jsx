import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile as firebaseUpdateProfile,
} from 'firebase/auth';
import { auth } from '../config/firebase.js';
import { usersAPI } from '../services/api.js';

const AuthContext = createContext(null);

const retryOnNetworkFailure = async (operation) => {
  try {
    return await operation();
  } catch (err) {
    if (err?.code !== 'auth/network-request-failed') throw err;
    await new Promise(resolve => setTimeout(resolve, 1200));
    return operation();
  }
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(null);
  const [emailVerified, setEmailVerified] = useState(false);
  // Tracks whether the TOTP second factor was confirmed for the current
  // session; reset on every fresh sign-in so MFA is never skipped.
  const [mfaVerified, setMfaVerified] = useState(false);

  // Fetch profile via backend API (Admin SDK — bypasses Firestore rules)
  const fetchUserProfile = useCallback(async ({ block = false, retries = 0 } = {}) => {
    if (block) {
      setProfileLoading(true);
      setProfileError(null);
    }

    let lastError = null;
    try {
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
          const res = await usersAPI.getProfile();
          if (!res.data?.user) throw new Error('Profile response was incomplete');
          setUserProfile(res.data.user);
          setProfileError(null);
          return res.data.user;
        } catch (err) {
          lastError = err;
          if (attempt < retries) {
            await new Promise(resolve => setTimeout(resolve, 600 * (attempt + 1)));
          }
        }
      }
      console.error('fetchUserProfile error:', lastError?.message);
      setUserProfile(null);
      setProfileError('We could not load your account data. Please try again.');
      return null;
    } finally {
      if (block) setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fallback: if Firebase doesn't respond in 10s (e.g. placeholder config, or slow
    // network after a Stripe checkout redirect), stop loading rather than hanging forever.
    const timeout = setTimeout(() => setLoading(false), 10000);
    let unsubscribe = () => {};
    try {
      unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        clearTimeout(timeout);
        setUser(firebaseUser);
        setEmailVerified(firebaseUser?.emailVerified || false);
        if (firebaseUser) {
          setUserProfile(null);
          await fetchUserProfile({ block: true, retries: 2 });
        } else {
          setUserProfile(null);
          setProfileError(null);
          setEmailVerified(false);
        }
        setLoading(false);
      });
    } catch (err) {
      clearTimeout(timeout);
      console.error('Firebase auth error:', err);
      setLoading(false);
    }
    return () => { clearTimeout(timeout); unsubscribe(); };
  }, [fetchUserProfile]);

  const login = async (email, password) => {
    setMfaVerified(false);
    return signInWithEmailAndPassword(auth, email, password);
  };

  const loginWithGoogle = async () => {
    setMfaVerified(false);
    const provider = new GoogleAuthProvider();
    return signInWithPopup(auth, provider);
  };

  const register = async (email, password, displayName) => {
    setMfaVerified(false);
    const result = await retryOnNetworkFailure(() =>
      createUserWithEmailAndPassword(auth, email, password)
    );
    await firebaseUpdateProfile(result.user, { displayName });
    return result;
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    setUserProfile(null);
    setProfileError(null);
    setMfaVerified(false);
  };

  const markMfaVerified = () => setMfaVerified(true);

  const updateProfile = async (data) => {
    if (!user) throw new Error('Not authenticated');
    await usersAPI.updateProfile(data);
    setUserProfile(prev => ({ ...prev, ...data }));
  };

  const refreshProfile = useCallback(async () => {
    if (user) return fetchUserProfile();
  }, [user, fetchUserProfile]);

  const retryProfile = useCallback(async () => {
    if (user) return fetchUserProfile({ block: true, retries: 2 });
    return null;
  }, [user, fetchUserProfile]);

  const reloadUser = useCallback(async () => {
    if (auth.currentUser) {
      await auth.currentUser.reload();
      setEmailVerified(auth.currentUser.emailVerified);
    }
  }, []);

  // Computed values
  const isAuthenticated = !!user && !loading;
  const tier = userProfile?.tier || 'starter';

  const reportsRemaining = (() => {
    const limits = { starter: 5, professional: 50, agency: 200, enterprise: -1 };
    const limit = limits[tier] ?? 1;
    if (limit === -1) return -1;
    return Math.max(0, limit - (userProfile?.reportsThisMonth || 0));
  })();

  const canGenerate = reportsRemaining === -1 || reportsRemaining > 0;

  const value = {
    user,
    userProfile,
    loading,
    profileLoading,
    profileError,
    emailVerified,
    mfaVerified,
    markMfaVerified,
    login,
    loginWithGoogle,
    register,
    logout,
    updateProfile,
    refreshProfile,
    retryProfile,
    fetchUserProfile,
    reloadUser,
    isAuthenticated,
    tier,
    canGenerate,
    reportsRemaining,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
