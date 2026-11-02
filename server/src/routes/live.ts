// ─────────────────────────────────────────────────────────────
// Live routes — live locations, live share, SOS, helmet, safe arrival
// ─────────────────────────────────────────────────────────────
import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { authenticate } from '~/middleware/authenticate';
import { query } from '~/db/pool';
import { logger } from '~/utils/logger';
import { getLocations } from '~/services/live';
import { logSos, getEmergencyContacts } from '~/services/safety';
import { env } from '~/config/app';

const router = Router();

// ── POST /trips/:id/live-share  (JWT) ─────────────────────────
// Generate or retrieve existing share token for a trip
router.post(
  '/trips/:id/live-share',
  authenticate as RequestHandler,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const tripId = req.params['id']!;

      // Verify caller is the rider
      const tripRes = await query<{ rider_id: string; share_token: string | null }>(
        `SELECT rider_id, share_token FROM trips WHERE id = $1`,
        [tripId],
      );

      if (tripRes.rows.length === 0) {
        res.status(404).json({ success: false, error: { code: 'TRIP_NOT_FOUND', message: 'Trip not found', details: null } });
        return;
      }

      const trip = tripRes.rows[0]!;
      if (trip.rider_id !== userId) {
        res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only the rider can generate a share link', details: null } });
        return;
      }

      // Reuse existing token or generate new one
      let shareToken = trip.share_token;
      if (!shareToken) {
        shareToken = randomUUID();
        await query(`UPDATE trips SET share_token = $1 WHERE id = $2`, [shareToken, tripId]);
      }

      const baseUrl = env.NODE_ENV === 'production'
        ? 'https://ridecolab.app'
        : `http://localhost:${env.PORT}`;

      res.json({
        success: true,
        data: {
          share_token: shareToken,
          share_url: `${baseUrl}/share/${shareToken}`,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /live/:trip_id  (JWT, occupant only) ──────────────────
// Returns current live locations of all occupants
router.get(
  '/live/:trip_id',
  authenticate as RequestHandler,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const tripId = req.params['trip_id']!;

      // Verify caller is an occupant (rider or confirmed passenger)
      const occupantRes = await query<{ id: string }>(
        `SELECT t.id FROM trips t
         WHERE t.id = $1 AND (
           t.rider_id = $2
           OR EXISTS (
             SELECT 1 FROM bookings b
             WHERE b.trip_id = t.id AND b.passenger_id = $2
               AND b.status IN ('accepted', 'started')
           )
         )`,
        [tripId, userId],
      );

      if (occupantRes.rows.length === 0) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Not an occupant of this trip', details: null },
        });
        return;
      }

      const locations = await getLocations(tripId);
      res.json({ success: true, data: locations });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /trips/:id/sos  (JWT) ────────────────────────────────
const SosSchema = z.object({
  lat: z.number().optional(),
  lng: z.number().optional(),
});

router.post(
  '/trips/:id/sos',
  authenticate as RequestHandler,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const tripId = req.params['id']!;

      const parsed = SosSchema.safeParse(req.body);
      const { lat, lng } = parsed.success ? parsed.data : {};

      // Verify caller is an occupant
      const occupantRes = await query<{ id: string }>(
        `SELECT t.id FROM trips t
         WHERE t.id = $1 AND (
           t.rider_id = $2
           OR EXISTS (SELECT 1 FROM bookings b WHERE b.trip_id = t.id AND b.passenger_id = $2)
         )`,
        [tripId, userId],
      );

      if (occupantRes.rows.length === 0) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Not an occupant of this trip', details: null },
        });
        return;
      }

      const result = await logSos(userId, tripId, lat, lng);

      // Return emergency contacts so client can open SMS deep link
      const contacts = await getEmergencyContacts(userId);

      logger.warn({ userId, tripId, sosId: result.sosId }, 'SOS triggered');

      res.status(201).json({
        success: true,
        data: { sos_id: result.sosId, emergency_contacts: contacts },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// Public live share page — no auth required
// GET /share/:token  (mounted at root in index.ts)
// ─────────────────────────────────────────────────────────────
export async function sharePageHandler(req: Request, res: Response): Promise<void> {
  const { token } = req.params;

  const tripRes = await query<{
    id: string;
    origin_label: string;
    dest_label: string;
    status: string;
  }>(
    `SELECT id, origin_label, dest_label, status FROM trips WHERE share_token = $1`,
    [token],
  );

  if (tripRes.rows.length === 0) {
    res.status(404).send('<h1>404 — Share link not found or expired</h1>');
    return;
  }

  const trip = tripRes.rows[0]!;
  const locations = await getLocations(trip.id);
  const riderLoc = locations[0] ?? null; // first location (likely rider)

  const mapTileUrl = 'https://tiles.openfreemap.org/styles/liberty';
  const serverOrigin = env.NODE_ENV === 'production'
    ? 'https://ridecolab.app'
    : `http://localhost:${env.PORT}`;

  // Serve minimal HTML page with MapLibre GL JS
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>RideColab Live — ${trip.origin_label} → ${trip.dest_label}</title>
  <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
  <link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet"/>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; background: #f3f4f6; }
    #header { background: #0F1B33; color: white; padding: 12px 16px; }
    #header h1 { font-size: 16px; font-weight: 600; }
    #header p { font-size: 13px; color: #9ca3af; margin-top: 2px; }
    #map { width: 100%; height: calc(100vh - 70px); }
    #status { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
      background: white; border-radius: 20px; padding: 8px 16px;
      font-size: 13px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
    .pin { width: 32px; height: 32px; background: #0E9384; border-radius: 50%;
      border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); }
  </style>
</head>
<body>
  <div id="header">
    <h1>🚗 RideColab Live Share</h1>
    <p>${trip.origin_label} → ${trip.dest_label}</p>
  </div>
  <div id="map"></div>
  <div id="status">📍 Waiting for location...</div>
  <script>
    const tripId = ${JSON.stringify(trip.id)};
    const serverOrigin = ${JSON.stringify(serverOrigin)};
    const initialLoc = ${riderLoc ? JSON.stringify({ lat: riderLoc.lat, lng: riderLoc.lng }) : 'null'};

    const map = new maplibregl.Map({
      container: 'map',
      style: '${mapTileUrl}',
      center: initialLoc ? [initialLoc.lng, initialLoc.lat] : [73.8567, 18.5204],
      zoom: 14
    });

    let marker = null;

    function updateMarker(lat, lng) {
      if (!marker) {
        const el = document.createElement('div');
        el.className = 'pin';
        marker = new maplibregl.Marker({ element: el })
          .setLngLat([lng, lat])
          .addTo(map);
      } else {
        marker.setLngLat([lng, lat]);
      }
      map.flyTo({ center: [lng, lat], zoom: 15 });
      document.getElementById('status').textContent = '📍 Live location updated just now';
    }

    if (initialLoc) updateMarker(initialLoc.lat, initialLoc.lng);

    // Poll REST API every 5s (no auth needed via share token — but we pass token via query)
    // We poll the /api/v1/live/:tripId endpoint — this page has no JWT
    // Instead: poll a special public endpoint
    async function poll() {
      try {
        const res = await fetch(serverOrigin + '/api/v1/share-live/' + tripId + '?token=${token}');
        if (!res.ok) return;
        const json = await res.json();
        if (json.success && json.data && json.data.length > 0) {
          const loc = json.data[0];
          updateMarker(loc.lat, loc.lng);
        }
      } catch {}
    }
    setInterval(poll, 5000);
  </script>
</body>
</html>`);
}

// ── GET /share-live/:trip_id?token=xxx  (public, share token) ─
// Used by the live share HTML page to poll location
router.get('/share-live/:trip_id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tripId = req.params['trip_id']!;
    const token = req.query['token'] as string | undefined;

    if (!token) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Token required', details: null } });
      return;
    }

    // Verify share token
    const tripRes = await query<{ id: string }>(
      `SELECT id FROM trips WHERE id = $1 AND share_token = $2`,
      [tripId, token],
    );

    if (tripRes.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Invalid share token', details: null } });
      return;
    }

    const locations = await getLocations(tripId);
    res.json({ success: true, data: locations });
  } catch (err) {
    next(err);
  }
});

export default router;

