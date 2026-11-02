// ─────────────────────────────────────────────────────────────
// RideMap (Web) — Browser-safe Map rendering (no native bindings)
// ─────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';

export interface CameraRef {
  flyTo: (options: { center: [number, number]; duration?: number }) => void;
}

export interface PositionType {
  coords: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    heading?: number;
  };
}

export function useCurrentPosition({ enabled = true }: { enabled?: boolean } = {}): PositionType | null {
  const [pos, setPos] = useState<PositionType | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          setPos({
            coords: {
              latitude: p.coords.latitude,
              longitude: p.coords.longitude,
              accuracy: p.coords.accuracy,
              heading: p.coords.heading ?? 0,
            },
          });
        },
        () => {
          setPos({ coords: { latitude: 18.5204, longitude: 73.8567 } });
        },
        { enableHighAccuracy: true }
      );
    } else {
      setPos({ coords: { latitude: 18.5204, longitude: 73.8567 } });
    }
  }, [enabled]);

  return pos;
}

export interface RideMapProps {
  cameraRef: React.MutableRefObject<CameraRef | null>;
  position: PositionType | null | undefined;
  onMapLoaded?: () => void;
  onUnmount?: () => void;
}

export function RideMap({
  cameraRef,
  position,
  onMapLoaded,
  onUnmount,
}: RideMapProps) {
  const [coords, setCoords] = useState<[number, number]>([
    position?.coords.longitude ?? 73.8567,
    position?.coords.latitude ?? 18.5204,
  ]);

  useEffect(() => {
    if (position?.coords) {
      setCoords([position.coords.longitude, position.coords.latitude]);
    }
  }, [position?.coords.latitude, position?.coords.longitude]);

  useEffect(() => {
    cameraRef.current = {
      flyTo: ({ center }) => {
        setCoords(center);
      },
    };
    onMapLoaded?.();

    return () => {
      cameraRef.current = null;
      onUnmount?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [lng, lat] = coords;
  const bbox = `${lng - 0.04},${lat - 0.03},${lng + 0.04},${lat + 0.03}`;
  const embedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat},${lng}`;

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <iframe
        title="RideColab Web Map"
        width="100%"
        height="100%"
        style={{ border: 'none', width: '100%', height: '100%' } as any}
        src={embedUrl}
        loading="lazy"
      />
    </View>
  );
}

