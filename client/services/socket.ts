// ─────────────────────────────────────────────────────────────
// Socket service — wraps socket.io-client for live ride events
// ─────────────────────────────────────────────────────────────
import { io, Socket } from 'socket.io-client';
import { env } from '@/constants/env';

export interface LiveLocation {
  userId: string;
  lat: number;
  lng: number;
  bearing?: number;
  speed?: number;
  ts: number;
}

export interface DeviationAlert {
  userId: string;
  deviationM: number;
  lat: number;
  lng: number;
  ts: number;
}

export interface LongStopAlert {
  userId: string;
  lat: number;
  lng: number;
  ts: number;
}

let socket: Socket | null = null;
let locationInterval: ReturnType<typeof setInterval> | null = null;

// ── Connect to server WS ──────────────────────────────────────
export function connectSocket(token: string): Socket {
  if (socket?.connected) return socket;

  // Derive WS URL from API URL (strip /api/v1 suffix)
  const wsUrl = env.API_URL.replace(/\/api\/v1\/?$/, '');

  socket = io(wsUrl, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket?.id);
  });
  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
  });
  socket.on('connect_error', (err) => {
    console.warn('[Socket] Connection error:', err.message);
  });

  return socket;
}

// ── Disconnect ────────────────────────────────────────────────
export function disconnectSocket(): void {
  stopLocationEmit();
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// ── Join a trip room ──────────────────────────────────────────
export function joinTrip(tripId: string, token: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) {
      reject(new Error('Socket not connected'));
      return;
    }
    socket.emit('join_trip', { tripId, token });
    socket.once('join_trip_ack', (ack: { success: boolean; error?: string }) => {
      if (ack.success) resolve();
      else reject(new Error(ack.error ?? 'join_trip failed'));
    });
  });
}

// ── Leave a trip room ─────────────────────────────────────────
export function leaveTrip(tripId: string): void {
  socket?.emit('leave_trip', { tripId });
}

// ── Start emitting location every 5s (rider only) ────────────
export function startLocationEmit(
  tripId: string,
  getLocation: () => Promise<{ lat: number; lng: number; bearing?: number; speed?: number } | null>,
): void {
  stopLocationEmit(); // clear any previous interval

  locationInterval = setInterval(async () => {
    if (!socket?.connected) return;
    try {
      const loc = await getLocation();
      if (!loc) return;
      socket.emit('location_update', {
        tripId,
        lat: loc.lat,
        lng: loc.lng,
        bearing: loc.bearing,
        speed: loc.speed,
      });
    } catch (e) {
      console.warn('[Socket] Location emit error:', e);
    }
  }, 5000);
}

// ── Stop emitting location ────────────────────────────────────
export function stopLocationEmit(): void {
  if (locationInterval) {
    clearInterval(locationInterval);
    locationInterval = null;
  }
}

// ── Listen for location updates ───────────────────────────────
export function onLocationUpdate(cb: (loc: LiveLocation) => void): () => void {
  socket?.on('location_update', cb);
  return () => socket?.off('location_update', cb);
}

// ── Listen for deviation alerts ───────────────────────────────
export function onDeviationAlert(cb: (alert: DeviationAlert) => void): () => void {
  socket?.on('deviation_alert', cb);
  return () => socket?.off('deviation_alert', cb);
}

// ── Listen for long stop alerts ───────────────────────────────
export function onLongStopAlert(cb: (alert: LongStopAlert) => void): () => void {
  socket?.on('long_stop_alert', cb);
  return () => socket?.off('long_stop_alert', cb);
}

// ── Get current socket instance ───────────────────────────────
export function getSocket(): Socket | null {
  return socket;
}

