import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Save, Plus, Trash2, ChevronUp, ChevronDown, RefreshCw,
  Upload, X, AlertCircle, Lock,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import { templatesAPI } from '../services/api';

// Kept in sync with backend/routes/reports.js's own allowlists and
// frontend/src/pages/Dashboard.jsx's wizard constants.
const LOSS_TYPES = ['Water Damage', 'Fire', 'Wind', 'Hail', 'Mold', 'Vandalism', 'Other'];
const REPORT_TYPES = ['Initial', 'Supplemental', 'Final', 'Re-Inspection'];
const CLAIM_TYPES = ['Property', 'Auto', 'Commercial', 'Liability', 'Other'];
const PROPERTY_TYPES = ['Single-Family Home', 'Multi-Family', 'Condo/Townhouse', 'Commercial', 'Other'];
const INSPECTION_TYPES = ['Interior', 'Exterior', 'Interior & Exterior', 'Virtual/Remote'];
const WEATHER_CONDITIONS = ['Clear/Sunny', 'Partly Cloudy', 'Overcast', 'Rain', 'Snow', 'High Wind', 'Extreme Heat', 'Other'];
const OCCUPANCY_STATUSES = ['Occupied', 'Vacant', 'Under Renovation', 'Unknown'];

// Kept in sync with backend/services/templateService.js's
// TEMPLATE_REQUIRABLE_FIELDS -- the subset of wizard fields a template may
// mark as required, on top of the wizard's own always-required baseline
// (claim number/insured name/property address/date of loss/loss type).
const REQUIRABLE_FIELDS = [
  { key: 'policyNumber', label: 'Policy Number' },
  { key: 'insuranceCompany', label: 'Insurance Company' },
  { key: 'propertyDetails', label: 'Property Details' },
  { key: 'lossDescription', label: 'Loss Description' },
  { key: 'damagesObserved', label: 'Damages Observed' },
  { key: 'recommendations', label: 'Recommendations' },
  { key: 'inspectionDate', label: 'Inspection Date' },
  { key: 'inspectorName', label: 'Inspector Name' },
  { key: 'weatherConditions', label: 'Weather Conditions' },
  { key: 'occupancyStatus', label: 'Occupancy Status' },
];

const PHOTO_LAYOUTS = [1, 2, 4];

const FIELDS_INITIAL = {
  lossType: '', reportType: 'Initial', propertyDetails: '', lossDescription: '',
  damagesObserved: '', recommendations: '', additionalNotes: '', claimType: '',
  propertyType: '', inspectionType: '', weatherConditions: '', occupancyStatus: '',
};

const PHOTO_LAYOUT_INITIAL = {
  includeCoverPage: true, includePhotoCaptions: true, includePageNumbers: true,
  includeAppendix: true, includeCompanyBranding: true, photoLayout: 2,
};

const inputCls = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400';
const labelCls = 'block text-xs font-medium text-gray-600 mb-1';

