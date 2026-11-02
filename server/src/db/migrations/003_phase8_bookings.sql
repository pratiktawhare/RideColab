-- Phase 8: Booking Flow
-- Adds booking state machine, ride codes, encrypted messages,
-- cancellation streak tracking

-- ── Extend bookings table ─────────────────────────────────────
-- bookings already has: id, trip_id, passenger_id, pickup_label/lat/lng,
-- dropoff_label/lat/lng, fare_share, status, chat_key_iv, payment_ref,
-- created_at, updated_at

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS ride_code      TEXT,
  ADD COLUMN IF NOT EXISTS seats_booked   INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS started_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_reason  TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_by   UUID REFERENCES users(id) ON DELETE SET NULL;

-- Ensure status column has the right values
ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('pending','accepted','started','completed','declined','cancelled'));

-- ── messages table already has body_encrypted, iv, sender_id ──
-- Just add index for chat history queries
CREATE INDEX IF NOT EXISTS idx_messages_booking_created
  ON messages(booking_id, sent_at);

-- ── Cancellation streak tracking ─────────────────────────────
CREATE TABLE IF NOT EXISTS cancellation_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_id   UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  cancelled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cancel_events_user_time
  ON cancellation_events(user_id, cancelled_at);

-- ── can_post_trips flag on users ──────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS can_post_trips BOOLEAN NOT NULL DEFAULT TRUE;

-- ── Add push token to notifications table ────────────────────
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS push_token TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Unique constraint so we can upsert push tokens
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_user_id_key;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_user_id_key UNIQUE (user_id);

-- ── Add indexes for common booking queries ────────────────────
CREATE INDEX IF NOT EXISTS idx_bookings_passenger
  ON bookings(passenger_id, status);

CREATE INDEX IF NOT EXISTS idx_bookings_trip_status
  ON bookings(trip_id, status);
