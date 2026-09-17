/**
 * Wires `wizardReducer` (pure state) to the real side effects: staged-photo upload/delete,
 * draft resume from a relaunch, and final submission. Screens should only ever call the
 * functions this hook returns — no screen talks to `reportsApi` directly for wizard state.
 */
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

import { ApiRequestError } from '@/types/api';
import { reportsApi, type GenerateReportFields, type RNFile } from '@/services/api/reports';
import type { PickedAsset } from '@/features/photos/utils/fileHelpers';
import { assetToRNFile } from '@/features/photos/utils/fileHelpers';
import { canSubmit, createInitialWizardState, readyPhotoCount, wizardReducer } from './wizardReducer';
import { clearWizardDraft, loadWizardDraft, saveWizardDraft } from './wizardStorage';
import type { WizardPhoto, WizardStep } from './wizardTypes';

function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) return err.message;
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
}

export function useReportWizard() {
  const [state, dispatch] = useReducer(wizardReducer, undefined as never, () =>
    createInitialWizardState(Crypto.randomUUID())
  );
  const [resuming, setResuming] = useState(true);
  const [resumeNotice, setResumeNotice] = useState<string | null>(null);
  // Guards a relaunch-resume race: don't let an early photo-upload callback persist a draft
  // for the OLD draftId after HYDRATE has already switched to a resumed one. Updated in an
  // effect (never during render — refs must only be written outside the render phase).
  const draftIdRef = useRef(state.draftId);
  useEffect(() => {
    draftIdRef.current = state.draftId;
  }, [state.draftId]);

  // Resume a persisted draft (app relaunch mid-wizard) once on mount, re-deriving the photo
  // list from the server's own staged-photos record rather than trusting anything cached
  // locally (see wizardStorage.ts header comment).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const persisted = await loadWizardDraft();
      if (cancelled) return;
      if (!persisted) {
        setResuming(false);
        return;
      }
      dispatch({ type: 'HYDRATE', draftId: persisted.draftId, step: persisted.step, fields: persisted.fields });
      try {
        const { photos } = await reportsApi.getStagedPhotos(persisted.draftId);
        if (cancelled) return;
        const resumed: WizardPhoto[] = photos
          .filter((p) => p.status === 'uploaded' || p.status === 'duplicate')
          .map((p) => ({
            localId: p.id,
            uri: '',
            fileName: p.fileName || 'Photo',
            status: p.status,
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
        if (!cancelled) setResuming(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist step/fields on every change (debounce-free: this is a cheap AsyncStorage write,
  // not a network call) so a relaunch at any point resumes from the latest edit.
  useEffect(() => {
    if (resuming) return;
    if (state.submittedReportId) return;
    saveWizardDraft(state.draftId, state.step, state.fields);
  }, [state.draftId, state.step, state.fields, state.submittedReportId, resuming]);

  const setField = useCallback((key: string, value: string) => dispatch({ type: 'SET_FIELD', key, value }), []);
  const goToStep = useCallback((step: WizardStep) => dispatch({ type: 'SET_STEP', step }), []);

  const addPhotos = useCallback(async (assets: PickedAsset[]) => {
    const draftId = draftIdRef.current;
    for (const asset of assets) {
      const localId = Crypto.randomUUID();
      const file: RNFile = assetToRNFile(asset);
      dispatch({ type: 'ADD_PHOTO_PLACEHOLDER', localId, uri: file.uri, fileName: file.name });
      try {
        const { photo } = await reportsApi.stagePhoto(draftId, file);
        dispatch({
          type: 'PHOTO_RESOLVED',
          localId,
          serverId: photo.id,
          status: photo.status === 'duplicate' ? 'duplicate' : 'uploaded',
        });
      } catch (err) {
        dispatch({ type: 'PHOTO_FAILED', localId, error: errorMessage(err) });
      }
    }
  }, []);

  const retryPhoto = useCallback(
    async (photo: WizardPhoto) => {
      dispatch({ type: 'REMOVE_PHOTO', localId: photo.localId });
      await addPhotos([{ uri: photo.uri, fileName: photo.fileName }]);
    },
    [addPhotos]
  );

  const removePhoto = useCallback(async (photo: WizardPhoto) => {
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
  }, []);

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
      await clearWizardDraft();
    } catch (err) {
      dispatch({ type: 'SUBMIT_FAILURE', error: errorMessage(err) });
    } finally {
      submittingRef.current = false;
    }
  }, [state]);

  const startNewReport = useCallback(async () => {
    await clearWizardDraft();
    dispatch({ type: 'RESET', draftId: Crypto.randomUUID() });
  }, []);

  return {
    state,
    resuming,
    resumeNotice,
    dismissResumeNotice: () => setResumeNotice(null),
    setField,
    goToStep,
    addPhotos,
    retryPhoto,
    removePhoto,
    submit,
    startNewReport,
    readyPhotoCount: readyPhotoCount(state),
    canSubmit: canSubmit(state),
  };
}
