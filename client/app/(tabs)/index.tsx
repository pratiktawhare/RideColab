// ─────────────────────────────────────────────────────────────
// Home screen — rider/passenger toggle, live map, place search
// ─────────────────────────────────────────────────────────────
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { useAuthStore } from '@/store/authStore';
import { useTripsStore } from '@/store/tripsStore';
import { RiderPassengerToggle } from '@/components/RiderPassengerToggle';
import { PlaceSearch } from '@/components/PlaceSearch';
import { AppButton } from '@/components/AppButton';
import { userApi, GeoResult } from '@/services/api';
import {
  Map as MapLibreMap,
  Camera as MapLibreCamera,
  UserLocation,
  useCurrentPosition,
  type CameraRef,
} from '@maplibre/maplibre-react-native';
import { env } from '@/constants/env';
import * as ExpoLocation from 'expo-location';

// ── Pure map component (NO custom children — only MapLibre-native) ──────────
// All overlay controls (buttons, badges) MUST live OUTSIDE this component
// as sibling Views using absolute positioning.
function RideMap({
  cameraRef,
  position,
}: {
  cameraRef: React.MutableRefObject<CameraRef | null>;
  position: ReturnType<typeof useCurrentPosition> | undefined;
}) {
  const mapStyle = env.MAP_TILE_URL || 'https://tiles.openfreemap.org/styles/liberty';
  return (
    <MapLibreMap
      style={StyleSheet.absoluteFill}
      mapStyle={mapStyle}
      // compass bottom-left — away from all our overlay buttons
      compassPosition={{ bottom: 80, left: 12 }}
    >
      <MapLibreCamera
        ref={cameraRef}
        initialViewState={{
          center: [
            position?.coords.longitude ?? 73.8567,
            position?.coords.latitude ?? 18.5204,
          ] as [number, number],
          zoom: position ? 14 : 11,
        }}
      />
      {position && <UserLocation animated accuracy heading />}
    </MapLibreMap>
  );
}

