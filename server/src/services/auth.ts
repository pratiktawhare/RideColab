import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query, withTransaction } from '~/db/pool';
import { env } from '~/config/app';
import { logger } from '~/utils/logger';
import type { JwtPayload } from '~/types/express.d';

// ─────────────────────────────────────────────────────────────
// Token helpers
// ─────────────────────────────────────────────────────────────

export function signAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function signRefreshToken(): string {
  return crypto.randomBytes(64).toString('hex');
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ─────────────────────────────────────────────────────────────
// DB row types
// ─────────────────────────────────────────────────────────────

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: 'user' | 'admin';
  mode: string;
  consent_given_at: Date | null;
  is_active: boolean;
  is_anonymised: boolean;
}

// ─────────────────────────────────────────────────────────────
// register
// ─────────────────────────────────────────────────────────────

export async function registerUser(data: {
  email: string;
  password: string;
  name: string;
  language?: string;
}) {
  const existing = await query('SELECT id FROM users WHERE email = $1', [data.email]);
  if (existing.rows.length > 0) {
    throw Object.assign(new Error('Email already registered'), { code: 'AUTH_EMAIL_EXISTS', status: 409 });
  }

  const password_hash = await bcrypt.hash(data.password, 12);

  const result = await withTransaction(async (client) => {
    const { rows } = await client.query<UserRow>(
      `INSERT INTO users (email, password_hash, name, language)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, role, mode, consent_given_at`,
      [data.email, password_hash, data.name, data.language ?? 'en'],
    );
    const user = rows[0]!;

    // Init trust score
    await client.query(
      'INSERT INTO trust_scores (user_id) VALUES ($1)',
      [user.id],
    );

    return user;
  });

  const accessToken = signAccessToken({ sub: result.id, email: result.email, role: result.role });
  const refreshToken = signRefreshToken();
  const refreshHash = hashToken(refreshToken);

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  await query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [result.id, refreshHash, expiresAt],
  );

  logger.info({ userId: result.id }, 'User registered');
  return { user: result, accessToken, refreshToken };
}

// ─────────────────────────────────────────────────────────────
// login
// ─────────────────────────────────────────────────────────────

export async function loginUser(email: string, password: string) {
  const { rows } = await query<UserRow>(
    'SELECT id, email, password_hash, name, role, mode, consent_given_at, is_active, is_anonymised FROM users WHERE email = $1',
    [email],
  );
  const user = rows[0];

  if (!user || !user.is_active || user.is_anonymised) {
    throw Object.assign(new Error('Invalid credentials'), { code: 'AUTH_INVALID', status: 401 });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw Object.assign(new Error('Invalid credentials'), { code: 'AUTH_INVALID', status: 401 });
  }

  const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role });
  const refreshToken = signRefreshToken();
  const refreshHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [user.id, refreshHash, expiresAt],
  );

  logger.info({ userId: user.id }, 'User logged in');
  return {
    user: { id: user.id, email: user.email, name: user.name, role: user.role, mode: user.mode, consent_given_at: user.consent_given_at },
    accessToken,
    refreshToken,
  };
}

// ─────────────────────────────────────────────────────────────
// refresh
// ─────────────────────────────────────────────────────────────

export async function refreshTokens(incomingRefreshToken: string) {
  const hash = hashToken(incomingRefreshToken);

  const { rows } = await query<{ id: string; user_id: string; expires_at: Date; revoked: boolean }>(
    'SELECT id, user_id, expires_at, revoked FROM refresh_tokens WHERE token_hash = $1',
    [hash],
  );
  const tokenRow = rows[0];

  if (!tokenRow || tokenRow.revoked || new Date() > tokenRow.expires_at) {
    throw Object.assign(new Error('Invalid refresh token'), { code: 'AUTH_INVALID_TOKEN', status: 401 });
  }

  const { rows: userRows } = await query<UserRow>(
    'SELECT id, email, role, is_active FROM users WHERE id = $1',
    [tokenRow.user_id],
  );
  const user = userRows[0];
  if (!user || !user.is_active) {
    throw Object.assign(new Error('User not found'), { code: 'AUTH_INVALID', status: 401 });
  }

  // Rotate: revoke old, issue new
  await query('UPDATE refresh_tokens SET revoked = true WHERE id = $1', [tokenRow.id]);

  const newAccessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role });
  const newRefreshToken = signRefreshToken();
  const newHash = hashToken(newRefreshToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [user.id, newHash, expiresAt],
  );

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

// ─────────────────────────────────────────────────────────────
// logout
// ─────────────────────────────────────────────────────────────

export async function logoutUser(userId: string, incomingRefreshToken?: string) {
  if (incomingRefreshToken) {
    const hash = hashToken(incomingRefreshToken);
    await query('UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1', [hash]);
  } else {
    // Revoke all tokens for user
    await query('UPDATE refresh_tokens SET revoked = true WHERE user_id = $1', [userId]);
  }
  logger.info({ userId }, 'User logged out');
}

// ─────────────────────────────────────────────────────────────
// Google OAuth — upsert user from Google profile
// ─────────────────────────────────────────────────────────────

export async function upsertGoogleUser(profile: {
  googleId: string;
  email: string;
  name: string;
}) {
  // Check existing by google_id or email
  const { rows } = await query<UserRow>(
    'SELECT id, email, name, role, mode, consent_given_at FROM users WHERE google_id = $1 OR email = $2',
    [profile.googleId, profile.email],
  );

  let user = rows[0];

  if (!user) {
    // New user — register via Google
    const result = await withTransaction(async (client) => {
      const { rows: newRows } = await client.query<UserRow>(
        `INSERT INTO users (email, password_hash, name, google_id)
         VALUES ($1, '', $2, $3)
         RETURNING id, email, name, role, mode, consent_given_at`,
        [profile.email, profile.name, profile.googleId],
      );
      const newUser = newRows[0]!;
      await client.query('INSERT INTO trust_scores (user_id) VALUES ($1)', [newUser.id]);
      return newUser;
    });
    user = result;
  } else if (!user.id) {
    // Should not happen, but type guard
    throw new Error('Unexpected DB state');
  } else {
    // Update google_id if missing
    await query('UPDATE users SET google_id = $1 WHERE id = $2 AND google_id IS NULL', [profile.googleId, user.id]);
  }

  const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role });
  const refreshToken = signRefreshToken();
  const hash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [user.id, hash, expiresAt],
  );

  logger.info({ userId: user.id }, 'Google OAuth upsert');
  return { user, accessToken, refreshToken };
}
