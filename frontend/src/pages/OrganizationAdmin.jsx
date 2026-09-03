import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Users, FileText, Image as ImageIcon, HardDrive, Building2, Layers,
  FolderOpen, TrendingUp, ShieldCheck, ClipboardList, RefreshCw, AlertCircle, Lock,
  ExternalLink, UserCog,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import AuditLogViewer from '../components/AuditLogViewer';
import { organizationAPI, teamsAPI, templatesAPI, analyticsAPI } from '../services/api';
import { formatStatus } from '../utils/formatStatus';

// Phase 17 (Organization Admin & Audit Log Viewer). Standalone route ahead
// of the Phase 30 routing migration -- same precedent as Analytics.jsx/
// Integrations.jsx. Deliberately does NOT rebuild member-management
// (EnterpriseDashboard's Team tab), template editing (/templates), or the
// full analytics dashboard (/analytics) a second time -- per this phase's
// own risk note ("avoid two divergent enterprise-admin surfaces"), the
// Members/Templates/Usage tabs here are real, org-scoped SUMMARIES that link
// out to those already-built, already-tested surfaces for the actual
// mutation UI, while Teams/Security/Audit Logs are genuinely new content
// that exists nowhere else.
const TABS = [
  { id: 'members', label: 'Members', icon: Users },
  { id: 'teams', label: 'Teams', icon: Layers },
  { id: 'templates', label: 'Templates', icon: FolderOpen },
  { id: 'usage', label: 'Usage', icon: TrendingUp },
  { id: 'security', label: 'Security', icon: ShieldCheck },
  { id: 'audit-logs', label: 'Audit Logs', icon: ClipboardList },
];

const ROLE_COLORS = {
  owner: 'bg-brand-100 text-brand-700 border border-brand-200',
  admin: 'bg-blue-100 text-blue-700 border border-blue-200',
  manager: 'bg-teal-100 text-teal-700 border border-teal-200',
  adjuster: 'bg-violet-100 text-violet-700 border border-violet-200',
  inspector: 'bg-amber-100 text-amber-700 border border-amber-200',
  reviewer: 'bg-indigo-100 text-indigo-700 border border-indigo-200',
  viewer: 'bg-gray-100 text-gray-600 border border-gray-200',
  editor: 'bg-violet-100 text-violet-700 border border-violet-200',
};

function MetricCard({ label, value, icon: Icon, unavailable }) {
  return (
    <div className="card p-4">
      <div className="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center mb-2">
        <Icon className="w-4 h-4 text-brand-500" />
      </div>
      <p className={`text-xl font-bold ${unavailable ? 'text-gray-400 text-sm' : 'text-gray-900'}`}>
        {unavailable ? 'Not yet available' : value}
      </p>
      <p className="text-gray-500 text-xs mt-0.5">{label}</p>
    </div>
  );
}

