import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '~/middleware/authenticate';
import { query, withTransaction } from '~/db/pool';
import { logger } from '~/utils/logger';

const router = Router();

// Note: authenticate is applied per-route, not globally,
// so unknown paths fall through to the app-level 404 handler.

// ─── Schemas ─────────────────────────────────────────────────

const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional(),
  upi_id: z.string().max(100).optional().nullable(),
  language: z.enum(['en', 'hi', 'mr']).optional(),
});

const UpdateSettingsSchema = z.object({
  mode: z.enum(['rider', 'passenger']).optional(),
});

const EmergencyContactSchema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().min(10).max(15),
  relation: z.string().max(50).optional(),
});

const DeclarationSchema = z.object({
  has_valid_licence: z.boolean(),
  has_insurance: z.boolean(),
});

// ─────────────────────────────────────────────────────────────
// GET /users/me
// ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /users/me:
 *   get:
 *     summary: Get my profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 */
router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.email, u.name, u.gender, u.upi_id, u.language, u.mode, u.role,
              u.consent_given_at, u.weekly_trips_used, u.created_at,
              ts.score AS trust_score, ts.total_trips,
              ud.has_valid_licence, ud.has_insurance
       FROM users u
       LEFT JOIN trust_scores ts ON ts.user_id = u.id
       LEFT JOIN user_declarations ud ON ud.user_id = u.id
       WHERE u.id = $1 AND u.is_active = true AND u.is_anonymised = false`,
      [req.user!.sub],
    );
    if (!rows[0]) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
      return;
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH /users/me
// ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /users/me:
 *   patch:
 *     summary: Update my profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = UpdateProfileSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: body.error.flatten() } });
      return;
    }

    const fields = body.data;
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (fields.name !== undefined) { updates.push(`name = $${idx++}`); values.push(fields.name); }
    if (fields.gender !== undefined) { updates.push(`gender = $${idx++}`); values.push(fields.gender); }
    if (fields.upi_id !== undefined) { updates.push(`upi_id = $${idx++}`); values.push(fields.upi_id); }
    if (fields.language !== undefined) { updates.push(`language = $${idx++}`); values.push(fields.language); }

    if (updates.length === 0) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'No fields to update' } });
      return;
    }

    values.push(req.user!.sub);
    const { rows } = await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, email, name, gender, upi_id, language, mode`,
      values,
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /users/me  — DPDP anonymise
// ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /users/me:
 *   delete:
 *     summary: Delete/anonymise my account (DPDP Act 2023)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await withTransaction(async (client) => {
      const anon = `deleted_${req.user!.sub.slice(0, 8)}@deleted.invalid`;
      await client.query(
        `UPDATE users SET
           email = $1, name = 'Deleted User', password_hash = '', google_id = NULL,
           upi_id = NULL, gender = NULL, is_active = false, is_anonymised = true
         WHERE id = $2`,
        [anon, req.user!.sub],
      );
      await client.query('UPDATE refresh_tokens SET revoked = true WHERE user_id = $1', [req.user!.sub]);
      await client.query('DELETE FROM emergency_contacts WHERE user_id = $1', [req.user!.sub]);
    });
    logger.info({ userId: req.user!.sub }, 'User account anonymised (DPDP)');
    res.json({ success: true, data: { message: 'Account deleted' } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH /users/me/settings — mode switch
// ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /users/me/settings:
 *   patch:
 *     summary: Switch rider/passenger mode
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/me/settings', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = UpdateSettingsSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: body.error.flatten() } });
      return;
    }

    const { rows } = await query(
      'UPDATE users SET mode = $1 WHERE id = $2 RETURNING id, mode',
      [body.data.mode, req.user!.sub],
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// Emergency contacts
// ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /users/me/emergency-contacts:
 *   get:
 *     summary: List emergency contacts
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 */
router.get('/me/emergency-contacts', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await query(
      'SELECT id, name, phone, relation, created_at FROM emergency_contacts WHERE user_id = $1 ORDER BY created_at',
      [req.user!.sub],
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/me/emergency-contacts', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = EmergencyContactSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: body.error.flatten() } });
      return;
    }

    // Max 3 contacts
    const { rows: existing } = await query(
      'SELECT COUNT(*) AS count FROM emergency_contacts WHERE user_id = $1',
      [req.user!.sub],
    );
    if (Number(existing[0]?.count) >= 3) {
      res.status(400).json({ success: false, error: { code: 'LIMIT_EXCEEDED', message: 'Maximum 3 emergency contacts allowed' } });
      return;
    }

    const { rows } = await query(
      'INSERT INTO emergency_contacts (user_id, name, phone, relation) VALUES ($1, $2, $3, $4) RETURNING id, name, phone, relation',
      [req.user!.sub, body.data.name, body.data.phone, body.data.relation ?? null],
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/me/emergency-contacts/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rowCount } = await query(
      'DELETE FROM emergency_contacts WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.sub],
    );
    if (!rowCount) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Contact not found' } });
      return;
    }
    res.json({ success: true, data: { message: 'Contact deleted' } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// Declarations (licence + insurance self-declaration)
// ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /users/me/declarations:
 *   post:
 *     summary: Record licence + insurance self-declaration
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 */
router.post('/me/declarations', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = DeclarationSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: body.error.flatten() } });
      return;
    }

    const { rows } = await query(
      `INSERT INTO user_declarations (user_id, has_valid_licence, has_insurance)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET
         has_valid_licence = EXCLUDED.has_valid_licence,
         has_insurance = EXCLUDED.has_insurance,
         declared_at = NOW()
       RETURNING user_id, has_valid_licence, has_insurance, declared_at`,
      [req.user!.sub, body.data.has_valid_licence, body.data.has_insurance],
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

export default router;
