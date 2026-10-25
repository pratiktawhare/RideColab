// ─────────────────────────────────────────────────────────────
// Routing service — ORS Directions with route_cache
// ─────────────────────────────────────────────────────────────
// Rule: ORS Directions is NEVER called at search time.
//   1. Look up route_cache by rounded coordinates.
//   2. If found → return cached geometry.
//   3. If not → call ORS once → store PostGIS LINESTRING → return.
// Coordinates are rounded to 4 decimal places (~11 m precision)
// so slight GPS drift still hits the cache.
// ─────────────────────────────────────────────────────────────
import { query } from '~/db/pool';
import { env } from '~/config/app';
import { logger } from '~/utils/logger';

export interface RouteResult {
  distance_m: number;
  duration_s: number;
  /** PostGIS LINESTRING as WKT — already stored in DB */
  route_wkt: string;
  source: 'cache' | 'ors';
}

// Round to 4 decimal places for cache key
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// ── ORS Directions API call ────────────────────────────────────
async function fetchOrsRoute(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): Promise<{ distance_m: number; duration_s: number; geojson: object } | null> {
  if (!env.ORS_API_KEY) {
    logger.warn('ORS_API_KEY not set — cannot fetch route from ORS');
    return null;
  }

  const url = 'https://api.heigit.org/v2/directions/driving-car/geojson';
  logger.info({ originLat, originLng, destLat, destLng }, 'calling ORS directions');

  const body = {
    coordinates: [
      [originLng, originLat],
      [destLng, destLat],
    ],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': env.ORS_API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    logger.error({ status: res.status }, 'ORS directions request failed');
    return null;
  }

  const data = await res.json() as {
    features: Array<{
      properties: { summary: { distance: number; duration: number } };
      geometry: object;
    }>;
  };

  const feature = data.features[0];
  if (!feature) return null;

  return {
    distance_m: Math.round(feature.properties.summary.distance),
    duration_s: Math.round(feature.properties.summary.duration),
    geojson: feature.geometry,
  };
}

// ── Main: cache-first route fetch ─────────────────────────────
export async function getRoute(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): Promise<RouteResult | null> {
  const oLat = round4(originLat);
  const oLng = round4(originLng);
  const dLat = round4(destLat);
  const dLng = round4(destLng);

  // 1. Check cache
  const cached = await query<{
    distance_m: number;
    duration_s: number;
    route_wkt: string;
  }>(
    `SELECT distance_m,
            duration_s,
            ST_AsText(route::geometry) AS route_wkt
     FROM route_cache
     WHERE origin_lat = $1
       AND origin_lng = $2
       AND dest_lat   = $3
       AND dest_lng   = $4`,
    [oLat, oLng, dLat, dLng],
  );

  if (cached.rows.length > 0) {
    logger.debug({ oLat, oLng, dLat, dLng }, 'route cache hit');
    const row = cached.rows[0]!;
    return {
      distance_m: row.distance_m,
      duration_s: row.duration_s,
      route_wkt: row.route_wkt,
      source: 'cache',
    };
  }

  // 2. Call ORS
  const ors = await fetchOrsRoute(originLat, originLng, destLat, destLng);
  if (!ors) return null;

  // 3. Store in route_cache as PostGIS GEOGRAPHY from GeoJSON
  await query(
    `INSERT INTO route_cache (origin_lat, origin_lng, dest_lat, dest_lng,
       distance_m, duration_s, route)
     VALUES ($1, $2, $3, $4, $5, $6,
       ST_GeogFromGeoJSON($7))
     ON CONFLICT (origin_lat, origin_lng, dest_lat, dest_lng)
     DO UPDATE SET
       distance_m = $5,
       duration_s = $6,
       route      = ST_GeogFromGeoJSON($7),
       created_at = NOW()`,
    [oLat, oLng, dLat, dLng, ors.distance_m, ors.duration_s, JSON.stringify(ors.geojson)],
  );

  // Fetch back as WKT for consistency
  const stored = await query<{ route_wkt: string }>(
    `SELECT ST_AsText(route::geometry) AS route_wkt
     FROM route_cache
     WHERE origin_lat = $1 AND origin_lng = $2
       AND dest_lat = $3 AND dest_lng = $4`,
    [oLat, oLng, dLat, dLng],
  );

  return {
    distance_m: ors.distance_m,
    duration_s: ors.duration_s,
    route_wkt: stored.rows[0]?.route_wkt ?? '',
    source: 'ors',
  };
}
