// ─────────────────────────────────────────────────────────────
// Geocoding service
// ─────────────────────────────────────────────────────────────
// Strategy:
//  1. Fuzzy-match query against landmarks table (DB, 0 ORS calls).
//  2. If no landmark match → ORS Geocode (max 1,000/day).
//  3. Cache ORS results in geocoding_cache for 24 h by SHA-256 hash.
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
    logger.warn('ORS_API_KEY not set — skipping ORS geocoding fallback');
    return [];
  }

  // Call ORS
  const url = `https://api.heigit.org/geocode/search?api_key=${env.ORS_API_KEY}&text=${encodeURIComponent(q)}&boundary.country=IN&size=5`;
  logger.info({ q }, 'calling ORS geocoding');

  const response = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    logger.error({ status: response.status, q }, 'ORS geocoding failed');
    return [];
  }

  const data = await response.json() as {
    features: Array<{
      geometry: { coordinates: [number, number] };
      properties: { label: string };
    }>;
  };

  const results: GeoResult[] = data.features.map((f) => ({
    label: f.properties.label,
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
    source: 'ors' as const,
  }));

  // Cache for 24 h
  await query(
    `INSERT INTO geocoding_cache (query_hash, query_text, results, expires_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '24 hours')
     ON CONFLICT (query_hash) DO UPDATE
     SET results = $3, expires_at = NOW() + INTERVAL '24 hours'`,
    [hash, q, JSON.stringify(results)],
  );

  return results;
}

// ── Main search: landmarks first, ORS fallback ─────────────────
export async function geocodeSearch(q: string): Promise<GeoResult[]> {
  if (!q || q.trim().length < 2) return [];

  const landmarks = await searchLandmarks(q);
  if (landmarks.length > 0) {
    logger.debug({ q, count: landmarks.length }, 'geocoding served from landmarks');
    return landmarks;
  }

  return geocodeWithORS(q);
}
