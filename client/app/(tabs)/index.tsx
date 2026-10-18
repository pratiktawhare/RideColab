// ─────────────────────────────────────────────────────────────
// Home screen — rider/passenger toggle, search inputs, map placeholder
// ─────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet,
  TouchableOpacity, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '@/store/themeStore';
import { useAuthStore } from '@/store/authStore';
import { RiderPassengerToggle } from '@/components/RiderPassengerToggle';
import { SkeletonCard } from '@/components/SkeletonLoader';
import { userApi } from '@/services/api';

export default function HomeScreen() {
  const { theme } = useThemeStore();
  const { user, setUser } = useAuthStore();
  const c = theme.colors;

  const [mode, setMode] = useState<'rider' | 'passenger'>(user?.mode ?? 'passenger');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [switchingMode, setSwitchingMode] = useState(false);

  const handleModeChange = async (next: 'rider' | 'passenger') => {
    setMode(next);
    setSwitchingMode(true);
    try {
      await userApi.switchMode(next);
      if (user) setUser({ ...user, mode: next });
    } catch {
      // Revert on error
      setMode(mode);
    } finally {
      setSwitchingMode(false);
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
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: c.textSecondary }]}>{greeting()}</Text>
            <Text style={[styles.userName, { color: c.text }]}>{user?.name?.split(' ')[0] ?? 'there'} 👋</Text>
          </View>
          <View style={[styles.trustBadge, { backgroundColor: c.accentMuted }]}>
            <Text style={[styles.trustText, { color: c.accent }]}>
              ⭐ {user?.trust_score ?? 50}
            </Text>
          </View>
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

          {/* From */}
          <View style={[styles.inputRow, { backgroundColor: c.inputBg, borderColor: c.border }]}>
            <Text style={styles.dot}>🟢</Text>
            <TextInput
              style={[styles.searchInput, { color: c.text }]}
              value={from}
              onChangeText={setFrom}
              placeholder="Your pickup point"
              placeholderTextColor={c.textMuted}
            />
          </View>

          {/* Connector */}
          <View style={[styles.connector, { backgroundColor: c.border }]} />

          {/* To */}
          <View style={[styles.inputRow, { backgroundColor: c.inputBg, borderColor: c.border }]}>
            <Text style={styles.dot}>🔴</Text>
            <TextInput
              style={[styles.searchInput, { color: c.text }]}
              value={to}
              onChangeText={setTo}
              placeholder="Where are you going?"
              placeholderTextColor={c.textMuted}
            />
          </View>

          {/* Quick picks */}
          <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>Quick picks — Pune</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
            {['Hinjewadi', 'Kothrud', 'Viman Nagar', 'Baner', 'Hadapsar', 'Pimpri'].map((place) => (
              <TouchableOpacity
                key={place}
                style={[styles.chip, { backgroundColor: c.accentMuted, borderColor: c.accent }]}
                onPress={() => setTo(place)}
              >
                <Text style={[styles.chipText, { color: c.accent }]}>{place}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Results placeholder */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>
            {mode === 'passenger' ? 'Available rides' : 'Your trips'}
          </Text>
          <SkeletonCard />
          <SkeletonCard />
          <View style={[styles.comingSoon, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={{ fontSize: 32 }}>🚀</Text>
            <Text style={[styles.comingSoonText, { color: c.textSecondary }]}>
              Trip matching coming in Phase 7
            </Text>
          </View>
        </View>
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
    height: 180, borderRadius: 20, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  mapEmoji: { fontSize: 40 },
  mapLabel: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  searchCard: { borderRadius: 20, padding: 16, borderWidth: 1, gap: 10 },
  searchTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, height: 48, gap: 10 },
  dot: { fontSize: 12 },
  searchInput: { flex: 1, fontSize: 15 },
  connector: { width: 2, height: 8, marginLeft: 17, borderRadius: 1 },
  sectionLabel: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  chips: { marginHorizontal: -4 },
  chip: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, marginHorizontal: 4 },
  chipText: { fontSize: 13, fontWeight: '500' },
  section: { gap: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  comingSoon: { borderRadius: 16, padding: 24, borderWidth: 1, alignItems: 'center', gap: 8 },
  comingSoonText: { fontSize: 14, textAlign: 'center' },
});
