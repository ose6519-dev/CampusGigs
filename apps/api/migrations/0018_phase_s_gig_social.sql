-- Phase S: public gig feed interactions with member-scoped likes and moderated comments.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS gig_likes (
  gig_id TEXT NOT NULL REFERENCES gigs(id) ON DELETE CASCADE,
  member_uid TEXT NOT NULL REFERENCES profiles(firebase_uid) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (gig_id, member_uid)
);
CREATE INDEX IF NOT EXISTS idx_gig_likes_member ON gig_likes(member_uid,created_at DESC);

CREATE TABLE IF NOT EXISTS gig_comments (
  id TEXT PRIMARY KEY NOT NULL,
  gig_id TEXT NOT NULL REFERENCES gigs(id) ON DELETE CASCADE,
  author_uid TEXT NOT NULL REFERENCES profiles(firebase_uid) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 2 AND 800),
  status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','hidden')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_gig_comments_feed ON gig_comments(gig_id,status,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_gig_comments_admin ON gig_comments(status,created_at DESC,id DESC);

CREATE TABLE IF NOT EXISTS gig_comment_moderation (
  id TEXT PRIMARY KEY NOT NULL,
  comment_id TEXT NOT NULL REFERENCES gig_comments(id) ON DELETE CASCADE,
  admin_uid TEXT NOT NULL REFERENCES profiles(firebase_uid),
  decision TEXT NOT NULL CHECK (decision IN ('hidden','visible')),
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
