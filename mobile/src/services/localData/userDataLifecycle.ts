/**
 * Keeps one account's locally persisted data away from the next account on a shared device.
 *
 * Two layers, so isolation never depends on cleanup succeeding:
 * 1. Every per-user AsyncStorage key is namespaced by uid (`userScopedKey`) — another account
 *    simply never reads a key that isn't its own.
 * 2. Cleanup — an explicit Sign Out wipes all user-scoped keys plus both file caches, and a
 *    sign-in by a *different* uid than the last one (e.g. the previous session expired
 *    without a Sign Out) wipes everything that isn't the new account's own.
 *
 * Never throws: a failed cleanup must never block signing in or out.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { clearAllPhotoCache, clearExportFiles } from './fileCache';

const USER_SCOPED_PREFIX = 'flac_user:';
const LAST_UID_KEY = 'flac_last_signed_in_uid';
/** Phase 5's original, un-namespaced wizard draft key — readable by whoever signed in next.
 * Never read again; always removed. */
const LEGACY_UNSCOPED_KEYS = ['flac_report_wizard_draft_v1'];

export function userScopedKey(uid: string, name: string): string {
  return `${USER_SCOPED_PREFIX}${uid}:${name}`;
}

function belongsTo(key: string, uid: string): boolean {
  return key.startsWith(`${USER_SCOPED_PREFIX}${uid}:`);
}

async function removeStoredUserData(keepUid: string | null): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const doomed = keys.filter(
      (key) =>
        LEGACY_UNSCOPED_KEYS.includes(key) ||
        (key.startsWith(USER_SCOPED_PREFIX) && !(keepUid && belongsTo(key, keepUid)))
    );
    if (doomed.length > 0) await AsyncStorage.multiRemove(doomed);
  } catch {
    // Best-effort — see file header.
  }
}

function clearFileCaches(): void {
  clearAllPhotoCache();
  clearExportFiles();
}

/** Call once a Firebase user is known (fresh sign-in or restored session). */
export async function prepareLocalDataForUser(uid: string): Promise<void> {
  let lastUid: string | null = null;
  try {
    lastUid = await AsyncStorage.getItem(LAST_UID_KEY);
  } catch {
    lastUid = null;
  }
  if (lastUid !== uid) {
    await removeStoredUserData(uid);
    clearFileCaches();
  } else {
    // Same account as last time: its own data stays, only the legacy unscoped key goes.
    try {
      await AsyncStorage.multiRemove(LEGACY_UNSCOPED_KEYS);
    } catch {
      // Best-effort.
    }
  }
  try {
    await AsyncStorage.setItem(LAST_UID_KEY, uid);
  } catch {
    // Best-effort — worst case the next sign-in by this same uid wipes its own draft.
  }
}

/** Explicit Sign Out: nothing from this account should remain on the device. */
export async function wipeLocalUserData(): Promise<void> {
  await removeStoredUserData(null);
  clearFileCaches();
  try {
    await AsyncStorage.removeItem(LAST_UID_KEY);
  } catch {
    // Best-effort.
  }
}
