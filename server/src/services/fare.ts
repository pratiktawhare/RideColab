// ─────────────────────────────────────────────────────────────
// Fare Service — pure calculation logic + DB lookups
// Formula from implementation-plan.md § PHASE 6
//
// cost_per_km_low  = fuel_price / claimed_kmpl
// cost_per_km_high = fuel_price / (claimed_kmpl × RWF)   ← CAP
// EV: cost_per_km  = (kwh_per_100km / 100) × electricity_price
//
// fare_cap  = distance_km × cost_per_km_high   (per trip — rider limit)
// fare_low  = distance_km × cost_per_km_low  / (seats + 1)  (per pax)
// fare_high = distance_km × cost_per_km_high / (seats + 1)  (per pax)
// ─────────────────────────────────────────────────────────────
import { query } from '~/db/pool';
import { logger } from '~/utils/logger';

export interface FareBreakdown {
  fuel_type: string;
  fuel_price: number;       // ₹/L or ₹/kWh
  claimed_kmpl: number | null;
  kwh_per_100km: number | null;
  real_world_factor: number;
  distance_km: number;
  cost_per_km_low: number;
  cost_per_km_high: number;
}

export interface FareEstimate {
  low: number;              // per-passenger share at ARAI mileage
  high: number;             // per-passenger share at real-world mileage
  cap: number;              // max fare_set the rider can charge (total trip)
  breakdown: FareBreakdown;
}

export interface FareCap {
  cap: number;
  low: number;
  high: number;
  distance_m: number;
}

