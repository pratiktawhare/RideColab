-- ============================================================
-- Migration 001 — Full RideColab schema
-- Run via: npx ts-node server/src/db/migrate.ts
-- ============================================================

-- PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── updated_at trigger function ────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── app_config ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_config (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── users ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email               TEXT        UNIQUE NOT NULL,
  password_hash       TEXT        NOT NULL,
  name                TEXT        NOT NULL,
  gender              TEXT        CHECK (gender IN ('male','female','other','prefer_not_to_say')),
  upi_id              TEXT,
  language            TEXT        NOT NULL DEFAULT 'en' CHECK (language IN ('en','hi','mr')),
  mode                TEXT        NOT NULL DEFAULT 'passenger' CHECK (mode IN ('rider','passenger')),
  role                TEXT        NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  consent_given_at    TIMESTAMPTZ,
  weekly_trips_used   INT         NOT NULL DEFAULT 0,
  weekly_reset_at     TIMESTAMPTZ NOT NULL DEFAULT date_trunc('week', NOW()) + INTERVAL '7 days',
  is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
  is_anonymised       BOOLEAN     NOT NULL DEFAULT FALSE,
  google_id           TEXT        UNIQUE,
  refresh_token_hash  TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_mode  ON users(mode);

CREATE OR REPLACE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── trust_scores ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trust_scores (
  user_id     UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  score       NUMERIC(5,2) NOT NULL DEFAULT 10,
  total_trips INT         NOT NULL DEFAULT 0,
  no_shows    INT         NOT NULL DEFAULT 0,
  late_cancels INT        NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER trg_trust_scores_updated_at
BEFORE UPDATE ON trust_scores
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── emergency_contacts ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS emergency_contacts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  phone       TEXT        NOT NULL,
  relation    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_emergency_contacts_user ON emergency_contacts(user_id);

-- ─── user_declarations ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_declarations (
  user_id            UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  has_valid_licence  BOOLEAN     NOT NULL DEFAULT FALSE,
  has_insurance      BOOLEAN     NOT NULL DEFAULT FALSE,
  declared_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── refresh_tokens ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- ─── vehicle_catalog ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicle_catalog (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  type            TEXT    NOT NULL CHECK (type IN ('car','bike','auto','ev')),
  make            TEXT    NOT NULL,
  model           TEXT    NOT NULL,
  variant         TEXT,
  fuel_type       TEXT    NOT NULL CHECK (fuel_type IN ('petrol','diesel','cng','electric')),
  claimed_kmpl    NUMERIC(6,2),   -- km/L for ICE, km/kWh for EV
  kwh_per_100km   NUMERIC(6,2),   -- EV only
  seats           INT     NOT NULL DEFAULT 4,
  source          TEXT    NOT NULL DEFAULT 'ARAI',  -- data source note
  is_active       BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_vehicle_catalog_type_make ON vehicle_catalog(type, make);

-- ─── vehicles ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicles (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  catalog_id      UUID        NOT NULL REFERENCES vehicle_catalog(id),
  plate_number    TEXT        NOT NULL,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vehicles_user ON vehicles(user_id);

-- ─── fuel_prices ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fuel_prices (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  fuel_type   TEXT        UNIQUE NOT NULL CHECK (fuel_type IN ('petrol','diesel','cng','electric')),
  price_per_unit NUMERIC(8,2) NOT NULL,   -- ₹/L or ₹/kWh
  unit        TEXT        NOT NULL,        -- 'litre' or 'kWh'
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER trg_fuel_prices_updated_at
BEFORE UPDATE ON fuel_prices
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── landmarks ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS landmarks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  name_hi     TEXT,
  name_mr     TEXT,
  category    TEXT        NOT NULL DEFAULT 'general',
  location    GEOGRAPHY(POINT,4326) NOT NULL,
  city        TEXT        NOT NULL DEFAULT 'Pune'
);
CREATE INDEX IF NOT EXISTS idx_landmarks_location ON landmarks USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_landmarks_name ON landmarks(name);

-- ─── route_cache ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS route_cache (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_lat      NUMERIC(10,6) NOT NULL,
  origin_lng      NUMERIC(10,6) NOT NULL,
  dest_lat        NUMERIC(10,6) NOT NULL,
  dest_lng        NUMERIC(10,6) NOT NULL,
  distance_m      INT         NOT NULL,
  duration_s      INT         NOT NULL,
  route           GEOGRAPHY(LINESTRING,4326) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (origin_lat, origin_lng, dest_lat, dest_lng)
);
CREATE INDEX IF NOT EXISTS idx_route_cache_coords ON route_cache(origin_lat, origin_lng, dest_lat, dest_lng);

-- ─── communities ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS communities (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        NOT NULL,
  description     TEXT,
  invite_code     TEXT        UNIQUE NOT NULL,
  created_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_communities_invite_code ON communities(invite_code);

CREATE OR REPLACE TRIGGER trg_communities_updated_at
BEFORE UPDATE ON communities
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── community_members ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS community_members (
  community_id    UUID        NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            TEXT        NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (community_id, user_id)
);

-- ─── trips ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trips (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id      UUID        REFERENCES vehicles(id) ON DELETE SET NULL,
  origin_label    TEXT        NOT NULL,
  origin_lat      NUMERIC(10,6) NOT NULL,
  origin_lng      NUMERIC(10,6) NOT NULL,
  dest_label      TEXT        NOT NULL,
  dest_lat        NUMERIC(10,6) NOT NULL,
  dest_lng        NUMERIC(10,6) NOT NULL,
  route           GEOGRAPHY(LINESTRING,4326),
  distance_m      INT,
  duration_s      INT,
  depart_at       TIMESTAMPTZ NOT NULL,
  seats_total     INT         NOT NULL DEFAULT 1,
  seats_available INT         NOT NULL DEFAULT 1,
  fare_set        NUMERIC(8,2) NOT NULL,    -- total trip cost set by rider
  fare_cap        NUMERIC(8,2) NOT NULL,    -- server-enforced max
  status          TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open','full','in_progress','completed','cancelled')),
  community_id    UUID        REFERENCES communities(id) ON DELETE SET NULL,
  is_recurring    BOOLEAN     NOT NULL DEFAULT FALSE,
  rrule           TEXT,                     -- iCal RRULE string
  parent_trip_id  UUID        REFERENCES trips(id) ON DELETE CASCADE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trips_rider         ON trips(rider_id);
CREATE INDEX IF NOT EXISTS idx_trips_depart_at     ON trips(depart_at);
CREATE INDEX IF NOT EXISTS idx_trips_status        ON trips(status);
CREATE INDEX IF NOT EXISTS idx_trips_origin        ON trips USING GIST(
  ST_SetSRID(ST_MakePoint(origin_lng, origin_lat), 4326)
);

CREATE OR REPLACE TRIGGER trg_trips_updated_at
BEFORE UPDATE ON trips
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── bookings ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id         UUID        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  passenger_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pickup_label    TEXT        NOT NULL,
  pickup_lat      NUMERIC(10,6) NOT NULL,
  pickup_lng      NUMERIC(10,6) NOT NULL,
  dropoff_label   TEXT        NOT NULL,
  dropoff_lat     NUMERIC(10,6) NOT NULL,
  dropoff_lng     NUMERIC(10,6) NOT NULL,
  fare_share      NUMERIC(8,2) NOT NULL,   -- passenger's share
  status          TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','in_progress','completed','cancelled','no_show')),
  chat_key_iv     TEXT,                    -- AES-256-GCM IV for per-booking chat key
  payment_ref     TEXT,                    -- UPI transaction ref (self-reported)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trip_id, passenger_id)
);
CREATE INDEX IF NOT EXISTS idx_bookings_trip      ON bookings(trip_id);
CREATE INDEX IF NOT EXISTS idx_bookings_passenger ON bookings(passenger_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status    ON bookings(status);

CREATE OR REPLACE TRIGGER trg_bookings_updated_at
BEFORE UPDATE ON bookings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── live_locations ──────────────────────────────────────────
-- Hot state in Redis, flushed here every 30s, deleted post-trip
CREATE TABLE IF NOT EXISTS live_locations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     UUID        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location    GEOGRAPHY(POINT,4326) NOT NULL,
  bearing     NUMERIC(5,2),
  speed_kmh   NUMERIC(6,2),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_live_locations_trip ON live_locations(trip_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_locations_user ON live_locations(user_id);

-- ─── messages ────────────────────────────────────────────────
-- AES-256-GCM encrypted; key derived per booking via HKDF
CREATE TABLE IF NOT EXISTS messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      UUID        NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  sender_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body_encrypted  TEXT        NOT NULL,   -- base64 ciphertext
  iv              TEXT        NOT NULL,   -- base64 IV
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_booking ON messages(booking_id, sent_at);

-- ─── reviews ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      UUID        NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  reviewer_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewee_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating          INT         NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (booking_id, reviewer_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewee ON reviews(reviewee_id);

-- ─── notifications ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            TEXT        NOT NULL,
  title           TEXT        NOT NULL,
  body            TEXT        NOT NULL,
  data            JSONB,
  is_read         BOOLEAN     NOT NULL DEFAULT FALSE,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, sent_at DESC);

-- ─── sos_alerts ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sos_alerts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trip_id         UUID        REFERENCES trips(id) ON DELETE SET NULL,
  location        GEOGRAPHY(POINT,4326),
  resolved        BOOLEAN     NOT NULL DEFAULT FALSE,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── geocoding_cache ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geocoding_cache (
  query_hash      TEXT        PRIMARY KEY,
  query_text      TEXT        NOT NULL,
  results         JSONB       NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);

-- ─── admin_audit_log ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id        UUID        REFERENCES users(id) ON DELETE SET NULL,
  action          TEXT        NOT NULL,
  target_table    TEXT,
  target_id       TEXT,
  old_value       JSONB,
  new_value       JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
