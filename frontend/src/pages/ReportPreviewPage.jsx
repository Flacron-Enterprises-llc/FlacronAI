import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Monitor, FileText, Pencil, CheckCircle, Download, RefreshCw,
  AlertCircle, ShieldCheck, Lock, X, Share2, UserCheck, XCircle, RotateCcw,
  FileWarning, Link2, Scale,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import ReportMarkdown from '../components/ReportMarkdown';
import ExportOptionsModal from '../components/ExportOptionsModal';
import ShareReportModal from '../components/ShareReportModal';
import CommentsPanel from '../components/CommentsPanel';
import useEscapeToClose from '../hooks/useEscapeToClose';
import { useAuth } from '../context/AuthContext';
import { reportsAPI, teamsAPI } from '../services/api';
import api from '../services/api';
import { parseReportSections } from '../utils/reportSections';

// Kept in sync with Dashboard.jsx's TIER_EXPORTS -- purely a UX convenience
// (which buttons look enabled). The server enforces `tier.exportFormats` on
// every /export call regardless of what this list says, so a stale value
// here can never grant an unentitled export (Golden Rule #4).
const TIER_EXPORTS = {
  starter: ['pdf'],
  professional: ['pdf', 'docx', 'html'],
  agency: ['pdf', 'docx', 'html'],
  enterprise: ['pdf', 'docx', 'html'],
};

const REVIEWED_STATUSES = ['finalized', 'approved', 'completed'];

