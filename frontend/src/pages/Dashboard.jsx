import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  FileText, Upload, ChevronRight, ChevronLeft, X, Download, RefreshCw,
  Search, Trash2, Eye, Lock, ExternalLink, BarChart3, Users,
  Zap, Clock, AlertCircle, CheckCircle, Settings,
  Star, Image as ImageIcon, CreditCard, Check, Save, ShieldCheck,
  Menu, PanelLeftClose, Droplets, Flame, Wind, Hammer
} from 'lucide-react';
import Navbar from '../components/Navbar';
import ReportMarkdown from '../components/ReportMarkdown';
import TierBadge from '../components/TierBadge';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatStatus } from '../utils/formatStatus';
import { useAuth } from '../context/AuthContext';
import { reportsAPI, paymentAPI } from '../services/api';
import api from '../services/api';

const LOSS_TYPES = ['Water Damage', 'Fire', 'Wind', 'Hail', 'Mold', 'Vandalism', 'Other'];
const REPORT_TYPES = ['Initial', 'Supplemental', 'Final', 'Re-Inspection'];
const STATUSES = ['All', 'draft', 'finalized', 'processing', 'failed', 'archived'];

const GENERATION_STEPS = [
  'Uploading photos...',
  'Analyzing damage photos with AI...',
  'Generating report with FlacronAI...',
  'Finalizing...',
];

const FORM_INITIAL = {
  claimNumber: '', insuredName: '', propertyAddress: '', lossDate: '',
  lossType: 'Water Damage', reportType: 'Initial', additionalNotes: '',
  propertyDetails: '', lossDescription: '', damagesObserved: '', recommendations: '',
};

const QUICK_DEMOS = [
  {
    label: 'Water Damage',
    icon: Droplets,
    color: 'blue',
    data: {
      claimNumber: 'CLM-2024-WD-001',
      insuredName: 'John & Mary Smith',
      propertyAddress: '1425 Maple Street, Austin, TX 78701',
      lossDate: '2024-01-15',
      lossType: 'Water Damage',
      reportType: 'Initial',
      propertyDetails: '2-story single-family home, built in 1998, approximately 2,200 sq ft. Brick veneer exterior, wood frame construction. Features 3 bedrooms, 2.5 bathrooms. Recently renovated kitchen (2021). Attached 2-car garage.',
      lossDescription: 'Upstairs master bathroom supply line to toilet failed catastrophically overnight. Water flowed for an estimated 6–8 hours before discovered by homeowner in the morning. Water migrated through floor/ceiling assembly into the kitchen directly below and into the adjacent hallway.',
      damagesObserved: 'Master Bathroom: Saturated subfloor, buckled tile, damaged vanity base cabinet. Kitchen Ceiling: Complete collapse of 40 sq ft drywall section, water-stained remaining drywall. Kitchen Cabinets: Upper and lower cabinet faces warped. Hallway: Hardwood flooring cupped and warped approximately 85 sq ft. Garage Ceiling: Water staining visible on 20 sq ft of drywall.',
      recommendations: 'Immediate water extraction and drying required. Deploy industrial dehumidifiers and air movers for minimum 3-day drying period. Remove and replace all saturated drywall, subfloor, and flooring materials. Test for mold growth in wall cavities before closure. Replace failed supply line and inspect all other supply lines for similar wear.',
      additionalNotes: 'Homeowner has temporary housing covered under ALE. Mold assessment recommended given extended water exposure duration.',
    },
  },
  {
    label: 'Fire Damage',
    icon: Flame,
    color: 'red',
    data: {
      claimNumber: 'CLM-2024-FD-042',
      insuredName: 'Robert & Lisa Chen',
      propertyAddress: '892 Oakwood Drive, Dallas, TX 75201',
      lossDate: '2024-02-03',
      lossType: 'Fire',
      reportType: 'Initial',
      propertyDetails: 'Single-story ranch-style home, built in 1985, approximately 1,850 sq ft. Brick exterior, wood frame. 3 bedrooms, 2 bathrooms. Original kitchen appliances. Asphalt shingle roof approximately 12 years old.',
      lossDescription: 'Fire originated in the kitchen due to unattended cooking on the stovetop. Fire spread to adjacent cabinetry and ceiling before being extinguished by local fire department. Significant smoke and soot damage throughout the home. Fire department responded within 8 minutes. Water used in suppression caused additional damage.',
      damagesObserved: 'Kitchen: Total loss — all cabinetry, appliances, ceiling, and walls. Dining Room: Heavy smoke/soot on all surfaces, ceiling damaged. Living Room: Moderate smoke damage, ceiling soot. Master Bedroom: Light smoke odor, soot on surfaces. HVAC System: Smoke infiltrated ductwork throughout home. Exterior Soffit: Charring on approx 15 linear feet adjacent to kitchen vent.',
      recommendations: 'Full contents pack-out recommended. HVAC system cleaning and inspection required. Structural assessment of kitchen ceiling joists before reconstruction. Soot and smoke remediation for all affected rooms. Kitchen requires complete gut and rebuild. Odor treatment with ozone or hydroxyl generator for entire structure.',
      additionalNotes: 'Fire marshal report obtained. Cause determined accidental. Family displaced — ALE applicable. Smoke damage to contents throughout home.',
    },
  },
  {
    label: 'Wind / Hail',
    icon: Wind,
    color: 'gray',
    data: {
      claimNumber: 'CLM-2024-WH-118',
      insuredName: 'Patricia Johnson',
      propertyAddress: '3301 Elm Creek Blvd, San Antonio, TX 78230',
      lossDate: '2024-03-22',
      lossType: 'Hail',
      reportType: 'Initial',
      propertyDetails: 'Two-story colonial-style home, built in 2005, approximately 3,100 sq ft. Stucco exterior, wood frame construction. 4 bedrooms, 3 bathrooms. Composition shingle roof — original, approximately 19 years old. Attached 3-car garage. Covered back patio.',
      lossDescription: 'Severe hailstorm with golf-ball sized hail (1.75 inch diameter per NOAA report) impacted the property on March 22, 2024. Storm lasted approximately 25 minutes. Wind gusts recorded at 58 mph. Storm resulted in damage to roofing, gutters, siding, and exterior fixtures.',
      damagesObserved: 'Roof: Functional total loss — hail impact damage to 100% of shingles, granule loss, bruising visible on all slopes. Gutters and Downspouts: Dented and separated from fascia on all 4 elevations. Front Elevation Stucco: Impact cracking visible in 12 locations. HVAC Condenser: Fins flattened on condenser coil — efficiency impaired. Skylights: 2 of 3 skylights cracked. Garage Door: Significant denting on all 3 panels.',
      recommendations: 'Full roof replacement — 4,200 sq ft including ice/water shield and synthetic underlayment. Replace all gutters and downspouts. Stucco repair and paint to match. HVAC condenser coil replacement. Replace all 3 skylight units. Replace 3 garage door panels. Supplement for permits and code upgrades as required.',
      additionalNotes: 'NOAA storm report obtained confirming hail size. Photos document hail hits on soft metals. Recommend 8-point test for shingle bruising confirmation.',
    },
  },
  {
    label: 'Vandalism',
    icon: Hammer,
    color: 'purple',
    data: {
      claimNumber: 'CLM-2024-VN-007',
      insuredName: 'Marcus & Elena Rodriguez',
      propertyAddress: '5520 Pine Ridge Lane, Houston, TX 77056',
      lossDate: '2024-04-10',
      lossType: 'Vandalism',
      reportType: 'Initial',
      propertyDetails: 'Single-story residential home, built in 2010, approximately 2,000 sq ft. Stucco and stone exterior. 3 bedrooms, 2 bathrooms. Attached 2-car garage. Property was unoccupied for 2 weeks while owners were traveling.',
      lossDescription: 'Property was broken into while owners were on vacation. Unknown perpetrators forced entry through rear sliding glass door and side garage door. Extensive vandalism and malicious destruction throughout the interior. Police report filed — case number HPD-2024-04-10-5520. No arrests made at time of inspection.',
      damagesObserved: 'Rear Sliding Door: Shattered — frame bent and glass destroyed. Garage Side Door: Forced entry — frame split, door damaged beyond repair. Living Room: Spray paint graffiti on 3 walls, ceiling fan destroyed. Kitchen: Cabinetry doors ripped from hinges, countertop cracked. Master Bedroom: Mirrored closet doors shattered, carpet stained. All Bathrooms: Fixtures damaged, mirrors broken. Interior Paint: Graffiti on walls throughout — all rooms affected.',
      recommendations: 'Board up and secure all entry points immediately. Document all damage with photographs before any cleanup. Replace sliding glass door assembly. Replace garage side door and reinforce frame. Full interior repaint after graffiti remediation. Replace damaged cabinetry hardware and doors. Professional carpet cleaning or replacement. Replace all broken fixtures and mirrors.',
      additionalNotes: 'Police report obtained and attached. Coordinate with insurer on coverage for malicious mischief endorsement. Owners request expedited processing due to security concerns.',
    },
  },
];

