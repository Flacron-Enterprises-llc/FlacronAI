// Tests the mapping layer only (path/method/body per call) — client.test.ts already
// covers the shared transport's retry/offline/error-classification contract in depth.
import { usersApi } from './users';

const mockApiRequest = jest.fn();
jest.mock('./client', () => ({ apiRequest: (...args: unknown[]) => mockApiRequest(...args) }));

beforeEach(() => {
  mockApiRequest.mockReset().mockResolvedValue({ success: true });
});

describe('usersApi', () => {
  it('getProfile calls GET /users/profile', async () => {
    await usersApi.getProfile();
    expect(mockApiRequest).toHaveBeenCalledWith('/users/profile');
  });

  it('updateProfile PUTs only the provided fields', async () => {
    await usersApi.updateProfile({ firstName: 'Ada', phone: '555-0100' });
    expect(mockApiRequest).toHaveBeenCalledWith('/users/profile', {
      method: 'PUT',
      body: { firstName: 'Ada', phone: '555-0100' },
    });
  });

  it('recordRegistrationConsent posts the policy version', async () => {
    await usersApi.recordRegistrationConsent('2026-01-01');
    expect(mockApiRequest).toHaveBeenCalledWith('/users/consent/registration', {
      method: 'POST',
      body: { policyVersion: '2026-01-01' },
    });
  });

  it('getUsage calls GET /users/usage', async () => {
    await usersApi.getUsage();
    expect(mockApiRequest).toHaveBeenCalledWith('/users/usage');
  });

  it('updateNotificationPreferences PUTs only the notifications field', async () => {
    await usersApi.updateNotificationPreferences({ billing: false });
    expect(mockApiRequest).toHaveBeenCalledWith('/users/profile', {
      method: 'PUT',
      body: { notifications: { billing: false } },
    });
  });

  it('propagates a rejection from the shared client unchanged', async () => {
    const err = new Error('boom');
    mockApiRequest.mockRejectedValue(err);
    await expect(usersApi.getProfile()).rejects.toBe(err);
  });
});
