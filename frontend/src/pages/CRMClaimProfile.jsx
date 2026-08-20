import { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, Building2, CalendarDays, ClipboardList, FileCheck2, FileText,
  MapPin, User, RefreshCw, Image as ImageIcon, AlertCircle,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import PageLoader from '../components/PageLoader';
import { crmAPI, reportsAPI } from '../services/api';
import { formatStatus } from '../utils/formatStatus';

const displayDate = value => value ? new Date(value).toLocaleDateString() : 'Not provided';
const displayDateTime = value => value ? new Date(value).toLocaleString() : 'Not available';

const REVIEW_STATUS_OPTIONS = ['approved', 'edited', 'excluded', 'pending'];

// Phase 12 (My Reports & Claims Management Completion): aggregates photos
// across every report linked to this claim -- real per-photo review/analysis
// data pulled from the existing `GET /reports/:id/photos` endpoint (the same
// one Dashboard.jsx's ReportPhotoGallery uses), never fabricated. A report
// that fails to load its photos is simply skipped, not treated as a fatal
// error for the whole tab.
function ClaimPhotosPanel({ reports }) {
  const [photos, setPhotos] = useState(null); // null = loading
  const [thumbUrls, setThumbUrls] = useState({});
  const [loadError, setLoadError] = useState(false);
  const [reportFilter, setReportFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [reviewFilter, setReviewFilter] = useState('all');

  const load = useCallback(() => {
    if (!reports.length) { setPhotos([]); return undefined; }
    let cancelled = false;
    const createdUrls = [];
    setPhotos(null);
    setLoadError(false);
    (async () => {
      const results = await Promise.allSettled(
        reports.map(report => reportsAPI.getPhotos(report.id).then(res => ({ report, list: res.data?.photos || [] })))
      );
      if (cancelled) return;
      const aggregated = [];
      let anySucceeded = false;
      results.forEach(result => {
        if (result.status !== 'fulfilled') return;
        anySucceeded = true;
        const { report, list } = result.value;
        list
          .filter(p => p.status === 'uploaded')
          .forEach(p => aggregated.push({ ...p, reportId: report.id, reportClaimNumber: report.claimNumber, reportCreatedAt: report.createdAt }));
      });
      if (!anySucceeded && reports.length > 0) { setLoadError(true); setPhotos([]); return; }
      setPhotos(aggregated);
      await Promise.all(aggregated.map(async (p) => {
        try {
          const imgRes = await reportsAPI.getPhotoImageBlob(p.reportId, p.id, 'thumbnail');
          const url = URL.createObjectURL(imgRes.data);
          createdUrls.push(url);
          if (!cancelled) setThumbUrls(prev => ({ ...prev, [`${p.reportId}:${p.id}`]: url }));
        } catch { /* this one photo's thumbnail failed -- leave a placeholder icon */ }
      }));
    })();
    return () => {
      cancelled = true;
      createdUrls.forEach(u => URL.revokeObjectURL(u));
    };
  }, [reports]);

  useEffect(() => load(), [load]);

  if (photos === null) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {[...Array(8)].map((_, i) => <div key={i} className="skeleton aspect-square rounded-xl" />)}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
        <p className="text-sm text-gray-600">We couldn't load photos for this claim's reports.</p>
        <button onClick={load} className="btn-secondary text-xs py-1.5 px-3 mt-3 inline-flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="text-center py-12">
        <ImageIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500">No photos have been uploaded to any report linked to this claim yet.</p>
      </div>
    );
  }

  const categories = [...new Set(photos.map(p => p.analysis?.category).filter(Boolean))];
  const filtered = photos.filter(p => {
    if (reportFilter !== 'all' && p.reportId !== reportFilter) return false;
    if (categoryFilter !== 'all' && p.analysis?.category !== categoryFilter) return false;
    if (reviewFilter !== 'all' && (p.review?.status || 'pending') !== reviewFilter) return false;
    return true;
  });

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4">
        <select className="input w-auto text-sm" value={reportFilter} onChange={e => setReportFilter(e.target.value)}>
          <option value="all">All reports ({photos.length} photos)</option>
          {reports.map(r => <option key={r.id} value={r.id}>{r.claimNumber || 'Report'} — {displayDate(r.createdAt)}</option>)}
        </select>
        {categories.length > 0 && (
          <select className="input w-auto text-sm" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="all">All categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <select className="input w-auto text-sm" value={reviewFilter} onChange={e => setReviewFilter(e.target.value)}>
          <option value="all">All review statuses</option>
          {REVIEW_STATUS_OPTIONS.map(s => <option key={s} value={s}>{formatStatus(s)}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">No photos match these filters.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map(p => {
            const reviewStatus = p.review?.status || 'pending';
            const thumbUrl = thumbUrls[`${p.reportId}:${p.id}`];
            return (
              <div key={`${p.reportId}:${p.id}`} className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
                <div className="aspect-square bg-gray-100 flex items-center justify-center">
                  {thumbUrl ? (
                    <img src={thumbUrl} alt={p.fileName || 'Claim photo'} className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-gray-300" />
                  )}
                </div>
                <div className="p-2 space-y-1">
                  <p className="text-[11px] font-mono text-gray-500 truncate" title={p.reportClaimNumber}>{p.reportClaimNumber || 'Report'}</p>
                  {p.analysis?.category && <p className="text-xs text-gray-700 truncate">{p.analysis.category}</p>}
                  <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    reviewStatus === 'excluded' ? 'bg-red-500/10 text-red-500'
                      : reviewStatus === 'approved' || reviewStatus === 'edited' ? 'bg-green-500/10 text-green-600'
                        : 'bg-amber-500/10 text-amber-600'
                  }`}>{formatStatus(reviewStatus)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'reports', label: 'Reports' },
  { id: 'photos', label: 'Photos' },
];

export default function CRMClaimProfile() {
  const { claimId } = useParams();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  const load = useCallback(() => {
    let active = true;
    setLoading(true);
    setError('');
    crmAPI.getClaimProfile(claimId)
      .then(response => { if (active) setProfile(response.data?.profile); })
      .catch(err => { if (active) setError(err.response?.data?.error || 'Failed to load claim details'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [claimId]);

  useEffect(() => load(), [load]);

  if (loading && !profile) return <PageLoader />;

  const claim = profile?.claim;
  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 pb-16 pt-24 sm:px-6 lg:px-8">
        <Link to="/crm" className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-primary">
          <ArrowLeft className="h-4 w-4" /> Back to CRM
        </Link>

        {error ? (
          <div className="card p-8 text-center">
            <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
            <h1 className="text-2xl font-bold text-ink">Claim unavailable</h1>
            <p className="mt-2 text-gray-600">{error}</p>
            <button onClick={load} className="btn-secondary text-sm py-2 px-4 mt-4 inline-flex items-center gap-2 mx-auto">
              <RefreshCw className="w-4 h-4" /> Retry
            </button>
          </div>
        ) : (
          <>
            <header className="card mb-6 p-6 sm:p-8">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Claim workspace</p>
                  <h1 className="mt-1 break-words font-mono text-2xl font-bold text-ink sm:text-3xl">{claim.claimNumber || 'Unnumbered claim'}</h1>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">{formatStatus(claim.status)}</span>
                    {claim.archived && <span className="rounded-full bg-gray-200 px-3 py-1 text-xs font-semibold text-gray-600">Archived</span>}
                    <span className="text-sm text-gray-500">Created {displayDate(claim.createdAt)}</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[["Reports", profile.summary.totalReports], ["Drafts", profile.summary.drafts], ["Finalized", profile.summary.finalized]].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-border bg-gray-50 px-4 py-3 text-center"><p className="text-xl font-bold text-ink">{value}</p><p className="text-xs text-gray-500">{label}</p></div>
                  ))}
                </div>
              </div>

              <div className="mt-6 flex gap-1 border-b border-border -mb-6 sm:-mb-8 pt-2">
                {TABS.map(t => (
                  <button key={t.id} onClick={() => setActiveTab(t.id)}
                    className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                      activeTab === t.id ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-800'
                    }`}>
                    {t.label}
                    {t.id === 'reports' && ` (${profile.summary.totalReports})`}
                  </button>
                ))}
              </div>
            </header>

            {activeTab === 'overview' && (
              <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
                <aside className="space-y-6">
                  <section className="card p-5">
                    <h2 className="mb-4 text-base font-semibold text-ink">Claim details</h2>
                    <dl className="space-y-4 text-sm">
                      {[
                        [ClipboardList, 'Loss type', claim.lossType || 'Not provided'],
                        [CalendarDays, 'Loss date', displayDate(claim.lossDate)],
                        [MapPin, 'Property', claim.propertyAddress || 'Not provided'],
                        [FileCheck2, 'Last updated', displayDateTime(claim.updatedAt)],
                      ].map(([Icon, label, value]) => (
                        <div key={label} className="flex gap-3"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div><dt className="text-xs font-medium text-gray-500">{label}</dt><dd className="mt-0.5 break-words text-gray-800">{value}</dd></div></div>
                      ))}
                    </dl>
                  </section>

                  <section className="card p-5">
                    <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-ink"><User className="h-4 w-4 text-primary" /> Client</h2>
                    {profile.client ? (
                      <div>
                        <Link to={`/crm/clients/${profile.client.id}`} className="font-semibold text-ink hover:text-primary">{profile.client.name}</Link>
                        {profile.client.company && <p className="mt-1 flex items-center gap-2 text-sm text-gray-600"><Building2 className="h-3.5 w-3.5" />{profile.client.company}</p>}
                        {profile.client.email && <p className="mt-2 break-all text-sm text-gray-600">{profile.client.email}</p>}
                      </div>
                    ) : <p className="text-sm text-gray-500">No client is assigned to this claim.</p>}
                  </section>
                </aside>

                <div className="space-y-6">
                  <section className="card p-5 sm:p-6">
                    <h2 className="mb-4 text-lg font-semibold text-ink">Documentation</h2>
                    <div className="space-y-5">
                      <div><h3 className="mb-1.5 text-sm font-semibold text-gray-700">Description</h3><p className="whitespace-pre-wrap text-sm leading-6 text-gray-600">{claim.description || 'No description recorded.'}</p></div>
                      <div><h3 className="mb-1.5 text-sm font-semibold text-gray-700">Internal notes</h3><p className="whitespace-pre-wrap text-sm leading-6 text-gray-600">{claim.notes || 'No internal notes recorded.'}</p></div>
                    </div>
                  </section>

                  <section className="card p-5 sm:p-6">
                    <h2 className="mb-4 text-lg font-semibold text-ink">Activity timeline</h2>
                    <ol className="space-y-4 border-l border-border pl-5">
                      {profile.summary.latestReportAt && <li><p className="text-sm font-medium text-ink">Latest linked report created</p><p className="text-xs text-gray-500">{displayDateTime(profile.summary.latestReportAt)}</p></li>}
                      {claim.updatedAt && <li><p className="text-sm font-medium text-ink">Claim record updated</p><p className="text-xs text-gray-500">{displayDateTime(claim.updatedAt)}</p></li>}
                      <li><p className="text-sm font-medium text-ink">Claim record created</p><p className="text-xs text-gray-500">{displayDateTime(claim.createdAt)}</p></li>
                    </ol>
                  </section>
                </div>
              </div>
            )}

            {activeTab === 'reports' && (
              <section className="card p-5 sm:p-6">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-ink"><FileText className="h-5 w-5 text-primary" /> Linked reports</h2>
                {profile.reports.length === 0 ? (
                  <p className="text-sm text-gray-500">No reports are linked to this claim yet.</p>
                ) : (
                  <div className="space-y-3">{profile.reports.map(report => (
                    <Link key={report.id} to={`/reports/${report.id}/preview`}
                      className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-[1fr_auto] sm:items-center hover:bg-gray-50 transition-colors">
                      <div><p className="font-mono text-sm font-semibold text-ink">{report.claimNumber || 'Inspection report'}</p><p className="mt-1 text-sm text-gray-600">{report.lossType || claim.lossType || 'Inspection documentation'}</p><p className="mt-1 text-xs text-gray-500">Created {displayDateTime(report.createdAt)}</p></div>
                      <span className="w-fit rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">{formatStatus(report.status)}</span>
                    </Link>
                  ))}</div>
                )}
              </section>
            )}

            {activeTab === 'photos' && (
              <section className="card p-5 sm:p-6">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-ink"><ImageIcon className="h-5 w-5 text-primary" /> Photos</h2>
                <ClaimPhotosPanel reports={profile.reports} />
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
