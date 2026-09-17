/** Pure types for the generate-report wizard's state machine (see `wizardReducer.ts`). */

export type WizardStep = 1 | 2 | 3 | 4 | 5;

export type WizardClaimType = 'Property' | 'Auto' | 'Commercial' | 'Liability' | 'Other';

/** A flat string-keyed bag matching `GenerateReportFields`' shape (`services/api/reports.ts`)
 * — deliberately loose-typed (not one interface field per backend field) since the wizard
 * only ever populates a subset depending on `claimType`/`lossType`, exactly as that file's
 * own header comment documents. */
export type WizardFields = Record<string, string>;

export type PhotoStatus = 'uploading' | 'uploaded' | 'duplicate' | 'failed';

export interface WizardPhoto {
  /** Client-generated, stable for the life of this picked photo — used as the React list key
   * and to correlate an in-flight upload with its eventual result, independent of whether the
   * server ever assigns it an id (a failed upload never gets one). */
  localId: string;
  uri: string;
  fileName: string;
  status: PhotoStatus;
  /** Set once `stagePhoto` resolves successfully (status 'uploaded' or 'duplicate'). */
  serverId?: string;
  error?: string;
}

export interface WizardState {
  step: WizardStep;
  /** Stable for the lifetime of one wizard session — generated once, persisted, and reused
   * across relaunches so `getStagedPhotos`/`generate` all refer to the same draft. */
  draftId: string;
  fields: WizardFields;
  photos: WizardPhoto[];
  submitting: boolean;
  submitError: string | null;
  /** Once set, this draft is permanently spent — the reducer refuses any further SUBMIT_START
   * (see wizardReducer.ts), matching the backend's own one-draft-one-report rule
   * (`DUPLICATE_GENERATE_REQUEST`). A fresh report always starts a brand-new draftId. */
  submittedReportId: string | null;
}

export const REQUIRED_FIELDS = ['claimNumber', 'insuredName', 'insuredEmail', 'propertyAddress', 'lossDate', 'lossType'] as const;

export const DEFAULT_FIELDS: WizardFields = {
  claimType: 'Property',
  lossType: 'Water Damage',
  reportType: 'Initial',
};

/** Persisted shape (AsyncStorage) — photos are deliberately excluded (see `wizardStorage.ts`
 * header comment): they're re-derived from the server's own staged-photos list on resume, the
 * single source of truth for what actually made it to Storage. */
export interface PersistedWizardDraft {
  draftId: string;
  step: WizardStep;
  fields: WizardFields;
  savedAt: string;
}
