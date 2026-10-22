import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { CONSENT_CHANGED_EVENT, hasConsent } from '../utils/cookieConsent.js';
import {
  captureOfferHandoff,
  identifyGrowthUser,
  loadGrowthEngineSdk,
  reportUsageThreshold,
  resetGrowthIdentity,
  signOutGrowthUser,
  trackGrowthEvent,
  trackPageView,
} from '../lib/growthEngine.js';

const TIER_LIMITS = { starter: 5, professional: 50, agency: 200, enterprise: -1 };

/**
 * The one place the app talks to the Growth Engine about the session as a
 * whole: loading the SDK once analytics consent exists, page views, who is
 * signed in, sign-out, pricing visits, upgrade clicks and the monthly report
 * allowance. Mounted once at the root (main.jsx) so it sees the marketing
 * site, auth pages and the signed-in app alike.
 */
export default function GrowthEngineTracker() {
  const location = useLocation();
  const { user, userProfile, tier, emailVerified } = useAuth();
  const [consented, setConsented] = useState(() => hasConsent('analytics'));
  const previousPath = useRef(null);
  const previousUid = useRef(null);

  // Load the SDK when (and only when) analytics consent exists, including a
  // consent given later in the visit.
  useEffect(() => {
    const sync = () => {
      const granted = hasConsent('analytics');
      setConsented(granted);
      if (granted) {
        loadGrowthEngineSdk();
        // Anything identified before consent was dropped; send it again.
        resetGrowthIdentity();
      }
    };
    sync();
    window.addEventListener(CONSENT_CHANGED_EVENT, sync);
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, sync);
  }, []);

  // Offer links (?code=&fcge_ref=) can land on any page.
  useEffect(() => {
    captureOfferHandoff(location.search);
  }, [location.search]);

  // The SDK records the landing page itself, so only later client-side navigations are reported.
  useEffect(() => {
    const previous = previousPath.current;
    previousPath.current = location.pathname;
    if (previous !== null && previous !== location.pathname) trackPageView(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    if (location.pathname === '/pricing') trackGrowthEvent('pricing_page_visited', { path: location.pathname });
  }, [location.pathname, consented]);

  const isGoogleUser = user?.providerData?.some((p) => p.providerId === 'google.com');
  const verified = Boolean(user && (emailVerified || isGoogleUser));

  useEffect(() => {
    if (!consented || !verified || !userProfile) return;
    const isTeamMember = Boolean(userProfile.teamOwnerId && userProfile.teamOwnerId !== user.uid);
    identifyGrowthUser({
      id: user.uid,
      email: user.email,
      name: userProfile.displayName || user.displayName,
      firstName: userProfile.firstName,
      lastName: userProfile.lastName,
      company: userProfile.company,
      phone: userProfile.phone,
      // The job they told us in onboarding (independent adjuster, contractor, ...).
      role: userProfile.onboardingUserType || undefined,
      plan: tier,
      properties: {
        team_role: isTeamMember ? userProfile.teamRole || 'viewer' : 'owner',
        monthly_volume: userProfile.onboardingMonthlyVolume || null,
        reports_generated: userProfile.reportsGenerated || 0,
      },
    });
  }, [consented, verified, user, userProfile, tier]);

  useEffect(() => {
    if (!consented || !verified || !userProfile) return;
    reportUsageThreshold('reports', userProfile.reportsThisMonth || 0, TIER_LIMITS[tier] ?? 0);
  }, [consented, verified, userProfile, tier]);

  // Sign-out, or a different user signing in on this browser.
  useEffect(() => {
    const uid = user?.uid || null;
    const previous = previousUid.current;
    previousUid.current = uid;
    if (previous && previous !== uid) signOutGrowthUser();
  }, [user]);

  // One delegated listener rather than an onClick on every upgrade button:
  // anything marked data-fcge-upgrade="<plan>" (or "any") counts.
  useEffect(() => {
    const onClick = (event) => {
      if (!(event.target instanceof Element)) return;
      const marked = event.target.closest('[data-fcge-upgrade]');
      if (!marked) return;
      trackGrowthEvent('upgrade_clicked', { plan: marked.getAttribute('data-fcge-upgrade') || 'any', path: window.location.pathname });
    };
    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, []);

  return null;
}
