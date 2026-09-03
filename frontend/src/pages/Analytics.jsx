import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, RefreshCw, AlertCircle, FileText, Image as ImageIcon,
  Clock, TrendingUp, Users, BarChart3, Calendar,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import DashboardSidebar from '../components/DashboardSidebar';
import { analyticsAPI } from '../services/api';
import { formatStatus } from '../utils/formatStatus';

// Phase 15 (General Analytics Page). Standalone route ahead of the Phase 30
// routing migration -- same precedent as Templates.jsx/TeamMemberProject.jsx.
// All numbers come from GET /api/analytics (backend/services/analyticsService.js);
// nothing here is computed or fabricated client-side. `scope` (from the
// backend, based on Phase 14 role permissions + Phase 13's organization
// model) decides whether this renders personal-only data or organization-wide
// data with a per-member breakdown -- the UI never makes that call itself.
const RANGE_OPTIONS = [
  { id: '7d', label: '7 Days' },
  { id: '30d', label: '30 Days' },
  { id: '90d', label: '90 Days' },
  { id: '365d', label: '12 Months' },
  { id: 'all', label: 'All Time' },
  { id: 'custom', label: 'Custom' },
];

const todayLocalStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const localDayStartISO = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
};
const localDayEndISO = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
};

const ROLE_LABELS = {
  owner: 'Owner', admin: 'Admin', manager: 'Manager', adjuster: 'Adjuster',
  inspector: 'Inspector', reviewer: 'Reviewer', viewer: 'Viewer', editor: 'Editor (legacy)',
};

function StatCard({ label, value, sub, icon: Icon }) {
  return (
    <div className="card p-5">
      <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center mb-3">
        <Icon className="w-5 h-5 text-brand-500" />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-gray-600 text-sm mt-0.5">{label}</p>
      {sub && <p className="text-gray-400 text-xs mt-1">{sub}</p>}
    </div>
  );
}

