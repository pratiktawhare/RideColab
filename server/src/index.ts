import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import passport from 'passport';
import cron from 'node-cron';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

import { APP_NAME, env, allowedOrigins, isDev } from '~/config/app';
import { logger } from '~/utils/logger';
import { errorHandler } from '~/middleware/errorHandler';
import healthRouter from '~/routes/health';
import authRouter from '~/routes/auth';
import usersRouter from '~/routes/users';
import catalogRouter, { myVehiclesRouter } from '~/routes/catalog';
import geocodingRouter from '~/routes/geocoding';
import tripsRouter from '~/routes/trips';
import { resetWeeklyCounters, materialiseRecurringTrips } from '~/services/trips';

const app = express();

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

// ─── 404 handler ─────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'The requested resource was not found.', details: null },
  });
});

// ─── Global error handler ────────────────────────────────────
app.use(errorHandler);

// ─── Start server (skip in test to avoid EADDRINUSE) ─────────
if (env.NODE_ENV !== 'test') {
  const PORT = env.PORT;
  app.listen(PORT, () => {
    logger.info(`🚀 ${APP_NAME} server running on port ${PORT} [${env.NODE_ENV}]`);
    logger.info(`📖 API docs: http://localhost:${PORT}/api/v1/docs`);
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
