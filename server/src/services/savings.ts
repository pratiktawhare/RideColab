// ─────────────────────────────────────────────────────────────
// Savings service — money saved, CO₂ avoided, commute streak
// ─────────────────────────────────────────────────────────────
import { query } from '~/db/pool';

// CO₂ emission factors (kg per km)
const CO2_FACTORS: Record<string, number> = {
  petrol:      0.133,
  diesel:      0.157,
  cng:         0.096,
  electric:    0.025,
  hybrid:      0.080,
  hybrid_diesel: 0.090,
};

export interface SavingsSummary {
  money_saved: number;         // ₹ saved vs solo trip cost
  co2_avoided_kg: number;      // kg CO₂ not emitted
  commute_streak: number;      // consecutive days with ≥1 completed trip
  total_trips: number;         // completed bookings
  total_distance_km: number;   // total km travelled in shared rides
}

export async function getSavings(userId: string): Promise<SavingsSummary> {
  // 1. Completed bookings with their trip data (fare cap = what solo cost would be)
  const bookingsRes = await query<{
    fare_share: string;
    fare_set: string;
    seats_booked: string;
    dist_m: string;
    fuel_type: string;
    depart_at: string;
  }>(
    `SELECT
       b.fare_share,
       t.fare_set,
       b.seats_booked,
       COALESCE(ST_Length(t.route::geography), 0) AS dist_m,
       COALESCE(vc.fuel_type, 'petrol')            AS fuel_type,
       t.depart_at
     FROM bookings b
     JOIN trips t    ON t.id = b.trip_id
     LEFT JOIN vehicles v   ON v.id = t.vehicle_id
     LEFT JOIN vehicle_catalog vc ON vc.id = v.catalog_id
     WHERE b.passenger_id = $1
       AND b.status = 'completed'
     ORDER BY t.depart_at DESC`,
    [userId],
  );

  let moneySaved = 0;
  let co2AvoidedKg = 0;
  let totalDistanceKm = 0;

  for (const row of bookingsRes.rows) {
    const fareShare = parseFloat(row.fare_share);
    const fareSet = parseFloat(row.fare_set);
    const distKm = parseFloat(row.dist_m) / 1000;
    const fuelType = (row.fuel_type ?? 'petrol').toLowerCase().replace(/[^a-z_]/g, '');
    const co2Factor: number = CO2_FACTORS[fuelType] ?? 0.133;

    // Money saved = what full solo trip would cost minus passenger's share
    // Solo cost ≈ fare_set (the total trip cost rider set, which ≤ cap)
    // Shared means passenger pays fare_share instead of fare_set
    const soloEquivalent = fareSet; // what a solo-payer would have paid
    moneySaved += Math.max(0, soloEquivalent - fareShare);

    // CO₂ avoided = emissions of equivalent solo trip
    // For each shared passenger, their portion of the total CO₂ is offset by not driving alone
    // Approx: solo car emits distKm × co2Factor; in a shared ride their share is distKm × co2Factor / (seats+1)
    // CO₂ saved = solo_emission − shared_emission_per_pax
    const soloEmission = distKm * co2Factor;
    const seatsBooked = parseInt(row.seats_booked, 10) || 1;
    const sharedEmission = distKm * co2Factor / (seatsBooked + 1);
    co2AvoidedKg += Math.max(0, soloEmission - sharedEmission);

    totalDistanceKm += distKm;
  }

  const totalTrips = bookingsRes.rows.length;

  // 2. Commute streak — consecutive days ending today with ≥1 completed trip
  const streakRes = await query<{ day: string }>(
    `SELECT DISTINCT DATE(t.depart_at AT TIME ZONE 'Asia/Kolkata') AS day
     FROM bookings b
     JOIN trips t ON t.id = b.trip_id
     WHERE b.passenger_id = $1
       AND b.status = 'completed'
     ORDER BY day DESC`,
    [userId],
  );

  let streak = 0;
  if (streakRes.rows.length > 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let expected = new Date(today);

    for (const row of streakRes.rows) {
      const day = new Date(row.day);
      day.setHours(0, 0, 0, 0);
      if (day.getTime() === expected.getTime()) {
        streak++;
        expected.setDate(expected.getDate() - 1);
      } else {
        break;
      }
    }
  }

  return {
    money_saved: Math.round(moneySaved * 100) / 100,
    co2_avoided_kg: Math.round(co2AvoidedKg * 1000) / 1000,
    commute_streak: streak,
    total_trips: totalTrips,
    total_distance_km: Math.round(totalDistanceKm * 10) / 10,
  };
}

