-- Phase P: opt-in end-to-end encrypted chats, with legacy messages retained visibly.
-- Public keys only. Private keys never reach D1, Workers, or R2.
CREATE TABLE IF NOT EXISTS chat_identity_keys (
  user_uid TEXT PRIMARY KEY NOT NULL REFERENCES profiles(firebase_uid) ON DELETE RESTRICT,
  public_x TEXT NOT NULL CHECK(length(public_x)=43),
  public_y TEXT NOT NULL CHECK(length(public_y)=43),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS chat_security (
  booking_id TEXT PRIMARY KEY NOT NULL REFERENCES service_bookings(id) ON DELETE RESTRICT,
  enabled_by_uid TEXT NOT NULL REFERENCES profiles(firebase_uid) ON DELETE RESTRICT,
  enabled_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
ALTER TABLE chat_messages ADD COLUMN cipher_version INTEGER NOT NULL DEFAULT 0 CHECK(cipher_version IN (0,1));
ALTER TABLE chat_uploads ADD COLUMN cipher_version INTEGER NOT NULL DEFAULT 0 CHECK(cipher_version IN (0,1));
ALTER TABLE chat_uploads ADD COLUMN encrypted_kind TEXT;

-- Keep this invariant inside D1, even if a stale Worker receives a write.
CREATE TRIGGER IF NOT EXISTS trg_chat_secure_no_plaintext BEFORE INSERT ON chat_messages
WHEN EXISTS(SELECT 1 FROM chat_security WHERE booking_id=NEW.booking_id)
  AND (NEW.cipher_version<>1 OR substr(NEW.body,1,4)<>'cg1.')
BEGIN
  SELECT RAISE(ABORT,'Secure chat requires encrypted messages');
END;
