import { pool, query } from '../src/db/pool';

// ─────────────────────────────────────────────────────────────
// Phase 2 — DB integration tests
// Requires DATABASE_URL to be set in .env (real Neon DB)
// ─────────────────────────────────────────────────────────────

// Skip all DB tests if DATABASE_URL is not configured
const HAS_DB = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('FILL_IN');

const describeIf = HAS_DB ? describe : describe.skip;

afterAll(async () => {
  await pool.end();
});

describeIf('Database — PostGIS', () => {
  it('PostGIS extension is installed', async () => {
    const res = await query<{ version: string }>('SELECT PostGIS_Version() AS version');
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]?.version).toBeTruthy();
    console.log('PostGIS version:', res.rows[0]?.version);
  });
});

describeIf('Database — Schema', () => {
  it('all required tables exist in public schema', async () => {
    const requiredTables = [
      'app_config', 'users', 'trust_scores', 'emergency_contacts',
      'user_declarations', 'refresh_tokens', 'vehicle_catalog', 'vehicles',
      'fuel_prices', 'landmarks', 'route_cache', 'communities', 'community_members',
      'trips', 'bookings', 'live_locations', 'messages', 'reviews',
      'notifications', 'sos_alerts', 'geocoding_cache', 'admin_audit_log',
    ];

    const res = await query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    const existingTables = res.rows.map((r) => r.table_name);

    for (const t of requiredTables) {
      expect(existingTables).toContain(t);
    }
  });
});

describeIf('Database — Seed data', () => {
  it('fuel_prices has exactly 4 rows', async () => {
    const res = await query('SELECT COUNT(*) AS count FROM fuel_prices');
    expect(Number(res.rows[0]?.count)).toBe(4);
  });

  it('fuel_prices has correct fuel types', async () => {
    const res = await query<{ fuel_type: string }>('SELECT fuel_type FROM fuel_prices ORDER BY fuel_type');
    const types = res.rows.map((r) => r.fuel_type);
    expect(types).toContain('petrol');
    expect(types).toContain('diesel');
    expect(types).toContain('cng');
    expect(types).toContain('electric');
  });

  it('landmarks has 30 Pune landmarks', async () => {
    const res = await query('SELECT COUNT(*) AS count FROM landmarks');
    expect(Number(res.rows[0]?.count)).toBeGreaterThanOrEqual(30);
  });

  it('vehicle_catalog has vehicles seeded', async () => {
    const res = await query('SELECT COUNT(*) AS count FROM vehicle_catalog');
    expect(Number(res.rows[0]?.count)).toBeGreaterThanOrEqual(20);
  });

  it('app_config has all required keys', async () => {
    const requiredKeys = [
      'fare.real_world_factor',
      'trip.weekly_limit',
      'trip.max_seats',
      'trust.min_score_to_ride',
    ];
    for (const key of requiredKeys) {
      const res = await query('SELECT value FROM app_config WHERE key = $1', [key]);
      expect(res.rows).toHaveLength(1);
    }
  });

  it('Zeal College demo community exists', async () => {
    const res = await query('SELECT invite_code FROM communities WHERE invite_code = $1', ['ZEAL2025']);
    expect(res.rows).toHaveLength(1);
  });

  it('admin user exists with role=admin', async () => {
    const res = await query<{ role: string }>(
      'SELECT role FROM users WHERE email = $1',
      [process.env.ADMIN_EMAIL ?? 'admin@ridecolab.com'],
    );
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]?.role).toBe('admin');
  });
});

describeIf('Database — Error handler shape', () => {
  it('invalid SQL throws a pg Error (not crashes server)', async () => {
    await expect(query('SELECT * FROM nonexistent_table_xyz')).rejects.toThrow();
  });
});
