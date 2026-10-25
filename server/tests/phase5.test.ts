// ─────────────────────────────────────────────────────────────
// Phase 5 tests — Geocoding + Trips (fare cap, weekly limit)
// ─────────────────────────────────────────────────────────────
import request from 'supertest';
import app from '../src/index';
import { query } from '../src/db/pool';

// ── Test helpers ──────────────────────────────────────────────
let accessToken: string;
let userId: string;
let vehicleId: string;

const TEST_EMAIL = `test_phase5_${Date.now()}@ridecolab.test`;
const TEST_PASS = 'Test@1234';

async function register() {
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ email: TEST_EMAIL, password: TEST_PASS, name: 'Phase5 Tester' });
  userId = res.body.data.user.id;
  accessToken = res.body.data.access_token;
}

async function addVehicle(): Promise<string> {
  // Get a petrol car from catalog (Maruti Swift)
  const catalogRes = await query<{ id: string }>(
    `SELECT id FROM vehicle_catalog WHERE make = 'Maruti Suzuki' AND model = 'Swift' LIMIT 1`,
  );
  const catalogId = catalogRes.rows[0]!.id;

  const res = await request(app)
    .post('/api/v1/users/me/vehicles')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ catalog_id: catalogId, plate_number: 'MH12AB1234' });
  return res.body.data.id as string;
}

beforeAll(async () => {
  await register();
  vehicleId = await addVehicle();
  // Set user mode to rider so they can post trips
  await query(`UPDATE users SET mode = 'rider' WHERE id = $1`, [userId]);
});

afterAll(async () => {
  await query(`DELETE FROM trips WHERE rider_id = $1`, [userId]);
  await query(`DELETE FROM users WHERE id = $1`, [userId]);
});

// ─────────────────────────────────────────────────────────────
// GEOCODING tests
// ─────────────────────────────────────────────────────────────
describe('GET /api/v1/geocoding/landmarks', () => {
  it('returns all Pune landmarks without auth', async () => {
    const res = await request(app).get('/api/v1/geocoding/landmarks');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty('label');
    expect(res.body.data[0]).toHaveProperty('lat');
    expect(res.body.data[0]).toHaveProperty('lng');
  });
});

describe('GET /api/v1/geocoding/search', () => {
  it('requires auth', async () => {
    const res = await request(app).get('/api/v1/geocoding/search?q=Hinjewadi');
    expect(res.status).toBe(401);
  });

  it('rejects query shorter than 2 chars', async () => {
    const res = await request(app)
      .get('/api/v1/geocoding/search?q=H')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns Hinjewadi from landmarks (0 ORS calls)', async () => {
    const res = await request(app)
      .get('/api/v1/geocoding/search?q=Hinjewadi')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    const first = res.body.data[0];
    expect(first.source).toBe('landmark'); // Must NOT hit ORS
    expect(first.label).toMatch(/Hinjewadi/i);
    expect(first.lat).toBeCloseTo(18.59, 1);
    expect(first.lng).toBeCloseTo(73.73, 1);
  });

  it('returns Kothrud from landmarks', async () => {
    const res = await request(app)
      .get('/api/v1/geocoding/search?q=Kothrud')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data[0].source).toBe('landmark');
  });

  it('returns Pune Railway Station from landmarks', async () => {
    const res = await request(app)
      .get('/api/v1/geocoding/search?q=Pune Railway')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data[0].source).toBe('landmark');
  });
});

// ─────────────────────────────────────────────────────────────
// TRIPS tests
// ─────────────────────────────────────────────────────────────

// Use a fixed short distance (Hinjewadi → Baner, ~4 km) as the route
// Since ORS won't be called in tests (no key or mocked), we stub the routing
// by pre-inserting a route_cache entry.
const ORIGIN_LAT = 18.5912;
const ORIGIN_LNG = 73.7390;
const DEST_LAT   = 18.5590;
const DEST_LNG   = 73.7868;

// Round to 4dp (matching routing service)
function r4(n: number) { return Math.round(n * 10000) / 10000; }

async function seedRouteCache() {
  // Insert a fake route so trips tests don't need ORS
  await query(
    `INSERT INTO route_cache (origin_lat, origin_lng, dest_lat, dest_lng,
       distance_m, duration_s, route)
     VALUES ($1,$2,$3,$4, 4200, 720,
       ST_GeogFromText('LINESTRING(73.7390 18.5912, 73.7868 18.5590)'))
     ON CONFLICT (origin_lat, origin_lng, dest_lat, dest_lng) DO NOTHING`,
    [r4(ORIGIN_LAT), r4(ORIGIN_LNG), r4(DEST_LAT), r4(DEST_LNG)],
  );
}

