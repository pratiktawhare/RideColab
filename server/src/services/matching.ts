/**
 * Phase 7 — Matching Engine
 *
 * Turns a passenger's pickup/dropoff request into a ranked list of open trips.
 * Uses PostGIS corridor search (zero ORS calls) followed by JS scoring with
 * hot-reloadable weights from ranking_weights.json.
 */
import fs from 'fs';
import path from 'path';
import { query } from '~/db/pool';
import { logger } from '~/utils/logger';

// ── Weight file hot-reload ────────────────────────────────────────────────────
const WEIGHTS_PATH = path.resolve(__dirname, '../data/ranking_weights.json');

export interface RankingWeights {
  route_overlap: number;
  time_fit: number;
  detour: number;
  trust: number;
  preferences: number;
}

function loadWeights(): RankingWeights {
  try {
    return JSON.parse(fs.readFileSync(WEIGHTS_PATH, 'utf8')) as RankingWeights;
  } catch {
    logger.warn('ranking_weights.json not found; using defaults');
    return { route_overlap: 0.30, time_fit: 0.25, detour: 0.20, trust: 0.15, preferences: 0.10 };
  }
}

let _weights = loadWeights();

// Watch for changes — zero-restart hot reload
if (fs.existsSync(WEIGHTS_PATH)) {
  fs.watch(WEIGHTS_PATH, () => {
    try {
      _weights = loadWeights();
      logger.info({ weights: _weights }, 'ranking_weights.json reloaded');
    } catch { /* ignore transient write events */ }
  });
}

export function currentWeights(): RankingWeights { return _weights; }

// ── Types ─────────────────────────────────────────────────────────────────────
export interface SearchParams {
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
  /** Centre of ±30-min departure window */
  departure_time: Date;
  seats?: number;
  radius_m?: number;
  women_only?: boolean;
  community_id?: string | null;
  vehicle_type?: string | null;
  /** Passenger gender for preference scoring (optional) */
  passenger_gender?: string | null;
}

export interface SmartPickup {
  lat: number;
  lng: number;
  /** Nearest landmark name within 200 m, or null */
  landmark: string | null;
}

export interface MatchResult {
  trip_id: string;
  rider_id: string;
  rider_name: string;
  trust_score: number;
  departure_time: string;
  origin_label: string;
  destination_label: string;
  seats_available: number;
  fare_set: number | null;
  fare_cap: number;
  is_women_only: boolean;
  vehicle_type: string;
  vehicle_make: string;
  vehicle_model: string;
  registration_suffix: string;
  community_id: string | null;
  notes: string | null;
  smart_pickup: SmartPickup;
  score: number;
  /** Score breakdown for "Why this match?" */
  score_breakdown: {
    route_overlap: number;
    time_fit: number;
    detour: number;
    trust: number;
    preferences: number;
  };
}

// ── PostGIS SQL filter ────────────────────────────────────────────────────────
const SEARCH_SQL = `
SELECT
  t.id                  AS trip_id,
  t.rider_id,
  u.name                AS rider_name,
  COALESCE(ts.score, 50)::numeric AS trust_score,
  t.depart_at           AS departure_time,
  t.origin_label,
  t.dest_label          AS destination_label,
  t.seats_available,
  t.fare_set,
  t.fare_cap,
  t.is_women_only,
  t.community_id,
  t.notes,
  vc.type               AS vehicle_type,
  vc.make               AS vehicle_make,
  vc.model              AS vehicle_model,
  v.plate_number        AS registration_suffix,
  -- route overlap fraction: how much of the trip corridor is shared with passenger
  GREATEST(0, LEAST(1,
    ST_LineLocatePoint(t.route::geometry, ST_SetSRID(ST_MakePoint($4, $3), 4326))
      - ST_LineLocatePoint(t.route::geometry, ST_SetSRID(ST_MakePoint($2, $1), 4326))
  )) AS raw_overlap,
  -- smart pickup: nearest point on route to passenger pickup
  ST_Y(ST_ClosestPoint(t.route::geometry, ST_SetSRID(ST_MakePoint($2, $1), 4326))) AS pickup_snap_lat,
  ST_X(ST_ClosestPoint(t.route::geometry, ST_SetSRID(ST_MakePoint($2, $1), 4326))) AS pickup_snap_lng,
  -- detour proxy: distance from snapped pickup to actual passenger pickup (in metres)
  ST_Distance(
    ST_ClosestPoint(t.route::geometry, ST_SetSRID(ST_MakePoint($2, $1), 4326))::geography,
    ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
  ) AS pickup_detour_m
FROM trips t
JOIN users  u  ON t.rider_id   = u.id
LEFT JOIN trust_scores ts ON ts.user_id = u.id
JOIN vehicles  v  ON t.vehicle_id = v.id
JOIN vehicle_catalog vc ON v.catalog_id = vc.id
WHERE t.status = 'open'
  AND t.seats_available > 0
  AND t.seats_available >= $5
  -- pickup within corridor
  AND ST_DWithin(
        t.route,
        ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
        $6
      )
  -- dropoff within corridor
  AND ST_DWithin(
        t.route,
        ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography,
        $6
      )
  -- pickup must come before dropoff along route
  AND ST_LineLocatePoint(t.route::geometry, ST_SetSRID(ST_MakePoint($2, $1), 4326))
      < ST_LineLocatePoint(t.route::geometry, ST_SetSRID(ST_MakePoint($4, $3), 4326))
  -- ±30 min departure window
  AND t.depart_at BETWEEN $7 AND $8
  -- optional filters
  AND ($9::uuid IS NULL OR t.community_id = $9::uuid)
  AND ($10 = false OR t.is_women_only = true)
  AND ($11::text IS NULL OR vc.type = $11::text)
ORDER BY t.depart_at
LIMIT 50
`;

