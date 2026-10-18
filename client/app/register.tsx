// ─────────────────────────────────────────────────────────────
// Register screen
// ─────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { useThemeStore } from '@/store/themeStore';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/services/api';

export default function RegisterScreen() {
  const router = useRouter();
  const { theme } = useThemeStore();
  const { setTokens, setUser } = useAuthStore();
  const c = theme.colors;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || password.length < 8) {
      Alert.alert('Check your inputs', 'Name and email are required. Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      const data = await authApi.register(email.trim().toLowerCase(), password, name.trim());
      setTokens(data.access_token, data.refresh_token);
      setUser(data.user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      Alert.alert('Registration failed', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: c.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={[styles.logoWrap, { backgroundColor: c.accent }]}>
            <Text style={styles.logoText}>RC</Text>
          </View>
          <Text style={[styles.appName, { color: c.text }]}>Create Account</Text>
          <Text style={[styles.tagline, { color: c.textSecondary }]}>
            Join Pune's cost-sharing community
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={styles.field}>
            <Text style={[styles.label, { color: c.textSecondary }]}>Full name</Text>
            <TextInput
              style={[styles.input, { backgroundColor: c.inputBg, color: c.text, borderColor: c.border }]}
              value={name}
              onChangeText={setName}
              placeholder="Enter your full name"
              placeholderTextColor={c.textMuted}
              autoCapitalize="words"
              returnKeyType="next"
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: c.textSecondary }]}>Email</Text>
            <TextInput
              style={[styles.input, { backgroundColor: c.inputBg, color: c.text, borderColor: c.border }]}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={c.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: c.textSecondary }]}>Password</Text>
            <TextInput
              style={[styles.input, { backgroundColor: c.inputBg, color: c.text, borderColor: c.border }]}
              value={password}
              onChangeText={setPassword}
              placeholder="Min. 8 characters"
              placeholderTextColor={c.textMuted}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleRegister}
            />
          </View>

          <Text style={[styles.consent, { color: c.textMuted }]}>
            By signing up you agree that RideColab is a cost-sharing app. Riders never profit. No taxi service. DPDP Act compliant.
          </Text>

          <AppButton label="Create Account" onPress={handleRegister} loading={loading} />
        </View>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: c.textSecondary }]}>Already have an account? </Text>
          <TouchableOpacity onPress={() => router.push('/login' as any)}>
            <Text style={[styles.footerLink, { color: c.accent }]}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, padding: 24, justifyContent: 'center', gap: 24 },
  header: { alignItems: 'center', gap: 8 },
  logoWrap: { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: 26, fontWeight: '800', color: '#FFFFFF' },
  appName: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  tagline: { fontSize: 14, textAlign: 'center' },
  card: { borderRadius: 20, padding: 24, borderWidth: 1, gap: 14 },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '500' },
  input: { height: 50, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontSize: 15 },
  consent: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'center' },
  footerText: { fontSize: 14 },
  footerLink: { fontSize: 14, fontWeight: '600' },
});
