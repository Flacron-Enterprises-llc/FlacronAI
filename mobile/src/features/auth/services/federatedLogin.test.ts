/**
 * QA federation client flow (federatedLogin.ts) with Firebase, the identity app, the API
 * and the native Google module mocked — no real project, account or network.
 */
import { ApiRequestError } from '@/types/api';
import {
  exchangeToStaging,
  identityMethods,
  reauthenticateIdentity,
  signInToIdentityWithGoogle,
  stagingSessionClaims,
} from './federatedLogin';

const identityAuth: { currentUser: unknown } = { currentUser: null };
const stagingAuth = { currentUser: null };

jest.mock('firebase/auth', () => ({
  signInWithCustomToken: jest.fn(async () => ({})),
  signInWithEmailAndPassword: jest.fn(async () => ({})),
  signInWithCredential: jest.fn(),
  getAdditionalUserInfo: jest.fn(),
  deleteUser: jest.fn(async () => {}),
  signOut: jest.fn(async () => {}),
  reauthenticateWithCredential: jest.fn(async () => ({})),
  EmailAuthProvider: { credential: (email: string, password: string) => ({ email, password, providerId: 'password' }) },
}));
jest.mock('@/services/firebase/identityClient', () => ({ getIdentityAuth: () => identityAuth }));
jest.mock('@/services/firebase/client', () => ({ getFirebaseAuth: () => stagingAuth }));
const mockExchange = jest.fn();
jest.mock('@/services/api/auth', () => ({ authApi: { federatedExchange: (...args: unknown[]) => mockExchange(...args) } }));
jest.mock('./googleSignIn', () => ({ getGoogleCredential: jest.fn(), signOutOfGoogle: jest.fn(async () => {}) }));
const mockFirebase = jest.requireMock('firebase/auth');
const mockGoogle = jest.requireMock('./googleSignIn');

const prodUser = (providers = ['password']) => ({
  email: 'user@example.com',
  providerData: providers.map((providerId) => ({ providerId })),
  getIdToken: jest.fn(async (force?: boolean) => (force ? 'fresh-prod-token' : 'prod-token')),
});

beforeEach(() => {
  jest.clearAllMocks();
  identityAuth.currentUser = null;
});

describe('exchangeToStaging', () => {
  it('refuses without a production sign-in', async () => {
    await expect(exchangeToStaging()).rejects.toMatchObject({ code: 'auth/federated-signed-out' });
    expect(mockExchange).not.toHaveBeenCalled();
  });

  it('exchanges the production ID token and signs in to STAGING with the returned custom token', async () => {
    identityAuth.currentUser = prodUser();
    mockExchange.mockResolvedValueOnce({ success: true, customToken: 'staging-custom', expiresIn: 3600, mfaVerified: false });
    await expect(exchangeToStaging()).resolves.toBe('ok');
    expect(mockExchange).toHaveBeenCalledWith('prod-token', undefined);
    expect(mockFirebase.signInWithCustomToken).toHaveBeenCalledWith(stagingAuth, 'staging-custom');
  });

  it('reports MFA owed without creating a staging session, and relays the code', async () => {
    identityAuth.currentUser = prodUser();
    mockExchange.mockRejectedValueOnce(new ApiRequestError('code needed', { status: 401, code: 'FEDERATED_MFA_REQUIRED' }));
    await expect(exchangeToStaging()).resolves.toBe('mfa_required');
    expect(mockFirebase.signInWithCustomToken).not.toHaveBeenCalled();

    mockExchange.mockResolvedValueOnce({ success: true, customToken: 'staging-custom', expiresIn: 3600, mfaVerified: true });
    await expect(exchangeToStaging({ mfaCode: '123456', forceRefresh: true })).resolves.toBe('ok');
    expect(mockExchange).toHaveBeenLastCalledWith('fresh-prod-token', '123456');
  });

  it('surfaces other backend rejections (e.g. production session revoked)', async () => {
    identityAuth.currentUser = prodUser();
    mockExchange.mockRejectedValueOnce(new ApiRequestError('rejected', { status: 401, code: 'IDENTITY_SESSION_REJECTED' }));
    await expect(exchangeToStaging()).rejects.toMatchObject({ code: 'IDENTITY_SESSION_REJECTED' });
  });
});

