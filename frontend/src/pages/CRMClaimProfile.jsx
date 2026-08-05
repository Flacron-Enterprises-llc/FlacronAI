import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, CalendarDays, ClipboardList, FileCheck2, FileText, MapPin, User } from 'lucide-react';
import Navbar from '../components/Navbar';
import PageLoader from '../components/PageLoader';
import { crmAPI } from '../services/api';
import { formatStatus } from '../utils/formatStatus';

const displayDate = value => value ? new Date(value).toLocaleDateString() : 'Not provided';
const displayDateTime = value => value ? new Date(value).toLocaleString() : 'Not available';

export default function CRMClaimProfile() {
  const { claimId } = useParams();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    crmAPI.getClaimProfile(claimId)
      .then(response => active && setProfile(response.data?.profile))
      .catch(err => active && setError(err.response?.data?.error || 'Failed to load claim details'));
    return () => { active = false; };
  }, [claimId]);

  if (!profile && !error) return <PageLoader />;

  const claim = profile?.claim;
  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 pb-16 pt-24 sm:px-6 lg:px-8">
        <Link to="/crm" className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-primary">
          <ArrowLeft className="h-4 w-4" /> Back to CRM
        </Link>

        {error ? (
          <div className="card p-8 text-center"><h1 className="text-2xl font-bold text-ink">Claim unavailable</h1><p className="mt-2 text-gray-600">{error}</p></div>
        ) : (
          <>
            <header className="card mb-6 p-6 sm:p-8">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Claim workspace</p>
                  <h1 className="mt-1 break-words font-mono text-2xl font-bold text-ink sm:text-3xl">{claim.claimNumber || 'Unnumbered claim'}</h1>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">{formatStatus(claim.status)}</span>
                    <span className="text-sm text-gray-500">Created {displayDate(claim.createdAt)}</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[["Reports", profile.summary.totalReports], ["Drafts", profile.summary.drafts], ["Finalized", profile.summary.finalized]].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-border bg-gray-50 px-4 py-3 text-center"><p className="text-xl font-bold text-ink">{value}</p><p className="text-xs text-gray-500">{label}</p></div>
                  ))}
                </div>
              </div>
            </header>

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
                  <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-ink"><FileText className="h-5 w-5 text-primary" /> Linked reports</h2>
                  {profile.reports.length === 0 ? (
                    <p className="text-sm text-gray-500">No reports are linked to this claim yet.</p>
                  ) : (
                    <div className="space-y-3">{profile.reports.map(report => (
                      <div key={report.id} className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                        <div><p className="font-mono text-sm font-semibold text-ink">{report.claimNumber || 'Inspection report'}</p><p className="mt-1 text-sm text-gray-600">{report.lossType || claim.lossType || 'Inspection documentation'}</p><p className="mt-1 text-xs text-gray-500">Created {displayDateTime(report.createdAt)}</p></div>
                        <span className="w-fit rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">{formatStatus(report.status)}</span>
                      </div>
                    ))}</div>
                  )}
                </section>

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
          </>
        )}
      </main>
    </div>
  );
}
