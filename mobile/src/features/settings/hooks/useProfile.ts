/**
 * Basic profile + usage state for the Settings screen (Phase 5's minimal scope — see
 * MOBILE_DEVELOPMENT_PHASES.md Phase 5 §5: "only the basic profile/settings functionality
 * needed for dashboard parity and account visibility"). Usage/tier always comes from
 * `usersApi.getUsage()` (server-verified), never from a locally cached value — Golden Rule #4.
 */
import { useCallback, useEffect, useState } from 'react';

import { usersApi, type ProfileUpdate, type UsageSummary } from '@/services/api/users';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { ApiRequestError } from '@/types/api';

function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) return err.message;
  return 'Something went wrong. Please try again.';
}

export function useProfile() {
  const { userProfile, refreshProfile } = useAuth();
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadUsage = useCallback(async () => {
    setUsageLoading(true);
    setUsageError(null);
    try {
      const { usage: result } = await usersApi.getUsage();
      setUsage(result);
    } catch (err) {
      setUsageError(errorMessage(err));
    } finally {
      setUsageLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await loadUsage();
    })();
  }, [loadUsage]);

  const saveProfile = useCallback(
    async (updates: ProfileUpdate): Promise<boolean> => {
      setSaving(true);
      setSaveError(null);
      try {
        await usersApi.updateProfile(updates);
        await refreshProfile();
        return true;
      } catch (err) {
        setSaveError(errorMessage(err));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [refreshProfile]
  );

  return { userProfile, usage, usageLoading, usageError, retryUsage: loadUsage, saveProfile, saving, saveError, clearSaveError: () => setSaveError(null) };
}
