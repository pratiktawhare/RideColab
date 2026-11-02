// ─────────────────────────────────────────────────────────────
// Safety service — SOS, helmet check, safe arrival, night rules
// ─────────────────────────────────────────────────────────────
import { query } from '~/db/pool';
import { logger } from '~/utils/logger';
import { sendPushToUser } from '~/services/notifications';

// ── Log SOS alert ─────────────────────────────────────────────
export async function logSos(
  userId: string,
  tripId: string,
  lat?: number,
  lng?: number,
): Promise<{ sosId: string }> {
  // Insert SOS alert
  const sosRes = await query<{ id: string }>(
    lat != null && lng != null
      ? `INSERT INTO sos_alerts (user_id, trip_id, location)
         VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326))
         RETURNING id`
      : `INSERT INTO sos_alerts (user_id, trip_id)
         VALUES ($1, $2)
         RETURNING id`,
    lat != null && lng != null ? [userId, tripId, lng, lat] : [userId, tripId],
  );

  const sosId = sosRes.rows[0]!.id;

  // Log ride_event
  await query(
    `INSERT INTO ride_events (trip_id, user_id, event_type, data)
     VALUES ($1, $2, 'sos', $3)`,
    [
      tripId,
      userId,
      JSON.stringify({ sos_alert_id: sosId, lat, lng }),
    ],
  );

  // Notify emergency contacts — build SMS deep link info
  const contactsRes = await query<{ name: string; phone: string }>(
    `SELECT name, phone FROM emergency_contacts WHERE user_id = $1`,
    [userId],
  );

  if (contactsRes.rows.length > 0) {
    logger.info(
      { userId, tripId, contacts: contactsRes.rows.map((c) => c.phone) },
      'SOS: emergency contacts found — client should send SMS deep link',
    );
  }

  // Notify admins
  const adminRes = await query<{ id: string }>(
    `SELECT id FROM users WHERE role = 'admin' AND is_active = true`,
  );
  for (const admin of adminRes.rows) {
    sendPushToUser(
      admin.id,
      '🚨 SOS Alert',
      `User triggered SOS on trip ${tripId}`,
      { screen: 'admin-sos', tripId, sosId },
    ).catch(() => {});
  }

  logger.warn({ sosId, userId, tripId }, 'SOS alert logged');
  return { sosId };
}

// ── Get emergency contacts for a user (for SOS SMS deep link) ─
export async function getEmergencyContacts(userId: string): Promise<Array<{ name: string; phone: string }>> {
  const res = await query<{ name: string; phone: string }>(
    `SELECT name, phone FROM emergency_contacts WHERE user_id = $1`,
    [userId],
  );
  return res.rows;
}

// ── Log helmet check ──────────────────────────────────────────
export async function logHelmetCheck(
  bookingId: string,
  userId: string,
): Promise<void> {
  // Get trip_id
  const bookRes = await query<{ trip_id: string }>(
    `SELECT trip_id FROM bookings WHERE id = $1 AND (passenger_id = $2 OR EXISTS (
       SELECT 1 FROM trips t WHERE t.id = bookings.trip_id AND t.rider_id = $2
     ))`,
    [bookingId, userId],
  );

  if (bookRes.rows.length === 0) {
    throw Object.assign(new Error('Booking not found'), { code: 'BOOKING_NOT_FOUND', status: 404 });
  }

  const tripId = bookRes.rows[0]!.trip_id;

  await query(
    `UPDATE bookings SET helmet_checked_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [bookingId],
  );

  await query(
    `INSERT INTO ride_events (trip_id, booking_id, user_id, event_type)
     VALUES ($1, $2, $3, 'helmet_check')`,
    [tripId, bookingId, userId],
  );

  logger.info({ bookingId, userId }, 'Helmet check logged');
}

// ── Log safe arrival ─────────────────────────────────────────
export async function logSafeArrival(
  bookingId: string,
  userId: string,
): Promise<void> {
  const bookRes = await query<{ trip_id: string }>(
    `SELECT trip_id FROM bookings WHERE id = $1 AND passenger_id = $2`,
    [bookingId, userId],
  );

  if (bookRes.rows.length === 0) {
    throw Object.assign(new Error('Booking not found or not your booking'), {
      code: 'BOOKING_NOT_FOUND',
      status: 404,
    });
  }

  const tripId = bookRes.rows[0]!.trip_id;

  await query(
    `UPDATE bookings SET safe_arrival_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [bookingId],
  );

  await query(
    `INSERT INTO ride_events (trip_id, booking_id, user_id, event_type)
     VALUES ($1, $2, $3, 'safe_arrival')`,
    [tripId, bookingId, userId],
  );

  logger.info({ bookingId, userId }, 'Safe arrival logged');
}

// ── Check night rules (21:00–05:00 IST) ──────────────────────
// Returns true if current time is in night window
export function isNightTime(): boolean {
  const now = new Date();
  // IST = UTC+5:30
  const istHour = (now.getUTCHours() + 5 + Math.floor((now.getUTCMinutes() + 30) / 60)) % 24;
  return istHour >= 21 || istHour < 5;
}

// ── Check if booking involves female passenger at night ───────
export async function checkNightRules(bookingId: string): Promise<boolean> {
  if (!isNightTime()) return false;

  const res = await query<{ gender: string }>(
    `SELECT u.gender
     FROM bookings b
     JOIN users u ON u.id = b.passenger_id
     WHERE b.id = $1`,
    [bookingId],
  );

  return res.rows[0]?.gender === 'female';
}
