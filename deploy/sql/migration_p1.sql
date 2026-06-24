-- AIHunter P1 Migration: Risk Control Fields
ALTER TABLE live_trading_configs ADD COLUMN IF NOT EXISTS daily_max_loss DECIMAL(12,2) DEFAULT 0;
ALTER TABLE live_trading_configs ADD COLUMN IF NOT EXISTS max_holdings INT DEFAULT 0;
ALTER TABLE live_trade_records ADD COLUMN IF NOT EXISTS tx_hash VARCHAR(66);
ALTER TABLE live_trade_records ADD COLUMN IF NOT EXISTS chain VARCHAR(16);
