import { paymentApi } from './payment';

const mockApiRequest = jest.fn();
jest.mock('./client', () => ({ apiRequest: (...args: unknown[]) => mockApiRequest(...args) }));

beforeEach(() => {
  mockApiRequest.mockReset().mockResolvedValue({ success: true });
});

describe('paymentApi', () => {
  it('getCurrentSubscription calls GET /payment/current-subscription', async () => {
    await paymentApi.getCurrentSubscription();
    expect(mockApiRequest).toHaveBeenCalledWith('/payment/current-subscription');
  });

  it('getInvoices calls GET /payment/invoices', async () => {
    await paymentApi.getInvoices();
    expect(mockApiRequest).toHaveBeenCalledWith('/payment/invoices');
  });

  it('cancelSubscription POSTs and is marked idempotent (safe, no real charge)', async () => {
    await paymentApi.cancelSubscription();
    expect(mockApiRequest).toHaveBeenCalledWith('/payment/cancel-subscription', {
      method: 'POST',
      idempotent: true,
    });
  });

  it('does not expose a checkout-session or confirm-checkout method (deferred to Phase 7 IAP)', () => {
    expect((paymentApi as Record<string, unknown>).createCheckoutSession).toBeUndefined();
    expect((paymentApi as Record<string, unknown>).confirmCheckout).toBeUndefined();
  });
});
