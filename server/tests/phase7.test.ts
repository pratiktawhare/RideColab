/**
 * Phase 7 — Matching Engine Tests
 *
 * Verifies PostGIS corridor search, scoring, filters, smart pickup, and timing.
 */
import request from 'supertest';
import app from '../src/index';
import { query, withTransaction } from '../src/db/pool';

// ── Auth helpers ──────────────────────────────────────────────────────────────
async function loginAs(email: string, password = 'Demo@1234') {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return res.body.data?.access_token as string;
}

// Pune coordinates — Hinjewadi → Kothrud corridor
const HINJEWADI  = { lat: 18.5912, lng: 73.7386 };
const KOTHRUD    = { lat: 18.5074, lng: 73.8077 };
const BANER      = { lat: 18.5590, lng: 73.7868 };  // on corridor
const SHIVAJINAGAR = { lat: 18.5308, lng: 73.8474 }; // off corridor (east)

// A route that roughly covers Hinjewadi → Baner → Kothrud
// Using a simple 3-point LineString for test seeding
const ROUTE_WKT = `LINESTRING(73.7386 18.5912, 73.7868 18.5590, 73.8077 18.5074)`;

let riderToken: string;
let passengerToken: string;
let seededTripIds: string[] = [];
let vehicleId: string;

beforeAll(async () => {
  riderToken    = await loginAs('rider@demo.ridecolab.dev');
  passengerToken = await loginAs('passenger@demo.ridecolab.dev');

  // Get rider's vehicle
  const vRes = await request(app)
    .get('/api/v1/users/me/vehicles')
    .set('Authorization', `Bearer ${riderToken}`);
  vehicleId = vRes.body.data?.[0]?.id;
  if (!vehicleId) {
    // Create one if missing
    const cRes = await request(app)
      .get('/api/v1/catalog/vehicles?type=car')
      .expect(200);
    const catalogId = cRes.body.data?.[0]?.id;
    const addRes = await request(app)
      .post('/api/v1/users/me/vehicles')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ catalog_id: catalogId, plate_number: 'MH12AB1234' });
    vehicleId = addRes.body.data?.id;
  }
});

// ── Seed helper ───────────────────────────────────────────────────────────────
async function seedTrip(overrides: {
  departure_time?: string;
  origin_lat?: number; origin_lng?: number;
  dest_lat?: number; dest_lng?: number;
  seats?: number;
  is_women_only?: boolean;
  fare_set?: number; fare_cap?: number;
} = {}) {
  const depTime = overrides.departure_time ?? new Date(Date.now() + 60 * 60_000).toISOString();
  const oLat = overrides.origin_lat ?? HINJEWADI.lat;
  const oLng = overrides.origin_lng ?? HINJEWADI.lng;
  const dLat = overrides.dest_lat   ?? KOTHRUD.lat;
  const dLng = overrides.dest_lng   ?? KOTHRUD.lng;

  // Insert directly with PostGIS route so PostGIS can do corridor search
  const res = await query<{ id: string }>(
    `INSERT INTO trips (
      rider_id, vehicle_id,
      origin_label, origin_lat, origin_lng,
      dest_label, dest_lat, dest_lng,
      route,
      depart_at, seats_total, seats_available,
      fare_cap, fare_set, is_women_only, status
    ) VALUES (
      (SELECT id FROM users WHERE email = 'rider@demo.ridecolab.dev'),
      $1,
      'Hinjewadi', $2, $3,
      'Kothrud', $4, $5,
      ST_GeomFromText($6, 4326)::geography,
      $7, $8, $8, $9, $10, $11, 'open'
    ) RETURNING id`,
    [
      vehicleId,
      oLat, oLng, dLat, dLng,
      ROUTE_WKT,
      depTime,
      overrides.seats ?? 2,
      overrides.fare_cap ?? 80,
      overrides.fare_set ?? 70,
      overrides.is_women_only ?? false,
    ],
  );
  const id = res.rows[0]!.id as string;
  seededTripIds.push(id);
  return id;
}

