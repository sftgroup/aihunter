-- ============================================================
-- AIHunter V3 Phase 0: Base Schema Migration
-- Date: 2026-06-26
-- ============================================================

-- 1. strategy_configs: 统一策略配置表
CREATE TABLE IF NOT EXISTS strategy_configs (
    id              BIGSERIAL PRIMARY KEY,
    user_id         VARCHAR(128) NOT NULL,
    strategy_id     VARCHAR(64) NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    min_score       NUMERIC(8,4) DEFAULT 0,
    max_single_amount NUMERIC(32,8) DEFAULT 0,
    gas_strategy    VARCHAR(32) DEFAULT 'standard',
    slippage_tolerance NUMERIC(8,6) DEFAULT 0.005,
    daily_max_loss_usdt NUMERIC(20,8) DEFAULT 0,
    max_concurrent  INT DEFAULT 1,
    min_balance_usdt NUMERIC(20,8) DEFAULT 0,
    extra_config    JSONB DEFAULT '{}'::JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, strategy_id)
);

-- 2. trade_records: 统一交易记录表
CREATE TABLE IF NOT EXISTS trade_records (
    id              BIGSERIAL PRIMARY KEY,
    user_id         VARCHAR(128) NOT NULL,
    strategy_id     VARCHAR(64) NOT NULL,
    signal_id       VARCHAR(128),
    chain           VARCHAR(32) NOT NULL,
    token_address   VARCHAR(128) NOT NULL,
    token_symbol    VARCHAR(32),
    action          VARCHAR(16) NOT NULL,        -- buy / sell / swap
    amount_in       NUMERIC(32,8) DEFAULT 0,
    amount_out      NUMERIC(32,8) DEFAULT 0,
    entry_price_usd NUMERIC(20,8) DEFAULT 0,
    exit_price_usd  NUMERIC(20,8) DEFAULT 0,
    gross_profit_usdt  NUMERIC(20,8) DEFAULT 0,
    gas_cost_usdt      NUMERIC(20,8) DEFAULT 0,
    slippage_loss_usdt NUMERIC(20,8) DEFAULT 0,
    net_pnl_usdt    NUMERIC(20,8) DEFAULT 0,
    tx_hash         VARCHAR(128),
    tx_hash_2       VARCHAR(128),
    execution_detail JSONB DEFAULT '{}'::JSONB,
    status          VARCHAR(32) NOT NULL DEFAULT 'pending',  -- pending / executing / completed / failed / cancelled
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_trade_records_user_strategy_created
    ON trade_records (user_id, strategy_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_records_status
    ON trade_records (status);
CREATE INDEX IF NOT EXISTS idx_trade_records_tx_hash
    ON trade_records (tx_hash);

-- 3. learning_history: 学习历史表
CREATE TABLE IF NOT EXISTS learning_history (
    id              BIGSERIAL PRIMARY KEY,
    strategy_id     VARCHAR(64) NOT NULL,
    learning_type   VARCHAR(32) NOT NULL,        -- backtest / paper / live
    experience_count INT DEFAULT 0,
    best_params     JSONB DEFAULT '{}'::JSONB,
    best_score      NUMERIC(12,4) DEFAULT 0,
    rules_generated JSONB DEFAULT '{}'::JSONB,
    status          VARCHAR(32) NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. strategy_registry: 策略注册持久化表
CREATE TABLE IF NOT EXISTS strategy_registry (
    strategy_id     VARCHAR(64) PRIMARY KEY,
    category        VARCHAR(32) NOT NULL,
    display_name    VARCHAR(128) NOT NULL,
    description     TEXT,
    icon            VARCHAR(64),
    enabled         BOOLEAN NOT NULL DEFAULT FALSE,
    registration    JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 初始插入 3 个策略注册记录 (ON CONFLICT 容错)
INSERT INTO strategy_registry (strategy_id, category, display_name, description, icon, enabled, registration)
VALUES
('momentum', 'dex', '动量突破', '基于链上动量指标的突破交易策略', '⚡', TRUE,
 '{"version":"3.0","worker_class":"MomentumWorker","worker_file":"momentum.js","signal_type":"momentum_signal","trader_class":"MomentumTrader","trader_file":"momentum.js"}'::JSONB),
('spread_arbitrage', 'defi', 'DEX价差套利', '跨DEX价格差异套利策略', '🔄', TRUE,
 '{"version":"3.0","worker_class":"SpreadArbitrageWorker","worker_file":"spread_arbitrage.js","signal_type":"spread_signal","trader_class":"SpreadArbitrageTrader","trader_file":"spread_arbitrage.js"}'::JSONB),
('lending_arbitrage', 'defi', '借贷利率套利', '跨协议借贷利率差异套利策略', '💰', TRUE,
 '{"version":"3.0","worker_class":"LendingArbitrageWorker","worker_file":"lending_arbitrage.js","signal_type":"lending_signal","trader_class":"LendingArbitrageTrader","trader_file":"lending_arbitrage.js"}'::JSONB)
ON CONFLICT (strategy_id) DO UPDATE SET
    category        = EXCLUDED.category,
    display_name    = EXCLUDED.display_name,
    description     = EXCLUDED.description,
    icon            = EXCLUDED.icon,
    enabled         = EXCLUDED.enabled,
    registration    = EXCLUDED.registration,
    updated_at      = NOW();

-- ============================================================
-- Phase 3: 学习引擎表
-- ============================================================
CREATE TABLE IF NOT EXISTS learning_rules (
    id SERIAL PRIMARY KEY,
    strategy_id VARCHAR(64) NOT NULL,
    rule_type VARCHAR(32) NOT NULL,        -- 'threshold' | 'action' | 'param'
    rule_key VARCHAR(64) NOT NULL,          -- 'min_score' | 'max_single_amount' | ...
    rule_value NUMERIC NOT NULL,
    reason TEXT,
    confidence NUMERIC DEFAULT 0.5,
    applied BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_learning_rules_strategy ON learning_rules(strategy_id, rule_type);
