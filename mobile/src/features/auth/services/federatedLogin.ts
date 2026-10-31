/**
 * QA federation, client side: sign in with a FlacronAI WEBSITE (production) account,
 * then exchange that sign-in for a short-lived STAGING session
 * (`POST /auth/federated/exchange`, backend/services/federatedIdentity.js).
 *
 * - Production is used only to prove identity: this file signs in with an existing
 *   email/password, re-authenticates, refreshes ID tokens and signs out. It never creates,
 *   changes or deletes a production account.
 * - Email/password only. Google sign-in is deliberately NOT offered in federated builds:
 *   Firebase's signInWithCredential creates a production account for an unknown Google
 *   user, and that cannot be prevented without production changes (a blocking function
 *   or disabling sign-up). Deleting the account afterwards would still be a production
 *   side effect, so the path does not exist.
 * - Production MFA is checked by production, through the exchange; this file only
 *   relays the code.
 * - The staging session expires about an hour after each exchange; AuthProvider
 *   re-exchanges while the production sign-in is still valid, so a production password
 *   change / sign-out-everywhere / disable / deletion ends QA access within that hour.
 */
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';

import { authApi } from '@/services/api/auth';
import { getFirebaseAuth } from '@/services/firebase/client';
import { getIdentityAuth } from '@/services/firebase/identityClient';
import { ApiRequestError } from '@/types/api';
import { signOutOfGoogle } from './googleSignIn';

export type ExchangeOutcome = 'ok' | 'mfa_required';

export class FederatedSignInError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'FederatedSignInError';
  }
}

export const GOOGLE_UNAVAILABLE_MESSAGE =
  'Google sign-in is not available in this QA build. Sign in with your FlacronAI website email and password.';

/** Exchanges the current production sign-in for a staging session. */
export async function exchangeToStaging({ mfaCode, forceRefresh = false }: { mfaCode?: string; forceRefresh?: boolean } = {}): Promise<ExchangeOutcome> {
  const identityUser = getIdentityAuth().currentUser;
  if (!identityUser) throw new FederatedSignInError('auth/federated-signed-out', 'Please sign in again.');
  const idToken = await identityUser.getIdToken(forceRefresh);
  try {
    const res = await authApi.federatedExchange(idToken, mfaCode);
    await signInWithCustomToken(getFirebaseAuth(), res.customToken);
    return 'ok';
  } catch (err) {
    if (err instanceof ApiRequestError && err.code === 'FEDERATED_MFA_REQUIRED') return 'mfa_required';
    throw err;
  }
}

export async function signInToIdentityWithPassword(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(getIdentityAuth(), email, password);
}

export async function signOutIdentity(): Promise<void> {
  await signOut(getIdentityAuth()).catch(() => {});
  await signOutOfGoogle();
}

/** True when the production identity can confirm with a password (the only federated method). */
export function identityHasPassword(user: Pick<FirebaseUser, 'providerData'> | null = getIdentityAuth().currentUser): boolean {
  return (user?.providerData ?? []).some((p) => p?.providerId === 'password');
}

/** Re-verifies the PRODUCTION password (fresh auth_time), then re-exchanges. Production
 * MFA is required again for this new sign-in event (outcome 'mfa_required'). */
export async function reauthenticateIdentity({ password, mfaCode }: { password?: string; mfaCode?: string } = {}): Promise<ExchangeOutcome> {
  const user = getIdentityAuth().currentUser;
  if (!user) throw new FederatedSignInError('auth/federated-signed-out', 'You are signed out. Sign in again to continue.');
  if (!mfaCode) {
    if (!password || !user.email) throw new FederatedSignInError('auth/federated-missing-password', 'Enter your FlacronAI password.');
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
  }
  return exchangeToStaging({ mfaCode, forceRefresh: true });
}

/** Claims of the current staging session (federated sessions carry `federated`/`fedAt`). */
export async function stagingSessionClaims(user: FirebaseUser): Promise<{ federated: boolean; fedAt: number | null }> {
  const { claims } = await user.getIdTokenResult();
  return { federated: claims.federated === true, fedAt: typeof claims.fedAt === 'number' ? claims.fedAt : null };
}
