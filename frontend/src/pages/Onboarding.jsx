import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Sparkles, ArrowRight, ArrowLeft, User, Building2, ShieldCheck,
  ClipboardCheck, Wrench, MoreHorizontal, Users, UserPlus, RefreshCw,
  AlertCircle, Zap, SkipForward,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { usersAPI, teamsAPI } from '../services/api.js';
import { ONBOARDING_USER_TYPES, ONBOARDING_VOLUMES, ONBOARDING_LAST_STEP } from '../utils/onboarding.js';
import Seo from '../components/Seo.jsx';

// Phase 21 (Onboarding Flow). Step numbering is fixed (0-4) regardless of
// team-invite eligibility -- the step ITSELF (3) is simply omitted from the
// visible sequence for a non-enterprise account, rather than renumbered, so
// the persisted `onboardingStep` never means something different depending
// on tier (see backend/routes/users.js's onboarding routes for the matching
// server-side validation of this same numbering).
const STEP_WELCOME = 0;
const STEP_USER_TYPE = 1;
const STEP_VOLUME = 2;
const STEP_TEAM = 3;
const STEP_CTA = 4;

const USER_TYPE_ICONS = {
  independent_adjuster: User,
  adjusting_company: Building2,
  insurance_company: ShieldCheck,
  inspector: ClipboardCheck,
  contractor: Wrench,
  other: MoreHorizontal,
};

const StepShell = ({ children }) => (
  <div className="min-h-screen bg-bg flex items-center justify-center p-4 relative overflow-hidden">
    <div className="absolute inset-0">
      <div className="absolute top-1/4 -left-40 w-80 h-80 bg-brand-500/8 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-0 w-96 h-96 bg-amber-500/8 rounded-full blur-3xl" />
    </div>
    <div className="relative w-full max-w-lg">{children}</div>
  </div>
);

const ProgressDots = ({ visibleSteps, currentStep }) => (
  <div className="flex items-center justify-center gap-2 mb-6" role="progressbar"
    aria-valuemin={1} aria-valuemax={visibleSteps.length} aria-valuenow={visibleSteps.indexOf(currentStep) + 1}
    aria-label={`Step ${visibleSteps.indexOf(currentStep) + 1} of ${visibleSteps.length}`}>
    {visibleSteps.map((s) => (
      <span
        key={s}
        className={`h-1.5 rounded-full transition-all ${
          s === currentStep ? 'w-8 bg-brand-500' : visibleSteps.indexOf(s) < visibleSteps.indexOf(currentStep) ? 'w-4 bg-brand-300' : 'w-4 bg-gray-200'
        }`}
      />
    ))}
  </div>
);

const ErrorBanner = ({ message, onRetry }) => {
  if (!message) return null;
  return (
    <div className="flex items-center gap-2 p-3 mb-4 bg-red-500/10 border border-red-500/20 rounded-lg" role="alert">
      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
      <p className="text-red-600 text-sm flex-1">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="text-red-600 hover:text-red-700 text-xs font-semibold underline whitespace-nowrap">
          Retry
        </button>
      )}
    </div>
  );
};

