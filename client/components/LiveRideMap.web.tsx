// LiveRideMap.web.tsx — Web placeholder (MapLibre native doesn't work on web)
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  locations: { userId: string; lat: number; lng: number }[];
  myUserId: string;
  bottomPadding?: number;
}

export default function LiveRideMap({ locations, bottomPadding = 0 }: Props) {
  const hasLocation = locations.length > 0;
  return (
    <View style={[styles.container, { paddingBottom: bottomPadding }]}>
      <View style={styles.placeholder}>
        <Text style={styles.icon}>🗺️</Text>
        <Text style={styles.title}>Live Map</Text>
        <Text style={styles.sub}>
          {hasLocation
            ? `${locations.length} occupant(s) tracked`
            : 'Waiting for location...'}
        </Text>
        <Text style={styles.hint}>Open the Android app for live map</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  icon: { fontSize: 48 },
  title: { fontSize: 18, fontWeight: '700', color: '#0F1B33' },
  sub: { fontSize: 14, color: '#6b7280' },
  hint: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
});

