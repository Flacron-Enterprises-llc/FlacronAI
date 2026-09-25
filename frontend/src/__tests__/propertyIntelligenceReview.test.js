import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PropertyIntelligenceReview } from '../components/PropertyProfileReview';
import {
  buildEmptyPropertyIntelligence,
  getLookupResultView,
  LOOKUP_STATUS,
} from '../utils/propertyIntelligence';

// Production regression (2026-09-25): clicking "Look up property details"
// showed a spinner, then silently returned to the same idle button -- no
// data, no message, no error. The review UI only left its idle state when
// the response carried a top-level `fields` map, but the backend's
// provider-side no_match, ambiguous and not_eligible outcomes return
// `{ status, reason?, intelligence }` with NO `fields`
// (backend/services/propertyIntelligenceService.js requestPropertyIntelligence).
//
// Fixtures below mirror the exact POST /:id/property-lookup/intelligence
// response bodies (`{ success: true, ...result }`, routes/reports.js).
const emptyIntelligence = buildEmptyPropertyIntelligence();

const RESPONSES = {
  providerNoMatch: {
    success: true,
    status: LOOKUP_STATUS.NO_MATCH,
    intelligence: emptyIntelligence,
  },
  ambiguous: { success: true, status: LOOKUP_STATUS.AMBIGUOUS, intelligence: emptyIntelligence },
  notEligibleIncomplete: {
    success: true,
    status: LOOKUP_STATUS.NOT_ELIGIBLE,
    reason: 'incomplete_address',
    intelligence: emptyIntelligence,
  },
  notEligibleCountry: {
    success: true,
    status: LOOKUP_STATUS.NOT_ELIGIBLE,
    reason: 'country_not_supported',
    intelligence: emptyIntelligence,
  },
  // populatedCount === 0 branch: no_match WITH an (all-empty) fields map
  fieldNoMatch: {
    success: true,
    status: LOOKUP_STATUS.NO_MATCH,
    lookupId: 'pl_x',
    cacheHit: false,
    fields: emptyIntelligence.fields,
  },
  partial: {
    success: true,
    status: LOOKUP_STATUS.PARTIAL,
    lookupId: 'pl_test',
    cacheHit: true,
    fields: {
      ...emptyIntelligence.fields,
      yearBuilt: {
        value: 1998,
        source: 'Third-Party Property Data',
        verificationStatus: 'provider_supplied',
        userOverride: false,
      },
      garageSpaces: {
        value: 0,
        source: 'Third-Party Property Data',
        verificationStatus: 'provider_supplied',
        userOverride: false,
      },
    },
    disclaimers: ['Property data shown here is informational public-record data.'],
  },
  partialAllEmpty: {
    success: true,
    status: LOOKUP_STATUS.PARTIAL,
    lookupId: 'pl_y',
    fields: emptyIntelligence.fields,
  },
};

const render = (props) =>
  renderToStaticMarkup(
    createElement(PropertyIntelligenceReview, {
      eligibility: { eligible: true, reason: null },
      intelligence: null,
      lookupResult: null,
      loading: false,
      saving: false,
      error: null,
      onLookup: () => {},
      onApply: () => {},
      ...props,
    })
  );

const IDLE_BUTTON = 'Look up property details';

describe('PropertyIntelligenceReview -- lookup outcome is never silent', () => {
  it('idle (no lookup yet): only the lookup button, no status message', () => {
    const html = render({ lookupResult: null });
    expect(html).toContain(IDLE_BUTTON);
    expect(html).not.toContain('role="status"');
  });

  it('REGRESSION: provider no_match (no `fields` key) shows a no-match message, not an unchanged button-only state', () => {
    const idle = render({ lookupResult: null });
    const html = render({ lookupResult: RESPONSES.providerNoMatch });
    expect(html).not.toBe(idle);
    expect(html).toContain('role="status"');
    expect(html).toContain('No public-record match was found for this address');
  });

  it('ambiguous (no `fields` key) shows the ambiguity message', () => {
    expect(render({ lookupResult: RESPONSES.ambiguous })).toContain(
      'Multiple property records matched this address'
    );
  });

  it('server-side not_eligible explains the address requirement (incomplete) or U.S.-only scope (country)', () => {
    expect(render({ lookupResult: RESPONSES.notEligibleIncomplete })).toContain(
      'complete U.S. address (street, city and ZIP code)'
    );
    expect(render({ lookupResult: RESPONSES.notEligibleCountry })).toContain(
      'only available for U.S. addresses'
    );
  });

  it('no_match that DOES carry an all-empty fields map still shows the no-match message', () => {
    expect(render({ lookupResult: RESPONSES.fieldNoMatch })).toContain(
      'No public-record match was found for this address'
    );
  });

  it('partial (incl. a cached response) renders the returned values for review and hides the lookup button', () => {
    const html = render({ lookupResult: RESPONSES.partial });
    expect(html).toContain('Year Built');
    expect(html).toContain('value="1998"');
    expect(html).toContain('Garage Spaces');
    expect(html).toContain('value="0"'); // a real 0 is data, not "missing"
    expect(html).toContain('Confirm selected fields');
    expect(html).toContain('Property data shown here is informational public-record data.');
    expect(html).not.toContain(IDLE_BUTTON);
  });

  it('partial/full with no populated values, or an empty body, shows a "no details returned" message', () => {
    expect(render({ lookupResult: RESPONSES.partialAllEmpty })).toContain(
      'No property details were returned for this address'
    );
    expect(render({ lookupResult: {} })).toContain(
      'No property details were returned for this address'
    );
  });

  it('while loading: the button is disabled/busy and no stale outcome message is shown', () => {
    const html = render({ lookupResult: RESPONSES.providerNoMatch, loading: true });
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-busy="true"/);
    expect(html).not.toContain('No public-record match was found');
  });

  it('a request error still renders its sanitized message', () => {
    const html = render({
      error: {
        code: 'PROPERTY_PROVIDER_UNAVAILABLE',
        message: 'Property data lookup is not currently available.',
      },
    });
    expect(html).toContain('Property data lookup is not currently available.');
  });
});

describe('getLookupResultView', () => {
  it('maps every backend outcome to idle / review / message -- never idle once a response exists', () => {
    expect(getLookupResultView(null)).toEqual({ kind: 'idle' });
    expect(getLookupResultView(RESPONSES.partial)).toEqual({ kind: 'review' });
    for (const key of [
      'providerNoMatch',
      'ambiguous',
      'notEligibleIncomplete',
      'notEligibleCountry',
      'fieldNoMatch',
      'partialAllEmpty',
    ]) {
      const view = getLookupResultView(RESPONSES[key]);
      expect(view.kind, key).toBe('message');
      expect(view.message, key).toBeTruthy();
    }
    expect(getLookupResultView({ status: 'something_new' }).kind).toBe('message');
  });

  it('a full response with values is reviewable', () => {
    expect(getLookupResultView({ ...RESPONSES.partial, status: LOOKUP_STATUS.FULL }).kind).toBe(
      'review'
    );
  });
});
