import { describePushStatus, INITIAL_PUSH_STATE, shouldShowPrimer, type PushState } from './pushStatus';

const s = (over: Partial<PushState>): PushState => ({ ...INITIAL_PUSH_STATE, support: 'supported', ...over });
const granted = { state: 'granted' as const, canAskAgain: true };

describe('describePushStatus', () => {
  it('unsupported environment: no action, explains why', () => {
    const v = describePushStatus(s({ support: 'unsupported-environment' }));
    expect(v.action).toBeNull();
    expect(v.label).toBe('Not available here');
  });

  it('missing configuration is distinct from unsupported', () => {
    expect(describePushStatus(s({ support: 'missing-configuration' })).label).toBe('Not configured');
    expect(describePushStatus(s({ permission: granted, token: 'missing-configuration' })).label).toBe('Not configured');
  });

  it('undetermined → explanation + enable', () => {
    const v = describePushStatus(s({ permission: { state: 'undetermined', canAskAgain: true } }));
    expect(v.action).toBe('enable');
    expect(v.description).toMatch(/ready for your review/);
  });

  it('denied but askable → enable; permanently denied → open settings', () => {
    expect(describePushStatus(s({ permission: { state: 'denied', canAskAgain: true } })).action).toBe('enable');
    const blocked = describePushStatus(s({ permission: { state: 'denied', canAskAgain: false } }));
    expect(blocked.action).toBe('open-settings');
    expect(blocked.label).toBe('Blocked');
  });

  it('offline and token errors are retryable and distinct', () => {
    expect(describePushStatus(s({ permission: granted, token: 'offline' }))).toMatchObject({
      action: 'retry',
      label: expect.stringMatching(/pending/),
    });
    expect(describePushStatus(s({ permission: granted, token: 'error' }))).toMatchObject({
      action: 'retry',
      label: expect.stringMatching(/failed/),
    });
  });

  it('backend unavailable never claims notifications will arrive', () => {
    const v = describePushStatus(s({ permission: granted, token: 'ready', registration: 'backend-unavailable' }));
    expect(v.label).toBe('Allowed');
    expect(v.description).toMatch(/send push notifications yet/);
    expect(v.tone).not.toBe('success');
  });

  it('registered → On; registration failure → retry', () => {
    expect(describePushStatus(s({ permission: granted, token: 'ready', registration: 'registered' })).label).toBe('On');
    const off = describePushStatus(s({ permission: granted, token: 'ready', registration: 'registered-delivery-off' }));
    expect(off.label).toBe('Allowed');
    expect(off.tone).not.toBe('success');
    expect(off.description).toMatch(/sending push notifications right now/);
    expect(describePushStatus(s({ permission: granted, token: 'ready', registration: 'failed' })).action).toBe('retry');
  });
});

describe('shouldShowPrimer', () => {
  it('only while undetermined, supported and not dismissed', () => {
    const undetermined = s({ permission: { state: 'undetermined', canAskAgain: true } });
    expect(shouldShowPrimer(undetermined, false)).toBe(true);
    expect(shouldShowPrimer(undetermined, true)).toBe(false);
    expect(shouldShowPrimer(s({ permission: granted }), false)).toBe(false);
    expect(shouldShowPrimer(s({ permission: { state: 'denied', canAskAgain: true } }), false)).toBe(false);
    expect(shouldShowPrimer({ ...undetermined, support: 'unsupported-environment' }, false)).toBe(false);
  });
});
