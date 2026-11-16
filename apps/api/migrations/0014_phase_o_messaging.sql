-- Phase O: booking-scoped private conversations. No public media URLs.
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY NOT NULL,
  booking_id TEXT NOT NULL REFERENCES service_bookings(id) ON DELETE RESTRICT,
  sender_uid TEXT NOT NULL REFERENCES profiles(firebase_uid) ON DELETE RESTRICT,
  client_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('text','image','video','file','audio','sticker')),
  body TEXT NOT NULL DEFAULT '' CHECK(length(body)<=2000),
  upload_id TEXT UNIQUE REFERENCES chat_uploads(id),
  reply_to TEXT REFERENCES chat_messages(id),
  pinned_by_uid TEXT REFERENCES profiles(firebase_uid),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(booking_id,sender_uid,client_id),
  CHECK(length(body)>0 OR upload_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_booking ON chat_messages(booking_id,created_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS chat_uploads (
  id TEXT PRIMARY KEY NOT NULL,
  booking_id TEXT NOT NULL REFERENCES service_bookings(id) ON DELETE RESTRICT,
  owner_uid TEXT NOT NULL REFERENCES profiles(firebase_uid) ON DELETE RESTRICT,
  object_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 1 AND 12582912),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_chat_uploads_booking ON chat_uploads(booking_id,owner_uid);
CREATE TABLE IF NOT EXISTS chat_reactions (
  message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  reactor_uid TEXT NOT NULL REFERENCES profiles(firebase_uid) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  PRIMARY KEY(message_id,reactor_uid)
);
CREATE TABLE IF NOT EXISTS chat_receipts (
  booking_id TEXT NOT NULL REFERENCES service_bookings(id) ON DELETE CASCADE,
  user_uid TEXT NOT NULL REFERENCES profiles(firebase_uid) ON DELETE CASCADE,
  last_read_at TEXT NOT NULL,
  PRIMARY KEY(booking_id,user_uid)
);
CREATE TABLE IF NOT EXISTS chat_typing (
  booking_id TEXT NOT NULL REFERENCES service_bookings(id) ON DELETE CASCADE,
  user_uid TEXT NOT NULL REFERENCES profiles(firebase_uid) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  PRIMARY KEY(booking_id,user_uid)
);
CREATE TABLE IF NOT EXISTS chat_preferences (
  booking_id TEXT NOT NULL REFERENCES service_bookings(id) ON DELETE CASCADE,
  user_uid TEXT NOT NULL REFERENCES profiles(firebase_uid) ON DELETE CASCADE,
  wallpaper TEXT NOT NULL DEFAULT 'warm',
  muted INTEGER NOT NULL DEFAULT 0 CHECK(muted IN (0,1)),
  PRIMARY KEY(booking_id,user_uid)
);
