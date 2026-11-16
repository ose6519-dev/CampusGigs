-- Phase G: private, account-scoped in-app activity. No external push or payments.
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS user_notifications (
  id TEXT PRIMARY KEY NOT NULL,
  recipient_uid TEXT NOT NULL REFERENCES profiles(firebase_uid) ON DELETE CASCADE,
  actor_uid TEXT REFERENCES profiles(firebase_uid) ON DELETE SET NULL,
  event_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK(kind IN ('follow','booking_requested','booking_accepted','booking_declined','booking_cancelled','provider_review')),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  target_path TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0 CHECK(is_read IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_inbox ON user_notifications(recipient_uid,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON user_notifications(recipient_uid,is_read);

CREATE TRIGGER IF NOT EXISTS trg_notify_follow AFTER INSERT ON provider_follows
BEGIN
  INSERT INTO user_notifications(id,recipient_uid,actor_uid,event_key,kind,title,body,target_path)
  VALUES(lower(hex(randomblob(16))),NEW.provider_uid,NEW.follower_uid,
    'follow:'||NEW.provider_uid||':'||NEW.follower_uid,
    'follow','Someone followed you',
    (SELECT display_name FROM profiles WHERE firebase_uid=NEW.follower_uid)||' started following your profile.',
    '/people/'||(SELECT public_id FROM provider_profiles WHERE firebase_uid=NEW.provider_uid))
  ON CONFLICT(event_key) DO UPDATE SET
    is_read=0,created_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),body=excluded.body;
END;

CREATE TRIGGER IF NOT EXISTS trg_notify_booking_request AFTER INSERT ON service_bookings
BEGIN
  INSERT OR IGNORE INTO user_notifications(id,recipient_uid,actor_uid,event_key,kind,title,body,target_path)
  VALUES(lower(hex(randomblob(16))),NEW.provider_uid,NEW.buyer_uid,
    'booking-request:'||NEW.id,'booking_requested','New service request',
    'You have a request for '||NEW.service_title||'.','/bookings');
END;

CREATE TRIGGER IF NOT EXISTS trg_notify_booking_decision AFTER UPDATE OF status ON service_bookings
WHEN OLD.status<>NEW.status
BEGIN
  INSERT OR IGNORE INTO user_notifications(id,recipient_uid,actor_uid,event_key,kind,title,body,target_path)
  VALUES(lower(hex(randomblob(16))),
    CASE WHEN NEW.status='cancelled' THEN NEW.provider_uid ELSE NEW.buyer_uid END,
    NEW.last_actor_uid,'booking-'||NEW.status||':'||NEW.id,
    CASE NEW.status WHEN 'accepted' THEN 'booking_accepted' WHEN 'declined' THEN 'booking_declined' ELSE 'booking_cancelled' END,
    CASE NEW.status WHEN 'accepted' THEN 'Request accepted' WHEN 'declined' THEN 'Request declined' ELSE 'Request cancelled' END,
    NEW.service_title,'/bookings');
END;

CREATE TRIGGER IF NOT EXISTS trg_notify_provider_review AFTER UPDATE OF status ON provider_applications
WHEN OLD.status='pending' AND NEW.status IN ('approved','rejected','changes_requested')
BEGIN
  INSERT OR IGNORE INTO user_notifications(id,recipient_uid,actor_uid,event_key,kind,title,body,target_path)
  VALUES(lower(hex(randomblob(16))),NEW.firebase_uid,NEW.reviewed_by_uid,
    'provider-review:'||NEW.id||':'||NEW.revision,'provider_review',
    CASE NEW.status WHEN 'approved' THEN 'Provider approved' WHEN 'rejected' THEN 'Application declined' ELSE 'Application needs changes' END,
    CASE NEW.status WHEN 'approved' THEN 'Your provider profile is verified.' ELSE COALESCE(NULLIF(NEW.review_note,''),'Check your application.') END,
    '/provide');
END;