beforeAll(async () => {
  await seedRouteCache();
});

function tripPayload(overrides: Record<string, unknown> = {}) {
  return {
    origin_label: 'Hinjewadi IT Park',
    origin_lat: ORIGIN_LAT,
    origin_lng: ORIGIN_LNG,
    dest_label: 'Baner',
    dest_lat: DEST_LAT,
    dest_lng: DEST_LNG,
    depart_at: new Date(Date.now() + 3600_000).toISOString(),
    seats_total: 2,
    fare_set: 20,   // well within cap for 4.2 km petrol trip
    vehicle_id: vehicleId,
    ...overrides,
  };
}

describe('POST /api/v1/trips', () => {
  it('requires auth', async () => {
    const res = await request(app).post('/api/v1/trips').send(tripPayload());
    expect(res.status).toBe(401);
  });

  it('creates a trip and returns valid data', async () => {
    const res = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(tripPayload());
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.status).toBe('open');
    expect(Number(res.body.data.fare_set)).toBe(20);
    expect(res.body.data.fare_estimate).toBeDefined();
  });

  it('rejects fare_set above fare cap', async () => {
    // Maruti Swift petrol: 23.2 kmpl, ~₹106/L → cap = 106/23.2*0.8 * 4.2 ≈ ₹23.9
    // fare_set of 9999 is way over cap
    const res = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(tripPayload({ fare_set: 9999 }));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('FARE_CAP_EXCEEDED');
  });

  it('rejects invalid vehicle_id', async () => {
    const res = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(tripPayload({ vehicle_id: '00000000-0000-0000-0000-000000000000' }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VEHICLE_NOT_FOUND');
  });

  it('rejects missing required fields', async () => {
    const res = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ origin_label: 'X' }); // missing many fields
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('enforces weekly limit after 14 trips', async () => {
    // Force weekly_trips_used to 14
    await query(
      `UPDATE users SET weekly_trips_used = 14 WHERE id = $1`,
      [userId],
    );
    const res = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(tripPayload());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('WEEKLY_LIMIT_EXCEEDED');
    // Reset for subsequent tests
    await query(`UPDATE users SET weekly_trips_used = 0 WHERE id = $1`, [userId]);
  });
});

describe('GET /api/v1/trips/mine', () => {
  it('returns rider trips', async () => {
    const res = await request(app)
      .get('/api/v1/trips/mine')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toHaveProperty('total');
  });
});

describe('GET /api/v1/trips/:id', () => {
  let tripId: string;
  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(tripPayload());
    tripId = res.body.data.id;
  });

  it('returns trip detail', async () => {
    const res = await request(app)
      .get(`/api/v1/trips/${tripId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(tripId);
    expect(res.body.data.rider_name).toBeDefined();
  });

  it('returns 404 for unknown trip', async () => {
    const res = await request(app)
      .get('/api/v1/trips/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/trips/:id', () => {
  let tripId: string;
  beforeAll(async () => {
    await query(`UPDATE users SET weekly_trips_used = 0 WHERE id = $1`, [userId]);
    const res = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(tripPayload());
    tripId = res.body.data.id;
  });

  it('updates notes', async () => {
    const res = await request(app)
      .patch(`/api/v1/trips/${tripId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ notes: 'No smoking please' });
    expect(res.status).toBe(200);
    expect(res.body.data.notes).toBe('No smoking please');
  });

  it('rejects fare_set above cap on update', async () => {
    const res = await request(app)
      .patch(`/api/v1/trips/${tripId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fare_set: 9999 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('FARE_CAP_EXCEEDED');
  });
});

describe('DELETE /api/v1/trips/:id', () => {
  let tripId: string;
  beforeAll(async () => {
    await query(`UPDATE users SET weekly_trips_used = 0 WHERE id = $1`, [userId]);
    const res = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(tripPayload());
    tripId = res.body.data.id;
  });

  it('cancels a trip', async () => {
    const res = await request(app)
      .delete(`/api/v1/trips/${tripId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.message).toMatch(/cancelled/i);
  });

  it('returns 404 for already-cancelled trip (second delete)', async () => {
    const res = await request(app)
      .delete(`/api/v1/trips/${tripId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(409); // not cancellable in cancelled status
  });
});
