import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '~/middleware/authenticate';
import { query } from '~/db/pool';

const router = Router();

// ─────────────────────────────────────────────────────────────
// GET /catalog/vehicles — browse vehicle catalog (no auth)
// ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /catalog/vehicles:
 *   get:
 *     summary: Browse vehicle catalog
 *     tags: [Catalog]
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [car, bike, auto, ev]
 *       - in: query
 *         name: make
 *         schema:
 *           type: string
 *       - in: query
 *         name: fuel_type
 *         schema:
 *           type: string
 */
router.get('/vehicles', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type, make, fuel_type } = req.query;
    const conditions: string[] = ['is_active = true'];
    const values: unknown[] = [];
    let idx = 1;

    if (type) { conditions.push(`type = $${idx++}`); values.push(type); }
    if (make) { conditions.push(`LOWER(make) = LOWER($${idx++})`); values.push(make); }
    if (fuel_type) { conditions.push(`fuel_type = $${idx++}`); values.push(fuel_type); }

    const { rows } = await query(
      `SELECT id, type, make, model, variant, fuel_type, claimed_kmpl, kwh_per_100km, seats
       FROM vehicle_catalog
       WHERE ${conditions.join(' AND ')}
       ORDER BY type, make, model, variant`,
      values,
    );
    res.json({ success: true, data: rows, meta: { total: rows.length } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// GET /catalog/vehicles/:id
// ─────────────────────────────────────────────────────────────

router.get('/vehicles/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await query(
      `SELECT id, type, make, model, variant, fuel_type, claimed_kmpl, kwh_per_100km, seats, source
       FROM vehicle_catalog WHERE id = $1 AND is_active = true`,
      [req.params.id],
    );
    if (!rows[0]) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Vehicle not found in catalog' } });
      return;
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// GET /users/me/vehicles (requires auth — mounted separately)
// ─────────────────────────────────────────────────────────────

export const myVehiclesRouter = Router();
myVehiclesRouter.use(authenticate);

myVehiclesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await query(
      `SELECT v.id, v.plate_number, v.is_active, v.created_at,
              vc.type, vc.make, vc.model, vc.variant, vc.fuel_type, vc.claimed_kmpl, vc.kwh_per_100km, vc.seats
       FROM vehicles v
       JOIN vehicle_catalog vc ON vc.id = v.catalog_id
       WHERE v.user_id = $1 AND v.is_active = true
       ORDER BY v.created_at DESC`,
      [req.user!.sub],
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

myVehiclesRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { catalog_id, plate_number } = req.body as { catalog_id?: string; plate_number?: string };
    if (!catalog_id || !plate_number) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'catalog_id and plate_number required' } });
      return;
    }

    // Verify catalog entry exists
    const { rows: catRows } = await query('SELECT id FROM vehicle_catalog WHERE id = $1 AND is_active = true', [catalog_id]);
    if (!catRows[0]) {
      res.status(400).json({ success: false, error: { code: 'NOT_FOUND', message: 'Vehicle not found in catalog' } });
      return;
    }

    const { rows } = await query(
      'INSERT INTO vehicles (user_id, catalog_id, plate_number) VALUES ($1, $2, $3) RETURNING id, plate_number, created_at',
      [req.user!.sub, catalog_id, plate_number.toUpperCase()],
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

myVehiclesRouter.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { plate_number } = req.body as { plate_number?: string };
    if (!plate_number || plate_number.trim().length < 4) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'plate_number is required (min 4 chars)' } });
      return;
    }
    const { rows, rowCount } = await query(
      `UPDATE vehicles SET plate_number = $1
       WHERE id = $2 AND user_id = $3 AND is_active = true
       RETURNING id, plate_number`,
      [plate_number.trim().toUpperCase(), req.params.id, req.user!.sub],
    );
    if (!rowCount) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Vehicle not found' } });
      return;
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

myVehiclesRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rowCount } = await query(
      'UPDATE vehicles SET is_active = false WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.sub],
    );
    if (!rowCount) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Vehicle not found' } });
      return;
    }
    res.json({ success: true, data: { message: 'Vehicle removed' } });
  } catch (err) {
    next(err);
  }
});

export default router;