function BreakdownBars({ title, data, total }) {
  const entries = Object.entries(data || {}).sort((a, b) => b[1] - a[1]);
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">{title}</h3>
      {entries.length === 0 ? (
        <p className="text-sm text-gray-500">No data in this range yet.</p>
      ) : (
        <div className="space-y-3">
          {entries.map(([key, count]) => (
            <div key={key}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-gray-600">{formatStatus(key)}</span>
                <span className="font-semibold text-gray-900">{count}</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100">
                <div className="h-2 rounded-full bg-brand-500" style={{ width: `${Math.round((count / Math.max(total, 1)) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MonthlyUsageChart({ months }) {
  const max = Math.max(...months.map((m) => m.reports), 1);
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Monthly Usage (Last 12 Months)</h3>
      <div className="overflow-x-auto">
        <div className="flex h-36 items-end gap-2.5 min-w-[560px]">
          {months.map((m) => (
            <div key={m.key} className="flex flex-1 flex-col items-center gap-2">
              <span className="text-xs font-semibold text-gray-700">{m.reports}</span>
              <div className="w-full rounded-t bg-brand-500" style={{ height: `${Math.max((m.reports / max) * 88, m.reports ? 8 : 2)}px` }} />
              <span className="text-[10px] text-gray-500 whitespace-nowrap">{m.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TimeSeriesChart({ title, icon: Icon, series, colorClass = 'bg-brand-500' }) {
  const max = Math.max(...series.map((p) => p.value), 1);
  const wide = series.length > 20;
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2"><Icon className="w-4 h-4" /> {title}</h3>
      {series.length === 0 ? (
        <p className="text-sm text-gray-500">No data in this range yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <div className={`flex h-32 items-end gap-1.5 ${wide ? 'min-w-[900px]' : 'min-w-full'}`}>
            {series.map((p) => (
              <div key={p.key} className="flex flex-1 flex-col items-center gap-1.5 group relative" title={`${p.label}: ${p.value}`}>
                <div className={`w-full rounded-t ${colorClass}`} style={{ height: `${Math.max((p.value / max) * 88, p.value ? 6 : 1)}px`, minWidth: wide ? '8px' : undefined }} />
                {!wide && <span className="text-[9px] text-gray-400 whitespace-nowrap rotate-0">{p.label}</span>}
              </div>
            ))}
          </div>
          {wide && <p className="text-[11px] text-gray-400 mt-2">Hover a bar for its date and value. Scroll to see the full range.</p>}
        </div>
      )}
    </div>
  );
}

function TeamComparisonTable({ rows }) {
  const maxReports = Math.max(...rows.map((r) => r.reportsGenerated), 1);
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2"><Users className="w-4 h-4" /> Team Comparison ({rows.length} members)</h3>
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.uid}>
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <span className="text-gray-700 font-medium truncate">{r.displayName || r.email || r.uid}</span>
              <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{ROLE_LABELS[r.role] || r.role}</span>
              <span className="ml-auto shrink-0 text-gray-500">{r.reportsGenerated} reports · {r.photosAnalyzed} photos</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100">
              <div className="h-2 rounded-full bg-violet-500" style={{ width: `${Math.round((r.reportsGenerated / maxReports) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Analytics() {
  const [rangeId, setRangeId] = useState('30d');
  const [customStart, setCustomStart] = useState(todayLocalStr());
  const [customEnd, setCustomEnd] = useState(todayLocalStr());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    const params = rangeId === 'custom'
      ? { startDate: localDayStartISO(customStart), endDate: localDayEndISO(customEnd) }
      : { range: rangeId };
    analyticsAPI.get(params)
      .then((res) => setData(res.data?.analytics || null))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [rangeId, customStart, customEnd]);

  useEffect(() => { load(); }, [load]);

  const metrics = data?.metrics;
  const completionLabel = useMemo(() => {
    if (metrics?.avgCompletionHours == null) return 'Not enough data yet';
    return metrics.avgCompletionHours >= 24
      ? `${(metrics.avgCompletionHours / 24).toFixed(1)} days`
      : `${metrics.avgCompletionHours} hrs`;
  }, [metrics]);

  const isOrg = data?.scope === 'organization';
  const isEmpty = !!data && (metrics?.reportsGenerated ?? 0) === 0;

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <Navbar />
      <div className="flex flex-1 pt-16 min-h-0">
        <DashboardSidebar activeId="analytics" />
        <main className="min-w-0 flex-1">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/dashboard" aria-label="Back to Dashboard" className="p-2 hover:bg-gray-100 rounded-lg transition-colors shrink-0">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-gray-900">{isOrg ? 'Organization Analytics' : 'Analytics'}</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                {isOrg ? 'Report activity across your whole team' : 'Your report activity and usage over time'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} disabled={loading} className="btn-secondary text-sm py-2 px-3 flex items-center gap-2 disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>

        {/* Range filter */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
          {RANGE_OPTIONS.map((opt) => (
            <button key={opt.id} onClick={() => setRangeId(opt.id)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                rangeId === opt.id ? 'bg-brand-500 text-white border-brand-500' : 'text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}>
              {opt.label}
            </button>
          ))}
          {rangeId === 'custom' && (
            <div className="flex items-center gap-2 ml-1">
              <input type="date" value={customStart} max={customEnd} onChange={(e) => setCustomStart(e.target.value)}
                className="input text-xs py-1.5 px-2 w-36" aria-label="Custom range start date" />
              <span className="text-gray-400 text-xs">to</span>
              <input type="date" value={customEnd} min={customStart} max={todayLocalStr()} onChange={(e) => setCustomEnd(e.target.value)}
                className="input text-xs py-1.5 px-2 w-36" aria-label="Custom range end date" />
            </div>
          )}
          {data?.range?.label && !loading && (
            <span className="text-xs text-gray-400 ml-1">Showing: {data.range.label}</span>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <RefreshCw className="w-8 h-8 text-brand-500 animate-spin" />
            <p className="text-sm text-gray-500">Loading analytics…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <AlertCircle className="w-8 h-8 text-amber-500" />
            <p className="text-sm text-gray-500">Could not load analytics.</p>
            <button onClick={load} className="btn-secondary text-sm py-2 px-4 flex items-center gap-2">
              <RefreshCw className="w-4 h-4" /> Retry
            </button>
          </div>
        ) : !data ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <AlertCircle className="w-8 h-8 text-amber-500" />
            <p className="text-sm text-gray-500">Analytics are currently unavailable.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {isEmpty && (
              <div className="card p-4 bg-amber-50 border-amber-100 flex items-center gap-3">
                <BarChart3 className="w-5 h-5 text-amber-500 shrink-0" />
                <p className="text-sm text-amber-800">
                  No reports were generated in this range yet. Try a wider range, or{' '}
                  <Link to="/dashboard" className="underline font-medium">generate your first report</Link>.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
              <StatCard label="Reports Generated" value={metrics.reportsGenerated} icon={FileText} sub={isOrg ? 'Across your whole team' : undefined} />
              <StatCard label="Photos Analyzed" value={metrics.photosAnalyzed} icon={ImageIcon} />
              <StatCard label="Avg. Report Completion Time" value={completionLabel} icon={Clock}
                sub={metrics.avgCompletionSampleSize ? `Based on ${metrics.avgCompletionSampleSize} finalized report${metrics.avgCompletionSampleSize === 1 ? '' : 's'}` : undefined} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <BreakdownBars title="Reports By Type" data={metrics.reportsByType} total={metrics.reportsGenerated} />
              <BreakdownBars title="Reports By Status" data={metrics.reportsByStatus} total={metrics.reportsGenerated} />
            </div>

            <MonthlyUsageChart months={data.monthlyUsage} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TimeSeriesChart title={isOrg ? 'Team Usage — Reports Over Time' : 'Reports Over Time'} icon={TrendingUp} series={data.reportsOverTime} colorClass="bg-brand-500" />
              <TimeSeriesChart title="Photos Processed Over Time" icon={ImageIcon} series={data.photosOverTime} colorClass="bg-violet-500" />
            </div>

            {isOrg && data.reportsPerUser?.length > 0 && (
              <TeamComparisonTable rows={data.reportsPerUser} />
            )}
          </div>
        )}
      </div>
        </main>
      </div>
    </div>
  );
}
