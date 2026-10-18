// ─────────────────────────────────────────────────────────────
// AppButton — primary / secondary / ghost / danger
// ─────────────────────────────────────────────────────────────
import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  View,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useThemeStore } from '@/store/themeStore';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface AppButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  labelStyle?: TextStyle;
}

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  fullWidth = true,
  icon,
  style,
  labelStyle,
}: AppButtonProps) {
  const { theme } = useThemeStore();
  const c = theme.colors;

  const bgMap: Record<Variant, string> = {
    primary: c.primary,
    secondary: c.surface,
    ghost: 'transparent',
    danger: c.danger,
  };
  const textMap: Record<Variant, string> = {
    primary: '#FFFFFF',
    secondary: c.text,
    ghost: c.accent,
    danger: '#FFFFFF',
  };
  const borderMap: Record<Variant, string | undefined> = {
    primary: undefined,
    secondary: c.border,
    ghost: undefined,
    danger: undefined,
  };

  const bg = bgMap[variant];
  const textColor = textMap[variant];
  const border = borderMap[variant];

  const handlePress = () => {
    if (disabled || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  };

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={handlePress}
      disabled={disabled || loading}
      style={[
        styles.base,
        { backgroundColor: bg, borderWidth: border ? 1 : 0, borderColor: border },
        fullWidth && styles.fullWidth,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <View style={styles.row}>
          {icon && <View style={styles.icon}>{icon}</View>}
          <Text style={[styles.label, { color: textColor }, labelStyle]}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  fullWidth: { width: '100%' },
  disabled: { opacity: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  icon: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 16, fontWeight: '600', letterSpacing: 0.2 },
});
