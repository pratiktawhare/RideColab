// ─────────────────────────────────────────────────────────────
// Ratings routes
//   POST /bookings/:id/rate         — submit rating (JWT)
//   GET  /users/:id/ratings         — paginated ratings (JWT)
//   GET  /users/:id/trust           — trust score + badge (JWT)
// ─────────────────────────────────────────────────────────────
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '~/middleware/authenticate';
import { submitRating, getRatings, getTrustScore, VALID_TAGS } from '~/services/ratings';

const router = Router();

// ── POST /bookings/:id/rate ───────────────────────────────────
const rateSchema = z.object({
  rating:  z.number().int().min(1).max(5),
  tags:    z.array(z.string()).default([]),
  comment: z.string().max(500).optional(),
});

router.post('/bookings/:id/rate', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = rateSchema.parse(req.body);
    const bookingId = req.params.id as string;
    const review = await submitRating(bookingId, req.user!.sub, body);
    res.status(201).json({ success: true, data: review });
  } catch (err) {
    next(err);
  }
});

// ── GET /users/:id/ratings ────────────────────────────────────
router.get('/users/:id/ratings', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const userId = req.params.id as string;
    const result = await getRatings(userId, page);
    res.json({ success: true, data: result, meta: { page: result.page, total: result.total } });
  } catch (err) {
    next(err);
  }
});

// ── GET /users/:id/trust ──────────────────────────────────────
router.get('/users/:id/trust', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.params.id as string;
    const trust = await getTrustScore(userId);
    res.json({ success: true, data: trust });
  } catch (err) {
    next(err);
  }
});

// ── GET /ratings/tags — available tags ────────────────────────
router.get('/ratings/tags', authenticate, (_req: Request, res: Response) => {
  res.json({ success: true, data: VALID_TAGS });
});

export default router;
