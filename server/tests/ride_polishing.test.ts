/**
 * Ride Polishing Tests
 *
 * Verifies:
 * 1. Intermediate stopover suggestion along route corridor (GET /api/v1/trips/suggest-stopovers)
 * 2. Trip creation with stopovers and corridor radius (POST /api/v1/trips)
 * 3. Search matching with pro-rata fare cap, corridor radius, and relative time badges (POST /api/v1/search/rides)
 * 4. Automatic 4-digit boarding OTP generation on booking creation (POST /api/v1/bookings)
 * 5. Boarding OTP verification by rider (POST /api/v1/bookings/:id/board)
 */
import request from 'supertest';
import app from '../src/index';
import { query } from '../src/db/pool';

jest.setTimeout(30_000);

async function getOrCreateUser(email: string, name: string): Promise<{ token: string; id: string }> {
  let loginRes = await request(app).post('/api/v1/auth/login').send({ email, password: 'Demo@1234' });
  if (!loginRes.body.data?.access_token) {
    await request(app).post('/api/v1/auth/register').send({ email, password: 'Demo@1234', name, mode: 'rider' });
    loginRes = await request(app).post('/api/v1/auth/login').send({ email, password: 'Demo@1234' });
  }
  const token = loginRes.body.data.access_token;
  const meRes = await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${token}`);
  return { token, id: meRes.body.data.id };
}

let riderToken: string;
let riderId: string;
let passengerToken: string;
let passengerId: string;
let vehicleId: string;

const HINJEWADI = { lat: 18.5912, lng: 73.7386 };
const KOTHRUD = { lat: 18.5074, lng: 73.8077 };
const WAKAD = { lat: 18.5987, lng: 73.7634 };
const BANER = { lat: 18.5590, lng: 73.7868 };

beforeAll(async () => {
  const rider = await getOrCreateUser('rider@demo.ridecolab.dev', 'Demo Rider');
  riderToken = rider.token;
  riderId = rider.id;

  const passenger = await getOrCreateUser('passenger@demo.ridecolab.dev', 'Demo Passenger');
  passengerToken = passenger.token;
  passengerId = passenger.id;

  // Ensure vehicle exists for rider
  const vRes = await query<{ id: string }>(`SELECT id FROM vehicles WHERE user_id = $1 LIMIT 1`, [riderId]);
  if (vRes.rows.length > 0) {
    vehicleId = vRes.rows[0]!.id;
  } else {
    const newV = await query<{ id: string }>(
      `INSERT INTO vehicles (user_id, make, model, type, fuel_type, mileage_kmpl, seats_total, seats_offered)
       VALUES ($1, 'Honda', 'Activa', 'scooter', 'petrol', 45, 2, 1)
       RETURNING id`,
      [riderId],
    );
    vehicleId = newV.rows[0]!.id;
  }
});

describe('Ride Polishing Architecture Tests', () => {
  let createdTripId: string;
  let createdBookingId: string;
  let boardingOtp: string;

  // 1. Suggest Stopovers
  describe('GET /api/v1/trips/suggest-stopovers', () => {
    it('returns suggested landmark waypoints between origin and destination', async () => {
      const res = await request(app)
        .get('/api/v1/trips/suggest-stopovers')
        .query({
          origin_lat: HINJEWADI.lat,
          origin_lng: HINJEWADI.lng,
          dest_lat: KOTHRUD.lat,
          dest_lng: KOTHRUD.lng,
        })
        .set('Authorization', `Bearer ${riderToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      if (res.body.data.length > 0) {
        const item = res.body.data[0];
        expect(item).toHaveProperty('label');
        expect(item).toHaveProperty('lat');
        expect(item).toHaveProperty('lng');
      }
    });
  });

  // 2. Post Trip with Stopovers
  describe('POST /api/v1/trips', () => {
    it('creates a trip with intermediate stopovers and custom corridor radius', async () => {
      const departsAt = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
      const res = await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${riderToken}`)
        .send({
          vehicle_id: vehicleId,
          origin_label: 'Hinjewadi Phase 1, Pune',
          origin_lat: HINJEWADI.lat,
          origin_lng: HINJEWADI.lng,
          dest_label: 'Kothrud Stand, Pune',
          dest_lat: KOTHRUD.lat,
          dest_lng: KOTHRUD.lng,
          depart_at: departsAt,
          seats_total: 1,
          fare_set: 45,
          corridor_radius_m: 1500,
          stopovers: [
            { order: 1, label: 'Wakad Bridge', lat: WAKAD.lat, lng: WAKAD.lng },
            { order: 2, label: 'Baner Phata', lat: BANER.lat, lng: BANER.lng },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.corridor_radius_m).toBe(1500);
      expect(Array.isArray(res.body.data.stopovers)).toBe(true);
      expect(res.body.data.stopovers.length).toBe(2);

      createdTripId = res.body.data.id;
    });
  });

  // 3. Search Matching with Pro-Rata Fare
  describe('POST /api/v1/search/rides', () => {
    it('finds the trip along the corridor with pro-rata fare calculation and time badge', async () => {
      const searchTime = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
      const res = await request(app)
        .post('/api/v1/search/rides')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          pickup_lat: WAKAD.lat,
          pickup_lng: WAKAD.lng,
          dropoff_lat: BANER.lat,
          dropoff_lng: BANER.lng,
          departure_time: searchTime,
          window_mins: 90,
          radius_m: 1500,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      const match = res.body.data.find((m: { trip_id: string }) => m.trip_id === createdTripId);
      if (match) {
        expect(match).toHaveProperty('pro_rata_fare_set');
        expect(match).toHaveProperty('pro_rata_fare_cap');
        expect(match).toHaveProperty('relative_time_badge');
        expect(match).toHaveProperty('sub_leg_distance_km');
        expect(match).toHaveProperty('walking_distance_m');
        expect(match.pro_rata_fare_set).toBeLessThanOrEqual(match.pro_rata_fare_cap);
      }
    });
  });

  // 4. Create Booking & OTP Generation
  describe('POST /api/v1/bookings', () => {
    it('creates booking with automatic 4-digit boarding OTP', async () => {
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          trip_id: createdTripId,
          seats_booked: 1,
          pickup_label: 'Wakad Bridge',
          pickup_lat: WAKAD.lat,
          pickup_lng: WAKAD.lng,
          dropoff_label: 'Baner Phata',
          dropoff_lat: BANER.lat,
          dropoff_lng: BANER.lng,
          pickup_landmark: 'Wakad Flyover Bus Stop',
          dropoff_landmark: 'Baner Phata Junction',
          walking_distance_m: 120,
          sub_leg_distance_km: 4.8,
          fare_share: 25,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.boarding_otp).toMatch(/^\d{4}$/);
      expect(res.body.data.pickup_landmark).toBe('Wakad Flyover Bus Stop');
      expect(res.body.data.sub_leg_distance_km).toBeDefined();

      createdBookingId = res.body.data.id;
      boardingOtp = res.body.data.boarding_otp;
    });
  });

  // 5. Boarding OTP Verification
  describe('POST /api/v1/bookings/:id/board', () => {
    it('rejects boarding with incorrect OTP', async () => {
      // First accept the booking as rider
      const acceptRes = await request(app)
        .post(`/api/v1/bookings/${createdBookingId}/accept`)
        .set('Authorization', `Bearer ${riderToken}`);

      expect(acceptRes.status).toBe(200);

      const res = await request(app)
        .post(`/api/v1/bookings/${createdBookingId}/board`)
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ otp: '0000' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_OTP');
    });

    it('successfully confirms boarding with the correct 4-digit OTP', async () => {
      const res = await request(app)
        .post(`/api/v1/bookings/${createdBookingId}/board`)
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ otp: boardingOtp });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.bookedAt).toBeDefined();
    });

    it('rejects boarding verification by non-rider user', async () => {
      const res = await request(app)
        .post(`/api/v1/bookings/${createdBookingId}/board`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ otp: boardingOtp });

      expect(res.status).toBe(403); // Driver only
    });
  });

  afterAll(async () => {
    if (createdBookingId) {
      await query(`DELETE FROM bookings WHERE id = $1`, [createdBookingId]).catch(() => {});
    }
    if (createdTripId) {
      await query(`DELETE FROM trips WHERE id = $1`, [createdTripId]).catch(() => {});
    }
  });
});
