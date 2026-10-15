import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { palette, fontSizes, fontWeights } from '../../theme/tokens';

export default function ActivityScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.center}>
        <Text style={styles.emoji}>📋</Text>
        <Text style={styles.title}>Activity</Text>
        <Text style={styles.sub}>Your trips and bookings appear here</Text>
        <Text style={styles.phase}>Coming in Phase 8 — Booking Flow</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.grey100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emoji: { fontSize: 56, marginBottom: 16 },
  title: { fontSize: fontSizes['2xl'], fontWeight: fontWeights.bold, color: palette.navy },
  sub: { fontSize: fontSizes.md, color: palette.grey500, marginTop: 8, textAlign: 'center' },
  phase: { fontSize: fontSizes.xs, color: palette.teal, marginTop: 16, fontWeight: fontWeights.medium },
});
