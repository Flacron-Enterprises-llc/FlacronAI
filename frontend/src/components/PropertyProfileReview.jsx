// Phase 46 (Property Intelligence: Address Normalization & Google Integration).
// The user-confirmation review step: shows the original vs. normalized
// address, source, verification status, and lets the user accept, edit, or
// reject before ANYTHING is treated as confirmed report data. Purely
// presentational + local-state editing -- persistence is the caller's job
// (reportsAPI.savePropertyProfile), keeping this reusable from both the
// wizard (pre-report-creation) and an existing report's edit view.
import { useState } from 'react';
import { CheckCircle2, MapPin, Pencil, RotateCcw, X, Home, AlertTriangle, Loader2 } from 'lucide-react';
import { VERIFICATION_STATUS } from '../utils/propertyProfile';
import { FIELD_GROUPS, isFieldConfirmed, getLookupResultView } from '../utils/propertyIntelligence';

const LABELS = {
  addressLine1: 'Street address',
  addressLine2: 'Unit / Suite',
  city: 'City',
  state: 'State / Province',
  postalCode: 'Postal code',
  country: 'Country',
};

const STATUS_BADGE = {
  [VERIFICATION_STATUS.PROVIDER_NORMALIZED]: { text: 'Google-normalized', className: 'bg-blue-50 text-blue-700' },
  [VERIFICATION_STATUS.AMBIGUOUS]: { text: 'Multiple matches — please confirm', className: 'bg-amber-50 text-amber-700' },
  [VERIFICATION_STATUS.USER_CONFIRMED]: { text: 'Confirmed', className: 'bg-green-50 text-green-700' },
  [VERIFICATION_STATUS.STALE]: { text: 'Recheck required', className: 'bg-amber-50 text-amber-700' },
  [VERIFICATION_STATUS.UNVERIFIED]: { text: 'Not verified', className: 'bg-gray-100 text-gray-600' },
  [VERIFICATION_STATUS.UNAVAILABLE]: { text: 'Unavailable', className: 'bg-gray-100 text-gray-500' },
};

