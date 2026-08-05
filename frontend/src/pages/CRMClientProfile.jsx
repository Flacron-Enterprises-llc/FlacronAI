import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, Calendar, FileText, Mail, MapPin, Phone, Users } from 'lucide-react';
import Navbar from '../components/Navbar';
import PageLoader from '../components/PageLoader';
import { crmAPI } from '../services/api';
import { formatStatus } from '../utils/formatStatus';

const formatDate = value => value ? new Date(value).toLocaleDateString() : 'Not provided';

export default function CRMClientProfile() {
  const { clientId } = useParams();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    crmAPI.getClientProfile(clientId)
      .then(response => active && setProfile(response.data?.profile))
      .catch(err => active && setError(err.response?.data?.error || 'Failed to load client profile'));
    return () => { active = false; };
  }, [clientId]);

  if (!profile && !error) return <PageLoader />;

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 pb-16 pt-24 sm:px-6 lg:px-8">
        <Link to="/crm" className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-primary">
          <ArrowLeft className="h-4 w-4" /> Back to CRM
        </Link>

        {error ? (
          <div className="card p-8 text-center">
            <h1 className="text-2xl font-bold text-ink">Client profile unavailable</h1>
            <p className="mt-2 text-gray-600">{error}</p>
          </div>
        ) : (
          <>
            <header className="card mb-6 p-6 sm:p-8">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-xl font-bold text-primary">
                    {(profile.client.name || 'C')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Client profile</p>
                    <h1 className="truncate text-2xl font-bold text-ink sm:text-3xl">{profile.client.name}</h1>
                    <p className="mt-1 text-sm text-gray-500">Client since {formatDate(profile.client.createdAt)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ['Claims', profile.summary.totalClaims], ['Open', profile.summary.openClaims],
                    ['Reports', profile.summary.totalReports], ['Upcoming', profile.summary.upcomingAppointments],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-border bg-gray-50 px-4 py-3 text-center">
                      <p className="text-xl font-bold text-ink">{value}</p><p className="text-xs text-gray-500">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </header>

            <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
              <aside className="space-y-6">
                <section className="card p-5">
                  <h2 className="mb-4 text-base font-semibold text-ink">Contact details</h2>
                  <div className="space-y-4 text-sm">
                    {[[Mail, profile.client.email, 'No email'], [Phone, profile.client.phone, 'No phone'], [Building2, profile.client.company, 'No company'], [MapPin, profile.client.address, 'No address']].map(([Icon, value, fallback]) => (
                      <div key={fallback} className="flex gap-3"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span className="break-words text-gray-700">{value || fallback}</span></div>
                    ))}
                  </div>
                </section>
                <section className="card p-5">
                  <h2 className="mb-3 text-base font-semibold text-ink">Notes</h2>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-gray-600">{profile.client.notes || 'No client notes recorded.'}</p>
                </section>
              </aside>

              <div className="space-y-6">
                <section className="card p-5 sm:p-6">
                  <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-ink"><FileText className="h-5 w-5 text-primary" /> Claims</h2>
                  {profile.claims.length === 0 ? <p className="text-sm text-gray-500">No claims linked to this client.</p> : (
                    <div className="space-y-3">{profile.claims.map(claim => (
                      <div key={claim.id} className="grid gap-2 rounded-xl border border-border p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                        <div><p className="font-mono text-sm font-semibold text-ink">{claim.claimNumber || 'Unnumbered claim'}</p><p className="mt-1 text-sm text-gray-600">{claim.lossType || 'Loss type not provided'} · {formatDate(claim.lossDate)}</p></div>
                        <span className="w-fit rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary">{formatStatus(claim.status)}</span>
                      </div>
                    ))}</div>
                  )}
                </section>

                <section className="card p-5 sm:p-6">
                  <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-ink"><Calendar className="h-5 w-5 text-primary" /> Appointments</h2>
                  {profile.appointments.length === 0 ? <p className="text-sm text-gray-500">No appointments linked to this client.</p> : (
                    <div className="space-y-3">{profile.appointments.map(item => (
                      <div key={item.id} className="rounded-xl border border-border p-4"><div className="flex flex-wrap justify-between gap-2"><p className="font-medium text-ink">{item.title}</p><span className="text-xs font-medium text-gray-500">{formatStatus(item.status)}</span></div><p className="mt-1 text-sm text-gray-600">{item.date}{item.time ? ` at ${item.time}` : ''}{item.location ? ` · ${item.location}` : ''}</p></div>
                    ))}</div>
                  )}
                </section>

                <section className="card p-5 sm:p-6">
                  <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-ink"><Users className="h-5 w-5 text-primary" /> Reports</h2>
                  {profile.reports.length === 0 ? <p className="text-sm text-gray-500">No reports linked to this client.</p> : (
                    <div className="space-y-3">{profile.reports.map(report => (
                      <div key={report.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4"><div><p className="font-mono text-sm font-semibold text-ink">{report.claimNumber || 'Report'}</p><p className="mt-1 text-xs text-gray-500">Created {formatDate(report.createdAt)}</p></div><span className="text-xs font-medium text-gray-600">{formatStatus(report.status)}</span></div>
                    ))}</div>
                  )}
                </section>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
