import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { useAuth } from './context/AuthContext.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import PageLoader from './components/PageLoader.jsx';
import Seo from './components/Seo.jsx';
import { getAdminEmail } from './utils/adminEmail.js';
import GlobalSearch from './components/GlobalSearch.jsx';

const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
};

// Lightweight fallback for lazy-chunk loading only — deliberately not the
// branded video PageLoader. That video restarts from frame 0 on every fresh
// mount, so stacking it here *and* in AuthRedirect/ProtectedRoute right after
// made the loading sequence visibly replay 2-3 times per page load. This
// chunk-load gap is normally sub-100ms, so a plain spinner is all it needs —
// the video is reserved for the one meaningful auth/profile loading phase.
const SuspenseFallback = () => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-bg" role="status" aria-live="polite" aria-label="Loading">
    <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

// Lazy load all pages
const Home = lazy(() => import('./pages/Home.jsx'));
const Auth = lazy(() => import('./pages/Auth.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Onboarding = lazy(() => import('./pages/Onboarding.jsx'));
const PhotoLibrary = lazy(() => import('./pages/PhotoLibrary.jsx'));
const Pricing = lazy(() => import('./pages/Pricing.jsx'));
const Subscriptions = lazy(() => import('./pages/Subscriptions.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const CRM = lazy(() => import('./pages/CRM.jsx'));
const CRMClientProfile = lazy(() => import('./pages/CRMClientProfile.jsx'));
const CRMClaimProfile = lazy(() => import('./pages/CRMClaimProfile.jsx'));
const ReportPreviewPage = lazy(() => import('./pages/ReportPreviewPage.jsx'));
const Templates = lazy(() => import('./pages/Templates.jsx'));
const TemplateBuilder = lazy(() => import('./pages/TemplateBuilder.jsx'));
const Developers = lazy(() => import('./pages/Developers.jsx'));
const Features = lazy(() => import('./pages/Features.jsx'));
const PhotoAnalysis = lazy(() => import('./pages/PhotoAnalysis.jsx'));
const Solutions = lazy(() => import('./pages/Solutions.jsx'));
const SolutionDetail = lazy(() => import('./pages/SolutionDetail.jsx'));

const Contact = lazy(() => import('./pages/Contact.jsx'));
const FAQs = lazy(() => import('./pages/FAQs.jsx'));
const About = lazy(() => import('./pages/About.jsx'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy.jsx'));
const TermsOfService = lazy(() => import('./pages/TermsOfService.jsx'));
const AcceptableUsePolicy = lazy(() => import('./pages/AcceptableUsePolicy.jsx'));
const RefundPolicy = lazy(() => import('./pages/RefundPolicy.jsx'));
const DataProcessingAgreement = lazy(() => import('./pages/DataProcessingAgreement.jsx'));
const Subprocessors = lazy(() => import('./pages/Subprocessors.jsx'));
const WhiteLabelPortal = lazy(() => import('./pages/WhiteLabelPortal.jsx'));
const EnterpriseOnboarding = lazy(() => import('./pages/EnterpriseOnboarding.jsx'));
const AdminTierUpdate = lazy(() => import('./pages/AdminTierUpdate.jsx'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard.jsx'));
const EnterpriseDashboard = lazy(() => import('./pages/EnterpriseDashboard.jsx'));
const TeamMemberProfile = lazy(() => import('./pages/TeamMemberProfile.jsx'));
const Analytics = lazy(() => import('./pages/Analytics.jsx'));
const Integrations = lazy(() => import('./pages/Integrations.jsx'));
const OrganizationAdmin = lazy(() => import('./pages/OrganizationAdmin.jsx'));
const AuditLogs = lazy(() => import('./pages/AuditLogs.jsx'));
const AcceptInvite = lazy(() => import('./pages/AcceptInvite.jsx'));
const CookiesPolicy = lazy(() => import('./pages/CookiesPolicy.jsx'));
const SharedReport = lazy(() => import('./pages/SharedReport.jsx'));
const Security = lazy(() => import('./pages/Security.jsx'));

const AuthRedirect = ({ children }) => {
  const { isAuthenticated, loading, emailVerified, user } = useAuth();
  const [searchParams] = useSearchParams();

  if (loading) return <PageLoader />;
  if (!isAuthenticated) return children;

  const pendingPlan = searchParams.get('plan');
  const isGoogleUser = user?.providerData?.some(p => p.providerId === 'google.com');

  // Don't redirect unverified email/password users — Auth.jsx shows verification screen
  if (!emailVerified && !isGoogleUser) return children;

  // Don't redirect if there's a pending paid plan — Auth.jsx handles checkout
  if (pendingPlan && pendingPlan !== 'starter') return children;

  const destination = user?.email?.trim().toLowerCase() === getAdminEmail()
    ? '/admin'
    : '/dashboard';

  return <Navigate to={destination} replace />;
};

// `/auth` is kept working permanently (bookmarks, emails, old links) but no
// longer rendered directly — it now resolves to the dedicated /login or
// /signup route, preserving every query param (?plan=, ?redirect=, etc.) and
// router state (ProtectedRoute's `{ from: location }`) across the hop.
const AuthLegacyRedirect = () => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode') === 'signup' ? 'signup' : 'login';
  const rest = new URLSearchParams(searchParams);
  rest.delete('mode');
  const qs = rest.toString();
  return <Navigate to={`/${mode}${qs ? `?${qs}` : ''}`} replace state={location.state} />;
};

const App = () => {
  const { isAuthenticated } = useAuth();
  return (
    <ErrorBoundary>
    <ScrollToTop />
    {/* Mounted once at the app root (not per-page) so CMD/CTRL+K and the
        Navbar's search trigger work from anywhere in the authenticated app;
        gated on auth since search/notifications require a signed-in user. */}
    {isAuthenticated && <GlobalSearch />}
    <Suspense fallback={<SuspenseFallback />}>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<AuthRedirect><Auth /></AuthRedirect>} />
        <Route path="/signup" element={<AuthRedirect><Auth /></AuthRedirect>} />
        <Route path="/auth" element={<AuthLegacyRedirect />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/features" element={<Features />} />
        <Route path="/photo-analysis" element={<PhotoAnalysis />} />
        <Route path="/solutions" element={<Solutions />} />
        <Route path="/solutions/:slug" element={<SolutionDetail />} />
        {/* ApiDocs.jsx kept intact for future use — route disabled, redirects home */}
        <Route path="/docs/api" element={<Navigate to="/" replace />} />
        <Route path="/developers" element={<Developers />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/faqs" element={<FAQs />} />
        <Route path="/about" element={<About />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/terms-of-service" element={<TermsOfService />} />
        <Route path="/acceptable-use-policy" element={<AcceptableUsePolicy />} />
        <Route path="/refund-policy" element={<RefundPolicy />} />
        <Route path="/data-processing-agreement" element={<DataProcessingAgreement />} />
        <Route path="/subprocessors" element={<Subprocessors />} />
        <Route path="/enterprise/:subdomain" element={<EnterpriseOnboarding />} />
        <Route path="/invite/:token" element={<AcceptInvite />} />
        <Route path="/shared/:token" element={<SharedReport />} />
        <Route path="/cookies-policy" element={<CookiesPolicy />} />
        <Route path="/security" element={<Security />} />

        {/* Protected routes */}
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/onboarding" element={<ProtectedRoute skipOnboardingGate><Onboarding /></ProtectedRoute>} />
        <Route path="/photos" element={<ProtectedRoute><PhotoLibrary /></ProtectedRoute>} />
        <Route path="/reports/:id/preview" element={<ProtectedRoute><ReportPreviewPage /></ProtectedRoute>} />
        <Route path="/templates" element={<ProtectedRoute><Templates /></ProtectedRoute>} />
        <Route path="/templates/new" element={<ProtectedRoute><TemplateBuilder /></ProtectedRoute>} />
        <Route path="/templates/:id/edit" element={<ProtectedRoute><TemplateBuilder /></ProtectedRoute>} />
        <Route path="/subscriptions" element={<ProtectedRoute><Subscriptions /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="/crm" element={<ProtectedRoute requiredTier="agency"><CRM /></ProtectedRoute>} />
        <Route path="/crm/clients/:clientId" element={<ProtectedRoute requiredTier="agency"><CRMClientProfile /></ProtectedRoute>} />
        <Route path="/crm/claims/:claimId" element={<ProtectedRoute requiredTier="agency"><CRMClaimProfile /></ProtectedRoute>} />
        <Route path="/white-label" element={<ProtectedRoute requiredTier="enterprise"><WhiteLabelPortal /></ProtectedRoute>} />
        <Route path="/admin-tier-update" element={<ProtectedRoute><AdminTierUpdate /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
        <Route path="/enterprise-dashboard" element={<ProtectedRoute requiredTier="enterprise"><EnterpriseDashboard /></ProtectedRoute>} />
        <Route path="/team/members/:memberId" element={<ProtectedRoute requiredTier="enterprise"><TeamMemberProfile /></ProtectedRoute>} />
        <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
        <Route path="/integrations" element={<ProtectedRoute><Integrations /></ProtectedRoute>} />
        <Route path="/organization" element={<ProtectedRoute requiredTier="enterprise"><OrganizationAdmin /></ProtectedRoute>} />
        <Route path="/audit-logs" element={<ProtectedRoute requiredTier="enterprise"><AuditLogs /></ProtectedRoute>} />

        {/* 404 */}
        <Route path="*" element={
          <div className="min-h-screen bg-bg flex items-center justify-center text-center p-4">
            <Seo title="Page Not Found — FlacronAI" description="The page you're looking for doesn't exist." path={null} noindex />
            <div>
              <h1 className="text-8xl font-black text-brand-500/20 mb-4">404</h1>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Page not found</h2>
              <p className="text-gray-600 mb-8">The page you're looking for doesn't exist.</p>
              <a href="/" className="btn-primary inline-block">Go Home</a>
            </div>
          </div>
        } />
      </Routes>
    </Suspense>
    </ErrorBoundary>
  );
};

export default App;
