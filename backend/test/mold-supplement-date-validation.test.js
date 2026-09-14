const test = require('node:test');
const assert = require('node:assert/strict');
const { isIsoDateAfter, getLocalTodayIso } = require('../utils/inspectionDate');
const { buildMoldStaticSections, generateMoldReport } = require('../services/aiService');

// QA regression: POST /:id/mold-supplement (reports.js) validated
// `dateOfDiscovery`'s FORMAT (YYYY-MM-DD) but never that it was actually in
// the past/present relative to the supplement's own generation time -- a
// discovery date of 2026-09-26 generated fine on 2026-09-13 and rendered
// alongside "Report Date: September 13, 2026", which is logically invalid.
// Fixed by reusing the same `isIsoDateAfter`/`getLocalTodayIso` boundary
// check the primary Inspection Date fix introduced, applied against the
// supplement's own generation date -- deliberately NOT the linked/parent
// report's date, since the parent may legitimately predate discovery.

const NARRATIVE_FIXTURE = {
  visualObservations: '- Utility room wall: dark speckled growth pattern visible.',
  recommendedNextSteps: '- Engage a certified mold assessor for a full visual inspection.',
};
const makeGenerateFn = (text) => async () => ({ text, modelUsed: 'test/mock' });

test('a past discovery date passes the same boundary check the mold-supplement route applies', () => {
  const today = getLocalTodayIso(new Date(2026, 8, 13)); // 2026-09-13
  assert.equal(isIsoDateAfter('2026-09-12', today), false);
});

test('a discovery date equal to the supplement report date is accepted', () => {
  const today = getLocalTodayIso(new Date(2026, 8, 13));
  assert.equal(isIsoDateAfter('2026-09-13', today), false);
});

test('a future discovery date is rejected by the same check the route runs server-side (independent of any frontend bypass)', () => {
  const today = getLocalTodayIso(new Date(2026, 8, 13));
  assert.equal(isIsoDateAfter('2026-09-26', today), true); // the exact reproduced QA value
  assert.equal(isIsoDateAfter('2026-09-14', today), true);
});

test('buildMoldStaticSections renders the discovery date verbatim, with no timezone shift at year/month/leap-day boundaries', () => {
  const base = {
    claimNumber: 'CLM-1-M',
    relatedClaimId: 'CLM-1',
    insuredName: 'Jane Doe',
    propertyAddress: '1 Test Way',
    policyNumber: 'POL-1',
  };
  for (const date of ['2026-01-01', '2026-12-31', '2024-02-29']) {
    const { reportInfo } = buildMoldStaticSections({ ...base, dateOfDiscovery: date });
    assert.match(reportInfo, new RegExp(`\\| Date of Discovery \\| ${date} \\|`));
  }
});

test('the discovery-date check never references the linked/parent report -- a discovery date after the parent\'s own lossDate/creation is not rejected', () => {
  // buildMoldStaticSections/generateMoldReport only ever receive the
  // supplement's own reportData -- there is no parentLossDate parameter to
  // compare against, so an old parent claim with a much later discovery
  // date generates normally.
  const reportData = {
    claimNumber: 'CLM-2024-WD-001-M',
    relatedClaimId: 'CLM-2024-WD-001', // parent claim, opened long before discovery
    insuredName: 'John & Mary Smith',
    propertyAddress: '1425 Maple Street, Austin, TX 78701',
    policyNumber: 'POL-9',
    dateOfDiscovery: '2026-09-12', // long after the parent claim would have opened
  };
  const { reportInfo } = buildMoldStaticSections(reportData);
  assert.match(reportInfo, /\| Date of Discovery \| 2026-09-12 \|/);
  assert.match(reportInfo, /\| Related Claim \| CLM-2024-WD-001 \|/);
});

test('the supplement\'s Report Date always reflects generation time, independent of the (accepted, past) discovery date', () => {
  const reportDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const { reportInfo } = buildMoldStaticSections({
    claimNumber: 'CLM-3-M',
    insuredName: 'Jane Doe',
    propertyAddress: '1 Test Way',
    dateOfDiscovery: '2020-01-01',
  });
  assert.match(reportInfo, new RegExp(`\\| Report Date \\| ${reportDate} \\|`));
});

test('existing valid Mold Supplement generation still succeeds end-to-end with an accepted (past) discovery date', async () => {
  const generateFn = makeGenerateFn(JSON.stringify(NARRATIVE_FIXTURE));
  const { content, modelUsed } = await generateMoldReport(
    {
      claimNumber: 'CLM-4-M',
      relatedClaimId: 'CLM-4',
      insuredName: 'Jane Doe',
      propertyAddress: '1 Test Way',
      dateOfDiscovery: '2026-09-12',
    },
    null,
    0,
    { generateFn }
  );
  assert.match(content, /\| Date of Discovery \| 2026-09-12 \|/);
  assert.match(content, /NOT a certified mold assessment/);
  assert.equal(typeof modelUsed, 'string');
});
