// ─────────────────────────────────────────────────────────────
// Login screen
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

export default function LoginScreen() {
  const router = useRouter();
  const { theme } = useThemeStore();
  const { setTokens, setUser } = useAuthStore();
  const c = theme.colors;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const data = await authApi.login(email.trim().toLowerCase(), password);
      setTokens(data.access_token, data.refresh_token);
      setUser(data.user);
      // Navigation handled by root layout auth gate
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      Alert.alert('Login failed', msg);
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
        {/* Logo */}
        <View style={styles.header}>
          <View style={[styles.logoWrap, { backgroundColor: c.accent }]}>
            <Text style={styles.logoText}>RC</Text>
          </View>
          <Text style={[styles.appName, { color: c.text }]}>RideColab</Text>
          <Text style={[styles.tagline, { color: c.textSecondary }]}>
            Share the road. Split the cost.{'\n'}Nobody profits.
          </Text>
        </View>

        {/* Form */}
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[styles.formTitle, { color: c.text }]}>Sign In</Text>

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
            <View style={styles.pwRow}>
              <TextInput
                style={[styles.input, styles.pwInput, { backgroundColor: c.inputBg, color: c.text, borderColor: c.border }]}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={c.textMuted}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                <Text style={{ fontSize: 18 }}>{showPassword ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <AppButton label="Sign In" onPress={handleLogin} loading={loading} style={{ marginTop: 8 }} />

          <View style={styles.dividerRow}>
            <View style={[styles.divider, { backgroundColor: c.border }]} />
            <Text style={[styles.dividerText, { color: c.textMuted }]}>or</Text>
            <View style={[styles.divider, { backgroundColor: c.border }]} />
          </View>

          <AppButton
            label="Continue with Google"
            onPress={() => Alert.alert('Google OAuth', 'Opens browser flow. Set up in Phase 4 EAS build.')}
            variant="secondary"
            icon={<Text style={{ fontSize: 18 }}>G</Text>}
          />
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: c.textSecondary }]}>Don't have an account? </Text>
          <TouchableOpacity onPress={() => router.push('/register' as any)}>
            <Text style={[styles.footerLink, { color: c.accent }]}>Sign up</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.disclaimer, { color: c.textMuted }]}>
          Not a taxi service. No commission. Student project.
        </Text>
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
  tagline: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  card: { borderRadius: 20, padding: 24, borderWidth: 1, gap: 14 },
  formTitle: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '500' },
  input: { height: 50, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontSize: 15 },
  pwRow: { flexDirection: 'row', alignItems: 'center' },
  pwInput: { flex: 1 },
  eyeBtn: { position: 'absolute', right: 14, height: 50, justifyContent: 'center' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  divider: { flex: 1, height: 1 },
  dividerText: { fontSize: 13 },
  footer: { flexDirection: 'row', justifyContent: 'center' },
  footerText: { fontSize: 14 },
  footerLink: { fontSize: 14, fontWeight: '600' },
  disclaimer: { fontSize: 12, textAlign: 'center' },
});
