// ─────────────────────────────────────────────────────────────
// Trust routes
//   POST   /reports              — file a report (JWT)
//   POST   /users/:id/block      — block a user (JWT)
//   DELETE /users/:id/block      — unblock a user (JWT)
// ─────────────────────────────────────────────────────────────
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '~/middleware/authenticate';
import { blockUser, unblockUser, fileReport, VALID_REASONS } from '~/services/trust';

const router = Router();

// ── POST /reports ─────────────────────────────────────────────
const reportSchema = z.object({
  reported_id: z.string().uuid(),
  booking_id:  z.string().uuid().optional(),
  reason:      z.enum(VALID_REASONS as [string, ...string[]]),
  details:     z.string().max(1000).optional(),
});

router.post('/reports', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = reportSchema.parse(req.body);
    const report = await fileReport(req.user!.sub, body);
    res.status(201).json({ success: true, data: report });
  } catch (err) {
    next(err);
  }
});

// ── POST /users/:id/block ─────────────────────────────────────
router.post('/users/:id/block', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const targetId = req.params.id as string;
    await blockUser(req.user!.sub, targetId);
    res.json({ success: true, data: { blocked: true } });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /users/:id/block ───────────────────────────────────
router.delete('/users/:id/block', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const targetId = req.params.id as string;
    await unblockUser(req.user!.sub, targetId);
    res.json({ success: true, data: { blocked: false } });
  } catch (err) {
    next(err);
  }
});

export default router;
