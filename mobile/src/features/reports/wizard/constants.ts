/**
 * Enum option lists — copied verbatim from `backend/routes/reports.js` (`CLAIM_TYPES`,
 * `PROPERTY_TYPES`, `INSPECTION_TYPES`, `WEATHER_CONDITIONS`, `OCCUPANCY_STATUSES`) and
 * `frontend/src/pages/Dashboard.jsx`'s `LOSS_TYPES`. The backend enum-checks these fields
 * when present (`enumChecks` in `reports.js`) — sending anything outside these lists is
 * rejected with `VALIDATION_ERROR`, so this list must stay in sync with the server's, not be
 * invented independently.
 */
export const CLAIM_TYPES = ['Property', 'Auto', 'Commercial', 'Liability', 'Other'] as const;
export const LOSS_TYPES = ['Water Damage', 'Fire', 'Wind', 'Hail', 'Mold', 'Vandalism', 'Flood', 'Theft', 'Other'] as const;
export const PROPERTY_TYPES = ['Single-Family Home', 'Multi-Family', 'Condo/Townhouse', 'Commercial', 'Other'] as const;
export const INSPECTION_TYPES = ['Interior', 'Exterior', 'Interior & Exterior', 'Virtual/Remote'] as const;
export const WEATHER_CONDITIONS = [
  'Clear/Sunny',
  'Partly Cloudy',
  'Overcast',
  'Rain',
  'Snow',
  'High Wind',
  'Extreme Heat',
  'Other',
] as const;
export const OCCUPANCY_STATUSES = ['Occupied', 'Vacant', 'Under Renovation', 'Unknown'] as const;
export const REPORT_TYPES = ['Initial', 'Supplemental', 'Final', 'Reinspection'] as const;