// Phase 13 (Real Template Builder): create/edit builder for /templates/new
// and /templates/:id/edit. Covers the full data model from task 1 (name/
// description/fields/required fields/sections/photo layout/branding) --
// sections reuse Phase 9's title+body shape (plain text here, since a
// template section is a reusable default, not a specific report's rich
// content with real photos yet); photo layout reuses Phase 11's exact option
// set (ExportOptionsModal) so a template's default matches what the export
// modal itself offers.
export default function TemplateBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [readOnly, setReadOnly] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState('personal');
  const [fields, setFields] = useState(FIELDS_INITIAL);
  const [requiredFields, setRequiredFields] = useState([]);
  const [sections, setSections] = useState([]);
  const [photoLayout, setPhotoLayout] = useState(PHOTO_LAYOUT_INITIAL);
  const [companyName, setCompanyName] = useState('');
  const [footerText, setFooterText] = useState('');
  const [logoUrl, setLogoUrl] = useState(null);
  const [logoUploading, setLogoUploading] = useState(false);

  const load = useCallback(() => {
    if (!isEdit) return;
    setLoading(true);
    setLoadError(false);
    templatesAPI.get(id)
      .then((res) => {
        const t = res.data?.template;
        if (!t) { setLoadError(true); return; }
        setName(t.name || '');
        setDescription(t.description || '');
        setScope(t.scope === 'organization' ? 'organization' : 'personal');
        setFields({ ...FIELDS_INITIAL, ...(t.fields || {}) });
        setRequiredFields(t.requiredFields || []);
        setSections((t.sections || []).map((s) => ({ ...s })));
        setPhotoLayout({ ...PHOTO_LAYOUT_INITIAL, ...(t.photoLayout || {}) });
        setCompanyName(t.branding?.companyName || '');
        setFooterText(t.branding?.footerText || '');
        setLogoUrl(t.branding?.logoUrl || null);
        setReadOnly(t.scope === 'flacron');
      })
      .catch((err) => {
        setLoadError(true);
        if (err?.response?.status === 403) toast.error('You do not have permission to edit this template');
      })
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  useEffect(() => { load(); }, [load]);

  const toggleRequiredField = (key) => {
    setRequiredFields((prev) => (prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]));
  };

  const addSection = () => {
    setSections((prev) => [...prev, { title: '', body: '' }]);
  };
  const updateSection = (idx, patch) => {
    setSections((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };
  const removeSection = (idx) => {
    setSections((prev) => prev.filter((_, i) => i !== idx));
  };
  const moveSection = (idx, dir) => {
    setSections((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const togglePhotoOption = (key) => setPhotoLayout((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !isEdit) {
      if (!isEdit) toast.error('Save the template first, then add a logo');
      return;
    }
    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append('logo', file);
      const res = await templatesAPI.uploadLogo(id, fd);
      setLogoUrl(res.data?.template?.branding?.logoUrl || null);
      toast.success('Logo uploaded');
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Logo upload failed');
    } finally {
      setLogoUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    try {
      await templatesAPI.removeLogo(id);
      setLogoUrl(null);
      toast.success('Logo removed');
    } catch {
      toast.error('Could not remove logo');
    }
  };

  const buildPayload = () => ({
    name,
    description,
    scope,
    fields,
    requiredFields,
    sections: sections.filter((s) => s.title.trim()),
    photoLayout,
    branding: { companyName, footerText },
  });

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Template name is required'); return; }
    setSaving(true);
    try {
      if (isEdit) {
        await templatesAPI.update(id, buildPayload());
        toast.success('Template saved');
      } else {
        const res = await templatesAPI.create(buildPayload());
        toast.success('Template created');
        navigate(`/templates/${res.data.template.id}/edit`, { replace: true });
        return;
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save template');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg">
        <Navbar />
        <div className="flex flex-col items-center justify-center py-32 gap-3">
          <RefreshCw className="w-8 h-8 text-brand-500 animate-spin" />
          <p className="text-sm text-gray-500">Loading template…</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-bg">
        <Navbar />
        <div className="flex flex-col items-center justify-center py-32 gap-4 text-center px-4">
          <AlertCircle className="w-10 h-10 text-amber-500" />
          <p className="text-gray-900 font-semibold">Could not load this template</p>
          <Link to="/templates" className="btn-primary text-sm py-2 px-4 flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to Templates
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 pt-24 pb-24">
        <div className="flex items-center gap-3 mb-5">
          <Link to="/templates" aria-label="Back to Templates" className="p-2 hover:bg-gray-100 rounded-lg transition-colors shrink-0">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <h1 className="text-xl font-bold text-gray-900">{isEdit ? 'Edit Template' : 'New Template'}</h1>
        </div>

        {readOnly && (
          <div className="mb-5 px-4 py-3 rounded-xl bg-amber-50 border border-amber-300 flex items-center gap-3">
            <Lock className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="text-sm text-amber-800">This is a built-in Flacron template and can't be edited. Duplicate it from the Templates page to customize your own copy.</p>
          </div>
        )}

        <fieldset disabled={readOnly} className="space-y-6">
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Basics</h2>
            <div>
              <label className={labelCls}>Template Name *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Water Loss — Standard" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
                placeholder="What this template is for and when to use it" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Visibility</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setScope('personal')}
                  className={`flex-1 text-sm py-2 rounded-lg border ${scope === 'personal' ? 'border-brand-500 bg-brand-500/10 text-brand-700' : 'border-gray-200 text-gray-600'}`}>
                  Personal (only me)
                </button>
                <button type="button" onClick={() => setScope('organization')}
                  className={`flex-1 text-sm py-2 rounded-lg border ${scope === 'organization' ? 'border-brand-500 bg-brand-500/10 text-brand-700' : 'border-gray-200 text-gray-600'}`}>
                  Organization (my team)
                </button>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">Organization templates are visible to every member of your team.</p>
            </div>
          </div>

          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Default Wording</h2>
            <p className="text-xs text-gray-400 -mt-2">Pre-fills the report wizard when this template is selected.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Loss Type</label>
                <select value={fields.lossType} onChange={(e) => setFields((p) => ({ ...p, lossType: e.target.value }))} className={inputCls}>
                  <option value="">— No default —</option>
                  {LOSS_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Report Type</label>
                <select value={fields.reportType} onChange={(e) => setFields((p) => ({ ...p, reportType: e.target.value }))} className={inputCls}>
                  {REPORT_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Claim Type</label>
                <select value={fields.claimType} onChange={(e) => setFields((p) => ({ ...p, claimType: e.target.value }))} className={inputCls}>
                  <option value="">— No default —</option>
                  {CLAIM_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Property Type</label>
                <select value={fields.propertyType} onChange={(e) => setFields((p) => ({ ...p, propertyType: e.target.value }))} className={inputCls}>
                  <option value="">— No default —</option>
                  {PROPERTY_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Inspection Type</label>
                <select value={fields.inspectionType} onChange={(e) => setFields((p) => ({ ...p, inspectionType: e.target.value }))} className={inputCls}>
                  <option value="">— No default —</option>
                  {INSPECTION_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Weather Conditions</label>
                <select value={fields.weatherConditions} onChange={(e) => setFields((p) => ({ ...p, weatherConditions: e.target.value }))} className={inputCls}>
                  <option value="">— No default —</option>
                  {WEATHER_CONDITIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Occupancy Status</label>
                <select value={fields.occupancyStatus} onChange={(e) => setFields((p) => ({ ...p, occupancyStatus: e.target.value }))} className={inputCls}>
                  <option value="">— No default —</option>
                  {OCCUPANCY_STATUSES.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            </div>
            {['propertyDetails', 'lossDescription', 'damagesObserved', 'recommendations', 'additionalNotes'].map((key) => (
              <div key={key}>
                <label className={labelCls}>{key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())} default text</label>
                <textarea value={fields[key]} onChange={(e) => setFields((p) => ({ ...p, [key]: e.target.value }))} rows={2} className={inputCls} />
              </div>
            ))}
          </div>

          <div className="card p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Required Fields</h2>
            <p className="text-xs text-gray-400 -mt-1">A report can't be generated from this template until these are filled in.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {REQUIRABLE_FIELDS.map((f) => (
                <label key={f.key} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={requiredFields.includes(f.key)} onChange={() => toggleRequiredField(f.key)}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-400" />
                  {f.label}
                </label>
              ))}
            </div>
          </div>

          <div className="card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Additional Report Sections</h2>
                <p className="text-xs text-gray-400">Appended to every report generated from this template, after the standard structure.</p>
              </div>
              <button type="button" onClick={addSection} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Add Section
              </button>
            </div>
            {sections.length === 0 ? (
              <p className="text-xs text-gray-400">No additional sections — the report will use the standard 9-section structure only.</p>
            ) : (
              <div className="space-y-3">
                {sections.map((s, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-xl p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <input value={s.title} onChange={(e) => updateSection(idx, { title: e.target.value })}
                        placeholder="Section title (e.g. Roof-Specific Findings)" className={`${inputCls} flex-1`} />
                      <button type="button" onClick={() => moveSection(idx, -1)} disabled={idx === 0} className="p-1.5 rounded-lg border border-gray-200 text-gray-500 disabled:opacity-30">
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => moveSection(idx, 1)} disabled={idx === sections.length - 1} className="p-1.5 rounded-lg border border-gray-200 text-gray-500 disabled:opacity-30">
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => removeSection(idx)} className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <textarea value={s.body} onChange={(e) => updateSection(idx, { body: e.target.value })} rows={3}
                      placeholder="Default wording / guidance for this section" className={inputCls} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Photo & Export Layout</h2>
            <div className="space-y-2">
              {[
                ['includeCoverPage', 'Include cover page'],
                ['includePhotoCaptions', 'Include photo captions'],
                ['includePageNumbers', 'Include page numbers'],
                ['includeAppendix', 'Include photo appendix'],
                ['includeCompanyBranding', 'Include company branding'],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={photoLayout[key]} onChange={() => togglePhotoOption(key)}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-400" />
                  {label}
                </label>
              ))}
            </div>
            <div>
              <label className={labelCls}>Photos per page</label>
              <div className="grid grid-cols-3 gap-2 max-w-xs">
                {PHOTO_LAYOUTS.map((n) => (
                  <button key={n} type="button" onClick={() => setPhotoLayout((p) => ({ ...p, photoLayout: n }))}
                    className={`py-2 rounded-lg border text-sm font-semibold transition-colors ${
                      photoLayout.photoLayout === n ? 'border-brand-500 bg-brand-500/10 text-brand-700' : 'border-gray-200 text-gray-600'
                    }`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="card p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Branding Defaults</h2>
            <p className="text-xs text-gray-400 -mt-1">Used on exports only when your own account/organization branding isn't already set.</p>
            <div>
              <label className={labelCls}>Company Name</label>
              <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Footer Text</label>
              <input value={footerText} onChange={(e) => setFooterText(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Logo</label>
              {logoUrl ? (
                <div className="flex items-center gap-3">
                  <img src={logoUrl} alt="Template logo" className="w-16 h-16 object-contain rounded-lg border border-gray-200" />
                  <button type="button" onClick={handleRemoveLogo} className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1">
                    <X className="w-3.5 h-3.5" /> Remove
                  </button>
                </div>
              ) : (
                <label className="btn-secondary text-xs py-2 px-3 inline-flex items-center gap-2 cursor-pointer">
                  {logoUploading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {logoUploading ? 'Uploading…' : 'Upload logo'}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={handleLogoUpload} disabled={!isEdit} />
                </label>
              )}
              {!isEdit && <p className="text-[11px] text-gray-400 mt-1">Save the template first to add a logo.</p>}
            </div>
          </div>
        </fieldset>

        {!readOnly && (
          <div className="fixed bottom-0 left-0 right-0 bg-bg border-t border-gray-200 px-4 py-3 flex justify-end gap-3 z-10">
            <div className="max-w-3xl mx-auto w-full flex justify-end gap-3">
              <Link to="/templates" className="btn-secondary text-sm py-2 px-4">Cancel</Link>
              <button onClick={handleSave} disabled={saving} className="btn-primary text-sm py-2 px-5 flex items-center gap-2 disabled:opacity-50">
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Saving…' : 'Save Template'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
