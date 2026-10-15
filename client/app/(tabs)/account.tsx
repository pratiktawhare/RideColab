import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { palette, fontSizes, fontWeights } from '../../theme/tokens';
import { APP_NAME, APP_VERSION } from '../../constants/app';

export default function AccountScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.center}>
        <Text style={styles.emoji}>👤</Text>
        <Text style={styles.title}>Account</Text>
        <Text style={styles.sub}>Profile, settings, and preferences</Text>
        <Text style={styles.phase}>Coming in Phase 3 — Auth & Profiles</Text>

        {/* App info */}
        <View style={styles.info}>
          <Text style={styles.infoText}>{APP_NAME} v{APP_VERSION}</Text>
          <Text style={styles.infoSub}>Cost-sharing only · No commission · Student project</Text>
        </View>
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
  info: {
    marginTop: 32,
    padding: 16,
    backgroundColor: palette.white,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
  },
  infoText: { fontSize: fontSizes.sm, fontWeight: fontWeights.semibold, color: palette.navy },
  infoSub: { fontSize: fontSizes.xs, color: palette.grey500, marginTop: 4, textAlign: 'center' },
});