afterAll(async () => {
  if (seededTripIds.length) {
    await query(
      `DELETE FROM trips WHERE id = ANY($1::uuid[])`,
      [seededTripIds],
    );
  }
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Phase 7 — Matching Engine', () => {

  describe('POST /api/v1/search/rides — auth', () => {
    it('requires JWT', async () => {
      await request(app)
        .post('/api/v1/search/rides')
        .send({ pickup_lat: HINJEWADI.lat, pickup_lng: HINJEWADI.lng,
                dropoff_lat: KOTHRUD.lat, dropoff_lng: KOTHRUD.lng,
                departure_time: new Date(Date.now() + 3600_000).toISOString() })
        .expect(401);
    });

    it('rejects missing fields', async () => {
      await request(app)
        .post('/api/v1/search/rides')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ pickup_lat: HINJEWADI.lat })
        .expect(400);
    });
  });

  describe('Basic corridor search', () => {
    let tripId: string;

    beforeAll(async () => {
      tripId = await seedTrip();
    });

    it('returns ≥ 1 match for Hinjewadi → Kothrud', async () => {
      const res = await request(app)
        .post('/api/v1/search/rides')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          pickup_lat:     BANER.lat,
          pickup_lng:     BANER.lng,
          dropoff_lat:    KOTHRUD.lat,
          dropoff_lng:    KOTHRUD.lng,
          departure_time: new Date(Date.now() + 60 * 60_000).toISOString(),
          seats: 1,
          radius_m: 1000,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('result has required fields', async () => {
      const res = await request(app)
        .post('/api/v1/search/rides')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          pickup_lat: BANER.lat, pickup_lng: BANER.lng,
          dropoff_lat: KOTHRUD.lat, dropoff_lng: KOTHRUD.lng,
          departure_time: new Date(Date.now() + 60 * 60_000).toISOString(),
          radius_m: 1000,
        })
        .expect(200);

      const match = res.body.data[0];
      expect(match).toHaveProperty('trip_id');
      expect(match).toHaveProperty('rider_name');
      expect(match).toHaveProperty('trust_score');
      expect(match).toHaveProperty('smart_pickup');
      expect(match).toHaveProperty('score');
      expect(match).toHaveProperty('score_breakdown');
      expect(match.smart_pickup).toHaveProperty('lat');
      expect(match.smart_pickup).toHaveProperty('lng');
    });

    it('score is between 0 and 1', async () => {
      const res = await request(app)
        .post('/api/v1/search/rides')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          pickup_lat: BANER.lat, pickup_lng: BANER.lng,
          dropoff_lat: KOTHRUD.lat, dropoff_lng: KOTHRUD.lng,
          departure_time: new Date(Date.now() + 60 * 60_000).toISOString(),
          radius_m: 1000,
        })
        .expect(200);

      for (const match of res.body.data) {
        expect(match.score).toBeGreaterThanOrEqual(0);
        expect(match.score).toBeLessThanOrEqual(1);
      }
    });

    it('results sorted by score descending', async () => {
      const res = await request(app)
        .post('/api/v1/search/rides')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          pickup_lat: BANER.lat, pickup_lng: BANER.lng,
          dropoff_lat: KOTHRUD.lat, dropoff_lng: KOTHRUD.lng,
          departure_time: new Date(Date.now() + 60 * 60_000).toISOString(),
          radius_m: 1000,
        })
        .expect(200);

      const scores: number[] = res.body.data.map((m: { score: number }) => m.score);
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]!).toBeLessThanOrEqual(scores[i - 1]!);
      }
    });
  });

  describe('Out-of-order trip exclusion', () => {
    it('does not return trip where pickup is AFTER dropoff on route', async () => {
      // Search in reversed direction — Kothrud pickup, Hinjewadi dropoff
      // Our seeded trips go Hinjewadi→Kothrud, so reversed search should return 0
      const res = await request(app)
        .post('/api/v1/search/rides')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          pickup_lat:  KOTHRUD.lat,
          pickup_lng:  KOTHRUD.lng,
          dropoff_lat: HINJEWADI.lat,
          dropoff_lng: HINJEWADI.lng,
          departure_time: new Date(Date.now() + 60 * 60_000).toISOString(),
          radius_m: 1000,
        })
        .expect(200);

      expect(res.body.data.length).toBe(0);
    });
  });

  describe('Women-only filter', () => {
    beforeAll(async () => {
      await seedTrip({ is_women_only: true });
    });

    it('women_only=true returns only women-only trips', async () => {
      const res = await request(app)
        .post('/api/v1/search/rides')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          pickup_lat: BANER.lat, pickup_lng: BANER.lng,
          dropoff_lat: KOTHRUD.lat, dropoff_lng: KOTHRUD.lng,
          departure_time: new Date(Date.now() + 60 * 60_000).toISOString(),
          radius_m: 1000,
          women_only: true,
        })
        .expect(200);

      for (const match of res.body.data) {
        expect(match.is_women_only).toBe(true);
      }
    });

    it('women_only=false returns all trips', async () => {
      const res = await request(app)
        .post('/api/v1/search/rides')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          pickup_lat: BANER.lat, pickup_lng: BANER.lng,
          dropoff_lat: KOTHRUD.lat, dropoff_lng: KOTHRUD.lng,
          departure_time: new Date(Date.now() + 60 * 60_000).toISOString(),
          radius_m: 1000,
          women_only: false,
        })
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Departure time window', () => {
    it('excludes trips outside ±30 min window', async () => {
      // Seed trip 3 hours in the future
      await seedTrip({ departure_time: new Date(Date.now() + 3 * 3600_000).toISOString() });

      // Search for now + 1h window → should not include trip 3h away
      const res = await request(app)
        .post('/api/v1/search/rides')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          pickup_lat: BANER.lat, pickup_lng: BANER.lng,
          dropoff_lat: KOTHRUD.lat, dropoff_lng: KOTHRUD.lng,
          departure_time: new Date(Date.now() + 60 * 60_000).toISOString(),
          radius_m: 1000,
        })
        .expect(200);

      for (const match of res.body.data) {
        const dep = new Date(match.departure_time).getTime();
        const req = Date.now() + 60 * 60_000;
        expect(Math.abs(dep - req)).toBeLessThanOrEqual(30 * 60_000 + 60_000); // 31 min tolerance
      }
    });
  });

  describe('Seats filter', () => {
    it('excludes trips with fewer available seats than requested', async () => {
      await seedTrip({ seats: 1 }); // only 1 seat available

      const res = await request(app)
        .post('/api/v1/search/rides')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          pickup_lat: BANER.lat, pickup_lng: BANER.lng,
          dropoff_lat: KOTHRUD.lat, dropoff_lng: KOTHRUD.lng,
          departure_time: new Date(Date.now() + 60 * 60_000).toISOString(),
          radius_m: 1000,
          seats: 2,
        })
        .expect(200);

      for (const match of res.body.data) {
        expect(match.seats_available).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('Cancelled trips excluded', () => {
    it('cancelled trip not returned', async () => {
      const tripId = await seedTrip();
      // Cancel it
      await query(`UPDATE trips SET status='cancelled' WHERE id=$1`, [tripId]);

      const res = await request(app)
        .post('/api/v1/search/rides')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          pickup_lat: BANER.lat, pickup_lng: BANER.lng,
          dropoff_lat: KOTHRUD.lat, dropoff_lng: KOTHRUD.lng,
          departure_time: new Date(Date.now() + 60 * 60_000).toISOString(),
          radius_m: 1000,
        })
        .expect(200);

      const ids = res.body.data.map((m: { trip_id: string }) => m.trip_id);
      expect(ids).not.toContain(tripId);
    });
  });

  describe('Smart pickup point', () => {
    it('smart_pickup lat/lng is on or near the route', async () => {
      const res = await request(app)
        .post('/api/v1/search/rides')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          pickup_lat: BANER.lat, pickup_lng: BANER.lng,
          dropoff_lat: KOTHRUD.lat, dropoff_lng: KOTHRUD.lng,
          departure_time: new Date(Date.now() + 60 * 60_000).toISOString(),
          radius_m: 1000,
        })
        .expect(200);

      if (res.body.data.length === 0) return;
      const match = res.body.data[0];
      const { lat, lng } = match.smart_pickup;

      // Verify via PostGIS that the snapped point is on the route
      const verify = await query<{ on_route: boolean }>(
        `SELECT ST_DWithin(
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
          (SELECT route::geography FROM trips WHERE id = $3),
          50
        ) AS on_route`,
        [lng, lat, match.trip_id],
      );
      expect(verify.rows[0]!.on_route).toBe(true);
    });
  });

  describe('Configurable ranking weights', () => {
    it('hot-reloading ranking_weights.json updates current weights', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const weightsPath = path.resolve(__dirname, '../src/data/ranking_weights.json');
      const original = fs.readFileSync(weightsPath, 'utf8');

      try {
        const modified = JSON.stringify({
          route_overlap: 0.10,
          time_fit: 0.10,
          detour: 0.10,
          trust: 0.60,
          preferences: 0.10,
        });

        fs.writeFileSync(weightsPath, modified, 'utf8');
        // Give fs.watch a moment to trigger
        await new Promise((resolve) => setTimeout(resolve, 200));

        const { currentWeights } = await import('../src/services/matching');
        expect(currentWeights().trust).toBe(0.60);
      } finally {
        fs.writeFileSync(weightsPath, original, 'utf8');
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    });
  });

  describe('Performance', () => {
    it('returns in < 2 s even with 20 seeded trips', async () => {
      // Seed 15 more trips for a total of ~20
      await Promise.all(Array.from({ length: 15 }, () => seedTrip()));

      const start = Date.now();
      await request(app)
        .post('/api/v1/search/rides')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          pickup_lat: BANER.lat, pickup_lng: BANER.lng,
          dropoff_lat: KOTHRUD.lat, dropoff_lng: KOTHRUD.lng,
          departure_time: new Date(Date.now() + 60 * 60_000).toISOString(),
          radius_m: 1000,
        })
        .expect(200);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(2000);
    }, 10_000);
  });
});
