import AsyncStorage from '@react-native-async-storage/async-storage';

import { clearWizardDraft, loadWizardDraft, saveWizardDraft } from './wizardStorage';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('wizardStorage — resume after an app relaunch', () => {
  it('round-trips draftId/step/fields through AsyncStorage', async () => {
    await saveWizardDraft('draft-1', 3, { claimNumber: 'CLM-1', insuredName: 'Jordan Rivera' });
    const loaded = await loadWizardDraft();

    expect(loaded?.draftId).toBe('draft-1');
    expect(loaded?.step).toBe(3);
    expect(loaded?.fields).toEqual({ claimNumber: 'CLM-1', insuredName: 'Jordan Rivera' });
  });

  it('returns null when nothing was ever saved', async () => {
    expect(await loadWizardDraft()).toBeNull();
  });

  it('clearWizardDraft removes the persisted draft entirely', async () => {
    await saveWizardDraft('draft-1', 1, { claimNumber: 'CLM-1' });
    await clearWizardDraft();
    expect(await loadWizardDraft()).toBeNull();
  });

  it('a later save overwrites an earlier one rather than merging (matches the reducer\'s own source of truth)', async () => {
    await saveWizardDraft('draft-1', 1, { claimNumber: 'CLM-1' });
    await saveWizardDraft('draft-1', 2, { claimNumber: 'CLM-1', insuredName: 'Jordan Rivera' });
    const loaded = await loadWizardDraft();
    expect(loaded?.step).toBe(2);
    expect(loaded?.fields).toEqual({ claimNumber: 'CLM-1', insuredName: 'Jordan Rivera' });
  });

  it('degrades to null instead of throwing when the persisted value is corrupted JSON', async () => {
    await AsyncStorage.setItem('flac_report_wizard_draft_v1', '{not valid json');
    expect(await loadWizardDraft()).toBeNull();
  });

  it('degrades to null when the persisted value is missing a draftId', async () => {
    await AsyncStorage.setItem('flac_report_wizard_draft_v1', JSON.stringify({ step: 2, fields: {} }));
    expect(await loadWizardDraft()).toBeNull();
  });
});
