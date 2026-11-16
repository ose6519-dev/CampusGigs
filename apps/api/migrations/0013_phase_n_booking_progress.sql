-- Phase N: verified service progress, completion, availability and one review per booking.
-- Payments remain disabled; existing booking statuses and history are preserved.
ALTER TABLE service_bookings ADD COLUMN progress_status TEXT NOT NULL DEFAULT 'not_started'
  CHECK(progress_status IN ('not_started','in_progress','submitted','completed'));
ALTER TABLE service_bookings ADD COLUMN started_at TEXT;
ALTER TABLE service_bookings ADD COLUMN submitted_at TEXT;
ALTER TABLE service_bookings ADD COLUMN completed_at TEXT;
ALTER TABLE service_bookings ADD COLUMN completion_note TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS provider_availability (
  provider_uid TEXT PRIMARY KEY NOT NULL REFERENCES provider_profiles(firebase_uid) ON DELETE CASCADE,
  accepting_bookings INTEGER NOT NULL DEFAULT 1 CHECK(accepting_bookings IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS service_reviews (
  booking_id TEXT PRIMARY KEY NOT NULL REFERENCES service_bookings(id) ON DELETE RESTRICT,
  buyer_uid TEXT NOT NULL REFERENCES profiles(firebase_uid) ON DELETE RESTRICT,
  provider_uid TEXT NOT NULL REFERENCES provider_profiles(firebase_uid) ON DELETE RESTRICT,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '' CHECK(length(comment) <= 500),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_reviews_provider ON service_reviews(provider_uid,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_progress ON service_bookings(provider_uid,status,progress_status);

CREATE TRIGGER IF NOT EXISTS trg_booking_progress AFTER UPDATE OF progress_status ON service_bookings
WHEN OLD.progress_status <> NEW.progress_status
BEGIN
  INSERT INTO booking_events (booking_id,actor_uid,from_status,to_status)
  VALUES (NEW.id,NEW.last_actor_uid,
    CASE WHEN OLD.progress_status='not_started' THEN OLD.status ELSE OLD.progress_status END,
    NEW.progress_status);
END;
