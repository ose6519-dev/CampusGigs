-- Phase I: private by default for ordinary members; approved providers retain prior discovery.
ALTER TABLE profiles ADD COLUMN directory_preference TEXT NOT NULL DEFAULT 'default'
  CHECK(directory_preference IN ('default','public','private'));
ALTER TABLE profiles ADD COLUMN member_public_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_member_public_id ON profiles(member_public_id);
CREATE INDEX IF NOT EXISTS idx_profiles_directory_state ON profiles(directory_preference,state_name,institution_id);

CREATE TABLE IF NOT EXISTS member_follows (
  follower_uid TEXT NOT NULL REFERENCES profiles(firebase_uid) ON DELETE CASCADE,
  member_uid TEXT NOT NULL REFERENCES profiles(firebase_uid) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(follower_uid,member_uid),
  CHECK(follower_uid != member_uid)
);
CREATE INDEX IF NOT EXISTS idx_member_follows_target ON member_follows(member_uid);

CREATE TRIGGER IF NOT EXISTS trg_notify_member_follow AFTER INSERT ON member_follows
BEGIN
  INSERT INTO user_notifications(id,recipient_uid,actor_uid,event_key,kind,title,body,target_path)
  VALUES(lower(hex(randomblob(16))),NEW.member_uid,NEW.follower_uid,
    'member-follow:'||NEW.member_uid||':'||NEW.follower_uid,
    'follow','Someone followed you',
    (SELECT display_name FROM profiles WHERE firebase_uid=NEW.follower_uid)||' started following your profile.',
    '/people/'||(SELECT member_public_id FROM profiles WHERE firebase_uid=NEW.member_uid))
  ON CONFLICT(event_key) DO UPDATE SET
    is_read=0,created_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),body=excluded.body;
END;
