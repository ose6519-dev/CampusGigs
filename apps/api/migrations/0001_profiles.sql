-- CampusGigs D1 ONLY. Never run against the CampSell database.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS profiles (
  firebase_uid TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL,
  avatar_url TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  campus TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  active_mode TEXT NOT NULL DEFAULT 'buying' CHECK(active_mode IN ('buying', 'providing')),
  account_status TEXT NOT NULL DEFAULT 'active' CHECK(account_status IN ('active', 'suspended')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS platform_roles (
  firebase_uid TEXT PRIMARY KEY NOT NULL REFERENCES profiles(firebase_uid) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('admin', 'moderator')),
  granted_by_uid TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_profiles_mode ON profiles(active_mode);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(account_status);

CREATE TABLE IF NOT EXISTS api_rate_limits (
  key TEXT PRIMARY KEY NOT NULL,
  bucket INTEGER NOT NULL,
  hits INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_api_rate_limits_bucket ON api_rate_limits(bucket);

