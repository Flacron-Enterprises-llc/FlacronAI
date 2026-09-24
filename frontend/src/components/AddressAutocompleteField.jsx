// Phase 46 (Property Intelligence: Address Normalization & Google Integration).
// Accessible address-autocomplete combobox. Renders plain manual-entry-
// friendly markup regardless of Google's availability -- the parent always
// keeps its own manual text field as the source of truth; this component
// only ever SUGGESTS a placeId selection on top of that, never blocks typing.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MapPin, WifiOff, AlertCircle } from 'lucide-react';
import { loadPlacesLibrary, isBrowserAutocompleteConfigured } from '../config/googleMaps';
import {
  debounce,
  createRequestSequencer,
  createSessionTokenId,
  isInputLongEnough,
  nextHighlightedIndex,
} from '../utils/addressAutocomplete';

// `onSelectPlace(placeId, description)` fires only when the user picks a
// suggestion -- free typing alone never calls it. `value`/`onChange` control
// the underlying text input like any other controlled input, so the parent
// form's existing manual-entry behavior is unchanged when Google is
// unavailable or the user ignores the suggestions entirely.
const AddressAutocompleteField = ({ value, onChange, onSelectPlace, placeholder, disabled, inputId }) => {
  const [configured, setConfigured] = useState(isBrowserAutocompleteConfigured());
  const [status, setStatus] = useState('idle'); // idle | loading | ready | empty | error | offline
  const [suggestions, setSuggestions] = useState([]);
  const [highlighted, setHighlighted] = useState(-1);
  const [open, setOpen] = useState(false);

  const placesRef = useRef(null);
  const sessionTokenRef = useRef(null);
  const sequencerRef = useRef(createRequestSequencer());
  const listboxId = `${inputId || 'address'}-listbox`;

  useEffect(() => {
    if (!configured) return;
    if (!navigator.onLine) {
      setStatus('offline');
      return;
    }
    loadPlacesLibrary()
      .then((places) => {
        placesRef.current = places;
      })
      .catch(() => {
        setConfigured(false);
        setStatus('error');
      });
  }, [configured]);

  const ensureSessionToken = () => {
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = placesRef.current?.AutocompleteSessionToken
        ? new placesRef.current.AutocompleteSessionToken()
        : createSessionTokenId();
    }
    return sessionTokenRef.current;
  };

  const fetchSuggestions = useMemo(
    () =>
      debounce(async (input) => {
        if (!placesRef.current || !isInputLongEnough(input)) {
          setSuggestions([]);
          setStatus('idle');
          return;
        }
        if (!navigator.onLine) {
          setStatus('offline');
          return;
        }
        const requestId = sequencerRef.current.next();
        setStatus('loading');
        try {
          const { AutocompleteSuggestion } = placesRef.current;
          const { suggestions: results } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input,
            sessionToken: ensureSessionToken(),
            // Data minimization: no region/location bias beyond what the
            // user typed; no unrelated report/claimant fields are ever part
            // of this request.
          });
          if (!sequencerRef.current.isLatest(requestId)) return; // stale response, dropped
          const mapped = (results || []).map((r) => ({
            placeId: r.placePrediction?.placeId,
            description: r.placePrediction?.text?.text || '',
          })).filter((s) => s.placeId);
          setSuggestions(mapped);
          setStatus(mapped.length ? 'ready' : 'empty');
          setOpen(true);
          setHighlighted(-1);
        } catch {
          if (!sequencerRef.current.isLatest(requestId)) return;
          setStatus('error');
          setSuggestions([]);
        }
      }),
    []
  );

  useEffect(() => () => fetchSuggestions.cancel(), [fetchSuggestions]);

  const handleInputChange = (e) => {
    const next = e.target.value;
    onChange(next);
    if (configured) fetchSuggestions(next);
  };

  const selectSuggestion = (suggestion) => {
    if (!suggestion) return;
    onChange(suggestion.description);
    setOpen(false);
    setSuggestions([]);
    setStatus('idle');
    onSelectPlace?.(suggestion.placeId, suggestion.description);
    // Session ends on selection -- the next lookup starts a fresh token.
    sessionTokenRef.current = null;
  };

  const handleKeyDown = (e) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      setHighlighted((h) => nextHighlightedIndex(h, suggestions.length, e.key));
    } else if (e.key === 'Enter' && highlighted >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[highlighted]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setHighlighted(-1);
    }
  };

  return (
    <div className="relative">
      <input
        id={inputId}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={highlighted >= 0 ? `${listboxId}-opt-${highlighted}` : undefined}
        className="input"
        placeholder={placeholder}
        disabled={disabled}
        value={value || ''}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        autoComplete="off"
      />
      <span className="sr-only" role="status" aria-live="polite">
        {status === 'loading' && 'Searching for addresses…'}
        {status === 'empty' && 'No address suggestions found.'}
        {status === 'error' && 'Address lookup is temporarily unavailable. You can still type the address manually.'}
        {status === 'offline' && 'You appear to be offline. You can still type the address manually.'}
      </span>

      {status === 'loading' && (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" aria-hidden="true" />
      )}

      {open && configured && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg text-sm"
        >
          {status === 'ready' &&
            suggestions.map((s, i) => (
              <li
                id={`${listboxId}-opt-${i}`}
                key={s.placeId}
                role="option"
                aria-selected={highlighted === i}
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer ${highlighted === i ? 'bg-brand/10' : 'hover:bg-gray-50'}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectSuggestion(s);
                }}
                onMouseEnter={() => setHighlighted(i)}
              >
                <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" aria-hidden="true" />
                <span className="truncate">{s.description}</span>
              </li>
            ))}
          {status === 'empty' && (
            <li className="px-3 py-2 text-gray-400">No matches — you can continue typing the full address manually.</li>
          )}
          {status === 'error' && (
            <li className="flex items-center gap-2 px-3 py-2 text-gray-400">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              Address lookup unavailable right now — continue typing manually.
            </li>
          )}
          {status === 'offline' && (
            <li className="flex items-center gap-2 px-3 py-2 text-gray-400">
              <WifiOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              You're offline — continue typing manually.
            </li>
          )}
        </ul>
      )}
    </div>
  );
};

export default AddressAutocompleteField;
