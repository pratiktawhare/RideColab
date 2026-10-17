import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '~/config/app';
import { logger } from '~/utils/logger';
import type { JwtPayload } from '~/types/express.d';

// ─────────────────────────────────────────────────────────────
// authenticate — required JWT middleware
// ─────────────────────────────────────────────────────────────
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: { code: 'AUTH_MISSING_TOKEN', message: 'Authorization header required' },
    });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = payload;
    next();
  } catch (err) {
    logger.debug({ err }, 'JWT verification failed');
    res.status(401).json({
      success: false,
      error: { code: 'AUTH_INVALID_TOKEN', message: 'Invalid or expired token' },
    });
  }
}

// ─────────────────────────────────────────────────────────────
// requireAdmin — must come after authenticate
// ─────────────────────────────────────────────────────────────
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') {
    res.status(403).json({
      success: false,
      error: { code: 'AUTH_FORBIDDEN', message: 'Admin access required' },
    });
    return;
  }
  next();
}

export type { JwtPayload };
