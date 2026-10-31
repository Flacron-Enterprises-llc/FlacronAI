
import { AuthShell } from '@/components/brand/AuthShell';
import { useAuth } from '../context/AuthProvider';
import { PrimaryButton } from '../components/PrimaryButton';
import { FormError } from '../components/FormError';

/**
 * Shown when Firebase auth succeeded but the backend profile fetch failed (mirrors
 * `ProtectedRoute.jsx`'s inline "Account data unavailable" card exactly — a real,
 * previously-live incident class, see `backend/middleware/auth.js`'s extensive comments
 * on 503 AUTH_VERIFY_UNAVAILABLE/PROFILE_LOOKUP_FAILED). A signed-in user with a broken
 * profile fetch must land somewhere real, not loop back through a guarded-away /login.
 */
export function AccountUnavailableScreen() {
  const { profileError, retryProfile, logout } = useAuth();

  return (
    <AuthShell title="Account data unavailable" back={false}>
      <FormError message={profileError || 'Your account data has not loaded yet.'} />
      <PrimaryButton label="Retry loading" onPress={() => retryProfile()} />
      <PrimaryButton variant="secondary" label="Sign out" onPress={() => logout()} />
    </AuthShell>
  );
}

