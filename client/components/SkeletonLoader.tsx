// ─────────────────────────────────────────────────────────────
// SkeletonLoader — animated shimmer placeholder
// ─────────────────────────────────────────────────────────────
import React, { useEffect } from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolateColor,
  Easing,
} from 'react-native-reanimated';
import { useThemeStore } from '@/store/themeStore';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function SkeletonLoader({ width = '100%', height = 16, borderRadius = 8, style }: SkeletonProps) {
  const { theme, scheme } = useThemeStore();
  const progress = useSharedValue(0);

  const base = scheme === 'light' ? '#E5E7EB' : '#1F2937';
  const highlight = scheme === 'light' ? '#F3F4F6' : '#374151';

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [base, highlight]),
  }));

  return (
    <Animated.View
      style={[{ width: width as number, height, borderRadius }, animStyle, style]}
    />
  );
}

// ─── Pre-built skeleton card ──────────────────────────────────
export function SkeletonCard() {
  const { theme } = useThemeStore();
  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <View style={styles.row}>
        <SkeletonLoader width={48} height={48} borderRadius={24} />
        <View style={styles.lines}>
          <SkeletonLoader height={14} width="60%" />
          <SkeletonLoader height={11} width="40%" style={{ marginTop: 6 }} />
        </View>
      </View>
      <SkeletonLoader height={11} style={{ marginTop: 12 }} />
      <SkeletonLoader height={11} width="80%" style={{ marginTop: 6 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  lines: { flex: 1, gap: 0 },
});
