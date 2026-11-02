// ─────────────────────────────────────────────────────────────
// Booking service — state machine, ride code, cancellation streak
// ─────────────────────────────────────────────────────────────
import { query, withTransaction } from '~/db/pool';
import { logger } from '~/utils/logger';
import { sendPushToUser } from '~/services/notifications';

// ── Types ─────────────────────────────────────────────────────
export type BookingStatus = 'pending' | 'accepted' | 'started' | 'completed' | 'declined' | 'cancelled';

export interface BookingRow {
  id: string;
  trip_id: string;
  passenger_id: string;
  rider_id: string;
  status: BookingStatus;
  seats_booked: number;
  pickup_label: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_label: string | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  fare_share: number | null;
  ride_code: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  // trip join fields
  origin_label: string;
  dest_label: string;
  depart_at: string;
  rider_name: string;
  rider_trust: number;
  passenger_name?: string;
  passenger_trust?: number;
  vehicle_make: string;
  vehicle_model: string;
  plate_number: string;
}

// ── Ride code generator ───────────────────────────────────────
function generateRideCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I,O,1,0 to avoid confusion
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ── Create booking ────────────────────────────────────────────
export async function createBooking(
  passengerId: string,
  tripId: string,
  opts: {
    seatsBooked: number;
    pickupLabel?: string;
    pickupLat?: number;
    pickupLng?: number;
    dropoffLabel?: string;
    dropoffLat?: number;
    dropoffLng?: number;
  },
): Promise<BookingRow> {
  return withTransaction(async (client) => {
    // Fetch and lock the trip
    const tripRes = await client.query<{
      id: string;
      rider_id: string;
      status: string;
      seats_available: number;
      fare_set: number;
      seats_total: number;
      origin_label: string;
      origin_lat: number;
      origin_lng: number;
      dest_label: string;
      dest_lat: number;
      dest_lng: number;
    }>(
      `SELECT t.id, t.rider_id, t.status, t.seats_available, t.fare_set,
              t.seats_total, t.origin_label, t.origin_lat, t.origin_lng,
              t.dest_label, t.dest_lat, t.dest_lng
       FROM trips t
       WHERE t.id = $1 FOR UPDATE`,
      [tripId],
    );

    if (tripRes.rows.length === 0) {
      throw Object.assign(new Error('Trip not found'), { code: 'TRIP_NOT_FOUND', status: 404 });
    }

    const trip = tripRes.rows[0]!;

    if (trip.status !== 'open') {
      throw Object.assign(new Error('Trip is not open for booking'), { code: 'TRIP_NOT_OPEN', status: 409 });
    }

    if (trip.rider_id === passengerId) {
      throw Object.assign(new Error('Cannot book your own trip'), { code: 'SELF_BOOKING', status: 400 });
    }

    if (trip.seats_available < opts.seatsBooked) {
      throw Object.assign(new Error('Not enough seats available'), { code: 'INSUFFICIENT_SEATS', status: 409 });
    }

    // Check passenger doesn't already have a pending/accepted booking for this trip
    const dupRes = await client.query<{ id: string }>(
      `SELECT id FROM bookings
       WHERE trip_id = $1 AND passenger_id = $2 AND status IN ('pending','accepted')`,
      [tripId, passengerId],
    );
    if (dupRes.rows.length > 0) {
      throw Object.assign(new Error('You already have an active booking for this trip'), {
        code: 'DUPLICATE_BOOKING',
        status: 409,
      });
    }

    // Compute fare share: fare_set / (1 + seats_booked)
    const fareShare = +(trip.fare_set / (1 + opts.seatsBooked)).toFixed(2);

    // Fallback to trip's origin / destination if passenger did not provide custom coordinates
    const pickupLabel = opts.pickupLabel ?? trip.origin_label;
    const pickupLat = opts.pickupLat ?? trip.origin_lat;
    const pickupLng = opts.pickupLng ?? trip.origin_lng;
    const dropoffLabel = opts.dropoffLabel ?? trip.dest_label;
    const dropoffLat = opts.dropoffLat ?? trip.dest_lat;
    const dropoffLng = opts.dropoffLng ?? trip.dest_lng;

    // Insert booking
    const bookRes = await client.query<{ id: string }>(
      `INSERT INTO bookings
         (trip_id, passenger_id, status, seats_booked,
          pickup_label, pickup_lat, pickup_lng,
          dropoff_label, dropoff_lat, dropoff_lng,
          fare_share)
       VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        tripId, passengerId, opts.seatsBooked,
        pickupLabel, pickupLat, pickupLng,
        dropoffLabel, dropoffLat, dropoffLng,
        fareShare,
      ],
    );

    const bookingId = bookRes.rows[0]!.id;

    // Decrement seats_available
    await client.query(
      `UPDATE trips SET seats_available = seats_available - $1 WHERE id = $2`,
      [opts.seatsBooked, tripId],
    );

    logger.info({ bookingId, tripId, passengerId }, 'Booking created');

    // Notify rider
    sendPushToUser(
      trip.rider_id,
      '🎫 New booking request',
      `A passenger wants to join your ride to ${trip.dest_label}`,
      { bookingId, screen: 'booking-detail' },
    ).catch(() => {});

    return getBookingById(bookingId, passengerId, client) as Promise<BookingRow>;
  });
}

// ── Get booking by id (for either participant) ────────────────
export async function getBookingById(
  bookingId: string,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client?: { query: (...args: any[]) => Promise<any> },
): Promise<BookingRow | null> {
  const runner = client ?? { query };
  const res = await runner.query<BookingRow>(
    `SELECT b.*,
            t.rider_id,
            t.origin_label, t.dest_label, t.depart_at,
            u.name AS rider_name,
            COALESCE(ts.score, 50) AS rider_trust,
            p.name AS passenger_name,
            COALESCE(pts.score, 50) AS passenger_trust,
            vc.make AS vehicle_make, vc.model AS vehicle_model, v.plate_number
     FROM bookings b
     JOIN trips t ON t.id = b.trip_id
     JOIN users u ON u.id = t.rider_id
     LEFT JOIN users p ON p.id = b.passenger_id
     LEFT JOIN trust_scores ts ON ts.user_id = t.rider_id
     LEFT JOIN trust_scores pts ON pts.user_id = b.passenger_id
     LEFT JOIN vehicles v ON v.id = t.vehicle_id
     LEFT JOIN vehicle_catalog vc ON vc.id = v.catalog_id
     WHERE b.id = $1
       AND (b.passenger_id = $2 OR t.rider_id = $2)`,
    [bookingId, userId],
  );
  return res.rows[0] ?? null;
}

// ── Get all bookings for a user ───────────────────────────────
export async function getMyBookings(userId: string): Promise<BookingRow[]> {
  const res = await query<BookingRow>(
    `SELECT b.*,
            t.rider_id,
            t.origin_label, t.dest_label, t.depart_at,
            u.name AS rider_name,
            COALESCE(ts.score, 50) AS rider_trust,
            p.name AS passenger_name,
            COALESCE(pts.score, 50) AS passenger_trust,
            vc.make AS vehicle_make, vc.model AS vehicle_model, v.plate_number
     FROM bookings b
     JOIN trips t ON t.id = b.trip_id
     JOIN users u ON u.id = t.rider_id
     LEFT JOIN users p ON p.id = b.passenger_id
     LEFT JOIN trust_scores ts ON ts.user_id = t.rider_id
     LEFT JOIN trust_scores pts ON pts.user_id = b.passenger_id
     LEFT JOIN vehicles v ON v.id = t.vehicle_id
     LEFT JOIN vehicle_catalog vc ON vc.id = v.catalog_id
     WHERE b.passenger_id = $1 OR t.rider_id = $1
     ORDER BY b.created_at DESC`,
    [userId],
  );
  return res.rows;
}

// ── Accept booking (rider only) ───────────────────────────────
export async function acceptBooking(bookingId: string, riderId: string): Promise<BookingRow> {
  const res = await query<{ id: string; passenger_id: string; dest_label: string }>(
    `UPDATE bookings b
     SET status = 'accepted', updated_at = NOW()
     FROM trips t
     WHERE b.id = $1
       AND b.trip_id = t.id
       AND t.rider_id = $2
       AND b.status = 'pending'
     RETURNING b.id, b.passenger_id, t.dest_label`,
    [bookingId, riderId],
  );

  if (res.rows.length === 0) {
    throw Object.assign(new Error('Booking not found or not in pending state'), {
      code: 'BOOKING_NOT_FOUND',
      status: 404,
    });
  }

  const { passenger_id, dest_label } = res.rows[0]!;
  sendPushToUser(
    passenger_id,
    '✅ Booking accepted!',
    `Your ride to ${dest_label} has been confirmed. Get ready!`,
    { bookingId, screen: 'booking-detail' },
  ).catch(() => {});

  return getBookingById(bookingId, riderId) as Promise<BookingRow>;
}

// ── Decline booking (rider only) ─────────────────────────────
export async function declineBooking(bookingId: string, riderId: string): Promise<void> {
  const res = await query<{ passenger_id: string; seats_booked: number; trip_id: string; dest_label: string }>(
    `UPDATE bookings b
     SET status = 'declined', updated_at = NOW()
     FROM trips t
     WHERE b.id = $1
       AND b.trip_id = t.id
       AND t.rider_id = $2
       AND b.status = 'pending'
     RETURNING b.passenger_id, b.seats_booked, b.trip_id, t.dest_label`,
    [bookingId, riderId],
  );

  if (res.rows.length === 0) {
    throw Object.assign(new Error('Booking not found or not in pending state'), {
      code: 'BOOKING_NOT_FOUND',
      status: 404,
    });
  }

  const { passenger_id, seats_booked, trip_id, dest_label } = res.rows[0]!;

  // Restore seats
  await query(`UPDATE trips SET seats_available = seats_available + $1 WHERE id = $2`, [seats_booked, trip_id]);

  sendPushToUser(
    passenger_id,
    '❌ Booking declined',
    `Sorry, the rider couldn't accept your trip to ${dest_label}. Try searching again.`,
    { screen: 'search-rides' },
  ).catch(() => {});
}

// ── Cancel booking (either participant) ──────────────────────
export async function cancelBooking(
  bookingId: string,
  userId: string,
  reason?: string,
): Promise<void> {
  return withTransaction(async (client) => {
    const res = await client.query<{
      passenger_id: string;
      rider_id: string;
      seats_booked: number;
      trip_id: string;
      status: BookingStatus;
      dest_label: string;
    }>(
      `SELECT b.passenger_id, t.rider_id, b.seats_booked, b.trip_id, b.status, t.dest_label
       FROM bookings b
       JOIN trips t ON t.id = b.trip_id
       WHERE b.id = $1 AND (b.passenger_id = $2 OR t.rider_id = $2)`,
      [bookingId, userId],
    );

    if (res.rows.length === 0) {
      throw Object.assign(new Error('Booking not found'), { code: 'BOOKING_NOT_FOUND', status: 404 });
    }

    const booking = res.rows[0]!;

    if (!['pending', 'accepted'].includes(booking.status)) {
      throw Object.assign(
        new Error('Only pending or accepted bookings can be cancelled'),
        { code: 'INVALID_STATUS_TRANSITION', status: 409 },
      );
    }

    await client.query(
      `UPDATE bookings
       SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = $2, cancel_reason = $3, updated_at = NOW()
       WHERE id = $1`,
      [bookingId, userId, reason ?? null],
    );

    // Restore seats
    await client.query(
      `UPDATE trips SET seats_available = seats_available + $1 WHERE id = $2`,
      [booking.seats_booked, booking.trip_id],
    );

    // Record cancellation event for streak tracking
    await client.query(
      `INSERT INTO cancellation_events (user_id, booking_id) VALUES ($1, $2)`,
      [userId, bookingId],
    );

    // Check cancellation streak
    const streakRes = await client.query<{ count: string }>(
      `SELECT COUNT(*) FROM cancellation_events
       WHERE user_id = $1 AND cancelled_at > NOW() - INTERVAL '7 days'`,
      [userId],
    );
    const streakCount = parseInt(streakRes.rows[0]!.count, 10);

    if (streakCount >= 5) {
      // Suspend posting ability
      await client.query(
        `UPDATE users SET can_post_trips = false WHERE id = $1`,
        [userId],
      );
      logger.warn({ userId, streakCount }, 'User posting suspended due to cancellation streak');
    }

    // Notify the other party
    const otherUserId = userId === booking.passenger_id ? booking.rider_id : booking.passenger_id;
    sendPushToUser(
      otherUserId,
      '🚫 Booking cancelled',
      `The ride to ${booking.dest_label} has been cancelled.`,
      { screen: 'activity' },
    ).catch(() => {});
  });
}

// ── Start ride (rider only) — verifies ride code ─────────────
export async function startRide(bookingId: string, riderId: string, rideCodeInput: string): Promise<BookingRow> {
  const checkRes = await query<{ ride_code: string; passenger_id: string; dest_label: string }>(
    `SELECT b.ride_code, b.passenger_id, t.dest_label
     FROM bookings b JOIN trips t ON t.id = b.trip_id
     WHERE b.id = $1 AND t.rider_id = $2 AND b.status = 'accepted'`,
    [bookingId, riderId],
  );

  if (checkRes.rows.length === 0) {
    throw Object.assign(new Error('Booking not found or not in accepted state'), {
      code: 'BOOKING_NOT_FOUND',
      status: 404,
    });
  }

  const { ride_code, passenger_id, dest_label } = checkRes.rows[0]!;

  if (!ride_code || rideCodeInput.toUpperCase() !== ride_code) {
    throw Object.assign(new Error('Invalid ride code'), { code: 'INVALID_RIDE_CODE', status: 400 });
  }

  await query(
    `UPDATE bookings SET status = 'started', started_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [bookingId],
  );

  sendPushToUser(
    passenger_id,
    '🚗 Your ride has started!',
    `The ride to ${dest_label} is now underway. Stay safe!`,
    { bookingId, screen: 'booking-detail' },
  ).catch(() => {});

  return getBookingById(bookingId, riderId) as Promise<BookingRow>;
}

// ── Generate ride code (rider calls this to get code for passenger) ──
export async function generateRideCodeForBooking(bookingId: string, riderId: string): Promise<string> {
  const code = generateRideCode();
  const res = await query(
    `UPDATE bookings b
     SET ride_code = $1, updated_at = NOW()
     FROM trips t
     WHERE b.id = $2 AND b.trip_id = t.id AND t.rider_id = $3 AND b.status = 'accepted'
     RETURNING b.id`,
    [code, bookingId, riderId],
  );

  if (res.rows.length === 0) {
    throw Object.assign(new Error('Booking not found or not in accepted state'), {
      code: 'BOOKING_NOT_FOUND',
      status: 404,
    });
  }

  return code;
}

// ── Complete ride (rider only) ────────────────────────────────
export async function completeRide(bookingId: string, riderId: string): Promise<BookingRow> {
  const res = await query<{ passenger_id: string; dest_label: string; trip_id: string }>(
    `UPDATE bookings b
     SET status = 'completed', completed_at = NOW(), updated_at = NOW()
     FROM trips t
     WHERE b.id = $1 AND b.trip_id = t.id AND t.rider_id = $2 AND b.status = 'started'
     RETURNING b.passenger_id, t.dest_label, b.trip_id`,
    [bookingId, riderId],
  );

  if (res.rows.length === 0) {
    throw Object.assign(new Error('Booking not found or not in started state'), {
      code: 'BOOKING_NOT_FOUND',
      status: 404,
    });
  }

  const { passenger_id, dest_label, trip_id } = res.rows[0]!;

  // Mark the trip as completed if all bookings done
  await query(
    `UPDATE trips SET status = 'completed', updated_at = NOW()
     WHERE id = $1
       AND NOT EXISTS (
         SELECT 1 FROM bookings WHERE trip_id = $1 AND status IN ('pending','accepted','started')
       )`,
    [trip_id],
  );

  // Increment rider's completed trips count for trust score
  await query(
    `UPDATE users SET weekly_trips_used = weekly_trips_used + 1 WHERE id = (
       SELECT rider_id FROM trips WHERE id = $1
     )`,
    [trip_id],
  );

  sendPushToUser(
    passenger_id,
    '🎉 Ride completed!',
    `You've arrived at ${dest_label}. Please rate your rider.`,
    { bookingId, screen: 'booking-detail' },
  ).catch(() => {});

  return getBookingById(bookingId, riderId) as Promise<BookingRow>;
}

// ── Check if user is posting-suspended ───────────────────────
export async function checkPostingSuspended(userId: string): Promise<boolean> {
  const res = await query<{ can_post_trips: boolean }>(
    `SELECT can_post_trips FROM users WHERE id = $1`,
    [userId],
  );
  return !(res.rows[0]?.can_post_trips ?? true);
}

