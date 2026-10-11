import AsyncStorage from '@react-native-async-storage/async-storage';

import { prepareLocalDataForUser, userScopedKey, wipeLocalUserData } from './userDataLifecycle';

const mockClearAllPhotoCache = jest.fn();
const mockClearExportFiles = jest.fn();
jest.mock('./fileCache', () => ({
  clearAllPhotoCache: () => mockClearAllPhotoCache(),
  clearExportFiles: () => mockClearExportFiles(),
}));

const LEGACY = 'flac_report_wizard_draft_v1';

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

async function keys() {
  return [...(await AsyncStorage.getAllKeys())].sort();
}

describe('userDataLifecycle — account isolation on a shared device', () => {
  it("a different account signing in removes the previous account's data and file caches", async () => {
    await prepareLocalDataForUser('user-a');
    await AsyncStorage.setItem(userScopedKey('user-a', 'report_wizard_draft_v2'), '{"draftId":"a"}');
    jest.clearAllMocks();

    await prepareLocalDataForUser('user-b');

    expect(await AsyncStorage.getItem(userScopedKey('user-a', 'report_wizard_draft_v2'))).toBeNull();
    expect(mockClearAllPhotoCache).toHaveBeenCalled();
    expect(mockClearExportFiles).toHaveBeenCalled();
  });

  it("the same account signing in again keeps its own draft and doesn't wipe caches", async () => {
    await prepareLocalDataForUser('user-a');
    await AsyncStorage.setItem(userScopedKey('user-a', 'report_wizard_draft_v2'), '{"draftId":"a"}');
    jest.clearAllMocks();

    await prepareLocalDataForUser('user-a');

    expect(await AsyncStorage.getItem(userScopedKey('user-a', 'report_wizard_draft_v2'))).toBe('{"draftId":"a"}');
    expect(mockClearAllPhotoCache).not.toHaveBeenCalled();
  });

  it('always removes the legacy un-namespaced draft key, which any account could have read', async () => {
    await prepareLocalDataForUser('user-a');
    await AsyncStorage.setItem(LEGACY, '{"draftId":"legacy"}');
    await prepareLocalDataForUser('user-a');
    expect(await AsyncStorage.getItem(LEGACY)).toBeNull();
  });

  it('first sign-in on a device with leftover data from an unknown account clears it', async () => {
    await AsyncStorage.setItem(userScopedKey('user-x', 'report_wizard_draft_v2'), '{"draftId":"x"}');
    await AsyncStorage.setItem(LEGACY, '{"draftId":"legacy"}');

    await prepareLocalDataForUser('user-a');

    expect(await keys()).toEqual(['flac_last_signed_in_uid']);
  });

  it('explicit sign-out wipes every user-scoped key and both caches, but leaves unrelated app keys', async () => {
    await prepareLocalDataForUser('user-a');
    await AsyncStorage.setItem(userScopedKey('user-a', 'report_wizard_draft_v2'), '{}');
    await AsyncStorage.setItem('some_unrelated_app_setting', 'keep');

    await wipeLocalUserData();

    expect(await keys()).toEqual(['some_unrelated_app_setting']);
    expect(mockClearAllPhotoCache).toHaveBeenCalled();
    expect(mockClearExportFiles).toHaveBeenCalled();
  });

  it('never throws even if storage fails', async () => {
    const spy = jest.spyOn(AsyncStorage, 'getAllKeys').mockRejectedValueOnce(new Error('disk'));
    await expect(wipeLocalUserData()).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
