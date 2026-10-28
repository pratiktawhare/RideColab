// ─────────────────────────────────────────────────────────────
// Home screen — rider/passenger toggle, live place search, map view
// ─────────────────────────────────────────────────────────────
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Modal,
  TouchableOpacity, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

// ── Reusable map view (used in both mini + full-screen) ────────
function RideMap({
  cameraRef,
  position,
}: {
  cameraRef: React.MutableRefObject<CameraRef | null>;
  position: ReturnType<typeof useCurrentPosition> | undefined;
}) {
  const mapStyle = env.MAP_TILE_URL || 'https://tiles.openfreemap.org/styles/liberty';
  return (
    <MapLibreMap style={StyleSheet.absoluteFill} mapStyle={mapStyle}>
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

export default function HomeScreen() {
  const router = useRouter();
  const { theme } = useThemeStore();
  const { user, setUser } = useAuthStore();
  const { setOrigin, setDestination } = useTripsStore();
  const c = theme.colors;

  // MapLibre v11 — no setAccessToken needed for OpenFreeMap
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

  // Fly to user's real position once GPS is acquired
  useEffect(() => {
    const lng = position?.coords.longitude;
    const lat = position?.coords.latitude;
    if (!lng || !lat) return;
    cameraRef.current?.flyTo({ center: [lng, lat] as [number, number] });
    fullCameraRef.current?.flyTo({ center: [lng, lat] as [number, number] });
  }, [position?.coords.longitude, position?.coords.latitude]);

  const [mode, setMode] = useState<'rider' | 'passenger'>(user?.mode ?? 'passenger');
  const [origin, setOriginLocal] = useState<GeoResult | null>(null);
  const [destination, setDestinationLocal] = useState<GeoResult | null>(null);

  const handleModeChange = async (next: 'rider' | 'passenger') => {
    setMode(next);
    try {
      await userApi.switchMode(next);
      if (user) setUser({ ...user, mode: next });
    } catch {
      setMode(mode);
    }
  };

  const handleOriginSelect = (r: GeoResult) => { setOriginLocal(r); setOrigin(r); };
  const handleDestinationSelect = (r: GeoResult) => { setDestinationLocal(r); setDestination(r); };

  const handleAction = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    router.push('/post-trip' as any);
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>

      {/* ── Fixed top section (outside ScrollView — no gesture conflict) ── */}
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
            <Text style={[styles.trustText, { color: c.accent }]}>
              ⭐ {user?.trust_score ?? 50}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Mode toggle */}
        <RiderPassengerToggle value={mode} onChange={handleModeChange} />

        {/* Mini map — outside scroll, so map pan never triggers list scroll */}
        <View style={styles.mapContainer}>
          <RideMap cameraRef={cameraRef} position={locationGranted ? position : undefined} />

          {/* Expand button — always white bg + dark icon for visibility in any theme */}
          <TouchableOpacity
            style={styles.expandBtn}
            onPress={() => setMapExpanded(true)}
            accessibilityLabel="Expand map"
          >
            <Text style={styles.expandIcon}>⛶</Text>
          </TouchableOpacity>

          {/* GPS status badge */}
          <View style={[styles.gpsBadge, { backgroundColor: position ? '#10B981' : 'rgba(0,0,0,0.45)' }]}>
            <Text style={styles.gpsText}>
              {position ? '📍 GPS' : '⏳ Locating…'}
            </Text>
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
            <PlaceSearch
              label="Your pickup point"
              value={origin?.label ?? ''}
              onSelect={handleOriginSelect}
              dotColor="🟢"
            />
            <View style={[styles.connector, { backgroundColor: c.border }]} />
            <PlaceSearch
              label="Where are you going?"
              value={destination?.label ?? ''}
              onSelect={handleDestinationSelect}
              dotColor="🔴"
            />
          </View>

          <AppButton
            label={mode === 'rider' ? 'Post this trip →' : 'Search rides →'}
            onPress={handleAction}
            variant="primary"
            style={{ marginTop: 4 }}
          />
        </View>

        {/* Rider quick actions */}
        {mode === 'rider' && (
          <View style={styles.quickRow}>
            <TouchableOpacity
              style={[styles.quickCard, { backgroundColor: c.surface, borderColor: c.border }]}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onPress={() => router.push('/post-trip' as any)}
            >
              <Text style={styles.quickIcon}>🚗</Text>
              <Text style={[styles.quickLabel, { color: c.text }]}>Post a trip</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickCard, { backgroundColor: c.surface, borderColor: c.border }]}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onPress={() => router.push('/my-trips' as any)}
            >
              <Text style={styles.quickIcon}>📋</Text>
              <Text style={[styles.quickLabel, { color: c.text }]}>My trips</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Coming soon placeholder */}
        {mode === 'passenger' && (
          <View style={[styles.comingSoon, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={{ fontSize: 32 }}>🔍</Text>
            <Text style={[styles.comingSoonText, { color: c.textSecondary }]}>
              Ride matching coming in Phase 7
            </Text>
          </View>
        )}
      </ScrollView>

      {/* ── Full-screen map modal ─────────────────────────────── */}
      <Modal
        visible={mapExpanded}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setMapExpanded(false)}
      >
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
        <View style={styles.fullMapRoot}>
          <RideMap cameraRef={fullCameraRef} position={locationGranted ? position : undefined} />

          {/* Close button */}
          <SafeAreaView style={styles.fullMapOverlay} edges={['top', 'bottom']}>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setMapExpanded(false)}
              accessibilityLabel="Close fullscreen map"
            >
              <Text style={styles.closeBtnText}>✕  Close map</Text>
            </TouchableOpacity>

            {/* GPS badge on full screen too */}
            <View style={[styles.fullGpsBadge, { backgroundColor: position ? '#10B981' : 'rgba(0,0,0,0.5)' }]}>
              <Text style={styles.gpsText}>
                {position
                  ? `📍 ${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`
                  : '⏳ Acquiring GPS…'}
              </Text>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Fixed top (header + toggle + map) — outside ScrollView
  fixedTop: { paddingHorizontal: 20, paddingTop: 4, gap: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  greeting: { fontSize: 13, fontWeight: '500' },
  userName: { fontSize: 22, fontWeight: '700' },
  trustBadge: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  trustText: { fontSize: 13, fontWeight: '700' },

  // Mini map
  mapContainer: {
    height: 200, borderRadius: 20, overflow: 'hidden', marginBottom: 4,
  },
  // Expand button — white bg + dark icon, always visible in any theme
  expandBtn: {
    position: 'absolute', top: 10, right: 10,
    width: 38, height: 38, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#ffffff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4, elevation: 5,
  },
  expandIcon: { fontSize: 18, color: '#111' },
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

  // Quick actions
  quickRow: { flexDirection: 'row', gap: 12 },
  quickCard: {
    flex: 1, borderRadius: 16, borderWidth: 1, padding: 16,
    alignItems: 'center', gap: 8,
  },
  quickIcon: { fontSize: 28 },
  quickLabel: { fontSize: 13, fontWeight: '600' },
  comingSoon: { borderRadius: 16, padding: 24, borderWidth: 1, alignItems: 'center', gap: 8 },
  comingSoonText: { fontSize: 14, textAlign: 'center' },

  // Full-screen map modal
  fullMapRoot: { flex: 1 },
  fullMapOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'space-between',
    pointerEvents: 'box-none',
  },
  // Close button — white pill, always readable over map
  closeBtn: {
    alignSelf: 'flex-end',
    margin: 16,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 6, elevation: 6,
    flexDirection: 'row', alignItems: 'center',
  },
  closeBtnText: { fontSize: 15, fontWeight: '700', color: '#111' },
  fullGpsBadge: {
    alignSelf: 'center',
    marginBottom: 20,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
});

