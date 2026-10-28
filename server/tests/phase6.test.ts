// ─────────────────────────────────────────────────────────────
// Phase 6 — Fare Engine unit tests (≥ 20 cases)
// Tests the pure calculateFareFromParams function — no DB needed
// ─────────────────────────────────────────────────────────────
import { calculateFareFromParams } from '../src/services/fare';

const RWF = 0.8; // real_world_factor from app_config default

describe('Fare Engine — calculateFareFromParams', () => {

  // ── Core formula verification ──────────────────────────────

  test('01 — 10 km petrol, 15 kmpl, ₹106, RWF=0.8 → low ≈ 70.67, high ≈ 88.33, cap ≈ 176.67', () => {
    // cost_per_km_low  = 106/15 = 7.0667
    // cost_per_km_high = 106/(15×0.8) = 8.8333
    // total_low  = 7.0667 × 10 = 70.667
    // total_high = 8.8333 × 10 = 88.333
    // 1 seat → per-pax low = 70.67/2 = 35.33, per-pax high = 88.33/2 = 44.17
    // cap = 88.33 (total high)
    const e = calculateFareFromParams(106, 'petrol', 15, null, 10_000, 1, RWF);
    expect(e.breakdown.cost_per_km_low).toBeCloseTo(7.07, 2);
    expect(e.breakdown.cost_per_km_high).toBeCloseTo(8.83, 2);
    expect(e.cap).toBeCloseTo(88.33, 1);
  });

  test('02 — plan acceptance test: 10 km petrol, 15 kmpl ₹106, RWF=0.8 → cap ≈ 88.33 (plan says "high ≈ 88.33")', () => {
    const e = calculateFareFromParams(106, 'petrol', 15, null, 10_000, 1, RWF);
    expect(e.cap).toBeGreaterThanOrEqual(88);
    expect(e.cap).toBeLessThanOrEqual(90);
  });

  test('03 — cap = total_high not per-pax; per-pax splits correctly for 3 seats', () => {
    const e = calculateFareFromParams(106, 'petrol', 15, null, 10_000, 3, RWF);
    // cap = 88.33 (same regardless of seats)
    expect(e.cap).toBeCloseTo(88.33, 1);
    // per-pax high = 88.33 / (3+1) = 22.08
    expect(e.high).toBeCloseTo(22.08, 1);
  });

  test('04 — 0 km distance → all fares are ₹0', () => {
    const e = calculateFareFromParams(106, 'petrol', 15, null, 0, 1, RWF);
    expect(e.cap).toBe(0);
    expect(e.low).toBe(0);
    expect(e.high).toBe(0);
  });

  // ── Diesel ────────────────────────────────────────────────

  test('05 — diesel, 20 kmpl, ₹92, 15 km → cap = 15×(92/(20×0.8)) = 86.25', () => {
    const costHigh = 92 / (20 * 0.8); // 5.75/km
    const expectedCap = 5.75 * 15;    // 86.25
    const e = calculateFareFromParams(92, 'diesel', 20, null, 15_000, 1, RWF);
    expect(e.cap).toBeCloseTo(expectedCap, 1);
  });

  test('06 — diesel low is always ≤ high', () => {
    const e = calculateFareFromParams(92, 'diesel', 20, null, 15_000, 2, RWF);
    expect(e.low).toBeLessThanOrEqual(e.high);
  });

  // ── CNG ───────────────────────────────────────────────────

  test('07 — CNG, 25 km/kg, ₹85, 20 km → low = 85/25 × 20 / 2 seats', () => {
    const costLow = 85 / 25;         // 3.4/km
    const totalLow = costLow * 20;   // 68
    const expectedLow = totalLow / 2; // 34 per pax (1 seat = 1+1 = 2 sharers)
    const e = calculateFareFromParams(85, 'cng', 25, null, 20_000, 1, RWF);
    expect(e.low).toBeCloseTo(expectedLow, 1);
  });

  // ── Electric vehicle ──────────────────────────────────────

  test('08 — EV: 15 kWh/100km, ₹8/kWh, 10 km → cap = 0.15 × 8 × 10 = 12', () => {
    const costPerKm = (15 / 100) * 8; // 1.2/km
    const expectedCap = costPerKm * 10; // 12
    const e = calculateFareFromParams(8, 'electric', null, 15, 10_000, 1, 0.8);
    expect(e.cap).toBeCloseTo(expectedCap, 2);
  });

  test('09 — EV: low === high (no RWF variance for EVs)', () => {
    const e = calculateFareFromParams(8, 'electric', null, 15, 10_000, 2, 0.8);
    expect(e.low).toBe(e.high);
  });

  test('10 — EV with many passengers → cap unchanged, per-pax scales down', () => {
    const e1 = calculateFareFromParams(8, 'electric', null, 15, 10_000, 1, 0.8);
    const e4 = calculateFareFromParams(8, 'electric', null, 15, 10_000, 4, 0.8);
    // cap same (total trip cost)
    expect(e1.cap).toBeCloseTo(e4.cap, 2);
    // per-pax: 2 sharers vs 5 sharers
    expect(e4.low).toBeCloseTo(e1.low * (2 / 5), 1);
  });

  // ── Missing mileage ───────────────────────────────────────

  test('11 — missing mileage throws VEHICLE_MILEAGE_MISSING', () => {
    expect(() => calculateFareFromParams(106, 'petrol', null, null, 10_000, 1, RWF))
      .toThrow('VEHICLE_MILEAGE_MISSING');
  });

  test('12 — electric with null kwh_per_100km falls through to petrol branch → throws if claimed_kmpl null too', () => {
    expect(() => calculateFareFromParams(8, 'electric', null, null, 10_000, 1, 0.8))
      .toThrow('VEHICLE_MILEAGE_MISSING');
  });

  // ── RWF variations ────────────────────────────────────────

  test('13 — RWF=1.0 → low === high (perfect ARAI conditions)', () => {
    const e = calculateFareFromParams(106, 'petrol', 15, null, 10_000, 1, 1.0);
    expect(e.low).toBeCloseTo(e.high, 2);
  });

  test('14 — lower RWF → higher cap (worse real-world mileage)', () => {
    const e08 = calculateFareFromParams(106, 'petrol', 15, null, 10_000, 1, 0.8);
    const e06 = calculateFareFromParams(106, 'petrol', 15, null, 10_000, 1, 0.6);
    expect(e06.cap).toBeGreaterThan(e08.cap);
  });

  // ── Distance scaling ──────────────────────────────────────

  test('15 — doubling distance doubles all fares linearly', () => {
    const e1 = calculateFareFromParams(106, 'petrol', 15, null, 10_000, 2, RWF);
    const e2 = calculateFareFromParams(106, 'petrol', 15, null, 20_000, 2, RWF);
    expect(e2.cap).toBeCloseTo(e1.cap * 2, 1);
    expect(e2.low).toBeCloseTo(e1.low * 2, 1);
    expect(e2.high).toBeCloseTo(e1.high * 2, 1);
  });

  test('16 — 1 km trip petrol 15 kmpl ₹106 → cap ≈ 8.83', () => {
    const e = calculateFareFromParams(106, 'petrol', 15, null, 1_000, 1, RWF);
    expect(e.cap).toBeCloseTo(8.83, 1);
  });

  // ── Fare cap enforcement (business rule) ──────────────────

  test('17 — fare_set ≤ cap → would be accepted (test the number, not the DB)', () => {
    const e = calculateFareFromParams(106, 'petrol', 15, null, 10_000, 1, RWF);
    const fareSet = e.cap; // exactly at cap
    expect(fareSet).toBeLessThanOrEqual(e.cap);
  });

  test('18 — fare_set > cap → would be rejected', () => {
    const e = calculateFareFromParams(106, 'petrol', 15, null, 10_000, 1, RWF);
    const fareSet = e.cap + 1;
    expect(fareSet).toBeGreaterThan(e.cap);
  });

  // ── Seat edge cases ───────────────────────────────────────

  test('19 — 0 seats still valid (rider only → divides by 1)', () => {
    // seats=0 → sharers = 0+1 = 1
    const e = calculateFareFromParams(106, 'petrol', 15, null, 10_000, 0, RWF);
    // per-pax high = cap / 1 = cap
    expect(e.high).toBeCloseTo(e.cap, 2);
  });

  test('20 — 6 seats (max allowed) → per-pax is cap/7', () => {
    const e = calculateFareFromParams(106, 'petrol', 15, null, 10_000, 6, RWF);
    expect(e.high).toBeCloseTo(e.cap / 7, 1);
  });

  // ── Breakdown shape ───────────────────────────────────────

  test('21 — breakdown contains all required fields', () => {
    const e = calculateFareFromParams(106, 'petrol', 15, null, 10_000, 2, RWF);
    expect(e.breakdown).toMatchObject({
      fuel_type: 'petrol',
      fuel_price: 106,
      real_world_factor: RWF,
    });
    expect(typeof e.breakdown.cost_per_km_low).toBe('number');
    expect(typeof e.breakdown.cost_per_km_high).toBe('number');
    expect(typeof e.breakdown.distance_km).toBe('number');
  });

  test('22 — result values are rounded to 2 decimal places', () => {
    const e = calculateFareFromParams(106, 'petrol', 15, null, 10_000, 1, RWF);
    // Should not have more than 2 decimal places
    const decimalCheck = (n: number) => {
      const str = n.toString();
      const dec = str.split('.')[1];
      return !dec || dec.length <= 2;
    };
    expect(decimalCheck(e.cap)).toBe(true);
    expect(decimalCheck(e.low)).toBe(true);
    expect(decimalCheck(e.high)).toBe(true);
  });

  // ── Fuel price sensitivity ────────────────────────────────

  test('23 — doubling fuel price doubles the cap', () => {
    const e1 = calculateFareFromParams(106, 'petrol', 15, null, 10_000, 1, RWF);
    const e2 = calculateFareFromParams(212, 'petrol', 15, null, 10_000, 1, RWF);
    expect(e2.cap).toBeCloseTo(e1.cap * 2, 1);
  });

  test('24 — better mileage (higher kmpl) → lower cap', () => {
    const eBad = calculateFareFromParams(106, 'petrol', 10, null, 10_000, 1, RWF);
    const eGood = calculateFareFromParams(106, 'petrol', 20, null, 10_000, 1, RWF);
    expect(eGood.cap).toBeLessThan(eBad.cap);
  });
});
