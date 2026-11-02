// LiveRideMap.native.tsx — Real MapLibre map for live ride
// Only imported on Android/iOS via platform extensions
import React, { useRef, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  Map as MapLibreMap,
  Camera as MapLibreCamera,
  Marker,
  type CameraRef,
} from '@maplibre/maplibre-react-native';
import { LiveLocationPoint } from '@/services/api';
import { env } from '@/constants/env';

interface Props {
  locations: LiveLocationPoint[];
  myUserId: string;
  /** Extra padding so SOS button etc. don't cover the map */
  bottomPadding?: number;
}

const TILE_URL = env.MAP_TILE_URL || 'https://tiles.openfreemap.org/styles/liberty';

export default function LiveRideMap({ locations, myUserId, bottomPadding = 0 }: Props) {
  const cameraRef = useRef<CameraRef | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cameraRef.current = null;
    };
  }, []);

  // Fly to rider's location when it updates
  const riderLoc = locations.find((l) => l.userId !== myUserId) ?? locations[0];

  const flyToRider = useCallback(() => {
    if (!isMountedRef.current || !riderLoc || !cameraRef.current) return;
    try {
      cameraRef.current.easeTo({
        center: [riderLoc.lng, riderLoc.lat],
        duration: 300,
      });
    } catch {
      // ignore camera errors during mount/unmount
    }
  }, [riderLoc]);

  useEffect(() => {
    flyToRider();
  }, [flyToRider]);

  const center: [number, number] = riderLoc
    ? [riderLoc.lng, riderLoc.lat]
    : [73.8567, 18.5204]; // Pune default

  return (
    <View style={[styles.container, { paddingBottom: bottomPadding }]}>
      <MapLibreMap style={styles.map} mapStyle={TILE_URL}>
        <MapLibreCamera
          ref={cameraRef}
          initialViewState={{ center, zoom: 15 }}
        />

        {locations.map((loc) => {
          const isMe = loc.userId === myUserId;
          return (
            <Marker key={loc.userId} lngLat={[loc.lng, loc.lat]}>
              <View style={[styles.pin, isMe ? styles.mePin : styles.riderPin]} />
            </Marker>
          );
        })}
      </MapLibreMap>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  pin: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  riderPin: {
    backgroundColor: '#0E9384',
  },
  mePin: {
    backgroundColor: '#0F1B33',
  },
});
