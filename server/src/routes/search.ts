/**
 * Phase 7 — Search routes
 * POST /api/v1/search/rides
 */
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '~/middleware/authenticate';
import { searchRides } from '~/services/matching';

const router = Router();

const SearchSchema = z.object({
  pickup_lat:     z.number().min(-90).max(90),
  pickup_lng:     z.number().min(-180).max(180),
  dropoff_lat:    z.number().min(-90).max(90),
  dropoff_lng:    z.number().min(-180).max(180),
  departure_time: z.string().datetime(),
  seats:          z.number().int().min(1).max(8).optional().default(1),
  radius_m:       z.number().min(100).max(5000).optional().default(500),
  women_only:     z.boolean().optional().default(false),
  community_id:   z.string().uuid().nullable().optional().default(null),
  vehicle_type:   z.string().nullable().optional().default(null),
});

router.post(
  '/rides',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = SearchSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid search parameters', details: parsed.error.flatten() },
        });
        return;
      }

      const p = parsed.data;
      const matches = await searchRides({
        pickup_lat:     p.pickup_lat,
        pickup_lng:     p.pickup_lng,
        dropoff_lat:    p.dropoff_lat,
        dropoff_lng:    p.dropoff_lng,
        departure_time: new Date(p.departure_time),
        seats:          p.seats,
        radius_m:       p.radius_m,
        women_only:     p.women_only,
        community_id:   p.community_id,
        vehicle_type:   p.vehicle_type,
        passenger_gender: (req.user as { gender?: string })?.gender ?? null,
      });

      res.json({ success: true, data: matches, meta: { total: matches.length } });
    } catch (err) {
      next(err);
    }
  },
);

export default router;

