// ─────────────────────────────────────────────────────────────
// Geocoding service
// ─────────────────────────────────────────────────────────────
// Strategy:
//  1. Check geocoding_cache for active queries (24 h TTL by SHA-256 hash).
//  2. If cache miss → ORS Geocode API (Pune-focused, live coordinates).
//  3. If ORS unavailable, offline, or returns empty → fallback to landmarks table.
//  4. For empty queries, getAllLandmarks() provides instant quick-pick chips.
// ─────────────────────────────────────────────────────────────
import crypto from 'crypto';
import { query } from '~/db/pool';
import { env } from '~/config/app';
import { logger } from '~/utils/logger';

export interface GeoResult {
  label: string;
  lat: number;
  lng: number;
  source: 'landmark' | 'cache' | 'ors';
}

// ── Landmark search ────────────────────────────────────────────
export async function searchLandmarks(q: string): Promise<GeoResult[]> {
  const pattern = `%${q.toLowerCase()}%`;
  const res = await query<{
    name: string;
    lat: number;
    lng: number;
  }>(
    `SELECT name,
            ST_Y(location::geometry) AS lat,
            ST_X(location::geometry) AS lng
     FROM landmarks
     WHERE LOWER(name) LIKE $1
        OR LOWER(name_hi) LIKE $1
        OR LOWER(name_mr) LIKE $1
     ORDER BY name
     LIMIT 10`,
    [pattern],
  );

  return res.rows.map((r) => ({
    label: r.name,
    lat: Number(r.lat),
    lng: Number(r.lng),
    source: 'landmark' as const,
  }));
}

// ── Get all landmarks (for quick-picks) ───────────────────────
export async function getAllLandmarks(): Promise<GeoResult[]> {
  const res = await query<{
    name: string;
    lat: number;
    lng: number;
    category: string;
  }>(
    `SELECT name,
            ST_Y(location::geometry) AS lat,
            ST_X(location::geometry) AS lng,
            category
     FROM landmarks
     ORDER BY category, name
     LIMIT 50`,
  );

  return res.rows.map((r) => ({
    label: r.name,
    lat: Number(r.lat),
    lng: Number(r.lng),
    source: 'landmark' as const,
  }));
}

// ── ORS Geocode with cache ─────────────────────────────────────
async function geocodeWithORS(q: string): Promise<GeoResult[]> {
  const hash = crypto.createHash('sha256').update(q.toLowerCase().trim()).digest('hex');

  // Check cache first
  const cached = await query<{ results: GeoResult[] }>(
    `SELECT results FROM geocoding_cache
     WHERE query_hash = $1 AND expires_at > NOW()`,
    [hash],
  );
  if (cached.rows.length > 0) {
    logger.debug({ q }, 'geocoding cache hit');
    return (cached.rows[0]!).results;
  }

  // Check ORS API key
  if (!env.ORS_API_KEY) {
    logger.warn('ORS_API_KEY not set — skipping ORS geocoding');
    return [];
  }

  // Call ORS with Pune center focus bias (18.5204, 73.8567)
  const url = `https://api.openrouteservice.org/geocode/search?api_key=${env.ORS_API_KEY}&text=${encodeURIComponent(q)}&boundary.country=IN&size=5&focus.point.lat=18.5204&focus.point.lon=73.8567`;
  logger.info({ q }, 'calling ORS geocoding');

  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      logger.error({ status: response.status, q }, 'ORS geocoding failed');
      return [];
    }

    const data = await response.json() as {
      features?: Array<{
        geometry: { coordinates: [number, number] };
        properties: { label: string };
      }>;
    };

    const results: GeoResult[] = (data.features || []).map((f) => ({
      label: f.properties.label,
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
      source: 'ors' as const,
    }));

    if (results.length > 0) {
      // Cache for 24 h
      await query(
        `INSERT INTO geocoding_cache (query_hash, query_text, results, expires_at)
         VALUES ($1, $2, $3, NOW() + INTERVAL '24 hours')
         ON CONFLICT (query_hash) DO UPDATE
         SET results = $3, expires_at = NOW() + INTERVAL '24 hours'`,
        [hash, q, JSON.stringify(results)],
      );
    }

    return results;
  } catch (err) {
    logger.warn({ err, q }, 'ORS geocoding request failed or timed out — using fallback');
    return [];
  }
}

// ── Main search: live ORS (with cache) first, DB landmarks fallback ─────────────────
export async function geocodeSearch(q: string): Promise<GeoResult[]> {
  if (!q || q.trim().length < 2) return [];

  // 1. Try live geocoding (checks geocoding_cache first, then live ORS API)
  const liveResults = await geocodeWithORS(q);
  if (liveResults.length > 0) {
    logger.debug({ q, count: liveResults.length }, 'geocoding served from live ORS / cache');
    return liveResults;
  }

  // 2. Fallback to DB landmarks if ORS is offline, rate-limited, or returns no results
  const landmarks = await searchLandmarks(q);
  if (landmarks.length > 0) {
    logger.debug({ q, count: landmarks.length }, 'geocoding fallback served from landmarks');
    return landmarks;
  }

  return [];
}
