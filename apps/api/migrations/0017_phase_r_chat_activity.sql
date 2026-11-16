-- Phase R: ephemeral chat activity; visible only to booking participants.
ALTER TABLE chat_typing ADD COLUMN activity TEXT NOT NULL DEFAULT 'typing' CHECK(activity IN ('typing','recording'));
