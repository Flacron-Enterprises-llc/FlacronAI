import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { ApiRequestError } from '@/types/api';
import { DeleteAccountScreen } from './DeleteAccountScreen';

// Firebase, billing and the API are mocked; no account is ever deleted.
const mockLogout = jest.fn(() => Promise.resolve());
jest.mock('@/features/auth/context/AuthProvider', () => ({
  useAuth: () => ({ logout: mockLogout, firebaseUser: { email: 'a@example.com', providerData: [{ providerId: 'password' }] } }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
  useSegments: () => ['(app)', 'account', 'delete'],
  useFocusEffect: jest.fn(),
}));
const mockBilling = {
  availability: 'blocked_store',
  platform: 'ios',
  state: {
    status: {
      success: true,
      tier: 'professional',
      stripe: { active: false, status: null, tier: null },
      store: { platform: 'ios', productId: 'p', tier: 'professional', period: 'monthly', state: 'active', expiresAt: null, autoRenew: true, isTest: false, renewsToTier: null, renewsToPeriod: null, active: true },
      team: { active: false },
      admin: { active: false, tier: null },
      canPurchaseInApp: false,
      purchaseBlockedReason: 'STORE_SUBSCRIPTION_ACTIVE',
    },
  },
  manage: jest.fn(),
  reload: jest.fn(),
};
jest.mock('@/features/billing/BillingProvider', () => ({ useBilling: () => mockBilling }));
const mockReauth = jest.fn((..._a: unknown[]): Promise<{ ok: boolean; cancelled?: boolean; message?: string }> => Promise.resolve({ ok: true }));
jest.mock('../reauth', () => ({
  ...jest.requireActual('../reauth'),
  reauthenticate: (...a: unknown[]) => mockReauth(...a),
}));
const mockDelete = jest.fn();
jest.mock('@/services/api/users', () => ({ usersApi: { deleteAccount: () => mockDelete() } }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

const deleteButton = () => screen.getByRole('button', { name: 'Delete account' });

async function fillIn() {
  await fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), 'delete');
  await fireEvent.press(screen.getByRole('checkbox'));
  await fireEvent.changeText(screen.getByLabelText('Current password'), 'pw');
}

it('explains what is deleted and that the App Store subscription is NOT cancelled', async () => {
  await render(<DeleteAccountScreen />);
  expect(screen.getByText(/does not cancel it/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Manage subscription' })).toBeTruthy();
  expect(screen.getByText(/Security audit logs/)).toBeTruthy();
});

it('cannot delete until DELETE is typed and the billing warning is acknowledged', async () => {
  await render(<DeleteAccountScreen />);
  await fireEvent.changeText(screen.getByLabelText('Current password'), 'pw');
  expect(deleteButton().props.accessibilityState.disabled).toBe(true);
  await fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');
  expect(deleteButton().props.accessibilityState.disabled).toBe(true); // ack still missing
  await fireEvent.press(screen.getByRole('checkbox'));
  expect(deleteButton().props.accessibilityState.disabled).toBe(false);
});

it('confirmed: re-authenticates, deletes, then signs out/clears local data and reports what still bills', async () => {
  mockDelete.mockResolvedValue({ success: true, message: 'ok', subscriptionsStillBilling: { stripe: false, store: 'ios' } });
  await render(<DeleteAccountScreen />);
  await fillIn();
  await act(async () => {
    await fireEvent.press(deleteButton());
  });
  await waitFor(() => expect(mockLogout).toHaveBeenCalledTimes(1));
  expect(mockReauth).toHaveBeenCalledWith(expect.anything(), 'password', { password: 'pw' });
  expect(mockDelete.mock.invocationCallOrder[0]).toBeLessThan(mockLogout.mock.invocationCallOrder[0]);
  expect(Alert.alert).toHaveBeenCalledWith('Account deleted', expect.stringMatching(/App Store subscription is still active/));
});

it('Stripe cancellation not confirmed: nothing deleted locally, user stays signed in with a retry message', async () => {
  mockDelete.mockRejectedValue(new ApiRequestError('x', { status: 502, code: 'STRIPE_CANCELLATION_FAILED', category: 'transient_server', retryable: true }));
  await render(<DeleteAccountScreen />);
  await fillIn();
  await act(async () => {
    await fireEvent.press(deleteButton());
  });
  await waitFor(() => expect(screen.getByText(/account was not deleted and nothing was removed/)).toBeTruthy());
  expect(mockLogout).not.toHaveBeenCalled();
});

it('an incomplete deletion keeps the user signed in with an honest, retryable message', async () => {
  mockDelete.mockRejectedValue(new ApiRequestError('x', { status: 500, code: 'DELETE_ACCOUNT_INCOMPLETE', category: 'transient_server', retryable: true }));
  await render(<DeleteAccountScreen />);
  await fillIn();
  await act(async () => {
    await fireEvent.press(deleteButton());
  });
  await waitFor(() => expect(screen.getByText(/safe to retry/)).toBeTruthy());
  expect(mockLogout).not.toHaveBeenCalled();
});

it('a failed re-authentication never calls the delete endpoint', async () => {
  mockReauth.mockResolvedValueOnce({ ok: false, cancelled: false, message: 'Incorrect password.' });
  await render(<DeleteAccountScreen />);
  await fillIn();
  await act(async () => {
    await fireEvent.press(deleteButton());
  });
  await waitFor(() => expect(screen.getByText('Incorrect password.')).toBeTruthy());
  expect(mockDelete).not.toHaveBeenCalled();
});
