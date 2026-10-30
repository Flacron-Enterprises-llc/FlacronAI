import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { ScreenContainer } from '@/components/ScreenContainer';
import { apiErrorMessage } from '@/hooks/useApiResource';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { LoadingState, StateMessage } from '@/features/reports/components/StateMessage';
import { ROLE_LABELS, teamsApi } from '@/services/api/teams';

/** Web AcceptInvite (`/invite/:token`): accepts once for the signed-in account, then refreshes the profile so the new
 * organization role and plan apply. The server checks the invite email matches this account. Shows the server's own
 * `error` text (the web page reads a non-existent `message` field and always shows a generic error). */
export function AcceptInviteScreen({ token }: { token: string }) {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const [state, setState] = useState<{ status: 'working' | 'done' | 'error'; text?: string }>({ status: 'working' });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const res = await teamsApi.accept(token);
        await refreshProfile().catch(() => undefined);
        setState({ status: 'done', text: `You joined the organization as ${ROLE_LABELS[res.role] ?? res.role}.` });
      } catch (err) {
        setState({ status: 'error', text: apiErrorMessage(err, 'This invitation could not be accepted.') });
      }
    })();
  }, [token, refreshProfile]);

  return (
    <ScreenContainer centered>
      {state.status === 'working' ? (
        <LoadingState label="Accepting your invitation…" />
      ) : (
        <StateMessage
          title={state.status === 'done' ? 'Invitation accepted' : 'Invitation not accepted'}
          description={state.text}
          retryLabel="Go to Dashboard"
          onRetry={() => router.replace('/dashboard')}
        />
      )}
    </ScreenContainer>
  );
}
