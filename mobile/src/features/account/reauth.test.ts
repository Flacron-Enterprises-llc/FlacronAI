import type { AuthCredential, User } from 'firebase/auth';

import { reauthenticate, reauthMethodFor, signInMethodsOf, type ReauthDeps } from './reauth';

const user = (providers: string[], email: string | null = 'a@example.com') =>
  ({
    email,
    providerData: providers.map((providerId) => ({ providerId })),
    getIdToken: jest.fn(() => Promise.resolve('fresh-token')),
  }) as unknown as User & { getIdToken: jest.Mock };

const cred = { providerId: 'x' } as unknown as AuthCredential;

function deps(over: Partial<ReauthDeps> = {}): ReauthDeps & Record<string, jest.Mock> {
  return {
    getGoogleCredential: jest.fn(() => Promise.resolve({ status: 'success' as const, credential: cred })),
    getAppleCredential: jest.fn(() => Promise.resolve({ status: 'success' as const, credential: cred })),
    reauthenticate: jest.fn(() => Promise.resolve()),
    passwordCredential: jest.fn(() => cred),
    ...over,
  } as ReauthDeps & Record<string, jest.Mock>;
}

describe('sign-in methods', () => {
  it('detects providers and picks a method this device can use', () => {
    expect(signInMethodsOf(user(['password', 'google.com']))).toEqual(['password', 'google']);
    expect(reauthMethodFor(['password', 'google'], 'android')).toBe('password');
    expect(reauthMethodFor(['google'], 'android')).toBe('google');
    expect(reauthMethodFor(['apple'], 'ios')).toBe('apple');
    // Apple-only account on Android: no way to re-authenticate on this device.
    expect(reauthMethodFor(['apple'], 'android')).toBeNull();
    expect(signInMethodsOf(null)).toEqual([]);
  });
});

describe('reauthenticate', () => {
  it('password: re-authenticates the current user and forces a fresh ID token', async () => {
    const u = user(['password']);
    const d = deps();
    expect(await reauthenticate(u, 'password', { password: 'pw' }, d)).toEqual({ ok: true });
    expect(d.passwordCredential).toHaveBeenCalledWith('a@example.com', 'pw');
    expect(d.reauthenticate).toHaveBeenCalledWith(u, cred);
    expect(u.getIdToken).toHaveBeenCalledWith(true);
  });

  it('wrong password and missing password are reported, nothing else happens', async () => {
    const u = user(['password']);
    const d = deps({ reauthenticate: jest.fn(() => Promise.reject({ code: 'auth/invalid-credential' })) });
    expect(await reauthenticate(u, 'password', { password: 'bad' }, d)).toEqual({ ok: false, cancelled: false, message: 'Incorrect password.' });
    expect(u.getIdToken).not.toHaveBeenCalled();
    expect((await reauthenticate(u, 'password', {}, deps())).ok).toBe(false);
  });

  it('Google/Apple: uses the provider sheet; cancelling is not an error', async () => {
    const u = user(['google.com']);
    const d = deps({ getGoogleCredential: jest.fn(() => Promise.resolve({ status: 'cancelled' as const })) });
    expect(await reauthenticate(u, 'google', {}, d)).toEqual({ ok: false, cancelled: true });
    expect(d.reauthenticate).not.toHaveBeenCalled();
    const a = deps();
    expect(await reauthenticate(user(['apple.com']), 'apple', {}, a)).toEqual({ ok: true });
    expect(a.getAppleCredential).toHaveBeenCalled();
  });

  it('a credential for a DIFFERENT account is rejected (account isolation)', async () => {
    const d = deps({ reauthenticate: jest.fn(() => Promise.reject({ code: 'auth/user-mismatch' })) });
    const r = await reauthenticate(user(['google.com']), 'google', {}, d);
    expect(r.ok).toBe(false);
    expect(r.ok === false && !r.cancelled && r.message).toMatch(/different account/);
  });

  it('signed out: refuses without calling Firebase', async () => {
    const d = deps();
    expect((await reauthenticate(null, 'password', { password: 'x' }, d)).ok).toBe(false);
    expect(d.reauthenticate).not.toHaveBeenCalled();
  });
});
