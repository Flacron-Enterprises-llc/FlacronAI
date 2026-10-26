import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  getDeletionMethod,
  deleteAccountWithReauth,
  describeDeletionError,
  RETAINED_DATA,
  SUPPORT_EMAIL,
} from '../utils/accountDeletion.js';

// Mobile Phase 10: web account deletion for Google/Apple accounts (provider re-auth +
// "DELETE" confirmation) and the public /account-deletion store link page.
const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const user = (...providers) => ({
  email: 'a@example.com',
  providerData: providers.map((providerId) => ({ providerId })),
  getIdToken: vi.fn(async () => 'fresh'),
});

describe('getDeletionMethod', () => {
  it('picks password first, then Google, then Apple', () => {
    expect(getDeletionMethod(user('google.com', 'password'))).toBe('password');
    expect(getDeletionMethod(user('google.com'))).toBe('google');
    expect(getDeletionMethod(user('apple.com'))).toBe('apple');
    expect(getDeletionMethod(user('phone'))).toBe('unsupported');
    expect(getDeletionMethod(null)).toBe('unsupported');
  });
});

describe('deleteAccountWithReauth', () => {
  const deps = () => ({ reauthWithPopup: vi.fn(async () => {}), reauthWithPassword: vi.fn() });

  it('email accounts keep the unchanged password contract (no popup)', async () => {
    const d = deps();
    const del = vi.fn(async () => ({ data: { success: true } }));
    await deleteAccountWithReauth(user('password'), { password: 'pw' }, del, d);
    expect(del).toHaveBeenCalledWith({ password: 'pw' });
    expect(d.reauthWithPopup).not.toHaveBeenCalled();
  });

  it('Google/Apple: re-auth popup, then a forced fresh token, then DELETE confirmation', async () => {
    for (const [provider, method] of [['google.com', 'google'], ['apple.com', 'apple']]) {
      const d = deps();
      const u = user(provider);
      const order = [];
      d.reauthWithPopup.mockImplementation(async () => order.push('reauth'));
      u.getIdToken.mockImplementation(async (force) => order.push(`token:${force}`));
      const del = vi.fn(async (body) => order.push(`delete:${JSON.stringify(body)}`));
      await deleteAccountWithReauth(u, {}, del, d);
      expect(d.reauthWithPopup).toHaveBeenCalledWith(u, method);
      expect(order).toEqual(['reauth', 'token:true', 'delete:{"confirmation":"DELETE"}']);
    }
  });

  it('a cancelled or failed re-auth never calls the delete endpoint', async () => {
    const d = deps();
    d.reauthWithPopup.mockRejectedValue(Object.assign(new Error('x'), { code: 'auth/popup-closed-by-user' }));
    const del = vi.fn();
    await expect(deleteAccountWithReauth(user('google.com'), {}, del, d)).rejects.toMatchObject({ code: 'auth/popup-closed-by-user' });
    expect(del).not.toHaveBeenCalled();
  });

  it('refuses without a password / for unsupported providers, without calling the server', async () => {
    const del = vi.fn();
    await expect(deleteAccountWithReauth(user('password'), {}, del, deps())).rejects.toMatchObject({ code: 'PASSWORD_REQUIRED' });
    await expect(deleteAccountWithReauth(user('phone'), {}, del, deps())).rejects.toMatchObject({ code: 'DELETION_METHOD_UNSUPPORTED' });
    expect(del).not.toHaveBeenCalled();
  });
});

describe('describeDeletionError', () => {
  const server = (code, error) => ({ response: { data: { code, error } } });
  it('passes through retry-safe server messages', () => {
    for (const code of ['TEAM_OWNER_BLOCKED', 'STRIPE_CANCELLATION_FAILED', 'DELETE_IN_PROGRESS']) {
      expect(describeDeletionError(server(code, 'server says'))).toEqual({ message: 'server says' });
    }
  });
  it('treats an already-deleted account as deleted (sign out), everything else as not deleted', () => {
    expect(describeDeletionError(server('ACCOUNT_DELETED')).deleted).toBe(true);
    for (const code of ['INVALID_PASSWORD', 'RECENT_LOGIN_REQUIRED', 'DELETE_ACCOUNT_INCOMPLETE', 'auth/user-mismatch', 'auth/popup-blocked', 'weird']) {
      const r = describeDeletionError(code.startsWith('auth/') ? { code } : server(code));
      expect(r.deleted).toBeUndefined();
      expect(r.message.length).toBeGreaterThan(10);
    }
  });
  it('never leaks raw internal error text for unknown errors', () => {
    expect(describeDeletionError(new Error('ECONNRESET at db.internal:5432')).message).not.toMatch(/ECONNRESET|internal/);
  });
});

// Phase 10 (client-approved wording): legal pages must match the implemented deletion
// (immediate, no recovery, no automatic expiry, no backup claims, no visible placeholders).
describe('legal pages match implemented retention', () => {
  const privacy = read('../pages/PrivacyPolicy.jsx');
  const security = read('../pages/Security.jsx');
  const refund = read('../pages/RefundPolicy.jsx');
  it('no recovery window, automatic expiry or backup-deletion promise', () => {
    expect(privacy).not.toMatch(/recovery requests|automatically purged|for 3 years|Backups may retain/i);
    expect(privacy).toMatch(/Deleted accounts cannot be recovered/);
    expect(privacy).toMatch(/If any cleanup step fails, our system retries it automatically/);
    expect(security).not.toMatch(/retained for 90 days/);
  });
  it('no visible client placeholders; app-store billing explained', () => {
    expect(refund).not.toMatch(/CLIENT TO CONFIRM/);
    expect(refund).toMatch(/billed by Apple \(App Store\) or Google \(Google Play\)/);
  });
});

describe('public /account-deletion page', () => {
  const page = read('../pages/AccountDeletion.jsx');
  it('is information-only: no form, no API/auth calls, no account lookup', () => {
    expect(page).not.toMatch(/<form|<input|services\/api|usersAPI|axios|fetch\(|firebase|useAuth/);
  });
  it('reuses the shared copy, links the signed-in flow and the existing support address', () => {
    expect(page).toMatch(/DELETED_DATA/);
    expect(page).toMatch(/RETAINED_DATA/);
    expect(page).toMatch(/SUBSCRIPTION_WARNING/);
    expect(page).toMatch(/\/settings\?tab=security/);
    expect(page).toMatch(/path="\/account-deletion"/);
    expect(SUPPORT_EMAIL).toBe('support@flacronenterprises.com');
    expect(read('../pages/PrivacyPolicy.jsx')).toContain(SUPPORT_EMAIL);
    expect(RETAINED_DATA.join(' ')).toMatch(/Billing/);
  });
  it('is routed, in the sitemap, and the Settings modal uses the shared flow', () => {
    expect(read('../App.jsx')).toMatch(/path="\/account-deletion" element={<AccountDeletion \/>}/);
    expect(read('../../public/sitemap.xml')).toContain('https://flacronai.com/account-deletion');
    const settings = read('../pages/Settings.jsx');
    expect(settings).toMatch(/deleteAccountWithReauth\(auth\.currentUser/);
    expect(settings).toMatch(/method={getDeletionMethod\(auth\.currentUser\)}/);
  });
});
