/**
 * Google Places (New) autocomplete for the property-address field — the mobile counterpart of the web's browser
 * `AutocompleteSuggestion.fetchAutocompleteSuggestions` call (frontend/src/components/AddressAutocompleteField.jsx).
 * Needs an app-restricted key in EXPO_PUBLIC_GOOGLE_PLACES_KEY (Places API (New) only, restricted to the Android
 * package/SHA-1 and iOS bundle id). Without it the field stays a plain text input, exactly like the web fallback.
 * The selected place is normalized server-side (POST /reports/property-lookup/normalize), never trusted as typed.
 */
export const MIN_AUTOCOMPLETE_CHARS = 3;
const ENDPOINT = 'https://places.googleapis.com/v1/places:autocomplete';

export interface PlaceSuggestion {
  placeId: string;
  text: string;
}

export function placesKey(): string | null {
  const key = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY;
  return key && key.trim() ? key.trim() : null;
}

export function newSessionToken(): string {
  // Places session tokens are opaque strings (UUID v4 recommended).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Maps the Places (New) response to {placeId, text}; tolerant of missing fields. Exported for tests. */
export function parseSuggestions(body: unknown): PlaceSuggestion[] {
  const list = (body as { suggestions?: { placePrediction?: { placeId?: string; text?: { text?: string } } }[] })?.suggestions ?? [];
  return list
    .map((s) => ({ placeId: s.placePrediction?.placeId ?? '', text: s.placePrediction?.text?.text ?? '' }))
    .filter((s) => s.placeId && s.text);
}

export async function fetchSuggestions(input: string, sessionToken: string, signal?: AbortSignal): Promise<PlaceSuggestion[]> {
  const key = placesKey();
  if (!key || input.trim().length < MIN_AUTOCOMPLETE_CHARS) return [];
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
    body: JSON.stringify({ input: input.trim(), sessionToken }),
  });
  if (!res.ok) throw new Error(`Places ${res.status}`);
  return parseSuggestions(await res.json());
}
