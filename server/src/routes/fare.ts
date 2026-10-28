// ─────────────────────────────────────────────────────────────
// Fare routes
//   GET  /fare/estimate — live fare preview (requires JWT)
//   GET  /admin/fuel-prices — list fuel prices (admin)
//   PATCH /admin/fuel-prices/:id — update a price (admin)
// ─────────────────────────────────────────────────────────────
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '~/middleware/authenticate';
import { estimateByVehicle, getFuelPrices, updateFuelPrice } from '~/services/fare';

export const fareRouter = Router();
export const adminFuelRouter = Router();

// ── GET /fare/estimate ─────────────────────────────────────────
// Query params: vehicle_id, distance_m, seats
fareRouter.get('/estimate', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { vehicle_id, distance_m, seats } = req.query as Record<string, string>;

    if (!vehicle_id || !distance_m) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'vehicle_id and distance_m are required' },
      });
      return;
    }

    const dm = parseFloat(distance_m);
    const s = parseInt(seats ?? '1', 10);

    if (isNaN(dm) || dm <= 0) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'distance_m must be a positive number' },
      });
      return;
    }

    const estimate = await estimateByVehicle(vehicle_id, dm, s);
    res.json({ success: true, data: estimate });
  } catch (err) {
    next(err);
  }
});

// ── GET /admin/fuel-prices ─────────────────────────────────────
adminFuelRouter.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user?.role !== 'admin') {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin only' } });
      return;
    }
    const prices = await getFuelPrices();
    res.json({ success: true, data: prices });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /admin/fuel-prices/:id ──────────────────────────────
adminFuelRouter.patch('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user?.role !== 'admin') {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin only' } });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const price = Number(body['price_per_unit']);
    if (!body['price_per_unit'] || isNaN(price) || price <= 0) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'price_per_unit must be a positive number' },
      });
      return;
    }
    const updated = await updateFuelPrice(req.params['id'] as string, price);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});
