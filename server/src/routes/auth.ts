import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import passport from 'passport';
import { Strategy as GoogleStrategy, Profile } from 'passport-google-oauth20';
import {
  registerUser,
  loginUser,
  refreshTokens,
  logoutUser,
  upsertGoogleUser,
} from '~/services/auth';
import { authenticate } from '~/middleware/authenticate';
import { env } from '~/config/app';
import { logger } from '~/utils/logger';

const router = Router();

// ─── Zod schemas ─────────────────────────────────────────────

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1).max(100),
  language: z.enum(['en', 'hi', 'mr']).optional(),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const RefreshSchema = z.object({
  refresh_token: z.string().min(1),
});

// ─── Google Strategy ─────────────────────────────────────────

passport.use(
  new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID!,
      clientSecret: env.GOOGLE_CLIENT_SECRET!,
      callbackURL: `http://localhost:${env.PORT}/auth/google/callback`,
    },
    async (_accessToken, _refreshToken, profile: Profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        const name = profile.displayName ?? profile.emails?.[0]?.value ?? 'Google User';
        if (!email) return done(new Error('No email from Google'), false);

        const result = await upsertGoogleUser({ googleId: profile.id, email, name });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        done(null, result as any);
      } catch (err) {
        done(err as Error, false);
      }
    },
  ),
);

// ─────────────────────────────────────────────────────────────
// POST /auth/register
// ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Create a new account
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, name]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               name: { type: string }
 *               language: { type: string, enum: [en, hi, mr] }
 *     responses:
 *       201:
 *         description: Account created
 *       409:
 *         description: Email already registered
 */
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = RegisterSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: body.error.flatten() } });
      return;
    }

    const result = await registerUser(body.data);
    res.status(201).json({
      success: true,
      data: {
        user: result.user,
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
      },
    });
  } catch (err: unknown) {
    const e = err as { code?: string; status?: number; message?: string };
    if (e.code === 'AUTH_EMAIL_EXISTS') {
      res.status(409).json({ success: false, error: { code: e.code, message: e.message } });
      return;
    }
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// POST /auth/login
// ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = LoginSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: body.error.flatten() } });
      return;
    }

    const result = await loginUser(body.data.email, body.data.password);
    res.json({
      success: true,
      data: {
        user: result.user,
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
      },
    });
  } catch (err: unknown) {
    const e = err as { code?: string; status?: number };
    if (e.code === 'AUTH_INVALID') {
      res.status(401).json({ success: false, error: { code: 'AUTH_INVALID', message: 'Invalid email or password' } });
      return;
    }
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// POST /auth/refresh
// ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Rotate refresh token
 *     tags: [Auth]
 */
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = RefreshSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'refresh_token required' } });
      return;
    }

    const tokens = await refreshTokens(body.data.refresh_token);
    res.json({ success: true, data: { access_token: tokens.accessToken, refresh_token: tokens.refreshToken } });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === 'AUTH_INVALID_TOKEN') {
      res.status(401).json({ success: false, error: { code: 'AUTH_INVALID_TOKEN', message: 'Invalid or expired refresh token' } });
      return;
    }
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// POST /auth/logout
// ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout (revoke refresh token)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 */
router.post('/logout', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const refreshToken = req.body?.refresh_token as string | undefined;
    await logoutUser(req.user!.sub, refreshToken);
    res.json({ success: true, data: { message: 'Logged out' } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// POST /auth/consent
// ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /auth/consent:
 *   post:
 *     summary: Record user consent (required before any action)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 */
router.post('/consent', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { query: dbQuery } = await import('~/db/pool');
    await dbQuery(
      'UPDATE users SET consent_given_at = NOW() WHERE id = $1 AND consent_given_at IS NULL',
      [req.user!.sub],
    );
    res.json({ success: true, data: { message: 'Consent recorded' } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// GET /auth/google  — initiate Google OAuth
// ─────────────────────────────────────────────────────────────

router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false }),
);

// ─────────────────────────────────────────────────────────────
// GET /auth/google/callback
// ─────────────────────────────────────────────────────────────

router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/auth/google/error' }),
  (req: Request, res: Response) => {
    const result = (req.user as unknown) as { accessToken: string; refreshToken: string };
    // In production: redirect to app deep link or admin URL with token
    // For now: return JSON (client picks it up via in-app browser)
    res.json({
      success: true,
      data: {
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
      },
    });
  },
);

router.get('/google/error', (_req, res) => {
  res.status(401).json({ success: false, error: { code: 'GOOGLE_AUTH_FAILED', message: 'Google authentication failed' } });
});

export default router;
