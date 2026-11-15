/**
 * Phase 10 — Payments, Ratings and Trust Tests
 *
 * Verifies:
 * - Submitting ratings within 24h window for completed rides
 * - Access control (only participants can rate, duplicate prevention)
 * - Ratings pagination and trust score recalculation
 * - Savings summary (money saved, CO2 avoided, commute streak)
 * - User blocking and unblocking
 * - Blocked users excluded from search
 * - Filing reports with validation
 * - Public user profile
 */
import request from 'supertest';
import app from '../src/index';
import { query } from '../src/db/pool';
import { getTrustBadge } from '../src/services/ratings';

jest.setTimeout(30_000);

async function getOrCreateUser(email: string, name: string): Promise<{ token: string; id: string }> {
  let loginRes = await request(app).post('/api/v1/auth/login').send({ email, password: 'Demo@1234' });
  if (!loginRes.body.data?.access_token) {
    await request(app).post('/api/v1/auth/register').send({ email, password: 'Demo@1234', name, mode: 'passenger' });
    loginRes = await request(app).post('/api/v1/auth/login').send({ email, password: 'Demo@1234' });
  }
  const token = loginRes.body.data.access_token;
  const meRes = await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${token}`);
  return { token, id: meRes.body.data.id };
}

let riderToken: string;
let passengerToken: string;
let outsiderToken: string;
let riderId: string;
let passengerId: string;
let outsiderId: string;
let vehicleId: string;
let completedTripId: string;
let completedBookingId: string;

const HINJEWADI = { lat: 18.5912, lng: 73.7386 };
const KOTHRUD = { lat: 18.5074, lng: 73.8077 };
const ROUTE_WKT = `LINESTRING(73.7386 18.5912, 73.7868 18.5590, 73.8077 18.5074)`;

beforeAll(async () => {
  const rider = await getOrCreateUser('rider@demo.ridecolab.dev', 'Demo Rider');
  riderToken = rider.token;
  riderId = rider.id;

  const passenger = await getOrCreateUser('passenger@demo.ridecolab.dev', 'Demo Passenger');
  passengerToken = passenger.token;
  passengerId = passenger.id;

  const outsider = await getOrCreateUser('outsider10@demo.ridecolab.dev', 'Outsider User');
  outsiderToken = outsider.token;
  outsiderId = outsider.id;

  const vRes = await query<{ id: string }>(`SELECT v.id FROM vehicles v WHERE v.user_id = $1 LIMIT 1`, [riderId]);
  vehicleId = vRes.rows[0]?.id ?? '';

  // Clean any previous test ratings/blocks/reports between these users
  await query(`DELETE FROM reviews WHERE reviewer_id IN ($1, $2, $3) OR reviewee_id IN ($1, $2, $3)`, [riderId, passengerId, outsiderId]);
  await query(`DELETE FROM blocked_users WHERE blocker_id IN ($1, $2, $3) OR blocked_id IN ($1, $2, $3)`, [riderId, passengerId, outsiderId]);
  await query(`DELETE FROM reports WHERE reporter_id IN ($1, $2, $3) OR reported_id IN ($1, $2, $3)`, [riderId, passengerId, outsiderId]);

  // Create completed trip + completed booking for rating & savings tests
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
       NOW() - INTERVAL '2 hours', 3, 2,
       100.00, 120.00, 'completed'
     ) RETURNING id`,
    [riderId, vehicleId, HINJEWADI.lat, HINJEWADI.lng, KOTHRUD.lat, KOTHRUD.lng, ROUTE_WKT],
  );
  completedTripId = tripRes.rows[0]!.id;

  const bookRes = await query<{ id: string }>(
    `INSERT INTO bookings (
       trip_id, passenger_id, status, seats_booked,
       pickup_label, pickup_lat, pickup_lng,
       dropoff_label, dropoff_lat, dropoff_lng, fare_share,
       completed_at
     ) VALUES (
       $1, $2, 'completed', 1,
       'Hinjewadi IT Park, Pune', $3, $4,
       'Kothrud, Pune', $5, $6, 50.00,
       NOW() - INTERVAL '1 hour'
     ) RETURNING id`,
    [completedTripId, passengerId, HINJEWADI.lat, HINJEWADI.lng, KOTHRUD.lat, KOTHRUD.lng],
  );
  completedBookingId = bookRes.rows[0]!.id;
}, 30_000);

