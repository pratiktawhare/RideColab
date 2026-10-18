// Activity screen — themed shell (populated in Phase 8: Booking Flow)
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '@/store/themeStore';

export default function ActivityScreen() {
  const { theme } = useThemeStore();
  const c = theme.colors;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: c.text }]}>Activity</Text>
      </View>
      <View style={styles.center}>
        <Text style={styles.emoji}>📋</Text>
        <Text style={[styles.heading, { color: c.text }]}>Your trips &amp; bookings</Text>
        <Text style={[styles.sub, { color: c.textSecondary }]}>
          Ride requests, accepted bookings, and trip history appear here.
        </Text>
        <View style={[styles.badge, { backgroundColor: c.accentMuted }]}>
          <Text style={[styles.badgeText, { color: c.accent }]}>Coming in Phase 8 — Booking Flow</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingVertical: 16 },
  title: { fontSize: 26, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emoji: { fontSize: 56, marginBottom: 8 },
  heading: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  sub: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  badge: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, marginTop: 4 },
  badgeText: { fontSize: 12, fontWeight: '600' },
});
