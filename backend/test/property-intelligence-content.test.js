const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildSection3PropertyBlockMarkdown,
  injectSection3PropertyBlock,
} = require('../utils/propertyIntelligenceContent');
const { SOURCE, VERIFICATION_STATUS, buildEmptyPropertyIntelligence } = require('../utils/propertyIntelligence');

const confirmedField = (value) => ({ value, source: SOURCE.THIRD_PARTY, verificationStatus: VERIFICATION_STATUS.USER_CONFIRMED, userOverride: false });
const unconfirmedField = (value) => ({ value, source: SOURCE.THIRD_PARTY, verificationStatus: VERIFICATION_STATUS.PROVIDER_SUPPLIED, userOverride: false });

const SAMPLE_CONTENT = [
  '# INSURANCE INSPECTION REPORT',
  '',
  '## SECTION 1: REPORT INFO',
  '- Report Type: Residential',
  '',
  '## SECTION 2: CLAIM INFO & INSURED INFO',
  '- Claim Number: C-1',
  '',
  '## SECTION 3: PROPERTY INFO',
  'The property is a two-story single family residence built with brick veneer.',
  '',
  '## SECTION 4: INSPECTION DETAILS & OVERVIEW',
  'Loss narrative goes here.',
].join('\n');

test('buildSection3PropertyBlockMarkdown: no propertyIntelligence at all returns empty string', () => {
  assert.equal(buildSection3PropertyBlockMarkdown({}), '');
  assert.equal(buildSection3PropertyBlockMarkdown(undefined), '');
});

test('buildSection3PropertyBlockMarkdown: an empty (never-looked-up) intelligence returns empty string', () => {
  const propertyProfile = { propertyIntelligence: buildEmptyPropertyIntelligence() };
  assert.equal(buildSection3PropertyBlockMarkdown(propertyProfile), '');
});

test('buildSection3PropertyBlockMarkdown: unconfirmed (provider-suggested-only) fields never appear -- confirmed-only contract', () => {
  const intel = buildEmptyPropertyIntelligence();
  intel.fields.yearBuilt = unconfirmedField(1998);
  const block = buildSection3PropertyBlockMarkdown({ propertyIntelligence: intel });
  assert.equal(block, '');
});

test('buildSection3PropertyBlockMarkdown: confirmed fields render with labels, units, and currency', () => {
  const intel = buildEmptyPropertyIntelligence();
  intel.fields.yearBuilt = confirmedField(1998);
  intel.fields.livingAreaValue = confirmedField(2100);
  intel.fields.livingAreaUnit = confirmedField('sqft');
  intel.fields.assessedValue = confirmedField(285000);
  intel.fields.assessedValueCurrency = confirmedField('USD');
  const block = buildSection3PropertyBlockMarkdown({ propertyIntelligence: intel });
  assert.match(block, /Year Built \| 1998/);
  assert.match(block, /Living Area \| 2100 sqft/);
  assert.match(block, /Assessed Value \| \$285,000\.00/);
  assert.match(block, /public-record data/i);
});

test('buildSection3PropertyBlockMarkdown: escapes/sanitizes text values (no raw pipe/newline injection)', () => {
  const intel = buildEmptyPropertyIntelligence();
  intel.fields.propertyType = confirmedField('Single | Family\nResidence');
  const block = buildSection3PropertyBlockMarkdown({ propertyIntelligence: intel });
  const tableLine = block.split('\n').find((l) => l.includes('Property Type'));
  assert.equal(tableLine.split('|').length, 4); // exactly the 2 real columns + leading/trailing empty splits, not corrupted by an injected pipe
});

test('buildSection3PropertyBlockMarkdown: long values do not crash and are still capped by upstream validation', () => {
  const intel = buildEmptyPropertyIntelligence();
  intel.fields.ownerOnRecord = confirmedField('x'.repeat(500));
  const block = buildSection3PropertyBlockMarkdown({ propertyIntelligence: intel });
  assert.ok(block.length > 0);
});

test('injectSection3PropertyBlock: no-op when there is nothing to inject', () => {
  assert.equal(injectSection3PropertyBlock(SAMPLE_CONTENT, ''), SAMPLE_CONTENT);
});

test('injectSection3PropertyBlock: no-op when the document has no "SECTION 3" heading', () => {
  const noSection3 = '# Title\n\n## SECTION 1: X\nsomething';
  assert.equal(injectSection3PropertyBlock(noSection3, '### Confirmed Property Details'), noSection3);
});

test('injectSection3PropertyBlock: appends BENEATH the existing Section 3 narrative, never replacing it', () => {
  const result = injectSection3PropertyBlock(SAMPLE_CONTENT, '### Confirmed Property Details (Public Records)\n| Field | Value |\n|---|---|\n| Year Built | 1998 |');
  assert.match(result, /two-story single family residence/); // original narrative preserved
  assert.match(result, /Confirmed Property Details \(Public Records\)/); // new block present
  const sec3Start = result.indexOf('## SECTION 3');
  const sec4Start = result.indexOf('## SECTION 4');
  const narrativeIdx = result.indexOf('two-story single family residence');
  const blockIdx = result.indexOf('Confirmed Property Details');
  assert.ok(sec3Start < narrativeIdx && narrativeIdx < blockIdx && blockIdx < sec4Start);
});

test('injectSection3PropertyBlock: Section 4+ is preserved byte-for-byte', () => {
  const result = injectSection3PropertyBlock(SAMPLE_CONTENT, '### Confirmed Property Details\nfoo');
  assert.ok(result.includes('## SECTION 4: INSPECTION DETAILS & OVERVIEW\nLoss narrative goes here.'));
});

test('injectSection3PropertyBlock: idempotent across repeated calls against the SAME original content (never duplicates)', () => {
  const block = '### Confirmed Property Details\nfoo';
  const once = injectSection3PropertyBlock(SAMPLE_CONTENT, block);
  const again = injectSection3PropertyBlock(SAMPLE_CONTENT, block); // always re-derived from the ORIGINAL stored content, never the previous result
  assert.equal(once, again);
  assert.equal((once.match(/Confirmed Property Details/g) || []).length, 1);
});

test('a legacy report content with no Section 3 property intelligence renders completely unchanged', () => {
  const intel = buildEmptyPropertyIntelligence(); // never looked up
  const block = buildSection3PropertyBlockMarkdown({ propertyIntelligence: intel });
  assert.equal(injectSection3PropertyBlock(SAMPLE_CONTENT, block), SAMPLE_CONTENT);
});
