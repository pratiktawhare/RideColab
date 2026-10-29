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
  onMapLoaded,
}: {
  cameraRef: React.MutableRefObject<CameraRef | null>;
  position: ReturnType<typeof useCurrentPosition> | undefined;
  onMapLoaded?: () => void;
}) {
  const mapStyle = env.MAP_TILE_URL || 'https://tiles.openfreemap.org/styles/liberty';
  return (
    <MapLibreMap
      style={StyleSheet.absoluteFill}
      mapStyle={mapStyle}
      // compass bottom-left — away from all our overlay buttons
      compassPosition={{ bottom: 80, left: 12 }}
      onDidFinishLoadingMap={onMapLoaded}
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
  const { search: storeSearch, setOrigin, setDestination } = useTripsStore();
  const c = theme.colors;
  const insets = useSafeAreaInsets();

  const cameraRef = useRef<CameraRef | null>(null);
  const fullCameraRef = useRef<CameraRef | null>(null);
  const position = useCurrentPosition({ enabled: true });
  const [mapExpanded, setMapExpanded] = useState(false);
  const [locationGranted, setLocationGranted] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [fullMapLoaded, setFullMapLoaded] = useState(false);

  // Request location permission on mount
  useEffect(() => {
    ExpoLocation.requestForegroundPermissionsAsync()
      .then(({ status }) => setLocationGranted(status === 'granted'))
      .catch(() => setLocationGranted(false));
  }, []);

  const safeFlyTo = (ref: React.MutableRefObject<CameraRef | null>, center: [number, number]) => {
    try {
      const res = ref.current?.flyTo({ center, duration: 1500 });
      if (res && typeof (res as Promise<unknown>).catch === 'function') {
        (res as Promise<unknown>).catch(() => {});
      }
    } catch {
      // safe fallback if native view is detached
    }
  };

  // Fly to GPS once it arrives AND map native view is ready
  useEffect(() => {
    const lng = position?.coords.longitude;
    const lat = position?.coords.latitude;
    if (!lng || !lat) return;
    if (mapLoaded) {
      safeFlyTo(cameraRef, [lng, lat]);
    }
    if (mapExpanded && fullMapLoaded) {
      safeFlyTo(fullCameraRef, [lng, lat]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position?.coords.longitude, position?.coords.latitude, mapLoaded, mapExpanded, fullMapLoaded]);

  const [mode, setMode] = useState<'rider' | 'passenger'>(user?.mode ?? 'passenger');
  const [origin, setOriginLocal] = useState<GeoResult | null>(storeSearch.origin);
  const [destination, setDestinationLocal] = useState<GeoResult | null>(storeSearch.destination);

  // Keep local state in sync with tripsStore
  useEffect(() => {
    if (storeSearch.origin) setOriginLocal(storeSearch.origin);
    if (storeSearch.destination) setDestinationLocal(storeSearch.destination);
  }, [storeSearch.origin, storeSearch.destination]);

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
    if (origin) setOrigin(origin);
    if (destination) setDestination(destination);
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
    if (p) safeFlyTo(ref, [p.longitude, p.latitude]);
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
          <RideMap cameraRef={cameraRef} position={activePos} onMapLoaded={() => setMapLoaded(true)} />

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
            <TouchableOpacity
              style={[styles.quickCard, { backgroundColor: c.surface, borderColor: c.border }]}
              onPress={() => {
                if (origin) setOrigin(origin);
                if (destination) setDestination(destination);
                router.push('/post-trip' as any);
              }}
            >
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
          <>
            <View style={styles.quickRow}>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <TouchableOpacity style={[styles.quickCard, { backgroundColor: c.surface, borderColor: c.border }]} onPress={() => router.push('/search-rides' as any)}>
                <Text style={styles.quickIcon}>🔍</Text>
                <Text style={[styles.quickLabel, { color: c.text }]}>Find a ride</Text>
              </TouchableOpacity>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <TouchableOpacity style={[styles.quickCard, { backgroundColor: c.surface, borderColor: c.border }]} onPress={() => router.push('/(tabs)/activity' as any)}>
                <Text style={styles.quickIcon}>🎫</Text>
                <Text style={[styles.quickLabel, { color: c.text }]}>My bookings</Text>
              </TouchableOpacity>
            </View>

            {/* Popular commute corridors in Pune */}
            <View style={[styles.routesCard, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[styles.sectionTitle, { color: c.text }]}>📍 Popular Pune Commutes</Text>
              <Text style={[styles.sectionSubtitle, { color: c.textSecondary }]}>
                Tap any corridor to check matching open rides
              </Text>

              <View style={{ gap: 8, marginTop: 4 }}>
                {[
                  {
                    name: 'Hinjewadi ⇄ Kothrud',
                    pickup: { label: 'Hinjewadi IT Park, Pune', lat: 18.5912, lng: 73.7386, source: 'landmark' as const },
                    dropoff: { label: 'Kothrud, Pune', lat: 18.5074, lng: 73.8077, source: 'landmark' as const },
                  },
                  {
                    name: 'Baner ⇄ Viman Nagar',
                    pickup: { label: 'Baner, Pune', lat: 18.5590, lng: 73.7868, source: 'landmark' as const },
                    dropoff: { label: 'Viman Nagar, Pune', lat: 18.5679, lng: 73.9143, source: 'landmark' as const },
                  },
                  {
                    name: 'Swargate ⇄ Magarpatta City',
                    pickup: { label: 'Swargate, Pune', lat: 18.5018, lng: 73.8576, source: 'landmark' as const },
                    dropoff: { label: 'Magarpatta City, Hadapsar', lat: 18.5134, lng: 73.9315, source: 'landmark' as const },
                  },
                ].map((routeItem) => (
                  <TouchableOpacity
                    key={routeItem.name}
                    style={[styles.routePill, { backgroundColor: c.background, borderColor: c.border }]}
                    onPress={() => {
                      handleOriginSelect(routeItem.pickup);
                      handleDestinationSelect(routeItem.dropoff);
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      router.push('/search-rides' as any);
                    }}
                  >
                    <Text style={styles.routePillIcon}>🚗</Text>
                    <Text style={[styles.routePillText, { color: c.text }]}>{routeItem.name}</Text>
                    <Text style={[styles.routePillArrow, { color: c.accent }]}>→</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Zero-profit guarantee */}
            <View style={[styles.trustBox, { backgroundColor: c.accentMuted, borderColor: c.accent }]}>
              <Text style={styles.trustBoxIcon}>🤝</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.trustBoxTitle, { color: c.accent }]}>100% Non-Profit Cost Sharing</Text>
                <Text style={[styles.trustBoxDesc, { color: c.text }]}>
                  Passengers only share direct ARAI fuel costs. Zero commission. Nobody profits.
                </Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* ── Full-screen map — absolute overlay (avoids Modal white-screen bug) ── */}
      {mapExpanded && (
        <View style={[styles.fullMapRoot, { paddingTop: insets.top }]}>
          <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
          {/* Map fills entire root */}
          <RideMap cameraRef={fullCameraRef} position={activePos} onMapLoaded={() => setFullMapLoaded(true)} />

          {/* ── Google-Maps-style top bar ── */}
          <View style={styles.fullTopBar} pointerEvents="box-none">
            {/* Close button — top-left */}
            <TouchableOpacity style={styles.fullCloseBtn} onPress={() => { setMapExpanded(false); setFullMapLoaded(false); }} accessibilityLabel="Close fullscreen map">
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
  routesCard: { borderRadius: 20, padding: 16, borderWidth: 1, gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  sectionSubtitle: { fontSize: 12 },
  routePill: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 12, borderWidth: 1,
  },
  routePillIcon: { fontSize: 16 },
  routePillText: { fontSize: 14, fontWeight: '600', flex: 1 },
  routePillArrow: { fontSize: 16, fontWeight: '700' },
  trustBox: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 16, padding: 14, borderWidth: 1,
  },
  trustBoxIcon: { fontSize: 24 },
  trustBoxTitle: { fontSize: 13, fontWeight: '700' },
  trustBoxDesc: { fontSize: 12, marginTop: 2, lineHeight: 16 },

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
