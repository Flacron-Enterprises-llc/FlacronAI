const test = require('node:test');
const assert = require('node:assert/strict');
const {
  FIELD_KEYS,
  SOURCE,
  VERIFICATION_STATUS,
  normalizeProviderFields,
  validateFieldValue,
  buildEmptyPropertyIntelligence,
  markPropertyIntelligenceStale,
  isValidFootprintGeometry,
} = require('../utils/propertyIntelligence');

// Phase 47. Pure schema/validator coverage -- no network, no Firestore.

test('normalizeProviderFields: a full valid fixture wraps every field as THIRD_PARTY/PROVIDER_SUPPLIED', () => {
  const fields = normalizeProviderFields({
    parcelNumber: 'PARC-0001',
    propertyType: 'Single Family Residence',
    yearBuilt: 1998,
    livingAreaValue: 2100,
    livingAreaUnit: 'sqft',
    lotSizeValue: 0.25,
    lotSizeUnit: 'acres',
    bedrooms: 3,
    bathrooms: 2.5,
    stories: 2,
    garageType: 'Attached',
    garageSpaces: 2,
    roofType: 'Asphalt Shingle',
    exteriorConstruction: 'Brick Veneer',
    foundationType: 'Slab',
    heatingType: 'Forced Air',
    coolingType: 'Central',
    assessedValue: 285000,
    assessedValueCurrency: 'USD',
    propertyTaxAnnual: 5400,
    propertyTaxCurrency: 'USD',
    lastSaleDate: '2019-06-14',
    lastSalePrice: 310000,
    lastSalePriceCurrency: 'USD',
    ownerOnRecord: 'On file with county records',
    floodZone: 'Zone X',
    hazardSummary: 'No elevated hazard reported.',
    footprintAreaValue: 1850,
    footprintAreaUnit: 'sqft',
  });
  for (const key of FIELD_KEYS) {
    assert.equal(fields[key].source, SOURCE.THIRD_PARTY, `${key} should be THIRD_PARTY-sourced`);
    assert.equal(fields[key].verificationStatus, VERIFICATION_STATUS.PROVIDER_SUPPLIED);
    assert.notEqual(fields[key].value, null, `${key} should be populated`);
  }
});

test('normalizeProviderFields: a partial result leaves missing fields as editable blanks, not fabricated', () => {
  const fields = normalizeProviderFields({ parcelNumber: 'PARC-0001', yearBuilt: 1998, bedrooms: 3 });
  assert.equal(fields.parcelNumber.value, 'PARC-0001');
  assert.equal(fields.yearBuilt.value, 1998);
  assert.equal(fields.bedrooms.value, 3);
  assert.equal(fields.roofType.value, null);
  assert.equal(fields.roofType.source, SOURCE.UNAVAILABLE);
  assert.equal(fields.roofType.verificationStatus, VERIFICATION_STATUS.UNAVAILABLE);
});

test('normalizeProviderFields: an unrecognized/unexpected raw field is silently ignored, never merged', () => {
  const fields = normalizeProviderFields({ yearBuilt: 2000, someFutureRealtyApiField: 'whatever' });
  assert.equal(fields.yearBuilt.value, 2000);
  assert.ok(!('someFutureRealtyApiField' in fields));
});

test('normalizeProviderFields: malformed provider data is never coerced into an apparently-verified value', () => {
  const fields = normalizeProviderFields({
    yearBuilt: 'not-a-year',
    bedrooms: -3,
    livingAreaUnit: 'furlongs',
    lastSaleDate: '2099-01-01', // future date, invalid
    assessedValueCurrency: '12', // not a 3-letter ISO code
    parcelNumber: '<script>alert(1)</script>',
  });
  assert.equal(fields.yearBuilt.value, null);
  assert.equal(fields.bedrooms.value, null);
  assert.equal(fields.livingAreaUnit.value, null);
  assert.equal(fields.lastSaleDate.value, null);
  assert.equal(fields.assessedValueCurrency.value, null);
  assert.equal(fields.parcelNumber.value, null); // unsafe characters rejected
});

test('APN/parcel validation accepts safe characters and a reasonable length, rejects unsafe ones', () => {
  assert.equal(validateFieldValue('parcelNumber', 'ABC-123/45#6'), 'ABC-123/45#6');
  assert.equal(validateFieldValue('parcelNumber', 'a'.repeat(200)).length, 60);
  assert.equal(validateFieldValue('parcelNumber', '<script>'), null);
});

