/**
 * Wires `wizardReducer` (pure state) to the real side effects: staged-photo upload/delete,
 * draft resume from a relaunch, plan photo capacity, and final submission. Screens should only
 * ever call the functions this hook returns — no screen talks to `reportsApi` directly for
 * wizard state.
 *
 * Scoped to one signed-in account (`uid`): the persisted draft is namespaced by uid (see
 * `wizardStorage.ts`), so a different account on the same device starts fresh.
 */
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

import { ApiRequestError } from '@/types/api';
import { reportsApi, type GenerateReportFields, type PhotoCapacity, type RNFile } from '@/services/api/reports';
import { clearPhotoCacheScope } from '@/services/localData/fileCache';
import type { PickedAsset } from '@/features/photos/utils/fileHelpers';
import { assetToRNFile, checkPhotoAsset } from '@/features/photos/utils/fileHelpers';
import { notifyReportsChanged } from '../reportsEvents';
import { canSubmit, createInitialWizardState, readyPhotoCount, uploadingPhotoCount, wizardReducer } from './wizardReducer';
import { clearWizardDraft, loadWizardDraft, saveWizardDraft } from './wizardStorage';
import { capacityMessage, outcomeFromStageError, outcomeFromStagedRecord } from './uploadOutcome';
import type { WizardPhoto, WizardState, WizardStep } from './wizardTypes';

function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) return err.message;
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
}

export function draftPhotoCacheScope(draftId: string): string {
  return `draft-${draftId}`;
}

