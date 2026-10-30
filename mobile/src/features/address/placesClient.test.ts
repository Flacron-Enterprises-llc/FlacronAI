import { fetchSuggestions, parseSuggestions } from './placesClient';

describe('places client', () => {
  it('maps Places (New) suggestions and drops incomplete ones', () => {
    expect(
      parseSuggestions({
        suggestions: [
          { placePrediction: { placeId: 'p1', text: { text: '1 Main St, Austin, TX' } } },
          { placePrediction: { placeId: '', text: { text: 'x' } } },
          { queryPrediction: { text: { text: 'q' } } },
        ],
      })
    ).toEqual([{ placeId: 'p1', text: '1 Main St, Austin, TX' }]);
    expect(parseSuggestions(null)).toEqual([]);
  });

  it('does nothing without a key or under 3 characters (manual entry fallback)', async () => {
    const prev = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY;
    delete process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY;
    await expect(fetchSuggestions('123 Main', 't')).resolves.toEqual([]);
    process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY = 'k';
    await expect(fetchSuggestions('12', 't')).resolves.toEqual([]);
    if (prev === undefined) delete process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY;
    else process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY = prev;
  });
});
