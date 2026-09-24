// Phase 46 (Property Intelligence: Address Normalization & Google Integration).
// Pure, DOM/Google-free helpers for the address-autocomplete widget --
// debounce, out-of-order response protection, and session-token lifecycle.
// Kept framework/provider-agnostic and independently unit-testable.

export const MIN_INPUT_LENGTH = 3;
export const DEBOUNCE_MS = 300;

// Debounces `fn`, returning a wrapper with a `.cancel()` escape hatch so a
// component can drop a pending call on unmount/blur without it firing late.
export const debounce = (fn, wait = DEBOUNCE_MS) => {
  let timer = null;
  const wrapped = (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  };
  wrapped.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return wrapped;
};

// Out-of-order response protection: every fetch gets a monotonically
// increasing id via next(); a response is only applied if isLatest(id) is
// still true by the time it resolves (a slower earlier request that
// resolves after a newer one is silently dropped, never allowed to
// overwrite fresher suggestions).
export const createRequestSequencer = () => {
  let counter = 0;
  let latest = 0;
  return {
    next: () => {
      counter += 1;
      latest = counter;
      return counter;
    },
    isLatest: (id) => id === latest,
  };
};

// A Google Places session token groups one autocomplete "typing session" +
// its terminating Place Details/Geocoding call into a single billing unit.
// This helper only manages the APP-LEVEL lifecycle (when to mint a new one,
// when a session is considered ended) -- the actual
// google.maps.places.AutocompleteSessionToken instance, if Google is
// loaded, is created by frontend/src/config/googleMaps.js so this file
// never touches `window.google` and stays testable without a DOM/Google.
export const createSessionTokenId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`;
};

// A session ends (and a new token must be minted for the next lookup) once
// a suggestion has been selected and resolved, or the user clears the
// field/abandons the lookup without selecting anything after some typing.
export const shouldRotateSessionToken = ({ justSelectedSuggestion, inputCleared }) =>
  !!justSelectedSuggestion || !!inputCleared;

export const isInputLongEnough = (value) => String(value || '').trim().length >= MIN_INPUT_LENGTH;

// Keyboard navigation reducer for an ARIA combobox listbox: given the
// current highlighted index, the suggestion count, and a key, returns the
// next highlighted index (or a special action). Pure so it's testable
// without simulating real key events on a mounted component.
export const nextHighlightedIndex = (currentIndex, count, key) => {
  if (count <= 0) return -1;
  switch (key) {
    case 'ArrowDown':
      return currentIndex >= count - 1 ? 0 : currentIndex + 1;
    case 'ArrowUp':
      return currentIndex <= 0 ? count - 1 : currentIndex - 1;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return currentIndex;
  }
};
