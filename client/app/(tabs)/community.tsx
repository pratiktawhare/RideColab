// Community screen — themed shell (populated in Phase 11: Communities)
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '@/store/themeStore';

export default function CommunityScreen() {
  const { theme } = useThemeStore();
  const c = theme.colors;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: c.text }]}>Community</Text>
      </View>
      <View style={styles.center}>
        <Text style={styles.emoji}>🏫</Text>
        <Text style={[styles.heading, { color: c.text }]}>Your college &amp; company pool</Text>
        <Text style={[styles.sub, { color: c.textSecondary }]}>
          Join your institution's community to find trusted ride partners and unlock priority matching.
        </Text>
        <View style={[styles.badge, { backgroundColor: c.accentMuted }]}>
          <Text style={[styles.badgeText, { color: c.accent }]}>Coming in Phase 11 — Communities</Text>
        </View>
        <View style={[styles.inviteCard, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[styles.inviteLabel, { color: c.textSecondary }]}>Have an invite code?</Text>
          <Text style={[styles.inviteCode, { color: c.textMuted }]}>e.g. ZEAL2025</Text>
          <Text style={[styles.inviteHint, { color: c.textMuted }]}>Code entry coming in Phase 11</Text>
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
  inviteCard: { borderRadius: 16, borderWidth: 1, padding: 20, width: '100%', alignItems: 'center', gap: 4, marginTop: 8 },
  inviteLabel: { fontSize: 13, fontWeight: '600' },
  inviteCode: { fontSize: 22, fontWeight: '800', letterSpacing: 4 },
  inviteHint: { fontSize: 11 },
});
