import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  FileText, Upload, ChevronRight, ChevronLeft, X, Download, RefreshCw,
  Search, Trash2, Eye, Lock, ExternalLink, LineChart, Users,
  Zap, Clock, AlertCircle, CheckCircle, Settings,
  Star, Image as ImageIcon, CreditCard, Check, Save, ShieldCheck,
  Menu, PanelLeftClose, Droplets, Flame, Wind, Hammer, LayoutDashboard,
  LayoutGrid, List, RotateCw, CheckSquare, Square, AlertTriangle, Camera, FolderOpen,
  MoreVertical, Copy, Archive, ArchiveRestore,
  Share2, SlidersHorizontal, ChevronDown, Webhook, Building2, GripVertical
} from 'lucide-react';
import Navbar from '../components/Navbar';
import ReportMarkdown from '../components/ReportMarkdown';
import TierBadge from '../components/TierBadge';
import ConfirmDialog from '../components/ConfirmDialog';
import ClaimLinkSection from '../components/ClaimLinkSection';
import SectionedReportEditor from '../components/SectionedReportEditor';
import ReportReviewChecklist from '../components/ReportReviewChecklist';
import ExportOptionsModal from '../components/ExportOptionsModal';
import TemplatePickerModal from '../components/TemplatePickerModal';
import { PhotoStatusBadge, ReviewStatusDot, effectiveObservation, PhotoAnalysisPanel, QualityWarningBadge } from '../components/PhotoReview.jsx';
import { VEHICLE_PANELS } from '../utils/photoTaxonomy.js';
import PhotoAnnotator from '../components/PhotoAnnotator.jsx';
import useDragReorder from '../hooks/useDragReorder.js';
import { formatStatus } from '../utils/formatStatus';
import { selectPhotosToUpload } from '../utils/uploadQueue';
import useEscapeToClose from '../hooks/useEscapeToClose';
import { useAuth } from '../context/AuthContext';
import { reportsAPI, paymentAPI, crmAPI } from '../services/api';
import api from '../services/api';

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value || '').trim());

const LOSS_TYPES = ['Water Damage', 'Fire', 'Wind', 'Hail', 'Mold', 'Vandalism', 'Flood', 'Theft', 'Other'];
const REPORT_TYPES = ['Initial', 'Supplemental', 'Final', 'Re-Inspection'];
const STATUSES = ['All', 'draft', 'finalized', 'processing', 'failed', 'archived'];

// Phase 5 (Generate Report Wizard Completion) -- kept in sync with the matching
// backend allowlists in backend/routes/reports.js.
const CLAIM_TYPES = ['Property', 'Auto', 'Commercial', 'Liability', 'Other'];
const PROPERTY_TYPES = ['Single-Family Home', 'Multi-Family', 'Condo/Townhouse', 'Commercial', 'Other'];
const INSPECTION_TYPES = ['Interior', 'Exterior', 'Interior & Exterior', 'Virtual/Remote'];
const WEATHER_CONDITIONS = ['Clear/Sunny', 'Partly Cloudy', 'Overcast', 'Rain', 'Snow', 'High Wind', 'Extreme Heat', 'Other'];
const OCCUPANCY_STATUSES = ['Occupied', 'Vacant', 'Under Renovation', 'Unknown'];
const ALLOWED_DOCUMENT_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt'];
const MAX_DOCUMENTS = 10;
const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024; // 10MB -- matches the existing per-photo limit

// Phase 6 (Photo Upload & Per-Photo UX Hardening) -- exact spec'd copy for the
// 100-photo cap, shown both as a toast on overflow and as a persistent notice
// once the limit is reached.
const MAX_PHOTOS = 100;
const MAX_PHOTOS_MESSAGE = 'Maximum of 100 photos reached. Remove a photo to upload another.';

