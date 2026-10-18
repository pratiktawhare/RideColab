// ─────────────────────────────────────────────────────────────
// Environment variable access — typed + validated
// All client env vars MUST be prefixed with EXPO_PUBLIC_
// ─────────────────────────────────────────────────────────────

import Constants from 'expo-constants';
import { Platform } from 'react-native';

const resolveApiUrl = (): string => {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL;

  // If a full custom URL without localhost is explicitly specified, use it
  if (configuredUrl && !configuredUrl.includes('localhost') && !configuredUrl.includes('127.0.0.1')) {
    return configuredUrl;
  }

  // On Web, localhost is fine (browser runs on host PC)
  if (Platform.OS === 'web') {
    return configuredUrl ?? 'http://localhost:4000/api/v1';
  }

  // On native device (iOS / Android), localhost refers to device itself.
  // Extract host IP from Expo Metro bundler hostUri if available (e.g. "192.168.1.101:8081")
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const hostIp = hostUri.split(':')[0];
    return `http://${hostIp}:4000/api/v1`;
  }

  // Default fallback for configured URL or localhost
  return configuredUrl ?? 'http://localhost:4000/api/v1';
};

export const env = {
  API_URL: resolveApiUrl().replace(/\/$/, ''),
  MAP_TILE_URL:
    process.env.EXPO_PUBLIC_MAP_TILE_URL ??
    'https://tiles.openfreemap.org/styles/liberty',
};

