import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, Mail, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext.jsx';
import MfaGate from './MfaGate.jsx';
import PageLoader from './PageLoader.jsx';

const ProtectedRoute = ({ children, requiredTier, skipOnboardingGate }) => {
  const {
    isAuthenticated,
    loading,
    profileLoading,
    profileError,
    retryProfile,
    tier,
    user,
    emailVerified,
    reloadUser,
    userProfile,
    mfaVerified,
    markMfaVerified,
  } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [resending, setResending] = useState(false);
  const [resendDone, setResendDone] = useState(false);

  if (loading || (!!user && profileLoading)) {
    return <PageLoader />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (profileError || !userProfile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg p-4">
        <div className="card w-full max-w-md p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50">
            <AlertCircle className="h-7 w-7 text-amber-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Account data unavailable</h1>
          <p className="mt-2 text-sm text-gray-600">
            {profileError || 'Your account data has not loaded yet.'}
          </p>
          <button
            type="button"
            onClick={retryProfile}
            className="btn-primary mt-6 inline-flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Retry loading
          </button>
        </div>
      </div>
    );
  }

  // Check email verification for email/password users (Google users already verified)
  const isGoogleUser = user?.providerData?.some(p => p.providerId === 'google.com');
  if (!emailVerified && !isGoogleUser) {
    return (
      <div className="min-h-screen bg-[#ffffff] flex items-center justify-center p-4">
        <div className="card p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Mail className="w-8 h-8 text-brand-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Verify Your Email</h2>
          <p className="text-gray-600 text-sm mb-6">
            Please verify your email address to access your dashboard. Check your inbox for the verification link.
          </p>
          <button
            onClick={async () => { await reloadUser(); }}
            className="btn-primary w-full mb-3 flex items-center justify-center gap-2"
          >
            I've Verified My Email
          </button>
          {resendDone ? (
            <p className="text-green-600 text-sm font-medium">Email sent! Check your inbox.</p>
          ) : (
            <button
              onClick={async () => {
                setResending(true);
                try {
                  const { authAPI } = await import('../services/api.js');
                  await authAPI.sendVerification();
                  setResendDone(true);
                  setTimeout(() => setResendDone(false), 30000);
                } catch (err) {
                  console.error('Resend verification error:', err?.response?.data || err.message);
                  toast.error('Could not send email. Check console for details.');
                }
                setResending(false);
              }}
              disabled={resending}
              className="text-brand-500 hover:text-brand-600 text-sm font-medium underline disabled:opacity-50"
            >
              {resending ? 'Sending...' : 'Resend verification email'}
            </button>
          )}
          <button
            onClick={() => navigate('/login')}
            className="block mx-auto mt-4 text-gray-500 hover:text-gray-700 text-xs"
          >
            ← Back to sign in
          </button>
        </div>
      </div>
    );
  }

  if (userProfile?.mfaEnabled && !mfaVerified) {
    return <MfaGate onVerified={markMfaVerified} />;
  }

  // Phase 21 (Onboarding Flow): `onboardingCompleted === false` is the ONLY
  // value that means "genuinely needs it" -- `undefined` (an existing,
  // pre-Phase-21 account) and `true` (already finished) both fall through
  // here untouched, so an existing user is never incorrectly forced through
  // it. `/onboarding` itself passes `skipOnboardingGate` to avoid redirecting
  // to itself; it handles its own "already done -> bounce to /dashboard"
  // case internally.
  if (!skipOnboardingGate && userProfile?.onboardingCompleted === false && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  if (requiredTier) {
    const tierOrder = ['starter', 'professional', 'agency', 'enterprise'];
    const userIdx = tierOrder.indexOf(tier);
    const reqIdx = tierOrder.indexOf(requiredTier);
    if (userIdx < reqIdx) {
      return (
        <div className="min-h-screen bg-bg flex items-center justify-center p-4">
          <div className="card p-8 max-w-md w-full text-center">
            <div className="text-4xl mb-4">🔒</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Upgrade Required</h2>
            <p className="text-gray-600 mb-6">
              This feature requires <strong className="text-brand-400 capitalize">{requiredTier}</strong> tier or higher.
              You're currently on <strong className="text-gray-900 capitalize">{tier}</strong>.
            </p>
            <a href="/pricing" className="btn-primary inline-block">View Pricing Plans</a>
          </div>
        </div>
      );
    }
  }

  return children;
};

export default ProtectedRoute;
