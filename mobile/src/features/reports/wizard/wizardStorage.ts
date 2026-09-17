/**
 * Persists just enough of the generate-report wizard's state (draftId, step, form fields) so
 * an app relaunch mid-wizard can resume instead of losing everything (task requirement:
 * "Preserve user-entered wizard data during recoverable errors" — a relaunch is the most
 * extreme case of that). Deliberately excludes photos: the server's own staged-photos list
 * (`GET /reports/photos/stage/:draftId`, already designed for exactly this — see its comment
 * in `services/api/reports.ts`) is the single source of truth for what actually uploaded, so
 * re-deriving from there on resume can never drift from reality the way a locally-cached
 * photo list could (e.g. an upload that finished server-side after the app was killed
 * mid-request). AsyncStorage, not SecureStore: this is inspection-report form text, not a
 * credential (mirrors the distinction `services/README.md` draws for `mfaAssertionStorage.ts`).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { PersistedWizardDraft, WizardFields, WizardStep } from './wizardTypes';

const DRAFT_KEY = 'flac_report_wizard_draft_v1';

export async function saveWizardDraft(draftId: string, step: WizardStep, fields: WizardFields): Promise<void> {
  try {
    const payload: PersistedWizardDraft = { draftId, step, fields, savedAt: new Date().toISOString() };
    await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
  } catch {
    // Best-effort — losing the persisted draft only means a relaunch starts fresh, never a
    // crash or a silently-corrupted in-memory state.
  }
}

export async function loadWizardDraft(): Promise<PersistedWizardDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedWizardDraft>;
    if (!parsed || typeof parsed.draftId !== 'string' || !parsed.draftId) return null;
    return {
      draftId: parsed.draftId,
      step: (parsed.step as WizardStep) ?? 1,
      fields: parsed.fields ?? {},
      savedAt: parsed.savedAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function clearWizardDraft(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to do — see saveWizardDraft.
  }
}
