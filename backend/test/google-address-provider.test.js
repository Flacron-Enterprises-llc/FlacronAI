const test = require('node:test');
const assert = require('node:assert/strict');
const provider = require('../services/addressProviders/googleAddressProvider');

// Phase 46. Google adapter: request construction (server key, field mask,
// never the browser key), error categorization, and address_components
// mapping across multiple countries. `fetchImpl` is always injected -- this
// file NEVER makes a real network call.

const withServerKey = (fn) => async () => {
  const prev = process.env.GOOGLE_MAPS_SERVER_KEY;
  process.env.GOOGLE_MAPS_SERVER_KEY = 'test-fake-server-key';
  try {
    await fn();
  } finally {
    if (prev === undefined) delete process.env.GOOGLE_MAPS_SERVER_KEY;
    else process.env.GOOGLE_MAPS_SERVER_KEY = prev;
  }
};

test('getPlaceDetails throws ADDRESS_PROVIDER_UNAVAILABLE with no server key configured, without ever calling fetch', async () => {
  const prev = process.env.GOOGLE_MAPS_SERVER_KEY;
  delete process.env.GOOGLE_MAPS_SERVER_KEY;
  let called = false;
  await assert.rejects(
    () => provider.getPlaceDetails('place-1', { fetchImpl: async () => { called = true; } }),
    (err) => err.code === 'ADDRESS_PROVIDER_UNAVAILABLE'
  );
  assert.equal(called, false);
  if (prev !== undefined) process.env.GOOGLE_MAPS_SERVER_KEY = prev;
});

test('getPlaceDetails rejects a blank placeId as ADDRESS_INVALID_INPUT', withServerKey(async () => {
  await assert.rejects(
    () => provider.getPlaceDetails('   ', { fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }),
    (err) => err.code === 'ADDRESS_INVALID_INPUT'
  );
}));

test('getPlaceDetails builds a Geocoding request with the server key, a field mask, and never the literal address text as a URL param beyond place_id', withServerKey(async () => {
  let capturedUrl;
  const fetchImpl = async (url) => {
    capturedUrl = url;
    return { ok: true, json: async () => ({ status: 'OK', results: [{ formatted_address: 'x', address_components: [] }] }) };
  };
  await provider.getPlaceDetails('ChIJ-place-id', { fetchImpl });
  const parsed = new URL(capturedUrl);
  assert.equal(parsed.hostname, 'maps.googleapis.com');
  assert.equal(parsed.searchParams.get('place_id'), 'ChIJ-place-id');
  assert.equal(parsed.searchParams.get('key'), 'test-fake-server-key');
  assert.ok(parsed.searchParams.get('fields').includes('address_components'));
}));

test('Geocoding status mapping: ZERO_RESULTS -> ADDRESS_NO_MATCH, OVER_QUERY_LIMIT -> ADDRESS_QUOTA_EXCEEDED, billing-denied -> ADDRESS_BILLING_DISABLED, other REQUEST_DENIED -> ADDRESS_PERMISSION_DENIED', withServerKey(async () => {
  const run = async (body) =>
    provider.getPlaceDetails('p', { fetchImpl: async () => ({ ok: true, json: async () => body }) }).catch((e) => e.code);

  assert.equal(await run({ status: 'ZERO_RESULTS' }), 'ADDRESS_NO_MATCH');
  assert.equal(await run({ status: 'OVER_QUERY_LIMIT' }), 'ADDRESS_QUOTA_EXCEEDED');
  assert.equal(await run({ status: 'REQUEST_DENIED', error_message: 'This API project is not authorized to use this API. Billing has not been enabled.' }), 'ADDRESS_BILLING_DISABLED');
  assert.equal(await run({ status: 'REQUEST_DENIED', error_message: 'invalid key' }), 'ADDRESS_PERMISSION_DENIED');
  assert.equal(await run({ status: 'INVALID_REQUEST' }), 'ADDRESS_INVALID_INPUT');
  assert.equal(await run({ status: 'UNKNOWN_ERROR' }), 'ADDRESS_MALFORMED_RESPONSE');
}));

test('a 5xx transport response is ADDRESS_PROVIDER_ERROR (transient)', withServerKey(async () => {
  await assert.rejects(
    () => provider.getPlaceDetails('p', { fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }) }),
    (err) => err.code === 'ADDRESS_PROVIDER_ERROR' && err.transient === true
  );
}));

test('a network throw maps to ADDRESS_NETWORK_ERROR, an AbortError maps to ADDRESS_TIMEOUT -- never the raw error escapes', withServerKey(async () => {
  await assert.rejects(
    () => provider.getPlaceDetails('p', { fetchImpl: async () => { throw new Error('ECONNRESET: 1.2.3.4 refused key=SECRET'); } }),
    (err) => err.code === 'ADDRESS_NETWORK_ERROR' && !err.message.includes('SECRET')
  );
  await assert.rejects(
    () => provider.getPlaceDetails('p', { fetchImpl: async () => { const e = new Error('timeout'); e.name = 'AbortError'; throw e; } }),
    (err) => err.code === 'ADDRESS_TIMEOUT'
  );
}));

test('non-JSON body maps to ADDRESS_MALFORMED_RESPONSE', withServerKey(async () => {
  await assert.rejects(
    () => provider.getPlaceDetails('p', { fetchImpl: async () => ({ ok: true, json: async () => { throw new Error('not json'); } }) }),
    (err) => err.code === 'ADDRESS_MALFORMED_RESPONSE'
  );
}));

