-- 历史价格记录表（离线回测用）
CREATE TABLE IF NOT EXISTS historical_prices (
    id BIGSERIAL PRIMARY KEY,
    chain VARCHAR(16) NOT NULL,
    contract VARCHAR(64) NOT NULL,
    symbol VARCHAR(32),
    price DECIMAL(30,18) NOT NULL,
    liquidity_usd DECIMAL(30,2),
    token_reserve DECIMAL(30,0),
    paired_reserve DECIMAL(30,0),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hp_chain_contract ON historical_prices(chain, contract);
CREATE INDEX IF NOT EXISTS idx_hp_recorded ON historical_prices(recorded_at);
CREATE INDEX IF NOT EXISTS idx_hp_lookup ON historical_prices(chain, contract, recorded_at DESC);

-- 回测结果表
CREATE TABLE IF NOT EXISTS backtest_results (
    id SERIAL PRIMARY KEY,
    strategy VARCHAR(64) DEFAULT 'signal_follow',
    chain VARCHAR(16),
    hours INT DEFAULT 6,
    per_amount_usd DECIMAL(12,2) DEFAULT 100,
    total_trades INT DEFAULT 0,
    wins INT DEFAULT 0,
    total_pnl DECIMAL(12,2) DEFAULT 0,
    win_rate DECIMAL(5,2) DEFAULT 0,
    max_drawdown DECIMAL(5,2) DEFAULT 0,
    sharpe_ratio DECIMAL(6,3) DEFAULT 0,
    stats JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
