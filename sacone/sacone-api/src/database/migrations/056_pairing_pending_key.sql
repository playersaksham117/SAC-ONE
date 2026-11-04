-- A pairing code also carries a key held in reserve: its QR then works with every SAC-POS version
-- (older apps scan the key, newer ones may use the code). The key becomes the terminal's key only
-- when a device first uses it, so making a code still disconnects nobody.
ALTER TABLE pos_device_pairing_codes ADD COLUMN pending_key_hash TEXT;
ALTER TABLE pos_device_pairing_codes ADD COLUMN pending_key_prefix TEXT;
CREATE INDEX IF NOT EXISTS idx_pos_pairing_pending_key ON pos_device_pairing_codes(pending_key_hash);
