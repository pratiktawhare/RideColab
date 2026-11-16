-- ─────────────────────────────────────────────────────────────
-- Migration 006: Ride Polishing (Stopovers, OTP, Sub-Routes)
-- ─────────────────────────────────────────────────────────────

-- 1. Trips table: Add stopovers waypoints & corridor preferences
ALTER TABLE trips
ADD COLUMN IF NOT EXISTS stopovers JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS corridor_radius_m INT DEFAULT 1500;

COMMENT ON COLUMN trips.stopovers IS 'Array of intermediate waypoints: [{"order":1, "label":"Warje Flyover", "lat":18.4795, "lng":73.7998, "est_offset_mins":15}]';

-- 2. Bookings table: Add boarding OTP, walking distance, and sub-leg metrics
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS boarding_otp VARCHAR(4),
ADD COLUMN IF NOT EXISTS boarded_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS pickup_landmark TEXT,
ADD COLUMN IF NOT EXISTS dropoff_landmark TEXT,
ADD COLUMN IF NOT EXISTS walking_distance_m INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS sub_leg_distance_km NUMERIC(6, 2);

-- 3. Trigger: Auto-generate 4-digit OTP upon booking creation if not supplied
CREATE OR REPLACE FUNCTION generate_booking_otp()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.boarding_otp IS NULL THEN
    NEW.boarding_otp := LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_booking_otp ON bookings;
CREATE TRIGGER trg_booking_otp
BEFORE INSERT ON bookings
FOR EACH ROW EXECUTE FUNCTION generate_booking_otp();

-- 4. Spatial index on landmarks for rapid stopover auto-detection
CREATE INDEX IF NOT EXISTS idx_landmarks_location_gist ON landmarks USING GIST (location);
