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
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on idle PostgreSQL client');
});

/**
 * Run a single query. Borrows a client from the pool, releases it after.
 */
export async function query<T extends QueryResultRow = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<import('pg').QueryResult<T>> {
  const start = Date.now();
  const res = await pool.query<T>(text, params);
  logger.debug({ query: text, duration: Date.now() - start, rows: res.rowCount }, 'db query');
  return res;
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
