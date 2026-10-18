// ─────────────────────────────────────────────────────────────
// Root layout — providers, auth gate, cold-start detection
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore, hydrateTheme } from '@/store/themeStore';
import { ColdStartScreen } from '@/components/ColdStartScreen';
import { healthApi } from '@/services/api';
import '@/i18n'; // initialise i18n

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 2 },
  },
});

// Auth gate — redirect to login if not authenticated
function AuthGate() {
  const { user, isHydrated } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!isHydrated) return;
    const seg = segments as string[];
    const inAuth = seg[0] === 'login' || seg[0] === 'register';
    if (!user && !inAuth) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.replace('/login' as any);
    } else if (user && inAuth) {
      router.replace('/(tabs)');
    }
  }, [user, isHydrated, segments]);

  return null;
}

export default function RootLayout() {
  const { scheme } = useThemeStore();
  const { hydrate } = useAuthStore();
  const [ready, setReady] = useState(false);
  const [coldStart, setColdStart] = useState(false);

  useEffect(() => {
    let coldTimer: ReturnType<typeof setTimeout>;
    let resolved = false;

    const bootstrap = async () => {
      // Show cold-start screen if health check takes >3s
      coldTimer = setTimeout(() => {
        if (!resolved) setColdStart(true);
      }, 3000);

      await Promise.all([hydrate(), hydrateTheme()]);
      resolved = true;
      clearTimeout(coldTimer);
      setColdStart(false);
      setReady(true);
      await SplashScreen.hideAsync().catch(() => {});
    };

    // Ping the server in background for cold-start detection
    healthApi.check().finally(() => {
      resolved = true;
      clearTimeout(coldTimer);
      setColdStart(false);
    });

    bootstrap().catch(() => {
      setReady(true);
      SplashScreen.hideAsync().catch(() => {});
    });

    return () => clearTimeout(coldTimer);
  }, []);

  if (!ready) {
    return coldStart ? <ColdStartScreen /> : <View style={{ flex: 1 }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <AuthGate />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="login" options={{ animation: 'fade' }} />
          <Stack.Screen name="register" options={{ animation: 'slide_from_right' }} />
        </Stack>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
