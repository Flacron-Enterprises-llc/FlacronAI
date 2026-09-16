import { notificationsApi } from './notifications';

const mockApiRequest = jest.fn();
jest.mock('./client', () => ({ apiRequest: (...args: unknown[]) => mockApiRequest(...args) }));

const mockGetProfile = jest.fn();
const mockUpdateNotificationPreferences = jest.fn();
jest.mock('./users', () => ({
  usersApi: {
    getProfile: (...args: unknown[]) => mockGetProfile(...args),
    updateNotificationPreferences: (...args: unknown[]) => mockUpdateNotificationPreferences(...args),
  },
}));

beforeEach(() => {
  mockApiRequest.mockReset().mockResolvedValue({ success: true });
  mockGetProfile.mockReset();
  mockUpdateNotificationPreferences.mockReset().mockResolvedValue({ success: true });
});

describe('notificationsApi', () => {
  it('list defaults to page 1 / limit 20', async () => {
    await notificationsApi.list();
    expect(mockApiRequest).toHaveBeenCalledWith('/notifications', { params: { page: 1, limit: 20 } });
  });

  it('list clamps a caller-supplied limit above 50 down to 50', async () => {
    await notificationsApi.list(2, 500);
    expect(mockApiRequest).toHaveBeenCalledWith('/notifications', { params: { page: 2, limit: 50 } });
  });

  it('markAsRead POSTs to the per-notification read route and is idempotent', async () => {
    await notificationsApi.markAsRead('abc123');
    expect(mockApiRequest).toHaveBeenCalledWith('/notifications/abc123/read', { method: 'POST', idempotent: true });
  });

  it('markAsRead URL-encodes the notification id', async () => {
    await notificationsApi.markAsRead('a/b c');
    expect(mockApiRequest).toHaveBeenCalledWith('/notifications/a%2Fb%20c/read', {
      method: 'POST',
      idempotent: true,
    });
  });

  it('markAllAsRead POSTs to mark-all-read and is idempotent', async () => {
    await notificationsApi.markAllAsRead();
    expect(mockApiRequest).toHaveBeenCalledWith('/notifications/mark-all-read', { method: 'POST', idempotent: true });
  });

  it('getPreferences reads the notifications field off the user profile', async () => {
    mockGetProfile.mockResolvedValue({ success: true, user: { uid: '1', email: 'a@b.com', notifications: { billing: false } } });
    await expect(notificationsApi.getPreferences()).resolves.toEqual({ billing: false });
  });

  it('getPreferences returns undefined (not a default-guessed object) when never set', async () => {
    mockGetProfile.mockResolvedValue({ success: true, user: { uid: '1', email: 'a@b.com' } });
    await expect(notificationsApi.getPreferences()).resolves.toBeUndefined();
  });

  it('updatePreferences delegates to usersApi.updateNotificationPreferences', async () => {
    await notificationsApi.updatePreferences({ reviewRequested: false });
    expect(mockUpdateNotificationPreferences).toHaveBeenCalledWith({ reviewRequested: false });
  });
});