// ── Nearest landmark lookup ───────────────────────────────────────────────────
async function nearestLandmark(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await query<{ name: string }>(
      `SELECT name FROM landmarks
       WHERE ST_DWithin(
         location,
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
         200
       )
       ORDER BY ST_Distance(
         location,
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
       )
       LIMIT 1`,
      [lng, lat],
    );
    return res.rows[0]?.name ?? null;
  } catch { return null; }
}

// ── Scoring helpers ───────────────────────────────────────────────────────────

/** Gaussian decay: score=1 at Δt=0, ~0.6 at Δt=σ, ~0.14 at Δt=2σ */
function gaussianTimeFit(tripTime: Date, requestedTime: Date, sigmaMins = 15): number {
  const deltaMs = Math.abs(tripTime.getTime() - requestedTime.getTime());
  const deltaMin = deltaMs / 60_000;
  return Math.exp(-(deltaMin * deltaMin) / (2 * sigmaMins * sigmaMins));
}

/** 1 – (detour_m / radius_m), clamped 0–1 */
function detourScore(detourM: number, radiusM: number): number {
  return Math.max(0, 1 - detourM / radiusM);
}

// ── Main search function ──────────────────────────────────────────────────────
export async function searchRides(params: SearchParams): Promise<MatchResult[]> {
  const {
    pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
    departure_time, seats = 1, radius_m = 500,
    women_only = false, community_id = null, vehicle_type = null,
    passenger_gender = null,
  } = params;

  const earliest = new Date(departure_time.getTime() - 30 * 60_000);
  const latest   = new Date(departure_time.getTime() + 30 * 60_000);

  const result = await query(
    SEARCH_SQL,
    [
      pickup_lat, pickup_lng,       // $1, $2
      dropoff_lat, dropoff_lng,     // $3, $4
      seats,                        // $5
      radius_m,                     // $6
      earliest, latest,             // $7, $8
      community_id,                 // $9
      women_only,                   // $10
      vehicle_type,                 // $11
    ],
  );

  const weights = currentWeights();

  // Score and build results in parallel (landmark lookup)
  const results = await Promise.all(
    result.rows.map(async (row) => {
      const snapLat: number = Number(row.pickup_snap_lat);
      const snapLng: number = Number(row.pickup_snap_lng);
      const detourM: number = Number(row.pickup_detour_m);
      const rawOverlap: number = Number(row.raw_overlap);

      const overlapScore = Math.min(1, Math.max(0, rawOverlap));
      const tfScore      = gaussianTimeFit(new Date(row.departure_time as string), departure_time);
      const detScore     = detourScore(detourM, radius_m);
      const tScore       = Math.min(1, Number(row.trust_score) / 100);

      // Preference score: women-only preference vs passenger gender
      let prefScore = 0.5;
      if (passenger_gender === 'female' && row.is_women_only) prefScore = 1.0;
      else if (passenger_gender !== 'female' && !row.is_women_only) prefScore = 0.8;

      const totalScore =
        overlapScore * weights.route_overlap +
        tfScore      * weights.time_fit +
        detScore     * weights.detour +
        tScore       * weights.trust +
        prefScore    * weights.preferences;

      // Nearest landmark for smart pickup label
      const landmark = await nearestLandmark(snapLat, snapLng);

      return {
        trip_id:              row.trip_id as string,
        rider_id:             row.rider_id as string,
        rider_name:           row.rider_name as string,
        trust_score:          Number(row.trust_score),
        departure_time:       new Date(row.departure_time as string).toISOString(),
        origin_label:         row.origin_label as string,
        destination_label:    row.destination_label as string,
        seats_available:      Number(row.seats_available),
        fare_set:             row.fare_set != null ? Number(row.fare_set) : null,
        fare_cap:             Number(row.fare_cap),
        is_women_only:        Boolean(row.is_women_only),
        vehicle_type:         row.vehicle_type as string,
        vehicle_make:         row.vehicle_make as string,
        vehicle_model:        row.vehicle_model as string,
        registration_suffix:  row.registration_suffix as string,
        community_id:         row.community_id as string | null,
        notes:                row.notes as string | null,
        smart_pickup: {
          lat:      snapLat,
          lng:      snapLng,
          landmark,
        },
        score: Math.round(totalScore * 1000) / 1000,
        score_breakdown: {
          route_overlap: Math.round(overlapScore * weights.route_overlap * 1000) / 1000,
          time_fit:      Math.round(tfScore      * weights.time_fit      * 1000) / 1000,
          detour:        Math.round(detScore     * weights.detour        * 1000) / 1000,
          trust:         Math.round(tScore       * weights.trust         * 1000) / 1000,
          preferences:   Math.round(prefScore    * weights.preferences   * 1000) / 1000,
        },
      } satisfies MatchResult;
    }),
  );

  // Sort by score descending
  return results.sort((a, b) => b.score - a.score);
}
