/**
 * Phase 8 — legal, help, support and about. Every link opens the existing public page (same copy
 * as the web app); nothing is re-authored here. A link that can't be opened shows the address
 * so the user can still reach it.
 */
import Constants from 'expo-constants';
import { useState } from 'react';
import { Platform } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { getAppEnv } from '@/config/env';
import { AccountScaffold, Card, Notice } from '@/features/account/components/AccountScaffold';
import { SettingsRow } from '@/features/account/components/SettingsRow';
import { INFO_ITEMS, LEGAL_ITEMS, openExternal, SUPPORT_EMAIL, supportMailto } from '../links';

export function appVersionLabel(): string {
  const version = Constants.expoConfig?.version ?? 'unknown';
  let env = 'unknown';
  try {
    env = getAppEnv();
  } catch {
    env = 'unknown';
  }
  return `Version ${version} · ${Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : Platform.OS}${env !== 'production' ? ` · ${env}` : ''}`;
}

export function LegalSupportScreen() {
  const [failure, setFailure] = useState<string | null>(null);

  const open = async (url: string, fallbackText: string) => {
    setFailure(null);
    if ((await openExternal(url)) === 'failed') setFailure(fallbackText);
  };

  return (
    <AccountScaffold title="Legal & support">
      <Notice tone="error" text={failure} />
      <ThemedText variant="subtitle" accessibilityRole="header" style={{ marginBottom: 4 }}>
        Help & support
      </ThemedText>
      <Card>
        <SettingsRow
          label="Email support"
          detail={SUPPORT_EMAIL}
          accessibilityHint="Opens your email app"
          onPress={() => open(supportMailto(), `No email app is set up. Write to ${SUPPORT_EMAIL}.`)}
        />
        {INFO_ITEMS.map((item) => (
          <SettingsRow key={item.key} label={item.label} accessibilityHint="Opens in your browser" onPress={() => open(item.url, `Couldn’t open the page. Visit ${item.url}`)} />
        ))}
      </Card>
      <ThemedText variant="subtitle" accessibilityRole="header" style={{ marginBottom: 4 }}>
        Legal
      </ThemedText>
      <Card>
        {LEGAL_ITEMS.map((item) => (
          <SettingsRow key={item.key} label={item.label} accessibilityHint="Opens in your browser" onPress={() => open(item.url, `Couldn’t open the page. Visit ${item.url}`)} />
        ))}
      </Card>
      <ThemedText variant="subtitle" accessibilityRole="header" style={{ marginBottom: 4 }}>
        About
      </ThemedText>
      <Card>
        <ThemedText variant="body">FlacronAI</ThemedText>
        <ThemedText variant="caption" color="muted">
          {appVersionLabel()}
        </ThemedText>
      </Card>
    </AccountScaffold>
  );
}
