import AsyncStorage from '@react-native-async-storage/async-storage';

import { clearWizardDraft, loadWizardDraft, saveWizardDraft, wizardDraftKey } from './wizardStorage';

const UID = 'user-a';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('wizardStorage — resume after an app relaunch', () => {
  it('round-trips draftId/step/fields through AsyncStorage', async () => {
    await saveWizardDraft(UID, 'draft-1', 3, { claimNumber: 'CLM-1', insuredName: 'Jordan Rivera' });
    const loaded = await loadWizardDraft(UID);

    expect(loaded?.draftId).toBe('draft-1');
    expect(loaded?.step).toBe(3);
    expect(loaded?.fields).toEqual({ claimNumber: 'CLM-1', insuredName: 'Jordan Rivera' });
  });

  it('returns null when nothing was ever saved', async () => {
    expect(await loadWizardDraft(UID)).toBeNull();
  });

  it('clearWizardDraft removes the persisted draft entirely', async () => {
    await saveWizardDraft(UID, 'draft-1', 1, { claimNumber: 'CLM-1' });
    await clearWizardDraft(UID);
    expect(await loadWizardDraft(UID)).toBeNull();
  });

  it("a later save overwrites an earlier one rather than merging (matches the reducer's own source of truth)", async () => {
    await saveWizardDraft(UID, 'draft-1', 1, { claimNumber: 'CLM-1' });
    await saveWizardDraft(UID, 'draft-1', 2, { claimNumber: 'CLM-1', insuredName: 'Jordan Rivera' });
    const loaded = await loadWizardDraft(UID);
    expect(loaded?.step).toBe(2);
    expect(loaded?.fields).toEqual({ claimNumber: 'CLM-1', insuredName: 'Jordan Rivera' });
  });

  it('degrades to null instead of throwing when the persisted value is corrupted JSON', async () => {
    await AsyncStorage.setItem(wizardDraftKey(UID), '{not valid json');
    expect(await loadWizardDraft(UID)).toBeNull();
  });

  it('degrades to null when the persisted value is missing a draftId', async () => {
    await AsyncStorage.setItem(wizardDraftKey(UID), JSON.stringify({ step: 2, fields: {} }));
    expect(await loadWizardDraft(UID)).toBeNull();
  });
});

describe('wizardStorage — account isolation', () => {
  it("never resumes another account's draft", async () => {
    await saveWizardDraft('user-a', 'draft-a', 3, { claimNumber: 'CLM-A', insuredName: 'A Person' });
    expect(await loadWizardDraft('user-b')).toBeNull();
    expect((await loadWizardDraft('user-a'))?.draftId).toBe('draft-a');
  });

  it('ignores the legacy un-namespaced Phase 5 draft key entirely', async () => {
    await AsyncStorage.setItem(
      'flac_report_wizard_draft_v1',
      JSON.stringify({ draftId: 'legacy', step: 2, fields: { claimNumber: 'OLD' } })
    );
    expect(await loadWizardDraft(UID)).toBeNull();
  });

  it("clearing one account's draft leaves another account's draft untouched", async () => {
    await saveWizardDraft('user-a', 'draft-a', 1, {});
    await saveWizardDraft('user-b', 'draft-b', 1, {});
    await clearWizardDraft('user-a');
    expect(await loadWizardDraft('user-a')).toBeNull();
    expect((await loadWizardDraft('user-b'))?.draftId).toBe('draft-b');
  });
});
