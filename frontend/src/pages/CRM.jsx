import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  LayoutDashboard, Users, Calendar, FileText, Plus, Search, X,
  Trash2, ChevronLeft, ChevronRight, Upload, Eye, CheckCircle,
  AlertCircle, TrendingUp, Activity
} from 'lucide-react';
import Navbar from '../components/Navbar';
import PageLoader from '../components/PageLoader';
import ConfirmDialog from '../components/ConfirmDialog';
import { useAuth } from '../context/AuthContext';
import { crmAPI } from '../services/api';
import { formatStatus } from '../utils/formatStatus';
import useEscapeToClose from '../hooks/useEscapeToClose';

const SIDEBAR_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'clients', label: 'Clients', icon: Users },
  { id: 'appointments', label: 'Appointments', icon: Calendar },
  { id: 'claims', label: 'Claims', icon: FileText },
];

// -600/-700 text weights, not -400 -- -400 on these translucent light backgrounds
// falls well below WCAG AA contrast (client-flagged: "pale orange status badges").
const APPT_STATUSES = { scheduled: 'bg-orange-500/20 text-orange-700 border-orange-500/30', completed: 'bg-green-500/20 text-green-700 border-green-500/30', cancelled: 'bg-red-500/20 text-red-700 border-red-500/30' };
const CLAIM_STATUSES = ['open', 'in-progress', 'pending-review', 'closed'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Date-only strings (e.g. from <input type="date">, "2026-07-30") are parsed by
// `new Date(str)` as UTC midnight, which can shift to the previous day in any
// timezone behind UTC. Parse as local midnight instead so an appointment on a
// given date never appears to belong to the day before.
const parseLocalDate = (dateStr) => {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// Surfaces the backend's actual validation/error message instead of a generic
// fallback -- express-validator errors come back as { errors: { field: { msg } } }.
const apiErrorMessage = (err, fallback) => {
  const data = err?.response?.data;
  if (!data) return fallback;
  if (data.error) return data.error;
  if (data.errors) {
    const first = Object.values(data.errors)[0];
    if (first?.msg) return first.msg;
  }
  return fallback;
};
const getRecordId = record => record?.id || record?._id;

function StatusPill({ status }) {
  const cls = APPT_STATUSES[status] || 'bg-gray-500/20 text-gray-600 border-gray-500/30';
  return <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${cls}`}>{formatStatus(status)}</span>;
}

function Modal({ title, onClose, children }) {
  useEscapeToClose(onClose);
  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}>
      <motion.div className="card w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="crm-modal-title"
        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 id="crm-modal-title" className="text-lg font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} aria-label={`Close ${title}`} title="Close"><X className="w-5 h-5 text-gray-600" /></button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

function NewClientModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', address: '', notes: '' });
  const [loading, setLoading] = useState(false);
  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      await crmAPI.createClient(form);
      toast.success('Client created'); onSaved();
    } catch (err) { toast.error(apiErrorMessage(err, 'Failed to create client')); }
    finally { setLoading(false); }
  };
  return (
    <Modal title="New Client" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Name *</label><input className="input" required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
          <div><label className="label">Email</label><input type="email" className="input" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
          <div><label className="label">Company</label><input className="input" value={form.company} onChange={e => setForm(p => ({ ...p, company: e.target.value }))} /></div>
        </div>
        <div><label className="label">Address</label><input className="input" value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} /></div>
        <div><label className="label">Notes</label><textarea className="input min-h-[80px]" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
        <div className="flex gap-3">
          <button type="submit" disabled={loading} className="btn-primary flex-1 text-sm py-2">{loading ? 'Creating...' : 'Create Client'}</button>
          <button type="button" onClick={onClose} className="btn-secondary text-sm py-2 px-4">Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function NewAppointmentModal({ clients, onClose, onSaved }) {
  const [form, setForm] = useState({ clientId: '', title: '', date: '', time: '', location: '', notes: '', status: 'scheduled' });
  const [loading, setLoading] = useState(false);
  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      await crmAPI.createAppointment(form);
      toast.success('Appointment scheduled'); onSaved();
    } catch (err) { toast.error(apiErrorMessage(err, 'Failed to schedule appointment')); }
    finally { setLoading(false); }
  };
  return (
    <Modal title="New Appointment" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div><label className="label">Client</label>
          <select className="input" required value={form.clientId} onChange={e => setForm(p => ({ ...p, clientId: e.target.value }))}>
            <option value="">Select client...</option>
            {clients.map(c => <option key={getRecordId(c)} value={getRecordId(c)}>{c.name}</option>)}
          </select>
        </div>
        <div><label className="label">Title</label><input className="input" required placeholder="e.g. Property Inspection" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Date</label><input type="date" className="input" required value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} /></div>
          <div><label className="label">Time</label><input type="time" className="input" value={form.time} onChange={e => setForm(p => ({ ...p, time: e.target.value }))} /></div>
        </div>
        <div><label className="label">Location</label><input className="input" placeholder="Address or virtual link" value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} /></div>
        <div><label className="label">Notes</label><textarea className="input min-h-[70px]" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
        <div className="flex gap-3">
          <button type="submit" disabled={loading} className="btn-primary flex-1 text-sm py-2">{loading ? 'Scheduling...' : 'Schedule'}</button>
          <button type="button" onClick={onClose} className="btn-secondary text-sm py-2 px-4">Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function NewClaimModal({ clients, onClose, onSaved }) {
  const [form, setForm] = useState({ clientId: '', claimNumber: '', lossType: 'Water Damage', lossDate: '', status: 'open', propertyAddress: '', notes: '' });
  const [loading, setLoading] = useState(false);
  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      await crmAPI.createClaim(form);
      toast.success('Claim created'); onSaved();
    } catch (err) { toast.error(apiErrorMessage(err, 'Failed to create claim')); }
    finally { setLoading(false); }
  };
  return (
    <Modal title="New Claim" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div><label className="label">Client</label>
          <select className="input" required value={form.clientId} onChange={e => setForm(p => ({ ...p, clientId: e.target.value }))}>
            <option value="">Select client...</option>
            {clients.map(c => <option key={getRecordId(c)} value={getRecordId(c)}>{c.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Claim Number *</label><input className="input" required value={form.claimNumber} onChange={e => setForm(p => ({ ...p, claimNumber: e.target.value }))} /></div>
          <div><label className="label">Loss Date</label><input type="date" className="input" value={form.lossDate} onChange={e => setForm(p => ({ ...p, lossDate: e.target.value }))} /></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Loss Type</label>
            <select className="input" value={form.lossType} onChange={e => setForm(p => ({ ...p, lossType: e.target.value }))}>
              {['Water Damage', 'Fire', 'Wind', 'Hail', 'Mold', 'Vandalism', 'Other'].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div><label className="label">Status</label>
            <select className="input" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
              {CLAIM_STATUSES.map(s => <option key={s} value={s}>{formatStatus(s)}</option>)}
            </select>
          </div>
        </div>
        <div><label className="label">Property Address</label><input className="input" value={form.propertyAddress} onChange={e => setForm(p => ({ ...p, propertyAddress: e.target.value }))} /></div>
        <div><label className="label">Notes</label><textarea className="input min-h-[70px]" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
        <div className="flex gap-3">
          <button type="submit" disabled={loading} className="btn-primary flex-1 text-sm py-2">{loading ? 'Creating...' : 'Create Claim'}</button>
          <button type="button" onClick={onClose} className="btn-secondary text-sm py-2 px-4">Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

// Retained temporarily while claim details still use the matching slide-over pattern.
// eslint-disable-next-line no-unused-vars
function ClientSlideOver({ client, onClose }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!client) return;
    setLoading(true);
    crmAPI.getClientReports(getRecordId(client))
      .then(r => {
        const nextReports = r.data?.reports ?? r.data?.data ?? [];
        setReports(Array.isArray(nextReports) ? nextReports : []);
      })
      .catch(() => setReports([]))
      .finally(() => setLoading(false));
  }, [client]);
  useEscapeToClose(onClose, !!client);
  if (!client) return null;
  return (
    <motion.div className="fixed inset-0 z-50 flex justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}>
      <motion.div className="w-full max-w-md bg-[#f8f8f8] border-l border-[#e5e7eb] h-full overflow-y-auto p-6" role="dialog" aria-modal="true" aria-labelledby="client-slideover-title"
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 id="client-slideover-title" className="text-lg font-bold text-gray-900">{client.name}</h2>
          <button onClick={onClose} aria-label="Close client details" title="Close"><X className="w-5 h-5 text-gray-600" /></button>
        </div>
        <div className="space-y-3 mb-6 text-sm">
          {[['Email', client.email], ['Phone', client.phone], ['Company', client.company], ['Address', client.address]].map(([l, v]) => v && (
            <div key={l} className="flex gap-3"><span className="text-gray-600 w-20">{l}:</span><span className="text-gray-900">{v}</span></div>
          ))}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Linked Reports</h3>
          {loading ? <div className="skeleton h-20 w-full" /> : reports.length === 0
            ? <p className="text-gray-500 text-sm">No reports linked.</p>
            : <div className="space-y-2">
                {reports.map(r => (
                  <div key={getRecordId(r)} className="flex items-center justify-between p-3 rounded-xl bg-gray-100 border border-gray-200">
                    <div><p className="text-gray-900 text-sm font-mono">{r.claimNumber}</p><p className="text-gray-500 text-xs">{r.lossType}</p></div>
                    <span className="text-xs text-gray-600">{formatStatus(r.status)}</span>
                  </div>
                ))}
              </div>}
        </div>
        {client.notes && <div className="mt-6"><h3 className="text-sm font-semibold text-gray-700 mb-2">Notes</h3><p className="text-gray-600 text-sm">{client.notes}</p></div>}
      </motion.div>
    </motion.div>
  );
}

function ClaimSlideOver({ claim, client, onClose }) {
  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  useEffect(() => {
    if (!claim) return;
    setReportsLoading(true);
    crmAPI.getClaimReports(getRecordId(claim))
      .then(r => {
        const nextReports = r.data?.reports ?? r.data?.data ?? [];
        setReports(Array.isArray(nextReports) ? nextReports : []);
      })
      .catch(() => setReports([]))
      .finally(() => setReportsLoading(false));
  }, [claim]);
  useEscapeToClose(onClose, !!claim);
  if (!claim) return null;

  const details = [
    ['Client', client?.name || 'Not assigned'],
    ['Loss type', claim.lossType],
    ['Loss date', claim.lossDate],
    ['Property', claim.propertyAddress],
    ['Created', claim.createdAt ? new Date(claim.createdAt).toLocaleString() : null],
    ['Last updated', claim.updatedAt ? new Date(claim.updatedAt).toLocaleString() : null],
  ];

  return (
    <motion.div
      className="fixed inset-0 z-50 flex justify-end bg-gray-950/40"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.aside
        className="h-full w-full max-w-md overflow-y-auto border-l border-gray-200 bg-white p-5 shadow-2xl sm:p-6"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'tween', duration: 0.22 }}
        onClick={event => event.stopPropagation()}
        role="dialog" aria-modal="true"
        aria-label={`Claim ${claim.claimNumber || ''} details`}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Claim details
            </p>
            <h2 className="mt-1 truncate font-mono text-lg font-bold text-gray-900">
              {claim.claimNumber || 'Unnumbered claim'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-gray-500 hover:bg-gray-100"
            aria-label="Close claim details"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-6">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
            claim.status === 'closed'
              ? 'bg-gray-100 text-gray-600'
              : claim.status === 'open'
                ? 'bg-orange-50 text-orange-600'
                : 'bg-amber-50 text-amber-700'
          }`}>
            {(claim.status || 'unknown').replaceAll('-', ' ')}
          </span>
        </div>

        <dl className="space-y-1 rounded-2xl border border-gray-200 bg-gray-50 p-4">
          {details.map(([label, value]) => value && (
            <div key={label} className="grid grid-cols-[100px_1fr] gap-3 border-b border-gray-200 py-2.5 last:border-0">
              <dt className="text-xs font-medium text-gray-500">{label}</dt>
              <dd className="break-words text-sm text-gray-800">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-5">
          <h3 className="mb-2 text-sm font-semibold text-gray-800">Linked Reports</h3>
          {reportsLoading ? <div className="skeleton h-16 w-full" /> : reports.length === 0
            ? <p className="text-sm text-gray-500">No reports linked to this claim yet.</p>
            : <div className="space-y-2">
                {reports.map(r => (
                  <div key={getRecordId(r)} className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <div><p className="font-mono text-sm text-gray-900">{r.claimNumber}</p><p className="text-xs text-gray-500">{r.lossType}</p></div>
                    <span className="text-xs text-gray-600">{formatStatus(r.status)}</span>
                  </div>
                ))}
              </div>}
        </div>

        {(claim.description || claim.notes) && (
          <div className="mt-5 space-y-4">
            {claim.description && (
              <div>
                <h3 className="mb-1.5 text-sm font-semibold text-gray-800">Description</h3>
                <p className="whitespace-pre-wrap text-sm leading-6 text-gray-600">{claim.description}</p>
              </div>
            )}
            {claim.notes && (
              <div>
                <h3 className="mb-1.5 text-sm font-semibold text-gray-800">Notes</h3>
                <p className="whitespace-pre-wrap text-sm leading-6 text-gray-600">{claim.notes}</p>
              </div>
            )}
          </div>
        )}
      </motion.aside>
    </motion.div>
  );
}

function CalendarGrid({ appointments, month, year, onPrev, onNext }) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(firstDay).fill(null), ...Array(daysInMonth).fill(0).map((_, i) => i + 1)];
  const today = new Date();
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <button onClick={onPrev} aria-label="Previous month" className="rounded-lg p-2 hover:bg-gray-100"><ChevronLeft className="h-4 w-4 text-gray-600" /></button>
        <h3 className="text-sm font-semibold text-gray-900 sm:text-base">{MONTHS[month]} {year}</h3>
        <button onClick={onNext} aria-label="Next month" className="rounded-lg p-2 hover:bg-gray-100"><ChevronRight className="h-4 w-4 text-gray-600" /></button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
        {DAYS.map(d => <div key={d} className="py-1 text-center text-[10px] font-semibold text-gray-500 sm:text-xs">{d}</div>)}
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dayAppts = appointments.filter(a => a.date?.startsWith(dateStr));
          const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
          return (
            <div key={i} className="min-w-0 min-h-11 rounded-lg p-0.5 transition-colors hover:bg-gray-50 sm:min-h-[68px] sm:p-1">
              <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[11px] font-medium sm:text-xs ${
                isToday ? 'bg-orange-500 font-semibold text-white shadow-sm' : 'text-gray-600'
              }`}>{day}</span>
              <div className="mt-0.5 flex flex-wrap gap-0.5 sm:block sm:space-y-0.5">
                {dayAppts.slice(0, 2).map((a, ai) => (
                  <div key={ai} title={a.title} className={`h-1.5 w-1.5 rounded-full sm:h-auto sm:w-auto sm:truncate sm:px-1 sm:py-0.5 sm:text-xs ${
                    a.status === 'completed' ? 'bg-green-500/30 text-green-300' :
                    a.status === 'cancelled' ? 'bg-red-500/30 text-red-300' :
                    'bg-orange-500/30 text-orange-700'}`}>
                    <span className="hidden sm:inline">{a.title}</span>
                  </div>
                ))}
                {dayAppts.length > 2 && <div className="text-[9px] leading-none text-gray-500 sm:text-xs sm:leading-normal">+{dayAppts.length - 2}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CRM() {
  const { tier } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('dashboard');

  const [clients, setClients] = useState([]); const [clientsLoading, setClientsLoading] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [appointments, setAppointments] = useState([]); const [apptsLoading, setApptsLoading] = useState(false);
  const [claims, setClaims] = useState([]); const [claimsLoading, setClaimsLoading] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [claimStatusFilter, setClaimStatusFilter] = useState('all');
  const [crmReady, setCrmReady] = useState(false);
  const [crmError, setCrmError] = useState(null);

  const [showNewClient, setShowNewClient] = useState(false);
  const [showNewAppt, setShowNewAppt] = useState(false);
  const [showNewClaim, setShowNewClaim] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState(null);

  const [calView, setCalView] = useState('month');
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());

  const [csvImporting, setCsvImporting] = useState(false);
  const [deleteClientId, setDeleteClientId] = useState(null);
  const [deleteClientLoading, setDeleteClientLoading] = useState(false);
  const csvRef = useRef();

  const fetchAll = useCallback(async () => {
    setCrmError(null);
    setClientsLoading(true); setApptsLoading(true); setClaimsLoading(true);
    try {
      const [cl, ap, cr, an] = await Promise.all([
        crmAPI.getClients(), crmAPI.getAppointments(), crmAPI.getClaims(), crmAPI.getDashboardAnalytics(),
      ]);
      const toArr = v => Array.isArray(v) ? v : [];
      setClients(toArr(cl.data?.clients ?? cl.data?.data));
      setAppointments(toArr(ap.data?.appointments ?? ap.data?.data));
      setClaims(toArr(cr.data?.claims ?? cr.data?.data));
      setAnalytics(an.data?.analytics || null);
    } catch {
      setCrmError('We could not load your CRM data. Please try again.');
      toast.error('Failed to load CRM data');
    }
    finally {
      setClientsLoading(false);
      setApptsLoading(false);
      setClaimsLoading(false);
      setCrmReady(true);
    }
  }, []);

  useEffect(() => { if (['agency', 'enterprise'].includes(tier)) fetchAll(); }, [tier, fetchAll]);

  const handleDeleteClient = (id) => setDeleteClientId(id);

  const confirmDeleteClient = async () => {
    setDeleteClientLoading(true);
    try {
      await crmAPI.deleteClient(deleteClientId);
      toast.success('Client deleted');
      fetchAll();
      setDeleteClientId(null);
    } catch { toast.error('Delete failed'); }
    finally { setDeleteClientLoading(false); }
  };

  const handleCSVImport = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const lines = ev.target.result.split('\n').filter(Boolean).slice(1);
      const parsed = lines.map(l => { const [name, email, phone, company] = l.split(',').map(s => s.trim()); return { name, email, phone, company }; }).filter(r => r.name);
      if (!parsed.length) { toast.error('No valid rows found in CSV'); return; }
      setCsvImporting(true);
      try {
        await Promise.all(parsed.map(c => crmAPI.createClient(c)));
        toast.success(`Imported ${parsed.length} clients`); fetchAll();
      } catch { toast.error('Some imports failed'); }
      finally { setCsvImporting(false); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const filteredClients = clients.filter(c =>
    c.name?.toLowerCase().includes(clientSearch.toLowerCase()) ||
    c.email?.toLowerCase().includes(clientSearch.toLowerCase())
  );

  const filteredClaims = claimStatusFilter === 'all' ? claims : claims.filter(c => c.status === claimStatusFilter);

  if (!['agency', 'enterprise'].includes(tier)) {
    return (
      <div className="min-h-screen bg-[#ffffff]">
        <Navbar />
        <div className="pt-24 flex items-center justify-center">
          <div className="text-center card p-10 max-w-md">
            <Users className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">CRM Requires Agency Plan</h2>
            <p className="text-gray-600 text-sm mb-6">Upgrade to Agency or Enterprise to access the full CRM suite.</p>
            <button onClick={() => navigate('/pricing')} className="btn-primary">View Plans</button>
          </div>
        </div>
      </div>
    );
  }

  if (!crmReady) return <PageLoader />;

  if (crmError) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <div className="flex min-h-screen items-center justify-center px-4 pt-16">
          <div className="card w-full max-w-md p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50">
              <AlertCircle className="h-7 w-7 text-amber-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">CRM data unavailable</h1>
            <p className="mt-2 text-sm text-gray-600">{crmError}</p>
            <button
              type="button"
              onClick={() => {
                setCrmReady(false);
                fetchAll();
              }}
              className="btn-primary mt-6"
            >
              Retry loading
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#ffffff] flex flex-col">
      <Navbar
        mobileMenuLabel="CRM Menu"
        mobileMenuItems={SIDEBAR_TABS.map(tab => ({
          ...tab,
          active: activeTab === tab.id,
          onSelect: () => setActiveTab(tab.id),
        }))}
      />
      <div className="flex flex-1 pt-16">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 hidden md:flex flex-col border-r border-[#e5e7eb] bg-[#f8f8f8] px-4 py-6 gap-1">
          {SIDEBAR_TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab.id ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}>
              <tab.icon className="w-4 h-4" /> {tab.label}
            </button>
          ))}
        </aside>

        <main className="min-w-0 flex-1 overflow-auto p-4 sm:p-6">
          <AnimatePresence mode="wait">
            {/* Dashboard */}
            {activeTab === 'dashboard' && (
              <motion.div key="dash" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <h1 className="text-2xl font-bold text-gray-900 mb-6">CRM Dashboard</h1>
                <div className="grid grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
                  {[
                    { label: 'Total Clients', value: analytics?.totalClients ?? 0, icon: Users, color: 'text-orange-400 bg-orange-500/10' },
                    { label: 'Open Claims', value: analytics?.openClaims ?? 0, icon: AlertCircle, color: 'text-red-400 bg-red-500/10' },
                    { label: 'Awaiting Review', value: analytics?.reportsAwaitingReview ?? 0, icon: FileText, color: 'text-amber-500 bg-amber-500/10' },
                    { label: 'Overdue Appointments', value: analytics?.overdueAppointments ?? 0, icon: Calendar, color: 'text-red-500 bg-red-500/10' },
                    { label: 'Reports This Month', value: analytics?.reportsThisMonth ?? 0, icon: TrendingUp, color: 'text-green-500 bg-green-500/10' },
                    { label: 'Finalization Rate', value: `${analytics?.finalizationRate ?? 0}%`, icon: CheckCircle, color: 'text-green-600 bg-green-500/10' },
                  ].map(s => (
                    <div key={s.label} className="card p-5">
                      <div className={`w-10 h-10 rounded-xl ${s.color.split(' ')[1]} flex items-center justify-center mb-3`}>
                        <s.icon className={`w-5 h-5 ${s.color.split(' ')[0]}`} />
                      </div>
                      <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                      <p className="text-gray-600 text-sm mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="card p-5">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2"><Activity className="w-4 h-4" /> Recent Claims</h3>
                    {claimsLoading ? <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="skeleton h-10 w-full" />)}</div>
                      : !analytics?.recentClaims?.length ? <p className="text-sm text-gray-500">No claims yet.</p>
                      : analytics.recentClaims.map(claim => (
                        <button type="button" key={claim.id} onClick={() => navigate(`/crm/claims/${claim.id}`)} className="flex w-full items-center gap-3 border-b border-[#e5e7eb] py-2 text-left last:border-0 hover:bg-gray-50">
                          <FileText className="w-4 h-4 text-orange-500" />
                          <div><p className="font-mono text-gray-900 text-sm">{claim.claimNumber}</p><p className="text-gray-500 text-xs">{claim.lossType}</p></div>
                          <span className="ml-auto text-xs text-gray-500">{formatStatus(claim.status)}</span>
                        </button>
                      ))}
                  </div>
                  <div className="card p-5">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2"><Calendar className="w-4 h-4" /> Upcoming Appointments</h3>
                    {apptsLoading ? <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="skeleton h-10 w-full" />)}</div>
                      : appointments.filter(a => {
                        const d = parseLocalDate(a.date);
                        const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
                        return d && d >= startOfToday;
                      }).slice(0, 5).map(a => (
                        <div key={getRecordId(a)} className="flex items-center gap-3 py-2 border-b border-[#e5e7eb] last:border-0">
                          <Calendar className="w-4 h-4 text-orange-400 shrink-0" />
                          <div><p className="text-gray-900 text-sm">{a.title}</p><p className="text-gray-500 text-xs">{a.date} {a.time}</p></div>
                          <StatusPill status={a.status} />
                        </div>
                      ))}
                  </div>
                  <div className="card p-5">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4">Claims by Status</h3>
                    <div className="space-y-3">
                      {Object.entries(analytics?.claimsByStatus || {}).length === 0
                        ? <p className="text-sm text-gray-500">No claim status data yet.</p>
                        : Object.entries(analytics.claimsByStatus).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
                          <div key={status}>
                            <div className="mb-1 flex justify-between text-xs"><span className="text-gray-600">{formatStatus(status)}</span><span className="font-semibold text-gray-900">{count}</span></div>
                            <div className="h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full bg-orange-500" style={{ width: `${Math.round((count / Math.max(analytics.totalClaims, 1)) * 100)}%` }} /></div>
                          </div>
                        ))}
                    </div>
                  </div>
                  <div className="card p-5">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4">Six-Month Report Activity</h3>
                    <div className="flex h-36 items-end gap-3">
                      {(analytics?.usageTrend || []).map(month => {
                        const max = Math.max(...analytics.usageTrend.map(item => item.reports), 1);
                        return <div key={month.key} className="flex flex-1 flex-col items-center gap-2">
                          <span className="text-xs font-semibold text-gray-700">{month.reports}</span>
                          <div className="w-full rounded-t bg-orange-500" style={{ height: `${Math.max((month.reports / max) * 88, month.reports ? 8 : 2)}px` }} />
                          <span className="text-[11px] text-gray-500">{month.label}</span>
                        </div>;
                      })}
                    </div>
                    <p className="mt-3 text-xs text-gray-500">
                      Average finalized-report turnaround: {analytics?.averageTurnaroundHours == null ? 'Not enough data' : `${analytics.averageTurnaroundHours} hours`}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Clients */}
            {activeTab === 'clients' && (
              <motion.div key="clients" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
                  <div className="flex gap-2">
                    <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCSVImport} />
                    <button onClick={() => csvRef.current?.click()} disabled={csvImporting} className="btn-secondary text-sm py-2 px-3 flex items-center gap-2">
                      <Upload className="w-4 h-4" /> {csvImporting ? 'Importing...' : 'Import CSV'}
                    </button>
                    <button onClick={() => setShowNewClient(true)} className="btn-primary text-sm py-2 flex items-center gap-2">
                      <Plus className="w-4 h-4" /> New Client
                    </button>
                  </div>
                </div>
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input className="input pl-10" placeholder="Search clients..." value={clientSearch} onChange={e => setClientSearch(e.target.value)} />
                </div>
                <div className="card overflow-hidden">
                  <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="border-b border-[#e5e7eb]">
                      {['Name', 'Email', 'Phone', 'Company', 'Created', 'Actions'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {clientsLoading ? [...Array(5)].map((_, i) => (
                        <tr key={i}>{[...Array(6)].map((_, j) => <td key={j} className="px-4 py-3"><div className="skeleton h-4 w-full" /></td>)}</tr>
                      )) : filteredClients.length === 0 ? (
                        <tr><td colSpan={6} className="px-4 py-12 text-center">
                          <Users className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                          <p className="text-gray-600">No clients found. Add your first client.</p>
                        </td></tr>
                      ) : filteredClients.map(c => (
                        <tr key={getRecordId(c)} className="border-b border-[#e5e7eb] hover:bg-gray-100 transition-colors cursor-pointer" onClick={() => navigate(`/crm/clients/${getRecordId(c)}`)}>
                          <td className="px-4 py-3"><div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-orange-500/20 flex items-center justify-center text-xs font-bold text-orange-400">{(c.name || 'C')[0].toUpperCase()}</div>
                            <span className="text-gray-900 text-sm font-medium">{c.name}</span>
                          </div></td>
                          <td className="px-4 py-3 text-sm text-gray-600">{c.email}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{c.phone}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{c.company}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">{new Date(c.createdAt).toLocaleDateString()}</td>
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <div className="flex gap-1">
                              <button onClick={() => navigate(`/crm/clients/${getRecordId(c)}`)} aria-label={`View client ${c.name}`} title="View client" className="p-1.5 hover:bg-gray-100 rounded-lg"><Eye className="w-4 h-4 text-gray-600" /></button>
                              <button onClick={() => handleDeleteClient(getRecordId(c))} aria-label={`Delete client ${c.name}`} title="Delete client" className="p-1.5 hover:bg-red-500/10 rounded-lg"><Trash2 className="w-4 h-4 text-red-400" /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Appointments */}
            {activeTab === 'appointments' && (
              <motion.div key="appts" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
                  <h1 className="text-2xl font-bold text-gray-900">Appointments</h1>
                  <div className="flex w-full gap-2 sm:w-auto">
                    <div className="flex min-w-0 flex-1 overflow-hidden rounded-xl border border-[#e5e7eb] sm:flex-none">
                      {['month', 'week', 'list'].map(v => (
                        <button key={v} onClick={() => setCalView(v)}
                          className={`min-w-0 flex-1 px-2 py-2 text-xs font-medium transition-colors sm:flex-none sm:px-3 sm:text-sm ${calView === v ? 'bg-orange-500 text-white' : 'text-gray-600 hover:text-gray-900'}`}>
                          {v.charAt(0).toUpperCase() + v.slice(1)}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => setShowNewAppt(true)} aria-label="New appointment" className="btn-primary flex shrink-0 items-center gap-2 px-3 py-2 text-sm sm:px-6">
                      <Plus className="h-4 w-4" />
                      <span className="hidden sm:inline">New Appointment</span>
                    </button>
                  </div>
                </div>
                <div className="card p-2 sm:p-6">
                  {calView === 'month' && (
                    <CalendarGrid appointments={appointments} month={calMonth} year={calYear}
                      onPrev={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); }}
                      onNext={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); }} />
                  )}
                  {calView === 'week' && (
                    <div>
                      <p className="text-gray-600 text-sm mb-4">Week view — showing all appointments this week:</p>
                      <div className="space-y-2">
                        {appointments.filter(a => {
                          const d = parseLocalDate(a.date);
                          if (!d) return false;
                          const now = new Date();
                          const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
                          const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6);
                          return d >= weekStart && d <= weekEnd;
                        }).map(a => (
                          <div key={getRecordId(a)} className="flex flex-col items-start gap-2 rounded-xl border border-gray-200 bg-gray-100 p-3 sm:flex-row sm:items-center sm:gap-4">
                            <div className="shrink-0 text-sm font-medium text-orange-500 sm:w-24">{a.date}{a.time ? ` ${a.time}` : ''}</div>
                            <div className="min-w-0 flex-1"><p title={a.title} className="truncate text-sm text-gray-900">{a.title}</p><p title={a.location} className="truncate text-xs text-gray-500">{a.location}</p></div>
                            <StatusPill status={a.status} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {calView === 'list' && (
                    <div className="space-y-2">
                      {apptsLoading ? [...Array(5)].map((_, i) => <div key={i} className="skeleton h-14 w-full" />) :
                        appointments.length === 0 ? (
                          <div className="text-center py-8"><Calendar className="w-8 h-8 text-gray-600 mx-auto mb-2" /><p className="text-gray-600">No appointments yet.</p></div>
                        ) : appointments.map(a => (
                          <div key={getRecordId(a)} className="flex flex-col items-start gap-2 rounded-xl border border-gray-200 bg-gray-100 p-3 sm:flex-row sm:items-center sm:gap-4">
                            <div className="shrink-0 text-sm font-medium text-orange-500 sm:w-32">{a.date} {a.time}</div>
                            <div className="min-w-0 flex-1"><p title={a.title} className="truncate text-sm font-medium text-gray-900">{a.title}</p><p title={a.location} className="truncate text-xs text-gray-500">{a.location}</p></div>
                            <StatusPill status={a.status} />
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Claims */}
            {activeTab === 'claims' && (
              <motion.div key="claims" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div className="flex items-center justify-between mb-6">
                  <h1 className="text-2xl font-bold text-gray-900">Claims</h1>
                  <button onClick={() => setShowNewClaim(true)} className="btn-primary text-sm py-2 flex items-center gap-2">
                    <Plus className="w-4 h-4" /> New Claim
                  </button>
                </div>
                <div className="flex gap-2 mb-4 flex-wrap">
                  {['all', ...CLAIM_STATUSES].map(s => (
                    <button key={s} onClick={() => setClaimStatusFilter(s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${claimStatusFilter === s ? 'bg-orange-500 text-gray-900' : 'bg-gray-100 text-gray-600 hover:text-gray-900'}`}>
                      {s === 'all' ? 'All' : formatStatus(s)}
                    </button>
                  ))}
                </div>
                <div className="card overflow-hidden">
                  <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="border-b border-[#e5e7eb]">
                      {['Claim #', 'Client', 'Loss Type', 'Date', 'Status', 'Actions'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {claimsLoading ? [...Array(5)].map((_, i) => (
                        <tr key={i}>{[...Array(6)].map((_, j) => <td key={j} className="px-4 py-3"><div className="skeleton h-4 w-full" /></td>)}</tr>
                      )) : filteredClaims.length === 0 ? (
                        <tr><td colSpan={6} className="px-4 py-12 text-center">
                          <FileText className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                          <p className="text-gray-600">No claims found.</p>
                        </td></tr>
                      ) : filteredClaims.map(c => {
                        const client = clients.find(cl => getRecordId(cl) === c.clientId);
                        return (
                          <tr key={getRecordId(c)} className="cursor-pointer border-b border-[#e5e7eb] hover:bg-gray-100" onClick={() => navigate(`/crm/claims/${getRecordId(c)}`)}>
                            <td className="px-4 py-3 text-sm font-mono text-orange-700">{c.claimNumber}</td>
                            <td className="px-4 py-3 text-sm text-gray-900">{client?.name || c.clientId}</td>
                            <td className="px-4 py-3 text-sm text-gray-700">{c.lossType}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{c.lossDate}</td>
                            <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              c.status === 'closed' ? 'bg-gray-500/20 text-gray-600' :
                              c.status === 'open' ? 'bg-orange-500/20 text-orange-700' :
                              'bg-yellow-500/20 text-yellow-700'}`}>{formatStatus(c.status)}</span></td>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => navigate(`/crm/claims/${getRecordId(c)}`)}
                                className="rounded-lg p-1.5 hover:bg-gray-100"
                                aria-label={`View claim ${c.claimNumber}`}
                                title="View claim"
                              >
                                <Eye className="h-4 w-4 text-gray-600" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      <AnimatePresence>
        {showNewClient && <NewClientModal onClose={() => setShowNewClient(false)} onSaved={() => { setShowNewClient(false); fetchAll(); }} />}
        {showNewAppt && <NewAppointmentModal clients={clients} onClose={() => setShowNewAppt(false)} onSaved={() => { setShowNewAppt(false); fetchAll(); }} />}
        {showNewClaim && <NewClaimModal clients={clients} onClose={() => setShowNewClaim(false)} onSaved={() => { setShowNewClaim(false); fetchAll(); }} />}
        {selectedClaim && (
          <ClaimSlideOver
            claim={selectedClaim}
            client={clients.find(client => getRecordId(client) === selectedClaim.clientId)}
            onClose={() => setSelectedClaim(null)}
          />
        )}
        {deleteClientId && (
          <ConfirmDialog
            title="Delete client?"
            message="This permanently deletes the client record. Associated claims and appointments are not deleted, but will lose their client link. This cannot be undone."
            confirmLabel="Delete"
            loading={deleteClientLoading}
            onConfirm={confirmDeleteClient}
            onClose={() => setDeleteClientId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