describe('signInToIdentityWithGoogle', () => {
  it('cancelling the account chooser signs in to nothing', async () => {
    mockGoogle.getGoogleCredential.mockResolvedValueOnce({ status: 'cancelled' });
    await expect(signInToIdentityWithGoogle()).resolves.toBe('cancelled');
    expect(mockFirebase.signInWithCredential).not.toHaveBeenCalled();
  });

  it('an existing website account signs in to the identity project', async () => {
    mockGoogle.getGoogleCredential.mockResolvedValueOnce({ status: 'success', credential: { providerId: 'google.com' } });
    mockFirebase.signInWithCredential.mockResolvedValueOnce({ user: { uid: 'u1' } });
    mockFirebase.getAdditionalUserInfo.mockReturnValueOnce({ isNewUser: false });
    await expect(signInToIdentityWithGoogle()).resolves.toBe('success');
    expect(mockFirebase.signInWithCredential).toHaveBeenCalledWith(identityAuth, { providerId: 'google.com' });
    expect(mockFirebase.deleteUser).not.toHaveBeenCalled();
  });

  it('rolls back a production account that a first-time Google sign-in just created', async () => {
    const created = { uid: 'brand-new' };
    mockGoogle.getGoogleCredential.mockResolvedValueOnce({ status: 'success', credential: { providerId: 'google.com' } });
    mockFirebase.signInWithCredential.mockResolvedValueOnce({ user: created });
    mockFirebase.getAdditionalUserInfo.mockReturnValueOnce({ isNewUser: true });
    await expect(signInToIdentityWithGoogle()).rejects.toMatchObject({ code: 'auth/federated-no-account' });
    expect(mockFirebase.deleteUser).toHaveBeenCalledWith(created);
    expect(mockFirebase.signOut).toHaveBeenCalledWith(identityAuth);
    expect(mockGoogle.signOutOfGoogle).toHaveBeenCalled();
  });
});

describe('reauthenticateIdentity (account deletion)', () => {
  it('re-verifies the PRODUCTION password, then re-exchanges with a fresh token', async () => {
    const user = prodUser();
    identityAuth.currentUser = user;
    mockExchange.mockResolvedValueOnce({ success: true, customToken: 'c2', expiresIn: 3600, mfaVerified: false });
    await expect(reauthenticateIdentity('password', { password: 'pw' })).resolves.toBe('ok');
    expect(mockFirebase.reauthenticateWithCredential).toHaveBeenCalledWith(user, { email: 'user@example.com', password: 'pw', providerId: 'password' });
    expect(user.getIdToken).toHaveBeenCalledWith(true);
  });

  it('asks for production MFA for the new sign-in; the code step does not re-prompt the password', async () => {
    identityAuth.currentUser = prodUser();
    mockExchange.mockRejectedValueOnce(new ApiRequestError('code', { status: 401, code: 'FEDERATED_MFA_REQUIRED' }));
    await expect(reauthenticateIdentity('password', { password: 'pw' })).resolves.toBe('mfa_required');
    mockExchange.mockResolvedValueOnce({ success: true, customToken: 'c3', expiresIn: 3600, mfaVerified: true });
    mockFirebase.reauthenticateWithCredential.mockClear();
    await expect(reauthenticateIdentity('password', { mfaCode: '654321' })).resolves.toBe('ok');
    expect(mockFirebase.reauthenticateWithCredential).not.toHaveBeenCalled();
    expect(mockExchange).toHaveBeenLastCalledWith('fresh-prod-token', '654321');
  });

  it('Google re-auth can be cancelled', async () => {
    identityAuth.currentUser = prodUser(['google.com']);
    mockGoogle.getGoogleCredential.mockResolvedValueOnce({ status: 'cancelled' });
    await expect(reauthenticateIdentity('google')).resolves.toBe('cancelled');
    expect(mockExchange).not.toHaveBeenCalled();
  });
});

describe('helpers', () => {
  it('identityMethods lists password / Google providers of the production identity', () => {
    expect(identityMethods(prodUser(['google.com', 'password']) as never)).toEqual(['google', 'password']);
    expect(identityMethods(null)).toEqual([]);
  });

  it('stagingSessionClaims reads the federation claims of the staging session', async () => {
    const user = { getIdTokenResult: async () => ({ claims: { federated: true, fedAt: 1700000000 } }) };
    await expect(stagingSessionClaims(user as never)).resolves.toEqual({ federated: true, fedAt: 1700000000 });
    const native = { getIdTokenResult: async () => ({ claims: {} }) };
    await expect(stagingSessionClaims(native as never)).resolves.toEqual({ federated: false, fedAt: null });
  });
});
