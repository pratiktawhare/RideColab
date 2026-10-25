// ─────────────────────────────────────────────────────────────
// Trip service — fare cap calculation + weekly limit logic
// ─────────────────────────────────────────────────────────────
import { query, withTransaction } from '~/db/pool';
import { logger } from '~/utils/logger';

export interface FareCap {
  cap: number;       // Maximum fare_set allowed (₹)
  low: number;       // Minimum realistic share (₹)
  high: number;      // Maximum realistic share = cap (₹)
  distance_m: number;
}

// ── Get a config value from app_config ────────────────────────
async function getConfig(key: string, defaultVal: string): Promise<string> {
  const res = await query<{ value: string }>(
    `SELECT value FROM app_config WHERE key = $1`,
    [key],
  );
  return res.rows[0]?.value ?? defaultVal;
}

// ── Calculate fare cap for a given vehicle + route ────────────
export async function calculateFareCap(
  vehicleId: string,
  distanceM: number,
  seats: number,
): Promise<FareCap> {
  const distanceKm = distanceM / 1000;

  // Fetch vehicle catalog details
  const vehicleRes = await query<{
    fuel_type: string;
    claimed_kmpl: number | null;
    kwh_per_100km: number | null;
  }>(
    `SELECT vc.fuel_type, vc.claimed_kmpl, vc.kwh_per_100km
     FROM vehicles v
     JOIN vehicle_catalog vc ON vc.id = v.catalog_id
     WHERE v.id = $1 AND v.is_active = true`,
    [vehicleId],
  );

  const vehicleRow = vehicleRes.rows[0];
  if (!vehicleRow) {
    throw new Error('VEHICLE_NOT_FOUND');
  }

  const { fuel_type, claimed_kmpl, kwh_per_100km } = vehicleRow;

  // Fetch current fuel price
  const fuelRes = await query<{ price_per_unit: number }>(
    `SELECT price_per_unit FROM fuel_prices WHERE fuel_type = $1`,
    [fuel_type],
  );

  const fuelRow = fuelRes.rows[0];
  if (!fuelRow) {
    throw new Error('FUEL_PRICE_NOT_FOUND');
  }

  const price = Number(fuelRow.price_per_unit);
  const rwf = parseFloat(await getConfig('fare.real_world_factor', '0.8'));

  let costPerKmLow: number;
  let costPerKmHigh: number;

  if (fuel_type === 'electric' && kwh_per_100km) {
    // EVs: cost = (kWh/100km / 100) × price_per_kWh
    const costPerKm = (Number(kwh_per_100km) / 100) * price;
    costPerKmLow = costPerKm;
    costPerKmHigh = costPerKm; // EVs: no RWF variance, they're already real-world
  } else if (claimed_kmpl) {
    // ICE vehicles
    costPerKmLow = price / Number(claimed_kmpl);
    costPerKmHigh = price / (Number(claimed_kmpl) * rwf); // Higher cost = real world
  } else {
    throw new Error('VEHICLE_MILEAGE_MISSING');
  }

  const totalCostLow = costPerKmLow * distanceKm;
  const totalCostHigh = costPerKmHigh * distanceKm;

  // Fare cap = total trip cost at real-world mileage
  // fare_set represents total trip cost; passengers pay fare_set / (seats + 1)
  // We cap fare_set at totalCostHigh so rider doesn't profit
  const cap = Math.round(totalCostHigh * 100) / 100;
  const low = Math.round((totalCostLow / (seats + 1)) * 100) / 100;
  const high = Math.round((totalCostHigh / (seats + 1)) * 100) / 100;

  return { cap, low, high, distance_m: distanceM };
}

// ── Check weekly trip limit ────────────────────────────────────
export async function checkWeeklyLimit(riderId: string): Promise<void> {
  const limitStr = await getConfig('trip.weekly_limit', '14');
  const limit = parseInt(limitStr, 10);

  // Materialise reset if cron missed (Render sleep mitigation)
  await query(
    `UPDATE users
     SET weekly_trips_used = 0,
         weekly_reset_at = date_trunc('week', NOW()) + INTERVAL '7 days'
     WHERE id = $1 AND weekly_reset_at <= NOW()`,
    [riderId],
  );

  const res = await query<{ weekly_trips_used: number }>(
    `SELECT weekly_trips_used FROM users WHERE id = $1`,
    [riderId],
  );

  const used = res.rows[0]?.weekly_trips_used ?? 0;
  if (used >= limit) {
    const err = new Error(`WEEKLY_LIMIT_EXCEEDED`);
    err.name = 'WEEKLY_LIMIT_EXCEEDED';
    throw err;
  }
}

