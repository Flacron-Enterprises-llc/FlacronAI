// Account deletion (web) -- shared by Settings' delete modal and the public
// /account-deletion information page (Mobile Phase 10: store "delete your account"
// link). The backend (DELETE /users/account) stays the only authority: it re-checks
// identity (password, or a sign-in within 5 minutes + confirmation "DELETE"),
// cancels Stripe subscriptions before anything is removed, and finishes a
// part-failed deletion on its own. This module only picks the right identity
// check for the signed-in account and turns server codes into clear messages.
import {
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  EmailAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
} from 'firebase/auth';

export const SUPPORT_EMAIL = 'support@flacronenterprises.com';

// What deletion removes vs. keeps -- mirrors backend/routes/users.js (DELETE /account).
export const DELETED_DATA = [
  'Your profile and sign-in',
  'All reports, including drafts, versions and comments',
  'Report photos, exported PDF/DOCX files and logos',
  'Templates, API keys, webhooks and CRM records',
  'In-app notifications and registered devices for push notifications',
];
export const RETAINED_DATA = [
  'Billing, invoice and purchase records (including Stripe, App Store and Google Play records)',
  'Security audit logs',
  'Messages you sent to our sales or contact forms',
  'A minimal record that the account was deleted, so it cannot be recreated or re-linked to a purchase',
];
export const SUBSCRIPTION_WARNING =
  "Any FlacronAI subscription billed through this website is cancelled immediately, so you won't be charged again. Your plan ends right away and past payments are not refunded. App Store or Google Play subscriptions are not cancelled — cancel those in the store's subscription settings.";

// 'password' | 'google' | 'apple' | 'unsupported'. Password wins when an account
// has several providers -- it is the existing, server-verified web path.
export function getDeletionMethod(user) {
  const ids = (user?.providerData || []).map((p) => p?.providerId);
  if (ids.includes('password')) return 'password';
  if (ids.includes('google.com')) return 'google';
  if (ids.includes('apple.com')) return 'apple';
  return 'unsupported';
}

export const PROVIDER_LABEL = { google: 'Google', apple: 'Apple' };

const defaultDeps = {
  reauthWithPassword: (user, password) =>
    reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password)),
  reauthWithPopup: (user, method) => {
    const provider = method === 'google' ? new GoogleAuthProvider() : new OAuthProvider('apple.com');
    if (method === 'google' && user.email) provider.setCustomParameters({ login_hint: user.email });
    return reauthenticateWithPopup(user, provider);
  },
};

// Re-authenticates the CURRENT user (Firebase rejects a different account with
// auth/user-mismatch), forces a fresh ID token so the server sees the new
// auth_time, then calls the delete endpoint. Throws the original error.
export async function deleteAccountWithReauth(user, { password = '' } = {}, deleteAccount, deps = defaultDeps) {
  const method = getDeletionMethod(user);
  if (method === 'unsupported') throw Object.assign(new Error('unsupported'), { code: 'DELETION_METHOD_UNSUPPORTED' });
  if (method === 'password') {
    if (!password) throw Object.assign(new Error('password required'), { code: 'PASSWORD_REQUIRED' });
    // Unchanged server contract: the backend re-verifies the password itself.
    return deleteAccount({ password });
  }
  await deps.reauthWithPopup(user, method);
  await user.getIdToken(true);
  return deleteAccount({ confirmation: 'DELETE' });
}

// Error -> { message, deleted }. `deleted: true` means the server already removed
// the account (e.g. a retry after a part-finished deletion), so the UI should
// sign out exactly as on success.
export function describeDeletionError(err) {
  const code = err?.response?.data?.code || err?.code;
  const serverMessage = err?.response?.data?.error;
  switch (code) {
    case 'ACCOUNT_DELETED':
      return { deleted: true, message: 'Your account has already been deleted.' };
    case 'INVALID_PASSWORD':
      return { message: 'Incorrect password. Nothing was deleted.' };
    case 'PASSWORD_REQUIRED':
      return { message: 'Enter your current password.' };
    case 'RECENT_LOGIN_REQUIRED':
      return { message: 'Please confirm your sign-in again, then retry. Nothing was deleted.' };
    case 'TEAM_OWNER_BLOCKED':
    case 'STRIPE_CANCELLATION_FAILED':
    case 'DELETE_IN_PROGRESS':
      return { message: serverMessage || 'Your account was not deleted. Please try again in a moment.' };
    case 'DELETE_ACCOUNT_INCOMPLETE':
      return {
        message:
          'Your account could not be fully deleted yet. Please try again. If you can no longer sign in, the deletion is completed automatically.',
      };
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return { message: 'Sign-in confirmation was cancelled. Nothing was deleted.' };
    case 'auth/popup-blocked':
      return { message: 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.' };
    case 'auth/user-mismatch':
      return { message: 'That sign-in belongs to a different account. Use the account you want to delete.' };
    case 'auth/too-many-requests':
      return { message: 'Too many attempts. Please try again later.' };
    case 'auth/operation-not-allowed':
    case 'DELETION_METHOD_UNSUPPORTED':
      return {
        message: `This sign-in method can't be confirmed on the website. Delete your account in the FlacronAI mobile app (Settings → Delete account) or email ${SUPPORT_EMAIL}.`,
      };
    default:
      return { message: 'Failed to delete account. Please try again.' };
  }
}
