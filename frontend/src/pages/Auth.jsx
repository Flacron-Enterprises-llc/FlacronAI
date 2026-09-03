import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Mail, Lock, User, ArrowRight, AlertCircle, RefreshCw, CheckCircle } from 'lucide-react';
import { FcGoogle } from 'react-icons/fc';
import toast from 'react-hot-toast';
import { getAdditionalUserInfo } from 'firebase/auth';
import { useAuth } from '../context/AuthContext.jsx';
import { authAPI, paymentAPI, usersAPI } from '../services/api.js';
import { auth } from '../config/firebase.js';
import Seo from '../components/Seo.jsx';
import useEscapeToClose from '../hooks/useEscapeToClose';
import { getAdminEmail } from '../utils/adminEmail.js';
import { validatePassword, PASSWORD_REQUIREMENTS_HINT } from '../utils/passwordValidation.js';

// Version of the Terms + Privacy Policy a user agrees to at sign-up. Matches the
// "Last updated" date shown on both /terms-of-service and /privacy-policy. Bump
// this when either document materially changes so consent stays auditable.
const REGISTRATION_POLICY_VERSION = '2026-03-01';

// Route (/login, /signup) is authoritative; ?mode=signup is kept only as a
// fallback for any caller that still lands on this component another way
// (e.g. a stale deep link) — see also App.jsx's AuthLegacyRedirect for /auth.
const modeFromLocation = (pathname, searchParams) => {
  if (pathname === '/signup') return 'signup';
  if (pathname === '/login') return 'login';
  return searchParams.get('mode') === 'signup' ? 'signup' : 'login';
};

