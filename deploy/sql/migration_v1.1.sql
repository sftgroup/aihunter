-- AIHunter V1.1 - LENDING_ARB 策略扩展

-- 策略配置表（4大策略统一管理）
CREATE TABLE IF NOT EXISTS strategies (
    id SERIAL PRIMARY KEY,
    strategy_type VARCHAR(16) NOT NULL DEFAULT 'SNIPER',
    user_id VARCHAR(42) NOT NULL DEFAULT 'paper',
    name VARCHAR(64),
    enabled BOOLEAN DEFAULT TRUE,
    is_atomic BOOLEAN DEFAULT FALSE,
    hf_threshold DECIMAL(4,2) DEFAULT 1.50,
    capital_ratio DECIMAL(5,4) DEFAULT 0.25,
    params JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_strategies_type ON strategies(strategy_type);
CREATE INDEX IF NOT EXISTS idx_strategies_user ON strategies(user_id);

-- 借贷仓位追踪表（LENDING_ARB专用）
CREATE TABLE IF NOT EXISTS lending_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(42) NOT NULL DEFAULT 'paper',
    chain VARCHAR(16) NOT NULL,
    protocol VARCHAR(32) NOT NULL,
    collateral_token VARCHAR(64),
    debt_token VARCHAR(64),
    collateral_amount DECIMAL(30,18) DEFAULT 0,
    debt_amount DECIMAL(30,18) DEFAULT 0,
    current_hf DECIMAL(8,4) DEFAULT 2.0,
    liquidation_price DECIMAL(30,10) DEFAULT 0,
    supply_apy DECIMAL(8,4) DEFAULT 0,
    borrow_apy DECIMAL(8,4) DEFAULT 0,
    rate_spread_bps INT DEFAULT 0,
    status VARCHAR(16) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_check_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_lp_user_hf ON lending_positions(user_id, current_hf);
CREATE INDEX IF NOT EXISTS idx_lp_status ON lending_positions(status);

-- 利率快照表（用于利差监控和学习）
CREATE TABLE IF NOT EXISTS rate_snapshots (
    id BIGSERIAL PRIMARY KEY,
    chain VARCHAR(16) NOT NULL,
    protocol VARCHAR(32) NOT NULL,
    token VARCHAR(64) NOT NULL,
    supply_apy DECIMAL(8,4),
    borrow_apy DECIMAL(8,4),
    utilization_rate DECIMAL(8,4),
    tvl_usd DECIMAL(30,2) DEFAULT 0,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rs_lookup ON rate_snapshots(chain, protocol, token, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_rs_time ON rate_snapshots(recorded_at);
