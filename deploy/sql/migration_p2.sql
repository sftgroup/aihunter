-- Migration P2: Extend tx_hash column to support longer transaction hashes
ALTER TABLE live_trade_records ALTER COLUMN tx_hash TYPE VARCHAR(128);
