import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { useAuth } from './context/AuthContext.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import PageLoader from './components/PageLoader.jsx';
import Seo from './components/Seo.jsx';

const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
};

// Lazy load all pages
const Home = lazy(() => import('./pages/Home.jsx'));
const Auth = lazy(() => import('./pages/Auth.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Pricing = lazy(() => import('./pages/Pricing.jsx'));
const Subscriptions = lazy(() => import('./pages/Subscriptions.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const CRM = lazy(() => import('./pages/CRM.jsx'));
const CRMClientProfile = lazy(() => import('./pages/CRMClientProfile.jsx'));
const CRMClaimProfile = lazy(() => import('./pages/CRMClaimProfile.jsx'));
const ApiDocs = lazy(() => import('./pages/ApiDocs.jsx'));
const Developers = lazy(() => import('./pages/Developers.jsx'));

const Contact = lazy(() => import('./pages/Contact.jsx'));
const FAQs = lazy(() => import('./pages/FAQs.jsx'));
const About = lazy(() => import('./pages/About.jsx'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy.jsx'));
const TermsOfService = lazy(() => import('./pages/TermsOfService.jsx'));
const WhiteLabelPortal = lazy(() => import('./pages/WhiteLabelPortal.jsx'));
const EnterpriseOnboarding = lazy(() => import('./pages/EnterpriseOnboarding.jsx'));
const AdminTierUpdate = lazy(() => import('./pages/AdminTierUpdate.jsx'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard.jsx'));
const EnterpriseDashboard = lazy(() => import('./pages/EnterpriseDashboard.jsx'));
const AcceptInvite = lazy(() => import('./pages/AcceptInvite.jsx'));
const CookiesPolicy = lazy(() => import('./pages/CookiesPolicy.jsx'));
const SharedReport = lazy(() => import('./pages/SharedReport.jsx'));

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

  const adminEmail = (import.meta.env.VITE_ADMIN_EMAIL || '').trim().toLowerCase();
  const destination = adminEmail && user?.email?.trim().toLowerCase() === adminEmail
    ? '/admin'
    : '/dashboard';

  return <Navigate to={destination} replace />;
};

const App = () => {
  return (
    <ErrorBoundary>
    <ScrollToTop />
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<Home />} />
        <Route path="/auth" element={<AuthRedirect><Auth /></AuthRedirect>} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/docs/api" element={<ApiDocs />} />
        <Route path="/developers" element={<Developers />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/faqs" element={<FAQs />} />
        <Route path="/about" element={<About />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/terms-of-service" element={<TermsOfService />} />
        <Route path="/enterprise/:subdomain" element={<EnterpriseOnboarding />} />
        <Route path="/invite/:token" element={<AcceptInvite />} />
        <Route path="/shared/:token" element={<SharedReport />} />
        <Route path="/cookies-policy" element={<CookiesPolicy />} />

        {/* Protected routes */}
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/subscriptions" element={<ProtectedRoute><Subscriptions /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="/crm" element={<ProtectedRoute requiredTier="agency"><CRM /></ProtectedRoute>} />
        <Route path="/crm/clients/:clientId" element={<ProtectedRoute requiredTier="agency"><CRMClientProfile /></ProtectedRoute>} />
        <Route path="/crm/claims/:claimId" element={<ProtectedRoute requiredTier="agency"><CRMClaimProfile /></ProtectedRoute>} />
        <Route path="/white-label" element={<ProtectedRoute requiredTier="enterprise"><WhiteLabelPortal /></ProtectedRoute>} />
        <Route path="/admin-tier-update" element={<ProtectedRoute><AdminTierUpdate /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
        <Route path="/enterprise-dashboard" element={<ProtectedRoute requiredTier="enterprise"><EnterpriseDashboard /></ProtectedRoute>} />

        {/* 404 */}
        <Route path="*" element={
          <div className="min-h-screen bg-bg flex items-center justify-center text-center p-4">
            <Seo title="Page Not Found — FlacronAI" description="The page you're looking for doesn't exist." path={null} noindex />
            <div>
              <h1 className="text-8xl font-black text-orange-500/20 mb-4">404</h1>
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
