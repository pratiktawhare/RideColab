import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import passport from 'passport';
import cron from 'node-cron';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import jwt from 'jsonwebtoken';

import { APP_NAME, env, allowedOrigins, isDev } from '~/config/app';
import { logger } from '~/utils/logger';
import { errorHandler } from '~/middleware/errorHandler';
import healthRouter from '~/routes/health';
import authRouter from '~/routes/auth';
import usersRouter from '~/routes/users';
import catalogRouter, { myVehiclesRouter } from '~/routes/catalog';
import geocodingRouter from '~/routes/geocoding';
import tripsRouter from '~/routes/trips';
import { fareRouter, adminFuelRouter } from '~/routes/fare';
import searchRouter from '~/routes/search';
import bookingsRouter from '~/routes/bookings';
import liveRouter, { sharePageHandler } from '~/routes/live';
import { resetWeeklyCounters, materialiseRecurringTrips } from '~/services/trips';
import { query } from '~/db/pool';
import {
  updateLocation,
  detectDeviation,
  shouldAlertDeviation,
  clearDeviationTracker,
  detectLongStop,
  clearLongStopTracker,
  flushLocationsToDB,
} from '~/services/live';

const app = express();
const httpServer = createServer(app);

// ─── Socket.io setup ─────────────────────────────────────────
export const io = new SocketIOServer(httpServer, {
  cors: {
    origin: isDev ? '*' : allowedOrigins,
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
});

// ─── Security middleware ──────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, mobile apps, Postman)
      if (!origin) return callback(null, true);
      if (isDev) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  }),
);

// ─── Global rate limiter ──────────────────────────────────────
app.use(
  rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests, please slow down.', details: null },
    },
  }),
);

// ─── Body parsing ─────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Request logging ──────────────────────────────────────────
app.use(pinoHttp({ logger }));

// ─── Passport (stateless — no sessions) ──────────────────────
app.use(passport.initialize());

// ─── Swagger API docs ─────────────────────────────────────────
const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: `${APP_NAME} API`,
      version: env.APP_VERSION,
      description: 'RideColab — peer-to-peer cost-sharing ride pooling API for Pune, India.',
    },
    servers: [{ url: '/api/v1', description: 'Current server' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: ['./src/routes/*.ts'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ─── Routes ───────────────────────────────────────────────────
app.use('/api/v1', healthRouter);
app.use('/api/v1/auth', authRouter);
// catalog has no auth — must be before usersRouter
app.use('/api/v1/catalog', catalogRouter);
app.use('/api/v1/users/me/vehicles', myVehiclesRouter);
app.use('/api/v1/users', usersRouter);
app.use('/api/v1/geocoding', geocodingRouter);
app.use('/api/v1/trips', tripsRouter);
app.use('/api/v1/fare', fareRouter);
app.use('/api/v1/admin/fuel-prices', adminFuelRouter);
app.use('/api/v1/search', searchRouter);
app.use('/api/v1/bookings', bookingsRouter);
app.use('/api/v1', liveRouter);

// ─── Public live share page (no /api/v1 prefix) ──────────────
app.get('/share/:token', sharePageHandler);

// ─── 404 handler ─────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'The requested resource was not found.', details: null },
  });
});

// ─── Global error handler ────────────────────────────────────
app.use(errorHandler);

// ─── Socket.io — Live Location Handler ───────────────────────
interface JwtPayload {
  sub: string;
  iat?: number;
  exp?: number;
}

// Track which userId is in which socket
const socketUserMap = new Map<string, string>(); // socketId → userId
// Track active trip flush intervals
const tripFlushIntervals = new Map<string, ReturnType<typeof setInterval>>();

