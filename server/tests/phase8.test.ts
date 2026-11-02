/**
 * Phase 8 — Booking Flow Tests
 *
 * Verifies booking lifecycle, state machine, ride code verification,
 * AES-256-GCM chat encryption, cancellation streak tracking, and push token registration.
 */
import request from 'supertest';
import app from '../src/index';
import { query } from '../src/db/pool';

// ── Auth helpers ──────────────────────────────────────────────
async function loginAs(email: string, password = 'Demo@1234') {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return res.body.data?.access_token as string;
}

let riderToken: string;
let passengerToken: string;
let riderId: string;
let passengerId: string;
let vehicleId: string;
let testTripId: string;

const HINJEWADI = { lat: 18.5912, lng: 73.7386 };
const KOTHRUD   = { lat: 18.5074, lng: 73.8077 };
const ROUTE_WKT = `LINESTRING(73.7386 18.5912, 73.7868 18.5590, 73.8077 18.5074)`;

async function createTestTrip(seatsAvailable = 3): Promise<string> {
  const res = await query<{ id: string }>(
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
       NOW() + INTERVAL '2 hours', $8, $8,
       90.00, 120.00, 'open'
     ) RETURNING id`,
    [
      riderId, vehicleId,
      HINJEWADI.lat, HINJEWADI.lng,
      KOTHRUD.lat, KOTHRUD.lng,
      ROUTE_WKT, seatsAvailable,
    ],
  );
  return res.rows[0]!.id;
}

beforeAll(async () => {
  riderToken = await loginAs('rider@demo.ridecolab.dev');
  passengerToken = await loginAs('passenger@demo.ridecolab.dev');

  // Fetch IDs
  const riderMe = await request(app)
    .get('/api/v1/users/me')
    .set('Authorization', `Bearer ${riderToken}`);
  riderId = riderMe.body.data.id;

  const passMe = await request(app)
    .get('/api/v1/users/me')
    .set('Authorization', `Bearer ${passengerToken}`);
  passengerId = passMe.body.data.id;

  // Get or seed rider's vehicle
  const vRes = await request(app)
    .get('/api/v1/users/me/vehicles')
    .set('Authorization', `Bearer ${riderToken}`);
  vehicleId = vRes.body.data?.[0]?.id;
  if (!vehicleId) {
    const cRes = await request(app).get('/api/v1/catalog/vehicles?type=car');
    const catalogId = cRes.body.data?.[0]?.id;
    const addRes = await request(app)
      .post('/api/v1/users/me/vehicles')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ catalog_id: catalogId, plate_number: 'MH12PH8001' });
    vehicleId = addRes.body.data?.id;
  }

  testTripId = await createTestTrip();
});

afterAll(async () => {
  // Reset can_post_trips for rider in case streak test touched it
  if (riderId) {
    await query(`UPDATE users SET can_post_trips = true WHERE id = $1`, [riderId]);
  }
  // Clean up bookings made during tests
  await query(`DELETE FROM cancellation_events WHERE user_id IN ($1, $2)`, [riderId, passengerId]);
  await query(`DELETE FROM messages WHERE sender_id IN ($1, $2)`, [riderId, passengerId]);
  await query(`DELETE FROM bookings WHERE passenger_id = $1`, [passengerId]);
  await query(`DELETE FROM trips WHERE rider_id = $1`, [riderId]);
});

describe('Phase 8 — Booking Flow', () => {

  describe('POST /api/v1/bookings (Create Booking)', () => {
    it('rejects without auth token (401)', async () => {
      await request(app)
        .post('/api/v1/bookings')
        .send({ trip_id: testTripId, seats_booked: 1 })
        .expect(401);
    });

    it('rejects rider booking their own trip (400)', async () => {
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ trip_id: testTripId, seats_booked: 1 })
        .expect(400);

      expect(res.body.error.code).toBe('SELF_BOOKING');
    });

    it('rejects booking more seats than available (409)', async () => {
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ trip_id: testTripId, seats_booked: 6 })
        .expect(409);

      expect(res.body.error.code).toBe('INSUFFICIENT_SEATS');
    });

    it('successfully creates booking, decrements seats and computes fare share', async () => {
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          trip_id: testTripId,
          seats_booked: 1,
          pickup_label: 'Baner, Pune',
          dropoff_label: 'Kothrud, Pune',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('pending');
      expect(res.body.data.seats_booked).toBe(1);
      expect(Number(res.body.data.fare_share)).toBe(45); // 90 / (1 + 1) = 45

      // Check trip seats decremented from 3 to 2
      const tripRes = await query<{ seats_available: number }>(
        `SELECT seats_available FROM trips WHERE id = $1`,
        [testTripId],
      );
      expect(tripRes.rows[0]!.seats_available).toBe(2);
    });

    it('rejects duplicate pending booking for same trip (409)', async () => {
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ trip_id: testTripId, seats_booked: 1 })
        .expect(409);

      expect(res.body.error.code).toBe('DUPLICATE_BOOKING');
    });
  });

  describe('GET /api/v1/bookings/mine & /:id', () => {
    it('returns bookings for the passenger', async () => {
      const res = await request(app)
        .get('/api/v1/bookings/mine')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].trip_id).toBe(testTripId);
    });

    it('returns booking detail by id', async () => {
      const mineRes = await request(app)
        .get('/api/v1/bookings/mine')
        .set('Authorization', `Bearer ${passengerToken}`);
      const bookingId = mineRes.body.data[0].id;

      const res = await request(app)
        .get(`/api/v1/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(res.body.data.id).toBe(bookingId);
      expect(res.body.data.rider_name).toBeTruthy();
    });
  });

  describe('Booking Lifecycle: Accept -> Code -> Start -> Complete', () => {
    let activeBookingId: string;

    beforeAll(async () => {
      const mineRes = await request(app)
        .get('/api/v1/bookings/mine')
        .set('Authorization', `Bearer ${passengerToken}`);
      activeBookingId = mineRes.body.data[0].id;
    });

    it('rider accepts booking', async () => {
      const res = await request(app)
        .post(`/api/v1/bookings/${activeBookingId}/accept`)
        .set('Authorization', `Bearer ${riderToken}`)
        .expect(200);

      expect(res.body.data.status).toBe('accepted');
    });

    it('generates 6-character ride verification code', async () => {
      const res = await request(app)
        .post(`/api/v1/bookings/${activeBookingId}/ride-code`)
        .set('Authorization', `Bearer ${riderToken}`)
        .expect(200);

      expect(res.body.data.ride_code).toBeTruthy();
      expect(res.body.data.ride_code.length).toBe(6);
    });

    it('rejects start with incorrect code (400)', async () => {
      const res = await request(app)
        .post(`/api/v1/bookings/${activeBookingId}/start`)
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ ride_code: 'WRONG1' })
        .expect(400);

      expect(res.body.error.code).toBe('INVALID_RIDE_CODE');
    });

    it('starts ride with correct ride code', async () => {
      // Get the code
      const bRes = await request(app)
        .get(`/api/v1/bookings/${activeBookingId}`)
        .set('Authorization', `Bearer ${passengerToken}`);
      const code = bRes.body.data.ride_code;

      const res = await request(app)
        .post(`/api/v1/bookings/${activeBookingId}/start`)
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ ride_code: code })
        .expect(200);

      expect(res.body.data.status).toBe('started');
      expect(res.body.data.started_at).toBeTruthy();
    });

    it('completes the ride', async () => {
      const res = await request(app)
        .post(`/api/v1/bookings/${activeBookingId}/complete`)
        .set('Authorization', `Bearer ${riderToken}`)
        .expect(200);

      expect(res.body.data.status).toBe('completed');
      expect(res.body.data.completed_at).toBeTruthy();
    });
  });

  describe('Decline & Cancellation (Seat Restoration)', () => {
    it('declining a booking restores seats to the trip', async () => {
      const tripId = await createTestTrip(2);

      // Book 1 seat
      const bookRes = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ trip_id: tripId, seats_booked: 1 })
        .expect(201);

      const bookingId = bookRes.body.data.id;

      // Seats should be 1
      let trip = await query<{ seats_available: number }>(`SELECT seats_available FROM trips WHERE id = $1`, [tripId]);
      expect(trip.rows[0]!.seats_available).toBe(1);

      // Rider declines
      await request(app)
        .post(`/api/v1/bookings/${bookingId}/decline`)
        .set('Authorization', `Bearer ${riderToken}`)
        .expect(200);

      // Seats restored to 2
      trip = await query<{ seats_available: number }>(`SELECT seats_available FROM trips WHERE id = $1`, [tripId]);
      expect(trip.rows[0]!.seats_available).toBe(2);
    });

    it('cancelling a booking restores seats to the trip', async () => {
      const tripId = await createTestTrip(2);

      const bookRes = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ trip_id: tripId, seats_booked: 1 })
        .expect(201);

      const bookingId = bookRes.body.data.id;

      // Cancel
      await request(app)
        .post(`/api/v1/bookings/${bookingId}/cancel`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ reason: 'Change of plans' })
        .expect(200);

      const trip = await query<{ seats_available: number }>(`SELECT seats_available FROM trips WHERE id = $1`, [tripId]);
      expect(trip.rows[0]!.seats_available).toBe(2);
    });
  });

  describe('Chat Encryption (AES-256-GCM)', () => {
    let chatBookingId: string;

    beforeAll(async () => {
      const tripId = await createTestTrip(2);
      const bookRes = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ trip_id: tripId, seats_booked: 1 })
        .expect(201);
      chatBookingId = bookRes.body.data.id;
    });

    it('sends a chat message and returns plaintext in API response', async () => {
      const res = await request(app)
        .post(`/api/v1/bookings/${chatBookingId}/messages`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ body: 'Hello rider, I am waiting near the gate!' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.body).toBe('Hello rider, I am waiting near the gate!');
      expect(res.body.data.is_mine).toBe(true);
    });

    it('stores ciphertext in database — body is NOT human-readable plaintext', async () => {
      const dbRes = await query<{ body_encrypted: string; iv: string }>(
        `SELECT body_encrypted, iv FROM messages WHERE booking_id = $1`,
        [chatBookingId],
      );

      expect(dbRes.rows.length).toBeGreaterThan(0);
      const row = dbRes.rows[0]!;
      expect(row.body_encrypted).toBeTruthy();
      expect(row.iv).toBeTruthy();
      // Ensure plaintext is NOT found in the database column
      expect(row.body_encrypted).not.toContain('Hello rider');
      expect(row.body_encrypted).not.toContain('gate');
    });

    it('rider reads and decrypts message correctly via GET /messages', async () => {
      const res = await request(app)
        .get(`/api/v1/bookings/${chatBookingId}/messages`)
        .set('Authorization', `Bearer ${riderToken}`)
        .expect(200);

      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].body).toBe('Hello rider, I am waiting near the gate!');
      expect(res.body.data[0].is_mine).toBe(false);
    });
  });

  describe('Cancellation Streak & Suspension Enforcement', () => {
    it('suspends trip posting after 5 cancellations within 7 days', async () => {
      // Create 5 trips in parallel so (trip_id, passenger_id) remains unique
      const tripIds = await Promise.all(Array.from({ length: 5 }, () => createTestTrip(2)));

      // Seed 4 prior cancellations
      for (let i = 0; i < 4; i++) {
        const bRes = await query<{ id: string }>(
          `INSERT INTO bookings (
             trip_id, passenger_id, status, seats_booked,
             pickup_label, pickup_lat, pickup_lng,
             dropoff_label, dropoff_lat, dropoff_lng,
             fare_share
           ) VALUES ($1, $2, 'cancelled', 1, 'Hinjewadi', 18.5912, 73.7386, 'Kothrud', 18.5074, 73.8077, 45.00)
           RETURNING id`,
          [tripIds[i], passengerId],
        );
        await query(
          `INSERT INTO cancellation_events (user_id, booking_id, cancelled_at)
           VALUES ($1, $2, NOW())`,
          [riderId, bRes.rows[0]!.id],
        );
      }

      // Now create the 5th pending booking and cancel it via API to trigger streak suspension
      const bRes5 = await query<{ id: string }>(
        `INSERT INTO bookings (
           trip_id, passenger_id, status, seats_booked,
           pickup_label, pickup_lat, pickup_lng,
           dropoff_label, dropoff_lat, dropoff_lng,
           fare_share
         ) VALUES ($1, $2, 'pending', 1, 'Hinjewadi', 18.5912, 73.7386, 'Kothrud', 18.5074, 73.8077, 45.00)
         RETURNING id`,
        [tripIds[4], passengerId],
      );
      const bId5 = bRes5.rows[0]!.id;

      await request(app)
        .post(`/api/v1/bookings/${bId5}/cancel`)
        .set('Authorization', `Bearer ${riderToken}`)
        .expect(200);

      // Verify user's can_post_trips flag was updated to false
      const uRes = await query<{ can_post_trips: boolean }>(
        `SELECT can_post_trips FROM users WHERE id = $1`,
        [riderId],
      );
      expect(uRes.rows[0]!.can_post_trips).toBe(false);

      // Verify POST /trips returns 403 POSTING_SUSPENDED
      const tripAttempt = await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${riderToken}`)
        .send({
          origin_label: 'Hinjewadi, Pune',
          origin_lat: HINJEWADI.lat,
          origin_lng: HINJEWADI.lng,
          dest_label: 'Kothrud, Pune',
          dest_lat: KOTHRUD.lat,
          dest_lng: KOTHRUD.lng,
          depart_at: new Date(Date.now() + 3600_000).toISOString(),
          seats_total: 3,
          fare_set: 60,
          vehicle_id: vehicleId,
        });

      expect(tripAttempt.status).toBe(403);
      expect(tripAttempt.body.error.code).toBe('POSTING_SUSPENDED');

      // Restore can_post_trips
      await query(`UPDATE users SET can_post_trips = true WHERE id = $1`, [riderId]);
    }, 30000);
  });

  describe('POST /api/v1/bookings/push-token', () => {
    it('registers Expo push token', async () => {
      const res = await request(app)
        .post('/api/v1/bookings/push-token')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ push_token: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.registered).toBe(true);

      // Verify in DB
      const nRes = await query<{ push_token: string }>(
        `SELECT push_token FROM notifications WHERE user_id = $1`,
        [passengerId],
      );
      expect(nRes.rows[0]?.push_token).toBe('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]');
    });
  });
});

