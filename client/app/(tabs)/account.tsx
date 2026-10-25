// Account screen — dark mode toggle, language, sign out
import React from 'react';
import { View, Text, Switch, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/services/api';
import Constants from 'expo-constants';

export default function AccountScreen() {
  const router = useRouter();
  const { theme, scheme, toggle } = useThemeStore();
  const { user, logout } = useAuthStore();
  const c = theme.colors;

  const handleSignOut = async () => {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          try { await authApi.logout(); } catch { /* ignore */ }
          logout();
        },
      },
    ]);
  };

  const Row = ({ label, right }: { label: string; right: React.ReactNode }) => (
    <View style={[styles.row, { borderBottomColor: c.divider }]}>
      <Text style={[styles.rowLabel, { color: c.text }]}>{label}</Text>
      {right}
    </View>
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.title, { color: c.text }]}>Account</Text>

        {/* Profile card */}
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={[styles.avatar, { backgroundColor: c.accent }]}>
            <Text style={styles.avatarText}>{(user?.name ?? 'U')[0].toUpperCase()}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: c.text }]}>{user?.name ?? '—'}</Text>
            <Text style={[styles.profileEmail, { color: c.textSecondary }]}>{user?.email ?? '—'}</Text>
            <View style={[styles.trustBadge, { backgroundColor: c.accentMuted }]}>
              <Text style={[styles.trustText, { color: c.accent }]}>⭐ Trust score: {user?.trust_score ?? 50}</Text>
            </View>
          </View>
        </View>

        {/* Settings */}
        <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Row
            label="🌙 Dark mode"
            right={<Switch value={scheme === 'dark'} onValueChange={toggle} trackColor={{ true: c.accent }} />}
          />
          <Row
            label="🌐 Language"
            right={<Text style={[styles.rowValue, { color: c.textSecondary }]}>English</Text>}
          />
          <TouchableOpacity onPress={() => router.push('/my-vehicles' as any)}>
            <Row
              label="🚗 My Vehicles"
              right={<Text style={[styles.rowValue, { color: c.accent }]}>Manage →</Text>}
            />
          </TouchableOpacity>
          <Row
            label="🆘 Emergency contacts"
            right={<Text style={[styles.rowValue, { color: c.accent }]}>Manage →</Text>}
          />
          <Row
            label="📋 Version"
            right={
              <Text style={[styles.rowValue, { color: c.textMuted }]}>
                {Constants.expoConfig?.version ?? '1.0.0'}
              </Text>
            }
          />
          <Row
            label="⚖️ Legal note"
            right={<Text style={[styles.rowValue, { color: c.textMuted }]}>Not a taxi service</Text>}
          />
        </View>

        <TouchableOpacity
          style={[styles.signOutBtn, { backgroundColor: c.dangerBg, borderColor: c.danger }]}
          onPress={handleSignOut}
        >
          <Text style={[styles.signOutText, { color: c.danger }]}>Sign out</Text>
        </TouchableOpacity>

        <Text style={[styles.disclaimer, { color: c.textMuted }]}>
          Not a taxi service. No commission. Student project.{'\n'}DPDP Act 2023 compliant.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: 20, gap: 20, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '800' },
  card: { borderRadius: 20, padding: 20, borderWidth: 1, flexDirection: 'row', gap: 16, alignItems: 'center' },
  avatar: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 24, fontWeight: '800', color: '#FFF' },
  profileInfo: { flex: 1, gap: 4 },
  profileName: { fontSize: 18, fontWeight: '700' },
  profileEmail: { fontSize: 13 },
  trustBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start', marginTop: 4 },
  trustText: { fontSize: 12, fontWeight: '700' },
  section: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  rowLabel: { fontSize: 15 },
  rowValue: { fontSize: 14 },
  signOutBtn: { borderRadius: 16, borderWidth: 1, paddingVertical: 16, alignItems: 'center' },
  signOutText: { fontSize: 16, fontWeight: '700' },
  disclaimer: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
});
