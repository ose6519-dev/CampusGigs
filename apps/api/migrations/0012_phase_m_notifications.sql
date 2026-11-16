-- Phase M: reversible inbox archiving; unread counts exclude archived activity.
ALTER TABLE user_notifications ADD COLUMN archived_at TEXT;
CREATE INDEX IF NOT EXISTS idx_notifications_active
  ON user_notifications(recipient_uid, archived_at, created_at DESC, id DESC);

-- Following someone again should return the alert to the active inbox.
DROP TRIGGER IF EXISTS trg_notify_follow;
CREATE TRIGGER trg_notify_follow AFTER INSERT ON provider_follows
BEGIN
  INSERT INTO user_notifications(id,recipient_uid,actor_uid,event_key,kind,title,body,target_path)
  VALUES(lower(hex(randomblob(16))),NEW.provider_uid,NEW.follower_uid,
    'follow:'||NEW.provider_uid||':'||NEW.follower_uid,
    'follow','Someone followed you',
    (SELECT display_name FROM profiles WHERE firebase_uid=NEW.follower_uid)||' started following your profile.',
    '/people/'||(SELECT public_id FROM provider_profiles WHERE firebase_uid=NEW.provider_uid))
  ON CONFLICT(event_key) DO UPDATE SET
    is_read=0,archived_at=NULL,
    created_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),body=excluded.body;
END;
