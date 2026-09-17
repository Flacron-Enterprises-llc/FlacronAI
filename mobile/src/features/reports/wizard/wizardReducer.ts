/**
 * Pure reducer for the generate-report wizard — deliberately framework-free (no React, no
 * Expo, no network) so its two highest-risk behaviors are unit-testable without mounting
 * anything: (1) user-entered data survives a recoverable error (a failed field edit or a
 * failed photo upload never wipes other fields/photos), and (2) a draft can never be
 * submitted twice (see `SUBMIT_START` below) — both explicit task requirements for Phase 5's
 * wizard. `useReportWizard.ts` wires this to the real API/storage side effects.
 */
import { DEFAULT_FIELDS, type WizardFields, type WizardPhoto, type WizardState, type WizardStep } from './wizardTypes';

export type WizardAction =
  | { type: 'HYDRATE'; draftId: string; step?: WizardStep; fields?: WizardFields }
  | { type: 'SET_FIELD'; key: string; value: string }
  | { type: 'SET_FIELDS'; fields: WizardFields }
  | { type: 'SET_STEP'; step: WizardStep }
  | { type: 'ADD_PHOTO_PLACEHOLDER'; localId: string; uri: string; fileName: string }
  | { type: 'PHOTO_RESOLVED'; localId: string; serverId: string; status: 'uploaded' | 'duplicate' }
  | { type: 'PHOTO_FAILED'; localId: string; error: string }
  | { type: 'REMOVE_PHOTO'; localId: string }
  | { type: 'REPLACE_PHOTOS'; photos: WizardPhoto[] }
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMIT_SUCCESS'; reportId: string }
  | { type: 'SUBMIT_FAILURE'; error: string }
  | { type: 'RESET'; draftId: string };

export function createInitialWizardState(draftId: string): WizardState {
  return {
    step: 1,
    draftId,
    fields: { ...DEFAULT_FIELDS },
    photos: [],
    submitting: false,
    submitError: null,
    submittedReportId: null,
  };
}

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'HYDRATE':
      return {
        ...createInitialWizardState(action.draftId),
        step: action.step ?? 1,
        fields: action.fields ? { ...DEFAULT_FIELDS, ...action.fields } : { ...DEFAULT_FIELDS },
      };

    case 'SET_FIELD':
      // A field edit never touches photos/step/submit state — the exact "recoverable error
      // must not wipe other data" property under test.
      return { ...state, fields: { ...state.fields, [action.key]: action.value } };

    case 'SET_FIELDS':
      return { ...state, fields: { ...state.fields, ...action.fields } };

    case 'SET_STEP':
      return { ...state, step: action.step };

    case 'ADD_PHOTO_PLACEHOLDER':
      return {
        ...state,
        photos: [
          ...state.photos,
          { localId: action.localId, uri: action.uri, fileName: action.fileName, status: 'uploading' },
        ],
      };

    case 'PHOTO_RESOLVED':
      return {
        ...state,
        photos: state.photos.map((p) =>
          p.localId === action.localId ? { ...p, status: action.status, serverId: action.serverId, error: undefined } : p
        ),
      };

    case 'PHOTO_FAILED':
      return {
        ...state,
        photos: state.photos.map((p) => (p.localId === action.localId ? { ...p, status: 'failed', error: action.error } : p)),
      };

    case 'REMOVE_PHOTO':
      return { ...state, photos: state.photos.filter((p) => p.localId !== action.localId) };

    case 'REPLACE_PHOTOS':
      return { ...state, photos: action.photos };

    case 'SUBMIT_START':
      // Refuses to start a second submission while one is in flight, AND permanently once
      // this draft has already produced a report — the two conditions that together prevent
      // a duplicate report/double-charged credit (task requirement). The caller is
      // responsible for disabling the Generate button on `submitting`, but the reducer itself
      // is the actual guard, not just the UI affordance.
      if (state.submitting || state.submittedReportId) return state;
      return { ...state, submitting: true, submitError: null };

    case 'SUBMIT_SUCCESS':
      return { ...state, submitting: false, submitError: null, submittedReportId: action.reportId };

    case 'SUBMIT_FAILURE':
      // A failed submit is recoverable — every field and every already-uploaded photo is
      // still here, so the user can just press Generate again (or fix a validation error and
      // retry) without re-entering anything.
      return { ...state, submitting: false, submitError: action.error };

    case 'RESET':
      return createInitialWizardState(action.draftId);

    default:
      return state;
  }
}

/** Ready photos are what actually get folded into `generate()` — duplicates and failures are
 * excluded (a duplicate is already represented server-side by the original upload; a failure
 * never reached the server at all). */
export function readyPhotoCount(state: WizardState): number {
  return state.photos.filter((p) => p.status === 'uploaded' || p.status === 'duplicate').length;
}

export function canSubmit(state: WizardState): boolean {
  if (state.submitting || state.submittedReportId) return false;
  return REQUIRED_FIELDS_FILLED(state.fields) && readyPhotoCount(state) > 0;
}

function REQUIRED_FIELDS_FILLED(fields: WizardFields): boolean {
  const required = ['claimNumber', 'insuredName', 'insuredEmail', 'propertyAddress', 'lossDate', 'lossType'];
  return required.every((key) => !!(fields[key] && fields[key].trim()));
}
