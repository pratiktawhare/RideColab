import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { geocodeSearch, getAllLandmarks } from '~/services/geocoding';
import { authenticate } from '~/middleware/authenticate';

const router = Router();

/**
 * @openapi
 * /geocoding/landmarks:
 *   get:
 *     summary: Get all Pune landmark quick-picks (no auth)
 *     tags: [Geocoding]
 *     responses:
 *       200:
 *         description: List of landmarks
 */
router.get('/landmarks', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const landmarks = await getAllLandmarks();
    res.json({ success: true, data: landmarks });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /geocoding/search:
 *   get:
 *     summary: Search places — landmarks first, ORS fallback
 *     tags: [Geocoding]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 2
 *     responses:
 *       200:
 *         description: Array of place results
 *       400:
 *         description: Missing or too-short query
 */
router.get(
  '/search',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({ q: z.string().min(2, 'Query must be at least 2 characters') });
      const parsed = schema.safeParse(req.query);

      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.errors[0]?.message ?? 'Invalid query',
            details: parsed.error.flatten().fieldErrors,
          },
        });
        return;
      }

      const results = await geocodeSearch(parsed.data.q);
      res.json({ success: true, data: results });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
