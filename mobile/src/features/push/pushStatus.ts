/**
 * Pure mapping from the push state to what the Settings card shows. Each failure class
 * (unsupported device, missing configuration, permission denied, offline, server not ready)
 * gets its own honest message — the app never claims notifications will arrive while server
 * delivery doesn't exist.
 */
import type { PermissionSnapshot, PushSupport } from './pushProvider';
import type { RegistrationState } from './pushRegistration';

export type TokenState = 'idle' | 'fetching' | 'ready' | 'offline' | 'missing-configuration' | 'error';

export interface PushState {
  support: PushSupport | 'checking';
  permission: PermissionSnapshot | null;
  token: TokenState;
  registration: RegistrationState;
  requesting: boolean;
  /** uid that `token`/`registration` describe (never the token itself) — state for any other
   * account is shown as idle. */
  owner: string | null;
}

export const INITIAL_PUSH_STATE: PushState = {
  support: 'checking',
  permission: null,
  token: 'idle',
  registration: 'idle',
  requesting: false,
  owner: null,
};

export type PushAction = 'enable' | 'open-settings' | 'retry' | null;

export interface PushStatusView {
  label: string;
  description: string;
  action: PushAction;
  tone: 'neutral' | 'success' | 'warning';
}

export const PERMISSION_EXPLANATION =
  'FlacronAI can notify you when a draft report is ready for your review, when photo analysis finishes or fails, and when a report is approved or sent back. You can change this any time in Settings.';

export function describePushStatus(state: PushState): PushStatusView {
  if (state.support === 'checking') return { label: 'Checking…', description: '', action: null, tone: 'neutral' };
  if (state.support === 'unsupported-environment') {
    return {
      label: 'Not available here',
      description: 'Push notifications need the installed FlacronAI app on a physical phone or tablet.',
      action: null,
      tone: 'neutral',
    };
  }
  if (state.support === 'missing-configuration') {
    return {
      label: 'Not configured',
      description: 'This build of the app is not set up for push notifications.',
      action: null,
      tone: 'warning',
    };
  }

  const permission = state.permission;
  if (!permission) return { label: 'Checking…', description: '', action: null, tone: 'neutral' };
  if (permission.state === 'undetermined') {
    return { label: 'Off', description: PERMISSION_EXPLANATION, action: 'enable', tone: 'neutral' };
  }
  if (permission.state === 'denied') {
    return permission.canAskAgain
      ? { label: 'Off', description: PERMISSION_EXPLANATION, action: 'enable', tone: 'neutral' }
      : {
          label: 'Blocked',
          description: 'Notifications are turned off for FlacronAI in your device settings. You can turn them on there.',
          action: 'open-settings',
          tone: 'warning',
        };
  }

  // Permission granted — now the token and the server side.
  switch (state.token) {
    case 'idle':
    case 'fetching':
      return { label: 'Setting up…', description: '', action: null, tone: 'neutral' };
    case 'offline':
      return {
        label: 'Allowed — setup pending',
        description: "You're offline, so this device couldn't finish setting up notifications.",
        action: 'retry',
        tone: 'warning',
      };
    case 'missing-configuration':
      return {
        label: 'Not configured',
        description: 'This build of the app is not set up for push notifications.',
        action: null,
        tone: 'warning',
      };
    case 'error':
      return {
        label: 'Allowed — setup failed',
        description: "This device couldn't finish setting up notifications.",
        action: 'retry',
        tone: 'warning',
      };
    case 'ready':
      break;
  }

  switch (state.registration) {
    case 'registered':
      // Registration is not proof of delivery — say what is true, nothing more.
      return {
        label: 'On',
        description:
          "This device is registered for FlacronAI notifications. If they don't arrive, check your device's notification settings; report updates always appear in the app.",
        action: null,
        tone: 'success',
      };
    case 'registered-config-error':
      return {
        label: 'Temporarily unavailable',
        description:
          "This device is registered, but FlacronAI's notification service is having a configuration problem right now. Report updates still appear in the app.",
        action: null,
        tone: 'warning',
      };
    case 'registered-delivery-off':
      return {
        label: 'Allowed',
        description:
          "This device is registered, but FlacronAI isn't sending push notifications right now. Report updates still appear in the app.",
        action: null,
        tone: 'neutral',
      };
    case 'backend-unavailable':
      return {
        label: 'Allowed',
        description:
          "Notifications are allowed on this device, but FlacronAI doesn't send push notifications yet. Report updates still appear in the app.",
        action: null,
        tone: 'neutral',
      };
    case 'failed':
      return {
        label: 'Allowed — not connected',
        description: "We couldn't connect this device to your account for notifications.",
        action: 'retry',
        tone: 'warning',
      };
    default:
      return { label: 'Setting up…', description: '', action: null, tone: 'neutral' };
  }
}

/** The one-time dashboard prompt appears only while the OS prompt has never been answered. */
export function shouldShowPrimer(state: PushState, dismissed: boolean): boolean {
  return !dismissed && state.support === 'supported' && state.permission?.state === 'undetermined';
}
