import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Zap, FileText, FolderOpen, LineChart, Webhook, Users,
  CreditCard, Settings, Building2, ExternalLink, Star, PanelLeftClose, Menu,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import TierBadge from './TierBadge';

const TIER_LIMITS = { starter: 5, professional: 50, agency: 200, enterprise: -1 };

// Shared left-hand navigation for every authenticated Dashboard-area page
// (Dashboard itself, Templates, Analytics, Integrations, ...). `activeId`
// highlights the current item; `onSelectView` is only passed by Dashboard.jsx
// itself, letting it switch its internal tabs (home/generate/reports/billing)
// without a full navigation -- every other page falls back to routing to
// /dashboard for those tab-only items since they have no dedicated route.
const DashboardSidebar = ({ activeId, onSelectView }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const { user, userProfile, tier, reportsRemaining } = useAuth();

  const tierLimit = TIER_LIMITS[tier] ?? 1;
  const usedThisMonth = userProfile?.reportsThisMonth || 0;
  const usagePercent = tierLimit === -1 ? 0 : Math.min(100, Math.round((usedThisMonth / tierLimit) * 100));

  const navLinks = [
    { id: 'home', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'generate', label: 'Generate Report', icon: Zap },
    { id: 'reports', label: 'My Reports', icon: FileText },
    { id: 'templates', label: 'Templates', icon: FolderOpen, href: '/templates' },
    { id: 'analytics', label: 'Analytics', icon: LineChart, href: '/analytics' },
    { id: 'integrations', label: 'Integrations', icon: Webhook, href: '/integrations' },
    ...(tier === 'agency' || tier === 'enterprise' ? [{ id: 'crm', label: 'CRM', icon: Users, href: '/crm' }] : []),
    { id: 'billing', label: 'Usage & Billing', icon: CreditCard },
    { id: 'settings', label: 'Settings', icon: Settings, href: '/settings' },
    ...(tier === 'enterprise' ? [
      { id: 'organization', label: 'Organization', icon: Building2, href: '/organization' },
      { id: 'enterprise', label: 'Enterprise Portal', icon: ExternalLink, href: '/enterprise-dashboard' },
    ] : []),
  ];

  const handleSelect = (link) => {
    setSidebarOpen(false);
    if (link.href) {
      navigate(link.href);
    } else if (onSelectView) {
      onSelectView(link.id);
    } else {
      navigate('/dashboard');
    }
  };

  return (
    <>
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close dashboard navigation"
          className="fixed inset-0 top-16 z-40 bg-black/35 backdrop-blur-[1px] md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed bottom-0 left-0 top-16 z-50 flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-r border-gray-200 bg-surface px-3 py-4 shadow-xl transition-transform duration-300 scrollbar-hide md:sticky md:top-16 md:z-20 md:h-[calc(100vh-4rem)] md:w-64 md:translate-x-0 md:rounded-r-3xl md:shadow-sm ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="shrink-0 flex items-center justify-between px-1 md:hidden">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
            Dashboard
          </p>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="rounded-xl border border-gray-200 bg-bg p-2 text-gray-600 shadow-sm"
            aria-label="Close dashboard navigation"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>

        {/* Profile Card */}
        <div className="shrink-0 rounded-2xl overflow-hidden border border-gray-200 bg-bg">
          {/* Banner */}
          <div className="h-16 relative bg-gradient-to-br from-brand-500 via-brand-400 to-amber-400">
            <div className="absolute inset-0 opacity-20"
              style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(255,255,255,.15) 8px, rgba(255,255,255,.15) 16px)' }} />
            {/* Avatar */}
            <div className="absolute -bottom-5 left-4">
              {userProfile?.logoUrl
                ? <img src={userProfile.logoUrl} alt="avatar"
                    className="w-11 h-11 rounded-xl border-2 border-white object-cover shadow-sm" />
                : (
                  <div className="w-11 h-11 rounded-xl border-2 border-white shadow-sm bg-gradient-to-br from-brand-500 to-amber-500 flex items-center justify-center text-white font-bold text-lg">
                    {(userProfile?.displayName || user?.email || 'U')[0].toUpperCase()}
                  </div>
                )
              }
            </div>
            {/* Tier pill */}
            <div className="absolute top-2.5 right-2.5">
              <TierBadge tier={tier} />
            </div>
          </div>

          {/* Info */}
          <div className="pt-7 px-4 pb-4">
            <p className="text-gray-900 font-bold text-sm leading-tight">
              {userProfile?.displayName || 'Welcome Back'}
            </p>
            <p className="text-gray-400 text-xs mt-0.5 truncate">{user?.email}</p>

            {/* Stats row */}
            <div className="grid grid-cols-2 gap-2 mt-3">
              <div className="rounded-lg bg-brand-50 border border-brand-100 px-2.5 py-2 text-center">
                <p className="text-brand-500 font-bold text-base leading-none">{usedThisMonth}</p>
                <p className="text-gray-400 text-[10px] mt-0.5 leading-none">This month</p>
              </div>
              <div className="rounded-lg bg-gray-50 border border-gray-100 px-2.5 py-2 text-center">
                <p className="text-gray-700 font-bold text-base leading-none">
                  {(userProfile?.reportsGenerated || 0)}
                </p>
                <p className="text-gray-400 text-[10px] mt-0.5 leading-none">Total reports</p>
              </div>
            </div>

            {/* Usage bar */}
            <div className="mt-3">
              <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                <span>Monthly limit</span>
                <span className="font-semibold text-gray-500">
                  {usedThisMonth} / {tierLimit === -1 ? '∞' : tierLimit}
                </span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${
                  usagePercent >= 90 ? 'bg-red-500' : usagePercent >= 70 ? 'bg-amber-400' : 'bg-brand-500'
                }`} style={{ width: `${tierLimit === -1 ? 0 : usagePercent}%` }} />
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                {reportsRemaining === -1 ? 'Unlimited' : `${reportsRemaining} remaining`}
              </p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="shrink-0 flex flex-col gap-0.5">
          {navLinks.map(link => (
            <button key={link.id}
              onClick={() => handleSelect(link)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeId === link.id
                  ? 'bg-brand-500 text-white shadow-sm shadow-brand-200'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-bg hover:shadow-sm hover:border hover:border-gray-100'
              }`}>
              <link.icon className="w-4 h-4 shrink-0" />
              {link.label}
            </button>
          ))}
        </nav>

        {/* Upgrade CTA */}
        {tier === 'starter' && (
          <div className="shrink-0 rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-amber-50 p-4">
            <p className="text-xs font-bold text-gray-800 mb-0.5">Unlock More Reports</p>
            <p className="text-[10px] text-gray-500 leading-relaxed mb-3">
              Starter plan: {tierLimit} report/mo with watermark. Upgrade for more.
            </p>
            <button onClick={() => navigate('/pricing')}
              className="w-full bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5">
              <Star className="w-3 h-3" /> Upgrade Plan
            </button>
          </div>
        )}
        {tier === 'professional' && (
          <div className="shrink-0 rounded-2xl border border-blue-100 bg-blue-50/50 p-3">
            <p className="text-[10px] font-semibold text-blue-700 mb-2">Professional Plan</p>
            <button onClick={() => navigate('/pricing')}
              className="w-full border border-blue-200 text-blue-600 hover:bg-blue-100 text-xs font-medium py-1.5 rounded-lg transition-colors">
              View Agency Plan
            </button>
          </div>
        )}
      </aside>

      {/* Mobile: floating trigger to reopen the sidebar */}
      <button
        type="button"
        onClick={() => setSidebarOpen(true)}
        className="fixed bottom-5 left-4 z-30 flex h-12 w-12 items-center justify-center rounded-2xl bg-navy-700 text-white shadow-lg shadow-navy-900/20 md:hidden"
        aria-label="Open dashboard navigation"
        aria-expanded={sidebarOpen}
      >
        <Menu className="h-5 w-5" />
      </button>
    </>
  );
};

export default DashboardSidebar;
