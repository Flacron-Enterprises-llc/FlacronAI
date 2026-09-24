// Phase 47 (Property Intelligence: RealtyAPI U.S. Adapter & Report
// Integration). Pure, dependency-free module that turns a report's
// CONFIRMED property-intelligence fields into a markdown block and APPENDS
// it beneath Section 3's existing narrative -- never replacing it (unlike
// canonicalEstimateContent.js's Section 7 REPLACE behavior; see that
// module's header comment for why Section 7 differs. Section 3 here must
// preserve the adjuster-facing narrative already there, per PHASES.md Phase
// 47's explicit "do not replace the complete existing Section 3 narrative
// blindly" instruction).
//
// Reuses the SAME architecture decision as canonicalEstimateContent.js:
// properPdfGenerator.js / documentGenerator.js / generateHTML all already
// parse the same markdown dialect out of `report.content`, so this module
// produces one normalized markdown string and splices it into an in-memory
// copy of `content` -- never persisted back to Firestore. The report's
// stored `propertyProfile.propertyIntelligence` (backend/utils/
// propertyIntelligence.js) remains the single source of truth.
//
// Golden Rule #3: only fields with `verificationStatus === 'user_confirmed'`
// are ever rendered here -- an AI-suggested-but-unconfirmed provider value
// never reaches an export, matching Phase 46/47's own confirmation-gate
// requirement exactly.
const { sanitizeForMarkdown } = require('./canonicalEstimateContent');
const { VERIFICATION_STATUS } = require('./propertyIntelligence');

const LABELS = {
  parcelNumber: 'Parcel / APN',
  propertyType: 'Property Type',
  yearBuilt: 'Year Built',
  livingAreaValue: 'Living Area',
  lotSizeValue: 'Lot Size',
  bedrooms: 'Bedrooms',
  bathrooms: 'Bathrooms',
  stories: 'Stories',
  garageType: 'Garage Type',
  garageSpaces: 'Garage Spaces',
  roofType: 'Roof Type',
  exteriorConstruction: 'Exterior Construction',
  foundationType: 'Foundation',
  heatingType: 'Heating',
  coolingType: 'Cooling',
  assessedValue: 'Assessed Value',
  propertyTaxAnnual: 'Annual Property Tax',
  lastSaleDate: 'Last Sale Date',
  lastSalePrice: 'Last Sale Price',
  ownerOnRecord: 'Owner on Record (Public Records)',
  floodZone: 'Flood Zone',
  hazardSummary: 'Hazard Summary',
  footprintAreaValue: 'Building Footprint',
};

// Keys rendered as their own row (paired with a unit/currency companion
// field rather than being listed a second time).
const UNIT_PAIRS = {
  livingAreaValue: 'livingAreaUnit',
  lotSizeValue: 'lotSizeUnit',
  footprintAreaValue: 'footprintAreaUnit',
};
const CURRENCY_PAIRS = {
  assessedValue: 'assessedValueCurrency',
  propertyTaxAnnual: 'propertyTaxCurrency',
  lastSalePrice: 'lastSalePriceCurrency',
};
// Rendered via their own row above; never listed a second time as a
// standalone row.
const COMPANION_KEYS = new Set([...Object.values(UNIT_PAIRS), ...Object.values(CURRENCY_PAIRS)]);

const formatMoneyValue = (amount, currency) => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(Number(amount) || 0);
  } catch {
    return `${currency || 'USD'} ${Number(amount) || 0}`;
  }
};

const formatFieldValue = (key, fields) => {
  const field = fields[key];
  if (!field || field.value === null || field.value === undefined || field.value === '') return null;
  if (CURRENCY_PAIRS[key]) {
    return formatMoneyValue(field.value, fields[CURRENCY_PAIRS[key]]?.value);
  }
  if (UNIT_PAIRS[key]) {
    const unit = fields[UNIT_PAIRS[key]]?.value;
    return `${sanitizeForMarkdown(field.value)}${unit ? ` ${sanitizeForMarkdown(unit)}` : ''}`;
  }
  return sanitizeForMarkdown(field.value);
};

const isConfirmed = (field) => field && field.verificationStatus === VERIFICATION_STATUS.USER_CONFIRMED;

// Builds the Section 3 property-information markdown block. Returns '' (a
// safe no-op) when there is no confirmed intelligence to show -- the
// legacy-fallback / empty-state contract shared with canonicalEstimateContent.js.
const buildSection3PropertyBlockMarkdown = (propertyProfile) => {
  const intel = propertyProfile?.propertyIntelligence;
  const fields = intel?.fields;
  if (!fields) return '';

  const confirmedKeys = Object.keys(LABELS).filter((key) => !COMPANION_KEYS.has(key) && isConfirmed(fields[key]));
  if (confirmedKeys.length === 0) return '';

  const rows = confirmedKeys
    .map((key) => {
      const formatted = formatFieldValue(key, fields);
      return formatted ? `| ${LABELS[key]} | ${formatted} |` : null;
    })
    .filter(Boolean);
  if (rows.length === 0) return '';

  const parts = [];
  parts.push('### Confirmed Property Details (Public Records)');
  parts.push(`| Field | Value |\n|------|------|\n${rows.join('\n')}`);
  parts.push(
    "*Property data above is informational public-record data from a third-party source, reviewed and confirmed by the preparer. Availability and freshness vary by jurisdiction and are not guaranteed current. This is not a coverage determination, appraisal, title report, flood certification, or legal verification.*"
  );
  return parts.join('\n\n');
};

// Matches an H2 heading token "SECTION 3" (case-insensitive) -- same
// convention as canonicalEstimateContent.js's SECTION7_HEADING_RE.
const SECTION3_HEADING_RE = /^##\s*SECTION\s+3\b/i;
const NEXT_TOP_LEVEL_HEADING_RE = /^#{1,2}(?!#)\s/;

// APPENDS `blockMarkdown` to the END of the FIRST "## SECTION 3..." body
// (just before the next top-level heading, or end of document) -- the
// existing narrative between the heading and that point is preserved
// byte-for-byte, unlike Section 7's replace behavior. A no-op (returns
// `content` unchanged) when there is no block to inject or no "SECTION 3"
// heading is found. Never persisted -- same contract as
// canonicalEstimateContent.js's injectSection7Detail.
const injectSection3PropertyBlock = (content, blockMarkdown) => {
  if (!blockMarkdown) return content;
  const source = String(content || '');
  const lines = source.split('\n');
  const sec3Index = lines.findIndex((line) => SECTION3_HEADING_RE.test(line.trim()));
  if (sec3Index === -1) return content;

  let nextHeadingIndex = lines.length;
  for (let i = sec3Index + 1; i < lines.length; i++) {
    if (NEXT_TOP_LEVEL_HEADING_RE.test(lines[i].trim())) {
      nextHeadingIndex = i;
      break;
    }
  }

  const before = lines.slice(0, nextHeadingIndex); // heading + full existing narrative, untouched
  const after = lines.slice(nextHeadingIndex); // Section 4+, untouched
  const spliced = [...before, '', ...blockMarkdown.split('\n'), '', ...after];
  return spliced.join('\n');
};

module.exports = {
  LABELS,
  buildSection3PropertyBlockMarkdown,
  injectSection3PropertyBlock,
  SECTION3_HEADING_RE,
};
