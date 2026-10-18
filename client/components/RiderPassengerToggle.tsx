// ─────────────────────────────────────────────────────────────
// RiderPassengerToggle — animated floating toggle on Home screen
// ─────────────────────────────────────────────────────────────
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useThemeStore } from '@/store/themeStore';

interface RiderPassengerToggleProps {
  value: 'rider' | 'passenger';
  onChange: (v: 'rider' | 'passenger') => void;
}

export function RiderPassengerToggle({ value, onChange }: RiderPassengerToggleProps) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const translateX = useSharedValue(value === 'rider' ? 0 : 1);

  const handlePress = (next: 'rider' | 'passenger') => {
    if (next === value) return;
    Haptics.selectionAsync().catch(() => {});
    translateX.value = withSpring(next === 'rider' ? 0 : 1, { damping: 20, stiffness: 200 });
    onChange(next);
  };

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: withSpring(translateX.value * 140, { damping: 20, stiffness: 200 }) }],
  }));

  return (
    <View style={[styles.track, { backgroundColor: c.surface, borderColor: c.border }]}>
      {/* Animated thumb */}
      <Animated.View style={[styles.thumb, { backgroundColor: c.accent }, thumbStyle]} />

      {/* Labels */}
      <TouchableOpacity style={styles.option} onPress={() => handlePress('rider')} activeOpacity={0.8}>
        <Text style={[styles.label, { color: value === 'rider' ? '#FFFFFF' : c.textSecondary }]}>
          🚗 Rider
        </Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.option} onPress={() => handlePress('passenger')} activeOpacity={0.8}>
        <Text style={[styles.label, { color: value === 'passenger' ? '#FFFFFF' : c.textSecondary }]}>
          🧳 Passenger
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: 50,
    borderWidth: 1,
    height: 48,
    overflow: 'hidden',
    position: 'relative',
    width: 284,
    alignSelf: 'center',
  },
  thumb: {
    position: 'absolute',
    width: 142,
    height: '100%',
    borderRadius: 50,
  },
  option: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  label: { fontSize: 14, fontWeight: '600' },
});
