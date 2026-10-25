import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '~/middleware/authenticate';
import { query, withTransaction } from '~/db/pool';
import { getRoute } from '~/services/routing';
import { calculateFareCap, checkWeeklyLimit, incrementWeeklyTrips } from '~/services/trips';
import { logger } from '~/utils/logger';

const router = Router();

// ── Validation schemas ─────────────────────────────────────────
const CreateTripSchema = z.object({
  origin_label:  z.string().min(1),
  origin_lat:    z.number().min(-90).max(90),
  origin_lng:    z.number().min(-180).max(180),
  dest_label:    z.string().min(1),
  dest_lat:      z.number().min(-90).max(90),
  dest_lng:      z.number().min(-180).max(180),
  depart_at:     z.string().datetime({ offset: true }).or(z.string().min(1)), // ISO string
  seats_total:   z.number().int().min(1).max(6),
  fare_set:      z.number().min(0),
  vehicle_id:    z.string().uuid(),
  community_id:  z.string().uuid().optional(),
  is_recurring:  z.boolean().default(false),
  rrule:         z.string().optional(),
  notes:         z.string().max(500).optional(),
});

const UpdateTripSchema = z.object({
  depart_at:    z.string().optional(),
  seats_total:  z.number().int().min(1).max(6).optional(),
  fare_set:     z.number().min(0).optional(),
  notes:        z.string().max(500).optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'At least one field required' });

// ── Helper: fetch trip with auth check ────────────────────────
async function fetchTripForRider(tripId: string, riderId: string) {
  const res = await query<{
    id: string;
    rider_id: string;
    status: string;
    vehicle_id: string;
    origin_lat: number;
    origin_lng: number;
    dest_lat: number;
    dest_lng: number;
    distance_m: number;
    seats_total: number;
    fare_set: number;
    fare_cap: number;
  }>(
    `SELECT * FROM trips WHERE id = $1`,
    [tripId],
  );

  if (res.rows.length === 0) return null;
  const trip = res.rows[0]!;
  if (trip.rider_id !== riderId) return null;
  return trip;
}

/**
 * @openapi
 * /trips:
 *   post:
 *     summary: Post a new trip
 *     tags: [Trips]
 *     security:
 *       - bearerAuth: []
 */
