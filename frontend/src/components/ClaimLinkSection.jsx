import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { crmAPI } from '../services/api';

// Agency/Enterprise claim picker (T-6.16): select an existing CRM claim or create
// one inline, instead of free-typing claim details that can drift/duplicate.
// Shared between Dashboard.jsx and EnterpriseDashboard.jsx.
export default function ClaimLinkSection({ linkedClaim, linkedClientName, insuredEmail, onEmailChange, onSelect, onClear, lossTypes }) {
  const [mode, setMode] = useState('search');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [clients, setClients] = useState([]);
  const [newForm, setNewForm] = useState({ clientId: '', claimNumber: '', lossType: lossTypes[0], lossDate: '', propertyAddress: '' });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    crmAPI.getClients({ limit: 100 }).then(r => {
      const list = r.data?.data ?? r.data?.clients ?? [];
      setClients(Array.isArray(list) ? list : []);
    }).catch(() => setClients([]));
  }, []);

  useEffect(() => {
    if (linkedClaim) return;
    setSearching(true);
    const t = setTimeout(() => {
      crmAPI.getClaims({ search, limit: 8 })
        .then(r => setResults(r.data?.data ?? []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [search, linkedClaim]);

  const resolveClientName = (clientId) => clients.find(c => (c.id || c._id) === clientId)?.name || '';
  const resolveClientEmail = (clientId) => clients.find(c => (c.id || c._id) === clientId)?.email || '';

  const handleCreateClaim = async () => {
    if (!newForm.clientId || !newForm.claimNumber.trim() || !newForm.lossDate) {
      toast.error('Client, claim number, and loss date are required');
      return;
    }
    setCreating(true);
    try {
      const res = await crmAPI.createClaim(newForm);
      const claim = res.data.claim;
      onSelect(claim, resolveClientName(claim.clientId), resolveClientEmail(claim.clientId));
      setMode('search');
      setNewForm({ clientId: '', claimNumber: '', lossType: lossTypes[0], lossDate: '', propertyAddress: '' });
      toast.success('Claim created and linked');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create claim');
    } finally {
      setCreating(false);
    }
  };

  if (linkedClaim) {
    return (
      <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm space-y-1 min-w-0">
            <p className="font-mono font-semibold text-gray-900">{linkedClaim.claimNumber}</p>
            <p className="text-gray-600">{linkedClientName || 'No client assigned'} — {linkedClaim.lossType}</p>
            {linkedClaim.propertyAddress && <p className="text-gray-500 text-xs truncate">{linkedClaim.propertyAddress}</p>}
          </div>
          <button type="button" onClick={onClear} className="text-xs text-brand-600 hover:text-brand-700 underline shrink-0">Change claim</button>
        </div>
        <div className="mt-3">
          <label className="label">Insured Email *</label>
          <input type="email" className="input" placeholder="claimant@example.com"
            value={insuredEmail || ''} onChange={e => onEmailChange?.(e.target.value)} />
          {!insuredEmail && (
            <p className="text-xs text-gray-500 mt-1">Not on file for this client — enter it to continue.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setMode('search')}
          className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${mode === 'search' ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          Select Existing Claim
        </button>
        <button type="button" onClick={() => setMode('new')}
          className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${mode === 'new' ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          + New Claim
        </button>
      </div>

      {mode === 'search' ? (
        <div>
          <input className="input" placeholder="Search by claim number, loss type, or address…"
            value={search} onChange={e => setSearch(e.target.value)} />
          <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
            {searching ? (
              <p className="text-xs text-gray-400 px-1">Searching…</p>
            ) : results.length === 0 ? (
              <p className="text-xs text-gray-400 px-1">{search ? 'No matching claims.' : 'No claims yet — create one with "+ New Claim".'}</p>
            ) : results.map(c => (
              <button key={c.id || c._id} type="button" onClick={() => onSelect(c, resolveClientName(c.clientId), resolveClientEmail(c.clientId))}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-200 text-sm transition-colors">
                <span className="font-mono font-semibold text-gray-900">{c.claimNumber}</span>
                <span className="text-gray-500"> — {resolveClientName(c.clientId) || 'Unassigned'} — {c.lossType}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="label">Client *</label>
            <select className="input" value={newForm.clientId} onChange={e => setNewForm(p => ({ ...p, clientId: e.target.value }))}>
              <option value="">Select a client…</option>
              {clients.map(c => <option key={c.id || c._id} value={c.id || c._id}>{c.name}</option>)}
            </select>
            {clients.length === 0 && <p className="text-xs text-gray-400 mt-1">No CRM clients yet — add one in CRM → Clients first.</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Claim Number *</label>
              <input className="input" placeholder="e.g. CLM-2024-001" value={newForm.claimNumber}
                onChange={e => setNewForm(p => ({ ...p, claimNumber: e.target.value }))} />
            </div>
            <div>
              <label className="label">Loss Date *</label>
              <input type="date" className="input" value={newForm.lossDate}
                onChange={e => setNewForm(p => ({ ...p, lossDate: e.target.value }))} />
            </div>
            <div>
              <label className="label">Loss Type</label>
              <select className="input" value={newForm.lossType} onChange={e => setNewForm(p => ({ ...p, lossType: e.target.value }))}>
                {lossTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Property Address</label>
              <input className="input" placeholder="Street, city, state, zip" value={newForm.propertyAddress}
                onChange={e => setNewForm(p => ({ ...p, propertyAddress: e.target.value }))} />
            </div>
          </div>
          <button type="button" onClick={handleCreateClaim} disabled={creating} className="btn-primary text-sm py-2 px-4 disabled:opacity-50">
            {creating ? 'Creating…' : 'Create & Link Claim'}
          </button>
        </div>
      )}
    </div>
  );
}
