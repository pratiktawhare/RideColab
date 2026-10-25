import { Pool, QueryResultRow } from 'pg';
import { env } from '~/config/app';
import { logger } from '~/utils/logger';

// ─────────────────────────────────────────────────────────────
// PostgreSQL connection pool (pg)
// Uses Neon pooled connection string (PgBouncer-compatible)
// ─────────────────────────────────────────────────────────────

if (!env.DATABASE_URL) {
  logger.error('DATABASE_URL is not set — cannot start DB pool');
  process.exit(1);
}

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  // Neon free tier autosuspends after 5 min. Keep idle timeout well below
  // that so pg-pool releases connections before Neon kills them.
  idleTimeoutMillis: 20_000,
  // Neon cold-start can take 10–15 s — give it 20 s before giving up.
  connectionTimeoutMillis: 20_000,
});

pool.on('error', (err) => {
  logger.warn({ err }, 'Idle PostgreSQL client error — Neon may have suspended');
});

// Error codes / messages that indicate a stale / terminated connection
const RECONNECT_MESSAGES = ['connection terminated', 'connection timeout', 'connection reset'];
const RECONNECT_CODES = new Set(['57P01', '08006', '08001', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT']);

function isRetryable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  if (RECONNECT_MESSAGES.some((m) => msg.includes(m))) return true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const code: string = (err as any).code ?? '';
  return RECONNECT_CODES.has(code);
}

/**
 * Run a single query. Borrows a client from the pool, releases it after.
 * Retries ONCE on terminated-connection errors (Neon autosuspend cold-start).
 */
export async function query<T extends QueryResultRow = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<import('pg').QueryResult<T>> {
  const start = Date.now();
  try {
    const res = await pool.query<T>(text, params);
    logger.debug({ query: text, duration: Date.now() - start, rows: res.rowCount }, 'db query');
    return res;
  } catch (err) {
    if (isRetryable(err)) {
      logger.warn({ err, query: text }, 'DB connection lost — retrying after Neon cold-start');
      // Brief pause so Neon can finish waking up, then retry with a fresh connection
      await new Promise((r) => setTimeout(r, 3_000));
      const res = await pool.query<T>(text, params);
      logger.debug({ query: text, duration: Date.now() - start, rows: res.rowCount }, 'db query (retry)');
      return res;
    }
    throw err;
  }
}

/**
 * Execute a callback inside a transaction. Rolls back on error.
 */
export async function withTransaction<T>(
  fn: (client: import('pg').PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