// ── Increment weekly trip counter ─────────────────────────────
export async function incrementWeeklyTrips(
  riderId: string,
  client?: import('pg').PoolClient,
): Promise<void> {
  const q = client
    ? (text: string, params: unknown[]) => client.query(text, params)
    : (text: string, params: unknown[]) => query(text, params);

  await q(
    `UPDATE users SET weekly_trips_used = weekly_trips_used + 1 WHERE id = $1`,
    [riderId],
  );
}

// ── Materialise recurring trips for next N days ───────────────
export async function materialiseRecurringTrips(days = 7): Promise<number> {
  // Find parent trips with rrule set and is_recurring = true
  const parents = await query<{
    id: string;
    rider_id: string;
    vehicle_id: string | null;
    origin_label: string;
    origin_lat: number;
    origin_lng: number;
    dest_label: string;
    dest_lat: number;
    dest_lng: number;
    route: string | null;
    distance_m: number | null;
    duration_s: number | null;
    seats_total: number;
    seats_available: number;
    fare_set: number;
    fare_cap: number;
    community_id: string | null;
    notes: string | null;
    depart_at: Date;
    rrule: string;
  }>(
    `SELECT t.*
     FROM trips t
     WHERE t.is_recurring = true
       AND t.rrule IS NOT NULL
       AND t.parent_trip_id IS NULL
       AND t.status != 'cancelled'`,
  );

  let created = 0;

  for (const parent of parents.rows) {
    // Simple daily weekday materialisation
    // A full RRULE parser would be rrule.js; for now we do simple MON-FRI logic
    const now = new Date();
    for (let d = 1; d <= days; d++) {
      const target = new Date(now);
      target.setDate(now.getDate() + d);
      // Skip weekends for simplest case (Mon=1, Fri=5)
      const dow = target.getDay();
      if (dow === 0 || dow === 6) continue;

      // Set departure time from parent
      const parentDepart = new Date(parent.depart_at);
      target.setHours(parentDepart.getHours(), parentDepart.getMinutes(), 0, 0);

      // Check if child already exists for this date
      const exists = await query(
        `SELECT id FROM trips WHERE parent_trip_id = $1 AND DATE(depart_at) = DATE($2)`,
        [parent.id, target.toISOString()],
      );
      if (exists.rows.length > 0) continue;

      // Create child trip
      await query(
        `INSERT INTO trips (
          rider_id, vehicle_id, origin_label, origin_lat, origin_lng,
          dest_label, dest_lat, dest_lng, route, distance_m, duration_s,
          depart_at, seats_total, seats_available, fare_set, fare_cap,
          status, community_id, is_recurring, parent_trip_id, notes
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,
          $9::geography,$10,$11,$12,$13,$14,$15,$16,
          'open',$17,false,$18,$19
        )`,
        [
          parent.rider_id,
          parent.vehicle_id,
          parent.origin_label,
          Number(parent.origin_lat),
          Number(parent.origin_lng),
          parent.dest_label,
          Number(parent.dest_lat),
          Number(parent.dest_lng),
          parent.route,
          parent.distance_m,
          parent.duration_s,
          target.toISOString(),
          parent.seats_total,
          parent.seats_available,
          Number(parent.fare_set),
          Number(parent.fare_cap),
          parent.community_id,
          parent.id,
          parent.notes,
        ],
      );
      created++;
    }
  }

  logger.info({ created }, 'recurring trips materialised');
  return created;
}

// ── Reset weekly counters (called by cron every Monday) ───────
export async function resetWeeklyCounters(): Promise<void> {
  const res = await query(
    `UPDATE users
     SET weekly_trips_used = 0,
         weekly_reset_at = date_trunc('week', NOW()) + INTERVAL '7 days'
     WHERE weekly_reset_at <= NOW()`,
  );
  logger.info({ updated: res.rowCount }, 'weekly trip counters reset');
}
