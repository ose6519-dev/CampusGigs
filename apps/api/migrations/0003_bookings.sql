-- Phase D: service booking requests and audit events in CampusGigs D1 ONLY.
-- No payment charge, payout, or biometric data is created in this migration.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS service_bookings (
  id TEXT PRIMARY KEY NOT NULL,
  buyer_uid TEXT NOT NULL REFERENCES profiles(firebase_uid) ON DELETE RESTRICT,
  provider_uid TEXT NOT NULL REFERENCES provider_profiles(firebase_uid) ON DELETE RESTRICT,
  gig_id TEXT NOT NULL REFERENCES gigs(id) ON DELETE RESTRICT,
  request_id TEXT NOT NULL,
  service_title TEXT NOT NULL,
  service_category TEXT NOT NULL,
  price_kobo INTEGER NOT NULL CHECK(price_kobo > 0),
  delivery_days INTEGER NOT NULL CHECK(delivery_days BETWEEN 1 AND 90),
  brief TEXT NOT NULL CHECK(length(brief) BETWEEN 20 AND 2000),
  status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','accepted','declined','cancelled')),
  last_actor_uid TEXT NOT NULL REFERENCES profiles(firebase_uid),
  requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  responded_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(buyer_uid,request_id),
  CHECK(buyer_uid <> provider_uid)
);

CREATE INDEX IF NOT EXISTS idx_bookings_buyer ON service_bookings(buyer_uid,requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_provider ON service_bookings(provider_uid,requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON service_bookings(status,requested_at DESC);

CREATE TABLE IF NOT EXISTS booking_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id TEXT NOT NULL REFERENCES service_bookings(id) ON DELETE RESTRICT,
  actor_uid TEXT NOT NULL REFERENCES profiles(firebase_uid),
  from_status TEXT,
  to_status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_booking_events_booking ON booking_events(booking_id,id ASC);

CREATE TRIGGER IF NOT EXISTS trg_booking_created AFTER INSERT ON service_bookings
BEGIN
  INSERT INTO booking_events (booking_id,actor_uid,from_status,to_status)
  VALUES (NEW.id,NEW.last_actor_uid,NULL,NEW.status);
END;

CREATE TRIGGER IF NOT EXISTS trg_booking_changed AFTER UPDATE OF status ON service_bookings
WHEN OLD.status <> NEW.status
BEGIN
  INSERT INTO booking_events (booking_id,actor_uid,from_status,to_status)
  VALUES (NEW.id,NEW.last_actor_uid,OLD.status,NEW.status);
END;