// ── Floating pill button (white, always readable over any map tile) ──────────
function MapBtn({
  icon,
  onPress,
  label,
  style,
}: {
  icon: string;
  onPress: () => void;
  label: string;
  style?: object;
}) {
  return (
    <TouchableOpacity
      style={[styles.mapBtn, style]}
      onPress={onPress}
      accessibilityLabel={label}
      activeOpacity={0.8}
    >
      <Text style={styles.mapBtnIcon}>{icon}</Text>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { theme } = useThemeStore();
  const { user, setUser } = useAuthStore();
  const { setOrigin, setDestination } = useTripsStore();
  const c = theme.colors;
  const insets = useSafeAreaInsets();

  const cameraRef = useRef<CameraRef | null>(null);
  const fullCameraRef = useRef<CameraRef | null>(null);
  const position = useCurrentPosition({ enabled: true });
  const [mapExpanded, setMapExpanded] = useState(false);
  const [locationGranted, setLocationGranted] = useState(false);

  // Request location permission on mount
  useEffect(() => {
    ExpoLocation.requestForegroundPermissionsAsync()
      .then(({ status }) => setLocationGranted(status === 'granted'))
      .catch(() => setLocationGranted(false));
  }, []);

  // Fly to GPS once it arrives
  useEffect(() => {
    const lng = position?.coords.longitude;
    const lat = position?.coords.latitude;
    if (!lng || !lat) return;
    cameraRef.current?.flyTo({ center: [lng, lat] as [number, number] });
    if (mapExpanded) {
      fullCameraRef.current?.flyTo({ center: [lng, lat] as [number, number] });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position?.coords.longitude, position?.coords.latitude]);

  const [mode, setMode] = useState<'rider' | 'passenger'>(user?.mode ?? 'passenger');
  const [origin, setOriginLocal] = useState<GeoResult | null>(null);
  const [destination, setDestinationLocal] = useState<GeoResult | null>(null);

  const handleModeChange = async (next: 'rider' | 'passenger') => {
    setMode(next);
    try {
      await userApi.switchMode(next);
      if (user) setUser({ ...user, mode: next });
    } catch { setMode(mode); }
  };

  const handleOriginSelect = (r: GeoResult) => { setOriginLocal(r); setOrigin(r); };
  const handleDestinationSelect = (r: GeoResult) => { setDestinationLocal(r); setDestination(r); };
  const handleAction = () => {
    if (mode === 'rider') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.push('/post-trip' as any);
    } else {
      // Phase 7: go to passenger search screen
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.push('/search-rides' as any);
    }
  };

  const recenter = (ref: React.MutableRefObject<CameraRef | null>) => {
    const p = position?.coords;
    if (p) ref.current?.flyTo({ center: [p.longitude, p.latitude] as [number, number] });
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const activePos = locationGranted ? position : undefined;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>

      {/* ── Fixed top: header + mode toggle + mini map ── */}
      <View style={[styles.fixedTop, { backgroundColor: c.background }]}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: c.textSecondary }]}>{greeting()}</Text>
            <Text style={[styles.userName, { color: c.text }]}>{user?.name?.split(' ')[0] ?? 'there'} 👋</Text>
          </View>
          <TouchableOpacity
            style={[styles.trustBadge, { backgroundColor: c.accentMuted }]}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onPress={() => router.push('/my-trips' as any)}
          >
            <Text style={[styles.trustText, { color: c.accent }]}>⭐ {user?.trust_score ?? 50}</Text>
          </TouchableOpacity>
        </View>

        <RiderPassengerToggle value={mode} onChange={handleModeChange} />

        {/* Mini map — clipped, overlays positioned as siblings */}
        <View style={styles.mapContainer}>
          <RideMap cameraRef={cameraRef} position={activePos} />

          {/* ── Right control rail (Google Maps style) ── */}
          <View style={styles.mapRailRight}>
            {/* Expand to full screen */}
            <MapBtn icon="⛶" onPress={() => setMapExpanded(true)} label="Expand map" />
            {/* Recenter on GPS */}
            <MapBtn icon="◎" onPress={() => recenter(cameraRef)} label="Recenter map" />
          </View>

          {/* GPS status badge — bottom-left */}
          <View style={[styles.gpsBadge, { backgroundColor: position ? '#10B981' : 'rgba(0,0,0,0.45)' }]}>
            <Text style={styles.gpsText}>{position ? '📍 GPS' : '⏳ Locating…'}</Text>
          </View>
        </View>
      </View>

      {/* ── Scrollable content below the map ── */}
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Search panel */}
        <View style={[styles.searchCard, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[styles.searchTitle, { color: c.text }]}>
            {mode === 'passenger' ? '🔍 Find a ride' : '🚗 Offer a ride'}
          </Text>
          <View style={{ gap: 8, zIndex: 20 }}>
            <PlaceSearch label="Your pickup point" value={origin?.label ?? ''} onSelect={handleOriginSelect} dotColor="🟢" />
            <View style={[styles.connector, { backgroundColor: c.border }]} />
            <PlaceSearch label="Where are you going?" value={destination?.label ?? ''} onSelect={handleDestinationSelect} dotColor="🔴" />
          </View>
          <AppButton label={mode === 'rider' ? 'Post this trip →' : 'Search rides →'} onPress={handleAction} variant="primary" style={{ marginTop: 4 }} />
        </View>

        {mode === 'rider' && (
          <View style={styles.quickRow}>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <TouchableOpacity style={[styles.quickCard, { backgroundColor: c.surface, borderColor: c.border }]} onPress={() => router.push('/post-trip' as any)}>
              <Text style={styles.quickIcon}>🚗</Text>
              <Text style={[styles.quickLabel, { color: c.text }]}>Post a trip</Text>
            </TouchableOpacity>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <TouchableOpacity style={[styles.quickCard, { backgroundColor: c.surface, borderColor: c.border }]} onPress={() => router.push('/my-trips' as any)}>
              <Text style={styles.quickIcon}>📋</Text>
              <Text style={[styles.quickLabel, { color: c.text }]}>My trips</Text>
            </TouchableOpacity>
          </View>
        )}

        {mode === 'passenger' && (
          <View style={[styles.comingSoon, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={{ fontSize: 32 }}>🔍</Text>
            <Text style={[styles.comingSoonText, { color: c.textSecondary }]}>Ride matching coming in Phase 7</Text>
          </View>
        )}
      </ScrollView>

      {/* ── Full-screen map — absolute overlay (avoids Modal white-screen bug) ── */}
      {mapExpanded && (
        <View style={[styles.fullMapRoot, { paddingTop: insets.top }]}>
          <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
          {/* Map fills entire root */}
          <RideMap cameraRef={fullCameraRef} position={activePos} />

          {/* ── Google-Maps-style top bar ── */}
          <View style={styles.fullTopBar} pointerEvents="box-none">
            {/* Close button — top-left */}
            <TouchableOpacity style={styles.fullCloseBtn} onPress={() => setMapExpanded(false)} accessibilityLabel="Close fullscreen map">
              <Text style={styles.fullCloseBtnText}>✕</Text>
            </TouchableOpacity>

            {/* GPS badge — top-center */}
            <View style={[styles.fullGpsBadge, { backgroundColor: position ? '#10B981' : 'rgba(0,0,0,0.5)' }]}>
              <Text style={styles.gpsText}>
                {position
                  ? `📍 ${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`
                  : '⏳ Acquiring GPS…'}
              </Text>
            </View>
          </View>

          {/* ── Right control rail (Google-Maps-style vertical stack) ── */}
          <View style={[styles.fullRailRight, { bottom: insets.bottom + 24 }]} pointerEvents="box-none">
            <MapBtn icon="◎" onPress={() => recenter(fullCameraRef)} label="Recenter full map" />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Fixed top (outside ScrollView)
  fixedTop: { paddingHorizontal: 20, paddingTop: 4, gap: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  greeting: { fontSize: 13, fontWeight: '500' },
  userName: { fontSize: 22, fontWeight: '700' },
  trustBadge: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  trustText: { fontSize: 13, fontWeight: '700' },

  // Mini map container (overflow: hidden to clip map)
  mapContainer: { height: 210, borderRadius: 20, overflow: 'hidden', marginBottom: 4 },

  // Shared floating button (white pill, always readable over tiles)
  mapBtn: {
    width: 38, height: 38, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#ffffff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28, shadowRadius: 4, elevation: 5,
  },
  mapBtnIcon: { fontSize: 18, color: '#111' },

  // Right rail (mini map) — vertical stack of buttons, top-right
  mapRailRight: {
    position: 'absolute', top: 10, right: 10,
    gap: 8, alignItems: 'center',
  },

  // GPS badge — bottom-left, semi-transparent
  gpsBadge: {
    position: 'absolute', bottom: 10, left: 10,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
  },
  gpsText: { fontSize: 11, fontWeight: '600', color: '#fff' },

  // Scrollable content
  scroll: { padding: 20, paddingTop: 12, gap: 16, paddingBottom: 40 },
  searchCard: { borderRadius: 20, padding: 16, borderWidth: 1, gap: 12, zIndex: 10 },
  searchTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  connector: { width: 2, height: 8, marginLeft: 17, borderRadius: 1 },
  quickRow: { flexDirection: 'row', gap: 12 },
  quickCard: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 16, alignItems: 'center', gap: 8 },
  quickIcon: { fontSize: 28 },
  quickLabel: { fontSize: 13, fontWeight: '600' },
  comingSoon: { borderRadius: 16, padding: 24, borderWidth: 1, alignItems: 'center', gap: 8 },
  comingSoonText: { fontSize: 14, textAlign: 'center' },

  // Full-screen overlay (no Modal — avoids white screen)
  fullMapRoot: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 100,
  },

  // Full-screen top bar
  fullTopBar: {
    position: 'absolute', top: 12, left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    pointerEvents: 'box-none',
  },
  fullCloseBtn: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#ffffff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 5, elevation: 6,
  },
  fullCloseBtnText: { fontSize: 17, fontWeight: '700', color: '#111' },
  fullGpsBadge: {
    flex: 1, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 9,
    alignItems: 'center',
  },

  // Full-screen right rail — vertical stack, bottom-right
  fullRailRight: {
    position: 'absolute', right: 16,
    gap: 10, alignItems: 'center',
    pointerEvents: 'box-none',
  },
});
