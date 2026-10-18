// ─────────────────────────────────────────────────────────────
// Environment variable access — typed + validated
// All client env vars MUST be prefixed with EXPO_PUBLIC_
// ─────────────────────────────────────────────────────────────

export const env = {
  API_URL: (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, ''),
  MAP_TILE_URL:
    process.env.EXPO_PUBLIC_MAP_TILE_URL ??
    'https://tiles.openfreemap.org/styles/liberty',
};