function ApproveModal({ report, onClose, onApproved }) {
  useEscapeToClose(onClose, true, true);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseState, setLicenseState] = useState('');
  const [company, setCompany] = useState('');
  const [confirmReview, setConfirmReview] = useState(false);
  const [approving, setApproving] = useState(false);

  const submit = async () => {
    if (!name.trim() || !licenseNumber.trim() || !licenseState.trim() || !company.trim()) {
      toast.error('Full name, license number, license state, and company/firm are required.');
      return;
    }
    if (!confirmReview) {
      toast.error('You must confirm you have reviewed the report before approving.');
      return;
    }
    setApproving(true);
    try {
      const res = await reportsAPI.approve(report.id, {
        content: report.content,
        signature: { name: name.trim(), title: title.trim(), licenseNumber: licenseNumber.trim(), licenseState: licenseState.trim(), company: company.trim() },
        confirmReview: true,
      });
      toast.success('Report approved & finalized — exports are now clean');
      onApproved(res.data?.report || {});
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Approval failed');
    } finally {
      setApproving(false);
    }
  };

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={() => !approving && onClose()}>
      <motion.div className="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-labelledby="approve-modal-title"
        initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 id="approve-modal-title" className="text-lg font-bold text-gray-900">Approve &amp; Finalize</h2>
          <button onClick={onClose} disabled={approving} aria-label="Close" className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">This finalizes the report as reviewed. Exports will no longer carry the DRAFT watermark. Any later edit reopens it as a draft.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Full name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Adjuster"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Senior Adjuster"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">License number *</label>
            <input value={licenseNumber} onChange={e => setLicenseNumber(e.target.value)} placeholder="TX-ADJ-583920"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">License state *</label>
            <input value={licenseState} onChange={e => setLicenseState(e.target.value)} placeholder="TX"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400" />
          </div>
        </div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Company / adjusting firm *</label>
        <input value={company} onChange={e => setCompany(e.target.value)} placeholder="ABC Claims Services"
          className="w-full mb-3 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400" />
        <label className="flex items-start gap-2 mb-4 text-xs text-gray-700 cursor-pointer">
          <input type="checkbox" checked={confirmReview} onChange={e => setConfirmReview(e.target.checked)}
            className="mt-0.5 rounded border-gray-300 text-brand-600 focus:ring-brand-400" />
          <span>I confirm that I have reviewed this report, made any necessary corrections, and approve this version for final export.</span>
        </label>
        <div className="flex gap-3">
          <button onClick={onClose} disabled={approving} className="btn-secondary flex-1 text-sm py-2 disabled:opacity-50">Cancel</button>
          <button onClick={submit} disabled={approving} className="btn-primary flex-1 text-sm py-2 flex items-center justify-center gap-2 disabled:opacity-50">
            {approving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {approving ? 'Approving…' : 'Approve & Finalize'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Phase 36 (Mold Assessment Supplemental Report): generates a NEW, separate
// report linked back to this one -- not entered via the primary wizard. Only
// asks for the 2 genuinely new fields (relatedClaimId defaults to this
// report's own claim number, dateOfDiscovery is required); everything else
// (insured/property/reviewed-photo data) is reused server-side from `report`.
function MoldSupplementModal({ report, onClose, onGenerated }) {
  useEscapeToClose(onClose, true, true);
  const [relatedClaimId, setRelatedClaimId] = useState(report.claimNumber || '');
  const [dateOfDiscovery, setDateOfDiscovery] = useState('');
  const [generating, setGenerating] = useState(false);

  const submit = async () => {
    if (!dateOfDiscovery) {
      toast.error('Date of discovery is required.');
      return;
    }
    setGenerating(true);
    try {
      const res = await reportsAPI.generateMoldSupplement(report.id, {
        dateOfDiscovery,
        relatedClaimId: relatedClaimId.trim(),
      });
      toast.success('Mold Assessment Supplement generated as a new draft');
      onGenerated(res.data?.report);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not generate the mold supplement');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={() => !generating && onClose()}>
      <motion.div className="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-labelledby="mold-supplement-modal-title"
        initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 id="mold-supplement-modal-title" className="text-lg font-bold text-gray-900">Generate Mold Assessment Supplement</h2>
          <button onClick={onClose} disabled={generating} aria-label="Close" className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Creates a new, separate draft report linked to this claim, reusing its insured, property, and reviewed photo data.
          It is a preliminary AI-drafted visual observation only — <strong>not a certified mold assessment</strong>.
        </p>
        <label className="block text-xs font-medium text-gray-600 mb-1">Related claim number</label>
        <input value={relatedClaimId} onChange={(e) => setRelatedClaimId(e.target.value)} placeholder={report.claimNumber || 'e.g. CLM-2024-WD-337'}
          maxLength={60} disabled={generating}
          className="w-full mb-3 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400" />
        <label className="block text-xs font-medium text-gray-600 mb-1">Date of discovery *</label>
        <input type="date" value={dateOfDiscovery} onChange={(e) => setDateOfDiscovery(e.target.value)} disabled={generating}
          className="w-full mb-4 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400" />
        <div className="flex gap-3">
          <button onClick={onClose} disabled={generating} className="btn-secondary flex-1 text-sm py-2 disabled:opacity-50">Cancel</button>
          <button onClick={submit} disabled={generating} className="btn-primary flex-1 text-sm py-2 flex items-center justify-center gap-2 disabled:opacity-50">
            {generating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileWarning className="w-4 h-4" />}
            {generating ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Phase 37 (Repair Estimate with Depreciation Schedule): the form-heavy line
// item / depreciation entry UI. `mode: 'create'` spawns a new linked
// document off `report` (an existing, non-estimate report); `mode: 'revise'`
// edits `report` itself (an existing RepairEstimate) and requires a
// changeSummary. Every dollar figure shown here is a client-side PREVIEW
// only, computed the same way the server does, purely for the adjuster's
// convenience while typing -- the server (estimateCalculations.js)
// recomputes everything authoritatively on submit and is the only source of
// truth ever persisted or exported (Golden Rule #2: AI never computes or
// supplies a dollar amount, and neither does this preview -- it's a plain
// arithmetic mirror of adjuster-entered numbers).
const emptyLineItem = () => ({ code: '', description: '', qty: '1', unit: 'EA', unitPrice: '0', taxable: true });
const emptyDepRow = () => ({
  item: '',
  ageYears: '0',
  lifeExpectancyYears: '20',
  condition: '',
  depreciationPercent: '0',
  relatedLineItemCodes: [],
});
const money = (n) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function RepairEstimateModal({ report, mode, onClose, onSaved }) {
  useEscapeToClose(onClose, true, true);
  const isRevise = mode === 'revise';
  const [estimateNumber, setEstimateNumber] = useState(report.estimateNumber || `EST-${report.claimNumber || 'CLAIM'}-01`);
  const [estimateDate, setEstimateDate] = useState(report.estimateDate || new Date().toISOString().slice(0, 10));
  const [priceListBasis, setPriceListBasis] = useState(report.priceListBasis || '');
  const [preparedWith, setPreparedWith] = useState(report.preparedWith || '');
  const [overheadProfitPercent, setOverheadProfitPercent] = useState(String(report.overheadProfitPercent ?? '10'));
  const [taxRatePercent, setTaxRatePercent] = useState(String(report.taxRatePercent ?? '0'));
  const [taxBasis, setTaxBasis] = useState(report.taxBasis || '');
  const [lineItems, setLineItems] = useState(
    report.lineItems?.length ? report.lineItems.map((li) => ({ ...li, qty: String(li.qty), unitPrice: String(li.unitPrice) })) : [emptyLineItem()]
  );
  const [depreciationSchedule, setDepreciationSchedule] = useState(
    report.depreciationSchedule?.length
      ? report.depreciationSchedule.map((d) => ({ ...d, ageYears: String(d.ageYears), lifeExpectancyYears: String(d.lifeExpectancyYears), depreciationPercent: String(d.depreciationPercent) }))
      : []
  );
  const [changeSummary, setChangeSummary] = useState('');
  const [saving, setSaving] = useState(false);

  const validCodes = useMemo(() => [...new Set(lineItems.map((li) => li.code.trim()).filter(Boolean))], [lineItems]);

  const preview = useMemo(() => {
    const items = lineItems.map((li) => ({
      taxable: li.taxable !== false,
      lineTotal: (Number(li.qty) || 0) * (Number(li.unitPrice) || 0),
    }));
    const subtotal = items.reduce((s, li) => s + li.lineTotal, 0);
    const overheadProfit = subtotal * ((Number(overheadProfitPercent) || 0) / 100);
    const taxable = items.filter((li) => li.taxable).reduce((s, li) => s + li.lineTotal, 0);
    const tax = taxable * ((Number(taxRatePercent) || 0) / 100);
    return { subtotal, overheadProfit, tax, grandTotal: subtotal + overheadProfit + tax };
  }, [lineItems, overheadProfitPercent, taxRatePercent]);

  const updateLineItem = (i, field, value) =>
    setLineItems((prev) => prev.map((li, idx) => (idx === i ? { ...li, [field]: value } : li)));
  const removeLineItem = (i) => setLineItems((prev) => prev.filter((_, idx) => idx !== i));
  const updateDepRow = (i, field, value) =>
    setDepreciationSchedule((prev) => prev.map((d, idx) => (idx === i ? { ...d, [field]: value } : d)));
  const toggleDepCode = (i, code) =>
    setDepreciationSchedule((prev) =>
      prev.map((d, idx) => {
        if (idx !== i) return d;
        const has = d.relatedLineItemCodes.includes(code);
        return { ...d, relatedLineItemCodes: has ? d.relatedLineItemCodes.filter((c) => c !== code) : [...d.relatedLineItemCodes, code] };
      })
    );
  const removeDepRow = (i) => setDepreciationSchedule((prev) => prev.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (isRevise && !changeSummary.trim()) {
      toast.error('A change summary is required when revising an estimate.');
      return;
    }
    if (!estimateNumber.trim()) {
      toast.error('Estimate number is required.');
      return;
    }
    if (!lineItems.length || lineItems.some((li) => !li.code.trim() || !li.description.trim() || !li.unit.trim())) {
      toast.error('Every line item needs a code, description, and unit.');
      return;
    }
    const payload = {
      estimateNumber: estimateNumber.trim(),
      estimateDate,
      priceListBasis: priceListBasis.trim(),
      preparedWith: preparedWith.trim(),
      overheadProfitPercent: Number(overheadProfitPercent),
      taxRatePercent: Number(taxRatePercent),
      taxBasis: taxBasis.trim(),
      lineItems: lineItems.map((li) => ({
        code: li.code.trim(),
        description: li.description.trim(),
        qty: Number(li.qty),
        unit: li.unit.trim(),
        unitPrice: Number(li.unitPrice),
        taxable: li.taxable !== false,
      })),
      depreciationSchedule: depreciationSchedule.map((d) => ({
        item: d.item.trim(),
        ageYears: Number(d.ageYears),
        lifeExpectancyYears: Number(d.lifeExpectancyYears),
        condition: d.condition.trim(),
        depreciationPercent: Number(d.depreciationPercent),
        relatedLineItemCodes: d.relatedLineItemCodes,
      })),
      changeSummary: changeSummary.trim() || 'Initial estimate created',
    };
    setSaving(true);
    try {
      const res = isRevise
        ? await reportsAPI.reviseEstimate(report.id, payload)
        : await reportsAPI.createEstimate(report.id, payload);
      toast.success(isRevise ? 'Estimate revised' : 'Repair Estimate created as a new draft');
      onSaved(res.data?.report);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save the repair estimate');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400';

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={() => !saving && onClose()}>
      <motion.div className="card w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6" role="dialog" aria-modal="true" aria-labelledby="estimate-modal-title"
        initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 id="estimate-modal-title" className="text-lg font-bold text-gray-900">
            {isRevise ? `Revise Repair Estimate (Rev. ${(report.revision || 0) + 1})` : 'Generate Repair Estimate'}
          </h2>
          <button onClick={onClose} disabled={saving} aria-label="Close" className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Enter quantities, unit rates, and percentages -- every dollar amount is calculated automatically. FlacronAI's AI never generates or determines any dollar figure in this document.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Estimate number *</label>
            <input value={estimateNumber} onChange={(e) => setEstimateNumber(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Estimate date</label>
            <input type="date" value={estimateDate} onChange={(e) => setEstimateDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Price list basis</label>
            <input value={priceListBasis} onChange={(e) => setPriceListBasis(e.target.value)} placeholder="e.g. Central TX Residential, Mar 2024" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Prepared with</label>
            <input value={preparedWith} onChange={(e) => setPreparedWith(e.target.value)} placeholder="e.g. Flacron Engine, v2.3" className={inputCls} />
          </div>
        </div>

        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-gray-800">Line Items</h3>
          <button onClick={() => setLineItems((prev) => [...prev, emptyLineItem()])} className="btn-secondary text-xs py-1 px-2">+ Add Line Item</button>
        </div>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="p-1 w-20">Code</th>
                <th className="p-1">Description</th>
                <th className="p-1 w-16">Qty</th>
                <th className="p-1 w-16">Unit</th>
                <th className="p-1 w-24">Unit Price</th>
                <th className="p-1 w-14">Taxable</th>
                <th className="p-1 w-20 text-right">Line Total</th>
                <th className="p-1 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((li, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="p-1"><input value={li.code} onChange={(e) => updateLineItem(i, 'code', e.target.value)} className={inputCls} /></td>
                  <td className="p-1"><input value={li.description} onChange={(e) => updateLineItem(i, 'description', e.target.value)} className={inputCls} /></td>
                  <td className="p-1"><input type="number" min="0" step="any" value={li.qty} onChange={(e) => updateLineItem(i, 'qty', e.target.value)} className={inputCls} /></td>
                  <td className="p-1"><input value={li.unit} onChange={(e) => updateLineItem(i, 'unit', e.target.value)} className={inputCls} /></td>
                  <td className="p-1"><input type="number" min="0" step="any" value={li.unitPrice} onChange={(e) => updateLineItem(i, 'unitPrice', e.target.value)} className={inputCls} /></td>
                  <td className="p-1 text-center"><input type="checkbox" checked={li.taxable !== false} onChange={(e) => updateLineItem(i, 'taxable', e.target.checked)} /></td>
                  <td className="p-1 text-right font-medium text-gray-700">{money((Number(li.qty) || 0) * (Number(li.unitPrice) || 0))}</td>
                  <td className="p-1">
                    {lineItems.length > 1 && (
                      <button onClick={() => removeLineItem(i)} aria-label="Remove line item" className="text-gray-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Overhead & Profit %</label>
            <input type="number" min="0" max="100" step="any" value={overheadProfitPercent} onChange={(e) => setOverheadProfitPercent(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Sales tax rate %</label>
            <input type="number" min="0" max="100" step="any" value={taxRatePercent} onChange={(e) => setTaxRatePercent(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tax basis (descriptive)</label>
            <input value={taxBasis} onChange={(e) => setTaxBasis(e.target.value)} placeholder="e.g. materials only, sample jurisdiction rate" className={inputCls} />
          </div>
        </div>

        <div className="card p-3 mb-5 bg-gray-50 border border-gray-200 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span className="font-medium">{money(preview.subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Overhead & Profit</span><span className="font-medium">{money(preview.overheadProfit)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Sales Tax</span><span className="font-medium">{money(preview.tax)}</span></div>
          <div className="flex justify-between border-t border-gray-200 mt-1 pt-1"><span className="font-bold text-gray-800">Total Estimate (Draft)</span><span className="font-bold text-brand-600">{money(preview.grandTotal)}</span></div>
          <p className="text-[10px] text-gray-400 mt-1">Preview only -- the server recomputes and stores the authoritative totals.</p>
        </div>

        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-gray-800">Depreciation Schedule (optional)</h3>
          <button onClick={() => setDepreciationSchedule((prev) => [...prev, emptyDepRow()])} className="btn-secondary text-xs py-1 px-2">+ Add Row</button>
        </div>
        {depreciationSchedule.map((d, i) => (
          <div key={i} className="border border-gray-200 rounded-lg p-3 mb-2">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-2">
              <input value={d.item} onChange={(e) => updateDepRow(i, 'item', e.target.value)} placeholder="Item (e.g. Roof covering)" className={inputCls} />
              <input type="number" min="0" step="any" value={d.ageYears} onChange={(e) => updateDepRow(i, 'ageYears', e.target.value)} placeholder="Age (yrs)" className={inputCls} />
              <input type="number" min="0" step="any" value={d.lifeExpectancyYears} onChange={(e) => updateDepRow(i, 'lifeExpectancyYears', e.target.value)} placeholder="Life exp. (yrs)" className={inputCls} />
              <input value={d.condition} onChange={(e) => updateDepRow(i, 'condition', e.target.value)} placeholder="Condition (e.g. Fair)" className={inputCls} />
              <input type="number" min="0" max="100" step="any" value={d.depreciationPercent} onChange={(e) => updateDepRow(i, 'depreciationPercent', e.target.value)} placeholder="Depr. %" className={inputCls} />
            </div>
            <p className="text-xs text-gray-500 mb-1">Related line items (RCV = sum of their line totals):</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {validCodes.length ? validCodes.map((code) => (
                <button key={code} type="button" onClick={() => toggleDepCode(i, code)}
                  className={`text-xs px-2 py-0.5 rounded-full border ${d.relatedLineItemCodes.includes(code) ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-600 border-gray-300'}`}>
                  {code}
                </button>
              )) : <span className="text-xs text-gray-400">Add a line item code above first</span>}
            </div>
            <button onClick={() => removeDepRow(i)} className="text-xs text-red-500 hover:underline">Remove row</button>
          </div>
        ))}

        {isRevise && (
          <div className="mt-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">Change summary *</label>
            <textarea value={changeSummary} onChange={(e) => setChangeSummary(e.target.value)} rows={2} placeholder="e.g. Added attic decking line item; updated roofing quantity"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400" />
          </div>
        )}

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} disabled={saving} className="btn-secondary flex-1 text-sm py-2 disabled:opacity-50">Cancel</button>
          <button onClick={submit} disabled={saving} className="btn-primary flex-1 text-sm py-2 flex items-center justify-center gap-2 disabled:opacity-50">
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {saving ? 'Saving…' : isRevise ? 'Save Revision' : 'Create Estimate'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Phase 38 (Invoice Document): generated from an existing, already-created
// Repair Estimate (`mode: 'create'`, `report` = the estimate itself) or
// revised in place (`mode: 'revise'`, `report` = the invoice itself).
// Services Rendered is always a READ-ONLY reuse of the estimate's own line
// items -- this modal never lets the user re-enter or re-price them (Golden
// Rule #2: neither AI nor this UI determines a repair cost; only the
// already-approved estimate's own deterministic line totals are reused).
// The totals preview below is a client-side convenience mirror only -- the
// server (invoiceCalculations.js) recomputes and stores the authoritative
// numbers.
const emptyChangeOrder = () => ({ coNumber: '', description: '', amount: '0' });
const emptyPayment = () => ({ date: new Date().toISOString().slice(0, 10), description: '', method: '', amount: '0' });

function InvoiceModal({ report, mode, onClose, onSaved }) {
  useEscapeToClose(onClose, true, true);
  const isRevise = mode === 'revise';
  const servicesRendered = useMemo(
    () => (isRevise ? report.servicesRendered || [] : report.lineItems || []),
    [isRevise, report.servicesRendered, report.lineItems]
  );
  const [billToName, setBillToName] = useState(report.billTo?.name || report.insuredName || '');
  const [billToAddress, setBillToAddress] = useState(report.billTo?.address || report.propertyAddress || '');
  const [invoiceNumber, setInvoiceNumber] = useState(report.invoiceNumber || `INV-${report.claimNumber || 'CLAIM'}-01`);
  const [invoiceDate, setInvoiceDate] = useState(report.invoiceDate || new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(report.dueDate || new Date().toISOString().slice(0, 10));
  const [jobNumber, setJobNumber] = useState(report.jobNumber || '');
  const [taxRatePercent, setTaxRatePercent] = useState(String(report.taxRatePercent ?? '0'));
  const [paymentTerms, setPaymentTerms] = useState(report.paymentTerms || 'Net 30 days from invoice date.');
  const [warrantyText, setWarrantyText] = useState(report.warrantyText || '');
  const [remitToName, setRemitToName] = useState(report.remitTo?.name || '');
  const [remitToInstructions, setRemitToInstructions] = useState(report.remitTo?.instructions || '');
  const [changeOrderLog, setChangeOrderLog] = useState(
    report.changeOrderLog?.length ? report.changeOrderLog.map((c) => ({ ...c, amount: String(c.amount) })) : []
  );
  const [paymentHistory, setPaymentHistory] = useState(
    report.paymentHistory?.length ? report.paymentHistory.map((p) => ({ ...p, amount: String(p.amount) })) : []
  );
  const [changeSummary, setChangeSummary] = useState('');
  const [saving, setSaving] = useState(false);

  const preview = useMemo(() => {
    const subtotal = servicesRendered.reduce((s, li) => s + (Number(li.lineTotal) || 0), 0);
    const taxable = servicesRendered
      .filter((li) => li.taxable !== false)
      .reduce((s, li) => s + (Number(li.lineTotal) || 0), 0);
    const tax = taxable * ((Number(taxRatePercent) || 0) / 100);
    const paymentsTotal = paymentHistory.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    return { subtotal, tax, paymentsTotal, balanceDue: subtotal + tax - paymentsTotal };
  }, [servicesRendered, taxRatePercent, paymentHistory]);

  const updateCO = (i, field, value) =>
    setChangeOrderLog((prev) => prev.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)));
  const removeCO = (i) => setChangeOrderLog((prev) => prev.filter((_, idx) => idx !== i));
  const updatePayment = (i, field, value) =>
    setPaymentHistory((prev) => prev.map((p, idx) => (idx === i ? { ...p, [field]: value } : p)));
  const removePayment = (i) => setPaymentHistory((prev) => prev.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (isRevise && !changeSummary.trim()) {
      toast.error('A change summary is required when revising an invoice.');
      return;
    }
    if (!billToName.trim() || !billToAddress.trim()) {
      toast.error('Bill To name and address are required.');
      return;
    }
    if (!invoiceNumber.trim()) {
      toast.error('Invoice number is required.');
      return;
    }
    if (!remitToName.trim() || !remitToInstructions.trim()) {
      toast.error('Remit-to name and instructions are required.');
      return;
    }
    if (changeOrderLog.some((c) => !c.coNumber.trim() || !c.description.trim())) {
      toast.error('Every change order needs a number and description.');
      return;
    }
    if (paymentHistory.some((p) => !p.date || !p.description.trim() || !p.method.trim() || !(Number(p.amount) > 0))) {
      toast.error('Every payment needs a date, description, method, and a positive amount.');
      return;
    }
    const payload = {
      billTo: { name: billToName.trim(), address: billToAddress.trim() },
      remitTo: { name: remitToName.trim(), instructions: remitToInstructions.trim() },
      invoiceNumber: invoiceNumber.trim(),
      invoiceDate,
      dueDate,
      jobNumber: jobNumber.trim(),
      taxRatePercent: Number(taxRatePercent),
      paymentTerms: paymentTerms.trim(),
      warrantyText: warrantyText.trim(),
      changeOrderLog: changeOrderLog.map((c) => ({
        coNumber: c.coNumber.trim(),
        description: c.description.trim(),
        amount: Number(c.amount),
      })),
      paymentHistory: paymentHistory.map((p) => ({
        date: p.date,
        description: p.description.trim(),
        method: p.method.trim(),
        amount: Number(p.amount),
      })),
      changeSummary: changeSummary.trim() || 'Initial invoice created',
    };
    setSaving(true);
    try {
      const res = isRevise
        ? await reportsAPI.reviseInvoice(report.id, payload)
        : await reportsAPI.createInvoice(report.id, payload);
      toast.success(isRevise ? 'Invoice revised' : 'Invoice created as a new draft');
      onSaved(res.data?.report);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save the invoice');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400';

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={() => !saving && onClose()}>
      <motion.div className="card w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6" role="dialog" aria-modal="true" aria-labelledby="invoice-modal-title"
        initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 id="invoice-modal-title" className="text-lg font-bold text-gray-900">
            {isRevise ? `Revise Invoice (Rev. ${(report.revision || 0) + 1})` : 'Generate Invoice'}
          </h2>
          <button onClick={onClose} disabled={saving} aria-label="Close" className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Services Rendered is reused from the linked Repair Estimate and cannot be edited here. FlacronAI's AI never generates or determines any dollar figure in this document.
        </p>

        <h3 className="text-sm font-bold text-gray-800 mb-2">Bill To</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
          <input value={billToName} onChange={(e) => setBillToName(e.target.value)} placeholder="Name" className={inputCls} />
          <input value={billToAddress} onChange={(e) => setBillToAddress(e.target.value)} placeholder="Address" className={inputCls} />
        </div>

        <h3 className="text-sm font-bold text-gray-800 mb-2">Invoice Details</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Invoice number *</label>
            <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Invoice date</label>
            <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Due date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Job number</label>
            <input value={jobNumber} onChange={(e) => setJobNumber(e.target.value)} className={inputCls} />
          </div>
        </div>

        <h3 className="text-sm font-bold text-gray-800 mb-2">Services Rendered (from linked Repair Estimate)</h3>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="p-1 w-20">Code</th>
                <th className="p-1">Description</th>
                <th className="p-1 w-14">Qty</th>
                <th className="p-1 w-14">Unit</th>
                <th className="p-1 w-20">Rate</th>
                <th className="p-1 w-20 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {servicesRendered.map((li, i) => (
                <tr key={i} className="border-t border-gray-100 text-gray-600">
                  <td className="p-1">{li.code}</td>
                  <td className="p-1">{li.description}</td>
                  <td className="p-1">{li.qty}</td>
                  <td className="p-1">{li.unit}</td>
                  <td className="p-1">{money(li.unitPrice)}</td>
                  <td className="p-1 text-right font-medium text-gray-700">{money(li.lineTotal)}</td>
                </tr>
              ))}
              {!servicesRendered.length && (
                <tr><td colSpan={6} className="p-2 text-center text-gray-400">No services found on the linked estimate.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Sales tax rate %</label>
            <input type="number" min="0" max="100" step="any" value={taxRatePercent} onChange={(e) => setTaxRatePercent(e.target.value)} className={inputCls} />
          </div>
        </div>

        <div className="card p-3 mb-5 bg-gray-50 border border-gray-200 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Combined Subtotal</span><span className="font-medium">{money(preview.subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Sales Tax</span><span className="font-medium">{money(preview.tax)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Payments Received</span><span className="font-medium">({money(preview.paymentsTotal)})</span></div>
          <div className="flex justify-between border-t border-gray-200 mt-1 pt-1"><span className="font-bold text-gray-800">Total Due</span><span className="font-bold text-brand-600">{money(preview.balanceDue)}</span></div>
          <p className="text-[10px] text-gray-400 mt-1">Preview only -- the server recomputes and stores the authoritative totals.</p>
        </div>

        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-gray-800">Payment History (optional)</h3>
          <button onClick={() => setPaymentHistory((prev) => [...prev, emptyPayment()])} className="btn-secondary text-xs py-1 px-2">+ Add Payment</button>
        </div>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-xs">
            <tbody>
              {paymentHistory.map((p, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="p-1"><input type="date" value={p.date} onChange={(e) => updatePayment(i, 'date', e.target.value)} className={inputCls} /></td>
                  <td className="p-1"><input value={p.description} onChange={(e) => updatePayment(i, 'description', e.target.value)} placeholder="Description" className={inputCls} /></td>
                  <td className="p-1"><input value={p.method} onChange={(e) => updatePayment(i, 'method', e.target.value)} placeholder="Method" className={inputCls} /></td>
                  <td className="p-1 w-24"><input type="number" min="0" step="any" value={p.amount} onChange={(e) => updatePayment(i, 'amount', e.target.value)} className={inputCls} /></td>
                  <td className="p-1 w-8"><button onClick={() => removePayment(i)} aria-label="Remove payment" className="text-gray-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-gray-800">Change Order Log (optional, informational)</h3>
          <button onClick={() => setChangeOrderLog((prev) => [...prev, emptyChangeOrder()])} className="btn-secondary text-xs py-1 px-2">+ Add Change Order</button>
        </div>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-xs">
            <tbody>
              {changeOrderLog.map((c, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="p-1 w-20"><input value={c.coNumber} onChange={(e) => updateCO(i, 'coNumber', e.target.value)} placeholder="CO #" className={inputCls} /></td>
                  <td className="p-1"><input value={c.description} onChange={(e) => updateCO(i, 'description', e.target.value)} placeholder="Description" className={inputCls} /></td>
                  <td className="p-1 w-24"><input type="number" step="any" value={c.amount} onChange={(e) => updateCO(i, 'amount', e.target.value)} className={inputCls} /></td>
                  <td className="p-1 w-8"><button onClick={() => removeCO(i)} aria-label="Remove change order" className="text-gray-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-gray-400 -mt-2 mb-4">Change orders are logged for reference only and are not automatically added to the totals above.</p>

        <h3 className="text-sm font-bold text-gray-800 mb-2">Payment Terms & Remit-To</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
          <textarea value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} rows={2} placeholder="Payment terms" className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400" />
          <textarea value={warrantyText} onChange={(e) => setWarrantyText(e.target.value)} rows={2} placeholder="Warranty text (optional)" className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
          <input value={remitToName} onChange={(e) => setRemitToName(e.target.value)} placeholder="Remit-to name" className={inputCls} />
          <input value={remitToInstructions} onChange={(e) => setRemitToInstructions(e.target.value)} placeholder="Remit-to instructions" className={inputCls} />
        </div>

        {isRevise && (
          <div className="mt-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">Change summary *</label>
            <textarea value={changeSummary} onChange={(e) => setChangeSummary(e.target.value)} rows={2} placeholder="e.g. Recorded second progress payment; updated due date"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400" />
          </div>
        )}

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} disabled={saving} className="btn-secondary flex-1 text-sm py-2 disabled:opacity-50">Cancel</button>
          <button onClick={submit} disabled={saving} className="btn-primary flex-1 text-sm py-2 flex items-center justify-center gap-2 disabled:opacity-50">
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {saving ? 'Saving…' : isRevise ? 'Save Revision' : 'Create Invoice'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Phase 39 (Coverage Determination Letter): the approved authoring model
// (PHASES.md) -- the licensed adjuster enters EVERY coverage decision here;
// FlacronAI drafts zero approval/denial, policy basis, rights, or payment
// content. `mode: 'create'` is opened from an already-FINALIZED base report
// (`report` = that report) and requires picking an already-APPROVED linked
// Repair Estimate first; `mode: 'revise'` is opened from the letter itself
// (`report` = the letter), reusing its frozen estimate snapshot. The totals
// preview below is a client-side convenience mirror only -- the server
// (coverageLetterCalculations.js) recomputes and stores the authoritative
// numbers, restricted to items marked "Approved".
const emptyCoverageLimit = () => ({ coverageType: '', description: '', limit: '0' });
const emptyPerItem = () => ({ item: '', determination: 'approved', policyBasis: '', relatedLineItemCodes: [], pendingNote: '' });
const emptyRight = () => ({ heading: '', text: '' });

function CoverageLetterModal({ report, mode, onClose, onSaved }) {
  useEscapeToClose(onClose, true, true);
  const isRevise = mode === 'revise';

  const [linkedEstimates, setLinkedEstimates] = useState([]);
  const [loadingEstimates, setLoadingEstimates] = useState(!isRevise);
  const [estimateId, setEstimateId] = useState(report.relatedEstimateId || '');

  useEffect(() => {
    if (isRevise) return;
    reportsAPI.getAll({ relatedReportId: report.id, documentType: 'RepairEstimate' })
      .then((res) => {
        const approved = (res.data?.data || []).filter((r) => REVIEWED_STATUSES.includes(r.status));
        setLinkedEstimates(approved);
        if (approved.length === 1) setEstimateId(approved[0].id);
      })
      .catch(() => setLinkedEstimates([]))
      .finally(() => setLoadingEstimates(false));
  }, [isRevise, report.id]);

  const selectedEstimate = isRevise ? null : linkedEstimates.find((e) => e.id === estimateId) || null;
  const lineItems = useMemo(
    () => (isRevise ? (report.estimateLineItemsSnapshot || []) : (selectedEstimate?.lineItems || [])),
    [isRevise, report.estimateLineItemsSnapshot, selectedEstimate]
  );
  const depreciationSchedule = useMemo(
    () => (isRevise ? (report.estimateDepreciationScheduleSnapshot || []) : (selectedEstimate?.depreciationSchedule || [])),
    [isRevise, report.estimateDepreciationScheduleSnapshot, selectedEstimate]
  );
  const validCodes = useMemo(() => [...new Set(lineItems.map((li) => li.code).filter(Boolean))], [lineItems]);

  const [addresseeName, setAddresseeName] = useState(report.addressee?.name || report.insuredName || '');
  const [addresseeAddress, setAddresseeAddress] = useState(report.addressee?.address || report.propertyAddress || '');
  const [adjusterName, setAdjusterName] = useState(report.adjusterOfRecord?.name || '');
  const [adjusterTitle, setAdjusterTitle] = useState(report.adjusterOfRecord?.title || '');
  const [adjusterPhone, setAdjusterPhone] = useState(report.adjusterOfRecord?.phone || '');
  const [adjusterEmail, setAdjusterEmail] = useState(report.adjusterOfRecord?.email || '');
  const [letterDate, setLetterDate] = useState(report.letterDate || new Date().toISOString().slice(0, 10));
  const [determinationSummary, setDeterminationSummary] = useState(report.determinationSummary || '');
  const [deductibleDescription, setDeductibleDescription] = useState(report.deductible?.description || '');
  const [deductibleAmount, setDeductibleAmount] = useState(String(report.deductible?.amount ?? '0'));
  const [coverageLimits, setCoverageLimits] = useState(
    report.coverageLimits?.length ? report.coverageLimits.map((c) => ({ ...c, limit: String(c.limit) })) : [emptyCoverageLimit()]
  );
  const [perItemDetermination, setPerItemDetermination] = useState(
    report.perItemDetermination?.length ? report.perItemDetermination.map((r) => ({ ...r })) : [emptyPerItem()]
  );
  const [rightsAndNextSteps, setRightsAndNextSteps] = useState(
    report.rightsAndNextSteps?.length ? report.rightsAndNextSteps.map((r) => ({ ...r })) : [emptyRight()]
  );
  const [enclosures, setEnclosures] = useState(report.enclosures?.length ? [...report.enclosures] : ['']);
  const [changeSummary, setChangeSummary] = useState('');
  const [saving, setSaving] = useState(false);

  const preview = useMemo(() => {
    const byCode = new Map(lineItems.map((li) => [li.code, li]));
    const approvedCodes = new Set(
      perItemDetermination.filter((r) => r.determination === 'approved').flatMap((r) => r.relatedLineItemCodes || [])
    );
    let rcv = 0;
    approvedCodes.forEach((code) => { const li = byCode.get(code); if (li) rcv += Number(li.lineTotal) || 0; });
    let depreciation = 0;
    (depreciationSchedule || []).forEach((row) => {
      const codes = row.relatedLineItemCodes || [];
      if (codes.length && codes.every((c) => approvedCodes.has(c))) depreciation += Number(row.depreciationAmount) || 0;
    });
    const deductible = Number(deductibleAmount) || 0;
    return { rcv, deductible, depreciation, initialPayment: rcv - deductible - depreciation };
  }, [lineItems, depreciationSchedule, perItemDetermination, deductibleAmount]);

  const updateCoverageLimit = (i, field, value) =>
    setCoverageLimits((prev) => prev.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)));
  const removeCoverageLimit = (i) => setCoverageLimits((prev) => prev.filter((_, idx) => idx !== i));
  const updatePerItem = (i, field, value) =>
    setPerItemDetermination((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  const togglePerItemCode = (i, code) =>
    setPerItemDetermination((prev) =>
      prev.map((r, idx) => {
        if (idx !== i) return r;
        const has = (r.relatedLineItemCodes || []).includes(code);
        return { ...r, relatedLineItemCodes: has ? r.relatedLineItemCodes.filter((c) => c !== code) : [...(r.relatedLineItemCodes || []), code] };
      })
    );
  const removePerItem = (i) => setPerItemDetermination((prev) => prev.filter((_, idx) => idx !== i));
  const updateRight = (i, field, value) =>
    setRightsAndNextSteps((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  const removeRight = (i) => setRightsAndNextSteps((prev) => prev.filter((_, idx) => idx !== i));
  const updateEnclosure = (i, value) => setEnclosures((prev) => prev.map((e, idx) => (idx === i ? value : e)));
  const removeEnclosure = (i) => setEnclosures((prev) => prev.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!isRevise && !estimateId) {
      toast.error('Choose the approved Repair Estimate this letter is based on.');
      return;
    }
    if (isRevise && !changeSummary.trim()) {
      toast.error('A change summary is required when revising a coverage determination letter.');
      return;
    }
    if (!addresseeName.trim() || !addresseeAddress.trim()) {
      toast.error('Addressee name and address are required.');
      return;
    }
    if (!adjusterName.trim() || !adjusterTitle.trim()) {
      toast.error('Adjuster of record name and title are required.');
      return;
    }
    if (!determinationSummary.trim()) {
      toast.error('A determination summary (e.g. "Partial Approval") is required.');
      return;
    }
    if (!deductibleDescription.trim()) {
      toast.error('Deductible description is required.');
      return;
    }
    if (coverageLimits.some((c) => !c.coverageType.trim() || !c.description.trim())) {
      toast.error('Every coverage limit row needs a coverage type and description.');
      return;
    }
    if (perItemDetermination.some((r) => !r.item.trim() || !r.policyBasis.trim())) {
      toast.error('Every item needs a name and policy basis, entered by you -- never invented.');
      return;
    }
    if (perItemDetermination.some((r) => r.determination === 'approved' && !(r.relatedLineItemCodes || []).length)) {
      toast.error('Every "Approved" item must link at least one estimate line item code.');
      return;
    }
    if (perItemDetermination.some((r) => r.determination === 'pending' && !r.pendingNote.trim())) {
      toast.error('Every "Pending" item needs a note explaining what is outstanding.');
      return;
    }
    if (rightsAndNextSteps.some((r) => !r.heading.trim() || !r.text.trim())) {
      toast.error('Every rights & next steps entry needs a heading and text, entered by you.');
      return;
    }
    const payload = {
      estimateId: isRevise ? undefined : estimateId,
      addressee: { name: addresseeName.trim(), address: addresseeAddress.trim() },
      adjusterOfRecord: { name: adjusterName.trim(), title: adjusterTitle.trim(), phone: adjusterPhone.trim(), email: adjusterEmail.trim() },
      letterDate,
      determinationSummary: determinationSummary.trim(),
      deductible: { description: deductibleDescription.trim(), amount: Number(deductibleAmount) },
      coverageLimits: coverageLimits.map((c) => ({ coverageType: c.coverageType.trim(), description: c.description.trim(), limit: Number(c.limit) })),
      perItemDetermination: perItemDetermination.map((r) => ({
        item: r.item.trim(),
        determination: r.determination,
        policyBasis: r.policyBasis.trim(),
        relatedLineItemCodes: r.relatedLineItemCodes || [],
        pendingNote: (r.pendingNote || '').trim(),
      })),
      rightsAndNextSteps: rightsAndNextSteps.map((r) => ({ heading: r.heading.trim(), text: r.text.trim() })),
      enclosures: enclosures.map((e) => e.trim()).filter(Boolean),
      changeSummary: changeSummary.trim() || 'Initial coverage determination letter created',
    };
    setSaving(true);
    try {
      const res = isRevise
        ? await reportsAPI.reviseCoverageLetter(report.id, payload)
        : await reportsAPI.createCoverageLetter(report.id, payload);
      toast.success(isRevise ? 'Coverage determination letter revised' : 'Coverage determination letter created as a new draft');
      onSaved(res.data?.report);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save the coverage determination letter');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400';

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={() => !saving && onClose()}>
      <motion.div className="card w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6" role="dialog" aria-modal="true" aria-labelledby="coverage-letter-modal-title"
        initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 id="coverage-letter-modal-title" className="text-lg font-bold text-gray-900">
            {isRevise ? `Revise Coverage Determination Letter (Rev. ${(report.revision || 0) + 1})` : 'Generate Coverage Determination Letter'}
          </h2>
          <button onClick={onClose} disabled={saving} aria-label="Close" className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Every coverage decision, policy basis, and rights/next-steps entry below is entered by you, the licensed adjuster of record -- FlacronAI never drafts or suggests any of it. Payment figures are calculated automatically from items marked "Approved". Jurisdiction-specific wording has not been reviewed by legal/compliance counsel -- confirm that review before production use.
        </p>

        {!isRevise && (
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">Approved Repair Estimate this letter is based on *</label>
            {loadingEstimates ? (
              <p className="text-sm text-gray-400">Loading linked estimates…</p>
            ) : !linkedEstimates.length ? (
              <p className="text-sm text-amber-700">No finalized (approved) Repair Estimate is linked to this report yet. Create and approve one first.</p>
            ) : (
              <select value={estimateId} onChange={(e) => setEstimateId(e.target.value)} className={inputCls}>
                <option value="">Select an approved estimate…</option>
                {linkedEstimates.map((e) => (
                  <option key={e.id} value={e.id}>{e.estimateNumber || e.id} · Rev. {e.revision || 0} · {money(e.totals?.grandTotal)}</option>
                ))}
              </select>
            )}
          </div>
        )}

        <h3 className="text-sm font-bold text-gray-800 mb-2">Addressee</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
          <input value={addresseeName} onChange={(e) => setAddresseeName(e.target.value)} placeholder="Name" className={inputCls} />
          <input value={addresseeAddress} onChange={(e) => setAddresseeAddress(e.target.value)} placeholder="Address" className={inputCls} />
        </div>

        <h3 className="text-sm font-bold text-gray-800 mb-2">Letter Details</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Letter date</label>
            <input type="date" value={letterDate} onChange={(e) => setLetterDate(e.target.value)} className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Determination summary (e.g. "Partial Approval") *</label>
            <input value={determinationSummary} onChange={(e) => setDeterminationSummary(e.target.value)} className={inputCls} />
          </div>
        </div>

        <h3 className="text-sm font-bold text-gray-800 mb-2">Adjuster of Record</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <input value={adjusterName} onChange={(e) => setAdjusterName(e.target.value)} placeholder="Full name *" className={inputCls} />
          <input value={adjusterTitle} onChange={(e) => setAdjusterTitle(e.target.value)} placeholder="Title *" className={inputCls} />
          <input value={adjusterPhone} onChange={(e) => setAdjusterPhone(e.target.value)} placeholder="Phone" className={inputCls} />
          <input value={adjusterEmail} onChange={(e) => setAdjusterEmail(e.target.value)} placeholder="Email" className={inputCls} />
        </div>

        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-gray-800">Applicable Policy Coverages</h3>
          <button onClick={() => setCoverageLimits((prev) => [...prev, emptyCoverageLimit()])} className="btn-secondary text-xs py-1 px-2">+ Add Coverage</button>
        </div>
        <div className="overflow-x-auto mb-2">
          <table className="w-full text-xs">
            <tbody>
              {coverageLimits.map((c, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="p-1 w-32"><input value={c.coverageType} onChange={(e) => updateCoverageLimit(i, 'coverageType', e.target.value)} placeholder="Coverage type" className={inputCls} /></td>
                  <td className="p-1"><input value={c.description} onChange={(e) => updateCoverageLimit(i, 'description', e.target.value)} placeholder="Description" className={inputCls} /></td>
                  <td className="p-1 w-28"><input type="number" min="0" step="any" value={c.limit} onChange={(e) => updateCoverageLimit(i, 'limit', e.target.value)} className={inputCls} /></td>
                  <td className="p-1 w-8">{coverageLimits.length > 1 && (<button onClick={() => removeCoverageLimit(i)} aria-label="Remove coverage limit" className="text-gray-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
          <input value={deductibleDescription} onChange={(e) => setDeductibleDescription(e.target.value)} placeholder="Deductible description *" className={inputCls} />
          <input type="number" min="0" step="any" value={deductibleAmount} onChange={(e) => setDeductibleAmount(e.target.value)} placeholder="Deductible amount" className={inputCls} />
        </div>

        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-gray-800">Item-by-Item Coverage Rationale</h3>
          <button onClick={() => setPerItemDetermination((prev) => [...prev, emptyPerItem()])} className="btn-secondary text-xs py-1 px-2">+ Add Item</button>
        </div>
        {perItemDetermination.map((r, i) => (
          <div key={i} className="border border-gray-200 rounded-lg p-3 mb-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
              <input value={r.item} onChange={(e) => updatePerItem(i, 'item', e.target.value)} placeholder="Item (e.g. Roof covering)" className={inputCls} />
              <select value={r.determination} onChange={(e) => updatePerItem(i, 'determination', e.target.value)} className={inputCls}>
                <option value="approved">Approved</option>
                <option value="denied">Denied</option>
                <option value="pending">Pending</option>
              </select>
              <input value={r.policyBasis} onChange={(e) => updatePerItem(i, 'policyBasis', e.target.value)} placeholder="Policy basis *" className={inputCls} />
            </div>
            {r.determination === 'pending' && (
              <input value={r.pendingNote} onChange={(e) => updatePerItem(i, 'pendingNote', e.target.value)} placeholder="What is outstanding, and why (required)" className={`${inputCls} mb-2`} />
            )}
            {r.determination === 'approved' && (
              <>
                <p className="text-xs text-gray-500 mb-1">Linked estimate line items (feeds Approved RCV):</p>
                <div className="flex flex-wrap gap-1.5 mb-1">
                  {validCodes.length ? validCodes.map((code) => (
                    <button key={code} type="button" onClick={() => togglePerItemCode(i, code)}
                      className={`text-xs px-2 py-0.5 rounded-full border ${(r.relatedLineItemCodes || []).includes(code) ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-600 border-gray-300'}`}>
                      {code}
                    </button>
                  )) : <span className="text-xs text-gray-400">Select an approved estimate above first</span>}
                </div>
              </>
            )}
            {perItemDetermination.length > 1 && (
              <button onClick={() => removePerItem(i)} className="text-xs text-red-500 hover:underline">Remove item</button>
            )}
          </div>
        ))}

        <div className="card p-3 mb-5 bg-gray-50 border border-gray-200 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Approved RCV</span><span className="font-medium">{money(preview.rcv)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Deductible</span><span className="font-medium">({money(preview.deductible)})</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Recoverable Depreciation (withheld)</span><span className="font-medium">({money(preview.depreciation)})</span></div>
          <div className="flex justify-between border-t border-gray-200 mt-1 pt-1"><span className="font-bold text-gray-800">Initial Payment (ACV)</span><span className="font-bold text-brand-600">{money(preview.initialPayment)}</span></div>
          <p className="text-[10px] text-gray-400 mt-1">Preview only -- the server recomputes and stores the authoritative totals from items marked "Approved".</p>
        </div>

        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-gray-800">Your Rights & Next Steps</h3>
          <button onClick={() => setRightsAndNextSteps((prev) => [...prev, emptyRight()])} className="btn-secondary text-xs py-1 px-2">+ Add Entry</button>
        </div>
        {rightsAndNextSteps.map((r, i) => (
          <div key={i} className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
            <input value={r.heading} onChange={(e) => updateRight(i, 'heading', e.target.value)} placeholder="Heading (e.g. Request review)" className={inputCls} />
            <textarea value={r.text} onChange={(e) => updateRight(i, 'text', e.target.value)} rows={1} placeholder="Text, in your own words *" className={`${inputCls} sm:col-span-1`} />
            <div className="flex items-center">
              {rightsAndNextSteps.length > 1 && (<button onClick={() => removeRight(i)} className="text-xs text-red-500 hover:underline">Remove</button>)}
            </div>
          </div>
        ))}

        <div className="flex items-center justify-between mb-2 mt-2">
          <h3 className="text-sm font-bold text-gray-800">Enclosures (optional)</h3>
          <button onClick={() => setEnclosures((prev) => [...prev, ''])} className="btn-secondary text-xs py-1 px-2">+ Add Enclosure</button>
        </div>
        {enclosures.map((e, i) => (
          <div key={i} className="flex items-center gap-2 mb-2">
            <input value={e} onChange={(ev) => updateEnclosure(i, ev.target.value)} placeholder="e.g. Repair Estimate, EST-2024-118-01, Revision 2" className={inputCls} />
            <button onClick={() => removeEnclosure(i)} aria-label="Remove enclosure" className="text-gray-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
          </div>
        ))}

        {isRevise && (
          <div className="mt-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">Change summary *</label>
            <textarea value={changeSummary} onChange={(e) => setChangeSummary(e.target.value)} rows={2} placeholder="e.g. Approved HVAC condenser after technician evaluation; released depreciation"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400" />
          </div>
        )}

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} disabled={saving} className="btn-secondary flex-1 text-sm py-2 disabled:opacity-50">Cancel</button>
          <button onClick={submit} disabled={saving} className="btn-primary flex-1 text-sm py-2 flex items-center justify-center gap-2 disabled:opacity-50">
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Scale className="w-4 h-4" />}
            {saving ? 'Saving…' : isRevise ? 'Save Revision' : 'Create Letter'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Phase 19: owner assigns an in-organization reviewer (supervisor review
// request). Deliberately lists only the caller's own team roster, never any
// other organization's -- reusing the same endpoint EnterpriseDashboard.jsx
// already uses for team management.
function RequestReviewModal({ report, currentUid, onClose, onRequested }) {
  useEscapeToClose(onClose, true, true);
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [reviewerUid, setReviewerUid] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    teamsAPI.getMembers()
      .then((res) => setMembers(
        (res.data?.members || [])
          // Only members who have actually accepted (a real Firebase uid to
          // grant access to) and aren't suspended can be assigned a review.
          .filter((m) => m.userId && m.userId !== currentUid && m.status !== 'suspended')
      ))
      .catch(() => setMembers([]))
      .finally(() => setLoadingMembers(false));
  }, [currentUid]);

  const submit = async () => {
    if (!reviewerUid) { toast.error('Choose a reviewer'); return; }
    setSubmitting(true);
    try {
      const res = await reportsAPI.requestReview(report.id, { reviewerUid, notes: notes.trim() });
      toast.success('Review requested');
      onRequested(res.data?.reviewRequest);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not request review');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={() => !submitting && onClose()}>
      <motion.div className="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-labelledby="request-review-title"
        initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 id="request-review-title" className="text-lg font-bold text-gray-900">Request Review</h2>
          <button onClick={onClose} disabled={submitting} aria-label="Close" className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">Assign a reviewer from your organization. They'll be able to comment, edit, and approve or return this report -- without seeing any of your other reports.</p>
        {loadingMembers ? (
          <p className="text-sm text-gray-400 py-3">Loading team…</p>
        ) : !members.length ? (
          <p className="text-sm text-gray-500 py-3">No other active team members found. Add a team member first, or use Invite User to share with an external reviewer instead.</p>
        ) : (
          <select value={reviewerUid} onChange={(e) => setReviewerUid(e.target.value)}
            className="w-full mb-3 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400">
            <option value="">Select a reviewer…</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>{m.email} ({m.role})</option>
            ))}
          </select>
        )}
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional note for the reviewer…"
          className="w-full mb-4 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400" />
        <div className="flex gap-3">
          <button onClick={onClose} disabled={submitting} className="btn-secondary flex-1 text-sm py-2 disabled:opacity-50">Cancel</button>
          <button onClick={submit} disabled={submitting || !members.length} className="btn-primary flex-1 text-sm py-2 flex items-center justify-center gap-2 disabled:opacity-50">
            {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
            {submitting ? 'Sending…' : 'Send Request'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Phase 19: the ASSIGNED reviewer declining or asking for changes. Approving
// reuses the existing ApproveModal/POST /:id/approve flow directly (a
// 'review'-tier grantee is now authorized there too) -- this only covers
// the two outcomes that have no existing analog.
function ReviewResponseModal({ decision, onClose, onSubmit }) {
  useEscapeToClose(onClose, true, true);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const isReject = decision === 'rejected';

  const submit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(notes.trim());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={() => !submitting && onClose()}>
      <motion.div className="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-labelledby="review-response-title"
        initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 id="review-response-title" className="text-lg font-bold text-gray-900">{isReject ? 'Decline Review' : 'Return for Changes'}</h2>
          <button onClick={onClose} disabled={submitting} aria-label="Close" className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          {isReject ? 'The report stays a draft and the owner is notified you declined.' : 'The report goes back to the owner as a draft with your notes.'}
        </p>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Notes for the owner…"
          className="w-full mb-4 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400" />
        <div className="flex gap-3">
          <button onClick={onClose} disabled={submitting} className="btn-secondary flex-1 text-sm py-2 disabled:opacity-50">Cancel</button>
          <button onClick={submit} disabled={submitting} className="btn-primary flex-1 text-sm py-2 flex items-center justify-center gap-2 disabled:opacity-50">
            {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : isReject ? <XCircle className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
            {submitting ? 'Sending…' : isReject ? 'Decline' : 'Send Back'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Phase 11 (Report Preview, Export Options & Document Layout Completion): a
// real, bookmarkable, directly-linkable report page -- ahead of the broader
// Phase 30 routing migration, added here specifically because the spec calls
// for a dedicated /reports/:id/preview URL with its own Desktop/PDF toggle,
// distinct from Dashboard.jsx's activeView='generate' editor. It fetches by
// ID independently (no dependency on Dashboard's in-memory state), so a
// direct visit or a refresh both work the same way.
export default function ReportPreviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { tier, user } = useAuth();

  const [report, setReport] = useState(null);
  // Phase 19: what the CURRENT viewer may do on this specific report --
  // 'owner' | 'view' | 'comment' | 'review'. Drives every share/comment/
  // review-request affordance below; never assumed, always as returned by
  // GET /:id (server-authoritative, see backend/utils/reportAccess.js).
  const [myAccess, setMyAccess] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('desktop');
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showRequestReviewModal, setShowRequestReviewModal] = useState(false);
  const [reviewResponseDecision, setReviewResponseDecision] = useState(null);
  const [showMoldSupplementModal, setShowMoldSupplementModal] = useState(false);
  const [showEstimateModal, setShowEstimateModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showCoverageLetterModal, setShowCoverageLetterModal] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    reportsAPI.getOne(id)
      .then((res) => {
        setReport(res.data?.report || res.data);
        // Default to the least-privileged tier if the field is somehow
        // absent -- never assume full access.
        setMyAccess(res.data?.myAccess || 'view');
      })
      .catch((err) => setError(err?.response?.status === 404 ? 'not_found' : 'error'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    return () => { if (pdfUrl) window.URL.revokeObjectURL(pdfUrl); };
  }, [pdfUrl]);

  const loadPdfPreview = useCallback(async () => {
    if (!report) return;
    setPdfLoading(true);
    setPdfError(false);
    try {
      const exportRes = await reportsAPI.export(report.id, { format: 'pdf' });
      const { filename } = exportRes.data;
      const fileRes = await api.get(`/reports/${report.id}/download?file=${filename}&inline=true`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([fileRes.data], { type: 'application/pdf' }));
      setPdfUrl((prev) => { if (prev) window.URL.revokeObjectURL(prev); return url; });
    } catch {
      setPdfError(true);
    } finally {
      setPdfLoading(false);
    }
  }, [report]);

  const switchMode = (next) => {
    setMode(next);
    if (next === 'pdf' && !pdfUrl && !pdfLoading) loadPdfPreview();
  };

  // Must run unconditionally (before the loading/error early returns below)
  // to satisfy the Rules of Hooks -- guards internally instead.
  const sections = useMemo(() => (report ? parseReportSections(report.content) : []), [report]);

  const handleExport = async (format, options = {}) => {
    try {
      const exportRes = await reportsAPI.export(report.id, { format, ...options });
      const { filename } = exportRes.data;
      const fileRes = await api.get(`/reports/${report.id}/download?file=${filename}`, { responseType: 'blob' });
      const mimeTypes = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', html: 'text/html' };
      const url = window.URL.createObjectURL(new Blob([fileRes.data], { type: mimeTypes[format] || 'application/octet-stream' }));
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      window.URL.revokeObjectURL(url);
      toast.success(`Exported as ${format.toUpperCase()}`);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Export failed');
      throw err;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg">
        <Navbar />
        <div className="flex flex-col items-center justify-center py-32 gap-3">
          <RefreshCw className="w-8 h-8 text-brand-500 animate-spin" />
          <p className="text-sm text-gray-500">Loading report…</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-bg">
        <Navbar />
        <div className="flex flex-col items-center justify-center py-32 gap-4 text-center px-4">
          <AlertCircle className="w-10 h-10 text-amber-500" />
          <div>
            <p className="text-gray-900 font-semibold">
              {error === 'not_found' ? 'Report not found' : "We couldn't load this report"}
            </p>
            <p className="text-gray-500 text-sm mt-1">
              {error === 'not_found' ? "It may have been deleted, or you don't have access to it." : 'Check your connection and try again.'}
            </p>
          </div>
          <div className="flex gap-2">
            {error !== 'not_found' && (
              <button onClick={load} className="btn-secondary text-sm py-2 px-4 flex items-center gap-2">
                <RefreshCw className="w-4 h-4" /> Retry
              </button>
            )}
            <Link to="/dashboard" className="btn-primary text-sm py-2 px-4 flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" /> Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const processing = report.status === 'processing';
  const regenerating = !!report.regenerating;
  const reviewed = REVIEWED_STATUSES.includes(report.status);
  const canActOn = !processing && !regenerating;
  const allowedExports = TIER_EXPORTS[tier] || ['pdf'];

  // Phase 19: derived per-viewer capability. An owner always has full
  // access; a grantee's capability comes ENTIRELY from myAccess (never their
  // own account role/tier -- see backend/utils/reportAccess.js).
  const isOwner = myAccess === 'owner';
  const canEdit = isOwner || myAccess === 'review';
  const canApprove = isOwner || myAccess === 'review';
  const canExportReport = isOwner || myAccess === 'review';
  const canShowComments = myAccess === 'owner' || myAccess === 'comment' || myAccess === 'review';
  const reviewRequest = report.reviewRequest;
  const isAssignedReviewerPending =
    !isOwner && reviewRequest?.status === 'pending' && reviewRequest?.reviewerUid === user?.uid;
  const isReviewPendingForOwner = isOwner && reviewRequest?.status === 'pending';

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/dashboard" aria-label="Back to Dashboard" className="p-2 hover:bg-gray-100 rounded-lg transition-colors shrink-0">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 truncate">Claim {report.claimNumber || '—'}</h1>
              <p className="text-xs text-gray-500 truncate">{report.insuredName} · {report.propertyAddress}</p>
              {report.documentType === 'MoldSupplement' && (
                <p className="text-xs text-amber-700 flex items-center gap-1 mt-0.5">
                  <FileWarning className="w-3.5 h-3.5 shrink-0" />
                  Mold Assessment Supplement — related claim {report.relatedClaimId || '—'}
                  {report.relatedReportId && (
                    <Link to={`/reports/${report.relatedReportId}/preview`} className="inline-flex items-center gap-0.5 text-navy-700 hover:underline ml-1">
                      <Link2 className="w-3 h-3" /> View linked report
                    </Link>
                  )}
                </p>
              )}
              {report.documentType === 'RepairEstimate' && (
                <p className="text-xs text-navy-700 flex items-center gap-1 mt-0.5">
                  <FileText className="w-3.5 h-3.5 shrink-0" />
                  Repair Estimate {report.estimateNumber || ''} · Rev. {report.revision || 0} · Total {money(report.totals?.grandTotal)}
                  {report.relatedReportId && (
                    <Link to={`/reports/${report.relatedReportId}/preview`} className="inline-flex items-center gap-0.5 text-navy-700 hover:underline ml-1">
                      <Link2 className="w-3 h-3" /> View linked report
                    </Link>
                  )}
                </p>
              )}
              {report.documentType === 'Invoice' && (
                <p className="text-xs text-navy-700 flex items-center gap-1 mt-0.5">
                  <FileText className="w-3.5 h-3.5 shrink-0" />
                  Invoice {report.invoiceNumber || ''} · Rev. {report.revision || 0} · Total Due {money(report.totals?.balanceDue)}
                  {report.relatedReportId && (
                    <Link to={`/reports/${report.relatedReportId}/preview`} className="inline-flex items-center gap-0.5 text-navy-700 hover:underline ml-1">
                      <Link2 className="w-3 h-3" /> View linked estimate
                    </Link>
                  )}
                </p>
              )}
              {report.documentType === 'CoverageDeterminationLetter' && (
                <p className="text-xs text-navy-700 flex items-center gap-1 mt-0.5">
                  <Scale className="w-3.5 h-3.5 shrink-0" />
                  Coverage Determination Letter · Rev. {report.revision || 0} · Initial Payment (ACV) {money(report.totals?.initialPayment)}
                  {report.relatedReportId && (
                    <Link to={`/reports/${report.relatedReportId}/preview`} className="inline-flex items-center gap-0.5 text-navy-700 hover:underline ml-1">
                      <Link2 className="w-3 h-3" /> View linked report
                    </Link>
                  )}
                  {report.relatedEstimateId && (
                    <Link to={`/reports/${report.relatedEstimateId}/preview`} className="inline-flex items-center gap-0.5 text-navy-700 hover:underline ml-1">
                      <Link2 className="w-3 h-3" /> View linked estimate
                    </Link>
                  )}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isOwner && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-navy-500/10 text-navy-700 border border-navy-500/30 capitalize">
                {myAccess} access
              </span>
            )}
            {reviewed ? (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-500/10 text-green-700 border border-green-500/30 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Finalized
              </span>
            ) : processing ? (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-brand-500/10 text-brand-700 border border-brand-500/30">Analyzing…</span>
            ) : reviewRequest?.status === 'pending' ? (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-navy-500/10 text-navy-700 border border-navy-500/30 flex items-center gap-1">
                <UserCheck className="w-3.5 h-3.5" /> In Review
              </span>
            ) : (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-700 border border-amber-500/30">Draft — pending review</span>
            )}
          </div>
        </div>

        {processing && (
          <div className="card p-6 mb-5 flex items-center gap-3 border border-brand-200 bg-brand-50/40">
            <RefreshCw className="w-5 h-5 text-brand-600 animate-spin shrink-0" />
            <div>
              <p className="text-sm font-semibold text-gray-800">This report is still being analyzed</p>
              <p className="text-xs text-gray-500 mt-0.5">Preview, editing, approval, and export unlock once the FLACRON ENGINE finishes.</p>
            </div>
          </div>
        )}

        {isReviewPendingForOwner && (
          <div className="card p-4 mb-5 flex items-center gap-3 border border-navy-200 bg-navy-50/40">
            <UserCheck className="w-5 h-5 text-navy-600 shrink-0" />
            <p className="text-sm text-gray-700">Awaiting review from <span className="font-semibold">{reviewRequest.reviewerEmail}</span>.</p>
          </div>
        )}

        {isAssignedReviewerPending && (
          <div className="card p-4 mb-5 border border-navy-200 bg-navy-50/40">
            <div className="flex items-center gap-3 mb-3">
              <UserCheck className="w-5 h-5 text-navy-600 shrink-0" />
              <p className="text-sm text-gray-700">You've been asked to review this report{reviewRequest.notes ? `: "${reviewRequest.notes}"` : '.'}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setShowApproveModal(true)} className="btn-primary text-sm py-2 px-3 flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4" /> Approve
              </button>
              <button onClick={() => setReviewResponseDecision('changes_requested')} className="btn-secondary text-sm py-2 px-3 flex items-center gap-1.5">
                <RotateCcw className="w-4 h-4" /> Return for Changes
              </button>
              <button onClick={() => setReviewResponseDecision('rejected')} className="text-sm py-2 px-3 flex items-center gap-1.5 rounded-btn border border-gray-200 text-gray-500 hover:bg-gray-50">
                <XCircle className="w-4 h-4" /> Decline
              </button>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="inline-flex rounded-xl border border-gray-200 p-1 bg-bg">
            <button onClick={() => switchMode('desktop')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors ${mode === 'desktop' ? 'bg-brand-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              <Monitor className="w-4 h-4" /> Desktop
            </button>
            <button onClick={() => switchMode('pdf')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors ${mode === 'pdf' ? 'bg-brand-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              <FileText className="w-4 h-4" /> PDF
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {isOwner && (
              <button onClick={() => setShowShareModal(true)} className="btn-secondary text-sm py-2 px-3 flex items-center gap-1.5">
                <Share2 className="w-4 h-4" /> Share
              </button>
            )}
            {isOwner && !reviewed && !isReviewPendingForOwner && (
              <button onClick={() => setShowRequestReviewModal(true)} className="btn-secondary text-sm py-2 px-3 flex items-center gap-1.5">
                <UserCheck className="w-4 h-4" /> Request Review
              </button>
            )}
            {canEdit && (
              <button onClick={() => navigate(`/dashboard?openReport=${report.id}`)}
                className="btn-secondary text-sm py-2 px-3 flex items-center gap-1.5">
                <Pencil className="w-4 h-4" /> Edit
              </button>
            )}
            {/* Phase 36: only offered on an already-generated, non-supplement
                report -- a supplement is not itself the "existing report" a
                further supplement would attach to. Phase 38 excludes Invoice
                too, since an Invoice is itself a derivative document. */}
            {isOwner && canActOn && report.documentType !== 'MoldSupplement' && report.documentType !== 'RepairEstimate' && report.documentType !== 'Invoice' && report.documentType !== 'CoverageDeterminationLetter' && (
              <button onClick={() => setShowMoldSupplementModal(true)} className="btn-secondary text-sm py-2 px-3 flex items-center gap-1.5">
                <FileWarning className="w-4 h-4" /> Mold Supplement
              </button>
            )}
            {/* Phase 37: offered on any existing non-estimate report (spawns a
                new linked Repair Estimate), or as "Revise Estimate" when this
                report IS one (edits it in place, appending a revision). */}
            {isOwner && canActOn && report.documentType !== 'MoldSupplement' && report.documentType !== 'RepairEstimate' && report.documentType !== 'Invoice' && report.documentType !== 'CoverageDeterminationLetter' && (
              <button onClick={() => setShowEstimateModal(true)} className="btn-secondary text-sm py-2 px-3 flex items-center gap-1.5">
                <FileText className="w-4 h-4" /> Repair Estimate
              </button>
            )}
            {canEdit && canActOn && report.documentType === 'RepairEstimate' && (
              <button onClick={() => setShowEstimateModal(true)} className="btn-secondary text-sm py-2 px-3 flex items-center gap-1.5">
                <FileText className="w-4 h-4" /> Revise Estimate
              </button>
            )}
            {/* Phase 38: an Invoice can only be generated from an existing
                Repair Estimate (reuses its line items/totals), or revised in
                place when this report IS an Invoice. */}
            {isOwner && canActOn && report.documentType === 'RepairEstimate' && (
              <button onClick={() => setShowInvoiceModal(true)} className="btn-secondary text-sm py-2 px-3 flex items-center gap-1.5">
                <FileText className="w-4 h-4" /> Invoice
              </button>
            )}
            {canEdit && canActOn && report.documentType === 'Invoice' && (
              <button onClick={() => setShowInvoiceModal(true)} className="btn-secondary text-sm py-2 px-3 flex items-center gap-1.5">
                <FileText className="w-4 h-4" /> Revise Invoice
              </button>
            )}
            {/* Phase 39: a Coverage Determination Letter can only be generated
                from an already-FINALIZED base report (never MoldSupplement/
                RepairEstimate/Invoice/another letter -- those aren't "the
                report" this letter determines coverage for), and requires
                picking an approved Repair Estimate inside the modal itself.
                Server re-enforces both checks regardless of what's shown here. */}
            {isOwner && canActOn && reviewed && report.documentType !== 'MoldSupplement' && report.documentType !== 'RepairEstimate' && report.documentType !== 'Invoice' && report.documentType !== 'CoverageDeterminationLetter' && (
              <button onClick={() => setShowCoverageLetterModal(true)} className="btn-secondary text-sm py-2 px-3 flex items-center gap-1.5">
                <Scale className="w-4 h-4" /> Coverage Determination Letter
              </button>
            )}
            {canEdit && canActOn && report.documentType === 'CoverageDeterminationLetter' && (
              <button onClick={() => setShowCoverageLetterModal(true)} className="btn-secondary text-sm py-2 px-3 flex items-center gap-1.5">
                <Scale className="w-4 h-4" /> Revise Coverage Letter
              </button>
            )}
            {!canApprove ? null : reviewed ? null : canActOn ? (
              <button onClick={() => setShowApproveModal(true)} className="btn-primary text-sm py-2 px-3 flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4" /> Approve
              </button>
            ) : (
              <button disabled title="Unavailable while the report is processing" className="text-sm py-2 px-3 flex items-center gap-1.5 rounded-btn border border-dashed border-gray-200 text-gray-400 cursor-not-allowed">
                <Lock className="w-3.5 h-3.5" /> Approve
              </button>
            )}
            {!canExportReport ? null : canActOn ? (
              <button onClick={() => setShowExportModal(true)} className="btn-secondary text-sm py-2 px-3 flex items-center gap-1.5">
                <Download className="w-4 h-4" /> Export
              </button>
            ) : (
              <button disabled title="Unavailable while the report is processing" className="text-sm py-2 px-3 flex items-center gap-1.5 rounded-btn border border-dashed border-gray-200 text-gray-400 cursor-not-allowed">
                <Lock className="w-3.5 h-3.5" /> Export
              </button>
            )}
          </div>
        </div>

        {/* Preview body */}
        <div className="card p-4 sm:p-6">
          {mode === 'desktop' ? (
            report.content ? (
              <ReportMarkdown content={report.content} />
            ) : (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                <FileText className="w-10 h-10 text-gray-300" />
                <p className="text-sm text-gray-400">No report content yet.</p>
              </div>
            )
          ) : (
            <>
              {pdfLoading && (
                <div className="flex flex-col items-center justify-center py-20 gap-3 bg-gray-50 rounded-xl border border-gray-200">
                  <RefreshCw className="w-8 h-8 text-brand-500 animate-spin" />
                  <p className="text-sm text-gray-500 font-medium">Rendering PDF…</p>
                </div>
              )}
              {!pdfLoading && pdfUrl && (
                <iframe src={pdfUrl} title="PDF Preview" className="w-full rounded-xl border border-gray-200" style={{ height: '80vh' }} />
              )}
              {!pdfLoading && !pdfUrl && (
                <div className="flex flex-col items-center justify-center py-20 gap-3 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                  <FileText className="w-10 h-10 text-gray-300" />
                  <p className="text-sm text-gray-400">{pdfError ? 'PDF preview failed to load.' : 'PDF preview not loaded yet.'}</p>
                  <button onClick={loadPdfPreview} className="btn-primary text-sm py-2 px-4 flex items-center gap-2">
                    <RefreshCw className="w-4 h-4" /> {pdfError ? 'Retry' : 'Load PDF Preview'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {canShowComments && (
          <div className="mt-5">
            <CommentsPanel
              sections={sections}
              fetchComments={() => reportsAPI.getComments(report.id)}
              onAdd={(payload) => reportsAPI.addComment(report.id, payload)}
              onResolve={(commentId) => reportsAPI.resolveComment(report.id, commentId)}
              onReopen={(commentId) => reportsAPI.reopenComment(report.id, commentId)}
              myPermission={myAccess}
            />
          </div>
        )}
      </div>

      <AnimatePresence>
        {showExportModal && (
          <ExportOptionsModal report={report} allowedExports={allowedExports} onExport={handleExport} onClose={() => setShowExportModal(false)} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showApproveModal && (
          <ApproveModal
            report={report}
            onClose={() => setShowApproveModal(false)}
            onApproved={(updates) => {
              setReport((prev) => ({ ...prev, ...updates, status: 'finalized' }));
              setShowApproveModal(false);
              setPdfUrl((prev) => { if (prev) window.URL.revokeObjectURL(prev); return null; });
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showMoldSupplementModal && (
          <MoldSupplementModal
            report={report}
            onClose={() => setShowMoldSupplementModal(false)}
            onGenerated={(newReport) => {
              setShowMoldSupplementModal(false);
              if (newReport?.id) navigate(`/reports/${newReport.id}/preview`);
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showEstimateModal && (
          <RepairEstimateModal
            report={report}
            mode={report.documentType === 'RepairEstimate' ? 'revise' : 'create'}
            onClose={() => setShowEstimateModal(false)}
            onSaved={(savedReport) => {
              setShowEstimateModal(false);
              if (report.documentType === 'RepairEstimate' && savedReport) {
                setReport((prev) => ({ ...prev, ...savedReport }));
                setPdfUrl((prev) => { if (prev) window.URL.revokeObjectURL(prev); return null; });
              } else if (savedReport?.id) {
                navigate(`/reports/${savedReport.id}/preview`);
              }
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showInvoiceModal && (
          <InvoiceModal
            report={report}
            mode={report.documentType === 'Invoice' ? 'revise' : 'create'}
            onClose={() => setShowInvoiceModal(false)}
            onSaved={(savedReport) => {
              setShowInvoiceModal(false);
              if (report.documentType === 'Invoice' && savedReport) {
                setReport((prev) => ({ ...prev, ...savedReport }));
                setPdfUrl((prev) => { if (prev) window.URL.revokeObjectURL(prev); return null; });
              } else if (savedReport?.id) {
                navigate(`/reports/${savedReport.id}/preview`);
              }
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showCoverageLetterModal && (
          <CoverageLetterModal
            report={report}
            mode={report.documentType === 'CoverageDeterminationLetter' ? 'revise' : 'create'}
            onClose={() => setShowCoverageLetterModal(false)}
            onSaved={(savedReport) => {
              setShowCoverageLetterModal(false);
              if (report.documentType === 'CoverageDeterminationLetter' && savedReport) {
                setReport((prev) => ({ ...prev, ...savedReport }));
                setPdfUrl((prev) => { if (prev) window.URL.revokeObjectURL(prev); return null; });
              } else if (savedReport?.id) {
                navigate(`/reports/${savedReport.id}/preview`);
              }
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showShareModal && (
          <ShareReportModal
            report={report}
            onClose={() => setShowShareModal(false)}
            onReportUpdate={(updates) => setReport((prev) => ({ ...prev, ...updates }))}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showRequestReviewModal && (
          <RequestReviewModal
            report={report}
            currentUid={user?.uid}
            onClose={() => setShowRequestReviewModal(false)}
            onRequested={(reviewRequestResult) => {
              setReport((prev) => ({ ...prev, reviewRequest: reviewRequestResult }));
              setShowRequestReviewModal(false);
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {reviewResponseDecision && (
          <ReviewResponseModal
            decision={reviewResponseDecision}
            onClose={() => setReviewResponseDecision(null)}
            onSubmit={async (notes) => {
              try {
                const res = await reportsAPI.reviewResponse(report.id, { decision: reviewResponseDecision, notes });
                toast.success(reviewResponseDecision === 'rejected' ? 'Review declined' : 'Sent back for changes');
                setReport((prev) => ({ ...prev, reviewRequest: res.data?.reviewRequest, status: 'draft' }));
                setReviewResponseDecision(null);
              } catch (err) {
                toast.error(err?.response?.data?.error || 'Could not submit response');
              }
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