const LS_KEY = 'flacron_dashboard_form';

function SkeletonRow() {
  return (
    <tr>
      {[...Array(6)].map((_, i) => (
        <td key={i} className="px-4 py-3"><div className="skeleton h-4 w-full" /></td>
      ))}
    </tr>
  );
}

const STATUS_STYLES = {
  finalized: 'bg-green-500/20 text-green-600 border-green-500/30',
  approved: 'bg-green-500/20 text-green-600 border-green-500/30',
  completed: 'bg-green-500/20 text-green-600 border-green-500/30',
  complete: 'bg-green-500/20 text-green-600 border-green-500/30',
  draft: 'bg-amber-500/20 text-amber-600 border-amber-500/30',
  processing: 'bg-yellow-500/20 text-yellow-600 border-yellow-500/30',
  failed: 'bg-red-500/20 text-red-500 border-red-500/30',
  archived: 'bg-gray-400/20 text-gray-500 border-gray-400/30',
};

function StatusBadge({ status }) {
  const cls = STATUS_STYLES[status] || 'bg-gray-400/20 text-gray-500 border-gray-400/30';
  const label = formatStatus(status === 'complete' ? 'completed' : status);
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${cls}`}>
      {label}
    </span>
  );
}

function ReportDetailModal({ report, onClose }) {
  if (!report) return null;
  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}>
        <motion.div className="card w-full max-w-2xl p-6 max-h-[80vh] overflow-y-auto"
          initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Report Details</h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>
          <div className="space-y-3 text-sm">
            {[
              ['Claim Number', report.claimNumber],
              ['Insured', report.insuredName],
              ['Property', report.propertyAddress],
              ['Loss Date', report.lossDate],
              ['Loss Type', report.lossType],
              ['Report Type', report.reportType],
              ['Created', new Date(report.createdAt).toLocaleString()],
            ].map(([label, val]) => (
              <div key={label} className="flex gap-3">
                <span className="text-gray-600 w-32 shrink-0">{label}:</span>
                <span className="text-gray-900">{val}</span>
              </div>
            ))}
            <div className="flex gap-3 items-center">
              <span className="text-gray-600 w-32 shrink-0">Status:</span>
              <StatusBadge status={report.status} />
            </div>
            {report.qualityScore && (
              <div className="flex gap-3">
                <span className="text-gray-600 w-32 shrink-0" title="Measures how many required fields and sections are filled in — not the accuracy of the AI's findings.">Documentation Completeness:</span>
                <span className="text-orange-400 font-semibold">{report.qualityScore}/100</span>
              </div>
            )}
          </div>
          {report.content && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Report Content</h3>
              <ReportMarkdown
                content={report.content}
                className="max-h-96 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-4"
              />
            </div>
          )}
          <div className="flex gap-3 mt-6">
            <button className="btn-primary text-sm py-2 px-4 flex items-center gap-2"
              onClick={async () => {
                try {
                  const exportRes = await reportsAPI.export(report.id, { format: 'pdf' });
                  const { filename } = exportRes.data;
                  const fileRes = await api.get(
                    `/reports/${report.id}/download?file=${filename}`,
                    { responseType: 'blob' }
                  );
                  const url = window.URL.createObjectURL(new Blob([fileRes.data]));
                  const a = document.createElement('a');
                  a.href = url; a.download = filename; a.click();
                  window.URL.revokeObjectURL(url);
                } catch { toast.error('Export failed'); }
              }}>
              <Download className="w-4 h-4" /> PDF
            </button>
            <button className="btn-secondary text-sm py-2 px-4" onClick={onClose}>Close</button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default function Dashboard() {
  const { user, userProfile, tier, canGenerate, reportsRemaining, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Detect post-payment redirect from Stripe and show confirmation
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('upgrade') === 'success') {
      const upgradedTier = params.get('tier');
      const expectedTier = upgradedTier?.replace('_annual', '');
      const sessionId = params.get('session_id');
      // Clean URL immediately so refresh doesn't re-trigger
      navigate('/dashboard', { replace: true });

      // Confirm the completed Stripe session directly, then poll as a webhook fallback.
      let attempts = 0;
      const maxAttempts = 10;
      const poll = async () => {
        attempts++;
        if (attempts === 1 && sessionId) {
          try {
            await paymentAPI.confirmCheckout(sessionId);
          } catch {
            // Webhook reconciliation below remains the fallback.
          }
        }
        const profile = await refreshProfile();
        const currentTier = profile?.tier || 'starter';

        if (!expectedTier || currentTier === expectedTier) {
          // Tier confirmed — show success and switch to billing view
          toast.success(
            expectedTier
              ? `Plan upgraded to ${expectedTier.charAt(0).toUpperCase() + expectedTier.slice(1)}! Welcome aboard.`
              : 'Plan upgraded successfully!'
          );
          setActiveView('billing');
        } else if (attempts >= maxAttempts) {
          // Webhook is taking too long — warn the user instead of falsely celebrating
          toast(
            'Payment received! Your plan may take a moment to update. Refresh the page if it still shows the old plan.',
            { icon: '⏳', duration: 8000 }
          );
          setActiveView('billing');
        } else {
          setTimeout(poll, 2000);
        }
      };
      poll();
    } else if (params.get('billing') === 'updated') {
      navigate('/dashboard', { replace: true });
      refreshProfile().finally(() => setActiveView('billing'));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle pending plan checkout after email verification redirect
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const urlPlan = params.get('pending_plan');
    const storedPlan = sessionStorage.getItem('flac_pending_plan');
    const planToCheckout = urlPlan || storedPlan;

    if (planToCheckout && planToCheckout !== 'starter') {
      // Clear immediately to prevent duplicate checkout attempts
      sessionStorage.removeItem('flac_pending_plan');
      if (urlPlan) navigate('/dashboard', { replace: true }); // Clean URL

      paymentAPI.createCheckout(planToCheckout)
        .then(res => {
          if (res.data?.url) window.location.href = res.data.url;
          else if (res.data?.changeType) navigate('/dashboard?billing=updated');
          else navigate('/pricing');
        })
        .catch(() => {
          toast.error('Could not start checkout. Please select a plan from the pricing page.');
          navigate('/pricing');
        });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [activeView, setActiveView] = useState('generate');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(FORM_INITIAL);
  const [photos, setPhotos] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genStep, setGenStep] = useState(0);
  const [generatedReport, setGeneratedReport] = useState(null);
  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmTarget, setConfirmTarget] = useState(null); // { type: 'report'|'bulk'|'template', id }
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [detailReport, setDetailReport] = useState(null);
  const [billingInfo, setBillingInfo] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [billingLoading, setBillingLoading] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [editableContent, setEditableContent] = useState('');
  const [savingContent, setSavingContent] = useState(false);
  const [approving, setApproving] = useState(false);
  const [versions, setVersions] = useState([]);
  const [showVersions, setShowVersions] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [templateName, setTemplateName] = useState('');
  const [signatureName, setSignatureName] = useState('');
  const [signatureTitle, setSignatureTitle] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseState, setLicenseState] = useState('');
  const [company, setCompany] = useState('');
  const [confirmReview, setConfirmReview] = useState(false);
  const [sharing, setSharing] = useState(false);
  const fileInputRef = useRef();
  const autoSaveRef = useRef();

  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) { try { setForm(JSON.parse(saved)); } catch {} }
  }, []);

  useEffect(() => {
    autoSaveRef.current = setInterval(() => {
      localStorage.setItem(LS_KEY, JSON.stringify(form));
    }, 30000);
    return () => clearInterval(autoSaveRef.current);
  }, [form]);

  const fetchReports = useCallback(async () => {
    setReportsLoading(true);
    try {
      const params = { page, limit: 10 };
      if (search) params.search = search;
      if (statusFilter !== 'All') params.status = statusFilter;
      const res = await reportsAPI.getAll(params);
      setReports(res.data.data || res.data.reports || res.data || []);
      setTotalPages(res.data.totalPages || Math.ceil((res.data.total || 0) / 10) || 1);
    } catch {
      toast.error('Failed to load reports');
    } finally {
      setReportsLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    if (activeView === 'reports') fetchReports();
    if (activeView === 'billing') fetchBilling();
  }, [activeView, fetchReports]);

  const handlePhotoAdd = (files) => {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (photos.length + arr.length > 100) {
      toast.error('Maximum 100 photos allowed');
      return;
    }
    const previews = arr.map(f => ({ file: f, url: URL.createObjectURL(f), name: f.name }));
    setPhotos(prev => [...prev, ...previews]);
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false);
    handlePhotoAdd(e.dataTransfer.files);
  };

  const removePhoto = (idx) => {
    setPhotos(prev => { const next = [...prev]; URL.revokeObjectURL(next[idx].url); next.splice(idx, 1); return next; });
  };

  const handleGenerate = async () => {
    if (!canGenerate) { toast.error('You have reached your monthly report limit'); return; }
    setGenerating(true);
    setGenStep(0);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      photos.forEach(p => fd.append('images', p.file));

      const stepInterval = setInterval(() => {
        setGenStep(prev => Math.min(prev + 1, GENERATION_STEPS.length - 1));
      }, 4000);

      const res = await reportsAPI.generate(fd);
      clearInterval(stepInterval);
      setGenStep(GENERATION_STEPS.length - 1);
      const report = res.data.report || res.data;
      setGeneratedReport(report);
      setForm(FORM_INITIAL);
      setPhotos([]);
      setStep(1);
      localStorage.removeItem(LS_KEY);
      toast.success('Report generated successfully!');
      // Refresh usage count in sidebar immediately
      refreshProfile();
      // Prepend to reports list so My Reports shows it right away
      setReports(prev => [report, ...prev]);
      // Auto-load PDF preview
      autoPreviewPDF(report);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleExport = async (format) => {
    if (!generatedReport) return;
    try {
      const exportRes = await reportsAPI.export(generatedReport.id, { format });
      const { filename } = exportRes.data;
      const fileRes = await api.get(
        `/reports/${generatedReport.id}/download?file=${filename}`,
        { responseType: 'blob' }
      );
      const mimeTypes = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', html: 'text/html' };
      const url = window.URL.createObjectURL(new Blob([fileRes.data], { type: mimeTypes[format] || 'application/octet-stream' }));
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      window.URL.revokeObjectURL(url);
      toast.success(`Exported as ${format.toUpperCase()}`);
    } catch { toast.error('Export failed'); }
  };

  const autoPreviewPDF = async (report) => {
    if (!report?.id) return;
    setPreviewing(true);
    try {
      const exportRes = await reportsAPI.export(report.id, { format: 'pdf' });
      const { filename } = exportRes.data;
      const fileRes = await api.get(
        `/reports/${report.id}/download?file=${filename}&inline=true`,
        { responseType: 'blob' }
      );
      const url = window.URL.createObjectURL(new Blob([fileRes.data], { type: 'application/pdf' }));
      setPdfPreviewUrl(url);
    } catch (err) {
      console.warn('Auto PDF preview failed:', err.message);
    } finally { setPreviewing(false); }
  };

  const handlePreviewPDF = async () => {
    if (!generatedReport) return;
    setPreviewing(true);
    try {
      const exportRes = await reportsAPI.export(generatedReport.id, { format: 'pdf' });
      const { filename } = exportRes.data;
      const fileRes = await api.get(
        `/reports/${generatedReport.id}/download?file=${filename}&inline=true`,
        { responseType: 'blob' }
      );
      const url = window.URL.createObjectURL(new Blob([fileRes.data], { type: 'application/pdf' }));
      if (pdfPreviewUrl) window.URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(url);
    } catch { toast.error('Preview failed'); }
    finally { setPreviewing(false); }
  };

  // Keep the editable draft in sync when a new report is generated/opened
  useEffect(() => {
    if (generatedReport?.content != null) setEditableContent(generatedReport.content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatedReport?.id]);

  const reportReviewed = ['finalized', 'approved', 'completed'].includes(generatedReport?.status);

  const handleSaveContent = async () => {
    if (!generatedReport) return;
    setSavingContent(true);
    try {
      await reportsAPI.update(generatedReport.id, { content: editableContent });
      setGeneratedReport(prev => ({ ...prev, content: editableContent }));
      toast.success('Changes saved');
      handlePreviewPDF();
    } catch { toast.error('Save failed'); }
    finally { setSavingContent(false); }
  };

  const handleApprove = async () => {
    if (!generatedReport) return;
    if (!signatureName.trim() || !licenseNumber.trim() || !licenseState.trim() || !company.trim()) {
      toast.error('Full name, license number, license state, and company/firm are required to approve.');
      return;
    }
    if (!confirmReview) {
      toast.error('You must confirm you have reviewed the report before approving.');
      return;
    }
    setApproving(true);
    try {
      const signature = {
        name: signatureName.trim(),
        title: signatureTitle.trim(),
        licenseNumber: licenseNumber.trim(),
        licenseState: licenseState.trim(),
        company: company.trim(),
      };
      const res = await reportsAPI.approve(generatedReport.id, { content: editableContent, signature, confirmReview: true });
      const updated = res.data?.report || {};
      setGeneratedReport(prev => ({ ...prev, ...updated, content: editableContent, status: 'finalized' }));
      setReports(prev => prev.map(r => (r.id === generatedReport.id ? { ...r, status: 'finalized' } : r)));
      toast.success('Report approved & finalized — exports are now clean');
      handlePreviewPDF();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Approval failed');
    } finally { setApproving(false); }
  };

  const handleShare = async () => {
    if (!generatedReport) return;
    setSharing(true);
    try {
      const res = await reportsAPI.share(generatedReport.id);
      try { await navigator.clipboard.writeText(res.data.url); toast.success('Share link copied to clipboard'); }
      catch { toast.success(`Share link: ${res.data.url}`); }
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not create share link');
    } finally { setSharing(false); }
  };

  const loadVersions = async () => {
    if (!generatedReport) return;
    const next = !showVersions;
    setShowVersions(next);
    if (next) {
      try {
        const res = await reportsAPI.versions(generatedReport.id);
        setVersions(res.data.versions || []);
      } catch { toast.error('Could not load history'); }
    }
  };

  const handleRestoreVersion = (v) => {
    if (v?.content == null) return;
    setEditableContent(v.content);
    toast.success('Version loaded into editor — Save to keep it');
  };

  // ── Report templates (T-2.10) ──
  const fetchTemplates = useCallback(async () => {
    try { const r = await reportsAPI.listTemplates(); setTemplates(r.data.templates || []); } catch { /* non-critical */ }
  }, []);
  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const handleSaveTemplate = async () => {
    const name = templateName.trim();
    if (!name) { toast.error('Enter a template name'); return; }
    try {
      const fields = {
        lossType: form.lossType, reportType: form.reportType, propertyDetails: form.propertyDetails,
        lossDescription: form.lossDescription, damagesObserved: form.damagesObserved,
        recommendations: form.recommendations, additionalNotes: form.additionalNotes,
      };
      await reportsAPI.saveTemplate({ name, fields });
      setTemplateName('');
      toast.success('Template saved');
      fetchTemplates();
    } catch { toast.error('Could not save template'); }
  };

  const handleLoadTemplate = (t) => {
    setForm(prev => ({ ...prev, ...t.fields }));
    toast.success(`Loaded "${t.name}"`);
  };

  const handleDeleteTemplate = (id, e) => {
    e.stopPropagation();
    setConfirmTarget({ type: 'template', id });
  };

  const handleDeleteReport = (id) => {
    setConfirmTarget({ type: 'report', id });
  };

  const handleBulkDelete = () => {
    if (!selectedIds.length) return;
    setConfirmTarget({ type: 'bulk' });
  };

  const runConfirmedDelete = async () => {
    if (!confirmTarget) return;
    setConfirmLoading(true);
    try {
      if (confirmTarget.type === 'template') {
        await reportsAPI.deleteTemplate(confirmTarget.id);
        setTemplates(prev => prev.filter(t => t.id !== confirmTarget.id));
        toast.success('Template deleted');
      } else if (confirmTarget.type === 'report') {
        await reportsAPI.delete(confirmTarget.id, true);
        toast.success('Report deleted');
        fetchReports();
      } else if (confirmTarget.type === 'bulk') {
        await Promise.all(selectedIds.map(id => reportsAPI.delete(id, true)));
        toast.success(`Deleted ${selectedIds.length} reports`);
        setSelectedIds([]);
        fetchReports();
      }
      setConfirmTarget(null);
    } catch {
      toast.error('Delete failed');
    } finally {
      setConfirmLoading(false);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const TIER_LIMITS = { starter: 5, professional: 50, agency: 200, enterprise: -1 };
  const TIER_EXPORTS = { starter: ['pdf'], professional: ['pdf', 'docx', 'html'], agency: ['pdf', 'docx', 'html'], enterprise: ['pdf', 'docx', 'html'] };
  const allowedExports = TIER_EXPORTS[tier] || ['pdf'];
  const tierLimit = TIER_LIMITS[tier] ?? 1;
  const usedThisMonth = userProfile?.reportsThisMonth || 0;
  const usagePercent = tierLimit === -1 ? 0 : Math.min(100, Math.round((usedThisMonth / tierLimit) * 100));

  const fetchBilling = async () => {
    setBillingLoading(true);
    try {
      const [subRes, invRes] = await Promise.all([
        paymentAPI.getSubscription(),
        paymentAPI.getInvoices(),
      ]);
      setBillingInfo(subRes.data?.subscription || null);
      setInvoices(invRes.data?.invoices || []);
    } catch (err) {
      console.error('Billing fetch error:', err.message);
    } finally {
      setBillingLoading(false);
    }
  };

  const navLinks = [
    { id: 'generate', label: 'Generate Report', icon: Zap },
    { id: 'reports', label: 'My Reports', icon: FileText },
    ...(tier === 'agency' || tier === 'enterprise' ? [{ id: 'crm', label: 'CRM', icon: Users, href: '/crm' }] : []),
    { id: 'billing', label: 'Usage & Billing', icon: CreditCard },
    { id: 'settings', label: 'Settings', icon: Settings, href: '/settings' },
    ...(tier === 'enterprise' ? [{ id: 'enterprise', label: 'Enterprise Portal', icon: ExternalLink, href: '/enterprise-dashboard' }] : []),
  ];

  return (
    <div className="min-h-screen bg-[#ffffff] flex flex-col">
      <Navbar />
      <div className="flex flex-1 pt-16">
        {sidebarOpen && (
          <button
            type="button"
            aria-label="Close dashboard navigation"
            className="fixed inset-0 top-16 z-40 bg-gray-950/35 backdrop-blur-[1px] md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`fixed bottom-0 left-0 top-16 z-50 flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-r border-[#e5e7eb] bg-[#f8f8f8] px-3 py-4 shadow-xl transition-transform duration-300 scrollbar-hide md:sticky md:top-16 md:z-20 md:h-[calc(100vh-4rem)] md:w-64 md:translate-x-0 md:rounded-r-3xl md:shadow-sm ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between px-1 md:hidden">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
              Dashboard
            </p>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="rounded-xl border border-gray-200 bg-white p-2 text-gray-600 shadow-sm"
              aria-label="Close dashboard navigation"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>

          {/* Profile Card */}
          <div className="rounded-2xl overflow-hidden border border-[#e5e7eb] bg-white">
            {/* Banner */}
            <div className="h-16 relative" style={{ background: 'linear-gradient(135deg, #f97316 0%, #fb923c 50%, #fbbf24 100%)' }}>
              <div className="absolute inset-0 opacity-20"
                style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(255,255,255,.15) 8px, rgba(255,255,255,.15) 16px)' }} />
              {/* Avatar */}
              <div className="absolute -bottom-5 left-4">
                {userProfile?.logoUrl
                  ? <img src={userProfile.logoUrl} alt="avatar"
                      className="w-11 h-11 rounded-xl border-2 border-white object-cover shadow-sm" />
                  : (
                    <div className="w-11 h-11 rounded-xl border-2 border-white shadow-sm bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white font-bold text-lg">
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
                <div className="rounded-lg bg-orange-50 border border-orange-100 px-2.5 py-2 text-center">
                  <p className="text-orange-500 font-bold text-base leading-none">{usedThisMonth}</p>
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
                    usagePercent >= 90 ? 'bg-red-500' : usagePercent >= 70 ? 'bg-amber-400' : 'bg-orange-500'
                  }`} style={{ width: `${tierLimit === -1 ? 0 : usagePercent}%` }} />
                </div>
                <p className="text-[10px] text-gray-400 mt-1">
                  {reportsRemaining === -1 ? 'Unlimited' : `${reportsRemaining} remaining`}
                </p>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex flex-col gap-0.5 flex-1">
            {navLinks.map(link => (
              <button key={link.id}
                onClick={() => {
                  setSidebarOpen(false);
                  if (link.href) navigate(link.href);
                  else setActiveView(link.id);
                }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeView === link.id
                    ? 'bg-orange-500 text-white shadow-sm shadow-orange-200'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white hover:shadow-sm hover:border hover:border-gray-100'
                }`}>
                <link.icon className="w-4 h-4 shrink-0" />
                {link.label}
              </button>
            ))}
          </nav>

          {/* Upgrade CTA */}
          {tier === 'starter' && (
            <div className="rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50 to-amber-50 p-4">
              <p className="text-xs font-bold text-gray-800 mb-0.5">Unlock More Reports</p>
              <p className="text-[10px] text-gray-500 leading-relaxed mb-3">
                Starter plan: {tierLimit} report/mo with watermark. Upgrade for more.
              </p>
              <button onClick={() => navigate('/pricing')}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5">
                <Star className="w-3 h-3" /> Upgrade Plan
              </button>
            </div>
          )}
          {tier === 'professional' && (
            <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-3">
              <p className="text-[10px] font-semibold text-blue-700 mb-2">Professional Plan</p>
              <button onClick={() => navigate('/pricing')}
                className="w-full border border-blue-200 text-blue-600 hover:bg-blue-100 text-xs font-medium py-1.5 rounded-lg transition-colors">
                View Agency Plan
              </button>
            </div>
          )}
        </aside>

        {/* Main */}
        <main className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="fixed bottom-5 left-4 z-30 flex h-12 w-12 items-center justify-center rounded-2xl bg-navy-700 text-white shadow-lg shadow-navy-900/20 md:hidden"
            aria-label="Open dashboard navigation"
            aria-expanded={sidebarOpen}
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Mobile/tablet usage panel — visible only below md breakpoint */}
          <div className="mx-3 mt-4 rounded-2xl border border-[#e5e7eb] bg-[#f8f8f8] shadow-sm md:hidden">
            {/* User row */}
            <div className="flex items-center gap-3 px-4 pt-4 pb-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                {(userProfile?.displayName || user?.email || 'U')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate leading-tight">
                  {userProfile?.displayName || user?.email || 'Welcome'}
                </p>
                <p className="text-xs text-gray-500 truncate leading-tight">{user?.email}</p>
              </div>
              <TierBadge tier={tier} />
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2 px-4 pb-3">
              <div className="rounded-xl bg-white border border-gray-200 px-3 py-2 text-center shadow-sm">
                <p className="text-lg font-bold text-orange-500 leading-none">{usedThisMonth}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">Used</p>
              </div>
              <div className="rounded-xl bg-white border border-gray-200 px-3 py-2 text-center shadow-sm">
                <p className="text-lg font-bold text-gray-800 leading-none">
                  {tierLimit === -1 ? '∞' : tierLimit}
                </p>
                <p className="text-[10px] text-gray-500 mt-0.5">Limit</p>
              </div>
              <div className="rounded-xl bg-white border border-gray-200 px-3 py-2 text-center shadow-sm">
                <p className={`text-lg font-bold leading-none ${
                  reportsRemaining === -1 ? 'text-green-500' :
                  reportsRemaining === 0 ? 'text-red-500' :
                  reportsRemaining <= 3 ? 'text-amber-500' : 'text-green-500'
                }`}>
                  {reportsRemaining === -1 ? '∞' : reportsRemaining}
                </p>
                <p className="text-[10px] text-gray-500 mt-0.5">Left</p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="px-4 pb-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-medium text-gray-500">Monthly reports</span>
                <span className="text-[10px] font-semibold text-gray-600">
                  {tierLimit === -1 ? 'Unlimited plan' : `${usagePercent}% used`}
                </span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    tierLimit === -1 ? 'bg-green-400' :
                    usagePercent >= 90 ? 'bg-red-500' :
                    usagePercent >= 70 ? 'bg-amber-400' : 'bg-orange-500'
                  }`}
                  style={{ width: tierLimit === -1 ? '100%' : `${usagePercent}%` }}
                />
              </div>
              {reportsRemaining === 0 && tierLimit !== -1 && (
                <p className="text-[10px] text-red-500 font-semibold mt-1">
                  Monthly limit reached — <button onClick={() => navigate('/pricing')} className="underline">upgrade your plan</button>
                </p>
              )}
              {reportsRemaining !== -1 && reportsRemaining > 0 && usagePercent >= 80 && (
                <p className="mt-1 flex items-center gap-1 text-[10px] font-medium text-amber-600">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  {reportsRemaining} report{reportsRemaining !== 1 ? 's' : ''} remaining this month
                </p>
              )}
            </div>
          </div>

          <AnimatePresence mode="wait">
            {activeView === 'generate' && (
              <motion.div key="generate" className="mx-auto max-w-5xl px-4 py-8 sm:p-6"
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>

                {tier === 'starter' && (
                  <div className="mb-4 px-4 py-3 rounded-xl bg-amber-50 border border-amber-300 flex items-center gap-3">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <p className="text-sm text-amber-800 font-medium">Starter plan reports include a FlacronAI watermark. <button onClick={() => navigate('/pricing')} className="underline font-semibold text-orange-600 hover:text-orange-700">Upgrade</button> to remove.</p>
                  </div>
                )}

                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">Generate Report</h1>
                    <p className="text-gray-600 text-sm mt-1">AI-powered insurance claim report generation</p>
                  </div>
                  {generatedReport && (
                    <button onClick={() => setGeneratedReport(null)} className="btn-secondary text-sm py-2 flex items-center gap-2">
                      <RefreshCw className="w-4 h-4" /> New Report
                    </button>
                  )}
                </div>

                {!generatedReport ? (
                  <div className="grid grid-cols-1 gap-6">
                    {/* Step Progress */}
                    <div className="flex items-center gap-1 flex-wrap">
                      {[1, 2, 3, 4, 5].map(s => (
                        <div key={s} className="flex items-center gap-1">
                          <button onClick={() => setStep(s)}
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                              step >= s ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}>{s}</button>
                          {s < 5 && <div className={`h-0.5 w-8 ${step > s ? 'bg-orange-500' : 'bg-gray-200'}`} />}
                        </div>
                      ))}
                      <span className="text-sm text-gray-500 ml-2">
                        {['Claim Info', 'Property', 'Loss Details', 'Photos', 'Review'][step - 1]}
                      </span>
                    </div>

                    <div className="card p-6">
                      <AnimatePresence mode="wait">
                        {/* ── STEP 1: Claim Info ── */}
                        {step === 1 && (
                          <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                            className="space-y-5">
                            <div className="flex items-center justify-between">
                              <h2 className="text-lg font-semibold text-gray-900">Claim Information</h2>
                              <span className="text-xs text-gray-500">Step 1 of 5</span>
                            </div>

                            {/* Quick Demo Buttons */}
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Quick Demo Templates</p>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {QUICK_DEMOS.map(demo => (
                                  <button key={demo.label}
                                    onClick={() => { setForm(prev => ({ ...prev, ...demo.data })); toast.success(`${demo.label} template loaded!`); }}
                                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-gray-200 hover:border-orange-400 hover:bg-orange-500/5 transition-all text-center group">
                                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-50 text-gray-600 transition-colors group-hover:bg-orange-50 group-hover:text-orange-500">
                                      <demo.icon className="h-5 w-5" aria-hidden="true" />
                                    </span>
                                    <span className="text-xs font-medium text-gray-700 group-hover:text-orange-500">{demo.label}</span>
                                  </button>
                                ))}
                              </div>
                              <p className="text-xs text-gray-400 mt-1.5">Click a template to auto-fill all fields for a demo report</p>
                            </div>

                            {/* My Templates (T-2.10) — saved, reusable claim structures */}
                            <div>
                              <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">My Templates</p>
                                <div className="flex items-center gap-1.5">
                                  <input value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="Template name"
                                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-400 w-32" />
                                  <button onClick={handleSaveTemplate} className="text-xs btn-secondary py-1 px-2.5 flex items-center gap-1">
                                    <Save className="w-3 h-3" /> Save current
                                  </button>
                                </div>
                              </div>
                              {templates.length === 0 ? (
                                <p className="text-xs text-gray-400">Save the current claim details (property, loss, damages, recommendations) as a reusable template.</p>
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  {templates.map(t => (
                                    <div key={t.id} className="group flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full border border-gray-200 hover:border-brand-400 hover:bg-brand-50 transition-all">
                                      <button onClick={() => handleLoadTemplate(t)} className="text-xs font-medium text-gray-700 group-hover:text-brand-600">{t.name}</button>
                                      <button onClick={(e) => handleDeleteTemplate(t.id, e)} className="w-4 h-4 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50" title="Delete template">
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className="border-t border-gray-100 pt-4">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                  <label className="label">Claim Number *</label>
                                  <input className="input" placeholder="e.g. CLM-2024-001"
                                    value={form.claimNumber} onChange={e => setForm(p => ({ ...p, claimNumber: e.target.value }))} />
                                </div>
                                <div>
                                  <label className="label">Insured Name *</label>
                                  <input className="input" placeholder="Full name of insured"
                                    value={form.insuredName} onChange={e => setForm(p => ({ ...p, insuredName: e.target.value }))} />
                                </div>
                                <div>
                                  <label className="label">Loss Date *</label>
                                  <input type="date" className="input" value={form.lossDate}
                                    onChange={e => setForm(p => ({ ...p, lossDate: e.target.value }))} />
                                </div>
                                <div>
                                  <label className="label">Loss Type *</label>
                                  <select className="input" value={form.lossType}
                                    onChange={e => setForm(p => ({ ...p, lossType: e.target.value }))}>
                                    {LOSS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="label">Report Type</label>
                                  <select className="input" value={form.reportType}
                                    onChange={e => setForm(p => ({ ...p, reportType: e.target.value }))}>
                                    {REPORT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                  </select>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}

                        {/* ── STEP 2: Property Details ── */}
                        {step === 2 && (
                          <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                            className="space-y-4">
                            <div className="flex items-center justify-between">
                              <h2 className="text-lg font-semibold text-gray-900">Property Details</h2>
                              <span className="text-xs text-gray-500">Step 2 of 5</span>
                            </div>
                            <div>
                              <label className="label">Property Address *</label>
                              <input className="input" placeholder="Full street address, city, state, zip"
                                value={form.propertyAddress} onChange={e => setForm(p => ({ ...p, propertyAddress: e.target.value }))} />
                            </div>
                            <div>
                              <label className="label">Property Description</label>
                              <textarea className="input min-h-[160px] resize-y"
                                placeholder="Describe the property — e.g.: 2-story single-family home, built in 1998, approx 2,200 sq ft. Brick veneer exterior, wood frame. 3 bedrooms, 2.5 bathrooms. Recently renovated kitchen..."
                                value={form.propertyDetails} onChange={e => setForm(p => ({ ...p, propertyDetails: e.target.value }))} />
                              <p className="text-xs text-gray-400 mt-1">Include construction type, age, size, number of rooms, and any relevant features</p>
                            </div>
                          </motion.div>
                        )}

                        {/* ── STEP 3: Loss Details ── */}
                        {step === 3 && (
                          <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                            className="space-y-4">
                            <div className="flex items-center justify-between">
                              <h2 className="text-lg font-semibold text-gray-900">Loss Details</h2>
                              <span className="text-xs text-gray-500">Step 3 of 5</span>
                            </div>
                            <div>
                              <label className="label">Description of Loss</label>
                              <textarea className="input min-h-[130px] resize-y"
                                placeholder="Describe how and when the loss occurred — e.g.: Upstairs bathroom supply line failed overnight, water flowed approximately 6–8 hours before discovered. Water migrated through floor into kitchen below..."
                                value={form.lossDescription} onChange={e => setForm(p => ({ ...p, lossDescription: e.target.value }))} />
                            </div>
                            <div>
                              <label className="label">Damages Observed</label>
                              <textarea className="input min-h-[130px] resize-y"
                                placeholder="List damages room by room — e.g.: Master Bath: saturated subfloor, buckled tile, damaged vanity. Kitchen ceiling: 40 sq ft collapse. Hallway: hardwood flooring cupped, 85 sq ft..."
                                value={form.damagesObserved} onChange={e => setForm(p => ({ ...p, damagesObserved: e.target.value }))} />
                            </div>
                            <div>
                              <label className="label">Recommendations</label>
                              <textarea className="input min-h-[110px] resize-y"
                                placeholder="Enter your repair recommendations — e.g.: Immediate water extraction required. Deploy dehumidifiers for 3-day drying period. Remove all saturated drywall. Test for mold growth before closing wall cavities..."
                                value={form.recommendations} onChange={e => setForm(p => ({ ...p, recommendations: e.target.value }))} />
                            </div>
                            <div>
                              <label className="label">Additional Notes</label>
                              <textarea className="input min-h-[80px] resize-y"
                                placeholder="Any other notes, policy information, or special circumstances..."
                                value={form.additionalNotes} onChange={e => setForm(p => ({ ...p, additionalNotes: e.target.value }))} />
                            </div>
                          </motion.div>
                        )}

                        {/* ── STEP 4: Photos ── */}
                        {step === 4 && (
                          <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                            <div className="flex items-center justify-between mb-4">
                              <div>
                                <h2 className="text-lg font-semibold text-gray-900">Upload Photos</h2>
                                <p className="text-xs text-gray-500 mt-0.5">Optional — AI will analyze damage photos</p>
                              </div>
                              <span className="text-sm text-gray-500">{photos.length} / 100</span>
                            </div>
                            <div
                              className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer ${
                                dragging ? 'border-orange-500 bg-orange-500/10' : 'border-gray-200 hover:border-orange-400 hover:bg-orange-500/5'
                              }`}
                              onDragOver={e => { e.preventDefault(); setDragging(true); }}
                              onDragLeave={() => setDragging(false)}
                              onDrop={handleDrop}
                              onClick={() => fileInputRef.current?.click()}>
                              <ImageIcon className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                              <p className="text-gray-700 font-medium">Drag & drop damage photos here</p>
                              <p className="text-gray-500 text-sm mt-1">or click to browse — up to 100 photos, 10MB each</p>
                              <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden"
                                onChange={e => handlePhotoAdd(e.target.files)} />
                            </div>
                            {photos.length > 0 && (
                              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mt-4">
                                {photos.map((p, i) => (
                                  <div key={i} className="relative group aspect-square">
                                    <img src={p.url} alt={p.name} className="w-full h-full object-cover rounded-lg" />
                                    <button onClick={() => removePhoto(i)}
                                      className="absolute top-1 right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                      <X className="w-3 h-3 text-white" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </motion.div>
                        )}

                        {/* ── STEP 5: Review & Generate ── */}
                        {step === 5 && (
                          <motion.div key="step5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                            <div className="flex items-center justify-between mb-4">
                              <h2 className="text-lg font-semibold text-gray-900">Review & Generate</h2>
                              <span className="text-xs text-gray-500">Step 5 of 5</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
                              {[
                                ['Claim Number', form.claimNumber],
                                ['Insured Name', form.insuredName],
                                ['Property Address', form.propertyAddress],
                                ['Loss Date', form.lossDate],
                                ['Loss Type', form.lossType],
                                ['Report Type', form.reportType],
                                ['Photos', `${photos.length} uploaded`],
                                ['Property Description', form.propertyDetails ? 'Provided' : 'Not provided', Boolean(form.propertyDetails)],
                                ['Loss Description', form.lossDescription ? 'Provided' : 'Not provided', Boolean(form.lossDescription)],
                                ['Damages Observed', form.damagesObserved ? 'Provided' : 'Not provided', Boolean(form.damagesObserved)],
                                ['Recommendations', form.recommendations ? 'Provided' : 'Not provided', Boolean(form.recommendations)],
                              ].map(([label, val, provided]) => (
                                <div key={label} className="flex gap-2 p-2.5 rounded-xl bg-gray-50 border border-gray-100">
                                  <span className="text-gray-500 text-xs w-36 shrink-0 pt-0.5">{label}</span>
                                  <span className={`flex items-center gap-1.5 text-sm font-medium ${provided ? 'text-green-600' : 'text-gray-900'}`}>
                                    {provided && <CheckCircle className="h-3.5 w-3.5 shrink-0" />}
                                    {val || '—'}
                                  </span>
                                </div>
                              ))}
                            </div>
                            {!canGenerate && (
                              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 text-sm flex gap-2 items-center mb-4">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                You have used all your monthly reports. <button onClick={() => navigate('/pricing')} className="underline font-semibold ml-1">Upgrade to continue</button>
                              </div>
                            )}
                            {tier === 'starter' && (
                              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs flex gap-2 items-center mb-3">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                Starter plan: PDF only with FlacronAI watermark. <button onClick={() => navigate('/pricing')} className="underline font-semibold ml-1">Upgrade to remove</button>
                              </div>
                            )}
                            <button onClick={handleGenerate} disabled={!canGenerate || generating || !form.claimNumber || !form.insuredName}
                              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed py-3 text-base">
                              <Zap className="w-5 h-5" /> Generate Report with AI
                            </button>
                            {(!form.claimNumber || !form.insuredName) && (
                              <p className="text-xs text-red-400 mt-2 text-center">Claim Number and Insured Name are required</p>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <div className="flex justify-between mt-6">
                        <button onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1}
                          className="btn-secondary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-30">
                          <ChevronLeft className="w-4 h-4" /> Back
                        </button>
                        {step < 5 && (
                          <button onClick={() => setStep(s => Math.min(5, s + 1))}
                            className="btn-primary text-sm py-2 px-4 flex items-center gap-2">
                            Next <ChevronRight className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Generating State */}
                <AnimatePresence>
                  {generating && (
                    <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <div className="card p-8 max-w-md w-full text-center">
                        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-orange-500/20 flex items-center justify-center">
                          <Zap className="w-8 h-8 text-orange-400 animate-pulse" />
                        </div>
                        <h2 className="text-xl font-bold text-gray-900 mb-2">Generating Your Report</h2>
                        <p className="text-gray-600 text-sm mb-6">Please wait while our AI processes your claim...</p>
                        <div className="space-y-3">
                          {GENERATION_STEPS.map((s, i) => (
                            <div key={i} className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                              i < genStep ? 'bg-green-500/10 text-green-400' :
                              i === genStep ? 'bg-orange-500/10 text-orange-400' :
                              'bg-gray-100 text-gray-500'
                            }`}>
                              {i < genStep ? <CheckCircle className="w-4 h-4 shrink-0" /> :
                               i === genStep ? <RefreshCw className="w-4 h-4 shrink-0 animate-spin" /> :
                               <Clock className="w-4 h-4 shrink-0" />}
                              <span className="text-sm font-medium">{s}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Generated Report Preview */}
                {generatedReport && (
                  <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
                    className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-4">

                      {/* PDF View — shown first, auto-loaded */}
                      <div className="card p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-orange-500" />
                            <h2 className="text-sm font-semibold text-gray-900">PDF Preview</h2>
                          </div>
                          <div className="flex items-center gap-2">
                            {generatedReport.qualityScore && (
                              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-green-500/20 text-green-400 border border-green-500/30"
                                title="Documentation Completeness: measures how many required fields and sections are filled in — not the accuracy of the AI's findings.">
                                Completeness {generatedReport.qualityScore}/100
                              </span>
                            )}
                            <button onClick={handlePreviewPDF} disabled={previewing}
                              className="text-xs btn-secondary py-1.5 px-3 flex items-center gap-1.5 disabled:opacity-50">
                              {previewing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                              Refresh
                            </button>
                            {pdfPreviewUrl && (
                              <button onClick={() => { window.URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(null); }}
                                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                                <X className="w-4 h-4 text-gray-500" />
                              </button>
                            )}
                          </div>
                        </div>

                        {previewing && !pdfPreviewUrl && (
                          <div className="flex flex-col items-center justify-center py-16 gap-3 bg-gray-50 rounded-xl border border-gray-200">
                            <RefreshCw className="w-8 h-8 text-orange-500 animate-spin" />
                            <p className="text-sm text-gray-500 font-medium">Rendering PDF...</p>
                          </div>
                        )}

                        {pdfPreviewUrl && (
                          <iframe
                            src={pdfPreviewUrl}
                            className="w-full rounded-xl border border-gray-200"
                            style={{ height: '780px' }}
                            title="PDF Preview"
                          />
                        )}

                        {!previewing && !pdfPreviewUrl && (
                          <div className="flex flex-col items-center justify-center py-16 gap-3 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                            <FileText className="w-10 h-10 text-gray-300" />
                            <p className="text-sm text-gray-400">PDF preview failed to load</p>
                            <button onClick={handlePreviewPDF}
                              className="btn-primary text-sm py-2 px-4 flex items-center gap-2">
                              <Eye className="w-4 h-4" /> Load PDF Preview
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Editable draft content — mandatory human review (Golden Rule #3) */}
                      <div className="card p-4">
                        <div className="flex items-center justify-between mb-3 gap-3">
                          <div>
                            <h2 className="text-sm font-semibold text-gray-900">Review &amp; Edit Report</h2>
                            <p className="text-xs text-gray-500 mt-0.5">AI-generated draft — review and edit any section, then approve to finalize.</p>
                          </div>
                          <button onClick={handleSaveContent} disabled={savingContent || editableContent === generatedReport.content}
                            className="text-xs btn-secondary py-1.5 px-3 flex items-center gap-1.5 disabled:opacity-50 shrink-0">
                            {savingContent ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save Changes
                          </button>
                        </div>
                        <textarea value={editableContent} onChange={e => setEditableContent(e.target.value)}
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-700 leading-relaxed font-mono resize-y focus:outline-none focus:ring-2 focus:ring-orange-400"
                          style={{ minHeight: '360px' }} spellCheck={false} />
                      </div>
                    </div>

                    <div className="space-y-4">
                      {/* Human-review gate (Golden Rule #3) */}
                      <div className={`card p-4 border ${reportReviewed ? 'border-green-200' : 'border-amber-300 bg-amber-50/40'}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <ShieldCheck className={`w-4 h-4 ${reportReviewed ? 'text-green-600' : 'text-amber-600'}`} />
                          <h3 className="text-sm font-semibold text-gray-800">Review &amp; Approval</h3>
                        </div>
                        {reportReviewed ? (
                          <>
                            <div className="flex items-center gap-2 text-sm text-green-700 mb-2">
                              <CheckCircle className="w-4 h-4" /> Finalized{generatedReport.reviewedAt ? ` · ${new Date(generatedReport.reviewedAt).toLocaleDateString()}` : ''}
                            </div>
                            {generatedReport.signature?.name && (
                              <div className="text-xs text-gray-500 mb-3 space-y-0.5">
                                <p>Approved by <span className="font-medium text-gray-700">{generatedReport.signature.name}</span>{generatedReport.signature.title ? `, ${generatedReport.signature.title}` : ''}</p>
                                {generatedReport.signature.licenseNumber && (
                                  <p>License {generatedReport.signature.licenseState} {generatedReport.signature.licenseNumber}</p>
                                )}
                                {generatedReport.signature.company && <p>{generatedReport.signature.company}</p>}
                              </div>
                            )}
                            <button onClick={handleShare} disabled={sharing}
                              className="w-full btn-secondary text-sm py-2 flex items-center gap-2 justify-center disabled:opacity-50">
                              {sharing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />} Copy Share Link
                            </button>
                          </>
                        ) : (
                          <>
                            <p className="text-xs text-amber-800 mb-3">Unreviewed AI draft. Exports are watermarked <strong>DRAFT</strong> until a licensed adjuster reviews and approves it.</p>
                            <div className="grid grid-cols-2 gap-2 mb-2">
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Full name *</label>
                                <input value={signatureName} onChange={e => setSignatureName(e.target.value)} placeholder="Jane Adjuster"
                                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400" />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
                                <input value={signatureTitle} onChange={e => setSignatureTitle(e.target.value)} placeholder="Senior Adjuster"
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
                            <label className="flex items-start gap-2 mb-3 text-xs text-gray-700 cursor-pointer">
                              <input type="checkbox" checked={confirmReview} onChange={e => setConfirmReview(e.target.checked)}
                                className="mt-0.5 rounded border-gray-300 text-brand-600 focus:ring-brand-400" />
                              <span>I confirm that I have reviewed this report, made any necessary corrections, and approve this version for final export. I understand that AI-generated content must be independently verified.</span>
                            </label>
                            <button onClick={handleApprove} disabled={approving}
                              className="w-full btn-primary text-sm py-2 flex items-center gap-2 justify-center disabled:opacity-50">
                              {approving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Approve &amp; Finalize
                            </button>
                          </>
                        )}
                      </div>
                      {/* Version history & audit trail (T-2.13) */}
                      <div className="card p-4">
                        <button onClick={loadVersions} className="w-full flex items-center justify-between text-sm font-semibold text-gray-700">
                          <span className="flex items-center gap-2"><Clock className="w-4 h-4 text-gray-500" /> Version History</span>
                          <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${showVersions ? 'rotate-90' : ''}`} />
                        </button>
                        {showVersions && (
                          <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                            {versions.length === 0 ? (
                              <p className="text-xs text-gray-400">No history yet.</p>
                            ) : versions.map((v) => (
                              <div key={v.id} className="flex items-center justify-between gap-2 text-xs border border-gray-100 rounded-lg px-2.5 py-2">
                                <div className="min-w-0">
                                  <span className={`font-semibold ${v.action === 'approved' ? 'text-green-600' : v.action === 'generated' ? 'text-brand-600' : 'text-gray-700'}`}>{v.action}</span>
                                  <span className="text-gray-400"> · {new Date(v.at).toLocaleString()}</span>
                                  <p className="text-gray-400 truncate">{v.by}</p>
                                </div>
                                {v.content != null && (
                                  <button onClick={() => handleRestoreVersion(v)} className="shrink-0 text-brand-600 hover:underline font-medium">Restore</button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="card p-4">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3">Export Options</h3>
                        <div className="space-y-2">
                          {['pdf', 'docx', 'html'].map(fmt => {
                            const allowed = allowedExports.includes(fmt);
                            return allowed ? (
                              <button key={fmt} onClick={() => handleExport(fmt)}
                                className="w-full btn-secondary text-sm py-2 flex items-center gap-2 justify-center">
                                <Download className="w-4 h-4" /> Download {fmt.toUpperCase()}
                              </button>
                            ) : (
                              <button key={fmt} onClick={() => navigate('/pricing')}
                                className="w-full text-sm py-2 flex items-center gap-2 justify-center border border-dashed border-gray-200 rounded-lg text-gray-400 hover:border-orange-300 hover:text-orange-500 transition-colors">
                                <Lock className="w-3.5 h-3.5" /> {fmt.toUpperCase()} — Upgrade
                              </button>
                            );
                          })}
                        </div>
                        {tier === 'starter' && (
                          <p className="text-[10px] text-gray-400 mt-2 text-center">DOCX & HTML require Professional+</p>
                        )}
                      </div>
                      {generatedReport.aiModel && (
                        <div className="card p-4">
                          <h3 className="text-sm font-semibold text-gray-700 mb-2">AI Model Used</h3>
                          <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-600 border border-amber-500/30">
                            {generatedReport.aiModel}
                          </span>
                        </div>
                      )}
                      <div className="card p-4">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3">Actions</h3>
                        <button onClick={() => { setGeneratedReport(null); setPdfPreviewUrl(null); setStep(1); }}
                          className="w-full btn-primary text-sm py-2 flex items-center gap-2 justify-center">
                          <Zap className="w-4 h-4" /> Generate New Report
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}

            {activeView === 'reports' && (
              <motion.div key="reports" className="px-4 py-8 sm:p-6"
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">My Reports</h1>
                    <p className="text-gray-600 text-sm mt-1">View and manage all generated reports</p>
                  </div>
                  {selectedIds.length > 0 && (
                    <button onClick={handleBulkDelete} className="btn-danger text-sm py-2 flex items-center gap-2">
                      <Trash2 className="w-4 h-4" /> Delete Selected ({selectedIds.length})
                    </button>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input className="input pl-10" placeholder="Search by claim number or insured name..."
                      value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
                  </div>
                  <select className="input w-auto" value={statusFilter}
                    onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
                    {STATUSES.map(s => <option key={s} value={s}>{s === 'All' ? 'All Status' : s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </div>

                <div className="card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-[#e5e7eb]">
                          <th className="px-4 py-3 text-left w-10">
                            <button
                              onClick={() => setSelectedIds(selectedIds.length === reports.length && reports.length > 0 ? [] : reports.map(r => r.id))}
                              className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-colors cursor-pointer ${
                                selectedIds.length === reports.length && reports.length > 0
                                  ? 'bg-orange-500 border-orange-500'
                                  : selectedIds.length > 0
                                    ? 'bg-orange-200 border-orange-400'
                                    : 'border-gray-300 hover:border-orange-400 bg-white'
                              }`}
                            >
                              {selectedIds.length === reports.length && reports.length > 0 && <Check className="w-3 h-3 text-white" />}
                              {selectedIds.length > 0 && selectedIds.length < reports.length && (
                                <div className="w-2.5 h-0.5 rounded-full bg-orange-500" />
                              )}
                            </button>
                          </th>
                          {['Claim #', 'Insured', 'Date', 'Loss Type', 'Status', 'Actions'].map(h => (
                            <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {reportsLoading ? (
                          [...Array(5)].map((_, i) => <SkeletonRow key={i} />)
                        ) : reports.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-4 py-16 text-center">
                              <FileText className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                              <p className="text-gray-600 font-medium">No reports found</p>
                              <p className="text-gray-600 text-sm mt-1">Generate your first report to get started</p>
                              <button onClick={() => setActiveView('generate')} className="btn-primary text-sm py-2 px-4 mt-4 inline-flex items-center gap-2">
                                <Zap className="w-4 h-4" /> Generate Report
                              </button>
                            </td>
                          </tr>
                        ) : reports.map(r => (
                          <motion.tr key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            className="border-b border-[#e5e7eb] hover:bg-gray-100 transition-colors cursor-pointer"
                            onClick={() => setDetailReport(r)}>
                            <td className="px-4 py-3 w-10" onClick={e => e.stopPropagation()}>
                              <button
                                onClick={() => toggleSelect(r.id)}
                                className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-colors cursor-pointer ${
                                  selectedIds.includes(r.id)
                                    ? 'bg-orange-500 border-orange-500'
                                    : 'border-gray-300 hover:border-orange-400 bg-white'
                                }`}
                              >
                                {selectedIds.includes(r.id) && <Check className="w-3 h-3 text-white" />}
                              </button>
                            </td>
                            <td className="px-4 py-3 text-sm font-mono text-orange-400">{r.claimNumber}</td>
                            <td className="px-4 py-3 text-sm text-gray-900">{r.insuredName}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{r.lossDate ? new Date(r.lossDate).toLocaleDateString() : '—'}</td>
                            <td className="px-4 py-3 text-sm text-gray-700">{r.lossType}</td>
                            <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                              <StatusBadge status={r.status} />
                            </td>
                            <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center gap-1">
                                <button onClick={() => { setGeneratedReport(r); setPdfPreviewUrl(null); setActiveView('generate'); autoPreviewPDF(r); }}
                                  className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors" title="Review &amp; edit">
                                  <ShieldCheck className="w-4 h-4 text-amber-600" />
                                </button>
                                <button onClick={() => setDetailReport(r)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors" title="View">
                                  <Eye className="w-4 h-4 text-gray-600" />
                                </button>
                                <button onClick={() => handleDeleteReport(r.id)} className="p-1.5 hover:bg-red-500/10 rounded-lg transition-colors" title="Delete">
                                  <Trash2 className="w-4 h-4 text-red-400" />
                                </button>
                              </div>
                            </td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-[#e5e7eb]">
                      <p className="text-sm text-gray-600">Page {page} of {totalPages}</p>
                      <div className="flex gap-2">
                        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                          className="btn-secondary text-sm py-1.5 px-3 disabled:opacity-30">Previous</button>
                        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                          className="btn-secondary text-sm py-1.5 px-3 disabled:opacity-30">Next</button>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── BILLING VIEW ── */}
            {activeView === 'billing' && (
              <motion.div key="billing" className="mx-auto max-w-3xl px-4 py-8 sm:p-6"
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                <div className="mb-6">
                  <h1 className="text-2xl font-bold text-gray-900">Usage & Billing</h1>
                  <p className="text-gray-500 text-sm mt-1">Track your report usage and manage your plan</p>
                </div>

                {/* Usage Card */}
                <div className="card p-6 mb-4">
                  <h2 className="text-base font-semibold text-gray-900 mb-4">This Month's Usage</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
                    {[
                      { label: 'Reports Used', value: usedThisMonth, color: 'text-orange-500' },
                      { label: 'Reports Limit', value: tierLimit === -1 ? '∞' : tierLimit, color: 'text-gray-900' },
                      { label: 'Remaining', value: reportsRemaining === -1 ? '∞' : reportsRemaining, color: 'text-green-600' },
                      { label: 'Current Plan', value: tier.charAt(0).toUpperCase() + tier.slice(1), color: 'text-blue-600' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="p-4 rounded-xl bg-gray-50 border border-gray-100 text-center">
                        <p className={`text-2xl font-bold ${color}`}>{value}</p>
                        <p className="text-xs text-gray-500 mt-1">{label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mb-2 flex justify-between text-xs text-gray-500">
                    <span>Usage</span>
                    <span>{usagePercent}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${usagePercent >= 90 ? 'bg-red-500' : usagePercent >= 70 ? 'bg-yellow-500' : 'bg-orange-500'}`}
                      style={{ width: `${usagePercent}%` }} />
                  </div>
                  {usagePercent >= 80 && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-600">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      You are approaching your monthly limit
                    </p>
                  )}
                </div>

                {/* Current Plan */}
                <div className="card p-6 mb-4">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                      <h2 className="text-base font-semibold text-gray-900">Current Plan</h2>
                      <p className="text-2xl font-bold text-orange-500 mt-1">{tier.charAt(0).toUpperCase() + tier.slice(1)}</p>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {tierLimit === -1 ? 'Unlimited reports per month' : `${tierLimit} report${tierLimit !== 1 ? 's' : ''} per month`}
                      </p>
                    </div>
                    {billingLoading ? (
                      <div className="skeleton h-12 w-36" />
                    ) : billingInfo ? (
                      <div className="text-right">
                        <p className="text-xs text-gray-500 mb-1">Subscription Status</p>
                        <span className={`text-sm font-semibold px-3 py-1.5 rounded-full border ${
                          billingInfo.status === 'active' ? 'bg-green-50 text-green-600 border-green-200' :
                          billingInfo.status === 'cancelling' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                          'bg-gray-100 text-gray-600 border-gray-200'
                        }`}>{billingInfo.status === 'cancelling' ? 'Cancels at period end' : billingInfo.status || 'Active'}</span>
                        {billingInfo.currentPeriodEnd && (
                          <p className="text-xs text-gray-400 mt-1.5">
                            {billingInfo.cancelAtPeriodEnd ? 'Ends' : 'Renews'} {new Date(billingInfo.currentPeriodEnd).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="text-right">
                        <span className="text-sm font-semibold px-3 py-1.5 rounded-full border bg-gray-50 text-gray-500 border-gray-200">Free Plan</span>
                      </div>
                    )}
                  </div>
                  {tier !== 'enterprise' && (
                    <button onClick={() => navigate('/pricing')}
                      className="mt-4 btn-primary text-sm py-2 px-4 flex items-center gap-2">
                      <Star className="w-4 h-4" /> {tier === 'starter' ? 'Upgrade Plan' : 'Change Plan'}
                    </button>
                  )}
                </div>

                {/* Billing History */}
                <div className="card p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base font-semibold text-gray-900">Billing History</h2>
                    {!billingLoading && invoices.length > 0 && (
                      <span className="text-xs text-gray-500">{invoices.length} invoice{invoices.length !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                  {billingLoading ? (
                    <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-12 w-full rounded-xl" />)}</div>
                  ) : invoices.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-100">
                            {['Date', 'Description', 'Amount', 'Status', 'Invoice'].map(h => (
                              <th key={h} className="pb-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider pr-4">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {invoices.map(inv => (
                            <tr key={inv.id} className="border-b border-gray-50 last:border-0">
                              <td className="py-3 pr-4 text-sm text-gray-700 whitespace-nowrap">
                                {new Date(inv.date).toLocaleDateString()}
                              </td>
                              <td className="py-3 pr-4 text-sm text-gray-600 max-w-[180px] truncate">
                                {inv.description || 'Subscription'}
                              </td>
                              <td className="py-3 pr-4 text-sm font-semibold text-gray-900 whitespace-nowrap">
                                ${inv.amount.toFixed(2)} <span className="text-xs font-normal text-gray-400">{inv.currency}</span>
                              </td>
                              <td className="py-3 pr-4">
                                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${
                                  inv.status === 'paid' ? 'bg-green-50 text-green-600 border-green-200' :
                                  inv.status === 'open' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                                  'bg-gray-100 text-gray-500 border-gray-200'
                                }`}>
                                  {inv.status === 'paid' && <Check className="w-3 h-3" />}
                                  {formatStatus(inv.status)}
                                </span>
                              </td>
                              <td className="py-3">
                                {inv.pdf ? (
                                  <a href={inv.pdf} target="_blank" rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-xs text-orange-500 hover:text-orange-600 font-medium">
                                    <Download className="w-3.5 h-3.5" /> PDF
                                  </a>
                                ) : (
                                  <span className="text-xs text-gray-300">—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <CreditCard className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500 text-sm font-medium">No invoices yet</p>
                      <p className="text-gray-400 text-xs mt-1">Invoices will appear here after your first payment</p>
                      {tier === 'starter' && (
                        <button onClick={() => navigate('/pricing')} className="mt-4 btn-secondary text-sm py-2 px-4">
                          View Plans
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      <ReportDetailModal report={detailReport} onClose={() => setDetailReport(null)} />

      <AnimatePresence>
        {confirmTarget && (
          <ConfirmDialog
            title={confirmTarget.type === 'bulk' ? `Delete ${selectedIds.length} reports?` : confirmTarget.type === 'template' ? 'Delete template?' : 'Delete report?'}
            message={confirmTarget.type === 'bulk'
              ? 'This permanently deletes the selected reports, including their photos and exports. This cannot be undone.'
              : confirmTarget.type === 'template'
                ? 'This template will no longer be available to load for future reports.'
                : 'This permanently deletes the report, including its photos and exports. This cannot be undone.'}
            confirmLabel="Delete"
            loading={confirmLoading}
            onConfirm={runConfirmedDelete}
            onClose={() => setConfirmTarget(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
