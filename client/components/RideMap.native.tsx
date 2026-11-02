// ─────────────────────────────────────────────────────────────
// RideMap (Native: Android & iOS) — @maplibre/maplibre-react-native
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import {
  Map as MapLibreMap,
  Camera as MapLibreCamera,
  UserLocation,
  useCurrentPosition,
  LogManager,
  type CameraRef,
} from '@maplibre/maplibre-react-native';
import { env } from '@/constants/env';

// Suppress harmless ReactTagResolver unmount race warnings in Fabric
try {
  LogManager.onLog((log) => {
    if (
      log.tag === 'ReactTagResolver' ||
      log.message?.includes('ReactTagResolver') ||
      log.message?.includes('resolved to `view` null')
    ) {
      return true; // suppresses console.error
    }
    return false;
  });
} catch {
  // safe fallback if LogManager is unavailable
}

export { useCurrentPosition, type CameraRef };

export interface RideMapProps {
  cameraRef: React.MutableRefObject<CameraRef | null>;
  position: ReturnType<typeof useCurrentPosition> | undefined;
  onMapLoaded?: () => void;
  onUnmount?: () => void;
}

export function RideMap({
  cameraRef,
  position,
  onMapLoaded,
  onUnmount,
}: RideMapProps) {
  const mapStyle = env.MAP_TILE_URL || 'https://tiles.openfreemap.org/styles/liberty';
  const isMountedRef = useRef(true);
  const innerCameraRef = useRef<CameraRef | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cameraRef.current = null;
      onUnmount?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Expose a safe proxy to the parent cameraRef that guards against unmounted Fabric views
  const updateProxy = () => {
    const inner = innerCameraRef.current;
    if (!inner) return;

    cameraRef.current = {
      jumpTo: (opts) => {
        if (!isMountedRef.current) return;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const res: any = inner.jumpTo?.(opts);
          if (res && typeof res.catch === 'function') res.catch(() => {});
        } catch {
          // safe fallback
        }
      },
      easeTo: (opts) => {
        if (!isMountedRef.current) return;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const res: any = inner.easeTo?.(opts);
          if (res && typeof res.catch === 'function') res.catch(() => {});
        } catch {
          // safe fallback
        }
      },
      flyTo: (opts) => {
        if (!isMountedRef.current) return;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const res: any = inner.flyTo?.(opts);
          if (res && typeof res.catch === 'function') {
            res.catch(() => {});
          }
        } catch {
          // safe fallback
        }
      },
      fitBounds: (bounds, opts) => {
        if (!isMountedRef.current) return;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const res: any = inner.fitBounds?.(bounds, opts);
          if (res && typeof res.catch === 'function') res.catch(() => {});
        } catch {
          // safe fallback
        }
      },
      zoomTo: (zoom, opts) => {
        if (!isMountedRef.current) return;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const res: any = inner.zoomTo?.(zoom, opts);
          if (res && typeof res.catch === 'function') res.catch(() => {});
        } catch {
          // safe fallback
        }
      },
      setStop: async (stop) => {
        if (!isMountedRef.current) return;
        try {
          await inner.setStop?.(stop);
        } catch {
          // safe fallback
        }
      },
    };
  };

  return (
    <MapLibreMap
      style={StyleSheet.absoluteFill}
      mapStyle={mapStyle}
      // compass bottom-left — away from all our overlay buttons
      compassPosition={{ bottom: 80, left: 12 }}
      onDidFinishLoadingMap={() => {
        updateProxy();
        onMapLoaded?.();
      }}
    >
      <MapLibreCamera
        ref={(ref) => {
          innerCameraRef.current = ref;
          updateProxy();
        }}
        initialViewState={{
          center: [
            position?.coords.longitude ?? 73.8567,
            position?.coords.latitude ?? 18.5204,
          ] as [number, number],
          zoom: position ? 14 : 11,
        }}
      />
      {position && <UserLocation animated accuracy heading />}
    </MapLibreMap>
  );
}
