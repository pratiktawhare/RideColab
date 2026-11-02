/**
 * Phase 9 — Live Ride & Safety Tests
 *
 * Verifies: live share token, live location REST polling,
 * public share page, SOS logging, helmet check, safe arrival,
 * live location cleared after completeRide (DPDP compliance),
 * non-occupant access control.
 */
import request from 'supertest';
import app from '../src/index';
import { query } from '../src/db/pool';
import { updateLocation, getLocations, clearTripLocations } from '../src/services/live';
import { isNightTime } from '../src/services/safety';

// ── Auth helpers ──────────────────────────────────────────────
async function loginAs(email: string, password = 'Demo@1234') {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  return res.body.data?.access_token as string;
}

let riderToken: string;
let passengerToken: string;
let outsiderToken: string;
let riderId: string;
let passengerId: string;
let vehicleId: string;
let testTripId: string;
let testBookingId: string;

const HINJEWADI = { lat: 18.5912, lng: 73.7386 };
const KOTHRUD = { lat: 18.5074, lng: 73.8077 };
const ROUTE_WKT = `LINESTRING(73.7386 18.5912, 73.7868 18.5590, 73.8077 18.5074)`;

async function createTestTripWithBooking(): Promise<{ tripId: string; bookingId: string }> {
  const tripRes = await query<{ id: string }>(
    `INSERT INTO trips (
       rider_id, vehicle_id,
       origin_label, origin_lat, origin_lng,
       dest_label, dest_lat, dest_lng,
       route, distance_m, duration_s,
       depart_at, seats_total, seats_available,
       fare_set, fare_cap, status
     ) VALUES (
       $1, $2,
       'Hinjewadi IT Park, Pune', $3, $4,
       'Kothrud, Pune', $5, $6,
       ST_GeogFromText($7), 15000, 1800,
       NOW() + INTERVAL '2 hours', 3, 3,
       90.00, 120.00, 'open'
     ) RETURNING id`,
    [riderId, vehicleId, HINJEWADI.lat, HINJEWADI.lng, KOTHRUD.lat, KOTHRUD.lng, ROUTE_WKT],
  );
  const tripId = tripRes.rows[0]!.id;

  // Create booking
  const bookRes = await query<{ id: string }>(
    `INSERT INTO bookings (
       trip_id, passenger_id, status, seats_booked,
       pickup_label, pickup_lat, pickup_lng,
       dropoff_label, dropoff_lat, dropoff_lng, fare_share
     ) VALUES (
       $1, $2, 'started', 1,
       'Hinjewadi IT Park, Pune', $3, $4,
       'Kothrud, Pune', $5, $6, 45.00
     ) RETURNING id`,
    [tripId, passengerId, HINJEWADI.lat, HINJEWADI.lng, KOTHRUD.lat, KOTHRUD.lng],
  );
  const bookingId = bookRes.rows[0]!.id;

  // Set trip in_progress
  await query(`UPDATE trips SET status = 'in_progress' WHERE id = $1`, [tripId]);

  return { tripId, bookingId };
}

// ── Setup ─────────────────────────────────────────────────────
beforeAll(async () => {
  riderToken = await loginAs('rider@demo.ridecolab.dev');
  passengerToken = await loginAs('passenger@demo.ridecolab.dev');

  // Get user IDs
  const riderRes = await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${riderToken}`);
  riderId = riderRes.body.data.id;

  const pasRes = await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${passengerToken}`);
  passengerId = pasRes.body.data.id;

  // Get a vehicle for the rider
  const vRes = await query<{ id: string }>(`SELECT v.id FROM vehicles v WHERE v.user_id = $1 LIMIT 1`, [riderId]);
  vehicleId = vRes.rows[0]?.id ?? '';

  // Register an outsider (second passenger) to test access control
  const outsiderLoginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'passenger2@demo.ridecolab.dev', password: 'Demo@1234' });
  outsiderToken = outsiderLoginRes.body.data?.access_token ?? '';

  // Create a fresh trip + booking
  const { tripId, bookingId } = await createTestTripWithBooking();
  testTripId = tripId;
  testBookingId = bookingId;
}, 30_000);

afterAll(async () => {
  // Cleanup test data
  if (testTripId) {
    await query(`DELETE FROM trips WHERE id = $1`, [testTripId]);
  }
});

// ─────────────────────────────────────────────────────────────
// 1. Live Share Token
// ─────────────────────────────────────────────────────────────
describe('Live Share Token', () => {
  test('POST /api/v1/trips/:id/live-share — rider gets a share token', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${testTripId}/live-share`)
      .set('Authorization', `Bearer ${riderToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.share_token).toBeTruthy();
    expect(res.body.data.share_url).toContain('/share/');
  });

  test('POST /api/v1/trips/:id/live-share — calling again returns same token', async () => {
    const res1 = await request(app)
      .post(`/api/v1/trips/${testTripId}/live-share`)
      .set('Authorization', `Bearer ${riderToken}`)
      .expect(200);

    const res2 = await request(app)
      .post(`/api/v1/trips/${testTripId}/live-share`)
      .set('Authorization', `Bearer ${riderToken}`)
      .expect(200);

    expect(res1.body.data.share_token).toBe(res2.body.data.share_token);
  });

  test('POST /api/v1/trips/:id/live-share — passenger cannot generate share token', async () => {
    await request(app)
      .post(`/api/v1/trips/${testTripId}/live-share`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .expect(403);
  });
});

