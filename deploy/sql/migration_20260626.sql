CREATE TABLE IF NOT EXISTS arb_configs (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL UNIQUE,
    min_spread_pct NUMERIC(6,4) DEFAULT 1.5,
    max_slippage_pct NUMERIC(6,4) DEFAULT 2.0,
    gas_cap_gwei NUMERIC(8,2) DEFAULT 50,
    min_profit_usdt NUMERIC(12,2) DEFAULT 5,
    chains TEXT[] DEFAULT ARRAY['eth','bsc','base'],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS arb_opportunities (
    id BIGSERIAL PRIMARY KEY,
    chain VARCHAR(16) NOT NULL,
    token_pair VARCHAR(32) NOT NULL,
    buy_dex VARCHAR(64) NOT NULL,
    sell_dex VARCHAR(64) NOT NULL,
    buy_price NUMERIC(24,8) NOT NULL,
    sell_price NUMERIC(24,8) NOT NULL,
    spread_pct NUMERIC(8,6) NOT NULL,
    estimated_profit_usdt NUMERIC(12,4),
    gas_estimate_usdt NUMERIC(12,4),
    scanned_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS arb_trades (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL,
    chain VARCHAR(16) NOT NULL,
    token_pair VARCHAR(32),
    buy_dex VARCHAR(64),
    sell_dex VARCHAR(64),
    amount_in NUMERIC(24,8) NOT NULL DEFAULT 0,
    amount_in_usdt NUMERIC(12,4),
    gross_profit_usdt NUMERIC(12,4),
    gas_cost_usdt NUMERIC(12,4),
    slippage_loss_usdt NUMERIC(12,4),
    net_profit_usdt NUMERIC(12,4),
    status VARCHAR(16) DEFAULT 'pending',
    fail_reason TEXT,
    tx_hash_buy VARCHAR(128),
    tx_hash_sell VARCHAR(128),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_arb_trades_user ON arb_trades(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_arb_trades_status ON arb_trades(status);
