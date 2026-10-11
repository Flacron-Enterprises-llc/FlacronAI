import {
  canSubmit,
  createInitialWizardState,
  isPristine,
  isRetryablePhoto,
  readyPhotoCount,
  wizardReducer,
} from './wizardReducer';
import type { WizardState } from './wizardTypes';

describe('wizardReducer — field edits are recoverable and never lose other data', () => {
  it('SET_FIELD only touches the one field, leaving photos/step untouched', () => {
    let state = createInitialWizardState('draft-1');
    state = wizardReducer(state, { type: 'SET_STEP', step: 3 });
    state = wizardReducer(state, { type: 'ADD_PHOTO_PLACEHOLDER', localId: 'p1', uri: 'file:///a.jpg', fileName: 'a.jpg' });
    state = wizardReducer(state, { type: 'SET_FIELD', key: 'claimNumber', value: 'CLM-1' });

    expect(state.fields.claimNumber).toBe('CLM-1');
    expect(state.step).toBe(3);
    expect(state.photos).toHaveLength(1);
  });

  it('a failed photo upload does not remove other photos or fields', () => {
    let state = createInitialWizardState('draft-1');
    state = wizardReducer(state, { type: 'SET_FIELD', key: 'insuredName', value: 'Jordan Rivera' });
    state = wizardReducer(state, { type: 'ADD_PHOTO_PLACEHOLDER', localId: 'p1', uri: 'file:///a.jpg', fileName: 'a.jpg' });
    state = wizardReducer(state, { type: 'ADD_PHOTO_PLACEHOLDER', localId: 'p2', uri: 'file:///b.jpg', fileName: 'b.jpg' });
    state = wizardReducer(state, { type: 'PHOTO_RESOLVED', localId: 'p1', serverId: 's1', status: 'uploaded' });
    state = wizardReducer(state, { type: 'PHOTO_FAILED', localId: 'p2', error: 'Network error', reason: 'network' });

    expect(state.fields.insuredName).toBe('Jordan Rivera');
    expect(state.photos.find((p) => p.localId === 'p1')?.status).toBe('uploaded');
    expect(state.photos.find((p) => p.localId === 'p2')?.status).toBe('failed');
    expect(state.photos.find((p) => p.localId === 'p2')?.error).toBe('Network error');
  });

  it('SUBMIT_FAILURE preserves every field and every already-uploaded photo', () => {
    let state = createInitialWizardState('draft-1');
    state = wizardReducer(state, { type: 'SET_FIELD', key: 'claimNumber', value: 'CLM-1' });
    state = wizardReducer(state, { type: 'ADD_PHOTO_PLACEHOLDER', localId: 'p1', uri: 'file:///a.jpg', fileName: 'a.jpg' });
    state = wizardReducer(state, { type: 'PHOTO_RESOLVED', localId: 'p1', serverId: 's1', status: 'uploaded' });
    state = wizardReducer(state, { type: 'SUBMIT_START' });
    state = wizardReducer(state, { type: 'SUBMIT_FAILURE', error: 'Server unavailable' });

    expect(state.submitting).toBe(false);
    expect(state.submitError).toBe('Server unavailable');
    expect(state.fields.claimNumber).toBe('CLM-1');
    expect(state.photos).toHaveLength(1);
    expect(state.submittedReportId).toBeNull();
  });
});

