// ─────────────────────────────────────────────────────────────
// EmptyState & ErrorState — consistent empty/error UI
// ─────────────────────────────────────────────────────────────
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AppButton } from './AppButton';
import { useThemeStore } from '@/store/themeStore';

interface EmptyStateProps {
  emoji?: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ emoji = '🔍', title, subtitle, actionLabel, onAction }: EmptyStateProps) {
  const { theme } = useThemeStore();
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
      {subtitle && <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>{subtitle}</Text>}
      {actionLabel && onAction && (
        <AppButton label={actionLabel} onPress={onAction} variant="ghost" fullWidth={false} style={styles.btn} />
      )}
    </View>
  );
}

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message = 'Something went wrong', onRetry }: ErrorStateProps) {
  const { theme } = useThemeStore();
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>⚠️</Text>
      <Text style={[styles.title, { color: theme.colors.text }]}>{message}</Text>
      {onRetry && <AppButton label="Retry" onPress={onRetry} variant="secondary" fullWidth={false} style={styles.btn} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  emoji: { fontSize: 48, marginBottom: 8 },
  title: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
  subtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  btn: { marginTop: 8 },
});
