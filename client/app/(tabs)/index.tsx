import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { palette, spacing, radii, fontSizes, fontWeights } from '../../theme/tokens';
import { APP_NAME } from '../../constants/app';

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      {/* Map placeholder — MapLibre added in Phase 4 */}
      <View style={styles.mapPlaceholder}>
        <Text style={styles.mapEmoji}>🗺️</Text>
        <Text style={styles.mapText}>Map loads in EAS Dev Build</Text>
        <Text style={styles.mapSubtext}>Phase 4 — MapLibre integration</Text>
      </View>

      {/* Bottom sheet peek */}
      <View style={styles.sheet}>
        {/* Handle */}
        <View style={styles.handle} />

        {/* App name + mode toggle */}
        <View style={styles.header}>
          <View>
            <Text style={styles.appName}>{APP_NAME}</Text>
            <Text style={styles.tagline}>Share the road. Split the cost.</Text>
          </View>

          {/* Rider / Passenger toggle placeholder */}
          <View style={styles.toggle}>
            <TouchableOpacity style={[styles.toggleBtn, styles.toggleActive]}>
              <Text style={styles.toggleTextActive}>Rider</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.toggleBtn}>
              <Text style={styles.toggleText}>Passenger</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Search bar placeholder */}
        <View style={styles.searchBar}>
          <Text style={styles.searchText}>🔍  Where to?</Text>
        </View>

        {/* Quick-pick chips */}
        <View style={styles.chips}>
          {['Hinjewadi', 'Kothrud', 'Swargate', 'Pune Station'].map((place) => (
            <TouchableOpacity key={place} style={styles.chip}>
              <Text style={styles.chipText}>{place}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.phaseBadge}>
          <Text style={styles.phaseBadgeText}>✅ Phase 1 — Server + App shell running</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.grey100,
  },
  mapPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D1E5F0',
  },
  mapEmoji: {
    fontSize: 64,
    marginBottom: spacing.md,
  },
  mapText: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: palette.navy,
  },
  mapSubtext: {
    fontSize: fontSizes.sm,
    color: palette.grey500,
    marginTop: spacing.xs,
  },
  sheet: {
    backgroundColor: palette.white,
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    padding: spacing.lg,
    paddingTop: spacing.sm,
    shadowColor: palette.navy,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: radii.full,
    backgroundColor: palette.grey300,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  appName: {
    fontSize: fontSizes['2xl'],
    fontWeight: fontWeights.bold,
    color: palette.navy,
  },
  tagline: {
    fontSize: fontSizes.xs,
    color: palette.grey500,
    marginTop: 2,
  },
  toggle: {
    flexDirection: 'row',
    backgroundColor: palette.grey100,
    borderRadius: radii.lg,
    padding: 3,
  },
  toggleBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
  },
  toggleActive: {
    backgroundColor: palette.navy,
  },
  toggleText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: palette.grey500,
  },
  toggleTextActive: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: palette.white,
  },
  searchBar: {
    backgroundColor: palette.grey100,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  searchText: {
    fontSize: fontSizes.md,
    color: palette.grey400,
  },
  chips: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
    marginBottom: spacing.md,
  },
  chip: {
    backgroundColor: palette.tealMuted,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  chipText: {
    fontSize: fontSizes.xs,
    color: palette.teal,
    fontWeight: fontWeights.medium,
  },
  phaseBadge: {
    backgroundColor: '#DCFCE7',
    borderRadius: radii.md,
    padding: spacing.sm,
    alignItems: 'center',
  },
  phaseBadgeText: {
    fontSize: fontSizes.xs,
    color: '#166534',
    fontWeight: fontWeights.medium,
  },
});
