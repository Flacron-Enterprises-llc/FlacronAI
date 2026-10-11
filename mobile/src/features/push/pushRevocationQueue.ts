/**
 * Persistent queue of push bindings that must be ended on the server.
 *
 * When an account signs out — or its session ends without a Sign Out (expiry, account switch) —
 * the binding id is written here FIRST (Keychain/Keystore via SecureStore, so it survives an
 * app kill), then revoked through the unauthenticated `POST /notifications/devices/revoke`.
 * If the device is offline the entry stays queued and is retried when the app next starts or
 * comes back online. Sign Out never waits on the network beyond a short cap.
 *
 * Holds only random binding ids — no push token, no uid, no personal data. Bounded: at most
 * MAX_ENTRIES entries, each dropped after MAX_AGE_MS (by then the server lease has expired
 * anyway, so the binding can no longer receive pushes).
 */
import * as SecureStore from 'expo-secure-store';

import { ApiRequestError } from '@/types/api';

const KEY = 'flac_push_pending_revocations_v1';
const MAX_ENTRIES = 10;
/** Server lease is at most 14 days (default 7; backend/utils/pushDeviceStore.js) — keep entries a little longer. */
export const MAX_AGE_MS = 15 * 24 * 60 * 60 * 1000;

interface Entry {
  bindingId: string;
  queuedAt: number;
}

async function read(): Promise<Entry[]> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((e): e is Entry => typeof e?.bindingId === 'string' && typeof e?.queuedAt === 'number')
      : [];
  } catch {
    return [];
  }
}

async function write(entries: Entry[]): Promise<void> {
  try {
    if (entries.length === 0) await SecureStore.deleteItemAsync(KEY);
    else await SecureStore.setItemAsync(KEY, JSON.stringify(entries));
  } catch {
    // Best-effort: the server lease still bounds the binding's lifetime.
  }
}

// Serializes every read-modify-write so concurrent enqueue/flush calls never lose an entry.
let chain: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => {});
  return next;
}

export function enqueueRevocation(bindingId: string, now = Date.now()): Promise<void> {
  return serialized(async () => {
    const entries = (await read()).filter((e) => e.bindingId !== bindingId && now - e.queuedAt < MAX_AGE_MS);
    entries.push({ bindingId, queuedAt: now });
    await write(entries.slice(-MAX_ENTRIES));
  });
}

export function pendingRevocations(): Promise<string[]> {
  return serialized(async () => (await read()).map((e) => e.bindingId));
}

/** A failure worth retrying later (offline, timeout, server hiccup) vs. one that never will
 * succeed (a 4xx such as a malformed id) — the latter is dropped. */
function isRetryable(err: unknown): boolean {
  if (err instanceof ApiRequestError) return ['offline', 'timeout', 'rate_limited', 'transient_server', 'unknown'].includes(err.category);
  return true;
}

/** Tries each queued revocation once. Never throws. Returns how many remain queued. */
export function flushRevocations(revoke: (bindingId: string) => Promise<unknown>, now = Date.now()): Promise<number> {
  return serialized(async () => {
    const entries = (await read()).filter((e) => now - e.queuedAt < MAX_AGE_MS);
    const remaining: Entry[] = [];
    for (const entry of entries) {
      try {
        await revoke(entry.bindingId);
      } catch (err) {
        if (isRetryable(err)) remaining.push(entry);
      }
    }
    await write(remaining);
    return remaining.length;
  });
}
