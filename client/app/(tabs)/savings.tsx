// Savings screen — themed shell (populated in Phase 10: Payments, Ratings and Trust)
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '@/store/themeStore';

export default function SavingsScreen() {
  const { theme } = useThemeStore();
  const c = theme.colors;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: c.text }]}>Savings</Text>
      </View>
      <View style={styles.center}>
        <Text style={styles.emoji}>🌿</Text>
        <Text style={[styles.heading, { color: c.text }]}>Your money saved &amp; CO₂ avoided</Text>
        <Text style={[styles.sub, { color: c.textSecondary }]}>
          After each shared trip, see exactly how much you saved and your environmental impact.
        </Text>
        <View style={[styles.badge, { backgroundColor: c.accentMuted }]}>
          <Text style={[styles.badgeText, { color: c.accent }]}>Coming in Phase 10 — Ratings &amp; Trust</Text>
        </View>

        {/* Preview cards */}
        <View style={styles.previewRow}>
          <View style={[styles.previewCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={styles.previewEmoji}>💰</Text>
            <Text style={[styles.previewValue, { color: c.text }]}>₹0</Text>
            <Text style={[styles.previewLabel, { color: c.textSecondary }]}>Saved</Text>
          </View>
          <View style={[styles.previewCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={styles.previewEmoji}>🌱</Text>
            <Text style={[styles.previewValue, { color: c.accent }]}>0 kg</Text>
            <Text style={[styles.previewLabel, { color: c.textSecondary }]}>CO₂ avoided</Text>
          </View>
          <View style={[styles.previewCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={styles.previewEmoji}>🔥</Text>
            <Text style={[styles.previewValue, { color: c.text }]}>0</Text>
            <Text style={[styles.previewLabel, { color: c.textSecondary }]}>Day streak</Text>
          </View>
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
  previewRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  previewCard: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 14, alignItems: 'center', gap: 4 },
  previewEmoji: { fontSize: 28 },
  previewValue: { fontSize: 18, fontWeight: '800' },
  previewLabel: { fontSize: 11, textAlign: 'center' },
});