const Onboarding = () => {
  const navigate = useNavigate();
  const { userProfile, tier, refreshProfile } = useAuth();

  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(STEP_WELCOME);
  const [userType, setUserType] = useState(null);
  const [monthlyVolume, setMonthlyVolume] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [lastAction, setLastAction] = useState(null); // retryable last attempted transition

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('');
  const [assignableRoles, setAssignableRoles] = useState([]);
  const [roleLabels, setRoleLabels] = useState({});
  const [inviting, setInviting] = useState(false);

  const isTeamEligible = tier === 'enterprise';
  const visibleSteps = isTeamEligible
    ? [STEP_WELCOME, STEP_USER_TYPE, STEP_VOLUME, STEP_TEAM, STEP_CTA]
    : [STEP_WELCOME, STEP_USER_TYPE, STEP_VOLUME, STEP_CTA];

  // ProtectedRoute already guarantees userProfile is loaded (non-null, no
  // error) by the time this component mounts -- this effect only decides
  // whether onboarding even applies to THIS account, and syncs local step
  // state from the server exactly once, before anything renders (the `ready`
  // gate below avoids a one-frame flash of step 0 for an account resuming
  // mid-flow at a later step).
  useEffect(() => {
    if (!userProfile) return;
    // `undefined` (an existing, pre-Phase-21 account) or `true` (already
    // finished, in this tab or another) -- never show this again.
    if (userProfile.onboardingCompleted !== false) {
      navigate('/dashboard', { replace: true });
      return;
    }
    setStep(Math.min(Math.max(userProfile.onboardingStep ?? 0, 0), ONBOARDING_LAST_STEP));
    setUserType(userProfile.onboardingUserType || null);
    setMonthlyVolume(userProfile.onboardingMonthlyVolume || null);
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (step !== STEP_TEAM) return;
    teamsAPI.getRoles()
      .then((res) => {
        const assignable = res.data?.assignableRoles || [];
        setAssignableRoles(assignable);
        setRoleLabels(res.data?.roles || {});
        setInviteRole((prev) => prev || assignable[0] || '');
      })
      .catch(() => {}); // non-fatal -- the step still offers Skip
  }, [step]);

  const persistStep = useCallback(async (targetStep, extra = {}) => {
    setSaving(true);
    setError(null);
    try {
      const res = await usersAPI.saveOnboardingStep({ step: targetStep, ...extra });
      // A stale tab after onboarding was already finished elsewhere (another
      // tab, or a completed enterprise-subdomain skip) -- the server no-ops
      // rather than erroring, so this must redirect away itself instead of
      // advancing a step that no longer means anything.
      if (res.data?.alreadyCompleted) {
        await refreshProfile();
        navigate('/dashboard', { replace: true });
        return false;
      }
      // Keep AuthContext's userProfile in sync so a refresh, another tab, or
      // ProtectedRoute's own gate all see the exact same server truth this
      // page just wrote -- never rely on optimistic local state alone.
      await refreshProfile();
      setStep(targetStep);
      setLastAction(null);
      return true;
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save your progress. Please check your connection and try again.');
      setLastAction(() => () => persistStep(targetStep, extra));
      return false;
    } finally {
      setSaving(false);
    }
  }, [refreshProfile, navigate]);

  const handleFinish = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await usersAPI.completeOnboarding({});
      await refreshProfile();
      // Dashboard.jsx reads this the same way it already reads ?openReport=
      // -- clears the query param and opens the generate wizard directly.
      navigate('/dashboard?startWizard=1', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Could not finish onboarding. Please try again.');
      setLastAction(() => handleFinish);
    } finally {
      setSaving(false);
    }
  }, [navigate, refreshProfile]);

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !/\S+@\S+\.\S+/.test(inviteEmail)) {
      toast.error('Enter a valid email address');
      return;
    }
    setInviting(true);
    try {
      await teamsAPI.invite(inviteEmail.trim(), inviteRole);
      toast.success(`Invitation sent to ${inviteEmail.trim()}`);
      setInviteEmail('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Invite failed');
    } finally {
      setInviting(false);
    }
  };

  if (!ready) {
    return (
      <StepShell>
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </StepShell>
    );
  }

  return (
    <StepShell>
      <Seo title="Welcome — FlacronAI" description="Set up your FlacronAI account." path={null} noindex />
      <div className="card p-8">
        <ProgressDots visibleSteps={visibleSteps} currentStep={step} />
        <ErrorBanner message={error} onRetry={lastAction} />

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.18 }}
          >
            {step === STEP_WELCOME && (
              <div className="text-center">
                <div className="w-16 h-16 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
                  <Sparkles className="w-8 h-8 text-brand-500" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome to FlacronAI</h1>
                <p className="text-gray-600 text-sm mb-8">
                  Let's set up your account in a few quick steps so your first report goes smoothly.
                </p>
                <button
                  type="button"
                  onClick={() => persistStep(STEP_USER_TYPE)}
                  disabled={saving}
                  className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                >
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <>Get Started <ArrowRight className="w-4 h-4" /></>}
                </button>
              </div>
            )}

            {step === STEP_USER_TYPE && (
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-1">What best describes you?</h2>
                <p className="text-gray-500 text-sm mb-6">This helps us tailor your experience.</p>
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {ONBOARDING_USER_TYPES.map(({ value, label }) => {
                    const Icon = USER_TYPE_ICONS[value] || MoreHorizontal;
                    const selected = userType === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setUserType(value)}
                        aria-pressed={selected}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 text-center transition-colors ${
                          selected ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <Icon className={`w-5 h-5 ${selected ? 'text-brand-600' : 'text-gray-400'}`} />
                        <span className={`text-xs font-semibold ${selected ? 'text-brand-700' : 'text-gray-700'}`}>{label}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <button type="button" onClick={() => persistStep(STEP_WELCOME)} disabled={saving} className="btn-secondary flex items-center gap-2 text-sm py-2.5 px-4 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100">
                    <ArrowLeft className="w-4 h-4" /> Back
                  </button>
                  <button
                    type="button"
                    onClick={() => persistStep(STEP_VOLUME, { userType })}
                    disabled={saving || !userType}
                    className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                  >
                    {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <>Next <ArrowRight className="w-4 h-4" /></>}
                  </button>
                </div>
              </div>
            )}

            {step === STEP_VOLUME && (
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-1">How many reports do you generate per month?</h2>
                <p className="text-gray-500 text-sm mb-6">A rough estimate is fine — you can change plans anytime.</p>
                <div className="space-y-2.5 mb-6">
                  {ONBOARDING_VOLUMES.map(({ value, label }) => {
                    const selected = monthlyVolume === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setMonthlyVolume(value)}
                        aria-pressed={selected}
                        className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-colors ${
                          selected ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <span className={`text-sm font-semibold ${selected ? 'text-brand-700' : 'text-gray-700'}`}>{label}</span>
                        {selected && <span className="w-4 h-4 rounded-full bg-brand-500" />}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <button type="button" onClick={() => persistStep(STEP_USER_TYPE)} disabled={saving} className="btn-secondary flex items-center gap-2 text-sm py-2.5 px-4 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100">
                    <ArrowLeft className="w-4 h-4" /> Back
                  </button>
                  <button
                    type="button"
                    onClick={() => persistStep(isTeamEligible ? STEP_TEAM : STEP_CTA, { monthlyVolume })}
                    disabled={saving || !monthlyVolume}
                    className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                  >
                    {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <>Next <ArrowRight className="w-4 h-4" /></>}
                  </button>
                </div>
              </div>
            )}

            {step === STEP_TEAM && isTeamEligible && (
              <div>
                <div className="w-14 h-14 bg-brand-50 rounded-2xl flex items-center justify-center mb-4">
                  <Users className="w-7 h-7 text-brand-500" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-1">Invite your team</h2>
                <p className="text-gray-500 text-sm mb-6">Optional — you can always invite people later from Team settings.</p>
                <div className="flex flex-col sm:flex-row gap-2.5 mb-6">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@yourcompany.com"
                    className="input sm:flex-1"
                    aria-label="Teammate email"
                  />
                  <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="input sm:w-40" aria-label="Role">
                    {assignableRoles.map((r) => (
                      <option key={r} value={r}>{roleLabels[r]?.label || r}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleInvite}
                    disabled={inviting || !assignableRoles.length}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    {inviting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Invite
                  </button>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <button type="button" onClick={() => persistStep(STEP_VOLUME)} disabled={saving} className="btn-secondary flex items-center gap-2 text-sm py-2.5 px-4 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100">
                    <ArrowLeft className="w-4 h-4" /> Back
                  </button>
                  <button
                    type="button"
                    onClick={() => persistStep(STEP_CTA)}
                    disabled={saving}
                    className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                  >
                    {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <>Continue <SkipForward className="w-4 h-4" /></>}
                  </button>
                </div>
              </div>
            )}

            {step === STEP_CTA && (
              <div className="text-center">
                <div className="w-16 h-16 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
                  <Zap className="w-8 h-8 text-brand-500" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">You're all set</h2>
                <p className="text-gray-600 text-sm mb-8">
                  Let's generate your first automated inspection report.
                </p>
                <button
                  type="button"
                  onClick={handleFinish}
                  disabled={saving}
                  className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                >
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <>Generate Your First Report <ArrowRight className="w-4 h-4" /></>}
                </button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </StepShell>
  );
};

export default Onboarding;