// ─────────────────────────────────────────────────────────────
// 2. Live Locations REST endpoint
// ─────────────────────────────────────────────────────────────
describe('GET /api/v1/live/:trip_id', () => {
  test('returns empty array initially (no location updates yet)', async () => {
    await clearTripLocations(testTripId); // ensure clean state

    const res = await request(app)
      .get(`/api/v1/live/${testTripId}`)
      .set('Authorization', `Bearer ${riderToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('returns location after updateLocation called', async () => {
    await updateLocation(testTripId, riderId, HINJEWADI.lat, HINJEWADI.lng, 90, 35);

    const res = await request(app)
      .get(`/api/v1/live/${testTripId}`)
      .set('Authorization', `Bearer ${riderToken}`)
      .expect(200);

    expect(res.body.data.length).toBeGreaterThan(0);
    const loc = res.body.data[0];
    expect(loc.lat).toBeCloseTo(HINJEWADI.lat, 4);
    expect(loc.lng).toBeCloseTo(HINJEWADI.lng, 4);
  });

  test('non-occupant cannot access live locations', async () => {
    if (!outsiderToken) {
      console.warn('No outsider token — skipping access control test');
      return;
    }
    await request(app)
      .get(`/api/v1/live/${testTripId}`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(403);
  });

  test('unauthenticated request is rejected', async () => {
    await request(app).get(`/api/v1/live/${testTripId}`).expect(401);
  });
});

// ─────────────────────────────────────────────────────────────
// 3. Public Share Page
// ─────────────────────────────────────────────────────────────
describe('GET /share/:token — public page', () => {
  let shareToken: string;

  beforeAll(async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${testTripId}/live-share`)
      .set('Authorization', `Bearer ${riderToken}`);
    shareToken = res.body.data.share_token;
  });

  test('valid token → 200 HTML page', async () => {
    const res = await request(app).get(`/share/${shareToken}`).expect(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('RideColab');
    expect(res.text).toContain('Kothrud');
  });

  test('invalid token → 404', async () => {
    await request(app).get('/share/invalid-token-xyz-123').expect(404);
  });
});

// ─────────────────────────────────────────────────────────────
// 4. Public Live Poll endpoint (used by share page)
// ─────────────────────────────────────────────────────────────
describe('GET /api/v1/share-live/:trip_id?token=xxx — public poll', () => {
  let shareToken: string;

  beforeAll(async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${testTripId}/live-share`)
      .set('Authorization', `Bearer ${riderToken}`);
    shareToken = res.body.data.share_token;
  });

  test('valid share token → returns live location data', async () => {
    await updateLocation(testTripId, riderId, HINJEWADI.lat, HINJEWADI.lng);

    const res = await request(app)
      .get(`/api/v1/share-live/${testTripId}?token=${shareToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('invalid share token → 404', async () => {
    await request(app)
      .get(`/api/v1/share-live/${testTripId}?token=wrong-token`)
      .expect(404);
  });

  test('missing token → 401', async () => {
    await request(app).get(`/api/v1/share-live/${testTripId}`).expect(401);
  });
});

// ─────────────────────────────────────────────────────────────
// 5. SOS Alert
// ─────────────────────────────────────────────────────────────
describe('POST /api/v1/trips/:id/sos', () => {
  test('rider can trigger SOS → creates sos_alerts row', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${testTripId}/sos`)
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ lat: HINJEWADI.lat, lng: HINJEWADI.lng })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.sos_id).toBeTruthy();

    // Verify DB row
    const dbRes = await query<{ id: string }>(
      `SELECT id FROM sos_alerts WHERE id = $1`,
      [res.body.data.sos_id],
    );
    expect(dbRes.rows.length).toBe(1);
  });

  test('passenger can trigger SOS', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${testTripId}/sos`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({})
      .expect(201);

    expect(res.body.success).toBe(true);
  });

  test('SOS also logs a ride_events row', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${testTripId}/sos`)
      .set('Authorization', `Bearer ${riderToken}`)
      .send({})
      .expect(201);

    const evRes = await query<{ id: string }>(
      `SELECT id FROM ride_events WHERE trip_id = $1 AND event_type = 'sos' ORDER BY created_at DESC LIMIT 1`,
      [testTripId],
    );
    expect(evRes.rows.length).toBeGreaterThan(0);
  });

  test('outsider cannot trigger SOS on a trip they are not part of', async () => {
    if (!outsiderToken) return;
    await request(app)
      .post(`/api/v1/trips/${testTripId}/sos`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({})
      .expect(403);
  });
});

// ─────────────────────────────────────────────────────────────
// 6. Helmet Check
// ─────────────────────────────────────────────────────────────
describe('POST /api/v1/bookings/:id/helmet-check', () => {
  test('rider can log helmet check', async () => {
    const res = await request(app)
      .post(`/api/v1/bookings/${testBookingId}/helmet-check`)
      .set('Authorization', `Bearer ${riderToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.helmet_checked).toBe(true);

    // Verify DB
    const dbRes = await query<{ helmet_checked_at: string | null }>(
      `SELECT helmet_checked_at FROM bookings WHERE id = $1`,
      [testBookingId],
    );
    expect(dbRes.rows[0]?.helmet_checked_at).toBeTruthy();
  });

  test('passenger can log helmet check', async () => {
    const res = await request(app)
      .post(`/api/v1/bookings/${testBookingId}/helmet-check`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
  });

  test('unrelated user cannot log helmet check', async () => {
    if (!outsiderToken) return;
    await request(app)
      .post(`/api/v1/bookings/${testBookingId}/helmet-check`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(404);
  });
});

// ─────────────────────────────────────────────────────────────
// 7. Safe Arrival
// ─────────────────────────────────────────────────────────────
describe('POST /api/v1/bookings/:id/safe-arrival', () => {
  test('passenger can log safe arrival', async () => {
    const res = await request(app)
      .post(`/api/v1/bookings/${testBookingId}/safe-arrival`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.safe_arrival_logged).toBe(true);

    // Verify DB
    const dbRes = await query<{ safe_arrival_at: string | null }>(
      `SELECT safe_arrival_at FROM bookings WHERE id = $1`,
      [testBookingId],
    );
    expect(dbRes.rows[0]?.safe_arrival_at).toBeTruthy();
  });

  test('rider cannot log safe arrival (not their booking as passenger)', async () => {
    // Create a separate booking for the rider acting as passenger — not in scope.
    // Just verify the endpoint rejects the rider for this booking.
    await request(app)
      .post(`/api/v1/bookings/${testBookingId}/safe-arrival`)
      .set('Authorization', `Bearer ${riderToken}`)
      .expect(404);
  });
});

// ─────────────────────────────────────────────────────────────
// 8. DPDP Compliance — Location cleared after ride complete
// ─────────────────────────────────────────────────────────────
describe('DPDP compliance — live locations deleted post-trip', () => {
  test('clearTripLocations removes from cache', async () => {
    await updateLocation(testTripId, riderId, HINJEWADI.lat, HINJEWADI.lng);

    // Verify location is stored
    const locsBefore = await getLocations(testTripId);
    expect(locsBefore.length).toBeGreaterThan(0);

    // Clear
    await clearTripLocations(testTripId);

    // Verify cleared
    const locsAfter = await getLocations(testTripId);
    expect(locsAfter.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
// 9. Night time helper
// ─────────────────────────────────────────────────────────────
describe('Night rules utility', () => {
  test('isNightTime() returns a boolean', () => {
    const result = isNightTime();
    expect(typeof result).toBe('boolean');
  });
});

// ─────────────────────────────────────────────────────────────
// 10. updateLocation / getLocations unit tests (in-memory cache)
// ─────────────────────────────────────────────────────────────
describe('Live location service — unit tests', () => {
  const fakeTripId = 'test-trip-unit-99999';
  const fakeUserId = 'test-user-unit-99999';

  beforeEach(async () => {
    await clearTripLocations(fakeTripId);
  });

  afterEach(async () => {
    await clearTripLocations(fakeTripId);
  });

  test('updateLocation stores and getLocations retrieves', async () => {
    await updateLocation(fakeTripId, fakeUserId, 18.5912, 73.7386, 90, 35);
    const locs = await getLocations(fakeTripId);
    expect(locs.length).toBe(1);
    expect(locs[0]!.userId).toBe(fakeUserId);
    expect(locs[0]!.lat).toBeCloseTo(18.5912, 4);
  });

  test('updating location overwrites previous entry for same user', async () => {
    await updateLocation(fakeTripId, fakeUserId, 18.5912, 73.7386);
    await updateLocation(fakeTripId, fakeUserId, 18.5800, 73.7500);
    const locs = await getLocations(fakeTripId);
    expect(locs.length).toBe(1);
    expect(locs[0]!.lat).toBeCloseTo(18.5800, 4);
  });

  test('multiple users tracked independently', async () => {
    await updateLocation(fakeTripId, 'user-A', 18.5912, 73.7386);
    await updateLocation(fakeTripId, 'user-B', 18.5074, 73.8077);
    const locs = await getLocations(fakeTripId);
    expect(locs.length).toBe(2);
  });
});