test('multiple OK results are surfaced as ambiguous data, not thrown -- requires explicit user review', withServerKey(async () => {
  const result = await provider.getPlaceDetails('p', {
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ status: 'OK', results: [{ formatted_address: 'a' }, { formatted_address: 'b' }] }),
    }),
  });
  assert.equal(result.ambiguous, true);
  assert.equal(result.candidateCount, 2);
}));

// --- normalizeAddress: address_components mapping ---

const usComponents = [
  { long_name: '1425', short_name: '1425', types: ['street_number'] },
  { long_name: 'Maple Street', short_name: 'Maple St', types: ['route'] },
  { long_name: 'Austin', short_name: 'Austin', types: ['locality', 'political'] },
  { long_name: 'Travis County', short_name: 'Travis County', types: ['administrative_area_level_2', 'political'] },
  { long_name: 'Texas', short_name: 'TX', types: ['administrative_area_level_1', 'political'] },
  { long_name: '78701', short_name: '78701', types: ['postal_code'] },
  { long_name: '2345', short_name: '2345', types: ['postal_code_suffix'] },
  { long_name: 'United States', short_name: 'US', types: ['country', 'political'] },
];

test('normalizeAddress: full US address maps every field correctly', () => {
  const values = provider.normalizeAddress({
    raw: {
      formatted_address: '1425 Maple St, Austin, TX 78701, USA',
      address_components: usComponents,
      geometry: { location: { lat: 30.2672, lng: -97.7431 } },
      place_id: 'place-us-1',
    },
  });
  assert.equal(values.addressLine1, '1425 Maple Street');
  assert.equal(values.city, 'Austin');
  assert.equal(values.county, 'Travis County');
  assert.equal(values.state, 'Texas');
  assert.equal(values.stateCode, 'TX');
  assert.equal(values.postalCode, '78701');
  assert.equal(values.postalCodeSuffix, '2345');
  assert.equal(values.countryCode, 'US');
  assert.equal(values.latitude, 30.2672);
  assert.equal(values.longitude, -97.7431);
  assert.equal(values.placeId, 'place-us-1');
});

test('normalizeAddress: Canadian address maps province via administrative_area_level_1', () => {
  const values = provider.normalizeAddress({
    raw: {
      formatted_address: '123 Queen St W, Toronto, ON M5H 2M9, Canada',
      address_components: [
        { long_name: '123', short_name: '123', types: ['street_number'] },
        { long_name: 'Queen Street West', short_name: 'Queen St W', types: ['route'] },
        { long_name: 'Toronto', short_name: 'Toronto', types: ['locality', 'political'] },
        { long_name: 'Ontario', short_name: 'ON', types: ['administrative_area_level_1', 'political'] },
        { long_name: 'M5H 2M9', short_name: 'M5H 2M9', types: ['postal_code'] },
        { long_name: 'Canada', short_name: 'CA', types: ['country', 'political'] },
      ],
      geometry: { location: { lat: 43.6501, lng: -79.3856 } },
      place_id: 'place-ca-1',
    },
  });
  assert.equal(values.city, 'Toronto');
  assert.equal(values.stateCode, 'ON');
  assert.equal(values.countryCode, 'CA');
  assert.equal(values.postalCode, 'M5H 2M9');
});

test('normalizeAddress: UK address falls back to postal_town when locality is absent', () => {
  const values = provider.normalizeAddress({
    raw: {
      formatted_address: '10 Downing St, London SW1A 2AA, UK',
      address_components: [
        { long_name: '10', short_name: '10', types: ['street_number'] },
        { long_name: 'Downing Street', short_name: 'Downing St', types: ['route'] },
        { long_name: 'London', short_name: 'London', types: ['postal_town'] },
        { long_name: 'England', short_name: 'England', types: ['administrative_area_level_1', 'political'] },
        { long_name: 'SW1A 2AA', short_name: 'SW1A 2AA', types: ['postal_code'] },
        { long_name: 'United Kingdom', short_name: 'GB', types: ['country', 'political'] },
      ],
      geometry: { location: { lat: 51.5034, lng: -0.1276 } },
      place_id: 'place-gb-1',
    },
  });
  assert.equal(values.city, 'London', 'postal_town used as the UK city equivalent');
  assert.equal(values.countryCode, 'GB');
});

test('normalizeAddress: subpremise/unit is mapped to addressLine2', () => {
  const values = provider.normalizeAddress({
    raw: {
      formatted_address: 'Unit 4B, 500 Ocean Ave, Miami, FL 33139',
      address_components: [
        ...usComponents,
        { long_name: '4B', short_name: '4B', types: ['subpremise'] },
      ],
      geometry: { location: { lat: 25.7907, lng: -80.13 } },
      place_id: 'place-unit-1',
    },
  });
  assert.equal(values.addressLine2, '4B');
});

test('normalizeAddress: missing city/postal code stay empty strings, not invented', () => {
  const values = provider.normalizeAddress({
    raw: {
      formatted_address: 'Somewhere remote',
      address_components: [{ long_name: 'Australia', short_name: 'AU', types: ['country', 'political'] }],
      geometry: {},
      place_id: 'place-remote-1',
    },
  });
  assert.equal(values.city, '');
  assert.equal(values.postalCode, '');
  assert.equal(values.latitude, null);
  assert.equal(values.longitude, null);
  assert.equal(values.countryCode, 'AU');
});

test('normalizeAddress throws ADDRESS_MALFORMED_RESPONSE for a malformed/empty provider result', () => {
  assert.throws(() => provider.normalizeAddress(null), (err) => err.code === 'ADDRESS_MALFORMED_RESPONSE');
  assert.throws(() => provider.normalizeAddress({}), (err) => err.code === 'ADDRESS_MALFORMED_RESPONSE');
});
