import { ApiRequestError } from '@/types/api';
import type { VerifyResult } from '@/services/api/billing';
import { createPurchaseProcessor, createSessionStore, outcomeMessage } from './purchaseProcessor';
import type { StorePurchase } from './storeAdapter';

const TOKEN_A = '11111111-1111-4111-8111-111111111111';
const TOKEN_B = '22222222-2222-4222-8222-222222222222';

const purchase = (o: Partial<StorePurchase> = {}): StorePurchase => ({
  platform: 'ios',
  productId: 'test.pro',
  transactionId: '1000',
  purchaseToken: null,
  state: 'purchased',
  accountToken: TOKEN_A,
  native: {},
  ...o,
});

const verified = (o: Partial<VerifyResult> = {}): VerifyResult => ({
  success: true,
  tier: 'professional',
  stripe: { active: false, status: null, tier: null },
  store: null,
  team: { active: false },
  admin: { active: false, tier: null },
  canPurchaseInApp: false,
  purchaseBlockedReason: 'STORE_SUBSCRIPTION_ACTIVE',
  verified: true,
  entitled: true,
  subscription: null,
  finish: true,
  ...o,
});

const apiError = (code: string, category: ApiRequestError['category'], status = 409, retryable = false) =>
  new ApiRequestError('x', { status, code, category, retryable });

function setup() {
  const sessions = createSessionStore();
  sessions.set({ uid: 'userA', generation: 1, accountToken: TOKEN_A });
  const verify = jest.fn((..._a: unknown[]) => Promise.resolve(verified()));
  const finish = jest.fn((..._a: unknown[]) => Promise.resolve());
  const processor = createPurchaseProcessor({ verify, finish, getSession: sessions.get });
  return { sessions, verify, finish, processor };
}

describe('purchase processor', () => {
  it('verifies with the server, then finishes the transaction', async () => {
    const { processor, verify, finish } = setup();
    const out = await processor.process(purchase(), 'purchase');
    expect(out.kind).toBe('verified');
    expect(verify).toHaveBeenCalledWith({ platform: 'ios', productId: 'test.pro', transactionId: '1000', source: 'purchase' });
    expect(finish).toHaveBeenCalledTimes(1);
    expect(verify.mock.invocationCallOrder[0]).toBeLessThan(finish.mock.invocationCallOrder[0]);
  });

  it('sends the Android purchase token, never the iOS id', async () => {
    const { processor, verify } = setup();
    await processor.process(purchase({ platform: 'android', transactionId: null, purchaseToken: 'tok' }), 'restore');
    expect(verify).toHaveBeenCalledWith({ platform: 'android', productId: 'test.pro', purchaseToken: 'tok', source: 'restore' });
  });

  it('pending purchases are neither verified nor finished', async () => {
    const { processor, verify, finish } = setup();
    expect((await processor.process(purchase({ state: 'pending' }), 'purchase')).kind).toBe('pending');
    expect(verify).not.toHaveBeenCalled();
    expect(finish).not.toHaveBeenCalled();
  });

  it('server finish:false (still pending store-side) keeps the transaction open', async () => {
    const { processor, verify, finish } = setup();
    verify.mockResolvedValueOnce(verified({ finish: false, entitled: false }));
    expect((await processor.process(purchase(), 'purchase')).kind).toBe('pending');
    expect(finish).not.toHaveBeenCalled();
  });

  it("a purchase made with another account's token is not submitted for this account", async () => {
    const { processor, verify, finish } = setup();
    expect((await processor.process(purchase({ accountToken: TOKEN_B }), 'restore')).kind).toBe('other_account');
    expect(verify).not.toHaveBeenCalled();
    expect(finish).not.toHaveBeenCalled();
  });

  it.each([
    ['ACCOUNT_MISMATCH', 'conflict', 409, false, 'other_account'],
    ['PURCHASE_OWNED_BY_OTHER_ACCOUNT', 'conflict', 409, false, 'owned_elsewhere'],
    ['STORE_UNAVAILABLE', 'transient_server', 503, true, 'retry_later'],
    [null, 'offline', 0, true, 'retry_later'],
    ['INVALID_PURCHASE', 'validation', 422, false, 'failed'],
    ['PRODUCT_MISMATCH', 'validation', 422, false, 'failed'],
  ] as const)('server %s -> %s, never finished', async (code, category, status, retryable, kind) => {
    const { processor, verify, finish } = setup();
    verify.mockRejectedValueOnce(apiError(code as string, category, status, retryable));
    expect((await processor.process(purchase(), 'purchase')).kind).toBe(kind);
    expect(finish).not.toHaveBeenCalled();
  });

  it('a retry after a transient failure succeeds without double-processing', async () => {
    const { processor, verify, finish } = setup();
    verify.mockRejectedValueOnce(apiError('STORE_UNAVAILABLE', 'transient_server', 503, true));
    expect((await processor.process(purchase(), 'purchase')).kind).toBe('retry_later');
    expect((await processor.process(purchase(), 'restore')).kind).toBe('verified');
    expect(finish).toHaveBeenCalledTimes(1);
  });

  it('the same transaction is never processed twice concurrently', async () => {
    const { processor, verify } = setup();
    let release!: () => void;
    verify.mockImplementationOnce(() => new Promise((r) => (release = () => r(verified()))));
    const first = processor.process(purchase(), 'purchase');
    expect((await processor.process(purchase(), 'restore')).kind).toBe('duplicate');
    release();
    expect((await first).kind).toBe('verified');
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it('account switch during verification: result is not applied to the new session', async () => {
    const { processor, verify, finish, sessions } = setup();
    let release!: () => void;
    verify.mockImplementationOnce(() => new Promise((r) => (release = () => r(verified()))));
    const pending = processor.process(purchase(), 'purchase');
    sessions.end(1);
    sessions.set({ uid: 'userB', generation: 2, accountToken: TOKEN_B });
    release();
    expect((await pending).kind).toBe('stale');
    // The server already bound it to account A durably, so finishing is still correct.
    expect(finish).toHaveBeenCalledTimes(1);
  });

  it('signed out: nothing is processed and the transaction stays for later', async () => {
    const { processor, verify, sessions } = setup();
    sessions.end(1);
    expect((await processor.process(purchase(), 'purchase')).kind).toBe('stale');
    expect(verify).not.toHaveBeenCalled();
  });

  it('a failed finish does not lose the server result', async () => {
    const { processor, finish } = setup();
    finish.mockRejectedValueOnce(new Error('store busy'));
    expect((await processor.process(purchase(), 'purchase')).kind).toBe('verified');
  });

  it('messages never claim access the server did not confirm', () => {
    expect(outcomeMessage({ kind: 'verified', result: verified({ entitled: false }) }, 'the App Store')?.tone).toBe('info');
    expect(outcomeMessage({ kind: 'retry_later' }, 'Google Play')?.text).toMatch(/won't be charged twice/);
    expect(outcomeMessage({ kind: 'owned_elsewhere' }, 'Google Play')?.text).toMatch(/different FlacronAI account/);
    expect(outcomeMessage({ kind: 'duplicate' }, 'x')).toBeNull();
  });
});
