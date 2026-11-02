// LiveRideMap.web.tsx — Web fallback (MapLibre native doesn't run in web canvas)
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export interface RoutePoint {
  lat: number;
  lng: number;
  label?: string;
}

interface Props {
  locations: { userId: string; lat: number; lng: number }[];
  myUserId: string;
  routeGeoJson?: string | null;
  origin?: RoutePoint | null;
  destination?: RoutePoint | null;
  bottomPadding?: number;
}

export default function LiveRideMap({
  locations,
  origin,
  destination,
  bottomPadding = 0,
}: Props) {
  const hasLocation = locations.length > 0;

  return (
    <View style={[styles.container, { paddingBottom: bottomPadding }]}>
      <View style={styles.card}>
        <Text style={styles.icon}>🗺️</Text>
        <Text style={styles.title}>Live Ride Tracking</Text>

        {origin || destination ? (
          <View style={styles.routeBox}>
            {origin ? (
              <Text style={styles.routeItem} numberOfLines={1}>
                🟢 From: {origin.label ?? `${origin.lat.toFixed(4)}, ${origin.lng.toFixed(4)}`}
              </Text>
            ) : null}
            {destination ? (
              <Text style={styles.routeItem} numberOfLines={1}>
                🔴 To: {destination.label ?? `${destination.lat.toFixed(4)}, ${destination.lng.toFixed(4)}`}
              </Text>
            ) : null}
          </View>
        ) : null}

        <Text style={styles.sub}>
          {hasLocation
            ? `🟢 ${locations.length} occupant(s) active on map`
            : '⏳ Acquiring GPS position…'}
        </Text>
        <Text style={styles.hint}>Open Android/iOS app for full interactive vector map</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6', padding: 16, justifyContent: 'center' },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  icon: { fontSize: 44 },
  title: { fontSize: 18, fontWeight: '700', color: '#0F1B33' },
  routeBox: { width: '100%', backgroundColor: '#f9fafb', borderRadius: 8, padding: 10, gap: 4 },
  routeItem: { fontSize: 13, color: '#374151', fontWeight: '500' },
  sub: { fontSize: 14, color: '#0E9384', fontWeight: '600' },
  hint: { fontSize: 12, color: '#9ca3af', textAlign: 'center' },
});