export default function OrganizationAdmin() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(() => {
    const requested = searchParams.get('tab');
    return TABS.some((t) => t.id === requested) ? requested : 'members';
  });

  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorCode, setErrorCode] = useState(null);

  const [membersData, setMembersData] = useState(null);
  const [membersLoading, setMembersLoading] = useState(false);
  const [templatesData, setTemplatesData] = useState(null);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [usageData, setUsageData] = useState(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [securityData, setSecurityData] = useState(null);
  const [securityLoading, setSecurityLoading] = useState(false);

  const loadMetrics = useCallback(() => {
    setLoading(true);
    setErrorCode(null);
    organizationAPI.getMetrics()
      .then((res) => setMetrics(res.data?.metrics || null))
      .catch((err) => setErrorCode(err?.response?.data?.code || 'ERROR'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadMetrics(); }, [loadMetrics]);

  const setActiveTab = (id) => {
    setTab(id);
    setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set('tab', id); return next; });
  };

  useEffect(() => {
    if (errorCode) return;
    if (tab === 'members' && !membersData) {
      setMembersLoading(true);
      teamsAPI.getMembers().then((res) => setMembersData(res.data)).catch(() => setMembersData({ error: true })).finally(() => setMembersLoading(false));
    }
    if (tab === 'templates' && !templatesData) {
      setTemplatesLoading(true);
      templatesAPI.list().then((res) => setTemplatesData((res.data?.templates || []).filter((t) => t.scope === 'organization'))).catch(() => setTemplatesData([])).finally(() => setTemplatesLoading(false));
    }
    if (tab === 'usage' && !usageData) {
      setUsageLoading(true);
      analyticsAPI.get({ range: 'all' }).then((res) => setUsageData(res.data?.analytics || null)).catch(() => setUsageData({ error: true })).finally(() => setUsageLoading(false));
    }
    if (tab === 'security' && !securityData) {
      setSecurityLoading(true);
      organizationAPI.getSecuritySummary().then((res) => setSecurityData(res.data?.summary || null)).catch(() => setSecurityData({ error: true })).finally(() => setSecurityLoading(false));
    }
  }, [tab, errorCode, membersData, templatesData, usageData, securityData]);

  const restricted = errorCode === 'ORG_ADMIN_DENIED';
  const genuineError = errorCode && !restricted;

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 pt-24 pb-6">
        <div className="flex items-center gap-3 mb-5">
          <Link to="/dashboard" aria-label="Back to Dashboard" className="p-2 hover:bg-gray-100 rounded-lg transition-colors shrink-0">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900">Organization</h1>
            <p className="text-xs text-gray-500 mt-0.5">Members, usage, security, and activity across your organization.</p>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <RefreshCw className="w-8 h-8 text-brand-500 animate-spin" />
            <p className="text-sm text-gray-500">Loading organization data…</p>
          </div>
        ) : restricted ? (
          <div className="card flex flex-col items-center justify-center py-20 gap-3 text-center px-4">
            <Lock className="w-10 h-10 text-gray-300" />
            <div>
              <p className="text-gray-700 font-semibold">Organization administration is limited to Owners, Admins, and Managers</p>
              <p className="text-sm text-gray-400 mt-1">You can view your own profile from the Team tab in the Enterprise Portal.</p>
            </div>
            <Link to="/team/members/me" className="btn-secondary text-sm py-2 px-4">View My Profile</Link>
          </div>
        ) : genuineError ? (
          <div className="card flex flex-col items-center justify-center py-20 gap-3 text-center px-4">
            <AlertCircle className="w-10 h-10 text-amber-500" />
            <p className="text-gray-700 font-medium">Could not load organization data.</p>
            <button onClick={loadMetrics} className="btn-secondary text-sm py-2 px-4 flex items-center gap-2">
              <RefreshCw className="w-4 h-4" /> Retry
            </button>
          </div>
        ) : (
          <>
            {/* Org-level metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
              <MetricCard label="Users" value={metrics.users} icon={Users} />
              <MetricCard label="Reports" value={metrics.reports} icon={FileText} />
              <MetricCard label="Photos" value={metrics.photos} icon={ImageIcon} />
              <MetricCard label="Org Templates" value={metrics.templates} icon={FolderOpen} />
              <MetricCard label="Storage" unavailable icon={HardDrive} />
              <MetricCard label="Departments" unavailable icon={Building2} />
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap gap-1 mb-4 border-b border-gray-100">
              {TABS.map((t) => {
                const Icon = t.icon;
                return (
                  <button key={t.id} onClick={() => setActiveTab(t.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border-b-2 transition-colors ${
                      tab === t.id ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}>
                    <Icon className="w-4 h-4" /> {t.label}
                  </button>
                );
              })}
            </div>

            {/* Members */}
            {tab === 'members' && (
              <div className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-700">Roster ({metrics.users})</h2>
                  <button onClick={() => navigate('/enterprise-dashboard?view=team')} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5">
                    <UserCog className="w-3.5 h-3.5" /> Manage Team <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
                {membersLoading ? (
                  <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-12 w-full" />)}</div>
                ) : membersData?.error ? (
                  <p className="text-sm text-gray-500 text-center py-6">Could not load the roster.</p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-brand-50/40 border border-brand-100">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{membersData?.owner?.displayName || membersData?.owner?.email}</p>
                        <p className="text-xs text-gray-400 truncate">{membersData?.owner?.email}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${ROLE_COLORS.owner}`}>Owner</span>
                    </div>
                    {(membersData?.members || []).map((m) => (
                      <Link key={m.id} to={`/team/members/${m.id}`} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors">
                        <div className="min-w-0">
                          <p className="text-sm text-gray-900 truncate">{m.email}</p>
                          <p className="text-xs text-gray-400">Invited {m.invitedAt ? new Date(m.invitedAt).toLocaleDateString() : '—'}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${m.status === 'suspended' ? 'bg-red-100 text-red-700' : m.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{formatStatus(m.status)}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ROLE_COLORS[m.role] || 'bg-gray-100 text-gray-500'}`}>{formatStatus(m.role)}</span>
                        </div>
                      </Link>
                    ))}
                    {!membersData?.members?.length && <p className="text-sm text-gray-400 text-center py-4">No team members yet.</p>}
                  </div>
                )}
              </div>
            )}

            {/* Teams (role structure) */}
            {tab === 'teams' && (
              <div className="card p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-1">Team Structure</h2>
                <p className="text-xs text-gray-400 mb-4">This organization has a single flat team, broken down by role.</p>
                <div className="space-y-3">
                  {Object.entries(metrics.roleBreakdown || {}).sort((a, b) => b[1] - a[1]).map(([label, count]) => (
                    <div key={label}>
                      <div className="mb-1 flex justify-between text-xs"><span className="text-gray-600">{label}</span><span className="font-semibold text-gray-900">{count}</span></div>
                      <div className="h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full bg-brand-500" style={{ width: `${Math.round((count / Math.max(metrics.users, 1)) * 100)}%` }} /></div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Templates */}
            {tab === 'templates' && (
              <div className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-700">Organization Templates ({metrics.templates})</h2>
                  <Link to="/templates?tab=organization" className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5">
                    Manage Templates <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
                {templatesLoading ? (
                  <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-12 w-full" />)}</div>
                ) : !templatesData?.length ? (
                  <p className="text-sm text-gray-400 text-center py-6">No organization templates yet.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {templatesData.map((t) => (
                      <div key={t.id} className="p-3 rounded-xl border border-gray-100">
                        <p className="text-sm font-medium text-gray-900 truncate">{t.name}</p>
                        {t.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{t.description}</p>}
                        <p className="text-xs text-gray-400 mt-1">{t.sections?.length || 0} custom section{t.sections?.length === 1 ? '' : 's'}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Usage */}
            {tab === 'usage' && (
              <div className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-700">Organization Usage (All Time)</h2>
                  <Link to="/analytics" className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5">
                    Full Analytics <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
                {usageLoading || !usageData ? (
                  <div className="grid grid-cols-3 gap-3">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-16 w-full" />)}</div>
                ) : usageData?.error ? (
                  <p className="text-sm text-gray-500 text-center py-6">Could not load usage data.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                      <p className="text-2xl font-bold text-gray-900">{usageData.metrics.reportsGenerated}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Reports Generated</p>
                    </div>
                    <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                      <p className="text-2xl font-bold text-gray-900">{usageData.metrics.photosAnalyzed}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Photos Analyzed</p>
                    </div>
                    <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                      <p className="text-2xl font-bold text-gray-900">{usageData.metrics.avgCompletionHours == null ? 'Not enough data' : `${usageData.metrics.avgCompletionHours} hrs`}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Avg. Completion Time</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Security */}
            {tab === 'security' && (
              <div className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-700">Security Overview</h2>
                  <Link to="/settings?tab=security" className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5">
                    Personal Security Settings <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
                {securityLoading || !securityData ? (
                  <div className="grid grid-cols-2 gap-3">{[...Array(4)].map((_, i) => <div key={i} className="skeleton h-16 w-full" />)}</div>
                ) : securityData?.error ? (
                  <p className="text-sm text-gray-500 text-center py-6">Could not load the security summary.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                      <p className="text-2xl font-bold text-gray-900">{securityData.mfaAdoptionPercent}%</p>
                      <p className="text-xs text-gray-500 mt-0.5">MFA Adoption ({securityData.mfaEnabledCount}/{securityData.totalMembers})</p>
                    </div>
                    <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                      <p className={`text-2xl font-bold ${securityData.suspendedCount > 0 ? 'text-amber-600' : 'text-gray-900'}`}>{securityData.suspendedCount}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Suspended Members</p>
                    </div>
                    <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                      <p className="text-2xl font-bold text-gray-900">{securityData.legacyRoleCount}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Legacy Editor Roles</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Audit Logs */}
            {tab === 'audit-logs' && (
              <div className="card p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">Organization Activity</h2>
                <AuditLogViewer />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
