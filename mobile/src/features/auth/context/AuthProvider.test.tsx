import { act, render, waitFor, fireEvent } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { AuthProvider, useAuth } from './AuthProvider';

// AuthProvider talks to three external systems: Firebase Auth, the backend API, and
// (indirectly, via imports it doesn't call in these tests) the social sign-in services.
// Each is mocked at its own module boundary so this suite exercises AuthProvider's own
// state-machine wiring — auth-state restoration, the email-verification/social-provider
// gate, and logout cleanup — without needing a real Firebase project or backend.

jest.mock('@/config/firebaseConfig', () => ({
  isFirebaseConfigured: () => true,
}));

jest.mock('@/services/firebase/client', () => ({
  getFirebaseAuth: () => ({ currentUser: null }),
}));

let capturedAuthStateCallback: ((user: unknown) => void | Promise<void>) | null = null;
const mockSignInWithEmailAndPassword = jest.fn();
const mockSignOut = jest.fn(() => Promise.resolve());

// Every mock below is wrapped in an arrow function (`(...) => mockX(...)`) rather than
// referencing the `mockX` const directly as the export value. This isn't stylistic: the
// jest.mock() factory below runs exactly once, EARLY — during AuthProvider.tsx's own
// `import 'firebase/auth'` at the top of this file, which resolves before any of this
// file's own `const mockX = jest.fn()` lines have executed. A direct reference
// (`signOut: mockSignOut`) would bake in whatever `mockSignOut` was AT THAT INSTANT
// (`undefined`, since the `const` hasn't run yet) into the cached mock module object
// forever. A wrapper closure defers reading `mockSignOut` until the wrapper is actually
// CALLED — by then, well into a test, the real `const` has long since been assigned.
jest.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, callback: (user: unknown) => void | Promise<void>) => {
    capturedAuthStateCallback = callback;
    return () => {
      capturedAuthStateCallback = null;
    };
  },
  signInWithEmailAndPassword: (email: string, password: string) => mockSignInWithEmailAndPassword(email, password),
  createUserWithEmailAndPassword: jest.fn(),
  signOut: () => mockSignOut(),
  updateProfile: jest.fn(),
}));

const mockGetProfile = jest.fn();
jest.mock('@/services/api/users', () => ({
  usersApi: { getProfile: () => mockGetProfile() },
}));

const mockVerify = jest.fn(() => Promise.resolve());
const mockLogout = jest.fn(() => Promise.resolve());
jest.mock('@/services/api/auth', () => ({
  authApi: {
    verify: () => mockVerify(),
    logout: () => mockLogout(),
  },
}));

// MFA-assertion wiring (2026-09-08 fix, AUTHENTICATION_ARCHITECTURE.md §12) — mocked at
// its own module boundary, same reasoning as the other services above: this suite
// exercises AuthProvider's own wiring (does it call these at the right moments?), not
// SecureStore's real behavior (covered separately in mfaAssertionStorage.test.ts).
const mockSetMfaAssertion = jest.fn((_token: string) => Promise.resolve());
const mockClearMfaAssertion = jest.fn(() => Promise.resolve());
jest.mock('@/services/mfaAssertionStorage', () => ({
  setMfaAssertion: (token: string) => mockSetMfaAssertion(token),
  clearMfaAssertion: () => mockClearMfaAssertion(),
}));

let capturedMfaRequiredListener: (() => void) | null = null;
jest.mock('@/services/api/client', () => ({
  subscribeToMfaRequired: (listener: () => void) => {
    capturedMfaRequiredListener = listener;
    return () => {
      capturedMfaRequiredListener = null;
    };
  },
}));

function Probe() {
  const { status, firebaseUser, logout, markMfaVerified } = useAuth();
  return (
    <>
      <Text testID="status">{status}</Text>
      <Text testID="email">{firebaseUser?.email ?? 'none'}</Text>
      <Pressable testID="logout-button" onPress={() => logout()}>
        <Text>Sign out</Text>
      </Pressable>
      <Pressable testID="mfa-verify-button" onPress={() => markMfaVerified('fresh-assertion')}>
        <Text>Verify MFA</Text>
      </Pressable>
    </>
  );
}

// @testing-library/react-native v14's `render` is async (it awaits an internal `act()`
// around the initial render) — every call site below must `await` it.
function renderProvider() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
}

/** Invokes the captured onAuthStateChanged callback and waits for the async work it
 * kicks off (the profile fetch) to fully settle, inside a single `act()` boundary —
 * awaiting the callback's own returned promise here is what prevents the
 * "overlapping act() calls" warning React emits when async state updates leak past the
 * `act()` call that triggered them. */
async function signInFakeUser(overrides: Record<string, unknown> = {}) {
  const fakeUser = {
    uid: 'u1',
    email: 'jordan@example.com',
    emailVerified: true,
    providerData: [{ providerId: 'password' }],
    ...overrides,
  };
  await act(async () => {
    await capturedAuthStateCallback?.(fakeUser);
  });
  return fakeUser;
}

async function signOutFake() {
  await act(async () => {
    await capturedAuthStateCallback?.(null);
  });
}

beforeEach(() => {
  capturedAuthStateCallback = null;
  capturedMfaRequiredListener = null;
  mockSignInWithEmailAndPassword.mockClear();
  mockSignOut.mockClear();
  mockGetProfile.mockClear();
  mockVerify.mockClear();
  mockLogout.mockClear();
  mockSetMfaAssertion.mockClear();
  mockClearMfaAssertion.mockClear();
});

