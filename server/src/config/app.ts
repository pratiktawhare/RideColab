import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

// ─────────────────────────────────────────────────────────────
// App identity
// ─────────────────────────────────────────────────────────────
export const APP_NAME = 'RideColab';
export const APP_TAGLINE = 'Share the road. Split the cost. Nobody profits.';

// ─────────────────────────────────────────────────────────────
// Environment schema — fails fast if any required var is missing
// ─────────────────────────────────────────────────────────────
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  APP_VERSION: z.string().default('1.0.0'),

  // Security
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Database (required from Phase 2 onward)
  DATABASE_URL: z.string().optional(),

  // Redis (optional — in-memory fallback used if absent)
  REDIS_URL: z.string().optional(),
  REDIS_TOKEN: z.string().optional(),

  // CORS
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173,http://localhost:8081'),

  // Admin seed user
  ADMIN_EMAIL: z.string().email().default('admin@ridecolab.dev'),
  ADMIN_PASSWORD: z.string().min(8).default('changeme123'),

  // External APIs (filled in later phases)
  ORS_API_KEY: z.string().optional(),
  SERVER_CHAT_SECRET: z.string().optional(),
  EXPO_PUSH_ACCESS_TOKEN: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

// Derived helpers
export const isDev = env.NODE_ENV === 'development';
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

export const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
