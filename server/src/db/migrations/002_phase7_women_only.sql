-- Migration 002 — Phase 7: add is_women_only column to trips
ALTER TABLE trips ADD COLUMN IF NOT EXISTS is_women_only BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_trips_women_only ON trips(is_women_only) WHERE is_women_only = TRUE;

