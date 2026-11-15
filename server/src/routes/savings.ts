// ─────────────────────────────────────────────────────────────
// Savings routes
//   GET /users/me/savings  — my savings summary (JWT)
// ─────────────────────────────────────────────────────────────
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '~/middleware/authenticate';
import { getSavings } from '~/services/savings';

const router = Router();

// GET /users/me/savings
router.get('/users/me/savings', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const summary = await getSavings(req.user!.sub);
    res.json({ success: true, data: summary });
  } catch (err) {
    next(err);
  }
});

export default router;