const formatFileSize = (bytes) => {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// SHA-256 content hash for client-side duplicate detection within one staged
// batch -- catches the common case (the same photo dragged in twice, or a
// folder containing accidental copies) before it's ever sent to the server,
// which re-checks the same way as an authoritative backstop (Phase 6).
const hashFile = async (file) => {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
};

// Attempts to decode the file as an image; a corrupt file or a non-image
// disguised with an image extension/mimetype fails to decode (Phase 6's
// "reject corrupt photos individually" requirement, applied client-side for
// immediate feedback -- the backend re-validates by magic bytes regardless).
// Phase 24: also returns the decoded pixel dimensions so the wizard can flag
// a low-resolution photo immediately, without waiting for the upload/
// analysis round-trip -- mirrors backend/utils/photoQuality.js's resolution
// thresholds. Blur detection has no cheap client-side equivalent (it needs
// the same Laplacian-variance pass the backend already does on upload), so
// that half of the quality warning only appears after generation.
const isDecodableImage = async (file) => {
  try {
    const bitmap = await createImageBitmap(file);
    const dims = { width: bitmap.width, height: bitmap.height };
    bitmap.close?.();
    return { decodable: true, ...dims };
  } catch {
    return { decodable: false, width: null, height: null };
  }
};

const CLIENT_MIN_WIDTH = 800;
const CLIENT_MIN_HEIGHT = 600;

// Rotates a staged photo 90° clockwise by redrawing it onto a canvas and
// re-encoding -- this bakes the rotation into the actual uploaded bytes
// (not just a CSS preview transform), so the server and the exported report
// see the photo the way the user oriented it.
const rotateImageFile = async (file) => {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.height;
  canvas.height = bitmap.width;
  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  bitmap.close?.();
  const outType = file.type && file.type.startsWith('image/') ? file.type : 'image/jpeg';
  const blob = await new Promise(resolve => canvas.toBlob(resolve, outType, 0.92));
  return new File([blob], file.name, { type: outType, lastModified: Date.now() });
};

// "Street, City, State Zip" -- matches the format QUICK_DEMOS already uses for
// propertyAddress, so a demo-filled address and a manually-composed one look
// the same in the review step.
const composeAddress = (street, city, state, zip) => {
  const cityStateZip = [[city, state].filter(Boolean).join(', '), zip].filter(Boolean).join(' ');
  return [street, cityStateZip].filter(Boolean).join(', ');
};

// Phase 7: this overlay now only covers the brief, genuinely-synchronous
// upload/report-creation request -- AI analysis and report generation happen
// in the background afterward, shown on the dedicated analysis-progress view
// (activeView === 'analysis') instead of as fake steps in this modal.
const GENERATION_STEPS_WITH_PHOTOS = [
  'Uploading photos...',
  'Creating your report...',
];
const GENERATION_STEPS_NO_PHOTOS = [
  'Validating claim details...',
  'Creating your report...',
];

const FORM_INITIAL = {
  claimNumber: '', insuredName: '', insuredEmail: '', propertyAddress: '', lossDate: '',
  lossType: 'Water Damage', reportType: 'Initial', additionalNotes: '',
  propertyDetails: '', lossDescription: '', damagesObserved: '', recommendations: '',
  // Phase 5 additions -- all optional/additive, see ClaimIdentityFields and Step 2 below.
  policyNumber: '', insuranceCompany: '', insuredFirstName: '', insuredLastName: '',
  claimType: 'Property', propertyType: 'Single-Family Home',
  propertyStreet: '', propertyCity: '', propertyState: '', propertyZip: '',
  inspectionDate: '', inspectionTime: '', inspectorName: '', inspectorId: '',
  inspectionType: 'Interior & Exterior', weatherConditions: '', occupancyStatus: 'Occupied',
  contactPresent: '', contactName: '',
  // Phase 31 (Liability Investigation Report) -- optional, only meaningful
  // when claimType === 'Liability' (see the conditional fields in
  // ClaimIdentityFields below).
  claimantName: '', claimantContact: '',
  // Phase 32 (Commercial Property Inspection Report) -- optional, only
  // meaningful when claimType === 'Commercial'.
  propertyManagerName: '', propertyManagerContact: '',
  roofType: '', roofAge: '', tenantSuiteCount: '',
  // Phase 33 (Flood (NFIP) Inspection Report) -- optional, only meaningful
  // when lossType === 'Flood' (see the conditional fields in
  // ClaimIdentityFields below). NFIP policy number reuses `policyNumber`
  // above with a contextual label.
  floodZone: '', lowestFloorElevation: '', baseFloodElevation: '',
  floodEventSource: '', reportedCrest: '',
  // Phase 34 (Theft/Burglary Inspection Report) -- optional, only meaningful
  // when lossType === 'Theft' (see the conditional fields in
  // ClaimIdentityFields below).
  policeIncidentNumber: '', pointsOfEntry: '',
  // Phase 35 (Vehicle/Auto Inspection Report) -- optional, only meaningful
  // when claimType === 'Auto' (see the conditional fields in
  // ClaimIdentityFields and Step 2 below).
  vin: '', vehicleMakeModelYear: '', odometer: '', licensePlate: '', vehicleColor: '',
  // Phase 13 (Real Template Builder) -- set when the wizard is started from a
  // saved template; sent through as-is by the existing
  // `Object.entries(form).forEach(...)` FormData submission in handleGenerate.
  templateId: '',
};

const QUICK_DEMOS = [
  {
    label: 'Water Damage',
    icon: Droplets,
    color: 'blue',
    data: {
      claimNumber: 'CLM-2024-WD-001',
      insuredName: 'John & Mary Smith',
      insuredEmail: 'john.smith@example.com',
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
      insuredEmail: 'robert.chen@example.com',
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
      insuredEmail: 'patricia.johnson@example.com',
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
      insuredEmail: 'marcus.rodriguez@example.com',
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
// Phase 25 (mobile immediate-upload): the current wizard session's photo
// staging draft id, so a refresh mid-wizard can resume already-uploaded photos.
const PHOTO_DRAFT_LS_KEY = 'flacron_photo_draft_id';

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
  processing: 'bg-amber-500/20 text-amber-600 border-amber-500/30',
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

function MetricCard({ icon: Icon, label, value, sub, loading, error }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
        <Icon className="w-4 h-4 text-brand-500 shrink-0" />
      </div>
      {loading ? (
        <div className="skeleton h-7 w-16" />
      ) : error ? (
        <span className="text-sm text-gray-400 italic">Unavailable</span>
      ) : (
        <p className="text-2xl font-bold text-gray-900">{value ?? 0}</p>
      )}
      {sub && !loading && !error && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

// Per-photo gallery for a generated report (Phase 6: Photo Upload & Per-Photo
// UX Hardening; Phase 8: Per-Photo Analysis Review UI). Renders server-
// generated thumbnails fetched via the authenticated photo-proxy endpoints --
// not the wizard's pre-upload client-side blob URLs, which no longer exist
// once a report has been generated. Works for both Phase-6+ reports
// (per-photo `photos` records) and older reports that only have the flat
// `imagePaths`/`imageCount` shape, since the backend's GET /:id/photos
// synthesizes an equivalent (non-reviewable) list for those.
//
// `interactive` (Phase 8) turns on the Edit/Approve/Exclude/Add Note/Restore
// controls and the "Regenerate Report" action; without it, this is the
// original read-only gallery (used nowhere currently, kept for API
// compatibility since every call site now passes `interactive`).
function ReportPhotoGallery({ reportId, interactive = false, onRegenerated, onPhotosChange, claimType }) {
  // Phase 35 (Vehicle/Auto Inspection Report): an Auto claim tags photos by
  // vehicle panel instead of room/area -- same underlying roomOrArea field
  // and set_area action, just a claim-appropriate option list/label.
  const isAutoClaim = claimType === 'Auto';
  const locationOptions = isAutoClaim ? VEHICLE_PANELS : undefined;
  const locationLabel = isAutoClaim ? 'Vehicle Panel' : undefined;
  const [photos, setPhotos] = useState(null); // null = still loading
  const [loadError, setLoadError] = useState(false);
  const [thumbUrls, setThumbUrls] = useState({});
  const [previewId, setPreviewId] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewNaturalSize, setPreviewNaturalSize] = useState(null);
  const [editText, setEditText] = useState('');
  const [noteText, setNoteText] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  // Phase 24: room/area tagging + annotation editor state, keyed the same
  // way editText/noteText already are (reset whenever previewId changes).
  const [areaText, setAreaText] = useState('');
  const [areaSaving, setAreaSaving] = useState(false);
  const [annotatorOpen, setAnnotatorOpen] = useState(false);
  const [annotationsSaving, setAnnotationsSaving] = useState(false);
  const [annotationsError, setAnnotationsError] = useState(null);
  const [reordering, setReordering] = useState(false);

  // Phase 24: persisted drag-to-reorder across the whole gallery. Optimistic
  // (the grid re-sorts immediately); a failed save reverts to the prior
  // order and surfaces a toast rather than leaving the UI silently wrong.
  // Defined here (not further below with the other handlers) because the
  // drag-reorder HOOK below needs a stable reference to it, and hooks can't
  // be called conditionally/after an early return.
  const handleReorder = useCallback(async (nextIds) => {
    setPhotos((prevPhotos) => {
      const byId = new Map((prevPhotos || []).map(p => [p.id, p]));
      const next = nextIds.map((id, i) => ({ ...byId.get(id), position: i }));
      onPhotosChange?.(next);
      return next;
    });
    setReordering(true);
    try {
      await reportsAPI.reorderPhotos(reportId, nextIds);
    } catch (err) {
      // Refetch rather than trying to reconstruct the pre-reorder array from
      // this closure (which may be stale after the optimistic update above).
      try {
        const res = await reportsAPI.getPhotos(reportId);
        const list = res.data.photos || [];
        setPhotos(list);
        onPhotosChange?.(list);
      } catch { /* best-effort revert; the optimistic order stays if this also fails */ }
      toast.error(err.response?.data?.error || 'Could not save the new photo order');
    } finally {
      setReordering(false);
    }
  }, [reportId, onPhotosChange]);

  // Declared before any early return below -- hooks can't be called
  // conditionally, and `photos` may still be null while loading.
  const dragReorder = useDragReorder({
    ids: (photos || []).map(p => p.id),
    onReorder: handleReorder,
    disabled: !interactive,
  });

  useEffect(() => {
    let cancelled = false;
    const createdUrls = [];
    (async () => {
      try {
        const res = await reportsAPI.getPhotos(reportId);
        const list = res.data.photos || [];
        if (cancelled) return;
        setPhotos(list);
        onPhotosChange?.(list);
        await Promise.all(list.filter(p => p.status === 'uploaded').map(async (p) => {
          try {
            const imgRes = await reportsAPI.getPhotoImageBlob(reportId, p.id, 'thumbnail');
            const url = URL.createObjectURL(imgRes.data);
            createdUrls.push(url);
            if (!cancelled) setThumbUrls(prev => ({ ...prev, [p.id]: url }));
          } catch { /* this one photo's image failed to load -- leave a placeholder icon */ }
        }));
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
      createdUrls.forEach(u => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  useEffect(() => {
    if (!previewId) { setPreviewUrl(null); setPreviewNaturalSize(null); return undefined; }
    let cancelled = false;
    let url;
    setPreviewLoading(true);
    setPreviewNaturalSize(null);
    reportsAPI.getPhotoImageBlob(reportId, previewId, 'full')
      .then(res => { if (!cancelled) { url = URL.createObjectURL(res.data); setPreviewUrl(url); } })
      .catch(() => { if (!cancelled) toast.error('Could not load full-size photo'); })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [previewId, reportId]);

  // Seed the edit/note/area buffers from whichever photo was just opened --
  // keyed only on previewId (not on `photos`) so an in-flight review save
  // for THIS photo (which updates `photos`) doesn't clobber unsaved
  // keystrokes; the save handlers below refresh these buffers themselves
  // once a save lands.
  useEffect(() => {
    if (!previewId || !photos) return;
    const p = photos.find(x => x.id === previewId);
    if (p) {
      setEditText(effectiveObservation(p));
      setNoteText(p.review?.note || '');
      setAreaText(p.roomOrArea || '');
    }
    setAnnotatorOpen(false);
    setAnnotationsError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewId]);

  const doReview = async (photoId, action, payload) => {
    setReviewSaving(true);
    try {
      const res = await reportsAPI.updatePhotoReview(reportId, photoId, action, payload);
      const updatedPhoto = res.data.photo;
      // Compute from the closure directly (not the setPhotos updater form) --
      // calling onPhotosChange (a parent setState) from inside an updater
      // function fires during React's render phase and triggers a
      // "Cannot update a component while rendering a different component" warning.
      const next = photos.map(p => (p.id === photoId ? { ...p, ...updatedPhoto } : p));
      setPhotos(next);
      onPhotosChange?.(next);
      if (previewId === photoId) {
        setEditText(effectiveObservation(updatedPhoto));
        setNoteText(updatedPhoto.review?.note || '');
      }
      const messages = { edit: 'Observation updated', approve: 'Photo approved', exclude: 'Photo excluded from report', include: 'Photo restored', note: 'Note saved' };
      toast.success(messages[action] || 'Photo review updated');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not update photo review');
    } finally {
      setReviewSaving(false);
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const res = await reportsAPI.regeneratePhotoReview(reportId);
      toast.success('Report regenerated using your photo review');
      onRegenerated?.(res.data.report);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not regenerate report');
    } finally {
      setRegenerating(false);
    }
  };

  // Phase 24: room/area tagging reuses the same review-action route/pattern
  // as approve/edit/exclude/note above (a new 'set_area' action), just with
  // its own saving flag so typing an area doesn't disable the observation
  // Save Edit button and vice versa.
  const doSetArea = async (photoId, roomOrArea) => {
    setAreaSaving(true);
    try {
      const res = await reportsAPI.updatePhotoReview(reportId, photoId, 'set_area', { roomOrArea });
      const updatedPhoto = res.data.photo;
      const next = photos.map(p => (p.id === photoId ? { ...p, ...updatedPhoto } : p));
      setPhotos(next);
      onPhotosChange?.(next);
      toast.success('Area updated');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not update area');
    } finally {
      setAreaSaving(false);
    }
  };

  // Phase 24: full-list-replace annotation save with optimistic-concurrency
  // protection -- `expectedUpdatedAt` is whatever this photo's own
  // annotations.updatedAt was the last time it was loaded (null if never
  // annotated). A 409 STALE_UPDATE means someone else saved in the
  // meantime; surfaced as an inline error rather than silently overwriting.
  const doSaveAnnotations = async (photoId, shapes) => {
    const current = photos.find(p => p.id === photoId);
    setAnnotationsSaving(true);
    setAnnotationsError(null);
    try {
      const res = await reportsAPI.updatePhotoAnnotations(reportId, photoId, shapes, current?.annotations?.updatedAt ?? null);
      const updatedPhoto = res.data.photo;
      const next = photos.map(p => (p.id === photoId ? { ...p, ...updatedPhoto } : p));
      setPhotos(next);
      onPhotosChange?.(next);
      toast.success('Annotations saved');
      setAnnotatorOpen(false);
    } catch (err) {
      const code = err.response?.data?.code;
      setAnnotationsError(
        code === 'STALE_UPDATE'
          ? 'These annotations changed elsewhere. Close and reopen this photo to reload the latest version.'
          : (err.response?.data?.error || 'Could not save annotations')
      );
    } finally {
      setAnnotationsSaving(false);
    }
  };

  if (loadError) return <p className="text-xs text-gray-400">Photos could not be loaded.</p>;
  if (!photos) {
    return (
      <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
        {[...Array(5)].map((_, i) => <div key={i} className="skeleton aspect-square rounded-lg" />)}
      </div>
    );
  }
  if (photos.length === 0) return <p className="text-xs text-gray-400">No photos on this report.</p>;

  const previewPhoto = photos.find(p => p.id === previewId);
  const reviewablePhotos = photos.filter(p => p.reviewable);
  const reviewedCount = reviewablePhotos.filter(p => (p.review?.status || 'pending') !== 'pending').length;

  return (
    <>
      {interactive && reviewablePhotos.length > 0 && (
        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
          <p className="text-xs text-gray-500">
            {reviewedCount} of {reviewablePhotos.length} photos reviewed
            {reordering && <span className="ml-2 text-gray-400">· Saving order...</span>}
          </p>
          <button onClick={handleRegenerate} disabled={regenerating}
            className="text-xs btn-secondary py-1.5 px-3 flex items-center gap-1.5 disabled:opacity-50">
            <RefreshCw className={`w-3 h-3 ${regenerating ? 'animate-spin' : ''}`} /> Regenerate Report
          </button>
        </div>
      )}
      <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
        {photos.map(p => (
          <div
            key={p.id}
            ref={(node) => dragReorder.registerNode(p.id, node)}
            className={`relative aspect-square rounded-lg overflow-hidden bg-gray-100 transition-shadow ${
              dragReorder.overId === p.id && dragReorder.draggingId && dragReorder.draggingId !== p.id ? 'ring-2 ring-brand-500' : ''
            } ${dragReorder.draggingId === p.id ? 'opacity-50' : ''}`}
          >
            <button type="button" onClick={() => p.status === 'uploaded' && setPreviewId(p.id)}
              className="absolute inset-0 w-full h-full" title={p.fileName}>
              {thumbUrls[p.id] ? (
                <img src={thumbUrls[p.id]} alt={p.fileName} className={`w-full h-full object-cover ${p.review?.status === 'excluded' ? 'opacity-40' : ''}`} />
              ) : (
                <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-5 h-5 text-gray-300" /></div>
              )}
            </button>
            {interactive && photos.length > 1 && (
              <span
                {...dragReorder.getHandleProps(p.id)}
                className="absolute top-1 left-1 p-0.5 rounded bg-black/40 text-white"
                aria-label="Drag to reorder"
                title="Drag to reorder"
              >
                <GripVertical className="w-3 h-3" />
              </span>
            )}
            {p.qualityWarning && (
              <span className="absolute top-1 right-1">
                <QualityWarningBadge qualityWarning qualityReasons={p.qualityReasons} compact />
              </span>
            )}
            {p.status && p.status !== 'uploaded' && (
              <span className="absolute bottom-1 right-1">
                <PhotoStatusBadge status={p.status === 'failed' ? 'corrupt' : p.status} compact />
              </span>
            )}
            {interactive && p.reviewable && p.status === 'uploaded' && (
              <span className="absolute bottom-1 left-1">
                <ReviewStatusDot status={p.review?.status || 'pending'} />
              </span>
            )}
          </div>
        ))}
      </div>
      {previewId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4" role="dialog" aria-modal="true"
          onClick={() => setPreviewId(null)}>
          <div className={`relative w-full max-h-[90vh] overflow-y-auto ${interactive ? 'max-w-4xl' : 'max-w-3xl'}`} onClick={e => e.stopPropagation()}>
            <div className={interactive ? 'grid grid-cols-1 md:grid-cols-2 gap-4' : ''}>
              <div>
                {previewLoading || !previewUrl ? (
                  <div className="w-full h-64 flex items-center justify-center"><RefreshCw className="w-6 h-6 text-white animate-spin" /></div>
                ) : annotatorOpen && previewNaturalSize ? (
                  <div className="bg-bg rounded-xl p-3">
                    <PhotoAnnotator
                      imageUrl={previewUrl}
                      imageWidth={previewNaturalSize.width}
                      imageHeight={previewNaturalSize.height}
                      initialShapes={previewPhoto?.annotations?.shapes || []}
                      capturedAt={previewPhoto?.capturedAt}
                      readOnly={!interactive}
                      saving={annotationsSaving}
                      saveError={annotationsError}
                      onSave={(shapes) => doSaveAnnotations(previewPhoto.id, shapes)}
                      onClose={() => setAnnotatorOpen(false)}
                    />
                  </div>
                ) : (
                  <img
                    src={previewUrl}
                    alt={previewPhoto?.fileName}
                    onLoad={(e) => setPreviewNaturalSize({ width: e.target.naturalWidth, height: e.target.naturalHeight })}
                    className="w-full h-full max-h-[75vh] object-contain rounded-xl bg-black"
                  />
                )}
              </div>

              {interactive && previewPhoto && !annotatorOpen && (
                <div className="bg-bg rounded-xl p-4 space-y-3 text-left max-h-[75vh] overflow-y-auto">
                  <PhotoAnalysisPanel
                    photo={previewPhoto}
                    canReview
                    reviewSaving={reviewSaving}
                    editText={editText}
                    onEditTextChange={setEditText}
                    noteText={noteText}
                    onNoteTextChange={setNoteText}
                    onReview={doReview}
                    areaValue={areaText}
                    onAreaValueChange={setAreaText}
                    areaSaving={areaSaving}
                    onSaveArea={doSetArea}
                    onOpenAnnotator={() => setAnnotatorOpen(true)}
                    locationOptions={locationOptions}
                    locationLabel={locationLabel}
                  />
                </div>
              )}
            </div>
            <div className="flex items-center justify-between mt-3 text-white">
              <p className="text-sm font-medium truncate">{previewPhoto?.fileName}</p>
              <button onClick={() => setPreviewId(null)} className="btn-secondary text-xs py-1.5 px-3">Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ReportDetailModal({ report, onClose, onReportUpdated }) {
  useEscapeToClose(onClose, !!report);
  const navigate = useNavigate();
  // Incident fix: this "Direct Download" button had no in-flight guard at
  // all, so a double-click fired two overlapping POST /export requests for
  // the same report -- each independently regenerating the full PDF (with
  // every photo re-downloaded from Storage), which is exactly the kind of
  // duplicate load that made exports "repeatedly fail" under normal use.
  const [exportingPdf, setExportingPdf] = useState(false);
  if (!report) return null;
  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}>
        <motion.div className="card w-full max-w-2xl p-6 max-h-[80vh] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="report-detail-title"
          initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h2 id="report-detail-title" className="text-xl font-bold text-gray-900">Report Details</h2>
            <button onClick={onClose} aria-label="Close report details" title="Close" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>
          <div className="space-y-3 text-sm">
            {[
              ['Claim Number', report.claimNumber],
              report.policyNumber && ['Policy Number', report.policyNumber],
              ['Insured', report.insuredName],
              report.insuredEmail && ['Insured Email', report.insuredEmail],
              report.insuranceCompany && ['Insurance Company', report.insuranceCompany],
              ['Property', report.propertyAddress],
              report.claimType && ['Claim Type', report.claimType],
              ['Loss Date', report.lossDate],
              ['Loss Type', report.lossType],
              report.propertyType && ['Property Type', report.propertyType],
              ['Report Type', report.reportType],
              report.inspectorName && ['Inspector', report.inspectorName],
              report.inspectionDate && ['Inspection Date', report.inspectionDate],
              ['Created', new Date(report.createdAt).toLocaleString()],
              // Older reports (pre-Phase-5) simply lack these fields -- the
              // `&&` guards above skip those rows entirely rather than
              // showing a blank/undefined value, so old-shape reports still
              // render cleanly with no crash and no empty-looking rows.
            ].filter(Boolean).map(([label, val]) => (
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
                <span className="text-gray-600 w-32 shrink-0" title="Measures how many required fields and sections are filled in — not the accuracy of the FLACRON ENGINE's findings.">Documentation Completeness:</span>
                <span className="text-brand-700 font-semibold">{report.qualityScore}/100</span>
              </div>
            )}
          </div>
          {report.documents && report.documents.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Supporting Documents</h3>
              <ul className="space-y-1.5">
                {report.documents.map((d, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <button
                      className="text-brand-600 hover:underline truncate text-left"
                      onClick={async () => {
                        try {
                          const res = await reportsAPI.downloadDocument(report.id, d.fileName);
                          const url = window.URL.createObjectURL(new Blob([res.data]));
                          const a = document.createElement('a');
                          a.href = url; a.download = d.fileName; a.click();
                          window.URL.revokeObjectURL(url);
                        } catch { toast.error('Document download failed'); }
                      }}>
                      {d.fileName}
                    </button>
                    <span className="text-xs text-gray-400 shrink-0">{formatFileSize(d.size)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(report.imageCount > 0) && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Photos ({report.imageCount})</h3>
              <ReportPhotoGallery reportId={report.id} interactive onRegenerated={onReportUpdated} claimType={report.claimType} />
            </div>
          )}
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
            <button className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-50"
              disabled={exportingPdf}
              onClick={async () => {
                if (exportingPdf) return;
                setExportingPdf(true);
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
                } catch (err) {
                  // Surface the backend's specific error (e.g. "still being
                  // analyzed", "already exporting", entitlement, generation
                  // failure) instead of a one-size-fits-all message.
                  toast.error(err?.response?.data?.error || 'Export failed');
                } finally {
                  setExportingPdf(false);
                }
              }}>
              {exportingPdf ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {exportingPdf ? 'Exporting…' : 'PDF'}
            </button>
            <button className="btn-secondary text-sm py-2 px-4 flex items-center gap-2"
              onClick={() => navigate(`/reports/${report.id}/preview`)}>
              <ExternalLink className="w-4 h-4" /> Full Preview
            </button>
            <button className="btn-secondary text-sm py-2 px-4" onClick={onClose}>Close</button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function ClaimIdentityFields({ form, setForm, disabled = false }) {
  const setField = (key) => (e) => setForm(p => ({ ...p, [key]: e.target.value }));
  // Insured First/Last Name are additive structured capture (Phase 5): typing
  // into either keeps composing into Insured Name live, but only while
  // Insured Name still exactly matches what First+Last would already produce
  // (or is empty) -- the moment a user types something else directly into
  // Insured Name (a business/trust name, a Quick Demo fill, a linked CRM
  // claim), it has diverged and this stops touching it. Comparing against the
  // *previous* composed value (not just checking "is it empty") is what lets
  // typing First then Last both apply -- an empty-only check would freeze
  // Insured Name at "Jane" the moment First Name alone made it non-empty.
  const setNamePart = (key) => (e) => {
    const value = e.target.value;
    setForm(p => {
      const next = { ...p, [key]: value };
      const prevFirst = p.insuredFirstName || '';
      const prevLast = p.insuredLastName || '';
      const prevComposed = `${prevFirst} ${prevLast}`.trim();
      if (!p.insuredName || p.insuredName === prevComposed) {
        const first = key === 'insuredFirstName' ? value : prevFirst;
        const last = key === 'insuredLastName' ? value : prevLast;
        next.insuredName = `${first} ${last}`.trim();
      }
      return next;
    });
  };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label className="label">Claim Number *</label>
        <input className="input" placeholder="e.g. CLM-2024-001" disabled={disabled}
          value={form.claimNumber} onChange={setField('claimNumber')} />
      </div>
      <div>
        <label className="label">{form.lossType === 'Flood' ? 'NFIP Policy Number' : 'Policy Number'}</label>
        <input className="input" placeholder={form.lossType === 'Flood' ? 'e.g. FL-889213-TX' : 'e.g. POL-4821093'} disabled={disabled}
          value={form.policyNumber || ''} onChange={setField('policyNumber')} />
      </div>
      <div>
        <label className="label">Insured Name *</label>
        <input className="input" placeholder="Full name of insured" disabled={disabled}
          value={form.insuredName} onChange={setField('insuredName')} />
      </div>
      <div>
        <label className="label">Insured Email *</label>
        <input type="email" className={`input ${form.insuredEmail && !isValidEmail(form.insuredEmail) ? 'border-red-400' : ''}`}
          placeholder="claimant@example.com" disabled={disabled}
          value={form.insuredEmail || ''} onChange={setField('insuredEmail')} />
        {form.insuredEmail && !isValidEmail(form.insuredEmail) && (
          <p className="text-xs text-red-500 mt-1">Enter a valid email address</p>
        )}
      </div>
      <div>
        <label className="label">Insurance Company</label>
        <input className="input" placeholder="e.g. State Farm" disabled={disabled}
          value={form.insuranceCompany || ''} onChange={setField('insuranceCompany')} />
      </div>
      <div>
        <label className="label">Insured First Name</label>
        <input className="input" placeholder="First name" disabled={disabled}
          value={form.insuredFirstName || ''} onChange={setNamePart('insuredFirstName')} />
      </div>
      <div>
        <label className="label">Insured Last Name</label>
        <input className="input" placeholder="Last name" disabled={disabled}
          value={form.insuredLastName || ''} onChange={setNamePart('insuredLastName')} />
      </div>
      <div>
        <label className="label">Loss Date *</label>
        <input type="date" className="input" disabled={disabled} value={form.lossDate}
          onChange={setField('lossDate')} />
      </div>
      <div>
        <label className="label">Loss Type *</label>
        <select className="input" disabled={disabled} value={form.lossType} onChange={setField('lossType')}>
          {LOSS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Claim Type</label>
        <select className="input" disabled={disabled} value={form.claimType || 'Property'} onChange={setField('claimType')}>
          {CLAIM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Property Type</label>
        <select className="input" disabled={disabled} value={form.propertyType || 'Single-Family Home'} onChange={setField('propertyType')}>
          {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      {form.claimType === 'Liability' && (
        <>
          <div>
            <label className="label">Claimant Name</label>
            <input className="input" placeholder="Name of the person making the claim" disabled={disabled}
              value={form.claimantName || ''} onChange={setField('claimantName')} />
          </div>
          <div>
            <label className="label">Claimant Contact</label>
            <input className="input" placeholder="Phone or email" disabled={disabled}
              value={form.claimantContact || ''} onChange={setField('claimantContact')} />
          </div>
        </>
      )}
      {form.claimType === 'Commercial' && (
        <>
          <div>
            <label className="label">Property Manager Name</label>
            <input className="input" placeholder="e.g. K. Sullivan, CBRE Property Management" disabled={disabled}
              value={form.propertyManagerName || ''} onChange={setField('propertyManagerName')} />
          </div>
          <div>
            <label className="label">Property Manager Contact</label>
            <input className="input" placeholder="Phone or email" disabled={disabled}
              value={form.propertyManagerContact || ''} onChange={setField('propertyManagerContact')} />
          </div>
          <div>
            <label className="label">Roof Type</label>
            <input className="input" placeholder="e.g. Single-ply TPO membrane" disabled={disabled}
              value={form.roofType || ''} onChange={setField('roofType')} />
          </div>
          <div>
            <label className="label">Roof Age</label>
            <input className="input" placeholder="e.g. 8 years" disabled={disabled}
              value={form.roofAge || ''} onChange={setField('roofAge')} />
          </div>
          <div>
            <label className="label">Number of Tenant Suites</label>
            <input className="input" placeholder="e.g. 6" disabled={disabled}
              value={form.tenantSuiteCount || ''} onChange={setField('tenantSuiteCount')} />
          </div>
        </>
      )}
      {form.lossType === 'Flood' && (
        <>
          <div>
            <label className="label">Flood Zone</label>
            <input className="input" placeholder="e.g. AE" disabled={disabled}
              value={form.floodZone || ''} onChange={setField('floodZone')} />
          </div>
          <div>
            <label className="label">Lowest Floor Elevation</label>
            <input className="input" placeholder="e.g. 512.4 ft" disabled={disabled}
              value={form.lowestFloorElevation || ''} onChange={setField('lowestFloorElevation')} />
          </div>
          <div>
            <label className="label">Base Flood Elevation (BFE)</label>
            <input className="input" placeholder="e.g. 514.0 ft" disabled={disabled}
              value={form.baseFloodElevation || ''} onChange={setField('baseFloodElevation')} />
          </div>
          <div>
            <label className="label">Flood Event Data Source</label>
            <input className="input" placeholder="e.g. NWS river forecast / local gauge report" disabled={disabled}
              value={form.floodEventSource || ''} onChange={setField('floodEventSource')} />
          </div>
          <div>
            <label className="label">Reported Crest</label>
            <input className="input" placeholder="e.g. 3.2 ft above flood stage" disabled={disabled}
              value={form.reportedCrest || ''} onChange={setField('reportedCrest')} />
          </div>
        </>
      )}
      {form.lossType === 'Theft' && (
        <>
          <div>
            <label className="label">Police Incident Number</label>
            <input className="input" placeholder="e.g. CPPD-2024-04417" disabled={disabled}
              value={form.policeIncidentNumber || ''} onChange={setField('policeIncidentNumber')} />
          </div>
          <div>
            <label className="label">Points of Entry Reported</label>
            <input className="input" placeholder="e.g. Rear window, side entry door" disabled={disabled}
              value={form.pointsOfEntry || ''} onChange={setField('pointsOfEntry')} />
          </div>
        </>
      )}
      {form.claimType === 'Auto' && (
        <>
          <div className="sm:col-span-2">
            <label className="label">Vehicle (Year / Make / Model)</label>
            <input className="input" placeholder="e.g. 2021 Toyota RAV4 XLE" disabled={disabled}
              value={form.vehicleMakeModelYear || ''} onChange={setField('vehicleMakeModelYear')} />
          </div>
          <div>
            <label className="label">VIN</label>
            <input className="input" placeholder="e.g. JTMRWRFV1MD012345" disabled={disabled}
              value={form.vin || ''} onChange={setField('vin')} />
          </div>
          <div>
            <label className="label">License Plate</label>
            <input className="input" placeholder="e.g. TX ABC1234" disabled={disabled}
              value={form.licensePlate || ''} onChange={setField('licensePlate')} />
          </div>
          <div>
            <label className="label">Odometer at Inspection</label>
            <input className="input" placeholder="e.g. 31,240 mi" disabled={disabled}
              value={form.odometer || ''} onChange={setField('odometer')} />
          </div>
          <div>
            <label className="label">Vehicle Color</label>
            <input className="input" placeholder="e.g. Magnetic Gray Metallic" disabled={disabled}
              value={form.vehicleColor || ''} onChange={setField('vehicleColor')} />
          </div>
        </>
      )}
    </div>
  );
}

// Phase 12 (My Reports & Claims Management Completion): the row-level "More
// actions" menu (Duplicate/Download/Share/Archive-or-Restore/Delete) shared by
// every row in the My Reports table. Only one instance is ever open at a time,
// controlled by the parent's `openRowMenuId` state.
function RowActionsMenu({
  report, isOpen, onToggle, onClose, onDuplicate, onDownload, onShare,
  onArchive, onRestore, onDelete, duplicating, sharing,
}) {
  const menuRef = useRef(null);
  useEffect(() => {
    if (!isOpen) return undefined;
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onClose]);

  const isArchived = report.status === 'archived';
  const canShare = ['finalized', 'approved', 'completed'].includes(report.status);

  return (
    <div className="relative" ref={menuRef}>
      <button type="button" onClick={onToggle} aria-label="More actions" aria-haspopup="true" aria-expanded={isOpen}
        className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors" title="More actions">
        <MoreVertical className="w-4 h-4 text-gray-600" />
      </button>
      {isOpen && (
        <div className="absolute right-0 z-20 mt-1 w-52 rounded-xl border border-gray-200 bg-bg shadow-lg py-1" role="menu">
          <button type="button" role="menuitem" onClick={onDuplicate} disabled={duplicating}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            <Copy className="w-4 h-4" /> {duplicating ? 'Duplicating…' : 'Duplicate'}
          </button>
          <button type="button" role="menuitem" onClick={onDownload}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
            <Download className="w-4 h-4" /> Download PDF
          </button>
          <button type="button" role="menuitem" onClick={onShare} disabled={!canShare || sharing}
            title={canShare ? '' : 'Finalize this report before sharing'}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
            <Share2 className="w-4 h-4" /> {sharing ? 'Copying link…' : 'Share'}
          </button>
          <div className="my-1 border-t border-gray-100" />
          {isArchived ? (
            <button type="button" role="menuitem" onClick={onRestore}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
              <ArchiveRestore className="w-4 h-4" /> Restore
            </button>
          ) : (
            <button type="button" role="menuitem" onClick={onArchive}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
              <Archive className="w-4 h-4" /> Archive
            </button>
          )}
          <button type="button" role="menuitem" onClick={onDelete}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
            <Trash2 className="w-4 h-4" /> Delete permanently
          </button>
        </div>
      )}
    </div>
  );
}

// Agency/Enterprise claim picker (T-6.16 Phase B): select an existing CRM claim or
// create one inline, instead of free-typing claim details that can drift/duplicate.
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

  // Phase 11: the /reports/:id/preview page's "Edit" action deep-links back
  // here as `?openReport=<id>` instead of duplicating the wizard/editor view --
  // fetch that report directly (not just from the in-memory `reports` list,
  // which may not be loaded yet on a fresh visit) and open it in the generate/
  // review view, same as clicking a row in My Reports.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const openId = params.get('openReport');
    if (!openId) return;
    navigate('/dashboard', { replace: true });
    reportsAPI.getOne(openId)
      .then((res) => {
        const report = res.data?.report || res.data;
        if (report.status === 'processing') {
          setAnalysisData(null);
          setAnalysisReportId(report.id);
          setActiveView('analysis');
        } else {
          setGeneratedReport(report);
          setPdfPreviewUrl(null);
          setActiveView('generate');
          autoPreviewPDF(report);
        }
      })
      .catch(() => toast.error('That report could not be opened.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Phase 21 (Onboarding Flow): the final "Generate Your First Report" CTA
  // deep-links here as `?startWizard=1` -- same clean-URL-then-switch-view
  // shape as `?openReport=` above. `step`/`form`/`generatedReport` are all
  // already at their fresh initial values on this first mount, so switching
  // to the 'generate' view lands directly on the wizard's first step.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('startWizard') !== '1') return;
    navigate('/dashboard', { replace: true });
    setActiveView('generate');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const [activeView, setActiveView] = useState('home');
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(false);
  const [recentReports, setRecentReports] = useState([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentError, setRecentError] = useState(false);
  // Phase 19: reports someone else specifically shared/assigned to this
  // account (direct invite or a supervisor review request) -- never the
  // owner's own report pool.
  const [assignedReports, setAssignedReports] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(FORM_INITIAL);
  // Phase 6: each staged photo is `{ id, file, url, name, size, status, error }`.
  // status: 'checking' (hash/decode validation in flight) | 'ready' |
  // 'corrupt' (failed to decode) | 'duplicate' (same content already staged).
  const [photos, setPhotos] = useState([]);
  const [photoView, setPhotoView] = useState('grid'); // 'grid' | 'list'
  const [selectedPhotoIds, setSelectedPhotoIds] = useState([]);
  const [previewPhotoId, setPreviewPhotoId] = useState(null);
  const photoHashesRef = useRef(new Map()); // id -> content hash, for duplicate detection
  // Phase 25 (mobile immediate-upload): the staging draft this wizard session
  // uploads photos against, created lazily on the first capture/selection.
  const photoDraftIdRef = useRef(null);
  // Phase 24: purely client-side reordering of the staged (not-yet-uploaded)
  // photo list -- there's no report/photoId to persist against yet, so the
  // chosen order here simply becomes each photo's submission order, which
  // is what seeds its `position` field once uploaded (see
  // photoBatchProcessor.js's `startPosition + index`).
  const wizardPhotoReorder = useDragReorder({
    ids: photos.map(p => p.id),
    onReorder: (nextIds) => {
      const byId = new Map(photos.map(p => [p.id, p]));
      setPhotos(nextIds.map(id => byId.get(id)));
    },
  });
  // Agency/Enterprise: link report generation to a real CRM claim instead of free-typing
  // claim details (T-6.16). claimMode only matters for those tiers; Starter/Professional
  // have no CRM access and always see the manual fields.
  const [claimMode, setClaimMode] = useState('linked');
  const [linkedClaim, setLinkedClaim] = useState(null);
  const [linkedClientName, setLinkedClientName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genStep, setGenStep] = useState(0);
  const [uploadPercent, setUploadPercent] = useState(0); // Phase 6 addendum: real byte-progress of the upload request
  const [genSteps, setGenSteps] = useState(GENERATION_STEPS_WITH_PHOTOS);
  const [generatedReport, setGeneratedReport] = useState(null);
  // Incident fix: guards the "Download {format}" quick buttons (and
  // handleExport itself) against a double-click firing two overlapping
  // export requests for the same report+format -- holds the in-flight
  // format string (e.g. 'pdf') or null.
  const [exportingFormat, setExportingFormat] = useState(null);
  // Phase 7 (Async Photo Analysis Pipeline) -- the report currently being
  // watched on the analysis-progress view, and its last-polled status.
  const [analysisReportId, setAnalysisReportId] = useState(null);
  const [analysisData, setAnalysisData] = useState(null);
  const [analysisLoadError, setAnalysisLoadError] = useState(false);
  const [retryingAnalysis, setRetryingAnalysis] = useState(false);
  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmTarget, setConfirmTarget] = useState(null); // { type: 'report'|'bulk'|'template'|'archive'|'archive-bulk', id }
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  // Phase 12 (My Reports & Claims Management Completion): advanced filters,
  // collapsed by default so the list keeps its existing simple look until asked for.
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [lossTypeFilter, setLossTypeFilter] = useState('');
  const [reportTypeFilter, setReportTypeFilter] = useState('');
  const [creatorFilter, setCreatorFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [claimNumberFilter, setClaimNumberFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [crmClientOptions, setCrmClientOptions] = useState([]);
  const [openRowMenuId, setOpenRowMenuId] = useState(null);
  const [duplicatingId, setDuplicatingId] = useState(null);
  const [sharingRowId, setSharingRowId] = useState(null);
  const [detailReport, setDetailReport] = useState(null);
  const [billingInfo, setBillingInfo] = useState(null);
  const [billingError, setBillingError] = useState(false);
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
  // Phase 13 (Real Template Builder) -- the full structural template picker,
  // distinct from the legacy field-only "My Templates" quick-load above.
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [signatureName, setSignatureName] = useState('');
  const [signatureTitle, setSignatureTitle] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseState, setLicenseState] = useState('');
  const [company, setCompany] = useState('');
  const [confirmReview, setConfirmReview] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [reviewPhotos, setReviewPhotos] = useState(null); // Phase 10: kept in sync with ReportPhotoGallery's live per-photo review state
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const fileInputRef = useRef();
  const cameraInputRef = useRef(); // Phase 6 addendum: dedicated "Take Photo" input (capture=environment)
  const docInputRef = useRef();
  const autoSaveRef = useRef();

  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) { try { setForm(JSON.parse(saved)); } catch {} }

    // Phase 25 (mobile immediate-upload): resume any photos already uploaded
    // to Storage before a refresh/navigation-away interrupted the wizard.
    const savedDraftId = localStorage.getItem(PHOTO_DRAFT_LS_KEY);
    if (!savedDraftId) return;
    photoDraftIdRef.current = savedDraftId;
    reportsAPI.getStagedPhotos(savedDraftId).then(async (res) => {
      const uploadedRecords = (res.data?.photos || []).filter((r) => r.status === 'uploaded');
      if (uploadedRecords.length === 0) return;
      const restored = await Promise.all(uploadedRecords.map(async (r) => {
        let url = '';
        try {
          const imgRes = await reportsAPI.getStagedPhotoImageBlob(savedDraftId, r.id, 'thumbnail');
          url = URL.createObjectURL(imgRes.data);
        } catch { /* thumbnail unavailable -- photo still counts toward the upload total */ }
        return {
          id: r.id, file: null, url, name: r.fileName, size: r.size, status: 'ready', error: null,
          uploaded: true, uploading: false, uploadError: null, serverPhotoId: r.id,
          qualityWarning: r.qualityWarning, qualityReasons: r.qualityReasons || [],
        };
      }));
      setPhotos((prev) => (prev.length === 0 ? restored : prev));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    autoSaveRef.current = setInterval(() => {
      localStorage.setItem(LS_KEY, JSON.stringify(form));
      setLastSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }, 30000);
    return () => clearInterval(autoSaveRef.current);
  }, [form]);

  // Explicit "Save Draft" control (Phase 5) alongside the existing silent
  // autosave above -- same localStorage mechanism, just user-triggered with
  // visible confirmation. Only claim/inspection text fields are saved; photos
  // and documents are File objects that can't be persisted to localStorage,
  // same pre-existing limitation the silent autosave already had for photos.
  const handleSaveDraft = () => {
    localStorage.setItem(LS_KEY, JSON.stringify(form));
    setLastSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    toast.success('Draft saved');
  };

  // Property Street/City/State/Zip are additive structured capture (Phase 5):
  // mirrors ClaimIdentityFields' name-part fix above -- keeps composing into
  // Property Address as each part is typed (not just once, then frozen) by
  // comparing against the *previous* composed value rather than only
  // checking "is it empty", while still never overwriting a Quick Demo /
  // linked CRM claim / manually-typed address.
  const handleAddressPartChange = (key) => (e) => {
    const value = e.target.value;
    setForm(p => {
      const next = { ...p, [key]: value };
      const prevStreet = p.propertyStreet || '';
      const prevCity = p.propertyCity || '';
      const prevState = p.propertyState || '';
      const prevZip = p.propertyZip || '';
      const prevComposed = composeAddress(prevStreet, prevCity, prevState, prevZip);
      if (!p.propertyAddress || p.propertyAddress === prevComposed) {
        const street = key === 'propertyStreet' ? value : prevStreet;
        const city = key === 'propertyCity' ? value : prevCity;
        const state = key === 'propertyState' ? value : prevState;
        const zip = key === 'propertyZip' ? value : prevZip;
        next.propertyAddress = composeAddress(street, city, state, zip);
      }
      return next;
    });
  };

  // Supporting-document upload (Phase 5) -- validated client-side (extension +
  // size) before being staged; same all-at-once-with-the-report submission
  // model photos already use (no standalone pre-generate upload endpoint).
  const handleDocumentAdd = (files) => {
    const incoming = Array.from(files);
    const valid = [];
    for (const f of incoming) {
      const ext = '.' + (f.name.split('.').pop() || '').toLowerCase();
      if (!ALLOWED_DOCUMENT_EXTENSIONS.includes(ext)) {
        toast.error(`${f.name}: unsupported file type (PDF, DOC, DOCX, or TXT only)`);
        continue;
      }
      if (f.size > MAX_DOCUMENT_SIZE) {
        toast.error(`${f.name}: exceeds 10MB limit`);
        continue;
      }
      valid.push(f);
    }
    if (valid.length === 0) return;
    if (documents.length + valid.length > MAX_DOCUMENTS) {
      toast.error(`Maximum ${MAX_DOCUMENTS} documents allowed`);
      return;
    }
    setDocuments(prev => [...prev, ...valid.map(f => ({ file: f, name: f.name, size: f.size, status: 'ready' }))]);
  };

  const handleDocumentDrop = (e) => {
    e.preventDefault();
    handleDocumentAdd(e.dataTransfer.files);
  };

  const removeDocument = (idx) => {
    setDocuments(prev => { const next = [...prev]; next.splice(idx, 1); return next; });
  };

  const fetchReports = useCallback(async () => {
    setReportsLoading(true);
    setReportsError(false);
    try {
      const params = { page, limit: 10 };
      if (search) params.search = search;
      if (statusFilter !== 'All') params.status = statusFilter;
      if (lossTypeFilter) params.lossType = lossTypeFilter;
      if (reportTypeFilter) params.reportType = reportTypeFilter;
      if (creatorFilter) params.creator = creatorFilter;
      if (clientFilter) params.clientId = clientFilter;
      if (claimNumberFilter) params.claimNumber = claimNumberFilter;
      if (dateFrom) params.startDate = dateFrom;
      if (dateTo) params.endDate = dateTo;
      const res = await reportsAPI.getAll(params);
      setReports(res.data.data || res.data.reports || res.data || []);
      setTotalPages(res.data.totalPages || Math.ceil((res.data.total || 0) / 10) || 1);
    } catch {
      setReportsError(true);
      toast.error('Failed to load reports');
    } finally {
      setReportsLoading(false);
    }
  }, [page, search, statusFilter, lossTypeFilter, reportTypeFilter, creatorFilter, clientFilter, claimNumberFilter, dateFrom, dateTo]);

  // Home-view data is deliberately fetched separately from the "My Reports" tab's
  // own state (search/filter/pagination/bulk-select) -- the home widget only ever
  // needs a small, fixed "5 most recent" slice, not the full paginated table.
  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(false);
    try {
      const res = await reportsAPI.getDashboardSummary();
      setSummary(res.data.summary);
    } catch {
      setSummaryError(true);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  const fetchRecentReports = useCallback(async () => {
    setRecentLoading(true);
    setRecentError(false);
    try {
      const res = await reportsAPI.getAll({ limit: 5, page: 1 });
      setRecentReports(res.data.data || res.data.reports || res.data || []);
    } catch {
      setRecentError(true);
    } finally {
      setRecentLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeView === 'home') {
      fetchSummary();
      fetchRecentReports();
      // Best-effort, silent on failure -- this is a nice-to-have surface,
      // not core dashboard functionality.
      reportsAPI.getAssignedToMe().then((res) => setAssignedReports(res.data?.reports || [])).catch(() => {});
    }
    if (activeView === 'reports') fetchReports();
    if (activeView === 'billing') fetchBilling();
  }, [activeView, fetchReports, fetchSummary, fetchRecentReports]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeView]);

  // Phase 12: the "Organization" filter is only meaningful for Agency/Enterprise
  // accounts that actually use CRM clients -- fetched once, lazily, the first
  // time My Reports is opened by a tier that could plausibly have any.
  useEffect(() => {
    if (activeView !== 'reports' || !['agency', 'enterprise'].includes(tier) || crmClientOptions.length) return;
    crmAPI.getClients({ limit: 100 })
      .then(res => {
        const list = res.data?.data ?? res.data?.clients ?? [];
        setCrmClientOptions(Array.isArray(list) ? list : []);
      })
      .catch(() => setCrmClientOptions([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, tier]);

  // Phase 7 (Async Photo Analysis Pipeline): poll the analysis-status endpoint
  // while watching a report that's still being analyzed/generated in the
  // background. This is what lets a user navigate away (My Reports, another
  // tab, closing the browser entirely) and come back later to accurate,
  // resumed progress -- the pipeline itself keeps running server-side
  // regardless of whether anything is polling it. Stops automatically once
  // the pipeline reaches a terminal state (draft = succeeded).
  useEffect(() => {
    if (activeView !== 'analysis' || !analysisReportId) return undefined;
    let cancelled = false;
    setAnalysisLoadError(false);

    const poll = async () => {
      try {
        const res = await reportsAPI.getAnalysisStatus(analysisReportId);
        if (cancelled) return;
        setAnalysisData(res.data);
        if (res.data.reportStatus === 'draft') {
          const reportRes = await reportsAPI.getOne(analysisReportId);
          if (cancelled) return;
          const report = reportRes.data.report || reportRes.data;
          setGeneratedReport(report);
          setReports(prev => [report, ...prev.filter(r => r.id !== analysisReportId)]);
          setActiveView('generate');
          setAnalysisReportId(null);
          toast.success('Report generated successfully!');
          refreshProfile();
          autoPreviewPDF(report);
        }
      } catch {
        if (!cancelled) setAnalysisLoadError(true);
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, analysisReportId]);

  const ensurePhotoDraftId = () => {
    if (!photoDraftIdRef.current) {
      const id = crypto.randomUUID();
      photoDraftIdRef.current = id;
      localStorage.setItem(PHOTO_DRAFT_LS_KEY, id);
    }
    return photoDraftIdRef.current;
  };

  // Phase 25 (mobile immediate-upload): uploads one staged photo to the
  // server as soon as it passes client-side validation, instead of waiting
  // for the final Generate submit. Triggered by the effect below, not called
  // directly, so every path that makes a photo eligible (add, retry, rotate)
  // only has to reset its upload flags rather than each re-implementing this.
  const uploadStagedPhoto = useCallback(async (id, file) => {
    const draftId = ensurePhotoDraftId();
    setPhotos(prev => prev.map(p => (p.id === id ? { ...p, uploading: true, uploadError: null } : p)));
    try {
      const res = await reportsAPI.stagePhoto(draftId, file);
      const record = res.data.photo;
      setPhotos(prev => prev.map(p => {
        if (p.id !== id) return p;
        if (record.status === 'uploaded') {
          return { ...p, uploading: false, uploaded: true, serverPhotoId: record.id };
        }
        // Server-side duplicate/corrupt check caught something client-side
        // validation missed (e.g. a resumed draft's hashes aren't in this
        // tab's in-memory cache).
        return {
          ...p, uploading: false, uploaded: false,
          status: record.status === 'duplicate' ? 'duplicate' : 'corrupt',
          error: record.error || p.error,
        };
      }));
    } catch (err) {
      setPhotos(prev => prev.map(p => (p.id === id
        ? { ...p, uploading: false, uploaded: false, uploadError: err.response?.data?.error || 'Upload failed' }
        : p)));
    }
  }, []);

  // Fires uploads for any staged photo that's client-validated ('ready') but
  // hasn't been sent to the server yet -- covers a fresh capture, a rotated
  // photo (re-staged with its new bytes), and a retried upload failure alike.
  // Bounded to MAX_CONCURRENT_UPLOADS at a time (see uploadQueue.js) -- a
  // multi-file selection used to fire one request per photo simultaneously,
  // which put all of them in contention for the same draft document and
  // exhausted the server's transaction retry budget for most of them.
  useEffect(() => {
    selectPhotosToUpload(photos).forEach(p => uploadStagedPhoto(p.id, p.file));
  }, [photos, uploadStagedPhoto]);

  // Runs the async duplicate/corrupt checks for one staged photo and updates
  // its status in place once they resolve. Kept separate from handlePhotoAdd
  // so "Retry Failed Uploads" can re-run it for an already-staged photo.
  const validateStagedPhoto = useCallback(async (id, file) => {
    const { decodable, width, height } = await isDecodableImage(file);
    if (!decodable) {
      setPhotos(prev => prev.map(p => p.id === id
        ? { ...p, status: 'corrupt', error: 'This file could not be read as a valid image.' }
        : p));
      return;
    }
    // Phase 24: an immediate, client-only low-resolution flag (blur can't be
    // cheaply detected client-side -- see isDecodableImage's comment). Never
    // blocks the upload; purely informational, same as the server-side flag
    // it mirrors.
    const lowResolution = width < CLIENT_MIN_WIDTH || height < CLIENT_MIN_HEIGHT;
    let hash;
    try {
      hash = await hashFile(file);
    } catch {
      // Hashing failed (unsupported browser/context) -- skip duplicate
      // detection for this file rather than blocking a decodable photo.
      setPhotos(prev => prev.map(p => (p.id === id ? { ...p, status: 'ready', qualityWarning: lowResolution, qualityReasons: lowResolution ? ['low_resolution'] : [] } : p)));
      return;
    }
    const duplicateOf = [...photoHashesRef.current.entries()].find(([otherId, h]) => otherId !== id && h === hash);
    photoHashesRef.current.set(id, hash);
    if (duplicateOf) {
      setPhotos(prev => prev.map(p => (p.id === id
        ? { ...p, status: 'duplicate', error: `Duplicate of "${prev.find(x => x.id === duplicateOf[0])?.name || 'another photo'}"` }
        : p)));
      return;
    }
    setPhotos(prev => prev.map(p => (p.id === id
      ? { ...p, status: 'ready', qualityWarning: lowResolution, qualityReasons: lowResolution ? ['low_resolution'] : [] }
      : p)));
  }, []);

  const handlePhotoAdd = (files) => {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (arr.length === 0) return;
    if (photos.length >= MAX_PHOTOS) {
      toast.error(MAX_PHOTOS_MESSAGE);
      return;
    }
    if (photos.length + arr.length > MAX_PHOTOS) {
      toast.error(MAX_PHOTOS_MESSAGE);
      return;
    }
    const staged = arr.map(f => ({
      id: crypto.randomUUID(), file: f, url: URL.createObjectURL(f), name: f.name, size: f.size, status: 'checking', error: null,
    }));
    setPhotos(prev => [...prev, ...staged]);
    staged.forEach(p => validateStagedPhoto(p.id, p.file));
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false);
    handlePhotoAdd(e.dataTransfer.files);
  };

  // Best-effort: drop an already-staged photo's server copy. Never blocks the
  // client-side removal on network failure -- an orphaned staged photo just
  // never gets folded into the report at Generate.
  const deleteStagedPhotoIfAny = (target) => {
    if (target?.serverPhotoId && photoDraftIdRef.current) {
      reportsAPI.deleteStagedPhoto(photoDraftIdRef.current, target.serverPhotoId).catch(() => {});
    }
  };

  const removePhoto = (id) => {
    setPhotos(prev => {
      const target = prev.find(p => p.id === id);
      if (target) { URL.revokeObjectURL(target.url); deleteStagedPhotoIfAny(target); }
      return prev.filter(p => p.id !== id);
    });
    photoHashesRef.current.delete(id);
    setSelectedPhotoIds(prev => prev.filter(pid => pid !== id));
  };

  const rotatePhoto = async (id) => {
    const target = photos.find(p => p.id === id);
    if (!target || target.status !== 'ready') return;
    try {
      const rotated = await rotateImageFile(target.file);
      URL.revokeObjectURL(target.url);
      const newUrl = URL.createObjectURL(rotated);
      // The already-staged copy (if any) now holds stale, un-rotated bytes --
      // drop it server-side and let the upload effect re-stage the rotated file.
      deleteStagedPhotoIfAny(target);
      setPhotos(prev => prev.map(p => (p.id === id
        ? { ...p, file: rotated, url: newUrl, size: rotated.size, uploaded: false, uploading: false, uploadError: null, serverPhotoId: null }
        : p)));
      // The hash changes after rotation -- refresh it so later duplicate
      // checks (e.g. a new file added afterward) compare against the rotated bytes.
      try { photoHashesRef.current.set(id, await hashFile(rotated)); } catch { /* non-fatal */ }
    } catch {
      toast.error('Could not rotate this photo');
    }
  };

  const toggleSelectPhoto = (id) => {
    setSelectedPhotoIds(prev => (prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]));
  };
  const selectAllPhotos = () => setSelectedPhotoIds(photos.map(p => p.id));
  const clearPhotoSelection = () => setSelectedPhotoIds([]);
  const removeSelectedPhotos = () => {
    selectedPhotoIds.forEach(id => {
      const target = photos.find(p => p.id === id);
      if (target) { URL.revokeObjectURL(target.url); deleteStagedPhotoIfAny(target); }
      photoHashesRef.current.delete(id);
    });
    setPhotos(prev => prev.filter(p => !selectedPhotoIds.includes(p.id)));
    setSelectedPhotoIds([]);
  };
  const retryFailedPhotos = () => {
    const failedDecode = photos.filter(p => p.status === 'corrupt');
    const failedUpload = photos.filter(p => p.uploadError);
    if (failedDecode.length === 0 && failedUpload.length === 0) return;
    setPhotos(prev => prev.map(p => {
      if (p.status === 'corrupt') return { ...p, status: 'checking', error: null };
      if (p.uploadError) return { ...p, uploadError: null }; // picked up by the upload effect
      return p;
    }));
    failedDecode.forEach(p => validateStagedPhoto(p.id, p.file));
  };

  const previewPhoto = photos.find(p => p.id === previewPhotoId) || null;
  // Corrupt/duplicate photos occupy a slot in the staged list but don't count
  // toward the "at least one photo" requirement -- only successfully
  // validated photos will actually be submitted (Phase 6).
  const readyPhotoCount = photos.filter(p => p.status === 'ready').length;
  // Phase 6 addendum: an explicit breakdown so "X / 100" never silently
  // conflates ready/failed/duplicate photos into one ambiguous number.
  const photoFailedCount = photos.filter(p => p.status === 'corrupt').length;
  const photoDuplicateCount = photos.filter(p => p.status === 'duplicate').length;
  // Phase 25 (mobile immediate-upload): the live "X / 100" counter is driven
  // by actual server-confirmed uploads, not just client-side validation.
  const uploadedPhotoCount = photos.filter(p => p.uploaded).length;
  const uploadingPhotoCount = photos.filter(p => p.uploading).length;
  const uploadFailedCount = photos.filter(p => p.uploadError).length;

  // Selecting/creating a CRM claim fills the display fields from it; the backend
  // re-derives the same fields from the claim record at generate-time regardless,
  // so this is for a consistent preview, not the source of truth.
  const handleSelectClaim = (claim, clientName, clientEmail) => {
    setLinkedClaim(claim);
    setLinkedClientName(clientName || '');
    setForm(p => ({
      ...p,
      claimNumber: claim.claimNumber || '',
      insuredName: clientName || '',
      insuredEmail: clientEmail || p.insuredEmail,
      propertyAddress: claim.propertyAddress || '',
      lossDate: claim.lossDate || '',
      lossType: claim.lossType || p.lossType,
    }));
  };

  const handleClearClaim = () => {
    setLinkedClaim(null);
    setLinkedClientName('');
    setForm(p => ({ ...p, claimNumber: '', insuredName: '', insuredEmail: '', propertyAddress: '', lossDate: '' }));
  };

  const handleGenerate = async () => {
    if (!canGenerate) { toast.error('You have reached your monthly report limit'); return; }
    if (photos.some(p => p.uploading)) { toast.error('Please wait for photo uploads to finish'); return; }
    // Only successfully-validated photos are submitted -- corrupt/duplicate
    // ones stay visible in the wizard for the user to remove or retry, but
    // are never sent (Phase 6).
    const readyPhotos = photos.filter(p => p.status === 'ready');
    const steps = readyPhotos.length > 0 ? GENERATION_STEPS_WITH_PHOTOS : GENERATION_STEPS_NO_PHOTOS;
    setGenSteps(steps);
    setGenerating(true);
    setGenStep(0);
    setUploadPercent(0);
    let stepInterval;
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (linkedClaim) fd.append('claimId', linkedClaim.id || linkedClaim._id);
      // Phase 25 (mobile immediate-upload): photos already staged server-side
      // are folded in by draftId -- only ones that never made it to the
      // server (e.g. a persistent upload failure the user proceeded past
      // anyway) are sent here as a fallback, same as the old all-at-once path.
      if (photoDraftIdRef.current) fd.append('draftId', photoDraftIdRef.current);
      const notYetUploaded = readyPhotos.filter(p => !p.uploaded);
      notYetUploaded.forEach(p => fd.append('images', p.file));
      documents.forEach(d => fd.append('documents', d.file));

      // Phase 6 addendum: real per-photo upload progress, driven by the
      // browser's actual multipart byte-send progress -- not a fake timer.
      // The "Uploading photos..." step stays live until the request body has
      // genuinely finished sending; only then does the existing interval-
      // based step advance take over for the remaining stages, since the
      // backend doesn't yet report granular progress for those (Phase 7).
      const onUploadProgress = (evt) => {
        if (!evt.total) return;
        const percent = Math.round((evt.loaded / evt.total) * 100);
        setUploadPercent(percent);
        if (percent >= 100 && !stepInterval) {
          setGenStep(prev => Math.max(prev, 1));
          stepInterval = setInterval(() => {
            setGenStep(prev => Math.min(prev + 1, steps.length - 1));
          }, 4000);
        }
      };

      // Phase 7: the response now arrives as soon as photos are uploaded and
      // the report shell is created (status: 'processing') -- it does NOT
      // wait for AI analysis/report generation to finish. Hand off to the
      // dedicated analysis-progress view instead of treating this as "done".
      const res = await reportsAPI.generate(fd, onUploadProgress);
      const report = res.data.report || res.data;
      setForm(FORM_INITIAL);
      setActiveTemplate(null);
      photos.forEach(p => URL.revokeObjectURL(p.url));
      setPhotos([]);
      photoHashesRef.current.clear();
      setSelectedPhotoIds([]);
      setDocuments([]);
      setLinkedClaim(null);
      setLinkedClientName('');
      setClaimMode('linked');
      setStep(1);
      photoDraftIdRef.current = null;
      localStorage.removeItem(PHOTO_DRAFT_LS_KEY);
      localStorage.removeItem(LS_KEY);
      setLastSavedAt(null);
      // Prepend to reports list so My Reports shows it right away (as "processing")
      setReports(prev => [report, ...prev]);
      setAnalysisData(null);
      setAnalysisReportId(report.id);
      setActiveView('analysis');
    } catch (err) {
      const data = err.response?.data;
      // Phase 13 (Real Template Builder): surface the template's own
      // required-field validation clearly, instead of the generic fallback
      // below (which never actually matched -- the backend returns `.error`,
      // not `.message`; `.message` is checked first only to preserve any
      // existing caller expecting it).
      if (data?.code === 'TEMPLATE_REQUIRED_FIELD_MISSING') {
        toast.error(data.error || 'This template requires additional fields before generating.');
      } else {
        toast.error(data?.message || data?.error || 'Generation failed');
      }
    } finally {
      clearInterval(stepInterval);
      setGenerating(false);
    }
  };

  // Phase 7: a report still mid-pipeline has no content to show in the normal
  // detail modal -- route into the same analysis-progress view instead,
  // resuming real server-side progress (this is exactly the "navigate away
  // and come back" acceptance criterion, just reached via My Reports instead
  // of staying on the page after Generate).
  const openReport = (r) => {
    if (r.status === 'processing') {
      setAnalysisData(null);
      setAnalysisReportId(r.id);
      setActiveView('analysis');
    } else {
      setDetailReport(r);
    }
  };

  const handleRetryAnalysis = async () => {
    if (!analysisReportId) return;
    setRetryingAnalysis(true);
    try {
      await reportsAPI.retryAnalysis(analysisReportId);
      toast.success('Retrying analysis...');
      setAnalysisData(null);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not start a retry');
    } finally {
      setRetryingAnalysis(false);
    }
  };

  // Phase 8 (Per-Photo Analysis Review UI): a report can be regenerated (its
  // `content` rebuilt from the current photo review state) from either the
  // post-generation view or from My Reports' detail modal -- keep whichever
  // of those is currently showing this same report in sync with the result.
  const handleReportRegenerated = (updatedReport) => {
    setReports(prev => prev.map(r => (r.id === updatedReport.id ? { ...r, ...updatedReport } : r)));
    setDetailReport(prev => (prev && prev.id === updatedReport.id ? { ...prev, ...updatedReport } : prev));
    setGeneratedReport(prev => (prev && prev.id === updatedReport.id ? { ...prev, ...updatedReport } : prev));
    if (generatedReport && generatedReport.id === updatedReport.id) {
      setEditableContent(updatedReport.content);
    }
  };

  // Phase 11: `options` carries the export modal's checkboxes/layout choice --
  // omitted entirely for the quick-download path, which then gets today's
  // existing (unchanged) default export output straight from the backend.
  const handleExport = async (format, options = {}) => {
    if (!generatedReport) return;
    // Re-entrancy guard: the "Customize -> Export" modal already disables
    // its own button while in flight, but the quick "Download {format}"
    // buttons below call this directly with no such protection -- a
    // double-click there used to fire two overlapping export requests for
    // the same report+format.
    if (exportingFormat) return;
    setExportingFormat(format);
    try {
      const exportRes = await reportsAPI.export(generatedReport.id, { format, ...options });
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
    } catch (err) {
      // Surface the backend's specific error/code (still processing,
      // export-in-progress, entitlement, generation failure, etc.) instead
      // of collapsing everything into one generic message.
      toast.error(err?.response?.data?.error || 'Export failed');
      throw err;
    } finally {
      setExportingFormat(null);
    }
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
    setReviewPhotos(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatedReport?.id]);

  const reportReviewed = ['finalized', 'approved', 'completed'].includes(generatedReport?.status);

  const handleSaveContent = async () => {
    if (!generatedReport) return;
    setSavingContent(true);
    try {
      const res = await reportsAPI.update(generatedReport.id, { content: editableContent });
      const updates = res.data?.updates || { content: editableContent };
      setGeneratedReport(prev => ({ ...prev, ...updates }));
      setReports(prev => prev.map(r => (r.id === generatedReport.id ? { ...r, ...updates } : r)));
      if (updates.status === 'draft') {
        toast('Report edited after approval — reopened as draft; re-approval required to export clean.', { icon: '⚠️' });
      } else {
        toast.success('Changes saved');
      }
      handlePreviewPDF();
    } catch { toast.error('Save failed'); }
    finally { setSavingContent(false); }
  };

  // Phase 10: client-side validation gate before the confirmation modal opens --
  // the modal itself is the deliberate final step, not a place to first surface
  // "you forgot a field" errors.
  const handleApproveClick = () => {
    if (!generatedReport) return;
    if (!signatureName.trim() || !licenseNumber.trim() || !licenseState.trim() || !company.trim()) {
      toast.error('Full name, license number, license state, and company/firm are required to approve.');
      return;
    }
    if (!confirmReview) {
      toast.error('You must confirm you have reviewed the report before approving.');
      return;
    }
    setShowApproveModal(true);
  };

  const handleApprove = async () => {
    if (!generatedReport) return;
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
      setShowApproveModal(false);
      handlePreviewPDF();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Approval failed');
      setShowApproveModal(false);
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

  // Phase 13 (Real Template Builder): applies a full structural template
  // (fields + templateId, sent through to POST /generate). Distinct from
  // handleLoadTemplate above, which only ever applied the legacy shallow
  // template's field-only defaults with no server-side structure/validation.
  const handleUseTemplate = (t) => {
    setForm(prev => ({ ...prev, ...t.fields, templateId: t.id }));
    setActiveTemplate(t);
    setShowTemplatePicker(false);
    toast.success(`Using "${t.name}" template`);
  };

  const handleClearTemplate = () => {
    setActiveTemplate(null);
    setForm(prev => ({ ...prev, templateId: '' }));
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

  // Phase 12 (My Reports & Claims Management Completion): Archive is a
  // separate, non-destructive action from permanent Delete -- distinct
  // confirm-dialog copy and a distinct (non-danger) style, per the phase's
  // explicit requirement to keep the two clearly apart.
  const handleArchiveReport = (id) => {
    setConfirmTarget({ type: 'archive', id });
  };

  const handleBulkArchive = () => {
    if (!selectedIds.length) return;
    setConfirmTarget({ type: 'archive-bulk' });
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
      } else if (confirmTarget.type === 'archive') {
        await reportsAPI.delete(confirmTarget.id, false);
        toast.success('Report archived');
        fetchReports();
      } else if (confirmTarget.type === 'archive-bulk') {
        await Promise.all(selectedIds.map(id => reportsAPI.delete(id, false)));
        toast.success(`Archived ${selectedIds.length} reports`);
        setSelectedIds([]);
        fetchReports();
      }
      setConfirmTarget(null);
    } catch {
      toast.error(confirmTarget.type.startsWith('archive') ? 'Archive failed' : 'Delete failed');
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleRestoreReport = async (id) => {
    try {
      await reportsAPI.restore(id);
      toast.success('Report restored');
      fetchReports();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Restore failed');
    }
  };

  // Duplicate is non-destructive (the original is untouched) so it fires
  // immediately without a confirmation step, then opens the new draft right
  // away since that's the natural next thing a reviewer wants to do with it.
  const handleDuplicateReport = async (id) => {
    setDuplicatingId(id);
    try {
      const res = await reportsAPI.duplicate(id);
      const newReport = res.data?.report;
      toast.success('Report duplicated as a new draft');
      fetchReports();
      if (newReport) {
        setGeneratedReport(newReport);
        setPdfPreviewUrl(null);
        // A fresh duplicate's `content` is `null` (no AI generation has run
        // for it yet) -- SectionedReportEditor's `String(content)` would
        // otherwise render the literal text "null" as if it were real content.
        setEditableContent(newReport.content || '');
        setActiveView('generate');
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Duplicate failed');
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleDownloadReport = async (report) => {
    try {
      const exportRes = await reportsAPI.export(report.id, { format: 'pdf' });
      const { filename } = exportRes.data;
      const fileRes = await api.get(`/reports/${report.id}/download?file=${filename}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([fileRes.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      window.URL.revokeObjectURL(url);
      toast.success('Downloaded PDF');
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Download failed');
    }
  };

  const handleShareReport = async (report) => {
    if (!['finalized', 'approved', 'completed'].includes(report.status)) {
      toast.error('Finalize this report before sharing it.');
      return;
    }
    setSharingRowId(report.id);
    try {
      const res = await reportsAPI.share(report.id);
      await navigator.clipboard.writeText(res.data.url);
      toast.success('Share link copied to clipboard');
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not create share link');
    } finally {
      setSharingRowId(null);
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

  // firstName falls back gracefully for accounts created before Phase 3 added
  // structured first/last name fields (they only ever have `displayName`).
  const firstName = userProfile?.firstName || userProfile?.displayName?.split(' ')[0] || 'there';
  const greetingWord = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  const fetchBilling = async () => {
    setBillingLoading(true);
    setBillingError(false);
    try {
      const [subRes, invRes] = await Promise.all([
        paymentAPI.getSubscription(),
        paymentAPI.getInvoices(),
      ]);
      setBillingInfo(subRes.data?.subscription || null);
      setInvoices(invRes.data?.invoices || []);
    } catch (err) {
      console.error('Billing fetch error:', err.message);
      setBillingError(true);
    } finally {
      setBillingLoading(false);
    }
  };

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

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <Navbar />
      <div className="flex flex-1 pt-16 min-h-0">
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
                onClick={() => {
                  setSidebarOpen(false);
                  if (link.href) navigate(link.href);
                  else setActiveView(link.id);
                }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeView === link.id
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
          <div className="mx-3 mt-4 rounded-2xl border border-gray-200 bg-surface shadow-sm md:hidden">
            {/* User row */}
            <div className="flex items-center gap-3 px-4 pt-4 pb-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-amber-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
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
              <div className="rounded-xl bg-bg border border-gray-200 px-3 py-2 text-center shadow-sm">
                <p className="text-lg font-bold text-brand-500 leading-none">{usedThisMonth}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">Used</p>
              </div>
              <div className="rounded-xl bg-bg border border-gray-200 px-3 py-2 text-center shadow-sm">
                <p className="text-lg font-bold text-gray-800 leading-none">
                  {tierLimit === -1 ? '∞' : tierLimit}
                </p>
                <p className="text-[10px] text-gray-500 mt-0.5">Limit</p>
              </div>
              <div className="rounded-xl bg-bg border border-gray-200 px-3 py-2 text-center shadow-sm">
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
                    usagePercent >= 70 ? 'bg-amber-400' : 'bg-brand-500'
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
            {activeView === 'home' && (
              <motion.div key="home" className="mx-auto max-w-6xl px-4 py-8 sm:p-6"
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>

                {/* Greeting + primary CTA */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">{greetingWord}, {firstName}</h1>
                    <p className="text-gray-600 text-sm mt-1">Here's what's happening with your reports.</p>
                  </div>
                  <button onClick={() => setActiveView('generate')} className="btn-primary flex items-center justify-center gap-2 shrink-0">
                    <Zap className="w-4 h-4" /> Generate Report
                  </button>
                </div>

                {/* Metric cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                  <MetricCard icon={FileText} label="Reports This Month"
                    value={usedThisMonth} sub={tierLimit === -1 ? 'Unlimited plan' : `of ${tierLimit} limit`} />
                  <MetricCard icon={ImageIcon} label="Photos Analyzed"
                    value={summary?.photosAnalyzed} loading={summaryLoading} error={summaryError} />
                  <MetricCard icon={Clock} label="Awaiting Review"
                    value={summary?.reportsAwaitingReview} loading={summaryLoading} error={summaryError} />
                  <MetricCard icon={CheckCircle} label="Completed Reports"
                    value={summary?.reportsCompleted} loading={summaryLoading} error={summaryError} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Recent Reports */}
                  <div className="lg:col-span-2">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-lg font-bold text-gray-900">Recent Reports</h2>
                      {recentReports.length > 0 && (
                        <button onClick={() => setActiveView('reports')} className="text-sm font-medium text-brand-500 hover:text-brand-600">
                          View all
                        </button>
                      )}
                    </div>
                    <div className="card overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-gray-200">
                              {['Claim #', 'Insured', 'Report Type', 'Photos', 'Status', 'Updated', 'Created By', 'Actions'].map(h => (
                                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {recentLoading ? (
                              [...Array(5)].map((_, i) => (
                                <tr key={i}>
                                  {[...Array(8)].map((__, j) => (
                                    <td key={j} className="px-4 py-3"><div className="skeleton h-4 w-full" /></td>
                                  ))}
                                </tr>
                              ))
                            ) : recentError ? (
                              <tr>
                                <td colSpan={8} className="px-4 py-12 text-center">
                                  <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                                  <p className="text-gray-600 text-sm font-medium">We couldn't load your reports</p>
                                  <button onClick={fetchRecentReports} className="btn-secondary text-xs py-1.5 px-3 mt-3 inline-flex items-center gap-1.5">
                                    <RefreshCw className="w-3.5 h-3.5" /> Retry
                                  </button>
                                </td>
                              </tr>
                            ) : recentReports.length === 0 ? (
                              <tr>
                                <td colSpan={8} className="px-4 py-12 text-center">
                                  <FileText className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                                  <p className="text-gray-600 text-sm font-medium">No reports yet</p>
                                  <p className="text-gray-500 text-xs mt-1">Generate your first inspection report to get started.</p>
                                  <button onClick={() => setActiveView('generate')} className="btn-primary text-xs py-1.5 px-3 mt-3 inline-flex items-center gap-1.5">
                                    <Zap className="w-3.5 h-3.5" /> Generate Report
                                  </button>
                                </td>
                              </tr>
                            ) : recentReports.map(r => (
                              <tr key={r.id} className="border-b border-gray-200 hover:bg-gray-100 transition-colors cursor-pointer"
                                onClick={() => openReport(r)}>
                                <td className="px-4 py-3 text-sm font-mono text-brand-700 whitespace-nowrap">{r.claimNumber}</td>
                                <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">{r.insuredName}</td>
                                <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{r.reportType || '—'}</td>
                                <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{r.imageCount ?? 0}</td>
                                <td className="px-4 py-3" onClick={e => e.stopPropagation()}><StatusBadge status={r.status} /></td>
                                <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                                  {r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : '—'}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap truncate max-w-[140px]">
                                  {userProfile?.displayName || user?.email || '—'}
                                </td>
                                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                  <button
                                    onClick={() => { setGeneratedReport(r); setPdfPreviewUrl(null); setActiveView('generate'); autoPreviewPDF(r); }}
                                    aria-label="Open report" className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors" title="Open">
                                    <Eye className="w-4 h-4 text-gray-600" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* Phase 19: reports shared/assigned to this account by
                      someone else -- direct invite or a supervisor review
                      request. Only rendered when non-empty (most accounts
                      never touch this feature). */}
                  {assignedReports.length > 0 && (
                    <div>
                      <h2 className="text-lg font-bold text-gray-900 mb-3">Shared With You</h2>
                      <div className="card p-2 space-y-1">
                        {assignedReports.slice(0, 5).map((r) => (
                          <button
                            key={r.id}
                            onClick={() => navigate(`/reports/${r.id}/preview`)}
                            className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-between gap-2"
                          >
                            <span className="min-w-0 truncate text-sm text-gray-800">Claim {r.claimNumber || '—'}</span>
                            <span className="shrink-0 text-xs font-semibold capitalize text-navy-600">
                              {r.reviewRequestStatus === 'pending' ? 'Review requested' : r.myPermission}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* FLACRON ENGINE usage panel */}
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 mb-3">FLACRON ENGINE Usage</h2>
                    <div className="card p-5 space-y-4">
                      <div className="flex items-center gap-2 text-brand-600">
                        <Zap className="w-5 h-5" />
                        <span className="text-sm font-semibold">Powered by FLACRON ENGINE</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Photos processed</span>
                        {summaryLoading ? (
                          <div className="skeleton h-4 w-10" />
                        ) : summaryError ? (
                          <span className="text-gray-400 italic text-xs">Unavailable</span>
                        ) : (
                          <span className="font-semibold text-gray-900">{summary?.photosAnalyzed ?? 0}</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Reports generated this month</span>
                        <span className="font-semibold text-gray-900">{usedThisMonth}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Storage used</span>
                        <span className="font-medium text-gray-400 italic text-xs" title="Storage usage tracking isn't available yet.">
                          Not yet available
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Phase 7 (Async Photo Analysis Pipeline): shown right after Generate
                Report is submitted, while the background pipeline analyzes
                photos and drafts the report. Polling (see the useEffect above)
                transitions away from this view automatically once the report
                reaches 'draft' (success). Navigating away and back (or closing
                the tab) is safe -- the pipeline runs server-side regardless. */}
            {activeView === 'analysis' && (
              <motion.div key="analysis" className="mx-auto max-w-2xl px-4 py-16 sm:p-6 text-center"
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                <div className="relative w-20 h-20 mx-auto mb-6">
                  <div className="absolute inset-0 rounded-full bg-brand-500/20 animate-ping" />
                  <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-brand-500 to-amber-500 flex items-center justify-center shadow-lg shadow-brand-500/30">
                    <Zap className="w-9 h-9 text-white" />
                  </div>
                </div>
                <p className="text-xs font-semibold text-brand-600 uppercase tracking-wider mb-2">Powered by FLACRON ENGINE</p>

                {analysisLoadError && !analysisData && (
                  <>
                    <h1 className="text-xl font-bold text-gray-900 mb-2">Couldn't load analysis progress</h1>
                    <p className="text-gray-600 text-sm mb-6">Check your connection — this will keep retrying automatically.</p>
                  </>
                )}

                {!analysisData && !analysisLoadError && (
                  <>
                    <h1 className="text-xl font-bold text-gray-900 mb-2">Starting analysis...</h1>
                    <div className="skeleton h-3 w-full max-w-sm mx-auto rounded-full" />
                  </>
                )}

                {analysisData && analysisData.reportStatus === 'processing' && (
                  <>
                    <h1 className="text-xl font-bold text-gray-900 mb-2">
                      {analysisData.totalPhotos > 0 && analysisData.analyzed + analysisData.needsAttention + analysisData.failed < analysisData.totalPhotos
                        ? 'FLACRON ENGINE is analyzing your inspection'
                        : 'Drafting your report'}
                    </h1>
                    {analysisData.totalPhotos > 0 && (
                      <>
                        <p className="text-gray-600 text-sm mb-4">
                          {analysisData.analyzed} of {analysisData.totalPhotos} photos analyzed
                          {analysisData.needsAttention > 0 && ` — ${analysisData.needsAttention} need${analysisData.needsAttention === 1 ? 's' : ''} attention`}
                        </p>
                        <div className="h-2 rounded-full bg-gray-200 overflow-hidden max-w-sm mx-auto mb-6">
                          <div className="h-full bg-gradient-to-r from-brand-500 to-amber-500 rounded-full transition-all"
                            style={{ width: `${Math.round(((analysisData.analyzed + analysisData.needsAttention + analysisData.failed) / analysisData.totalPhotos) * 100)}%` }} />
                        </div>
                      </>
                    )}
                    {analysisData.generation?.status === 'analyzing' && (
                      <p className="text-sm text-brand-600 font-medium flex items-center justify-center gap-2 mb-6">
                        <RefreshCw className="w-4 h-4 animate-spin" /> Generating your draft report with FLACRON ENGINE...
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mb-6">You can safely leave this page — analysis continues in the background. Come back anytime to see live progress.</p>
                    <button onClick={() => setActiveView('reports')} className="btn-secondary text-sm py-2 px-4">
                      View My Reports
                    </button>
                  </>
                )}

                {analysisData && analysisData.reportStatus === 'failed' && (
                  <>
                    <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
                      <AlertCircle className="w-7 h-7 text-red-500" />
                    </div>
                    <h1 className="text-xl font-bold text-gray-900 mb-2">Analysis couldn't finish</h1>
                    <p className="text-gray-600 text-sm mb-1">
                      {analysisData.pipelineError || analysisData.generation?.error || 'FLACRON ENGINE was unable to complete this report.'}
                    </p>
                    {analysisData.needsAttention > 0 && (
                      <p className="text-amber-600 text-sm mb-4">{analysisData.needsAttention} photo{analysisData.needsAttention === 1 ? '' : 's'} need attention.</p>
                    )}
                    <div className="flex items-center justify-center gap-3 mt-4">
                      <button onClick={handleRetryAnalysis} disabled={retryingAnalysis}
                        className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-50">
                        {retryingAnalysis ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Retry Analysis
                      </button>
                      <button onClick={() => setActiveView('reports')} className="btn-secondary text-sm py-2 px-4">
                        View My Reports
                      </button>
                    </div>
                  </>
                )}
              </motion.div>
            )}

            {activeView === 'generate' && (
              <motion.div key="generate" className="mx-auto max-w-5xl px-4 py-8 sm:p-6"
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>

                {tier === 'starter' && (
                  <div className="mb-4 px-4 py-3 rounded-xl bg-amber-50 border border-amber-300 flex items-center gap-3">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <p className="text-sm text-amber-800 font-medium">Starter plan reports include a FlacronAI watermark. <button onClick={() => navigate('/pricing')} className="underline font-semibold text-brand-600 hover:text-brand-700">Upgrade</button> to remove.</p>
                  </div>
                )}

                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">Generate Report</h1>
                    <p className="text-gray-600 text-sm mt-1">Automated insurance claim report generation</p>
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
                          <button onClick={() => {
                              if (s > 1 && (!form.insuredName.trim() || !isValidEmail(form.insuredEmail))) {
                                toast.error('Enter the claimant\'s name and a valid email before continuing.');
                                return;
                              }
                              if (s === 5 && readyPhotoCount === 0) {
                                toast.error('Upload at least one photo before continuing.');
                                return;
                              }
                              setStep(s);
                            }}
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                              step >= s ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}>{s}</button>
                          {s < 5 && <div className={`h-0.5 w-8 ${step > s ? 'bg-brand-500' : 'bg-gray-200'}`} />}
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
                                    onClick={() => {
                                      setForm(prev => ({ ...prev, ...demo.data }));
                                      // A demo fills its own claim identity fields -- drop any linked CRM
                                      // claim so it doesn't silently override the demo data at generate-time.
                                      setLinkedClaim(null); setLinkedClientName(''); setClaimMode('manual');
                                      toast.success(`${demo.label} template loaded!`);
                                    }}
                                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-gray-200 hover:border-brand-400 hover:bg-brand-500/5 transition-all text-center group">
                                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-50 text-gray-600 transition-colors group-hover:bg-brand-50 group-hover:text-brand-500">
                                      <demo.icon className="h-5 w-5" aria-hidden="true" />
                                    </span>
                                    <span className="text-xs font-medium text-gray-700 group-hover:text-brand-500">{demo.label}</span>
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

                            {/* Report Templates (Phase 13: Real Template Builder) — full
                                structural templates (sections/required fields/photo layout/
                                branding), distinct from the field-only "My Templates" above. */}
                            <div className="border-t border-gray-100 pt-4">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Start From a Report Template</p>
                                <button onClick={() => navigate('/templates')} className="text-xs text-gray-400 hover:text-brand-600 underline">Manage templates</button>
                              </div>
                              {activeTemplate ? (
                                <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-brand-300 bg-brand-500/5">
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-brand-700 truncate">{activeTemplate.name}</p>
                                    {activeTemplate.requiredFields?.length > 0 && (
                                      <p className="text-[11px] text-gray-500 truncate">Requires: {activeTemplate.requiredFields.join(', ')}</p>
                                    )}
                                  </div>
                                  <button onClick={handleClearTemplate} className="text-xs text-gray-400 hover:text-red-500 shrink-0">Clear</button>
                                </div>
                              ) : (
                                <button onClick={() => setShowTemplatePicker(true)} className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5">
                                  <FolderOpen className="w-3.5 h-3.5" /> Browse Templates
                                </button>
                              )}
                            </div>

                            <div className="border-t border-gray-100 pt-4 space-y-4">
                              {(tier === 'agency' || tier === 'enterprise') ? (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <label className="label mb-0">Claim</label>
                                    {!linkedClaim && (
                                      <button type="button"
                                        onClick={() => setClaimMode(m => (m === 'manual' ? 'linked' : 'manual'))}
                                        className="text-xs text-gray-500 hover:text-brand-600 underline">
                                        {claimMode === 'manual' ? 'Link to a CRM claim instead' : 'Enter details manually instead'}
                                      </button>
                                    )}
                                  </div>
                                  {(claimMode === 'manual' && !linkedClaim) ? (
                                    <ClaimIdentityFields form={form} setForm={setForm} />
                                  ) : (
                                    <ClaimLinkSection linkedClaim={linkedClaim} linkedClientName={linkedClientName}
                                      insuredEmail={form.insuredEmail} onEmailChange={(v) => setForm(p => ({ ...p, insuredEmail: v }))}
                                      onSelect={handleSelectClaim} onClear={handleClearClaim} lossTypes={LOSS_TYPES} />
                                  )}
                                </div>
                              ) : (
                                <ClaimIdentityFields form={form} setForm={setForm} />
                              )}
                              <div>
                                <label className="label">Report Type</label>
                                <select className="input" value={form.reportType}
                                  onChange={e => setForm(p => ({ ...p, reportType: e.target.value }))}>
                                  {REPORT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                              </div>
                            </div>
                          </motion.div>
                        )}

                        {/* ── STEP 2: Property Details ── */}
                        {step === 2 && (
                          <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                            className="space-y-4">
                            <div className="flex items-center justify-between">
                              <h2 className="text-lg font-semibold text-gray-900">{form.claimType === 'Auto' ? 'Vehicle Details' : 'Property Details'}</h2>
                              <span className="text-xs text-gray-500">Step 2 of 5</span>
                            </div>
                            {form.claimType === 'Auto' ? (
                              <>
                                <div>
                                  <label className="label">Vehicle Inspection Location *</label>
                                  <input className="input" placeholder="e.g. ABC Auto Body, 4400 Burnet Rd, Austin, TX 78756" disabled={!!linkedClaim}
                                    value={form.propertyAddress} onChange={e => setForm(p => ({ ...p, propertyAddress: e.target.value }))} />
                                  <p className="text-xs text-gray-400 mt-1">Where the vehicle was inspected — a body shop, insured's address, etc.</p>
                                </div>
                                <div>
                                  <label className="label">Vehicle Condition Notes</label>
                                  <textarea className="input min-h-[120px] resize-y"
                                    placeholder="Describe the vehicle's condition — e.g.: Pre-existing wear on front bumper, prior windshield repair, aftermarket wheels..."
                                    value={form.propertyDetails} onChange={e => setForm(p => ({ ...p, propertyDetails: e.target.value }))} />
                                </div>
                              </>
                            ) : (
                              <>
                                <div>
                                  <label className="label">Property Address *</label>
                                  <input className="input" placeholder="Full street address, city, state, zip" disabled={!!linkedClaim}
                                    value={form.propertyAddress} onChange={e => setForm(p => ({ ...p, propertyAddress: e.target.value }))} />
                                  {linkedClaim && <p className="text-xs text-gray-400 mt-1">Auto-filled from the linked claim — go back to Step 1 to change it.</p>}
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                  <div className="sm:col-span-2">
                                    <label className="label">Street Address <span className="font-normal text-gray-400">(optional)</span></label>
                                    <input className="input" placeholder="e.g. 1425 Maple Street" disabled={!!linkedClaim}
                                      value={form.propertyStreet || ''} onChange={handleAddressPartChange('propertyStreet')} />
                                  </div>
                                  <div>
                                    <label className="label">City <span className="font-normal text-gray-400">(optional)</span></label>
                                    <input className="input" placeholder="e.g. Austin" disabled={!!linkedClaim}
                                      value={form.propertyCity || ''} onChange={handleAddressPartChange('propertyCity')} />
                                  </div>
                                  <div>
                                    <label className="label">State <span className="font-normal text-gray-400">(optional)</span></label>
                                    <input className="input" placeholder="e.g. TX" disabled={!!linkedClaim}
                                      value={form.propertyState || ''} onChange={handleAddressPartChange('propertyState')} />
                                  </div>
                                  <div>
                                    <label className="label">ZIP Code <span className="font-normal text-gray-400">(optional)</span></label>
                                    <input className="input" placeholder="e.g. 78701" disabled={!!linkedClaim}
                                      value={form.propertyZip || ''} onChange={handleAddressPartChange('propertyZip')} />
                                  </div>
                                </div>
                                <p className="text-xs text-gray-400 -mt-2">Fill these in for a structured record — they'll fill Property Address above automatically if it's still empty.</p>
                                <div>
                                  <label className="label">Property Description</label>
                                  <textarea className="input min-h-[160px] resize-y"
                                    placeholder="Describe the property — e.g.: 2-story single-family home, built in 1998, approx 2,200 sq ft. Brick veneer exterior, wood frame. 3 bedrooms, 2.5 bathrooms. Recently renovated kitchen..."
                                    value={form.propertyDetails} onChange={e => setForm(p => ({ ...p, propertyDetails: e.target.value }))} />
                                  <p className="text-xs text-gray-400 mt-1">Include construction type, age, size, number of rooms, and any relevant features</p>
                                </div>
                              </>
                            )}

                            <div className="border-t border-gray-100 pt-4">
                              <h3 className="text-sm font-semibold text-gray-900 mb-1">Inspection Details</h3>
                              <p className="text-xs text-gray-400 mb-3">Optional — details about the site visit itself</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                  <label className="label">Inspection Date</label>
                                  <input type="date" className="input" value={form.inspectionDate || ''}
                                    onChange={e => setForm(p => ({ ...p, inspectionDate: e.target.value }))} />
                                </div>
                                <div>
                                  <label className="label">Inspection Time</label>
                                  <input type="time" className="input" value={form.inspectionTime || ''}
                                    onChange={e => setForm(p => ({ ...p, inspectionTime: e.target.value }))} />
                                </div>
                                <div>
                                  <label className="label">Inspector Name</label>
                                  <input className="input" placeholder="e.g. Jane Doe" value={form.inspectorName || ''}
                                    onChange={e => setForm(p => ({ ...p, inspectorName: e.target.value }))} />
                                </div>
                                <div>
                                  <label className="label">Inspector ID / License #</label>
                                  <input className="input" placeholder="e.g. ADJ-10293" value={form.inspectorId || ''}
                                    onChange={e => setForm(p => ({ ...p, inspectorId: e.target.value }))} />
                                </div>
                                <div>
                                  <label className="label">Inspection Type</label>
                                  <select className="input" value={form.inspectionType || 'Interior & Exterior'}
                                    onChange={e => setForm(p => ({ ...p, inspectionType: e.target.value }))}>
                                    {INSPECTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="label">Weather Conditions</label>
                                  <select className="input" value={form.weatherConditions || ''}
                                    onChange={e => setForm(p => ({ ...p, weatherConditions: e.target.value }))}>
                                    <option value="">Select...</option>
                                    {WEATHER_CONDITIONS.map(t => <option key={t} value={t}>{t}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="label">Occupancy Status</label>
                                  <select className="input" value={form.occupancyStatus || 'Occupied'}
                                    onChange={e => setForm(p => ({ ...p, occupancyStatus: e.target.value }))}>
                                    {OCCUPANCY_STATUSES.map(t => <option key={t} value={t}>{t}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="label">Contact Present During Inspection</label>
                                  <select className="input" value={form.contactPresent || ''}
                                    onChange={e => setForm(p => ({ ...p, contactPresent: e.target.value }))}>
                                    <option value="">Select...</option>
                                    <option value="Yes">Yes</option>
                                    <option value="No">No</option>
                                  </select>
                                </div>
                                {form.contactPresent === 'Yes' && (
                                  <div className="sm:col-span-2">
                                    <label className="label">Contact Name</label>
                                    <input className="input" placeholder="Name of person present" value={form.contactName || ''}
                                      onChange={e => setForm(p => ({ ...p, contactName: e.target.value }))} />
                                  </div>
                                )}
                              </div>
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
                                <h2 className="text-lg font-semibold text-gray-900">Upload Photos & Documents</h2>
                                <p className="text-xs text-gray-500 mt-0.5">Photos required — upload at least one damage photo for analysis</p>
                              </div>
                              <div className="text-right">
                                <span className="text-sm text-gray-500">{uploadedPhotoCount} / {MAX_PHOTOS}</span>
                                {(uploadingPhotoCount > 0 || uploadFailedCount > 0 || photoFailedCount > 0 || photoDuplicateCount > 0) && (
                                  <p className="text-[11px] text-gray-400 mt-0.5">
                                    {uploadingPhotoCount > 0 && `${uploadingPhotoCount} uploading · `}
                                    {uploadedPhotoCount} uploaded
                                    {uploadFailedCount > 0 && ` · ${uploadFailedCount} upload failed`}
                                    {photoFailedCount > 0 && ` · ${photoFailedCount} failed`}
                                    {photoDuplicateCount > 0 && ` · ${photoDuplicateCount} duplicate`}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Mobile/desktop explicit capture choice (Phase 6 addendum) --
                                distinct from the drag-and-drop area below, so a mobile user can
                                deliberately choose the camera vs. an existing photo, per spec. */}
                            <div className="grid grid-cols-2 gap-3 mb-3">
                              <button type="button" disabled={photos.length >= MAX_PHOTOS}
                                onClick={() => { if (photos.length >= MAX_PHOTOS) { toast.error(MAX_PHOTOS_MESSAGE); return; } cameraInputRef.current?.click(); }}
                                className="flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-200 hover:border-brand-400 hover:bg-brand-500/5 text-sm font-medium text-gray-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                                <Camera className="w-4 h-4" /> Take Photo
                              </button>
                              <button type="button" disabled={photos.length >= MAX_PHOTOS}
                                onClick={() => { if (photos.length >= MAX_PHOTOS) { toast.error(MAX_PHOTOS_MESSAGE); return; } fileInputRef.current?.click(); }}
                                className="flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-200 hover:border-brand-400 hover:bg-brand-500/5 text-sm font-medium text-gray-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                                <FolderOpen className="w-4 h-4" /> Choose From Library
                              </button>
                              {/* capture="environment" opens the rear camera directly on mobile
                                  browsers that support it; on desktop it's ignored and behaves
                                  like a normal file picker. Kept as a SEPARATE input from the
                                  library one so the two buttons trigger genuinely distinct pickers. */}
                              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" disabled={photos.length >= MAX_PHOTOS}
                                onChange={e => { handlePhotoAdd(e.target.files); e.target.value = ''; }} />
                            </div>
                            {photos.length > 0 && (
                              <p className="text-xs text-gray-400 -mt-1 mb-3">Tip: tap "Take Photo" again to keep capturing more without leaving this screen.</p>
                            )}

                            <div
                              className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all ${
                                photos.length >= MAX_PHOTOS ? 'opacity-50 cursor-not-allowed border-gray-200' :
                                  dragging ? 'border-brand-500 bg-brand-500/10 cursor-pointer' : 'border-gray-200 hover:border-brand-400 hover:bg-brand-500/5 cursor-pointer'
                              }`}
                              onDragOver={e => { e.preventDefault(); if (photos.length < MAX_PHOTOS) setDragging(true); }}
                              onDragLeave={() => setDragging(false)}
                              onDrop={e => { if (photos.length >= MAX_PHOTOS) { e.preventDefault(); toast.error(MAX_PHOTOS_MESSAGE); return; } handleDrop(e); }}
                              onClick={() => { if (photos.length >= MAX_PHOTOS) { toast.error(MAX_PHOTOS_MESSAGE); return; } fileInputRef.current?.click(); }}>
                              <ImageIcon className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                              <p className="text-gray-700 font-medium">Drag & drop damage photos here</p>
                              <p className="text-gray-500 text-sm mt-1">or click to browse — up to {MAX_PHOTOS} photos, 10MB each</p>
                              <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" disabled={photos.length >= MAX_PHOTOS}
                                onChange={e => { handlePhotoAdd(e.target.files); e.target.value = ''; }} />
                            </div>
                            {photos.length >= MAX_PHOTOS && (
                              <p className="text-xs text-amber-600 mt-2 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {MAX_PHOTOS_MESSAGE}</p>
                            )}

                            {photos.length > 0 && (
                              <div className="flex items-center justify-between gap-2 mt-4 flex-wrap">
                                <div className="flex items-center gap-1.5">
                                  <button type="button" onClick={selectedPhotoIds.length === photos.length ? clearPhotoSelection : selectAllPhotos}
                                    className="text-xs font-medium text-gray-600 hover:text-brand-600 flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                                    {selectedPhotoIds.length === photos.length ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                                    {selectedPhotoIds.length === photos.length ? 'Deselect All' : 'Select All'}
                                  </button>
                                  {selectedPhotoIds.length > 0 && (
                                    <button type="button" onClick={removeSelectedPhotos}
                                      className="text-xs font-medium text-red-600 hover:text-red-700 flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
                                      <Trash2 className="w-3.5 h-3.5" /> Remove Selected ({selectedPhotoIds.length})
                                    </button>
                                  )}
                                  {(photos.some(p => p.status === 'corrupt') || uploadFailedCount > 0) && (
                                    <button type="button" onClick={retryFailedPhotos}
                                      className="text-xs font-medium text-gray-600 hover:text-brand-600 flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                                      <RefreshCw className="w-3.5 h-3.5" /> Retry Failed Uploads
                                    </button>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                                  <button type="button" onClick={() => setPhotoView('grid')} aria-label="Grid view" title="Grid view"
                                    className={`p-1.5 rounded-md transition-colors ${photoView === 'grid' ? 'bg-bg shadow-sm text-brand-600' : 'text-gray-500 hover:text-gray-700'}`}>
                                    <LayoutGrid className="w-3.5 h-3.5" />
                                  </button>
                                  <button type="button" onClick={() => setPhotoView('list')} aria-label="List view" title="List view"
                                    className={`p-1.5 rounded-md transition-colors ${photoView === 'list' ? 'bg-bg shadow-sm text-brand-600' : 'text-gray-500 hover:text-gray-700'}`}>
                                    <List className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            )}

                            {photos.length > 0 && photoView === 'grid' && (
                              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mt-3">
                                {photos.map(p => (
                                  <div key={p.id}
                                    ref={(node) => wizardPhotoReorder.registerNode(p.id, node)}
                                    className={`relative group aspect-square rounded-lg overflow-hidden border-2 transition-shadow ${
                                    selectedPhotoIds.includes(p.id) ? 'border-brand-500' : 'border-transparent'} ${
                                    wizardPhotoReorder.overId === p.id && wizardPhotoReorder.draggingId && wizardPhotoReorder.draggingId !== p.id ? 'ring-2 ring-brand-500' : ''} ${
                                    wizardPhotoReorder.draggingId === p.id ? 'opacity-50' : ''}`}>
                                    <button type="button" onClick={() => p.status !== 'checking' && setPreviewPhotoId(p.id)}
                                      className="w-full h-full block" aria-label={`Preview ${p.name}`} title="Click to preview">
                                      <img src={p.url} alt={p.name} className={`w-full h-full object-cover ${p.status === 'corrupt' ? 'opacity-40' : ''}`} />
                                    </button>
                                    <div className="absolute top-1 left-1 flex items-center gap-1">
                                      {photos.length > 1 && (
                                        <span {...wizardPhotoReorder.getHandleProps(p.id)} aria-label={`Drag to reorder ${p.name}`} title="Drag to reorder"
                                          className="w-5 h-5 rounded bg-black/50 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                          <GripVertical className="w-3.5 h-3.5" />
                                        </span>
                                      )}
                                      <button onClick={() => toggleSelectPhoto(p.id)} aria-label={`Select ${p.name}`} title="Select"
                                        className="w-5 h-5 rounded bg-black/50 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                        {selectedPhotoIds.includes(p.id) ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                                      </button>
                                    </div>
                                    <button onClick={() => removePhoto(p.id)} aria-label={`Remove photo ${p.name}`} title="Remove photo"
                                      className="absolute top-1 right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                      <X className="w-3 h-3 text-white" />
                                    </button>
                                    {p.status === 'ready' && (
                                      <button onClick={() => rotatePhoto(p.id)} aria-label={`Rotate ${p.name}`} title="Rotate 90°"
                                        className="absolute bottom-1 left-1 w-5 h-5 bg-black/50 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                        <RotateCw className="w-3 h-3" />
                                      </button>
                                    )}
                                    <div className="absolute bottom-1 right-1 flex items-center gap-1">
                                      {p.uploading && <RefreshCw className="w-3 h-3 text-white animate-spin" title="Uploading…" />}
                                      {p.uploadError && <AlertTriangle className="w-3 h-3 text-red-400" title={p.uploadError} />}
                                      <QualityWarningBadge qualityWarning={p.qualityWarning} qualityReasons={p.qualityReasons} compact />
                                      <PhotoStatusBadge status={p.status} compact />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {photos.length > 0 && photoView === 'list' && (
                              <ul className="mt-3 space-y-1.5">
                                {photos.map(p => (
                                  <li key={p.id}
                                    ref={(node) => wizardPhotoReorder.registerNode(p.id, node)}
                                    className={`flex items-center gap-3 p-2 rounded-xl border bg-gray-50 transition-shadow ${
                                    wizardPhotoReorder.overId === p.id && wizardPhotoReorder.draggingId && wizardPhotoReorder.draggingId !== p.id ? 'border-brand-500 ring-2 ring-brand-500' : 'border-gray-100'} ${
                                    wizardPhotoReorder.draggingId === p.id ? 'opacity-50' : ''}`}>
                                    {photos.length > 1 && (
                                      <span {...wizardPhotoReorder.getHandleProps(p.id)} aria-label={`Drag to reorder ${p.name}`} title="Drag to reorder"
                                        className="shrink-0 text-gray-400 hover:text-brand-600">
                                        <GripVertical className="w-4 h-4" />
                                      </span>
                                    )}
                                    <button onClick={() => toggleSelectPhoto(p.id)} aria-label={`Select ${p.name}`} title="Select" className="shrink-0 text-gray-400 hover:text-brand-600">
                                      {selectedPhotoIds.includes(p.id) ? <CheckSquare className="w-4 h-4 text-brand-600" /> : <Square className="w-4 h-4" />}
                                    </button>
                                    <button type="button" onClick={() => p.status !== 'checking' && setPreviewPhotoId(p.id)} title="Click to preview" className="shrink-0">
                                      <img src={p.url} alt={p.name} className={`w-10 h-10 rounded-lg object-cover ${p.status === 'corrupt' ? 'opacity-40' : ''}`} />
                                    </button>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                                      <p className="text-xs text-gray-500">
                                        {formatFileSize(p.size)}
                                        {p.uploading && ' — uploading…'}
                                        {p.uploadError && ` — ${p.uploadError}`}
                                        {p.error ? ` — ${p.error}` : ''}
                                      </p>
                                    </div>
                                    {p.uploading && <RefreshCw className="w-3.5 h-3.5 text-gray-400 animate-spin shrink-0" title="Uploading…" />}
                                    <QualityWarningBadge qualityWarning={p.qualityWarning} qualityReasons={p.qualityReasons} />
                                    <PhotoStatusBadge status={p.status} />
                                    {p.status === 'ready' && (
                                      <button onClick={() => rotatePhoto(p.id)} aria-label={`Rotate ${p.name}`} title="Rotate 90°"
                                        className="w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:text-brand-600 hover:bg-brand-50 shrink-0 transition-colors">
                                        <RotateCw className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                    <button onClick={() => removePhoto(p.id)} aria-label={`Remove ${p.name}`} title="Remove photo"
                                      className="w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 shrink-0 transition-colors">
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}

                            {readyPhotoCount === 0 && (
                              <p className="text-xs text-red-400 mt-2">At least one photo is required to continue</p>
                            )}

                            {previewPhoto && (
                              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4" role="dialog" aria-modal="true"
                                onClick={() => setPreviewPhotoId(null)}>
                                <div className="relative max-w-3xl max-h-[85vh] w-full" onClick={e => e.stopPropagation()}>
                                  <img src={previewPhoto.url} alt={previewPhoto.name} className="w-full h-full max-h-[75vh] object-contain rounded-xl bg-black" />
                                  <div className="flex items-center justify-between mt-3 text-white">
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium truncate">{previewPhoto.name}</p>
                                      <p className="text-xs text-gray-300">{formatFileSize(previewPhoto.size)}</p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      {previewPhoto.status === 'ready' && (
                                        <button onClick={() => rotatePhoto(previewPhoto.id)} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5">
                                          <RotateCw className="w-3.5 h-3.5" /> Rotate
                                        </button>
                                      )}
                                      <button onClick={() => setPreviewPhotoId(null)} className="btn-secondary text-xs py-1.5 px-3">Close</button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}

                            <div className="mt-8 pt-6 border-t border-gray-100">
                              <div className="flex items-center justify-between mb-3">
                                <div>
                                  <h3 className="text-sm font-semibold text-gray-900">Supporting Documents <span className="font-normal text-gray-400">(optional)</span></h3>
                                  <p className="text-xs text-gray-500 mt-0.5">Policy documents, estimates, prior reports — PDF, Word, or plain text</p>
                                </div>
                                <span className="text-sm text-gray-500">{documents.length} / {MAX_DOCUMENTS}</span>
                              </div>
                              <div
                                className="border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer border-gray-200 hover:border-brand-400 hover:bg-brand-500/5"
                                onDragOver={e => e.preventDefault()}
                                onDrop={handleDocumentDrop}
                                onClick={() => docInputRef.current?.click()}>
                                <FileText className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                                <p className="text-gray-700 text-sm font-medium">Drag & drop documents here</p>
                                <p className="text-gray-500 text-xs mt-1">or click to browse — PDF, DOC, DOCX, or TXT, up to 10MB each</p>
                                <input ref={docInputRef} type="file" multiple accept=".pdf,.doc,.docx,.txt" className="hidden"
                                  onChange={e => handleDocumentAdd(e.target.files)} />
                              </div>
                              {documents.length > 0 && (
                                <ul className="mt-3 space-y-2">
                                  {documents.map((d, i) => (
                                    <li key={i} className="flex items-center gap-3 p-2.5 rounded-xl border border-gray-100 bg-gray-50">
                                      <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                                      <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-gray-900 truncate">{d.name}</p>
                                        <p className="text-xs text-gray-500">{formatFileSize(d.size)}</p>
                                      </div>
                                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 border border-green-500/20 shrink-0">Ready</span>
                                      <button onClick={() => removeDocument(i)} aria-label={`Remove ${d.name}`} title="Remove document"
                                        className="w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 shrink-0 transition-colors">
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
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
                                ['Policy Number', form.policyNumber || 'Not provided', Boolean(form.policyNumber)],
                                ['Insured Name', form.insuredName],
                                ['Insured Email', form.insuredEmail],
                                ['Insurance Company', form.insuranceCompany || 'Not provided', Boolean(form.insuranceCompany)],
                                ['Property Address', form.propertyAddress],
                                ['Claim Type', form.claimType || 'Property'],
                                ['Loss Date', form.lossDate],
                                ['Loss Type', form.lossType],
                                ['Property Type', form.propertyType || 'Single-Family Home'],
                                ['Report Type', form.reportType],
                                ['Inspector', form.inspectorName || 'Not provided', Boolean(form.inspectorName)],
                                ['Inspection Date', form.inspectionDate || 'Not provided', Boolean(form.inspectionDate)],
                                ['Photos', photos.length > readyPhotoCount
                                  ? `${readyPhotoCount} ready (${photos.length - readyPhotoCount} excluded)`
                                  : `${readyPhotoCount} uploaded`],
                                ['Documents', `${documents.length} attached`],
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
                            <button onClick={handleGenerate} disabled={!canGenerate || generating || !form.claimNumber || !form.insuredName.trim() || !isValidEmail(form.insuredEmail)}
                              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed py-3 text-base">
                              <Zap className="w-5 h-5" /> Generate Report
                            </button>
                            {(!form.claimNumber || !form.insuredName.trim() || !isValidEmail(form.insuredEmail)) && (
                              <p className="text-xs text-red-400 mt-2 text-center">Claim Number, Insured Name, and a valid Insured Email are required</p>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <div className="flex items-center justify-between mt-6 mb-2">
                        <button type="button" onClick={handleSaveDraft}
                          className="text-xs font-medium text-gray-500 hover:text-brand-600 flex items-center gap-1.5 transition-colors">
                          <Save className="w-3.5 h-3.5" /> Save Draft
                        </button>
                        <span className="text-xs text-gray-400">
                          {lastSavedAt ? `Saved ${lastSavedAt}` : 'Claim & inspection fields are auto-saved as you go'}
                        </span>
                      </div>

                      <div className="flex justify-between">
                        <button onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1}
                          className="btn-secondary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-30">
                          <ChevronLeft className="w-4 h-4" /> Back
                        </button>
                        {step < 5 && (
                          <button onClick={() => setStep(s => Math.min(5, s + 1))}
                            disabled={(step === 1 && (!form.insuredName.trim() || !isValidEmail(form.insuredEmail))) || (step === 4 && readyPhotoCount === 0)}
                            className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed">
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
                        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-brand-500/20 flex items-center justify-center">
                          <Zap className="w-8 h-8 text-brand-400 animate-pulse" />
                        </div>
                        <h2 className="text-xl font-bold text-gray-900 mb-2">Generating Your Report</h2>
                        <p className="text-gray-600 text-sm mb-6">Please wait while the FLACRON ENGINE processes your claim...</p>
                        <div className="space-y-3">
                          {genSteps.map((s, i) => (
                            <div key={i}>
                              <div className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                                i < genStep ? 'bg-green-500/10 text-green-400' :
                                i === genStep ? 'bg-brand-500/10 text-brand-400' :
                                'bg-gray-100 text-gray-500'
                              }`}>
                                {i < genStep ? <CheckCircle className="w-4 h-4 shrink-0" /> :
                                 i === genStep ? <RefreshCw className="w-4 h-4 shrink-0 animate-spin" /> :
                                 <Clock className="w-4 h-4 shrink-0" />}
                                <span className="text-sm font-medium">{s}</span>
                              </div>
                              {/* Phase 6 addendum: real per-photo upload progress, driven by
                                  actual bytes sent -- not a fake timer. Only shown during the
                                  live "Uploading photos..." step. */}
                              {i === 0 && i === genStep && readyPhotoCount > 0 && (
                                <div className="px-3 pb-1 pt-1">
                                  <div className="flex items-center justify-between text-[11px] text-gray-500 mb-1">
                                    <span>Photo {Math.min(readyPhotoCount, Math.max(1, Math.ceil((uploadPercent / 100) * readyPhotoCount)))} of {readyPhotoCount}</span>
                                    <span>{uploadPercent}%</span>
                                  </div>
                                  <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
                                    <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${uploadPercent}%` }} />
                                  </div>
                                </div>
                              )}
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
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-brand-500" />
                            <h2 className="text-sm font-semibold text-gray-900">PDF Preview</h2>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            {generatedReport.qualityScore && (
                              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-green-500/20 text-green-400 border border-green-500/30"
                                title="Documentation Completeness: measures how many required fields and sections are filled in — not the accuracy of the FLACRON ENGINE's findings.">
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
                                aria-label="Close PDF preview" title="Close PDF preview"
                                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                                <X className="w-4 h-4 text-gray-500" />
                              </button>
                            )}
                          </div>
                        </div>

                        {previewing && !pdfPreviewUrl && (
                          <div className="flex flex-col items-center justify-center py-16 gap-3 bg-gray-50 rounded-xl border border-gray-200">
                            <RefreshCw className="w-8 h-8 text-brand-500 animate-spin" />
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
                            <p className="text-xs text-gray-500 mt-0.5">Automatically generated draft — review and edit any section, then approve to finalize.</p>
                          </div>
                          <button onClick={handleSaveContent} disabled={savingContent || editableContent === generatedReport.content}
                            className="text-xs btn-secondary py-1.5 px-3 flex items-center gap-1.5 disabled:opacity-50 shrink-0">
                            {savingContent ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save Changes
                          </button>
                        </div>
                        <SectionedReportEditor reportId={generatedReport.id} value={editableContent} onChange={setEditableContent} disabled={savingContent} />
                      </div>

                      {/* Phase 8 (Per-Photo Analysis Review UI) -- edit/approve/exclude/note
                          each photo's AI observation, then regenerate the report to reflect it. */}
                      {generatedReport.imageCount > 0 && (
                        <div className="card p-4">
                          <h2 className="text-sm font-semibold text-gray-900 mb-1">Photo Review</h2>
                          <p className="text-xs text-gray-500 mb-3">Edit, approve, or exclude each photo&apos;s FLACRON ENGINE observation, then regenerate the report to use your changes.</p>
                          <ReportPhotoGallery reportId={generatedReport.id} interactive onRegenerated={handleReportRegenerated} onPhotosChange={setReviewPhotos} claimType={generatedReport.claimType} />
                        </div>
                      )}
                    </div>

                    <div className="space-y-4">
                      {/* Pre-approval review checklist (Phase 10) */}
                      <div className="card p-4">
                        <ReportReviewChecklist report={generatedReport} photos={generatedReport.imageCount > 0 ? reviewPhotos : []} />
                      </div>
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
                            <p className="text-xs text-amber-800 mb-3">Unreviewed draft. Exports are watermarked <strong>DRAFT</strong> until a licensed adjuster reviews and approves it.</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
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
                              <span>I confirm that I have reviewed this report, made any necessary corrections, and approve this version for final export. I understand that automatically generated content must be independently verified.</span>
                            </label>
                            <button onClick={handleApproveClick} disabled={approving}
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
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold text-gray-700">Export Options</h3>
                          <button onClick={() => setShowExportModal(true)}
                            className="text-xs font-semibold text-brand-600 hover:text-brand-700">Customize…</button>
                        </div>
                        <div className="space-y-2">
                          {['pdf', 'docx', 'html'].map(fmt => {
                            const allowed = allowedExports.includes(fmt);
                            return allowed ? (
                              <button key={fmt} onClick={() => handleExport(fmt)}
                                disabled={!!exportingFormat}
                                className="w-full btn-secondary text-sm py-2 flex items-center gap-2 justify-center disabled:opacity-50">
                                {exportingFormat === fmt
                                  ? <RefreshCw className="w-4 h-4 animate-spin" />
                                  : <Download className="w-4 h-4" />}
                                {exportingFormat === fmt ? 'Exporting…' : `Download ${fmt.toUpperCase()}`}
                              </button>
                            ) : (
                              <button key={fmt} onClick={() => navigate('/pricing')}
                                className="w-full text-sm py-2 flex items-center gap-2 justify-center border border-dashed border-gray-200 rounded-lg text-gray-400 hover:border-brand-300 hover:text-brand-500 transition-colors">
                                <Lock className="w-3.5 h-3.5" /> {fmt.toUpperCase()} — Upgrade
                              </button>
                            );
                          })}
                        </div>
                        {tier === 'starter' && (
                          <p className="text-[10px] text-gray-400 mt-2 text-center">DOCX & HTML require Professional+</p>
                        )}
                      </div>
                      <div className="card p-4">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3">Actions</h3>
                        <button onClick={() => navigate(`/reports/${generatedReport.id}/preview`)}
                          className="w-full btn-secondary text-sm py-2 flex items-center gap-2 justify-center mb-2">
                          <Eye className="w-4 h-4" /> Open Full Preview
                        </button>
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
                    <div className="flex items-center gap-2">
                      <button onClick={handleBulkArchive} className="btn-secondary text-sm py-2 flex items-center gap-2">
                        <Archive className="w-4 h-4" /> Archive Selected ({selectedIds.length})
                      </button>
                      <button onClick={handleBulkDelete} className="btn-danger text-sm py-2 flex items-center gap-2">
                        <Trash2 className="w-4 h-4" /> Delete Selected ({selectedIds.length})
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-3 mb-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input className="input pl-10" placeholder="Search by claim number or insured name..."
                      value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
                  </div>
                  <select className="input w-auto" value={statusFilter}
                    onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
                    {STATUSES.map(s => <option key={s} value={s}>{s === 'All' ? 'All Status' : s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                  <button type="button" onClick={() => setShowMoreFilters(v => !v)}
                    className="btn-secondary text-sm py-2 px-3 flex items-center gap-2 shrink-0">
                    <SlidersHorizontal className="w-4 h-4" /> Filters
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showMoreFilters ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {/* Phase 12: report type / creator / date range / organization / claim
                    number -- collapsed by default so the list keeps its existing simple
                    look until a reviewer actually needs the extra filters. */}
                {showMoreFilters && (
                  <div className="card p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Claim #</label>
                      <input className="input" placeholder="e.g. CLM-2024-001" value={claimNumberFilter}
                        onChange={e => { setClaimNumberFilter(e.target.value); setPage(1); }} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Loss Type</label>
                      <select className="input" value={lossTypeFilter} onChange={e => { setLossTypeFilter(e.target.value); setPage(1); }}>
                        <option value="">All Loss Types</option>
                        {LOSS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Report Type</label>
                      <select className="input" value={reportTypeFilter} onChange={e => { setReportTypeFilter(e.target.value); setPage(1); }}>
                        <option value="">All Report Types</option>
                        {REPORT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Creator</label>
                      <input className="input" placeholder="Creator email" value={creatorFilter}
                        onChange={e => { setCreatorFilter(e.target.value); setPage(1); }} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Created From</label>
                      <input type="date" className="input" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Created To</label>
                      <input type="date" className="input" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} />
                    </div>
                    {['agency', 'enterprise'].includes(tier) && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Organization</label>
                        <select className="input" value={clientFilter} onChange={e => { setClientFilter(e.target.value); setPage(1); }}>
                          <option value="">All Organizations</option>
                          {crmClientOptions.map(c => <option key={c.id || c._id} value={c.id || c._id}>{c.name}</option>)}
                        </select>
                      </div>
                    )}
                    <div className="flex items-end">
                      <button type="button" onClick={() => {
                        setClaimNumberFilter(''); setLossTypeFilter(''); setReportTypeFilter('');
                        setCreatorFilter(''); setDateFrom(''); setDateTo(''); setClientFilter(''); setPage(1);
                      }} className="text-sm text-gray-500 hover:text-gray-700 underline">
                        Clear filters
                      </button>
                    </div>
                  </div>
                )}

                <div className="card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="px-4 py-3 text-left w-10">
                            <button
                              onClick={() => setSelectedIds(selectedIds.length === reports.length && reports.length > 0 ? [] : reports.map(r => r.id))}
                              className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-colors cursor-pointer ${
                                selectedIds.length === reports.length && reports.length > 0
                                  ? 'bg-brand-500 border-brand-500'
                                  : selectedIds.length > 0
                                    ? 'bg-brand-200 border-brand-400'
                                    : 'border-gray-300 hover:border-brand-400 bg-bg'
                              }`}
                            >
                              {selectedIds.length === reports.length && reports.length > 0 && <Check className="w-3 h-3 text-white" />}
                              {selectedIds.length > 0 && selectedIds.length < reports.length && (
                                <div className="w-2.5 h-0.5 rounded-full bg-brand-500" />
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
                        ) : reportsError ? (
                          <tr>
                            <td colSpan={7} className="px-4 py-16 text-center">
                              <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
                              <p className="text-gray-600 font-medium">We couldn't load your reports</p>
                              <p className="text-gray-600 text-sm mt-1">Check your connection and try again.</p>
                              <button onClick={fetchReports} className="btn-secondary text-sm py-2 px-4 mt-4 inline-flex items-center gap-2">
                                <RefreshCw className="w-4 h-4" /> Retry
                              </button>
                            </td>
                          </tr>
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
                            className="border-b border-gray-200 hover:bg-gray-100 transition-colors cursor-pointer"
                            onClick={() => openReport(r)}>
                            <td className="px-4 py-3 w-10" onClick={e => e.stopPropagation()}>
                              <button
                                onClick={() => toggleSelect(r.id)}
                                className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-colors cursor-pointer ${
                                  selectedIds.includes(r.id)
                                    ? 'bg-brand-500 border-brand-500'
                                    : 'border-gray-300 hover:border-brand-400 bg-bg'
                                }`}
                              >
                                {selectedIds.includes(r.id) && <Check className="w-3 h-3 text-white" />}
                              </button>
                            </td>
                            <td className="px-4 py-3 text-sm font-mono text-brand-700">{r.claimNumber}</td>
                            <td className="px-4 py-3 text-sm text-gray-900">{r.insuredName}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{r.lossDate ? new Date(r.lossDate).toLocaleDateString() : '—'}</td>
                            <td className="px-4 py-3 text-sm text-gray-700">{r.lossType}</td>
                            <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                              <StatusBadge status={r.status} />
                            </td>
                            <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center gap-1">
                                {r.status === 'processing' ? (
                                  <button onClick={() => openReport(r)} aria-label="View analysis progress" className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors" title="View progress">
                                    <RefreshCw className="w-4 h-4 text-brand-600" />
                                  </button>
                                ) : (
                                  <>
                                    <button onClick={() => { setGeneratedReport(r); setPdfPreviewUrl(null); setActiveView('generate'); autoPreviewPDF(r); }}
                                      aria-label="Review and edit report" className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors" title="Review &amp; edit">
                                      <ShieldCheck className="w-4 h-4 text-amber-600" />
                                    </button>
                                    <button onClick={() => setDetailReport(r)} aria-label="View report details" className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors" title="View">
                                      <Eye className="w-4 h-4 text-gray-600" />
                                    </button>
                                    <button onClick={() => navigate(`/reports/${r.id}/preview`)} aria-label="Open full preview" className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors" title="Full preview">
                                      <ExternalLink className="w-4 h-4 text-gray-600" />
                                    </button>
                                  </>
                                )}
                                <RowActionsMenu
                                  report={r}
                                  isOpen={openRowMenuId === r.id}
                                  onToggle={() => setOpenRowMenuId(prev => (prev === r.id ? null : r.id))}
                                  onClose={() => setOpenRowMenuId(null)}
                                  duplicating={duplicatingId === r.id}
                                  sharing={sharingRowId === r.id}
                                  onDuplicate={() => { setOpenRowMenuId(null); handleDuplicateReport(r.id); }}
                                  onDownload={() => { setOpenRowMenuId(null); handleDownloadReport(r); }}
                                  onShare={() => { setOpenRowMenuId(null); handleShareReport(r); }}
                                  onArchive={() => { setOpenRowMenuId(null); handleArchiveReport(r.id); }}
                                  onRestore={() => { setOpenRowMenuId(null); handleRestoreReport(r.id); }}
                                  onDelete={() => { setOpenRowMenuId(null); handleDeleteReport(r.id); }}
                                />
                              </div>
                            </td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
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
                      { label: 'Reports Used', value: usedThisMonth, color: 'text-brand-500' },
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
                    <div className={`h-full rounded-full transition-all ${usagePercent >= 90 ? 'bg-red-500' : usagePercent >= 70 ? 'bg-amber-500' : 'bg-brand-500'}`}
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
                      <p className="text-2xl font-bold text-brand-500 mt-1">{tier.charAt(0).toUpperCase() + tier.slice(1)}</p>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {tierLimit === -1 ? 'Unlimited reports per month' : `${tierLimit} report${tierLimit !== 1 ? 's' : ''} per month`}
                      </p>
                    </div>
                    {billingLoading ? (
                      <div className="skeleton h-12 w-36" />
                    ) : billingError ? (
                      <div className="text-right">
                        <span className="text-sm font-semibold px-3 py-1.5 rounded-full border bg-amber-50 text-amber-600 border-amber-200">Status unavailable</span>
                        <button onClick={fetchBilling} className="block ml-auto mt-1.5 text-xs text-brand-500 hover:text-brand-600 font-medium">Retry</button>
                      </div>
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
                  ) : billingError ? (
                    <div className="text-center py-8">
                      <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
                      <p className="text-gray-500 text-sm font-medium">We couldn't load your billing history</p>
                      <p className="text-gray-400 text-xs mt-1">Check your connection and try again.</p>
                      <button onClick={fetchBilling} className="mt-4 btn-secondary text-sm py-2 px-4 inline-flex items-center gap-2">
                        <RefreshCw className="w-4 h-4" /> Retry
                      </button>
                    </div>
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
                                    className="inline-flex items-center gap-1 text-xs text-brand-500 hover:text-brand-600 font-medium">
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

          {/* Reserves scroll room below the fixed mobile nav-toggle FAB (bottom-5 h-12)
              so it never rests permanently over the last block of real content. */}
          <div className="h-20 md:hidden" aria-hidden="true" />
        </main>
      </div>

      <ReportDetailModal report={detailReport} onClose={() => setDetailReport(null)} onReportUpdated={handleReportRegenerated} />

      <AnimatePresence>
        {confirmTarget && (
          <ConfirmDialog
            title={
              confirmTarget.type === 'bulk' ? `Delete ${selectedIds.length} reports?`
                : confirmTarget.type === 'archive-bulk' ? `Archive ${selectedIds.length} reports?`
                : confirmTarget.type === 'archive' ? 'Archive this report?'
                : confirmTarget.type === 'template' ? 'Delete template?'
                : 'Delete report?'
            }
            message={
              confirmTarget.type === 'bulk'
                ? 'This permanently deletes the selected reports, including their photos and exports. This cannot be undone.'
                : confirmTarget.type === 'archive-bulk'
                  ? 'Archived reports are hidden from the default My Reports view but can be restored at any time. Nothing is deleted.'
                  : confirmTarget.type === 'archive'
                    ? 'This report will be hidden from the default My Reports view but can be restored at any time. Nothing is deleted.'
                    : confirmTarget.type === 'template'
                      ? 'This template will no longer be available to load for future reports.'
                      : 'This permanently deletes the report, including its photos and exports. This cannot be undone.'
            }
            confirmLabel={confirmTarget.type.startsWith('archive') ? 'Archive' : 'Delete'}
            danger={!confirmTarget.type.startsWith('archive')}
            loading={confirmLoading}
            onConfirm={runConfirmedDelete}
            onClose={() => setConfirmTarget(null)}
          />
        )}
      </AnimatePresence>

      {/* Phase 10: deliberate confirmation step before the existing /approve call fires. */}
      <AnimatePresence>
        {showApproveModal && (
          <ConfirmDialog
            title="Approve this report?"
            message={`This finalizes the report as reviewed and approved by ${signatureName.trim() || 'you'}${licenseState.trim() || licenseNumber.trim() ? ` (${[licenseState.trim(), licenseNumber.trim()].filter(Boolean).join(' ')})` : ''}. Exports will no longer carry the DRAFT watermark. Any later edit will reopen the report as a draft and require re-approval.`}
            confirmLabel="Approve & Finalize"
            danger={false}
            loading={approving}
            onConfirm={handleApprove}
            onClose={() => setShowApproveModal(false)}
          />
        )}
      </AnimatePresence>

      {/* Phase 11: export options modal (cover page / captions / page numbers /
          appendix / branding / photo layout), reused by the /reports/:id/preview page. */}
      <AnimatePresence>
        {showExportModal && generatedReport && (
          <ExportOptionsModal
            report={generatedReport}
            allowedExports={allowedExports}
            onExport={handleExport}
            onClose={() => setShowExportModal(false)}
          />
        )}
      </AnimatePresence>

      {/* Phase 13: full structural template picker for the wizard's "Start
          From a Report Template" step. */}
      <AnimatePresence>
        {showTemplatePicker && (
          <TemplatePickerModal
            onSelect={handleUseTemplate}
            onClose={() => setShowTemplatePicker(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