// ── Pure calculation — no DB calls ────────────────────────────
export function calculateFareFromParams(
  fuelPrice: number,
  fuelType: string,
  claimedKmpl: number | null,
  kwhPer100km: number | null,
  distanceM: number,
  seats: number,
  realWorldFactor: number,
): FareEstimate {
  const distanceKm = distanceM / 1000;

  let costPerKmLow: number;
  let costPerKmHigh: number;

  if (fuelType === 'electric' && kwhPer100km) {
    const costPerKm = (kwhPer100km / 100) * fuelPrice;
    costPerKmLow = costPerKm;
    costPerKmHigh = costPerKm; // EVs: real-world variance factored separately
  } else if (claimedKmpl) {
    costPerKmLow = fuelPrice / claimedKmpl;
    costPerKmHigh = fuelPrice / (claimedKmpl * realWorldFactor);
  } else {
    throw new Error('VEHICLE_MILEAGE_MISSING');
  }

  const totalLow = costPerKmLow * distanceKm;
  const totalHigh = costPerKmHigh * distanceKm;

  const cap = round2(totalHigh);
  const low = round2(totalLow / (seats + 1));
  const high = round2(totalHigh / (seats + 1));

  const breakdown: FareBreakdown = {
    fuel_type: fuelType,
    fuel_price: fuelPrice,
    claimed_kmpl: claimedKmpl,
    kwh_per_100km: kwhPer100km,
    real_world_factor: realWorldFactor,
    distance_km: round2(distanceKm),
    cost_per_km_low: round2(costPerKmLow),
    cost_per_km_high: round2(costPerKmHigh),
  };

  return { low, high, cap, breakdown };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── DB helper — get app_config value ─────────────────────────
export async function getConfig(key: string, defaultVal: string): Promise<string> {
  const res = await query<{ value: string }>(
    `SELECT value FROM app_config WHERE key = $1`,
    [key],
  );
  return res.rows[0]?.value ?? defaultVal;
}

// ── DB lookup — fare estimate for a user vehicle ──────────────
export async function estimateByVehicle(
  vehicleId: string,
  distanceM: number,
  seats: number,
): Promise<FareEstimate> {
  const vehicleRes = await query<{
    fuel_type: string;
    claimed_kmpl: string | null;
    kwh_per_100km: string | null;
  }>(
    `SELECT vc.fuel_type, vc.claimed_kmpl, vc.kwh_per_100km
     FROM vehicles v
     JOIN vehicle_catalog vc ON vc.id = v.catalog_id
     WHERE v.id = $1 AND v.is_active = true`,
    [vehicleId],
  );

  const vRow = vehicleRes.rows[0];
  if (!vRow) throw Object.assign(new Error('VEHICLE_NOT_FOUND'), { code: 'VEHICLE_NOT_FOUND' });

  const fuelRes = await query<{ price_per_unit: string }>(
    `SELECT price_per_unit FROM fuel_prices WHERE fuel_type = $1`,
    [vRow.fuel_type],
  );
  const fuelRow = fuelRes.rows[0];
  if (!fuelRow) throw Object.assign(new Error('FUEL_PRICE_NOT_FOUND'), { code: 'FUEL_PRICE_NOT_FOUND' });

  const rwf = parseFloat(await getConfig('fare.real_world_factor', '0.8'));

  return calculateFareFromParams(
    Number(fuelRow.price_per_unit),
    vRow.fuel_type,
    vRow.claimed_kmpl !== null ? Number(vRow.claimed_kmpl) : null,
    vRow.kwh_per_100km !== null ? Number(vRow.kwh_per_100km) : null,
    distanceM,
    seats,
    rwf,
  );
}

// ── DB lookup — fare estimate for a catalog vehicle (no user vehicle needed) ──
export async function estimateByCatalog(
  catalogId: string,
  distanceM: number,
  seats: number,
): Promise<FareEstimate> {
  const catRes = await query<{
    fuel_type: string;
    claimed_kmpl: string | null;
    kwh_per_100km: string | null;
  }>(
    `SELECT fuel_type, claimed_kmpl, kwh_per_100km
     FROM vehicle_catalog WHERE id = $1 AND is_active = true`,
    [catalogId],
  );

  const cRow = catRes.rows[0];
  if (!cRow) throw Object.assign(new Error('VEHICLE_NOT_FOUND'), { code: 'VEHICLE_NOT_FOUND' });

  const fuelRes = await query<{ price_per_unit: string }>(
    `SELECT price_per_unit FROM fuel_prices WHERE fuel_type = $1`,
    [cRow.fuel_type],
  );
  const fuelRow = fuelRes.rows[0];
  if (!fuelRow) throw Object.assign(new Error('FUEL_PRICE_NOT_FOUND'), { code: 'FUEL_PRICE_NOT_FOUND' });

  const rwf = parseFloat(await getConfig('fare.real_world_factor', '0.8'));

  return calculateFareFromParams(
    Number(fuelRow.price_per_unit),
    cRow.fuel_type,
    cRow.claimed_kmpl !== null ? Number(cRow.claimed_kmpl) : null,
    cRow.kwh_per_100km !== null ? Number(cRow.kwh_per_100km) : null,
    distanceM,
    seats,
    rwf,
  );
}

// ── DB — all current fuel prices ──────────────────────────────
export async function getFuelPrices() {
  const res = await query<{
    id: string;
    fuel_type: string;
    price_per_unit: string;
    unit: string;
    updated_at: string;
  }>(`SELECT id, fuel_type, price_per_unit, unit, updated_at FROM fuel_prices ORDER BY fuel_type`);
  return res.rows.map((r) => ({ ...r, price_per_unit: Number(r.price_per_unit) }));
}

// ── DB — update a fuel price (admin only) ────────────────────
export async function updateFuelPrice(id: string, price: number): Promise<{ id: string; fuel_type: string; price_per_unit: number }> {
  if (price <= 0) throw Object.assign(new Error('INVALID_PRICE'), { code: 'INVALID_PRICE' });
  const res = await query<{ id: string; fuel_type: string; price_per_unit: string }>(
    `UPDATE fuel_prices SET price_per_unit = $1 WHERE id = $2
     RETURNING id, fuel_type, price_per_unit`,
    [price, id],
  );
  const row = res.rows[0];
  if (!res.rowCount || !row) throw Object.assign(new Error('NOT_FOUND'), { code: 'NOT_FOUND' });
  logger.info({ id, price }, 'fuel price updated');
  return { id: row.id, fuel_type: row.fuel_type, price_per_unit: Number(row.price_per_unit) };
}

// ── Backwards compat — used by trips.ts ──────────────────────
export async function calculateFareCap(
  vehicleId: string,
  distanceM: number,
  seats: number,
): Promise<FareCap> {
  const est = await estimateByVehicle(vehicleId, distanceM, seats);
  return { cap: est.cap, low: est.low, high: est.high, distance_m: distanceM };
}
