// LiveRideMap.native.tsx — Real MapLibre map for live ride
// Only imported on Android/iOS via platform extensions
import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  Map as MapLibreMap,
  Camera as MapLibreCamera,
  Marker,
  GeoJSONSource,
  Layer,
  type CameraRef,
} from '@maplibre/maplibre-react-native';
import { LiveLocationPoint } from '@/services/api';
import { env } from '@/constants/env';

export interface RoutePoint {
  lat: number;
  lng: number;
  label?: string;
}

interface Props {
  locations: LiveLocationPoint[];
  myUserId: string;
  routeGeoJson?: string | null;
  origin?: RoutePoint | null;
  destination?: RoutePoint | null;
  /** Extra padding so SOS button etc. don't cover the map */
  bottomPadding?: number;
}

const TILE_URL = env.MAP_TILE_URL || 'https://tiles.openfreemap.org/styles/liberty';

export default function LiveRideMap({
  locations,
  myUserId,
  routeGeoJson,
  origin,
  destination,
  bottomPadding = 0,
}: Props) {
  const cameraRef = useRef<CameraRef | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cameraRef.current = null;
    };
  }, []);

  // Parse route into GeoJSON FeatureCollection
  const routeData = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (routeGeoJson) {
      try {
        const parsed = typeof routeGeoJson === 'string' ? JSON.parse(routeGeoJson) : routeGeoJson;
        if (parsed.type === 'LineString') {
          return {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: {},
                geometry: parsed,
              },
            ],
          };
        } else if (parsed.type === 'FeatureCollection') {
          return parsed as GeoJSON.FeatureCollection;
        } else if (parsed.type === 'Feature') {
          return { type: 'FeatureCollection', features: [parsed] };
        }
      } catch (err) {
        console.warn('LiveRideMap: Failed to parse routeGeoJson', err);
      }
    }

    // Fallback: straight line from origin to destination
    if (origin && destination) {
      return {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: [
                [origin.lng, origin.lat],
                [destination.lng, destination.lat],
              ],
            },
          },
        ],
      };
    }

    return null;
  }, [routeGeoJson, origin, destination]);

  // Determine active rider location (or first occupant location)
  const riderLoc = locations.find((l) => l.userId !== myUserId) ?? locations[0];

  // Pan to rider or self when position updates
  const panToActivePosition = useCallback(() => {
    if (!isMountedRef.current || !cameraRef.current) return;
    const target = riderLoc ?? (origin ? { lng: origin.lng, lat: origin.lat } : null);
    if (!target) return;

    try {
      cameraRef.current.easeTo({
        center: [target.lng, target.lat],
        duration: 350,
      });
    } catch {
      // ignore camera errors during transitions
    }
  }, [riderLoc, origin]);

  useEffect(() => {
    panToActivePosition();
  }, [panToActivePosition]);

  // Initial center: rider > origin > Pune default
  const initialCenter: [number, number] = riderLoc
    ? [riderLoc.lng, riderLoc.lat]
    : origin
    ? [origin.lng, origin.lat]
    : [73.8567, 18.5204];

  return (
    <View style={[styles.container, { paddingBottom: bottomPadding }]}>
      <MapLibreMap style={styles.map} mapStyle={TILE_URL}>
        <MapLibreCamera
          ref={cameraRef}
          initialViewState={{ center: initialCenter, zoom: 14 }}
        />

        {/* ── Route Line ── */}
        {routeData ? (
          <GeoJSONSource id="route-line-source" data={routeData}>
            {/* Outline / glow */}
            <Layer
              id="route-line-casing"
              type="line"
              style={{
                lineColor: '#0F1B33',
                lineWidth: 7,
                lineCap: 'round',
                lineJoin: 'round',
                lineOpacity: 0.4,
              }}
            />
            {/* Main colored route */}
            <Layer
              id="route-line-inner"
              type="line"
              style={{
                lineColor: '#0E9384',
                lineWidth: 4,
                lineCap: 'round',
                lineJoin: 'round',
                lineOpacity: 0.95,
              }}
            />
          </GeoJSONSource>
        ) : null}

        {/* ── Start / Origin Marker ── */}
        {origin ? (
          <Marker key="route-origin" lngLat={[origin.lng, origin.lat]}>
            <View style={styles.endpointMarker}>
              <View style={[styles.endpointBadge, { backgroundColor: '#10B981' }]}>
                <Text style={styles.endpointText}>A</Text>
              </View>
            </View>
          </Marker>
        ) : null}

        {/* ── End / Destination Marker ── */}
        {destination ? (
          <Marker key="route-dest" lngLat={[destination.lng, destination.lat]}>
            <View style={styles.endpointMarker}>
              <View style={[styles.endpointBadge, { backgroundColor: '#EF4444' }]}>
                <Text style={styles.endpointText}>B</Text>
              </View>
            </View>
          </Marker>
        ) : null}

        {/* ── Occupants Live Pins ── */}
        {locations.map((loc) => {
          const isMe = loc.userId === myUserId;
          return (
            <Marker key={loc.userId} lngLat={[loc.lng, loc.lat]}>
              <View style={[styles.pinWrapper, isMe ? styles.meHalo : styles.riderHalo]}>
                <View style={[styles.pin, isMe ? styles.mePin : styles.riderPin]}>
                  <Text style={styles.pinIcon}>{isMe ? '👤' : '🚗'}</Text>
                </View>
              </View>
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

  // Route endpoint badges (A / B)
  endpointMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  endpointBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  endpointText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },

  // Occupant live pins
  pinWrapper: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderHalo: {
    backgroundColor: 'rgba(14, 147, 132, 0.25)',
  },
  meHalo: {
    backgroundColor: 'rgba(15, 27, 51, 0.2)',
  },
  pin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  riderPin: {
    backgroundColor: '#0E9384',
  },
  mePin: {
    backgroundColor: '#0F1B33',
  },
  pinIcon: {
    fontSize: 12,
  },
});