describe('wizardReducer — duplicate-submit prevention', () => {
  it('a second SUBMIT_START while already submitting is a no-op', () => {
    let state = createInitialWizardState('draft-1');
    state = wizardReducer(state, { type: 'SUBMIT_START' });
    const afterFirst = state;
    state = wizardReducer(state, { type: 'SUBMIT_START' });

    expect(state).toBe(afterFirst); // reducer returned the exact same state reference — genuinely a no-op
    expect(state.submitting).toBe(true);
  });

  it('SUBMIT_START is refused forever once this draft already produced a report', () => {
    let state = createInitialWizardState('draft-1');
    state = wizardReducer(state, { type: 'SUBMIT_START' });
    state = wizardReducer(state, { type: 'SUBMIT_SUCCESS', reportId: 'report-1' });
    const afterSuccess = state;

    state = wizardReducer(state, { type: 'SUBMIT_START' });

    expect(state).toBe(afterSuccess);
    expect(state.submitting).toBe(false);
    expect(state.submittedReportId).toBe('report-1');
  });

  it('canSubmit is false while submitting and permanently false once submitted', () => {
    let state = createInitialWizardState('draft-1');
    state = wizardReducer(state, { type: 'SET_FIELD', key: 'claimNumber', value: 'CLM-1' });
    state = wizardReducer(state, { type: 'SET_FIELD', key: 'insuredName', value: 'Jordan Rivera' });
    state = wizardReducer(state, { type: 'SET_FIELD', key: 'insuredEmail', value: 'jordan@example.com' });
    state = wizardReducer(state, { type: 'SET_FIELD', key: 'propertyAddress', value: '123 Main St' });
    state = wizardReducer(state, { type: 'SET_FIELD', key: 'lossDate', value: '2026-01-01' });
    state = wizardReducer(state, { type: 'ADD_PHOTO_PLACEHOLDER', localId: 'p1', uri: 'file:///a.jpg', fileName: 'a.jpg' });
    state = wizardReducer(state, { type: 'PHOTO_RESOLVED', localId: 'p1', serverId: 's1', status: 'uploaded' });

    expect(canSubmit(state)).toBe(true);

    state = wizardReducer(state, { type: 'SUBMIT_START' });
    expect(canSubmit(state)).toBe(false);

    state = wizardReducer(state, { type: 'SUBMIT_SUCCESS', reportId: 'report-1' });
    expect(canSubmit(state)).toBe(false);
  });

  it('canSubmit requires at least one genuinely uploaded photo — a duplicate or a failure alone never counts', () => {
    let state = filledState();
    state = wizardReducer(state, { type: 'ADD_PHOTO_PLACEHOLDER', localId: 'p1', uri: 'file:///a.jpg', fileName: 'a.jpg' });
    state = wizardReducer(state, { type: 'PHOTO_FAILED', localId: 'p1', error: 'oops', reason: 'network' });

    expect(readyPhotoCount(state)).toBe(0);
    expect(canSubmit(state)).toBe(false);

    state = wizardReducer(state, { type: 'ADD_PHOTO_PLACEHOLDER', localId: 'p2', uri: 'file:///b.jpg', fileName: 'b.jpg' });
    state = wizardReducer(state, { type: 'PHOTO_RESOLVED', localId: 'p2', serverId: 's2', status: 'duplicate' });

    expect(readyPhotoCount(state)).toBe(0);
    expect(canSubmit(state)).toBe(false);

    state = wizardReducer(state, { type: 'ADD_PHOTO_PLACEHOLDER', localId: 'p3', uri: 'file:///c.jpg', fileName: 'c.jpg' });
    state = wizardReducer(state, { type: 'PHOTO_RESOLVED', localId: 'p3', serverId: 's3', status: 'uploaded' });

    expect(readyPhotoCount(state)).toBe(1);
    expect(canSubmit(state)).toBe(true);
  });
});

function filledState(): WizardState {
  let state = createInitialWizardState('draft-1');
  for (const [key, value] of Object.entries({
    claimNumber: 'CLM-1',
    insuredName: 'Jordan Rivera',
    insuredEmail: 'jordan@example.com',
    propertyAddress: '123 Main St',
    lossDate: '2026-01-01',
  })) {
    state = wizardReducer(state, { type: 'SET_FIELD', key, value });
  }
  return state;
}

