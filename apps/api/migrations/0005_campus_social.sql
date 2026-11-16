-- CampusGigs only: canonical institution search, scoped gigs and opt-in public presence.
CREATE TABLE IF NOT EXISTS institutions (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  state_name TEXT NOT NULL,
  institution_type TEXT NOT NULL CHECK(institution_type IN ('university','polytechnic','college')),
  aliases TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_institutions_state_name ON institutions(state_name,name);

ALTER TABLE profiles ADD COLUMN state_name TEXT NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN institution_id TEXT REFERENCES institutions(id);
ALTER TABLE profiles ADD COLUMN show_online INTEGER NOT NULL DEFAULT 0 CHECK(show_online IN (0,1));
ALTER TABLE profiles ADD COLUMN last_seen_at TEXT;

ALTER TABLE gigs ADD COLUMN state_name TEXT NOT NULL DEFAULT '';
ALTER TABLE gigs ADD COLUMN institution_id TEXT REFERENCES institutions(id);
CREATE INDEX IF NOT EXISTS idx_gigs_state_institution ON gigs(status,state_name,institution_id,created_at DESC);

ALTER TABLE provider_profiles ADD COLUMN public_id TEXT;
UPDATE provider_profiles SET public_id=lower(hex(randomblob(16))) WHERE public_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_public_id ON provider_profiles(public_id);

CREATE TABLE IF NOT EXISTS provider_follows (
  follower_uid TEXT NOT NULL REFERENCES profiles(firebase_uid) ON DELETE CASCADE,
  provider_uid TEXT NOT NULL REFERENCES provider_profiles(firebase_uid) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (follower_uid,provider_uid),
  CHECK (follower_uid != provider_uid)
);
CREATE INDEX IF NOT EXISTS idx_follows_provider ON provider_follows(provider_uid);
