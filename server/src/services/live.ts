// ─────────────────────────────────────────────────────────────
// Live location service — hot state in CacheAdapter, async DB flush
// DPDP compliance: live_locations deleted after trip completion
// ─────────────────────────────────────────────────────────────
import { cache } from '~/db/cache';
import { query } from '~/db/pool';
import { logger } from '~/utils/logger';

// ── Types ─────────────────────────────────────────────────────
export interface LiveLocation {
  userId: string;
  lat: number;
  lng: number;
  bearing?: number;
  speed?: number;
  ts: number; // ms since epoch
}

// ── Cache keys ────────────────────────────────────────────────
// live:loc:{tripId}:{userId} → JSON of LiveLocation
// live:loc:{tripId}:index   → JSON string[] of userIds

function locKey(tripId: string, userId: string): string {
  return `live:loc:${tripId}:${userId}`;
}
function indexKey(tripId: string): string {
  return `live:loc:${tripId}:index`;
}

// TTL for live location cache: 5 minutes (auto-expires stale data)
const LOC_TTL_SECONDS = 300;

// ── Update location (called by Socket.io handler) ─────────────
export async function updateLocation(
  tripId: string,
  userId: string,
  lat: number,
  lng: number,
  bearing?: number,
  speed?: number,
): Promise<void> {
  const loc: LiveLocation = { userId, lat, lng, bearing, speed, ts: Date.now() };
  await cache.set(locKey(tripId, userId), JSON.stringify(loc), LOC_TTL_SECONDS);

  // Maintain index of active users in this trip
  const indexRaw = await cache.get(indexKey(tripId));
  const index: string[] = indexRaw ? (JSON.parse(indexRaw) as string[]) : [];
  if (!index.includes(userId)) {
    index.push(userId);
    await cache.set(indexKey(tripId), JSON.stringify(index), LOC_TTL_SECONDS);
  } else {
    // Refresh TTL on index
    await cache.set(indexKey(tripId), JSON.stringify(index), LOC_TTL_SECONDS);
  }
}

// ── Get all live locations for a trip ─────────────────────────
export async function getLocations(tripId: string): Promise<LiveLocation[]> {
  const indexRaw = await cache.get(indexKey(tripId));
  if (!indexRaw) return [];
  const userIds = JSON.parse(indexRaw) as string[];
  const locs: LiveLocation[] = [];

  await Promise.all(
    userIds.map(async (uid) => {
      const raw = await cache.get(locKey(tripId, uid));
      if (raw) locs.push(JSON.parse(raw) as LiveLocation);
    }),
  );

  return locs;
}

// ── Flush to DB (called by cron every 30s) ────────────────────
export async function flushLocationsToDB(tripId: string): Promise<void> {
  try {
    const locs = await getLocations(tripId);
    if (locs.length === 0) return;

    for (const loc of locs) {
      await query(
        `INSERT INTO live_locations (trip_id, user_id, location, bearing, speed_kmh, recorded_at)
         VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326), $5, $6, to_timestamp($7 / 1000.0))`,
        [tripId, loc.userId, loc.lng, loc.lat, loc.bearing ?? null, loc.speed ?? null, loc.ts],
      );
    }
    logger.info({ tripId, count: locs.length }, 'Flushed live locations to DB');
  } catch (err) {
    logger.error({ err, tripId }, 'Failed to flush live locations');
  }
}

// ── Clear trip locations (call on ride complete — DPDP compliance) ──
export async function clearTripLocations(tripId: string): Promise<void> {
  try {
    // Delete from DB if valid UUID
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tripId);
    if (isUuid) {
      await query(`DELETE FROM live_locations WHERE trip_id = $1`, [tripId]);
    }

    // Clear from cache
    const indexRaw = await cache.get(indexKey(tripId));
    if (indexRaw) {
      const userIds = JSON.parse(indexRaw) as string[];
      await Promise.all(userIds.map((uid) => cache.del(locKey(tripId, uid))));
      await cache.del(indexKey(tripId));
    }

    clearDeviationTracker(tripId);

    logger.info({ tripId }, 'Cleared live locations (DPDP compliance)');
  } catch (err) {
    logger.error({ err, tripId }, 'Failed to clear live locations');
  }
}

// ── Detect route deviation (distance in metres from trip's stored route) ─
// Returns geodesic distance in metres from the route linestring
export async function detectDeviation(tripId: string, lat: number, lng: number): Promise<number> {
  try {
    const res = await query<{ deviation_m: number }>(
      `SELECT ST_Distance(
         route,
         ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography
       ) AS deviation_m
       FROM trips
       WHERE id = $1 AND route IS NOT NULL`,
      [tripId, lng, lat],
    );
    if (res.rows.length === 0 || res.rows[0]?.deviation_m == null) return 0;
    return Number(res.rows[0].deviation_m);
  } catch {
    return 0;
  }
}

// ── Track continuous route deviation for > 120s ──────────────
// Spec: >300m off route for >120s → deviation_alert Socket.io event to all occupants
interface DeviationState {
  firstDeviatedAt: number;
  lastAlertedAt?: number;
}
const deviationTimers = new Map<string, DeviationState>();

export function shouldAlertDeviation(tripId: string, deviationM: number): boolean {
  if (deviationM <= 300) {
    // Back on route — clear tracking
    deviationTimers.delete(tripId);
    return false;
  }

  const now = Date.now();
  const state = deviationTimers.get(tripId);

  if (!state) {
    // First ping detected off-route: record timestamp, do not alert yet
    deviationTimers.set(tripId, { firstDeviatedAt: now });
    return false;
  }

  // Must be off-route continuously for > 120 seconds (120,000 ms)
  const durationMs = now - state.firstDeviatedAt;
  if (durationMs >= 120_000) {
    // Cooldown alert: once per 60 seconds
    if (!state.lastAlertedAt || now - state.lastAlertedAt >= 60_000) {
      state.lastAlertedAt = now;
      return true;
    }
  }

  return false;
}

export function clearDeviationTracker(tripId: string): void {
  deviationTimers.delete(tripId);
}

// ── Detect long stop (same position for > 5 min) ──────────────
// Returns true if the user hasn't moved more than ~30m in 5 min
const longStopTimers = new Map<string, { lat: number; lng: number; since: number }>();

export function detectLongStop(tripId: string, userId: string, lat: number, lng: number): boolean {
  const key = `${tripId}:${userId}`;
  const prev = longStopTimers.get(key);
  const now = Date.now();

  if (!prev) {
    longStopTimers.set(key, { lat, lng, since: now });
    return false;
  }

  // ~30m threshold in degrees (approx 0.0003°)
  const moved = Math.abs(lat - prev.lat) > 0.0003 || Math.abs(lng - prev.lng) > 0.0003;
  if (moved) {
    longStopTimers.set(key, { lat, lng, since: now });
    return false;
  }

  // Stationary for > 5 minutes?
  return now - prev.since > 5 * 60 * 1000;
}

// ── Clean up long-stop tracker on ride end ────────────────────
export function clearLongStopTracker(tripId: string, userId: string): void {
  longStopTimers.delete(`${tripId}:${userId}`);
}

