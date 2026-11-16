-- CampusGigs D1 ONLY. Additive Phase B migration. Never run on CampSell.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS provider_applications (
  id TEXT PRIMARY KEY NOT NULL,
  firebase_uid TEXT NOT NULL UNIQUE REFERENCES profiles(firebase_uid) ON DELETE RESTRICT,
  skill_categories TEXT NOT NULL,
  location_name TEXT NOT NULL,
  location_kind TEXT NOT NULL CHECK(location_kind IN ('campus', 'city')),
  bio TEXT NOT NULL,
  evidence_type TEXT NOT NULL CHECK(evidence_type IN ('student_id', 'government_id')),
  evidence_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'changes_requested')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  review_note TEXT NOT NULL DEFAULT '',
  reviewed_by_uid TEXT REFERENCES profiles(firebase_uid),
  submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  reviewed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_provider_applications_status ON provider_applications(status, submitted_at DESC);

CREATE TABLE IF NOT EXISTS provider_profiles (
  firebase_uid TEXT PRIMARY KEY NOT NULL REFERENCES profiles(firebase_uid) ON DELETE RESTRICT,
  application_id TEXT NOT NULL UNIQUE REFERENCES provider_applications(id),
  verified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  approved_by_uid TEXT NOT NULL REFERENCES profiles(firebase_uid),
  provider_status TEXT NOT NULL DEFAULT 'active' CHECK(provider_status IN ('active', 'suspended'))
);

CREATE TABLE IF NOT EXISTS provider_review_events (
  id TEXT PRIMARY KEY NOT NULL,
  application_id TEXT NOT NULL REFERENCES provider_applications(id),
  admin_uid TEXT NOT NULL REFERENCES profiles(firebase_uid),
  decision TEXT NOT NULL CHECK(decision IN ('approved', 'rejected', 'changes_requested')),
  note TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(application_id, revision)
);

CREATE TABLE IF NOT EXISTS gigs (
  id TEXT PRIMARY KEY NOT NULL,
  provider_uid TEXT NOT NULL REFERENCES provider_profiles(firebase_uid) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 8 AND 100),
  description TEXT NOT NULL CHECK(length(description) BETWEEN 40 AND 3000),
  category TEXT NOT NULL,
  price_kobo INTEGER NOT NULL CHECK(price_kobo BETWEEN 10000 AND 1000000000),
  delivery_days INTEGER NOT NULL CHECK(delivery_days BETWEEN 1 AND 90),
  location_type TEXT NOT NULL CHECK(location_type IN ('online', 'in_person', 'both')),
  location_name TEXT NOT NULL,
  payment_option TEXT NOT NULL CHECK(payment_option IN ('full', 'deposit', 'preview')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused', 'removed')),
  moderation_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_gigs_public ON gigs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gigs_provider ON gigs(provider_uid, created_at DESC);

CREATE TABLE IF NOT EXISTS gig_images (
  id TEXT PRIMARY KEY NOT NULL,
  gig_id TEXT NOT NULL REFERENCES gigs(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  media_type TEXT NOT NULL CHECK(media_type IN ('image/jpeg', 'image/png', 'image/webp')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_gig_images_gig ON gig_images(gig_id, created_at);

CREATE TABLE IF NOT EXISTS gig_moderation_events (
  id TEXT PRIMARY KEY NOT NULL,
  gig_id TEXT NOT NULL REFERENCES gigs(id),
  admin_uid TEXT NOT NULL REFERENCES profiles(firebase_uid),
  decision TEXT NOT NULL CHECK(decision IN ('removed', 'restored')),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