test('year-built validation enforces a reasonable range', () => {
  assert.equal(validateFieldValue('yearBuilt', 1500), null);
  assert.equal(validateFieldValue('yearBuilt', 1900), 1900);
  assert.equal(validateFieldValue('yearBuilt', new Date().getFullYear() + 5), null);
});

test('living/lot area validation requires a finite non-negative number and a supported unit', () => {
  assert.equal(validateFieldValue('livingAreaValue', -5), null);
  assert.equal(validateFieldValue('livingAreaValue', Infinity), null);
  assert.equal(validateFieldValue('livingAreaValue', 2000), 2000);
  assert.equal(validateFieldValue('livingAreaUnit', 'sqft'), 'sqft');
  assert.equal(validateFieldValue('lotSizeUnit', 'acres'), 'acres');
  assert.equal(validateFieldValue('lotSizeUnit', 'hectares'), null);
});

test('bedrooms/bathrooms/stories/garage validation: bathrooms allow .5 steps, others must be whole numbers', () => {
  assert.equal(validateFieldValue('bedrooms', 3.5), null);
  assert.equal(validateFieldValue('bathrooms', 2.5), 2.5);
  assert.equal(validateFieldValue('bathrooms', 2.3), null);
  assert.equal(validateFieldValue('stories', 2), 2);
  assert.equal(validateFieldValue('garageSpaces', -1), null);
});

test('money/currency validation rejects negative amounts and invalid currency codes', () => {
  assert.equal(validateFieldValue('assessedValue', -100), null);
  assert.equal(validateFieldValue('assessedValue', 250000), 250000);
  assert.equal(validateFieldValue('assessedValueCurrency', 'USD'), 'USD');
  assert.equal(validateFieldValue('assessedValueCurrency', 'US'), null);
});

test('date validation rejects malformed and future dates', () => {
  assert.equal(validateFieldValue('lastSaleDate', '06-14-2019'), null);
  assert.equal(validateFieldValue('lastSaleDate', '2019-06-14'), '2019-06-14');
  assert.equal(validateFieldValue('lastSaleDate', '2099-01-01'), null);
});

test('roof/exterior/foundation/HVAC are capped free text', () => {
  assert.equal(validateFieldValue('roofType', 'Asphalt Shingle'), 'Asphalt Shingle');
  assert.equal(validateFieldValue('roofType', 'x'.repeat(200)).length, 80);
});

test('ownership text is sanitized (single-line, pipe-safe, length-capped)', () => {
  const dirty = 'Jane Doe\n| Trust\r\n' + 'x'.repeat(300);
  const clean = validateFieldValue('ownerOnRecord', dirty);
  assert.ok(!clean.includes('\n') && !clean.includes('|'));
  assert.ok(clean.length <= 200);
});

test('flood/hazard fields are only ever populated when a value is actually present', () => {
  const fields = normalizeProviderFields({});
  assert.equal(fields.floodZone.value, null);
  assert.equal(fields.hazardSummary.value, null);
});

test('footprint geometry guard: rejects oversized or overly deep payloads, accepts absent/simple ones', () => {
  assert.equal(isValidFootprintGeometry(null), true);
  assert.equal(isValidFootprintGeometry({ area: 1850 }), true);
  assert.equal(isValidFootprintGeometry('x'.repeat(30000)), false);
  let deep = { v: 1 };
  for (let i = 0; i < 10; i++) deep = { child: deep };
  assert.equal(isValidFootprintGeometry(deep), false);
});

test('buildEmptyPropertyIntelligence: every field key present and unavailable, not eligible by default', () => {
  const intel = buildEmptyPropertyIntelligence();
  assert.equal(intel.countryEligible, false);
  for (const key of FIELD_KEYS) {
    assert.equal(intel.fields[key].value, null);
  }
});

test('markPropertyIntelligenceStale: marks THIRD_PARTY fields stale, leaves user-owned fields untouched', () => {
  const intel = buildEmptyPropertyIntelligence();
  intel.fields.yearBuilt = { value: 1998, source: SOURCE.THIRD_PARTY, verificationStatus: VERIFICATION_STATUS.USER_CONFIRMED, userOverride: false };
  intel.fields.bedrooms = { value: 4, source: SOURCE.USER_OVERRIDDEN, verificationStatus: VERIFICATION_STATUS.USER_CONFIRMED, userOverride: true };
  const stale = markPropertyIntelligenceStale(intel);
  assert.equal(stale.fields.yearBuilt.verificationStatus, VERIFICATION_STATUS.STALE);
  assert.equal(stale.fields.bedrooms.verificationStatus, VERIFICATION_STATUS.USER_CONFIRMED);
  assert.equal(stale.status, 'stale');
});
