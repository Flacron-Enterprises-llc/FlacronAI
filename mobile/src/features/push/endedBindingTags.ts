/**
 * Phase 6 follow-up — remembers the push `bindingTag` of every binding this device has ENDED
 * (Sign Out, session expiry, account switch), so a push that still arrives for an ended
 * sign-in (e.g. Sign Out happened offline and the server hasn't learned of it yet) is
 * recognised as stale: no foreground banner, no navigation, no "remember for after sign-in",
 * and the queued server revocation is retried immediately.
 *
 * Only bindings explicitly ended are recorded — the app creates a fresh binding per launch, and
 * a push for a previous launch's (superseded, not ended) binding of the same signed-in account
 * is still legitimate.
 *
 * The tag is `sha256(sha256(lower(bindingId)) + ":push-tag")[0..16]`, identical to
 * `bindingTag()` in backend/utils/pushDeviceStore.js. It is not the bindingId (the revocation
 * secret) and grants nothing. Stored in AsyncStorage: no token, no uid, no personal data.
 *
 * Limitation: background/killed-app banners are drawn by the OS before any app code runs, so
 * this cannot suppress them — only the server-side lease/revocation bounds those.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

export const ENDED_TAGS_KEY = 'flac_push_ended_tags_v1';
const MAX_ENTRIES = 20;
/** Comfortably longer than the server's maximum lease (14 days). */
export const ENDED_TAG_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TAG_PATTERN = /^[0-9a-f]{16}$/;

interface Entry {
  t: string;
  at: number;
}

let cache: Entry[] | null = null;

export async function computeBindingTag(bindingId: string): Promise<string> {
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, bindingId.toLowerCase());
  const tag = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${hash}:push-tag`);
  return tag.slice(0, 16);
}

async function load(now: number): Promise<Entry[]> {
  if (!cache) {
    try {
      const raw = JSON.parse((await AsyncStorage.getItem(ENDED_TAGS_KEY)) || '[]');
      cache = Array.isArray(raw)
        ? raw.filter((e): e is Entry => !!e && typeof e.t === 'string' && TAG_PATTERN.test(e.t) && typeof e.at === 'number')
        : [];
    } catch {
      cache = [];
    }
  }
  cache = cache.filter((e) => now - e.at < ENDED_TAG_TTL_MS);
  return cache;
}

export async function rememberEndedTag(tag: string, now = Date.now()): Promise<void> {
  if (!TAG_PATTERN.test(tag)) return;
  const entries = await load(now);
  if (!entries.some((e) => e.t === tag)) entries.push({ t: tag, at: now });
  cache = entries.slice(-MAX_ENTRIES);
  await AsyncStorage.setItem(ENDED_TAGS_KEY, JSON.stringify(cache)).catch(() => {});
}

export async function isEndedTag(tag: string | null, now = Date.now()): Promise<boolean> {
  if (!tag || !TAG_PATTERN.test(tag)) return false;
  return (await load(now)).some((e) => e.t === tag);
}

/** Test-only. */
export function __resetEndedTagsCache() {
  cache = null;
}