io.on('connection', (socket) => {
  logger.info({ socketId: socket.id }, 'Socket connected');

  // ── join_trip: authenticate + join room ─────────────────────
  socket.on('join_trip', ({ tripId, token }: { tripId: string; token: string }) => {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      const userId = payload.sub;
      socketUserMap.set(socket.id, userId);

      const room = `trip:${tripId}`;
      void socket.join(room);
      logger.info({ socketId: socket.id, userId, tripId }, 'Socket joined trip room');

      // Start DB flush interval for this trip if not already running
      if (!tripFlushIntervals.has(tripId)) {
        const interval = setInterval(() => {
          flushLocationsToDB(tripId).catch((err) =>
            logger.error({ err, tripId }, 'Flush interval error'),
          );
        }, 30_000);
        tripFlushIntervals.set(tripId, interval);
      }

      socket.emit('join_trip_ack', { success: true, tripId });
    } catch {
      socket.emit('join_trip_ack', { success: false, error: 'AUTH_INVALID_TOKEN' });
    }
  });

  // ── location_update: store + broadcast ──────────────────────
  socket.on(
    'location_update',
    async ({
      tripId,
      lat,
      lng,
      bearing,
      speed,
    }: {
      tripId: string;
      lat: number;
      lng: number;
      bearing?: number;
      speed?: number;
    }) => {
      const userId = socketUserMap.get(socket.id);
      if (!userId) return;

      try {
        await updateLocation(tripId, userId, lat, lng, bearing, speed);

        // Broadcast to all other occupants in the room
        socket.to(`trip:${tripId}`).emit('location_update', {
          userId,
          lat,
          lng,
          bearing,
          speed,
          ts: Date.now(),
        });

        // ── Deviation check (>300m off-route continuously for >120s) ──
        // Only the rider's phone drives the trip route; passenger phone is not navigating
        const tripRes = await query<{ rider_id: string }>(
          `SELECT rider_id FROM trips WHERE id = $1`,
          [tripId],
        );
        const isTripRider = tripRes.rows[0]?.rider_id === userId;

        if (isTripRider) {
          const deviationM = await detectDeviation(tripId, lat, lng);
          if (shouldAlertDeviation(tripId, deviationM)) {
            io.to(`trip:${tripId}`).emit('deviation_alert', {
              userId,
              deviationM,
              lat,
              lng,
              ts: Date.now(),
            });
          }
        }

        // ── Long stop check ──────────────────────────────────
        if (detectLongStop(tripId, userId, lat, lng)) {
          io.to(`trip:${tripId}`).emit('long_stop_alert', { userId, lat, lng, ts: Date.now() });
        }
      } catch (err) {
        logger.error({ err, tripId, userId }, 'Error handling location_update');
      }
    },
  );

  // ── leave_trip: cleanup ──────────────────────────────────────
  socket.on('leave_trip', ({ tripId }: { tripId: string }) => {
    const userId = socketUserMap.get(socket.id);
    void socket.leave(`trip:${tripId}`);
    if (userId) {
      clearLongStopTracker(tripId, userId);
      clearDeviationTracker(tripId);
    }
    logger.info({ socketId: socket.id, tripId }, 'Socket left trip room');
  });

  // ── disconnect ───────────────────────────────────────────────
  socket.on('disconnect', () => {
    socketUserMap.delete(socket.id);
    logger.info({ socketId: socket.id }, 'Socket disconnected');
  });
});

// ─── Start server (skip in test to avoid EADDRINUSE) ─────────
if (env.NODE_ENV !== 'test') {
  const PORT = env.PORT;
  httpServer.listen(PORT, () => {
    logger.info(`🚀 ${APP_NAME} server running on port ${PORT} [${env.NODE_ENV}]`);
    logger.info(`📖 API docs: http://localhost:${PORT}/api/v1/docs`);
    logger.info(`🔌 Socket.io: ws://localhost:${PORT}`);
  });

  // ─── Cron jobs ─────────────────────────────────────────────
  // Reset weekly trip counters every Monday at 00:01
  cron.schedule('1 0 * * 1', async () => {
    logger.info('cron: resetting weekly trip counters');
    await resetWeeklyCounters();
  });

  // Materialise recurring trips daily at 01:00
  cron.schedule('0 1 * * *', async () => {
    logger.info('cron: materialising recurring trips');
    await materialiseRecurringTrips(7);
  });
}

export default app;