router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = CreateTripSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid trip data',
          details: parsed.error.flatten().fieldErrors,
        },
      });
      return;
    }

    const riderId = req.user!.sub;
    const data = parsed.data;

    // 1. Check weekly limit (also resets counter if cron missed)
    try {
      await checkWeeklyLimit(riderId);
    } catch (err) {
      if ((err as Error).name === 'WEEKLY_LIMIT_EXCEEDED') {
        res.status(403).json({
          success: false,
          error: {
            code: 'WEEKLY_LIMIT_EXCEEDED',
            message: 'You have reached the maximum number of trips for this week (14). Resets every Monday.',
          },
        });
        return;
      }
      throw err;
    }

    // 2. Verify vehicle belongs to rider
    const vehicleCheck = await query(
      `SELECT id FROM vehicles WHERE id = $1 AND user_id = $2 AND is_active = true`,
      [data.vehicle_id, riderId],
    );
    if (vehicleCheck.rows.length === 0) {
      res.status(400).json({
        success: false,
        error: { code: 'VEHICLE_NOT_FOUND', message: 'Vehicle not found or does not belong to you' },
      });
      return;
    }

    // 3. Get route (cache-first)
    const route = await getRoute(data.origin_lat, data.origin_lng, data.dest_lat, data.dest_lng);
    if (!route) {
      res.status(422).json({
        success: false,
        error: { code: 'ROUTE_UNAVAILABLE', message: 'Could not compute route. ORS key may be missing or invalid.' },
      });
      return;
    }

    // 4. Calculate fare cap — THE MONEY RULE
    const fareData = await calculateFareCap(data.vehicle_id, route.distance_m, data.seats_total);

    if (data.fare_set > fareData.cap) {
      res.status(422).json({
        success: false,
        error: {
          code: 'FARE_CAP_EXCEEDED',
          message: `fare_set (₹${data.fare_set}) exceeds the calculated cap (₹${fareData.cap.toFixed(2)}). Riders cannot charge more than real trip cost.`,
          details: {
            fare_set: data.fare_set,
            fare_cap: fareData.cap,
            distance_km: (route.distance_m / 1000).toFixed(1),
          },
        },
      });
      return;
    }

    // 5. Create trip + increment counter in a transaction
    const tripId = await withTransaction(async (client) => {
      const insertRes = await client.query<{ id: string }>(
        `INSERT INTO trips (
          rider_id, vehicle_id,
          origin_label, origin_lat, origin_lng,
          dest_label, dest_lat, dest_lng,
          route, distance_m, duration_s,
          depart_at, seats_total, seats_available,
          fare_set, fare_cap, status,
          community_id, is_recurring, rrule, notes
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,
          ST_GeogFromText($9),$10,$11,
          $12,$13,$13,$14,$15,'open',
          $16,$17,$18,$19
        ) RETURNING id`,
        [
          riderId,
          data.vehicle_id,
          data.origin_label,
          data.origin_lat,
          data.origin_lng,
          data.dest_label,
          data.dest_lat,
          data.dest_lng,
          route.route_wkt,
          route.distance_m,
          route.duration_s,
          data.depart_at,
          data.seats_total,
          data.fare_set,
          fareData.cap,
          data.community_id ?? null,
          data.is_recurring,
          data.rrule ?? null,
          data.notes ?? null,
        ],
      );

      await incrementWeeklyTrips(riderId, client);
      return insertRes.rows[0]!.id;
    });

    logger.info({ tripId, riderId, fare_set: data.fare_set, fare_cap: fareData.cap }, 'trip created');

    const tripRes = await query(`SELECT * FROM trips WHERE id = $1`, [tripId]);

    res.status(201).json({
      success: true,
      data: {
        ...tripRes.rows[0],
        fare_estimate: fareData,
        route_source: route.source,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /trips/mine:
 *   get:
 *     summary: Get the authenticated rider's trips
 *     tags: [Trips]
 *     security:
 *       - bearerAuth: []
 */
router.get('/mine', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const riderId = req.user!.sub;
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
    const limit = 20;
    const offset = (page - 1) * limit;

    const trips = await query(
      `SELECT t.*,
              vc.make || ' ' || vc.model AS vehicle_name,
              (SELECT COUNT(*) FROM bookings b WHERE b.trip_id = t.id AND b.status != 'cancelled') AS bookings_count
       FROM trips t
       LEFT JOIN vehicles v  ON v.id = t.vehicle_id
       LEFT JOIN vehicle_catalog vc ON vc.id = v.catalog_id
       WHERE t.rider_id = $1
       ORDER BY t.depart_at DESC
       LIMIT $2 OFFSET $3`,
      [riderId, limit, offset],
    );

    const total = await query<{ count: string }>(
      `SELECT COUNT(*) FROM trips WHERE rider_id = $1`,
      [riderId],
    );

    res.json({
      success: true,
      data: trips.rows,
      meta: { page, limit, total: parseInt(total.rows[0]!.count, 10) },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /trips/{id}:
 *   get:
 *     summary: Get a trip by ID
 *     tags: [Trips]
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const res2 = await query(
      `SELECT t.*,
              vc.make || ' ' || vc.model AS vehicle_name,
              vc.type AS vehicle_type,
              vc.fuel_type,
              u.name AS rider_name,
              u.gender AS rider_gender,
              (SELECT COUNT(*) FROM bookings b WHERE b.trip_id = t.id AND b.status != 'cancelled') AS bookings_count
       FROM trips t
       LEFT JOIN vehicles v  ON v.id = t.vehicle_id
       LEFT JOIN vehicle_catalog vc ON vc.id = v.catalog_id
       LEFT JOIN users u ON u.id = t.rider_id
       WHERE t.id = $1`,
      [req.params.id],
    );

    if (res2.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Trip not found' },
      });
      return;
    }

    res.json({ success: true, data: res2.rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /trips/{id}:
 *   patch:
 *     summary: Update a trip (only while status=open)
 *     tags: [Trips]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const riderId = req.user!.sub;
    const trip = await fetchTripForRider(req.params['id'] ?? '', riderId);

    if (!trip) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Trip not found' } });
      return;
    }

    if (trip.status !== 'open') {
      res.status(409).json({
        success: false,
        error: { code: 'TRIP_NOT_EDITABLE', message: `Trip cannot be edited in status: ${trip.status}` },
      });
      return;
    }

    const parsed = UpdateTripSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid update data',
          details: parsed.error.flatten().fieldErrors,
        },
      });
      return;
    }

    const updates = parsed.data;

    // Re-verify fare cap if fare_set or seats_total changes
    const newFareSet = updates.fare_set ?? Number(trip.fare_set);
    const newSeats   = updates.seats_total ?? Number(trip.seats_total);

    if (updates.fare_set !== undefined || updates.seats_total !== undefined) {
      const fareData = await calculateFareCap(trip.vehicle_id, Number(trip.distance_m), newSeats);
      if (newFareSet > fareData.cap) {
        res.status(422).json({
          success: false,
          error: {
            code: 'FARE_CAP_EXCEEDED',
            message: `fare_set (₹${newFareSet}) exceeds fare cap (₹${fareData.cap.toFixed(2)})`,
          },
        });
        return;
      }
    }

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (updates.depart_at !== undefined) {
      setClauses.push(`depart_at = $${idx++}`);
      params.push(updates.depart_at);
    }
    if (updates.seats_total !== undefined) {
      setClauses.push(`seats_total = $${idx++}`);
      params.push(updates.seats_total);
    }
    if (updates.fare_set !== undefined) {
      setClauses.push(`fare_set = $${idx++}`);
      params.push(updates.fare_set);
    }
    if (updates.notes !== undefined) {
      setClauses.push(`notes = $${idx++}`);
      params.push(updates.notes);
    }

    params.push(req.params['id'] ?? '');
    const updatedRes = await query(
      `UPDATE trips SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      params,
    );

    res.json({ success: true, data: updatedRes.rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /trips/{id}:
 *   delete:
 *     summary: Cancel a trip
 *     tags: [Trips]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const riderId = req.user!.sub;
    const trip = await fetchTripForRider(req.params['id'] ?? '', riderId);

    if (!trip) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Trip not found' } });
      return;
    }

    if (!['open', 'full'].includes(trip.status)) {
      res.status(409).json({
        success: false,
        error: { code: 'TRIP_NOT_CANCELLABLE', message: `Cannot cancel a trip with status: ${trip.status}` },
      });
      return;
    }

    await query(`UPDATE trips SET status = 'cancelled' WHERE id = $1`, [req.params['id'] ?? '']);
    res.json({ success: true, data: { message: 'Trip cancelled successfully' } });
  } catch (err) {
    next(err);
  }
});

export default router;