// `profile` is a normalizePlace() result's `.profile` (unconfirmed) or an
// already-confirmed PropertyProfile being re-reviewed. `onConfirm(overrides)`
// receives ONLY the fields the user actually changed from the profile's own
// values (never a full re-echo of provider data as "trusted" by the
// caller's own logic -- see reports.js PUT /:id/property-profile, which
// only ever trusts its own server-stored normalization record plus these
// explicit overrides).
const PropertyProfileReview = ({ profile, ambiguous, onConfirm, onReject, onRecheck, saving }) => {
  const fields = profile?.fields || {};
  const [edits, setEdits] = useState({});
  const [editingKey, setEditingKey] = useState(null);

  const valueFor = (key) => (edits[key] !== undefined ? edits[key] : fields[key]?.value || '');
  const badge = STATUS_BADGE[ambiguous ? VERIFICATION_STATUS.AMBIGUOUS : fields.formattedAddress?.verificationStatus] ||
    STATUS_BADGE[VERIFICATION_STATUS.UNVERIFIED];

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <MapPin className="w-4 h-4 text-brand mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-gray-900">{fields.formattedAddress?.value || profile?.original}</p>
            {profile?.original && profile.original !== fields.formattedAddress?.value && (
              <p className="text-xs text-gray-400">Originally typed: {profile.original}</p>
            )}
          </div>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${badge.className}`}>{badge.text}</span>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {Object.keys(LABELS).map((key) => (
          <div key={key}>
            <dt className="text-xs text-gray-400">{LABELS[key]}</dt>
            {editingKey === key ? (
              <input
                autoFocus
                className="input py-1 text-sm"
                value={valueFor(key)}
                onChange={(e) => setEdits((p) => ({ ...p, [key]: e.target.value }))}
                onBlur={() => setEditingKey(null)}
              />
            ) : (
              <dd className="flex items-center gap-1 text-gray-800">
                <span>{valueFor(key) || '—'}</span>
                <button
                  type="button"
                  aria-label={`Edit ${LABELS[key]}`}
                  className="text-gray-300 hover:text-gray-500"
                  onClick={() => setEditingKey(key)}
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </dd>
            )}
          </div>
        ))}
      </dl>

      {(fields.latitude?.value != null || fields.longitude?.value != null) && (
        <p className="text-xs text-gray-400">
          Coordinates: {fields.latitude?.value ?? '—'}, {fields.longitude?.value ?? '—'}
        </p>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          disabled={saving}
          className="btn-primary text-sm px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-60"
          onClick={() => onConfirm(edits)}
        >
          <CheckCircle2 className="w-3.5 h-3.5" /> Confirm address
        </button>
        {onRecheck && (
          <button type="button" disabled={saving} className="text-sm px-3 py-1.5 rounded-btn border border-gray-200 flex items-center gap-1.5" onClick={onRecheck}>
            <RotateCcw className="w-3.5 h-3.5" /> Re-check
          </button>
        )}
        {onReject && (
          <button type="button" disabled={saving} className="text-sm px-3 py-1.5 rounded-btn border border-gray-200 flex items-center gap-1.5" onClick={onReject}>
            <X className="w-3.5 h-3.5" /> Use manual entry instead
          </button>
        )}
      </div>
    </div>
  );
};

// Phase 47 (Property Intelligence: RealtyAPI U.S. Adapter & Report
// Integration). Extends this SAME review workflow (per the phase brief's
// explicit "extend PropertyProfileReview instead of a second editor"
// instruction) with the detailed U.S. property-data lookup/review/confirm
// step. Purely presentational + local-state field selection/editing --
// persistence is the caller's job (reportsAPI.applyPropertyIntelligence).
//
// `eligibility` = propertyIntelligence.computePropertyIntelligenceEligibility(profile).
// `intelligence` = the report's currently-persisted propertyProfile.propertyIntelligence.
// `lookupResult` = the transient response of the last onLookup() call (null
//   until a lookup has been requested this session) -- never itself
//   persisted; the user must explicitly select+confirm before anything here
//   becomes real report data.
// `onLookup(recheck)` requests (or serves from cache) a fresh lookup.
// `onApply({ mode, lookupId, selectedKeys, overrides })` persists the
//   user's selection/edits -- `mode: 'manual'` for a plain manual edit of
//   an already-confirmed field, `mode: 'provider_confirmed'` to accept
//   selected fields from `lookupResult.lookupId`.
export const PropertyIntelligenceReview = ({
  eligibility,
  intelligence,
  lookupResult,
  loading,
  saving,
  error,
  onLookup,
  onApply,
}) => {
  const [selected, setSelected] = useState({});
  const [edits, setEdits] = useState({});

  if (!eligibility?.eligible) {
    if (eligibility?.reason === 'address_not_confirmed' || eligibility?.reason === 'incomplete_address') {
      return (
        <p className="text-xs text-gray-400 flex items-center gap-1.5">
          <Home className="w-3.5 h-3.5" /> Confirm a complete U.S. address above to look up detailed property records.
        </p>
      );
    }
    return null; // non-US: no clutter -- manual entry remains fully usable
  }

  const confirmedFields = intelligence?.fields || {};
  const hasConfirmed = FIELD_GROUPS.some((g) => isFieldConfirmed(confirmedFields[g.key]));
  const isStale = intelligence?.status === 'stale';

  // Gate on the lookup OUTCOME, not on `lookupResult.fields` -- no_match/
  // ambiguous/not_eligible responses carry no `fields` and must still show
  // a message instead of silently returning to the idle button.
  const lookupView = getLookupResultView(lookupResult);
  const reviewFields = lookupView.kind === 'review' ? lookupResult.fields : null;

  const toggleSelected = (key, checked) => setSelected((p) => ({ ...p, [key]: checked }));
  const valueFor = (key) => (edits[key] !== undefined ? edits[key] : reviewFields?.[key]?.value ?? '');

  const submitSelection = () => {
    const selectedKeys = FIELD_GROUPS.map((g) => g.key).filter((k) => selected[k]);
    const overrides = {};
    for (const key of selectedKeys) {
      if (edits[key] !== undefined && String(edits[key]) !== String(reviewFields?.[key]?.value ?? '')) {
        overrides[key] = edits[key];
      }
    }
    onApply({ mode: 'provider_confirmed', lookupId: lookupResult.lookupId, selectedKeys, overrides });
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
          <Home className="w-4 h-4 text-brand" aria-hidden="true" /> Detailed Property Information (U.S. Public Records)
        </p>
        {isStale && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 whitespace-nowrap">Recheck recommended</span>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-600 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error.message || 'Property data lookup is not currently available.'}
        </p>
      )}

      {!reviewFields && (
        <button
          type="button"
          disabled={loading}
          aria-busy={loading}
          className="btn-primary text-sm px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-60"
          onClick={() => onLookup(isStale || hasConfirmed)}
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Home className="w-3.5 h-3.5" />}
          {hasConfirmed ? 'Re-check property details' : 'Look up property details'}
        </button>
      )}

      {!reviewFields && hasConfirmed && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {FIELD_GROUPS.filter((g) => isFieldConfirmed(confirmedFields[g.key])).map((g) => (
            <div key={g.key}>
              <dt className="text-xs text-gray-400">{g.label}</dt>
              <dd className="text-gray-800">
                {confirmedFields[g.key].value}
                {g.unitKey && confirmedFields[g.unitKey]?.value ? ` ${confirmedFields[g.unitKey].value}` : ''}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {lookupView.kind === 'message' && !loading && (
        <p role="status" className="text-sm text-gray-500">{lookupView.message}</p>
      )}

      {reviewFields && (
        <>
          <dl className="space-y-2 text-sm">
            {FIELD_GROUPS.filter((g) => reviewFields[g.key]?.value !== null && reviewFields[g.key]?.value !== undefined).map((g) => (
              <div key={g.key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`pi-${g.key}`}
                  checked={!!selected[g.key]}
                  onChange={(e) => toggleSelected(g.key, e.target.checked)}
                  className="shrink-0"
                />
                <label htmlFor={`pi-${g.key}`} className="text-xs text-gray-400 w-40 shrink-0">{g.label}</label>
                <input
                  className="input py-1 text-sm flex-1"
                  value={valueFor(g.key)}
                  onChange={(e) => setEdits((p) => ({ ...p, [g.key]: e.target.value }))}
                />
                {g.unitKey && reviewFields[g.unitKey]?.value && (
                  <span className="text-xs text-gray-400">{reviewFields[g.unitKey].value}</span>
                )}
              </div>
            ))}
          </dl>
          {lookupResult.disclaimers?.[0] && <p className="text-xs text-gray-400">{lookupResult.disclaimers[0]}</p>}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={saving || Object.values(selected).every((v) => !v)}
              className="btn-primary text-sm px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-60"
              onClick={submitSelection}
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Confirm selected fields
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default PropertyProfileReview;
