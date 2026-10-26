/**
 * QA federation, client side: sign in with a FlacronAI WEBSITE (production) account,
 * then exchange that sign-in for a short-lived STAGING session
 * (`POST /auth/federated/exchange`, backend/services/federatedIdentity.js).
 *
 * - Production is used only to prove identity. This file never creates, changes or
 *   deletes a production account, with one deliberate exception: a Google sign-in that
 *   Firebase reports as `isNewUser` just CREATED a production account for someone with no
 *   FlacronAI account. That account is deleted again immediately (it has no profile or
 *   data — nothing else ran), and the user is sent to flacronai.com to sign up.
 * - Production MFA is checked by production, through the exchange; this file only
 *   relays the code.
 * - The staging session expires about an hour after each exchange; AuthProvider
 *   re-exchanges while the production sign-in is still valid, so a production password
 *   change / sign-out-everywhere / disable / deletion ends QA access within that hour.
 */
import {
  EmailAuthProvider,
  deleteUser,
  getAdditionalUserInfo,
  reauthenticateWithCredential,
  signInWithCredential,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signOut,
  type AuthCredential,
  type User as FirebaseUser,
} from 'firebase/auth';

import { authApi } from '@/services/api/auth';
import { getFirebaseAuth } from '@/services/firebase/client';
import { getIdentityAuth } from '@/services/firebase/identityClient';
import { ApiRequestError } from '@/types/api';
import { getGoogleCredential, signOutOfGoogle } from './googleSignIn';

export type ExchangeOutcome = 'ok' | 'mfa_required';
export type IdentityMethod = 'password' | 'google';

export class FederatedSignInError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'FederatedSignInError';
  }
}

export const NO_WEBSITE_ACCOUNT_MESSAGE =
  'No FlacronAI account uses this Google account. Create one at flacronai.com, then sign in here.';

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

/** Google -> production identity. Rolls back an account the sign-in itself created. */
export async function signInToIdentityWithGoogle(): Promise<'success' | 'cancelled'> {
  const outcome = await getGoogleCredential();
  if (outcome.status === 'cancelled') return 'cancelled';
  const result = await signInWithCredential(getIdentityAuth(), outcome.credential);
  if (getAdditionalUserInfo(result)?.isNewUser) {
    await deleteUser(result.user).catch(() => {});
    await signOutIdentity();
    throw new FederatedSignInError('auth/federated-no-account', NO_WEBSITE_ACCOUNT_MESSAGE);
  }
  return 'success';
}

export async function signOutIdentity(): Promise<void> {
  await signOut(getIdentityAuth()).catch(() => {});
  await signOutOfGoogle();
}

export function identityMethods(user: Pick<FirebaseUser, 'providerData'> | null = getIdentityAuth().currentUser): IdentityMethod[] {
  const out: IdentityMethod[] = [];
  for (const p of user?.providerData ?? []) {
    if (p?.providerId === 'password' && !out.includes('password')) out.push('password');
    if (p?.providerId === 'google.com' && !out.includes('google')) out.push('google');
  }
  return out;
}

/** Re-verifies the PRODUCTION identity (fresh auth_time), then re-exchanges. Production
 * MFA is required again for this new sign-in event (outcome 'mfa_required'). */
export async function reauthenticateIdentity(
  method: IdentityMethod,
  { password, mfaCode }: { password?: string; mfaCode?: string } = {}
): Promise<ExchangeOutcome | 'cancelled'> {
  const user = getIdentityAuth().currentUser;
  if (!user) throw new FederatedSignInError('auth/federated-signed-out', 'You are signed out. Sign in again to continue.');
  if (!mfaCode) {
    let credential: AuthCredential;
    if (method === 'password') {
      if (!password || !user.email) throw new FederatedSignInError('auth/missing-password', 'Enter your FlacronAI password.');
      credential = EmailAuthProvider.credential(user.email, password);
    } else {
      const outcome = await getGoogleCredential();
      if (outcome.status === 'cancelled') return 'cancelled';
      credential = outcome.credential;
    }
    await reauthenticateWithCredential(user, credential);
  }
  return exchangeToStaging({ mfaCode, forceRefresh: true });
}

/** Claims of the current staging session (federated sessions carry `federated`/`fedAt`). */
export async function stagingSessionClaims(user: FirebaseUser): Promise<{ federated: boolean; fedAt: number | null }> {
  const { claims } = await user.getIdTokenResult();
  return { federated: claims.federated === true, fedAt: typeof claims.fedAt === 'number' ? claims.fedAt : null };
}
