// ─────────────────────────────────────────────────────────────
// Home screen — rider/passenger toggle, live place search, map placeholder
// ─────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity,
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

export default function HomeScreen() {
  const router = useRouter();
  const { theme } = useThemeStore();
  const { user, setUser } = useAuthStore();
  const { setOrigin, setDestination } = useTripsStore();
  const c = theme.colors;

  const [mode, setMode] = useState<'rider' | 'passenger'>(user?.mode ?? 'passenger');
  const [origin, setOriginLocal] = useState<GeoResult | null>(null);
  const [destination, setDestinationLocal] = useState<GeoResult | null>(null);
  const [switchingMode, setSwitchingMode] = useState(false);

  const handleModeChange = async (next: 'rider' | 'passenger') => {
    setMode(next);
    setSwitchingMode(true);
    try {
      await userApi.switchMode(next);
      if (user) setUser({ ...user, mode: next });
    } catch {
      setMode(mode);
    } finally {
      setSwitchingMode(false);
    }
  };

  const handleOriginSelect = (r: GeoResult) => {
    setOriginLocal(r);
    setOrigin(r);
  };

  const handleDestinationSelect = (r: GeoResult) => {
    setDestinationLocal(r);
    setDestination(r);
  };

  const handleAction = () => {
    if (mode === 'rider') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.push('/post-trip' as any);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.push('/post-trip' as any); // temp, will be search results screen (Phase 7)
    }
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: c.textSecondary }]}>{greeting()}</Text>
            <Text style={[styles.userName, { color: c.text }]}>{user?.name?.split(' ')[0] ?? 'there'} 👋</Text>
          </View>
          <TouchableOpacity
            style={[styles.trustBadge, { backgroundColor: c.accentMuted }]}
            onPress={() =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            router.push('/my-trips' as any)
          }
          >
            <Text style={[styles.trustText, { color: c.accent }]}>
              ⭐ {user?.trust_score ?? 50}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Mode toggle */}
        <RiderPassengerToggle value={mode} onChange={handleModeChange} />

        {/* Map placeholder */}
        <View style={[styles.mapPlaceholder, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={styles.mapEmoji}>🗺️</Text>
          <Text style={[styles.mapLabel, { color: c.textSecondary }]}>
            Map loads in EAS Dev Build{'\n'}(MapLibre requires native code)
          </Text>
        </View>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: 20, gap: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  greeting: { fontSize: 13, fontWeight: '500' },
  userName: { fontSize: 22, fontWeight: '700' },
  trustBadge: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  trustText: { fontSize: 13, fontWeight: '700' },
  mapPlaceholder: {
    height: 160, borderRadius: 20, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  mapEmoji: { fontSize: 36 },
  mapLabel: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  searchCard: { borderRadius: 20, padding: 16, borderWidth: 1, gap: 12, zIndex: 10 },
  searchTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  connector: { width: 2, height: 8, marginLeft: 17, borderRadius: 1 },
  quickRow: { flexDirection: 'row', gap: 12 },
  quickCard: {
    flex: 1, borderRadius: 16, borderWidth: 1, padding: 16,
    alignItems: 'center', gap: 8,
  },
  quickIcon: { fontSize: 28 },
  quickLabel: { fontSize: 13, fontWeight: '600' },
  comingSoon: { borderRadius: 16, padding: 24, borderWidth: 1, alignItems: 'center', gap: 8 },
  comingSoonText: { fontSize: 14, textAlign: 'center' },
});
