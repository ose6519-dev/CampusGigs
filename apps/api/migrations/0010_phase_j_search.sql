-- CampusGigs only. Public handles and private, per-account search history.
ALTER TABLE profiles ADD COLUMN cg_username TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_cg_username ON profiles(cg_username COLLATE NOCASE);
UPDATE profiles SET cg_username = 'cg' || lower(hex(randomblob(8))) WHERE cg_username IS NULL;

CREATE TABLE IF NOT EXISTS member_search_history (
  id TEXT PRIMARY KEY NOT NULL,
  firebase_uid TEXT NOT NULL REFERENCES profiles(firebase_uid) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('gigs','people')),
  query TEXT NOT NULL,
  query_key TEXT NOT NULL,
  state_name TEXT NOT NULL DEFAULT '',
  institution_id TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  location_name TEXT NOT NULL DEFAULT '',
  last_used_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(firebase_uid,kind,query_key,state_name,institution_id,category,location_name)
);
CREATE INDEX IF NOT EXISTS idx_member_search_recent ON member_search_history(firebase_uid,kind,last_used_at DESC);
