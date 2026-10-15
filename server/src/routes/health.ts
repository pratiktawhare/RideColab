import { Router, Request, Response } from 'express';
import { APP_NAME, env } from '~/config/app';

const router = Router();

// Track server start time for cold-start measurement
const serverStartTime = Date.now();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Server liveness probe
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Server is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                     app:
 *                       type: string
 *                     version:
 *                       type: string
 *                     ts:
 *                       type: string
 *                     uptime_s:
 *                       type: number
 *                     cold_start_ms:
 *                       type: number
 */
router.get('/health', (_req: Request, res: Response) => {
  const now = Date.now();
  res.json({
    success: true,
    data: {
      status: 'ok',
      app: APP_NAME,
      version: env.APP_VERSION,
      ts: new Date().toISOString(),
      uptime_s: Math.floor(process.uptime()),
      cold_start_ms: now - serverStartTime,
    },
  });
});

/**
 * @swagger
 * /version:
 *   get:
 *     summary: Latest app version info
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Version information
 */
router.get('/version', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      version: env.APP_VERSION,
      minClientVersion: '1.0.0',
      apkUrl: null, // Filled in Phase 15 after EAS build
    },
  });
});

export default router;
