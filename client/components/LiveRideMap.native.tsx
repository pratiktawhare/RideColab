// LiveRideMap.native.tsx — Real MapLibre map for live ride
// Only imported on Android/iOS via platform extensions
import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import {
  Map as MapLibreMap,
  Camera as MapLibreCamera,
  Marker,
  GeoJSONSource,
  Layer,
  type CameraRef,
  type LngLatBounds,
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
  riderId?: string;
  isRider?: boolean;
  routeGeoJson?: string | null;
  origin?: RoutePoint | null;
  destination?: RoutePoint | null;
  pickup?: RoutePoint | null;
  dropoff?: RoutePoint | null;
  /** Extra padding so SOS button etc. don't cover the map */
  bottomPadding?: number;
}

const TILE_URL = env.MAP_TILE_URL || 'https://tiles.openfreemap.org/styles/liberty';

export default function LiveRideMap({
  locations,
  myUserId,
  riderId,
  isRider: _isRider,
  routeGeoJson,
  origin,
  destination,
  pickup,
  dropoff,
  bottomPadding = 0,
}: Props) {
  const cameraRef = useRef<CameraRef | null>(null);
  const isMountedRef = useRef(true);
  const [mapReady, setMapReady] = useState(false);
  const hasInitialFitRef = useRef(false);

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

  // Snapped start coordinate from route line if available, else origin
  const resolvedOriginCoord = useMemo<[number, number] | null>(() => {
    if (routeData && routeData.features[0]?.geometry?.type === 'LineString') {
      const coords = (routeData.features[0].geometry as GeoJSON.LineString).coordinates;
      if (coords && coords.length > 0 && Array.isArray(coords[0])) {
        return [coords[0][0], coords[0][1]];
      }
    }
    return origin ? [origin.lng, origin.lat] : null;
  }, [routeData, origin]);

  // Snapped end coordinate from route line if available, else destination
  const resolvedDestCoord = useMemo<[number, number] | null>(() => {
    if (routeData && routeData.features[0]?.geometry?.type === 'LineString') {
      const coords = (routeData.features[0].geometry as GeoJSON.LineString).coordinates;
      if (coords && coords.length > 0 && Array.isArray(coords[coords.length - 1])) {
        const last = coords[coords.length - 1];
        return [last[0], last[1]];
      }
    }
    return destination ? [destination.lng, destination.lat] : null;
  }, [routeData, destination]);

  // Separate pickup point if distinct from origin by > 100m
  const showDistinctPickup = useMemo(() => {
    if (!pickup || !resolvedOriginCoord) return false;
    const dist =
      Math.abs(pickup.lat - resolvedOriginCoord[1]) +
      Math.abs(pickup.lng - resolvedOriginCoord[0]);
    return dist > 0.001; // ~110m
  }, [pickup, resolvedOriginCoord]);

  // Separate dropoff point if distinct from destination by > 100m
  const showDistinctDropoff = useMemo(() => {
    if (!dropoff || !resolvedDestCoord) return false;
    const dist =
      Math.abs(dropoff.lat - resolvedDestCoord[1]) +
      Math.abs(dropoff.lng - resolvedDestCoord[0]);
    return dist > 0.001;
  }, [dropoff, resolvedDestCoord]);

  // Determine active rider location (or vehicle)
  const vehicleLoc = useMemo(() => {
    if (riderId) {
      const found = locations.find((l) => l.userId === riderId);
      if (found) return found;
    }
    return locations[0] ?? null;
  }, [locations, riderId]);

  // User's own location
  const myLoc = useMemo(() => {
    return locations.find((l) => l.userId === myUserId) ?? null;
  }, [locations, myUserId]);

  // Compute bounding box covering the entire route, endpoints, and occupants
  const routeBounds = useMemo<LngLatBounds | null>(() => {
    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;

    const includePoint = (lng: number, lat: number) => {
      if (typeof lng !== 'number' || typeof lat !== 'number' || isNaN(lng) || isNaN(lat)) return;
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    };

    if (routeData && routeData.features[0]?.geometry?.type === 'LineString') {
      const coords = (routeData.features[0].geometry as GeoJSON.LineString).coordinates;
      for (const [lng, lat] of coords) {
        includePoint(lng, lat);
      }
    }

    if (resolvedOriginCoord) includePoint(resolvedOriginCoord[0], resolvedOriginCoord[1]);
    if (resolvedDestCoord) includePoint(resolvedDestCoord[0], resolvedDestCoord[1]);
    if (pickup) includePoint(pickup.lng, pickup.lat);
    if (dropoff) includePoint(dropoff.lng, dropoff.lat);

    for (const loc of locations) {
      includePoint(loc.lng, loc.lat);
    }

    if (minLng === Infinity || minLat === Infinity || maxLng === -Infinity || maxLat === -Infinity) {
      return null;
    }

    // Minimum padding margin if single point
    if (Math.abs(maxLng - minLng) < 0.005) {
      minLng -= 0.005;
      maxLng += 0.005;
    }
    if (Math.abs(maxLat - minLat) < 0.005) {
      minLat -= 0.005;
      maxLat += 0.005;
    }

    return [minLng, minLat, maxLng, maxLat];
  }, [routeData, resolvedOriginCoord, resolvedDestCoord, pickup, dropoff, locations]);

  // Fit bounds helper
  const fitRouteBounds = useCallback(() => {
    if (!isMountedRef.current || !cameraRef.current || !routeBounds) return;
    try {
      cameraRef.current.fitBounds(routeBounds, {
        duration: 800,
        padding: { top: 70, bottom: 90, left: 40, right: 40 },
      });
    } catch {
      // safe fallback
    }
  }, [routeBounds]);

  // On initial map load: frame the route and starting point
  const handleMapLoaded = useCallback(() => {
    setMapReady(true);
    if (!hasInitialFitRef.current && routeBounds) {
      hasInitialFitRef.current = true;
      setTimeout(() => {
        fitRouteBounds();
      }, 200);
    }
  }, [routeBounds, fitRouteBounds]);

  // Re-fit once if map was ready before routeData was parsed
  useEffect(() => {
    if (mapReady && routeBounds && !hasInitialFitRef.current) {
      hasInitialFitRef.current = true;
      fitRouteBounds();
    }
  }, [mapReady, routeBounds, fitRouteBounds]);

  // Fly to starting point
  const flyToStart = useCallback(() => {
    if (!isMountedRef.current || !cameraRef.current || !resolvedOriginCoord) return;
    try {
      cameraRef.current.flyTo({
        center: resolvedOriginCoord,
        duration: 900,
        zoom: 15,
      });
    } catch {
      // safe fallback
    }
  }, [resolvedOriginCoord]);

  // Fly to vehicle / me
  const flyToActive = useCallback(() => {
    if (!isMountedRef.current || !cameraRef.current) return;
    const target = vehicleLoc ?? myLoc ?? (resolvedOriginCoord ? { lng: resolvedOriginCoord[0], lat: resolvedOriginCoord[1] } : null);
    if (!target) return;

    try {
      cameraRef.current.flyTo({
        center: [target.lng, target.lat],
        duration: 800,
        zoom: 15,
      });
    } catch {
      // safe fallback
    }
  }, [vehicleLoc, myLoc, resolvedOriginCoord]);

  // Initial view state fallback
  const initialViewState = useMemo(() => {
    if (routeBounds) {
      return {
        bounds: routeBounds,
      };
    }
    const center: [number, number] = resolvedOriginCoord ?? [73.8567, 18.5204];
    return {
      center,
      zoom: 14,
    };
  }, [routeBounds, resolvedOriginCoord]);

  return (
    <View style={[styles.container, { paddingBottom: bottomPadding }]}>
      <MapLibreMap
        style={styles.map}
        mapStyle={TILE_URL}
        onDidFinishLoadingMap={handleMapLoaded}
      >
        <MapLibreCamera
          ref={cameraRef}
          initialViewState={initialViewState}
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

        {/* ── Start / Origin Marker (Clear 'A' badge + label) ── */}
        {resolvedOriginCoord ? (
          <Marker key="route-origin" lngLat={resolvedOriginCoord}>
            <View style={styles.endpointMarker}>
              <View style={[styles.endpointBadge, { backgroundColor: '#10B981' }]}>
                <Text style={styles.endpointText}>A</Text>
              </View>
              {origin?.label ? (
                <View style={styles.labelBubble}>
                  <Text style={styles.labelText} numberOfLines={1}>
                    {origin.label}
                  </Text>
                </View>
              ) : null}
            </View>
          </Marker>
        ) : null}

        {/* ── Distinct Passenger Pickup Marker (if different from origin) ── */}
        {showDistinctPickup && pickup ? (
          <Marker key="passenger-pickup" lngLat={[pickup.lng, pickup.lat]}>
            <View style={styles.endpointMarker}>
              <View style={[styles.endpointBadge, { backgroundColor: '#F59E0B' }]}>
                <Text style={styles.endpointText}>P</Text>
              </View>
              {pickup.label ? (
                <View style={[styles.labelBubble, { borderColor: '#F59E0B' }]}>
                  <Text style={styles.labelText} numberOfLines={1}>
                    Pickup: {pickup.label}
                  </Text>
                </View>
              ) : null}
            </View>
          </Marker>
        ) : null}

        {/* ── Distinct Passenger Dropoff Marker (if different from destination) ── */}
        {showDistinctDropoff && dropoff ? (
          <Marker key="passenger-dropoff" lngLat={[dropoff.lng, dropoff.lat]}>
            <View style={styles.endpointMarker}>
              <View style={[styles.endpointBadge, { backgroundColor: '#8B5CF6' }]}>
                <Text style={styles.endpointText}>D</Text>
              </View>
              {dropoff.label ? (
                <View style={[styles.labelBubble, { borderColor: '#8B5CF6' }]}>
                  <Text style={styles.labelText} numberOfLines={1}>
                    Dropoff: {dropoff.label}
                  </Text>
                </View>
              ) : null}
            </View>
          </Marker>
        ) : null}

        {/* ── End / Destination Marker (Clear 'B' badge + label) ── */}
        {resolvedDestCoord ? (
          <Marker key="route-dest" lngLat={resolvedDestCoord}>
            <View style={styles.endpointMarker}>
              <View style={[styles.endpointBadge, { backgroundColor: '#EF4444' }]}>
                <Text style={styles.endpointText}>B</Text>
              </View>
              {destination?.label ? (
                <View style={[styles.labelBubble, styles.destBubble]}>
                  <Text style={styles.labelText} numberOfLines={1}>
                    {destination.label}
                  </Text>
                </View>
              ) : null}
            </View>
          </Marker>
        ) : null}

        {/* ── Occupants Live Pins (🚗 for Vehicle, 👤 for Passenger) ── */}
        {locations.map((loc) => {
          const isVehicle = riderId ? loc.userId === riderId : loc.userId !== myUserId;
          const isMe = loc.userId === myUserId;
          return (
            <Marker key={loc.userId} lngLat={[loc.lng, loc.lat]}>
              <View style={[styles.pinWrapper, isVehicle ? styles.riderHalo : styles.passengerHalo]}>
                <View style={[styles.pin, isVehicle ? styles.riderPin : styles.passengerPin]}>
                  <Text style={styles.pinIcon}>{isVehicle ? '🚗' : '👤'}</Text>
                </View>
                {isMe ? (
                  <View style={styles.youBadge}>
                    <Text style={styles.youText}>You</Text>
                  </View>
                ) : null}
              </View>
            </Marker>
          );
        })}
      </MapLibreMap>

      {/* ── Floating Controls Rail (Fit Route, Start Point, Vehicle / Me) ── */}
      <View style={styles.controlsRail}>
        {/* Fit full route and all endpoints */}
        <TouchableOpacity
          style={styles.controlBtn}
          onPress={fitRouteBounds}
          activeOpacity={0.8}
          accessibilityLabel="Fit entire route"
        >
          <Text style={styles.controlBtnIcon}>⛶</Text>
          <Text style={styles.controlBtnText}>Route</Text>
        </TouchableOpacity>

        {/* Fly to starting point */}
        {resolvedOriginCoord ? (
          <TouchableOpacity
            style={styles.controlBtn}
            onPress={flyToStart}
            activeOpacity={0.8}
            accessibilityLabel="Center on starting point"
          >
            <Text style={[styles.controlBtnIcon, { color: '#10B981' }]}>A</Text>
            <Text style={styles.controlBtnText}>Start</Text>
          </TouchableOpacity>
        ) : null}

        {/* Fly to vehicle or current user */}
        {locations.length > 0 ? (
          <TouchableOpacity
            style={styles.controlBtn}
            onPress={flyToActive}
            activeOpacity={0.8}
            accessibilityLabel="Center on vehicle"
          >
            <Text style={styles.controlBtnIcon}>🚗</Text>
            <Text style={styles.controlBtnText}>Live</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },

  // Route endpoint badges (A / B / P / D)
  endpointMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  endpointBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
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
  labelBubble: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#10B981',
    marginTop: 3,
    maxWidth: 140,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  destBubble: {
    borderColor: '#EF4444',
  },
  labelText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0F1B33',
    textAlign: 'center',
  },

  // Occupant live pins
  pinWrapper: {
    width: 44,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderHalo: {
    backgroundColor: 'rgba(14, 147, 132, 0.2)',
    borderRadius: 22,
  },
  passengerHalo: {
    backgroundColor: 'rgba(15, 27, 51, 0.15)',
    borderRadius: 22,
  },
  pin: {
    width: 30,
    height: 30,
    borderRadius: 15,
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
  passengerPin: {
    backgroundColor: '#0F1B33',
  },
  pinIcon: {
    fontSize: 13,
  },
  youBadge: {
    backgroundColor: '#0F1B33',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    marginTop: 2,
  },
  youText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '700',
  },

  // Floating controls rail
  controlsRail: {
    position: 'absolute',
    right: 12,
    top: 16,
    gap: 8,
    alignItems: 'center',
  },
  controlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  controlBtnIcon: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F1B33',
  },
  controlBtnText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#6B7280',
    marginTop: -1,
  },
});
