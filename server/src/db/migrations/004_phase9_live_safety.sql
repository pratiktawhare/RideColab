-- Phase 9: Live Ride & Safety
-- Adds share_token to trips, helmet/safe-arrival to bookings, ride_events table

-- ── share_token on trips ───────────────────────────────────────
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_trips_share_token ON trips(share_token);

-- ── Safety columns on bookings ────────────────────────────────
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS helmet_checked_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS safe_arrival_at     TIMESTAMPTZ;

-- ── ride_events table (audit trail for safety events) ─────────
CREATE TABLE IF NOT EXISTS ride_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     UUID        REFERENCES trips(id) ON DELETE CASCADE,
  booking_id  UUID        REFERENCES bookings(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type  TEXT        NOT NULL,  -- 'sos', 'helmet_check', 'safe_arrival', 'deviation_alert', 'long_stop'
  data        JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ride_events_trip    ON ride_events(trip_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ride_events_booking ON ride_events(booking_id);
CREATE INDEX IF NOT EXISTS idx_ride_events_user    ON ride_events(user_id);
CREATE INDEX IF NOT EXISTS idx_ride_events_type    ON ride_events(event_type);

-- ── live_locations index (ensure exists) ──────────────────────
CREATE INDEX IF NOT EXISTS idx_live_locations_trip
  ON live_locations(trip_id, recorded_at DESC);