describe('AuthProvider — auth-state restoration', () => {
  it('starts in "loading" and resolves to "signed-out" once Firebase reports no session', async () => {
    const { getByTestId } = await renderProvider();
    expect(getByTestId('status').props.children).toBe('loading');

    await signOutFake();

    expect(getByTestId('status').props.children).toBe('signed-out');
  });

  it('restores a persisted session: a real Firebase user + a successful profile fetch resolves to "authenticated"', async () => {
    mockGetProfile.mockResolvedValue({ user: { uid: 'u1', email: 'jordan@example.com', tier: 'starter' } });
    const { getByTestId } = await renderProvider();

    await signInFakeUser();

    expect(getByTestId('status').props.children).toBe('authenticated');
    expect(getByTestId('email').props.children).toBe('jordan@example.com');
    expect(mockGetProfile).toHaveBeenCalled();
  });
});

describe('AuthProvider — unverified-user blocking', () => {
  it('blocks an unverified email/password user behind "needs-email-verification", even with a loaded profile', async () => {
    mockGetProfile.mockResolvedValue({ user: { uid: 'u1', email: 'jordan@example.com', tier: 'starter' } });
    const { getByTestId } = await renderProvider();

    await signInFakeUser({ emailVerified: false, providerData: [{ providerId: 'password' }] });

    expect(getByTestId('status').props.children).toBe('needs-email-verification');
  });

  it('does NOT block a Google-authenticated user on email verification', async () => {
    mockGetProfile.mockResolvedValue({ user: { uid: 'u1', email: 'jordan@example.com', tier: 'starter' } });
    const { getByTestId } = await renderProvider();

    await signInFakeUser({ emailVerified: false, providerData: [{ providerId: 'google.com' }] });

    expect(getByTestId('status').props.children).toBe('authenticated');
  });
});

describe('AuthProvider — logout cleanup (2026-09-08 rollout-safety correction: local-only, matches web)', () => {
  it('signs out of Firebase and clears session/MFA state WITHOUT calling the backend /auth/logout endpoint', async () => {
    mockGetProfile.mockResolvedValue({ user: { uid: 'u1', email: 'jordan@example.com', tier: 'starter' } });
    const { getByTestId } = await renderProvider();
    await signInFakeUser();
    expect(getByTestId('status').props.children).toBe('authenticated');

    await act(async () => {
      fireEvent.press(getByTestId('logout-button'));
    });

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(getByTestId('status').props.children).toBe('signed-out'));
    expect(getByTestId('email').props.children).toBe('none');
    expect(mockClearMfaAssertion).toHaveBeenCalled();
    // The regression this whole describe block guards against: ordinary Sign Out must
    // never reach the backend's all-sessions-adjacent /auth/logout endpoint (see
    // AuthProvider.tsx's file header and AUTHENTICATION_ARCHITECTURE.md §12.3).
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('local sign-out completes even though the backend logout mock exists and is never invoked', async () => {
    // Guards against a future regression re-adding the backend call without also
    // re-adding its best-effort error handling -- logout must never depend on network
    // reachability at all, not just tolerate a failure.
    mockGetProfile.mockResolvedValue({ user: { uid: 'u1', email: 'jordan@example.com', tier: 'starter' } });
    mockLogout.mockRejectedValueOnce(new Error('network blip'));
    const { getByTestId } = await renderProvider();
    await signInFakeUser();
    expect(getByTestId('status').props.children).toBe('authenticated');

    await act(async () => {
      fireEvent.press(getByTestId('logout-button'));
    });

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(getByTestId('status').props.children).toBe('signed-out'));
    expect(mockLogout).not.toHaveBeenCalled();
  });
});

describe('AuthProvider — MFA assertion wiring (2026-09-08 fix)', () => {
  it('markMfaVerified stores the assertion and unblocks "needs-mfa" -> "authenticated"', async () => {
    mockGetProfile.mockResolvedValue({
      user: { uid: 'u1', email: 'jordan@example.com', tier: 'starter', mfaEnabled: true },
    });
    const { getByTestId } = await renderProvider();
    await signInFakeUser();

    expect(getByTestId('status').props.children).toBe('needs-mfa');

    await act(async () => {
      fireEvent.press(getByTestId('mfa-verify-button'));
    });

    expect(mockSetMfaAssertion).toHaveBeenCalledWith('fresh-assertion');
    expect(getByTestId('status').props.children).toBe('authenticated');
  });

  it('a backend MFA_REQUIRED notification drops "authenticated" back to "needs-mfa" without a fresh sign-in', async () => {
    mockGetProfile.mockResolvedValue({
      user: { uid: 'u1', email: 'jordan@example.com', tier: 'starter', mfaEnabled: true },
    });
    const { getByTestId } = await renderProvider();
    await signInFakeUser();
    await act(async () => {
      fireEvent.press(getByTestId('mfa-verify-button'));
    });
    expect(getByTestId('status').props.children).toBe('authenticated');

    // Simulates client.ts's apiRequest noticing a 403 MFA_REQUIRED on some unrelated
    // protected call (assertion expired/revoked) and notifying subscribers.
    await act(async () => {
      capturedMfaRequiredListener?.();
    });

    expect(getByTestId('status').props.children).toBe('needs-mfa');
  });

  it('signing out clears the stored MFA assertion (fresh sign-in always needs its own)', async () => {
    mockGetProfile.mockResolvedValue({ user: { uid: 'u1', email: 'jordan@example.com', tier: 'starter' } });
    await renderProvider();
    await signInFakeUser();
    mockClearMfaAssertion.mockClear();

    await signOutFake();

    expect(mockClearMfaAssertion).toHaveBeenCalled();
  });
});
