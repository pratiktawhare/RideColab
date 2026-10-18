// ─────────────────────────────────────────────────────────────
// ColdStartScreen — shown when API takes > 3 s to respond
// Triggered by React Query's slow network detection
// ─────────────────────────────────────────────────────────────
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { useThemeStore } from '@/store/themeStore';

export function ColdStartScreen() {
  const { theme } = useThemeStore();
  const c = theme.colors;

  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900 }),
        withTiming(0.4, { duration: 900 }),
      ),
      -1,
    );
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const dotStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <Animated.View style={[styles.logoWrap, { backgroundColor: c.accent }, logoStyle]}>
        <Text style={styles.logoText}>RC</Text>
      </Animated.View>
      <Text style={[styles.title, { color: c.text }]}>RideColab</Text>
      <Animated.View style={[styles.dotRow, dotStyle]}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.dot, { backgroundColor: c.accent }]} />
        ))}
      </Animated.View>
      <Text style={[styles.subtitle, { color: c.textSecondary }]}>Waking up the server…</Text>
      <Text style={[styles.hint, { color: c.textMuted }]}>
        Free hosting sleeps after inactivity.{'\n'}Ready in ~30 s.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 },
  logoWrap: { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: 28, fontWeight: '800', color: '#FFFFFF' },
  title: { fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  dotRow: { flexDirection: 'row', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  subtitle: { fontSize: 15, fontWeight: '500' },
  hint: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
