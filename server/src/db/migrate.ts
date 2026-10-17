import fs from 'fs';
import path from 'path';
import { pool } from './pool';
import { logger } from '~/utils/logger';

// ─────────────────────────────────────────────────────────────
// Simple migration runner — reads numbered .sql files in order
// Creates a migrations table to track which have been applied
// ─────────────────────────────────────────────────────────────

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          SERIAL PRIMARY KEY,
      filename    TEXT UNIQUE NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const res = await pool.query<{ filename: string }>('SELECT filename FROM _migrations');
  return new Set(res.rows.map((r) => r.filename));
}

async function runMigrations(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // lexicographic = 001, 002, ...

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      logger.info({ file }, 'Migration already applied — skipping');
      continue;
    }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    logger.info({ file }, 'Applying migration...');
    await pool.query(sql);
    await pool.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
    logger.info({ file }, 'Migration applied ✓');
    ran++;
  }

  if (ran === 0) {
    logger.info('All migrations already applied — nothing to do');
  } else {
    logger.info({ ran }, 'Migrations complete');
  }

  await pool.end();
}

runMigrations().catch((err) => {
  logger.error({ err }, 'Migration failed');
  process.exit(1);
});
