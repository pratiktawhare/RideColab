// ─────────────────────────────────────────────────────────────
// Environment variable access — typed + validated
// All client env vars MUST be prefixed with EXPO_PUBLIC_
// ─────────────────────────────────────────────────────────────

import Constants from 'expo-constants';
import { Platform } from 'react-native';

const resolveApiUrl = (): string => {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL;

  // On Web: use current browser hostname so both localhost and LAN IP work seamlessly
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location?.hostname) {
      return `http://${window.location.hostname}:4000/api/v1`;
    }
    return configuredUrl ?? 'http://localhost:4000/api/v1';
  }

  // On native device (iOS / Android):
  // 1. First preference: extract Metro bundler host IP dynamically (e.g. "192.168.102.240")
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const hostIp = hostUri.split(':')[0];
    if (hostIp && hostIp !== 'localhost' && hostIp !== '127.0.0.1') {
      return `http://${hostIp}:4000/api/v1`;
    }
  }

  // 2. Fallback to explicitly configured URL
  if (configuredUrl) {
    return configuredUrl;
  }

  // 3. Android emulator loopback fallback
  return 'http://10.0.2.2:4000/api/v1';
};

export const env = {
  API_URL: resolveApiUrl().replace(/\/$/, ''),
  MAP_TILE_URL:
    process.env.EXPO_PUBLIC_MAP_TILE_URL ??
    'https://tiles.openfreemap.org/styles/liberty',
  // Web client ID — used by server to verify Google ID tokens
  GOOGLE_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '',
  // Android native client ID — needed for SDK 52+ (no auth proxy).
  // Get SHA-1 via: eas credentials -p android
  // Then create Android OAuth client in Google Cloud Console.
  GOOGLE_ANDROID_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '',
};
