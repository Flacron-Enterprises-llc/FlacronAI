import { describe, it, expect, vi } from 'vitest';
import {
  MIN_INPUT_LENGTH,
  debounce,
  createRequestSequencer,
  createSessionTokenId,
  shouldRotateSessionToken,
  isInputLongEnough,
  nextHighlightedIndex,
} from '../utils/addressAutocomplete';

// Phase 46. Pure logic backing the autocomplete widget -- debounce,
// out-of-order protection, session-token lifecycle, keyboard navigation.

describe('debounce', () => {
  it('only invokes the wrapped function once after rapid repeated calls', async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 50);
    debounced('a');
    debounced('b');
    debounced('c');
    vi.advanceTimersByTime(60);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c');
    vi.useRealTimers();
  });

  it('cancel() drops a pending call', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 50);
    debounced('a');
    debounced.cancel();
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('createRequestSequencer (out-of-order response protection)', () => {
  it('only the most recently issued id is "latest"', () => {
    const seq = createRequestSequencer();
    const id1 = seq.next();
    const id2 = seq.next();
    expect(seq.isLatest(id1)).toBe(false);
    expect(seq.isLatest(id2)).toBe(true);
  });

  it('a slow earlier request resolving after a newer one is correctly identified as stale', () => {
    const seq = createRequestSequencer();
    const first = seq.next(); // fired first, but will resolve LAST
    const second = seq.next();
    // second resolves first (fast network)
    expect(seq.isLatest(second)).toBe(true);
    // first resolves later -- must be dropped by the caller
    expect(seq.isLatest(first)).toBe(false);
  });
});

describe('session token lifecycle', () => {
  it('createSessionTokenId returns a non-empty, unique-per-call string', () => {
    const a = createSessionTokenId();
    const b = createSessionTokenId();
    expect(typeof a).toBe('string');
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
  });

  it('a session rotates after a selection or a cleared input, never mid-typing', () => {
    expect(shouldRotateSessionToken({ justSelectedSuggestion: true, inputCleared: false })).toBe(true);
    expect(shouldRotateSessionToken({ justSelectedSuggestion: false, inputCleared: true })).toBe(true);
    expect(shouldRotateSessionToken({ justSelectedSuggestion: false, inputCleared: false })).toBe(false);
  });
});

describe('isInputLongEnough', () => {
  it(`requires at least ${MIN_INPUT_LENGTH} non-whitespace characters`, () => {
    expect(isInputLongEnough('ab')).toBe(false);
    expect(isInputLongEnough('  ab  ')).toBe(false);
    expect(isInputLongEnough('abc')).toBe(true);
    expect(isInputLongEnough('')).toBe(false);
    expect(isInputLongEnough(undefined)).toBe(false);
  });
});

describe('nextHighlightedIndex (keyboard navigation)', () => {
  it('ArrowDown moves forward and wraps past the last item', () => {
    expect(nextHighlightedIndex(-1, 3, 'ArrowDown')).toBe(0);
    expect(nextHighlightedIndex(0, 3, 'ArrowDown')).toBe(1);
    expect(nextHighlightedIndex(2, 3, 'ArrowDown')).toBe(0);
  });

  it('ArrowUp moves backward and wraps before the first item', () => {
    expect(nextHighlightedIndex(1, 3, 'ArrowUp')).toBe(0);
    expect(nextHighlightedIndex(0, 3, 'ArrowUp')).toBe(2);
  });

  it('Home/End jump to the first/last item', () => {
    expect(nextHighlightedIndex(1, 5, 'Home')).toBe(0);
    expect(nextHighlightedIndex(1, 5, 'End')).toBe(4);
  });

  it('returns -1 with no suggestions to navigate', () => {
    expect(nextHighlightedIndex(-1, 0, 'ArrowDown')).toBe(-1);
  });
});
