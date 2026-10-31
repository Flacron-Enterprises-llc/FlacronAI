/**
 * Phase 8 — re-authentication of the CURRENT Firebase user before sensitive actions (password
 * change, account deletion). The backend requires a sign-in within the last 5 minutes
 * (`requireRecentAuth` / `isRecentAuth`), proven by the Firebase ID token's `auth_time`, so
 * after re-authenticating we force a fresh ID token.
 *
 * Provider-appropriate: email/password → current password; Google → Google sheet; Apple →
 * Apple sheet (iOS only). Firebase's `reauthenticateWithCredential` rejects a credential that
 * belongs to a different user (`auth/user-mismatch`), so another account can never stand in.
 */
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  type AuthCredential,
  type User as FirebaseUser,
} from 'firebase/auth';

export type SignInMethod = 'password' | 'google' | 'apple';

const PROVIDER_IDS: Record<string, SignInMethod> = {
  password: 'password',
  'google.com': 'google',
  'apple.com': 'apple',
};

export function signInMethodsOf(user: Pick<FirebaseUser, 'providerData'> | null): SignInMethod[] {
  if (!user) return [];
  const out: SignInMethod[] = [];
  for (const p of user.providerData ?? []) {
    const m = PROVIDER_IDS[p?.providerId ?? ''];
    if (m && !out.includes(m)) out.push(m);
  }
  return out;
}

/** The method this device can use to re-authenticate, or null (e.g. an Apple-only account on
 * Android, where Sign in with Apple isn't available). Password first: it needs no extra sheet. */
export function reauthMethodFor(methods: SignInMethod[], platform: 'ios' | 'android' | string): SignInMethod | null {
  if (methods.includes('password')) return 'password';
  if (methods.includes('google')) return 'google';
  if (methods.includes('apple') && platform === 'ios') return 'apple';
  return null;
}

type CredentialOutcome = { status: 'success'; credential: AuthCredential } | { status: 'cancelled' };

export interface ReauthDeps {
  getGoogleCredential: () => Promise<CredentialOutcome>;
  getAppleCredential: () => Promise<CredentialOutcome>;
  reauthenticate: (user: FirebaseUser, credential: AuthCredential) => Promise<unknown>;
  passwordCredential: (email: string, password: string) => AuthCredential;
}

const defaultDeps = (): ReauthDeps => ({
  // Lazy: these modules load native SDKs only when actually used (same as AuthProvider).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  getGoogleCredential: () => require('@/features/auth/services/googleSignIn').getGoogleCredential(),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  getAppleCredential: () => require('@/features/auth/services/appleSignIn').getAppleCredential(),
  reauthenticate: (user, credential) => reauthenticateWithCredential(user, credential),
  passwordCredential: (email, password) => EmailAuthProvider.credential(email, password),
});

export type ReauthResult = { ok: true } | { ok: false; cancelled: true } | { ok: false; cancelled: false; message: string };

const MESSAGES: Record<string, string> = {
  'auth/wrong-password': 'Incorrect password.',
  'auth/invalid-credential': 'Incorrect password.',
  'auth/invalid-login-credentials': 'Incorrect password.',
  'auth/user-mismatch': 'That sign-in belongs to a different account. Use the account you are signed in with.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/network-request-failed': "You appear to be offline. Check your connection and try again.",
  'auth/user-not-found': 'This account no longer exists.',
  'auth/requires-recent-login': 'Please confirm it’s you again.',
};

export async function reauthenticate(
  user: FirebaseUser | null,
  method: SignInMethod,
  { password }: { password?: string } = {},
  deps: ReauthDeps = defaultDeps()
): Promise<ReauthResult> {
  if (!user) return { ok: false, cancelled: false, message: 'You are signed out. Sign in again to continue.' };
  try {
    let credential: AuthCredential;
    if (method === 'password') {
      if (!password) return { ok: false, cancelled: false, message: 'Enter your current password.' };
      if (!user.email) return { ok: false, cancelled: false, message: 'This account has no email address to confirm.' };
      credential = deps.passwordCredential(user.email, password);
    } else {
      const outcome = method === 'google' ? await deps.getGoogleCredential() : await deps.getAppleCredential();
      if (outcome.status === 'cancelled') return { ok: false, cancelled: true };
      credential = outcome.credential;
    }
    await deps.reauthenticate(user, credential);
    // The server checks `auth_time` on the ID token — make sure the next request carries it.
    await user.getIdToken(true);
    return { ok: true };
  } catch (err) {
    const code = (err as { code?: string })?.code ?? '';
    return { ok: false, cancelled: false, message: MESSAGES[code] ?? "We couldn't confirm it's you. Please try again." };
  }
}
