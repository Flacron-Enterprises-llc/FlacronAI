import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';
import { isFirebaseConfigured } from '@/config/firebaseConfig';
import { AuthProvider, useAuth } from '@/features/auth/context/AuthProvider';
import { ConfigRequiredScreen } from '@/features/auth/screens/ConfigRequiredScreen';

SplashScreen.preventAutoHideAsync();

/**
 * Route guards, declared once here (Expo Router's Stack.Protected — see
 * https://docs.expo.dev/router/advanced/authentication/). Fail-closed by construction:
 * every protected group has an explicit boolean guard computed from AuthProvider's single
 * `status` value, and `app/index.tsx` is the one always-reachable, unguarded anchor route
 * that redirects onward — there is no route that renders without its guard evaluating to
 * true first, and no default/fallback path into `(app)`.
 */
function RootNavigator() {
  const theme = useTheme();
  const { status } = useAuth();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      {/* Always reachable — computes the real destination via <Redirect>. */}
      <Stack.Screen name="index" />

      <Stack.Protected guard={status === 'signed-out'}>
        <Stack.Screen name="login" />
        <Stack.Screen name="signup" />
        <Stack.Screen name="forgot-password" />
      </Stack.Protected>

      <Stack.Protected guard={status === 'needs-email-verification'}>
        <Stack.Screen name="verify-email" />
      </Stack.Protected>

      <Stack.Protected guard={status === 'needs-mfa'}>
        <Stack.Screen name="mfa" />
      </Stack.Protected>

      <Stack.Protected guard={status === 'profile-unavailable'}>
        <Stack.Screen name="account-unavailable" />
      </Stack.Protected>

      <Stack.Protected guard={status === 'authenticated'}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>

      <Stack.Screen name="+not-found" />
    </Stack>
  );
}

/** Hides the splash screen only once BOTH fonts are loaded AND the first auth-state
 * resolution has completed — prevents any flash of protected (or wrong-auth-state)
 * content before either is known (task requirement: "Protected content must never flash
 * before checks complete"). Must render inside AuthProvider to read `status`. */
function SplashScreenController({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { status } = useAuth();

  useEffect(() => {
    if (fontsLoaded && status !== 'loading') {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, status]);

  // While still loading, render nothing behind the (still-visible) native splash screen.
  if (!fontsLoaded || status === 'loading') return null;

  if (!isFirebaseConfigured()) {
    return <ConfigRequiredScreen />;
  }

  return <RootNavigator />;
}

export default function RootLayout() {
  const theme = useTheme();
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
  });

  return (
    <SafeAreaProvider>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <AuthProvider>
        <SplashScreenController fontsLoaded={fontsLoaded} />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
