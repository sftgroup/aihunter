-- AIHunter 数据库迁移 20260623
-- 补齐 init.sql 和现有迁移中缺失的表定义
-- 涉及表: sys_config, paper_trades, paper_config, equity_snapshots,
--         price_snapshots, learning_history

-- ============================================================
-- 1. 系统配置表（键值对存储，用于 API Key 等全局配置）
-- ============================================================
CREATE TABLE IF NOT EXISTS sys_config (
    key VARCHAR(64) PRIMARY KEY,
    value TEXT,
    description VARCHAR(256),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. 模拟交易记录表（paper trading 订单簿）
-- ============================================================
CREATE TABLE IF NOT EXISTS paper_trades (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(42) NOT NULL DEFAULT 'paper',
    chain VARCHAR(16) NOT NULL,
    contract VARCHAR(64) NOT NULL,
    symbol VARCHAR(32),
    side VARCHAR(8) NOT NULL DEFAULT 'BUY',
    status VARCHAR(16) NOT NULL DEFAULT 'open',
    entry_price DECIMAL(30,18),
    amount_usd DECIMAL(30,2),
    quantity DECIMAL(30,18),
    price_impact DECIMAL(8,4),
    confidence DECIMAL(5,2),
    risk_level VARCHAR(16) DEFAULT 'medium',
    flags JSONB DEFAULT '[]',
    liquidity_usd DECIMAL(30,2),
    exit_price DECIMAL(30,18),
    exit_quantity DECIMAL(30,18),
    exit_amount_usd DECIMAL(30,2),
    pnl_usd DECIMAL(30,2),
    pnl_pct DECIMAL(8,4),
    sell_price_impact DECIMAL(8,4),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pt_user_status ON paper_trades(user_id, status);
CREATE INDEX IF NOT EXISTS idx_pt_contract ON paper_trades(chain, contract);
CREATE INDEX IF NOT EXISTS idx_pt_created ON paper_trades(created_at DESC);

-- ============================================================
-- 3. 模拟交易配置表（止盈止损、金额限制等）
-- ============================================================
CREATE TABLE IF NOT EXISTS paper_config (
    user_id VARCHAR(42) PRIMARY KEY DEFAULT 'paper',
    enabled BOOLEAN DEFAULT TRUE,
    min_amount DECIMAL(12,2) DEFAULT 100,
    max_amount DECIMAL(12,2) DEFAULT 500,
    take_profit_pct DECIMAL(5,2) DEFAULT 30,
    stop_loss_pct DECIMAL(5,2) DEFAULT -20,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4. 权益快照表（模拟账户权益曲线）
-- ============================================================
CREATE TABLE IF NOT EXISTS equity_snapshots (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(42) NOT NULL DEFAULT 'paper',
    balance DECIMAL(30,2),
    total_pnl DECIMAL(30,2),
    total_trades INT DEFAULT 0,
    win_rate DECIMAL(5,2),
    snapshot_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_es_user_time ON equity_snapshots(user_id, snapshot_at ASC);

-- ============================================================
-- 5. 价格快照表（高频价格记录，用于盘中分析）
-- ============================================================
CREATE TABLE IF NOT EXISTS price_snapshots (
    id BIGSERIAL PRIMARY KEY,
    chain VARCHAR(16) NOT NULL,
    contract VARCHAR(64) NOT NULL,
    symbol VARCHAR(32),
    price DECIMAL(30,18) NOT NULL,
    liquidity_usd DECIMAL(30,2),
    token_reserve DECIMAL(30,0),
    paired_reserve DECIMAL(30,0),
    snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ps_chain_contract ON price_snapshots(chain, contract, snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_ps_snapshot ON price_snapshots(snapshot_at);

-- ============================================================
-- 6. 学习历史表（AI 自学习引擎记录）
-- ============================================================
CREATE TABLE IF NOT EXISTS learning_history (
    id BIGSERIAL PRIMARY KEY,
    strategy VARCHAR(32) NOT NULL,
    params JSONB,
    rules JSONB,
    score DECIMAL(8,4),
    experience_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lh_strategy ON learning_history(strategy, created_at DESC);