const Auth = () => {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [mode, setMode] = useState(() => modeFromLocation(location.pathname, searchParams));
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [errors, setErrors] = useState({});
  const [authState, setAuthState] = useState('form'); // 'form' | 'verifying' | 'processing'
  const [resendCooldown, setResendCooldown] = useState(0);
  useEscapeToClose(() => { setForgotOpen(false); setForgotSent(false); }, forgotOpen && !forgotLoading, forgotOpen);

  const [form, setForm] = useState({ email: '', password: '', confirmPassword: '', firstName: '', lastName: '', company: '' });
  // Required Terms + Privacy acknowledgement for sign-up. Never pre-checked.
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const { login, register, loginWithGoogle, emailVerified, reloadUser } = useAuth();

  const pendingPlan = searchParams.get('plan');

  // Keep `mode` in sync with the URL for direct navigation, browser
  // back/forward between /login and /signup, and refresh/bookmarks.
  useEffect(() => {
    setMode(modeFromLocation(location.pathname, searchParams));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Switching tabs (or the "Sign up free"/"Sign in" link) navigates to the
  // matching dedicated route, carrying router state (e.g. ProtectedRoute's
  // `{ from: location }`) along so a mode switch never loses the original
  // post-login destination. Pushes a new history entry (not `replace`) so the
  // browser Back button steps between /login and /signup as expected, instead
  // of jumping past both to whatever page preceded the auth flow entirely.
  const switchMode = (nextMode) => {
    setErrors({});
    setAgreedToTerms(false);
    const qs = searchParams.toString();
    navigate(`${nextMode === 'signup' ? '/signup' : '/login'}${qs ? `?${qs}` : ''}`, { state: location.state });
  };

  // Save pending plan to sessionStorage on mount so it survives auth redirects
  useEffect(() => {
    if (pendingPlan && pendingPlan !== 'starter') {
      sessionStorage.setItem('flac_pending_plan', pendingPlan);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePostAuth = useCallback(async (authenticatedUser = auth.currentUser) => {
    const adminEmail = getAdminEmail();
    const signedInEmail = authenticatedUser?.email?.trim().toLowerCase();

    if (signedInEmail === adminEmail) {
      navigate('/admin', { replace: true });
      return;
    }

    const planToUse = pendingPlan || sessionStorage.getItem('flac_pending_plan');
    if (planToUse && planToUse !== 'starter') {
      try {
        const res = await paymentAPI.createCheckout(planToUse);
        if (res.data?.url) {
          sessionStorage.removeItem('flac_pending_plan');
          window.location.href = res.data.url;
          return;
        }
        if (res.data?.changeType) {
          sessionStorage.removeItem('flac_pending_plan');
          navigate('/dashboard?billing=updated');
          return;
        }
      } catch {
        toast.error('Account created! Redirecting to plans...');
        navigate('/pricing');
        return;
      }
    }
    const requestedPath = location.state?.from?.pathname;
    const destination = requestedPath && !['/auth', '/login', '/signup'].includes(requestedPath) ? requestedPath : '/dashboard';
    navigate(destination, { replace: true });
  }, [location.state, pendingPlan, navigate]);

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setErrors(prev => ({ ...prev, [e.target.name]: '' }));
  };

  const validate = () => {
    const errs = {};
    if (!form.email) errs.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = 'Invalid email';
    if (!form.password) errs.password = 'Password is required';
    if (mode === 'signup') {
      if (!form.firstName.trim()) errs.firstName = 'First name is required';
      if (!form.lastName.trim()) errs.lastName = 'Last name is required';
      if (form.password) {
        const { valid, message } = validatePassword(form.password);
        if (!valid) errs.password = message;
      }
      if (form.password !== form.confirmPassword) errs.confirmPassword = 'Passwords do not match';
      if (!agreedToTerms) errs.agreedToTerms = 'You must agree to the Terms of Service and Privacy Policy to create an account';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // Firebase Auth only has one `displayName` field; firstName/lastName/company
  // are FlacronAI-specific and live in Firestore. getProfile() is called first
  // to make sure the FULL default profile doc (tier, usage counters, etc. --
  // see backend/routes/users.js's GET /profile auto-create) exists before
  // merging these extra fields on top; calling updateProfile() alone here
  // first would risk creating a partial doc missing those defaults, since
  // this runs on the very first authenticated request for a brand-new account.
  const persistSignupProfileDetails = async ({ firstName, lastName, company, displayName }) => {
    try {
      await usersAPI.getProfile();
      await usersAPI.updateProfile({ firstName, lastName, company, displayName });
    } catch (err) {
      console.error('Failed to persist signup profile details:', err?.response?.data || err.message);
    }
  };

  const handleResendVerification = async () => {
    try {
      await authAPI.sendVerification(pendingPlan || sessionStorage.getItem('flac_pending_plan'));
      toast.success('Verification email sent!');
      setResendCooldown(60);
      const interval = setInterval(() => {
        setResendCooldown(prev => {
          if (prev <= 1) { clearInterval(interval); return 0; }
          return prev - 1;
        });
      }, 1000);
    } catch {
      toast.error('Failed to resend. Please try again.');
    }
  };

  const handleCheckVerified = async () => {
    setAuthState('processing');
    await reloadUser();
    // Small delay to ensure Firebase has synced
    await new Promise(r => setTimeout(r, 500));
    if (auth.currentUser?.emailVerified) {
      await handlePostAuth();
    } else {
      setAuthState('verifying');
      toast.error('Email not verified yet. Please check your inbox.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      if (mode === 'login') {
        const result = await login(form.email, form.password);
        toast.success('Welcome back!');
        await handlePostAuth(result.user);
      } else {
        const firstName = form.firstName.trim();
        const lastName = form.lastName.trim();
        const company = form.company.trim();
        const displayName = `${firstName} ${lastName}`.trim();
        await register(form.email, form.password, displayName);
        toast.success('Account created! Please verify your email.');
        // Record the Terms + Privacy acceptance server-side (auditable). The auth
        // user now exists, so the request carries a valid token. Non-blocking —
        // a failure here must not strand a user who already has an account.
        usersAPI.recordRegistrationConsent(REGISTRATION_POLICY_VERSION).catch((err) => {
          console.error('Failed to record registration consent:', err?.response?.data || err.message);
        });
        // Fire verification email
        authAPI.sendVerification(pendingPlan || sessionStorage.getItem('flac_pending_plan')).catch((err) => {
          console.error('Failed to send verification email:', err?.response?.data || err.message);
          toast.error('Could not send verification email. Please use the resend button below.');
        });
        // Non-blocking — the verification screen shows regardless of whether this succeeds.
        persistSignupProfileDetails({ firstName, lastName, company, displayName });
        setAuthState('verifying');
      }
    } catch (err) {
      const code = err?.code;
      const msg =
        code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential'
          ? 'Invalid email or password'
          : code === 'auth/email-already-in-use'
          ? 'Email already registered. Please sign in instead.'
          : code === 'auth/account-exists-with-different-credential'
          ? 'An account with this email already exists. Please sign in with your email and password.'
          : code === 'auth/too-many-requests'
          ? 'Too many failed attempts. Please try again later or reset your password.'
          : code === 'auth/invalid-email'
          ? 'Invalid email address'
          : code === 'auth/network-request-failed'
          ? 'Unable to reach the sign-up service. Check your internet or DNS connection, then try again.'
          : err?.message || 'Authentication failed';
      toast.error(msg);
      setErrors({ general: msg });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    // In signup mode the Terms + Privacy acknowledgement is required before the
    // one-click account is created.
    if (mode === 'signup' && !agreedToTerms) {
      setErrors(prev => ({ ...prev, agreedToTerms: 'You must agree to the Terms of Service and Privacy Policy to create an account' }));
      return;
    }
    setLoading(true);
    try {
      const result = await loginWithGoogle();
      toast.success('Signed in with Google!');
      // A Google sign-in can also create a brand-new account. Record the Terms +
      // Privacy acceptance for first-time users (auditable), regardless of which
      // tab they used. Non-blocking.
      if (getAdditionalUserInfo(result)?.isNewUser) {
        usersAPI.recordRegistrationConsent(REGISTRATION_POLICY_VERSION).catch((err) => {
          console.error('Failed to record registration consent:', err?.response?.data || err.message);
        });
        // Derive first/last name from whatever Google actually gave us. The raw
        // Google profile (given_name/family_name) is the most reliable source;
        // fall back to splitting the Firebase displayName if that's all we have.
        const googleProfile = getAdditionalUserInfo(result)?.profile || {};
        const fallbackName = result.user?.displayName || '';
        const [fallbackFirst, ...fallbackRestParts] = fallbackName.trim().split(/\s+/).filter(Boolean);
        const firstName = googleProfile.given_name || fallbackFirst || '';
        const lastName = googleProfile.family_name || fallbackRestParts.join(' ') || '';
        if (firstName || lastName) {
          persistSignupProfileDetails({ firstName, lastName, company: '', displayName: fallbackName || undefined });
        }
      }
      // Google users are already verified — go straight to post-auth
      await handlePostAuth(result.user);
    } catch (err) {
      if (
        err?.code === 'auth/account-exists-with-different-credential' ||
        err?.code === 'auth/email-already-in-use'
      ) {
        const msg = 'An account with this email already exists. Please sign in with your email and password instead.';
        toast.error(msg, { duration: 5000 });
        setErrors({ general: msg });
        setMode('login');
      } else if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
        // user closed the popup — silent, no error toast
      } else if (err?.code === 'auth/popup-blocked') {
        toast.error('Pop-up was blocked by your browser. Please allow pop-ups for this site.');
      } else {
        toast.error('Google sign-in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setForgotLoading(true);
    try {
      await authAPI.forgotPassword(forgotEmail);
      setForgotSent(true);
    } catch {
      setForgotSent(true); // Don't reveal if email exists
    } finally {
      setForgotLoading(false);
    }
  };

  // ── Verification screen ──────────────────────────────────────────────────────
  if (authState === 'verifying' || authState === 'processing') {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4 relative overflow-hidden">
        <Seo title={mode === 'signup' ? 'Sign Up — FlacronAI' : 'Sign In — FlacronAI'} description="Sign in to FlacronAI or create a free account to generate your first automated insurance inspection report." path={mode === 'signup' ? '/signup' : '/login'} noindex />
        {/* Background */}
        <div className="absolute inset-0">
          <div className="absolute top-1/4 -left-40 w-80 h-80 bg-brand-500/8 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-0 w-96 h-96 bg-amber-500/8 rounded-full blur-3xl" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(249,115,22,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(249,115,22,0.02)_1px,transparent_1px)] bg-[size:48px_48px]" />
        </div>

        <div className="relative w-full max-w-md">
          {/* Logo */}
          <Link to="/" className="flex items-center justify-center gap-2.5 mb-8">
            <img src="/new-logo.png" alt="FlacronAI logo" className="h-12 w-auto object-contain" />
          </Link>

          <div className="card p-8 text-center">
            <div className="w-16 h-16 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <Mail className="w-8 h-8 text-brand-500" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Verify your email</h2>
            <p className="text-gray-600 text-sm mb-6">
              We sent a verification link to{' '}
              <strong className="text-gray-900">{form.email}</strong>.
              <br />Check your inbox and click the link to continue.
            </p>

            {authState === 'processing' ? (
              <div className="flex items-center justify-center gap-2 py-3 mb-4 text-gray-600">
                <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Checking verification status...</span>
              </div>
            ) : (
              <button
                onClick={handleCheckVerified}
                className="btn-primary w-full flex items-center justify-center gap-2 mb-3"
              >
                <CheckCircle className="w-4 h-4" />
                I've Verified My Email
              </button>
            )}

            {resendCooldown > 0 ? (
              <p className="text-gray-500 text-sm font-medium">Resend in {resendCooldown}s</p>
            ) : (
              <button
                onClick={handleResendVerification}
                className="btn-secondary w-full flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Resend Verification Email
              </button>
            )}

            <p className="mt-4 text-xs text-gray-500">
              Wrong email?{' '}
              <button
                onClick={() => setAuthState('form')}
                className="text-brand-500 hover:text-brand-600 font-medium underline"
              >
                Go back
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Main auth form ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 -left-40 w-80 h-80 bg-brand-500/8 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-0 w-96 h-96 bg-amber-500/8 rounded-full blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(249,115,22,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(249,115,22,0.02)_1px,transparent_1px)] bg-[size:48px_48px]" />
      </div>

      <div className="relative w-full max-w-md">
        <Seo title={mode === 'signup' ? 'Sign Up — FlacronAI' : 'Sign In — FlacronAI'} description="Sign in to FlacronAI or create a free account to generate your first automated insurance inspection report." path={mode === 'signup' ? '/signup' : '/login'} noindex />
        <h1 className="sr-only">Sign in or create your FlacronAI account</h1>
        {/* Logo */}
        <Link to="/" className="flex items-center justify-center gap-2.5 mb-8">
          <img src="/new-logo.png" alt="FlacronAI logo" className="h-12 w-auto object-contain" />
        </Link>

        {/* Card */}
        <div className="card p-8">
          {/* Plan context banner */}
          {pendingPlan && pendingPlan !== 'starter' && (
            <div className="mb-6 px-4 py-3 bg-brand-50 border border-brand-200 rounded-xl text-sm text-brand-800">
              <span className="font-semibold">
                {pendingPlan.replace('_annual', '').charAt(0).toUpperCase() + pendingPlan.replace('_annual', '').slice(1)} Plan selected
              </span>
              {' '}— {mode === 'signup' ? 'create your account' : 'sign in'} to continue to payment.
            </div>
          )}

          {/* Tab toggle */}
          <div className="flex bg-gray-100 rounded-xl p-1 mb-8">
            {['login', 'signup'].map(m => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all capitalize ${mode === m ? 'bg-brand-500 text-gray-900 shadow-lg' : 'text-gray-600 hover:text-gray-900'}`}
              >
                {m === 'login' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: mode === 'login' ? -20 : 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: mode === 'login' ? 20 : -20 }}
              transition={{ duration: 0.2 }}
            >
              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === 'signup' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">First Name</label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input
                          name="firstName"
                          type="text"
                          value={form.firstName}
                          onChange={handleChange}
                          placeholder="John"
                          className={`input pl-10 ${errors.firstName ? 'border-red-500' : ''}`}
                        />
                      </div>
                      {errors.firstName && <p className="text-red-400 text-xs mt-1">{errors.firstName}</p>}
                    </div>
                    <div>
                      <label className="label">Last Name</label>
                      <input
                        name="lastName"
                        type="text"
                        value={form.lastName}
                        onChange={handleChange}
                        placeholder="Smith"
                        className={`input ${errors.lastName ? 'border-red-500' : ''}`}
                      />
                      {errors.lastName && <p className="text-red-400 text-xs mt-1">{errors.lastName}</p>}
                    </div>
                  </div>
                )}

                <div>
                  <label className="label">{mode === 'signup' ? 'Work Email' : 'Email Address'}</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      name="email"
                      type="email"
                      value={form.email}
                      onChange={handleChange}
                      placeholder="you@company.com"
                      className={`input pl-10 ${errors.email ? 'border-red-500' : ''}`}
                    />
                  </div>
                  {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email}</p>}
                </div>

                {mode === 'signup' && (
                  <div>
                    <label className="label">Company <span className="text-gray-400 font-normal">(optional)</span></label>
                    <input
                      name="company"
                      type="text"
                      value={form.company}
                      onChange={handleChange}
                      placeholder="Acme Insurance Co."
                      className="input"
                    />
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="label mb-0">Password</label>
                    {mode === 'login' && (
                      <button type="button" onClick={() => setForgotOpen(true)} className="text-xs text-brand-400 hover:text-brand-300">
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      value={form.password}
                      onChange={handleChange}
                      placeholder={mode === 'signup' ? 'Min. 12 characters' : '••••••••'}
                      className={`input pl-10 pr-10 ${errors.password ? 'border-red-500' : ''}`}
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'} title={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {errors.password ? (
                    <p className="text-red-400 text-xs mt-1">{errors.password}</p>
                  ) : mode === 'signup' ? (
                    <p className="text-gray-500 text-xs mt-1">{PASSWORD_REQUIREMENTS_HINT}</p>
                  ) : null}
                </div>

                {mode === 'signup' && (
                  <div>
                    <label className="label">Confirm Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input
                        name="confirmPassword"
                        type={showPassword ? 'text' : 'password'}
                        value={form.confirmPassword}
                        onChange={handleChange}
                        placeholder="Repeat password"
                        className={`input pl-10 ${errors.confirmPassword ? 'border-red-500' : ''}`}
                      />
                    </div>
                    {errors.confirmPassword && <p className="text-red-400 text-xs mt-1">{errors.confirmPassword}</p>}
                  </div>
                )}

                {mode === 'signup' && (
                  <div>
                    <label htmlFor="agree-terms" className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        id="agree-terms"
                        name="agreedToTerms"
                        type="checkbox"
                        checked={agreedToTerms}
                        onChange={(e) => {
                          setAgreedToTerms(e.target.checked);
                          setErrors(prev => ({ ...prev, agreedToTerms: '' }));
                        }}
                        aria-invalid={!!errors.agreedToTerms}
                        aria-describedby={errors.agreedToTerms ? 'agree-terms-error' : undefined}
                        className={`mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 accent-[#FD4403] focus:ring-2 focus:ring-brand-500 ${errors.agreedToTerms ? 'ring-2 ring-red-500' : ''}`}
                      />
                      <span className="text-xs text-gray-600 leading-relaxed">
                        I have read and agree to the{' '}
                        <Link to="/terms-of-service" target="_blank" rel="noopener noreferrer" className="text-brand-500 hover:underline font-medium">Terms of Service</Link>
                        {' '}and{' '}
                        <Link to="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-brand-500 hover:underline font-medium">Privacy Policy</Link>.
                      </span>
                    </label>
                    {errors.agreedToTerms && (
                      <p id="agree-terms-error" className="text-red-400 text-xs mt-1.5">{errors.agreedToTerms}</p>
                    )}
                  </div>
                )}

                {errors.general && (
                  <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <p className="text-red-400 text-sm">{errors.general}</p>
                  </div>
                )}

                <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-gray-300 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      {mode === 'login'
                        ? 'Sign In'
                        : pendingPlan && pendingPlan !== 'starter'
                        ? 'Continue to Payment'
                        : 'Create Free Account'}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Divider */}
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-gray-600 text-xs">or continue with</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>

              {/* Google */}
              <button
                onClick={handleGoogle}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-gray-100 hover:bg-gray-100 border border-gray-200 rounded-xl text-gray-900 text-sm font-medium transition-all"
              >
                <FcGoogle className="w-5 h-5" />
                Continue with Google
              </button>

            </motion.div>
          </AnimatePresence>
        </div>

        <p className="text-center text-gray-500 text-sm mt-4">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')} className="text-brand-400 hover:text-brand-300 font-medium">
            {mode === 'login' ? 'Sign up free' : 'Sign in'}
          </button>
        </p>
      </div>

      {/* Forgot Password Modal */}
      <AnimatePresence>
        {forgotOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-300 backdrop-blur-sm"
            onClick={() => { setForgotOpen(false); setForgotSent(false); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="card p-8 w-full max-w-sm"
              role="dialog" aria-modal="true" aria-labelledby="reset-password-title"
              onClick={e => e.stopPropagation()}
            >
              <h3 id="reset-password-title" className="text-xl font-bold text-gray-900 mb-2">Reset Password</h3>
              {forgotSent ? (
                <div>
                  <p className="text-gray-600 text-sm mb-4">If that email exists, a reset link has been sent.</p>
                  <button onClick={() => { setForgotOpen(false); setForgotSent(false); }} className="btn-primary w-full">Done</button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword}>
                  <p className="text-gray-600 text-sm mb-4">Enter your email to receive a reset link.</p>
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="input mb-4"
                    required
                  />
                  <button type="submit" disabled={forgotLoading} className="btn-primary w-full flex items-center justify-center gap-2">
                    {forgotLoading ? <div className="w-4 h-4 border-2 border-gray-300 border-t-white rounded-full animate-spin" /> : 'Send Reset Link'}
                  </button>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Auth;