describe('wizardReducer — upload outcomes', () => {
  it('a server-rejected photo keeps its staged id (so Remove can delete it server-side) and is not retryable', () => {
    let state = filledState();
    state = wizardReducer(state, { type: 'ADD_PHOTO_PLACEHOLDER', localId: 'p1', uri: 'file:///a.jpg', fileName: 'a.jpg' });
    state = wizardReducer(state, {
      type: 'PHOTO_FAILED',
      localId: 'p1',
      error: 'File is not a valid image.',
      reason: 'rejected',
      serverId: 'staged-1',
    });

    const photo = state.photos[0];
    expect(photo.status).toBe('failed');
    expect(photo.serverId).toBe('staged-1');
    expect(isRetryablePhoto(photo)).toBe(false);
    expect(canSubmit(state)).toBe(false);
  });

  it('network and plan-limit failures are retryable; on-device format/size refusals are not', () => {
    let state = createInitialWizardState('draft-1');
    const reasons = ['network', 'capacity', 'unsupported', 'too-large'] as const;
    reasons.forEach((reason, i) => {
      state = wizardReducer(state, { type: 'ADD_PHOTO_PLACEHOLDER', localId: `p${i}`, uri: `file:///${i}.jpg`, fileName: `${i}.jpg` });
      state = wizardReducer(state, { type: 'PHOTO_FAILED', localId: `p${i}`, error: reason, reason });
    });
    expect(state.photos.map(isRetryablePhoto)).toEqual([true, true, false, false]);
  });

  it('cannot submit while any photo is still uploading, even with another photo ready', () => {
    let state = filledState();
    state = wizardReducer(state, { type: 'ADD_PHOTO_PLACEHOLDER', localId: 'p1', uri: 'file:///a.jpg', fileName: 'a.jpg' });
    state = wizardReducer(state, { type: 'PHOTO_RESOLVED', localId: 'p1', serverId: 's1', status: 'uploaded' });
    state = wizardReducer(state, { type: 'ADD_PHOTO_PLACEHOLDER', localId: 'p2', uri: 'file:///b.jpg', fileName: 'b.jpg' });

    expect(canSubmit(state)).toBe(false);
    state = wizardReducer(state, { type: 'PHOTO_RESOLVED', localId: 'p2', serverId: 's2', status: 'uploaded' });
    expect(canSubmit(state)).toBe(true);
  });
});

describe('wizardReducer — isPristine (discard prompt)', () => {
  it('a brand-new wizard with only its default selections is pristine', () => {
    expect(isPristine(createInitialWizardState('d'))).toBe(true);
  });

  it('any typed field, changed default, or added photo makes it non-pristine', () => {
    const base = createInitialWizardState('d');
    expect(isPristine(wizardReducer(base, { type: 'SET_FIELD', key: 'claimNumber', value: 'C' }))).toBe(false);
    expect(isPristine(wizardReducer(base, { type: 'SET_FIELD', key: 'lossType', value: 'Fire' }))).toBe(false);
    expect(
      isPristine(wizardReducer(base, { type: 'ADD_PHOTO_PLACEHOLDER', localId: 'p', uri: 'file:///a.jpg', fileName: 'a.jpg' }))
    ).toBe(false);
  });

  it('whitespace-only edits still count as pristine', () => {
    const base = createInitialWizardState('d');
    expect(isPristine(wizardReducer(base, { type: 'SET_FIELD', key: 'claimNumber', value: '   ' }))).toBe(true);
  });
});

describe('wizardReducer — REMOVE_PHOTO / REPLACE_PHOTOS', () => {
  it('REMOVE_PHOTO removes only the targeted photo', () => {
    let state = createInitialWizardState('draft-1');
    state = wizardReducer(state, { type: 'ADD_PHOTO_PLACEHOLDER', localId: 'p1', uri: 'file:///a.jpg', fileName: 'a.jpg' });
    state = wizardReducer(state, { type: 'ADD_PHOTO_PLACEHOLDER', localId: 'p2', uri: 'file:///b.jpg', fileName: 'b.jpg' });
    state = wizardReducer(state, { type: 'REMOVE_PHOTO', localId: 'p1' });

    expect(state.photos).toHaveLength(1);
    expect(state.photos[0].localId).toBe('p2');
  });

  it('HYDRATE resets to a fresh state for the resumed draft, applying persisted fields/step', () => {
    let state = createInitialWizardState('draft-1');
    state = wizardReducer(state, { type: 'ADD_PHOTO_PLACEHOLDER', localId: 'p1', uri: 'file:///a.jpg', fileName: 'a.jpg' });
    state = wizardReducer(state, {
      type: 'HYDRATE',
      draftId: 'draft-resumed',
      step: 3,
      fields: { claimNumber: 'CLM-9' },
    });

    expect(state.draftId).toBe('draft-resumed');
    expect(state.step).toBe(3);
    expect(state.fields.claimNumber).toBe('CLM-9');
    expect(state.photos).toHaveLength(0); // photos are re-derived separately via REPLACE_PHOTOS, not carried over
  });
});
