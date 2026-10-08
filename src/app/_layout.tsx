import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/ui/toast';
import { Colors } from '@/constants/theme';
import { useScheme } from '@/hooks/use-theme';
import { authClient } from '@/lib/auth-client';
import { configureNotificationHandler, useNotificationObserver } from '@/lib/notifications';
import { queryClient } from '@/lib/query';
import { AppProvider, useAppStore } from '@/store/app-store';

SplashScreen.preventAutoHideAsync();

// Foreground banner behavior — set once at module load, before any render.
configureNotificationHandler();

function RootNavigator() {
  const { hydrated } = useAppStore();
  const { isPending } = authClient.useSession();
  const scheme = useScheme();
  const colors = Colors[scheme];
  const router = useRouter();

  const ready = hydrated && !isPending;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  // Tapping a push (foreground, background, or cold start) deep-links to its
  // target route. `data.url` is always an in-app path we own.
  const navigate = useCallback(
    (url: string) => router.push(url as Parameters<typeof router.push>[0]),
    [router],
  );
  useNotificationObserver(navigate);

  if (!ready) return null;

  const navTheme = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = {
    ...navTheme,
    colors: {
      ...navTheme.colors,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      primary: colors.brand,
    },
  };

  return (
    <ThemeProvider value={theme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        {/* Web-only operations console; its layout redirects away on native. */}
        <Stack.Screen name="admin" />
        <Stack.Screen name="request/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="map" options={{ presentation: 'card' }} />
        <Stack.Screen name="appointment/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen
          name="request/new"
          options={{ presentation: 'modal' }}
        />
        <Stack.Screen name="book" options={{ presentation: 'modal' }} />
        <Stack.Screen name="profile-edit" options={{ presentation: 'modal' }} />
        <Stack.Screen name="donor-card" options={{ presentation: 'modal' }} />
        <Stack.Screen name="prepare" options={{ presentation: 'modal' }} />
        <Stack.Screen name="notification-settings" options={{ presentation: 'modal' }} />
        <Stack.Screen name="blood-compatibility" options={{ presentation: 'modal' }} />
        <Stack.Screen name="article/[id]" options={{ presentation: 'card' }} />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AppProvider>
            <ToastProvider>
              <RootNavigator />
            </ToastProvider>
          </AppProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
