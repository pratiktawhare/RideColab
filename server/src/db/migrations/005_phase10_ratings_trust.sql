-- ─────────────────────────────────────────────────────────────
-- Migration 005: Phase 10 — Payments, Ratings & Trust
-- ─────────────────────────────────────────────────────────────

-- ─── reviews — add tags column ────────────────────────────────
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

-- ─── trust_scores — add formula columns ───────────────────────
ALTER TABLE trust_scores ADD COLUMN IF NOT EXISTS avg_rating          NUMERIC(3,2)  NOT NULL DEFAULT 0;
ALTER TABLE trust_scores ADD COLUMN IF NOT EXISTS total_ratings       INT           NOT NULL DEFAULT 0;
ALTER TABLE trust_scores ADD COLUMN IF NOT EXISTS cancellation_rate   NUMERIC(5,4)  NOT NULL DEFAULT 0;
ALTER TABLE trust_scores ADD COLUMN IF NOT EXISTS community_member    BOOLEAN       NOT NULL DEFAULT FALSE;
ALTER TABLE trust_scores ADD COLUMN IF NOT EXISTS profile_complete    BOOLEAN       NOT NULL DEFAULT FALSE;

-- ─── bookings — add payment confirmation ──────────────────────
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_confirmed    BOOLEAN     NOT NULL DEFAULT FALSE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ;

-- ─── blocked_users ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blocked_users (
  blocker_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker ON blocked_users(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked ON blocked_users(blocked_id);

-- ─── reports ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_id   UUID        REFERENCES bookings(id) ON DELETE SET NULL,
  reason       TEXT        NOT NULL,
  details      TEXT,
  status       TEXT        NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'reviewed', 'dismissed')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (reporter_id <> reported_id)
);
CREATE INDEX IF NOT EXISTS idx_reports_reported ON reports(reported_id);
CREATE INDEX IF NOT EXISTS idx_reports_status   ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_id);

-- ─── app_config defaults for Phase 10 ────────────────────────
INSERT INTO app_config (key, value, description) VALUES
  ('payment.demo_mode',       'false',  'If true, show simulated payment screen instead of UPI intent')
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_config (key, value, description) VALUES
  ('trust.recalc_on_rating',  'true',   'Recalculate trust score immediately after a rating is submitted')
ON CONFLICT (key) DO NOTHING;