afterAll(async () => {
  if (completedTripId) {
    await query(`DELETE FROM trips WHERE id = $1`, [completedTripId]);
  }
  await query(`DELETE FROM reviews WHERE reviewer_id IN ($1, $2, $3) OR reviewee_id IN ($1, $2, $3)`, [riderId, passengerId, outsiderId]);
  await query(`DELETE FROM blocked_users WHERE blocker_id IN ($1, $2, $3) OR blocked_id IN ($1, $2, $3)`, [riderId, passengerId, outsiderId]);
  await query(`DELETE FROM reports WHERE reporter_id IN ($1, $2, $3) OR reported_id IN ($1, $2, $3)`, [riderId, passengerId, outsiderId]);
});

// ─────────────────────────────────────────────────────────────
// 1. Rating System
// ─────────────────────────────────────────────────────────────
describe('Rating System', () => {
  test('POST /bookings/:id/rate rejects without auth', async () => {
    await request(app)
      .post(`/api/v1/bookings/${completedBookingId}/rate`)
      .send({ rating: 5, tags: ['Punctual'] })
      .expect(401);
  });

  test('POST /bookings/:id/rate rejects if not participant', async () => {
    const res = await request(app)
      .post(`/api/v1/bookings/${completedBookingId}/rate`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ rating: 5, tags: ['Punctual'] })
      .expect(403);

    expect(res.body.error?.code).toBe('FORBIDDEN');
  });

  test('POST /bookings/:id/rate rejects if booking is not completed', async () => {
    // Create an uncompleted booking
    const openTripRes = await query<{ id: string }>(
      `INSERT INTO trips (
         rider_id, vehicle_id, origin_label, origin_lat, origin_lng,
         dest_label, dest_lat, dest_lng, route, distance_m, duration_s,
         depart_at, seats_total, seats_available, fare_set, fare_cap, status
       ) VALUES ($1, $2, 'Hinjewadi', 18.59, 73.73, 'Kothrud', 18.50, 73.80, ST_GeogFromText($3), 10000, 1000, NOW() + INTERVAL '1 day', 3, 3, 50, 60, 'open')
       RETURNING id`,
      [riderId, vehicleId, ROUTE_WKT],
    );
    const uncompletedBookingRes = await query<{ id: string }>(
      `INSERT INTO bookings (trip_id, passenger_id, status, seats_booked, pickup_label, pickup_lat, pickup_lng, dropoff_label, dropoff_lat, dropoff_lng, fare_share)
       VALUES ($1, $2, 'pending', 1, 'H', 18.59, 73.73, 'K', 18.50, 73.80, 25)
       RETURNING id`,
      [openTripRes.rows[0]!.id, passengerId],
    );
    const uncompletedBookingId = uncompletedBookingRes.rows[0]!.id;

    const res = await request(app)
      .post(`/api/v1/bookings/${uncompletedBookingId}/rate`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ rating: 5, tags: ['Safe Driver'] })
      .expect(422);

    expect(res.body.error?.code).toBe('BOOKING_NOT_COMPLETED');
    await query(`DELETE FROM trips WHERE id = $1`, [openTripRes.rows[0]!.id]);
  });

  test('POST /bookings/:id/rate rejects if > 24 hours after completion', async () => {
    // Create an old booking completed 2 days ago
    const oldTripRes = await query<{ id: string }>(
      `INSERT INTO trips (
         rider_id, vehicle_id, origin_label, origin_lat, origin_lng,
         dest_label, dest_lat, dest_lng, route, distance_m, duration_s,
         depart_at, seats_total, seats_available, fare_set, fare_cap, status
       ) VALUES ($1, $2, 'Hinjewadi', 18.59, 73.73, 'Kothrud', 18.50, 73.80, ST_GeogFromText($3), 10000, 1000, NOW() - INTERVAL '3 days', 3, 2, 50, 60, 'completed')
       RETURNING id`,
      [riderId, vehicleId, ROUTE_WKT],
    );
    const oldBookingRes = await query<{ id: string }>(
      `INSERT INTO bookings (trip_id, passenger_id, status, seats_booked, pickup_label, pickup_lat, pickup_lng, dropoff_label, dropoff_lat, dropoff_lng, fare_share, completed_at)
       VALUES ($1, $2, 'completed', 1, 'H', 18.59, 73.73, 'K', 18.50, 73.80, 25, NOW() - INTERVAL '48 hours')
       RETURNING id`,
      [oldTripRes.rows[0]!.id, passengerId],
    );

    const res = await request(app)
      .post(`/api/v1/bookings/${oldBookingRes.rows[0]!.id}/rate`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ rating: 4, tags: ['Punctual'] })
      .expect(403);

    expect(res.body.error?.code).toBe('RATING_WINDOW_CLOSED');
    await query(`DELETE FROM trips WHERE id = $1`, [oldTripRes.rows[0]!.id]);
  });

  test('POST /bookings/:id/rate passenger rates rider successfully', async () => {
    const res = await request(app)
      .post(`/api/v1/bookings/${completedBookingId}/rate`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({
        rating: 5,
        tags: ['Punctual', 'Safe Driver'],
        comment: 'Great ride! Very punctual and smooth driving.',
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.rating).toBe(5);
    expect(res.body.data.tags).toContain('Safe Driver');
    expect(res.body.data.reviewee_id).toBe(riderId);
    expect(res.body.data.reviewer_id).toBe(passengerId);
  });

  test('POST /bookings/:id/rate duplicate rating returns 409 ALREADY_RATED', async () => {
    const res = await request(app)
      .post(`/api/v1/bookings/${completedBookingId}/rate`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ rating: 4, tags: ['Punctual'] })
      .expect(409);

    expect(res.body.error?.code).toBe('ALREADY_RATED');
  });

  test('POST /bookings/:id/rate rider rates passenger successfully', async () => {
    const res = await request(app)
      .post(`/api/v1/bookings/${completedBookingId}/rate`)
      .set('Authorization', `Bearer ${riderToken}`)
      .send({
        rating: 5,
        tags: ['Friendly', 'Punctual'],
        comment: 'Polite and on time.',
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.reviewee_id).toBe(passengerId);
    expect(res.body.data.reviewer_id).toBe(riderId);
  });

  test('GET /users/:id/ratings returns paginated reviews', async () => {
    const res = await request(app)
      .get(`/api/v1/users/${riderId}/ratings?page=1`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.reviews)).toBe(true);
    expect(res.body.data.reviews.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.reviews[0].reviewer_name).toBeDefined();
  });

  test('GET /ratings/tags returns valid tag choices', async () => {
    const res = await request(app)
      .get('/api/v1/ratings/tags')
      .set('Authorization', `Bearer ${passengerToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toContain('Safe Driver');
    expect(res.body.data).toContain('Punctual');
  });
});

// ─────────────────────────────────────────────────────────────
// 2. Trust Score Formula & Badges
// ─────────────────────────────────────────────────────────────
describe('Trust Score & Badges', () => {
  test('Trust badge returns correct tier', () => {
    expect(getTrustBadge(15)).toBe('New');
    expect(getTrustBadge(30)).toBe('Regular');
    expect(getTrustBadge(60)).toBe('Trusted');
    expect(getTrustBadge(85)).toBe('Verified');
  });

  test('GET /users/:id/trust returns recalculated score and badge', async () => {
    const res = await request(app)
      .get(`/api/v1/users/${riderId}/trust`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.score).toBe('number');
    expect(['New', 'Regular', 'Trusted', 'Verified']).toContain(res.body.data.badge);
    expect(res.body.data.avg_rating).toBeGreaterThan(0);
    expect(res.body.data.total_ratings).toBeGreaterThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────
// 3. Savings Service
// ─────────────────────────────────────────────────────────────
describe('Savings Service', () => {
  test('GET /users/me/savings returns calculated money and CO2 saved', async () => {
    const res = await request(app)
      .get('/api/v1/users/me/savings')
      .set('Authorization', `Bearer ${passengerToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    const data = res.body.data;
    // Trip had fare_set=100 and passenger fare_share=50 => money_saved >= 50
    expect(data.money_saved).toBeGreaterThanOrEqual(50);
    // 15km trip => CO2 avoided > 0
    expect(data.co2_avoided_kg).toBeGreaterThan(0);
    expect(data.total_trips).toBeGreaterThanOrEqual(1);
    expect(typeof data.commute_streak).toBe('number');
  });
});

// ─────────────────────────────────────────────────────────────
// 4. Block & Reports
// ─────────────────────────────────────────────────────────────
describe('Trust Safety: Block & Reports', () => {
  test('POST /reports rejects self-report', async () => {
    const res = await request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ reported_id: passengerId, reason: 'harassment' })
      .expect(400);

    expect(res.body.error?.code).toBe('INVALID_TARGET');
  });

  test('POST /reports files report against user successfully', async () => {
    const res = await request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({
        reported_id: riderId,
        booking_id: completedBookingId,
        reason: 'unsafe_driving',
        details: 'Drove through a red light at Chandni Chowk.',
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.reason).toBe('unsafe_driving');
    expect(res.body.data.status).toBe('pending');
  });

  test('POST /users/:id/block blocks a user', async () => {
    const res = await request(app)
      .post(`/api/v1/users/${riderId}/block`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.blocked).toBe(true);
  });

  test('POST /search/rides excludes blocked rider from results', async () => {
    // Create an open trip by rider
    const openTripRes = await query<{ id: string }>(
      `INSERT INTO trips (
         rider_id, vehicle_id, origin_label, origin_lat, origin_lng,
         dest_label, dest_lat, dest_lng, route, distance_m, duration_s,
         depart_at, seats_total, seats_available, fare_set, fare_cap, status
       ) VALUES ($1, $2, 'Hinjewadi', 18.5912, 73.7386, 'Kothrud', 18.5074, 73.8077, ST_GeogFromText($3), 15000, 1800, NOW() + INTERVAL '1 hour', 3, 3, 90, 120, 'open')
       RETURNING id`,
      [riderId, vehicleId, ROUTE_WKT],
    );
    const openTripId = openTripRes.rows[0]!.id;

    // Search as passenger who blocked rider
    const searchRes = await request(app)
      .post('/api/v1/search/rides')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({
        pickup_lat: 18.5912,
        pickup_lng: 73.7386,
        dropoff_lat: 18.5074,
        dropoff_lng: 73.8077,
        departure_time: new Date(Date.now() + 3600_000).toISOString(),
      })
      .expect(200);

    const matches = searchRes.body.data;
    const foundRiderTrip = matches.some((m: { rider_id: string }) => m.rider_id === riderId);
    expect(foundRiderTrip).toBe(false);

    await query(`DELETE FROM trips WHERE id = $1`, [openTripId]);
  });

  test('DELETE /users/:id/block unblocks a user', async () => {
    const res = await request(app)
      .delete(`/api/v1/users/${riderId}/block`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.blocked).toBe(false);
  });

  test('GET /users/:id returns public profile without PII', async () => {
    const res = await request(app)
      .get(`/api/v1/users/${riderId}`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(riderId);
    expect(res.body.data.name).toBeDefined();
    expect(res.body.data.trust_score).toBeDefined();
    // Verify no email, upi_id, or password returned
    expect(res.body.data.email).toBeUndefined();
    expect(res.body.data.upi_id).toBeUndefined();
    expect(res.body.data.password_hash).toBeUndefined();
  });
});
