-- AIHunter 数据库初始化（轻量版）

-- 用户白名单
CREATE TABLE IF NOT EXISTS whitelist_users (
    id SERIAL PRIMARY KEY,
    address VARCHAR(42) UNIQUE NOT NULL,
    label VARCHAR(64),
    max_position_usd DECIMAL DEFAULT 1000,
    daily_trade_limit INT DEFAULT 20,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 链上事件流
CREATE TABLE IF NOT EXISTS events (
    id BIGSERIAL PRIMARY KEY,
    time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    chain VARCHAR(16) NOT NULL,
    contract VARCHAR(42),
    event_type VARCHAR(32) NOT NULL,
    tx_hash VARCHAR(66),
    payload JSONB,
    processed BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_events_ct ON events(contract, time DESC);
CREATE INDEX IF NOT EXISTS idx_events_unprocessed ON events(processed, time) WHERE processed = FALSE;

-- 交易经验记录（自学习燃料）
CREATE TABLE IF NOT EXISTS trade_experiences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(42),
    chain VARCHAR(16),
    strategy_type VARCHAR(32),
    mode VARCHAR(16) DEFAULT 'paper',
    features_snapshot JSONB,
    params_used JSONB,
    market_context JSONB,
    outcome JSONB,
    success_label VARCHAR(16),
    executed_at TIMESTAMPTZ DEFAULT NOW(),
    rule_version VARCHAR(32)
);
CREATE INDEX IF NOT EXISTS idx_experiences_strategy ON trade_experiences(strategy_type, executed_at DESC);

-- 规则版本
CREATE TABLE IF NOT EXISTS rule_versions (
    version_id VARCHAR(32) PRIMARY KEY,
    strategy_type VARCHAR(32) NOT NULL,
    rules JSONB,
    performance JSONB,
    status VARCHAR(16) DEFAULT 'draft',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    promoted_from VARCHAR(32)
);

-- 订单记录
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(42),
    chain VARCHAR(16),
    strategy_id UUID,
    mode VARCHAR(16) DEFAULT 'live',
    status VARCHAR(16) DEFAULT 'pending',
    tx_hash VARCHAR(66),
    pnl_usd DECIMAL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 收益仓位
CREATE TABLE IF NOT EXISTS yield_positions (
    user_id VARCHAR(42) PRIMARY KEY,
    chain VARCHAR(16),
    protocol VARCHAR(32),
    balance_usd DECIMAL DEFAULT 0,
    apy_current DECIMAL,
    last_rebalance TIMESTAMPTZ
);