export function useReportWizard(uid: string) {
  const [state, dispatch] = useReducer(wizardReducer, undefined as never, () =>
    createInitialWizardState(Crypto.randomUUID())
  );
  const [resuming, setResuming] = useState(true);
  const [resumeNotice, setResumeNotice] = useState<string | null>(null);
  const [capacity, setCapacity] = useState<PhotoCapacity | null>(null);
  const [discarding, setDiscarding] = useState(false);

  // Live mirrors of state for async callbacks. Updated in an effect (never during render —
  // refs must only be written outside the render phase). `draftIdRef` also guards a
  // relaunch-resume race: an early upload callback must not act on the OLD draftId after
  // HYDRATE switched to a resumed one.
  const draftIdRef = useRef(state.draftId);
  const stateRef = useRef<WizardState>(state);
  useEffect(() => {
    draftIdRef.current = state.draftId;
    stateRef.current = state;
  }, [state]);

  const refreshCapacity = useCallback(async () => {
    try {
      const result = await reportsApi.getPhotoCapacity(draftIdRef.current);
      setCapacity(result);
    } catch {
      // Capacity is advisory on-device — the staging route enforces the real limit itself.
    }
  }, []);

  // Resume a persisted draft (app relaunch mid-wizard) once on mount, re-deriving the photo
  // list from the server's own staged-photos record rather than trusting anything cached
  // locally (see wizardStorage.ts header comment).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const persisted = await loadWizardDraft(uid);
      if (cancelled) return;
      if (!persisted) {
        setResuming(false);
        refreshCapacity();
        return;
      }
      dispatch({ type: 'HYDRATE', draftId: persisted.draftId, step: persisted.step, fields: persisted.fields });
      draftIdRef.current = persisted.draftId;
      try {
        const { photos } = await reportsApi.getStagedPhotos(persisted.draftId);
        if (cancelled) return;
        const resumed: WizardPhoto[] = photos
          .filter((p) => p.status === 'uploaded')
          .map((p) => ({
            localId: p.id,
            uri: '',
            fileName: p.fileName || 'Photo',
            status: 'uploaded',
            serverId: p.id,
          }));
        dispatch({ type: 'REPLACE_PHOTOS', photos: resumed });
        if (resumed.length > 0 || Object.keys(persisted.fields).length > 0) {
          setResumeNotice('Resumed your in-progress report draft.');
        }
      } catch {
        // The server couldn't confirm the staged-photo list (offline, expired draft, etc.) —
        // fields are still restored above; photos simply start empty rather than risk
        // showing stale/wrong state.
      } finally {
        if (!cancelled) {
          setResuming(false);
          refreshCapacity();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, refreshCapacity]);

  // Persist step/fields on every change (debounce-free: this is a cheap AsyncStorage write,
  // not a network call) so a relaunch at any point resumes from the latest edit.
  useEffect(() => {
    if (resuming || discarding) return;
    if (state.submittedReportId) return;
    saveWizardDraft(uid, state.draftId, state.step, state.fields);
  }, [uid, state.draftId, state.step, state.fields, state.submittedReportId, resuming, discarding]);

  const setField = useCallback((key: string, value: string) => dispatch({ type: 'SET_FIELD', key, value }), []);
  const goToStep = useCallback((step: WizardStep) => dispatch({ type: 'SET_STEP', step }), []);

  const addPhotos = useCallback(
    async (assets: PickedAsset[]) => {
      const draftId = draftIdRef.current;
      const limit = capacity && !capacity.unlimited ? capacity.effectiveCapacity : null;
      // Photos already holding (or about to hold) a slot on this draft.
      let committed = readyPhotoCount(stateRef.current) + uploadingPhotoCount(stateRef.current);

      for (const asset of assets) {
        const localId = Crypto.randomUUID();
        const file: RNFile = assetToRNFile(asset);
        dispatch({ type: 'ADD_PHOTO_PLACEHOLDER', localId, uri: file.uri, fileName: file.name, mimeType: file.type });

        const check = checkPhotoAsset(asset);
        if (!check.ok) {
          dispatch({ type: 'PHOTO_FAILED', localId, error: check.message, reason: check.reason });
          continue;
        }
        if (limit !== null && committed >= limit) {
          dispatch({ type: 'PHOTO_FAILED', localId, error: capacityMessage(limit), reason: 'capacity' });
          continue;
        }

        committed += 1;
        try {
          const { photo } = await reportsApi.stagePhoto(draftId, file);
          const outcome = outcomeFromStagedRecord(photo);
          if (outcome.kind === 'failed') {
            committed -= 1;
            dispatch({ type: 'PHOTO_FAILED', localId, error: outcome.message, reason: outcome.reason, serverId: outcome.serverId });
          } else {
            if (outcome.kind === 'duplicate') committed -= 1;
            dispatch({ type: 'PHOTO_RESOLVED', localId, serverId: outcome.serverId, status: outcome.kind });
          }
        } catch (err) {
          committed -= 1;
          const outcome = outcomeFromStageError(err);
          if (outcome.kind === 'failed') {
            dispatch({ type: 'PHOTO_FAILED', localId, error: outcome.message, reason: outcome.reason });
          }
        }
      }
      // Re-sync with the server's own count (it is the authority on the plan limit).
      if (assets.length > 0) refreshCapacity();
    },
    [capacity, refreshCapacity]
  );

  const removePhoto = useCallback(
    async (photo: WizardPhoto) => {
      dispatch({ type: 'REMOVE_PHOTO', localId: photo.localId });
      if (!photo.serverId) return; // never reached the server — nothing to delete there
      try {
        await reportsApi.deleteStagedPhoto(draftIdRef.current, photo.serverId);
      } catch {
        // Best-effort — an orphaned staged photo on the server is harmless (it's just never
        // folded into this draft's eventual `generate()` call unless re-added), and re-adding
        // the removed photo locally to "undo" a failed delete would surprise the user more than
        // help them.
      }
      refreshCapacity();
    },
    [refreshCapacity]
  );

  const retryPhoto = useCallback(
    async (photo: WizardPhoto) => {
      await removePhoto(photo);
      await addPhotos([{ uri: photo.uri, fileName: photo.fileName, mimeType: photo.mimeType }]);
    },
    [addPhotos, removePhoto]
  );

  // The reducer's own SUBMIT_START no-op guard (wizardReducer.ts) protects the STATE from
  // showing a double submission, but two synchronous submit() calls fired back-to-back (a
  // fast double-tap, before React has re-rendered from the first dispatch) both close over
  // the SAME pre-dispatch `state` snapshot — the reducer guard can't stop the API call
  // itself from firing twice in that case. A synchronous ref checked-and-set immediately
  // (not through React state, which only settles after a render) is what actually prevents
  // the second `reportsApi.generate()` call.
  const submittingRef = useRef(false);
  const submit = useCallback(async () => {
    if (submittingRef.current || !canSubmit(state)) return;
    submittingRef.current = true;
    dispatch({ type: 'SUBMIT_START' });
    try {
      const fields = { ...state.fields, draftId: state.draftId } as GenerateReportFields;
      const { report } = await reportsApi.generate(fields, []);
      dispatch({ type: 'SUBMIT_SUCCESS', reportId: report.id });
      notifyReportsChanged();
      await clearWizardDraft(uid);
      clearPhotoCacheScope(draftPhotoCacheScope(state.draftId));
    } catch (err) {
      dispatch({ type: 'SUBMIT_FAILURE', error: errorMessage(err) });
    } finally {
      submittingRef.current = false;
    }
  }, [state, uid]);

  /** Throws away this draft entirely — local fields, cached thumbnails, and (best-effort) the
   * photos already staged on the server — and starts a brand-new one. */
  const discardDraft = useCallback(async () => {
    const current = stateRef.current;
    setDiscarding(true);
    try {
      await clearWizardDraft(uid);
      clearPhotoCacheScope(draftPhotoCacheScope(current.draftId));
      for (const photo of current.photos) {
        if (!photo.serverId) continue;
        try {
          await reportsApi.deleteStagedPhoto(current.draftId, photo.serverId);
        } catch {
          // Best-effort — see removePhoto.
        }
      }
      const nextDraftId = Crypto.randomUUID();
      draftIdRef.current = nextDraftId;
      dispatch({ type: 'RESET', draftId: nextDraftId });
      setResumeNotice(null);
    } finally {
      setDiscarding(false);
      refreshCapacity();
    }
  }, [uid, refreshCapacity]);

  return {
    state,
    resuming,
    discarding,
    resumeNotice,
    dismissResumeNotice: () => setResumeNotice(null),
    capacity,
    setField,
    goToStep,
    addPhotos,
    retryPhoto,
    removePhoto,
    submit,
    discardDraft,
    startNewReport: discardDraft,
    readyPhotoCount: readyPhotoCount(state),
    uploadingCount: uploadingPhotoCount(state),
    canSubmit: canSubmit(state),
  };
}
