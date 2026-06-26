# AIHunter V3 详细技术方案

> **版本**: 1.0 | **日期**: 2026-06-26 | **作者**: Wayne (架构师)
>
> **关联 PRD**: AIHunter V3 三层架构重构蓝图

---

## 目录

1. [总体架构](#1-总体架构)
2. [数据库设计](#2-数据库设计)
3. [后端 API 设计](#3-后端-api-设计)
4. [Redis 通道设计](#4-redis-通道设计)
5. [前端组件设计](#5-前端组件设计)
6. [Worker 改造方案](#6-worker-改造方案)
7. [学习层改造方案](#7-学习层改造方案)
8. [部署与运维](#8-部署与运维)
9. [测试策略](#9-测试策略)
10. [实施排期](#10-实施排期)

---

## 1. 总体架构

### 1.1 部署拓扑

```
┌───────────────────────────────────────────────────────────┐
│                    测试服务器 129.226.202.72                 │
│                                                           │
│  ┌─────────────┐  ┌─────────────┐  ┌───────────────┐     │
│  │  Nginx :80  │  │  Frontend   │  │  PostgreSQL   │     │
│  │  / /shop    │  │  :3000      │  │  :5432        │     │
│  │  / /smart   │  │  React Vite │  │               │     │
│  └──────┬──────┘  └──────┬──────┘  └───────┬───────┘     │
│         │                │                  │              │
│         ▼                ▼                  ▼              │
│  ┌──────────┐  ┌──────────────────┐  ┌─────────────┐     │
│  │  Gateway │  │  Worker (Python) │  │   Redis     │     │
│  │  :3100   │  │  扫描+信号发布   │  │   :6379     │     │
│  │  Fastify │  └────────┬─────────┘  └──────┬──────┘     │
│  │          │           │                   │             │
│  │ 执行层   │←─信号───→─┘                   │             │
│  │ 学习触发 │←─────────────────────────────→│             │
│  └────┬─────┘                              │             │
│       │                                    │             │
│       ▼                                    ▼             │
│  ┌──────────────────┐  ┌──────────────────────┐         │
│  │  OKX OnchainOS   │  │  Learning (Python)   │         │
│  │  DEX Aggregator  │  │  Optuna + DeepSeek   │         │
│  └──────────────────┘  └──────────────────────┘         │
└───────────────────────────────────────────────────────────┘
```

### 1.2 数据流

```
Worker(mature_meme.py/arbitrage.py)
  │  扫描链上 → 评分 → 发现机会
  │
  ▼
Redis PUBLISH trade:signals:{strategy_id}
  │  统一 SignalPayload JSON
  │
  ├──► Gateway 执行层 (SignalDispatcher)
  │      │  lazy load → MomentumTrader / ArbitrageTrader
  │      │  BaseAutoTrader 9步管道
  │      ▼
  │    okx-trade.js → OKX API → 链上交易
  │      │
  │      ▼
  │    trade_records 表
  │      │
  │      ▼
  │    Redis PUBLISH learning:trigger
  │
  └──► WebSocket → 前端 /live 实时展示
         │
         ▼
      前端 /trade /defi → 信号流展示
      前端 /live → 交易记录流 + 启停控制
```

### 1.3 技术栈

| 层 | 技术 | 说明 |
|----|------|------|
| 前端 | React 18 + TypeScript + Vite + TailwindCSS | 保持不变 |
| 网关 | Node.js 22 + Fastify | 保持不变 |
| Worker | Python 3.11 + asyncio + redis-py | 保持不变 |
| 学习 | Python 3.11 + Optuna + DeepSeek API | 保持不变 |
| 数据库 | PostgreSQL 16 | 保持不变 |
| 缓存/消息 | Redis 7 | 新增 PUB/SUB |
| 执行 | OKX OnchainOS DEX Aggregator API | 保持不变 |
| 钱包 | onchainos CLI (Agentic Wallet) | 保持不变 |

---

## 2. 数据库设计

### 2.1 新增表: strategy_configs (统一策略配置)

```sql
-- V3 统一策略配置表 (替代散落在各处的配置)
CREATE TABLE IF NOT EXISTS strategy_configs (
    id              BIGSERIAL PRIMARY KEY,
    user_id         TEXT NOT NULL,
    strategy_id     TEXT NOT NULL,
    is_active       BOOLEAN DEFAULT true,
    
    -- 通用配置
    min_score           INT DEFAULT 60,
    max_single_amount   NUMERIC(10,2) DEFAULT 500,
    gas_strategy        TEXT DEFAULT 'medium',   -- slow|medium|fast
    slippage_tolerance  NUMERIC(5,2) DEFAULT 2.0,
    signal_timeout_seconds INT DEFAULT 120,
    
    -- 风控
    daily_max_loss_usdt NUMERIC(10,2) DEFAULT 200,
    max_concurrent      INT DEFAULT 3,
    min_balance_usdt    NUMERIC(10,2) DEFAULT 100,
    
    -- 策略特定 (JSONB 扩展)
    extra_config    JSONB DEFAULT '{}',
    
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, strategy_id)
);

CREATE INDEX idx_strategy_configs_active ON strategy_configs(strategy_id, is_active);
```

### 2.2 统一交易记录表: trade_records

```sql
CREATE TABLE IF NOT EXISTS trade_records (
    id              BIGSERIAL PRIMARY KEY,
    user_id         TEXT NOT NULL,
    strategy_id     TEXT NOT NULL,
    signal_id       TEXT,
    
    chain           TEXT NOT NULL,
    token_address   TEXT NOT NULL,
    token_symbol    TEXT,
    action          TEXT NOT NULL,              -- BUY|SELL|ARBITRAGE
    amount_in       NUMERIC(24,8),
    amount_out      NUMERIC(24,8),
    entry_price_usd NUMERIC(24,4),
    exit_price_usd  NUMERIC(24,4),
    
    gross_profit_usdt   NUMERIC(12,2),
    gas_cost_usdt       NUMERIC(12,2),
    slippage_loss_usdt  NUMERIC(12,2),
    net_pnl_usdt        NUMERIC(12,2),
    
    tx_hash         TEXT,
    tx_hash_2       TEXT,
    
    execution_detail JSONB DEFAULT '{}',
    
    status          TEXT DEFAULT 'executing',   -- executing|completed|failed|reverted
    error_message   TEXT,
    
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_trade_records_user ON trade_records(user_id, strategy_id, created_at DESC);
CREATE INDEX idx_trade_records_status ON trade_records(status);
CREATE INDEX idx_trade_records_tx ON trade_records(tx_hash);
```

### 2.3 学习历史表

```sql
CREATE TABLE IF NOT EXISTS learning_history (
    id              BIGSERIAL PRIMARY KEY,
    strategy_id     TEXT NOT NULL,
    learning_type   TEXT NOT NULL,              -- optuna|deepseek|manual
    experience_count INT,
    best_params     JSONB,
    best_score      NUMERIC(10,4),
    rules_generated TEXT,
    status          TEXT DEFAULT 'completed',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_learning_history_strategy ON learning_history(strategy_id, created_at DESC);
```

### 2.4 迁移脚本

```sql
-- migration_v3_20260626.sql
-- V3 三层架构数据库迁移

BEGIN;

-- 1. 新建统一策略配置表
CREATE TABLE IF NOT EXISTS strategy_configs (
    -- (见 2.1)
);

-- 2. 统一交易记录表
CREATE TABLE IF NOT EXISTS trade_records (
    -- (见 2.2)
);

-- 3. 学习历史表
CREATE TABLE IF NOT EXISTS learning_history (
    -- (见 2.3)
);

-- 4. 策略注册表 (Gateway 内存加载，DB 持久化备份)
CREATE TABLE IF NOT EXISTS strategy_registry (
    strategy_id     TEXT PRIMARY KEY,
    category        TEXT NOT NULL,              -- dex|defi
    display_name    TEXT NOT NULL,
    description     TEXT,
    icon            TEXT,
    enabled         BOOLEAN DEFAULT true,
    registration    JSONB NOT NULL,             -- 完整注册项 JSON
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 插入初始策略注册
INSERT INTO strategy_registry (strategy_id, category, display_name, description, icon, registration) VALUES
('momentum', 'dex', '动量突破', '箱型震荡+放量突破检测', 'TrendingUp',
 '{"strategy_id":"momentum","category":"dex","version":"3.0","signal_type":"MATURE_MEME","config_schema":[{"key":"min_score","type":"number","default":60},{"key":"max_single_amount","type":"number","default":500},{"key":"daily_max_loss_usdt","type":"number","default":200},{"key":"max_concurrent","type":"number","default":3}],"risk_profile":{"max_concurrent":3,"daily_max_loss_usdt":200,"min_balance_usdt":100,"gas_strategy":"medium","signal_timeout_seconds":120},"trader_class":"MomentumTrader","trader_file":"autoTrader/MomentumTrader.js"}'),

('spread_arbitrage', 'defi', 'DEX价差套利', '同链跨DEX价差发现', 'ArrowLeftRight',
 '{"strategy_id":"spread_arbitrage","category":"defi","version":"3.0","signal_type":"SPREAD_ARBITRAGE","config_schema":[{"key":"min_spread_pct","type":"number","default":0.5},{"key":"min_profit_usdt","type":"number","default":5},{"key":"max_position_usdt","type":"number","default":1000},{"key":"daily_max_loss_usdt","type":"number","default":300}],"risk_profile":{"max_concurrent":2,"daily_max_loss_usdt":300,"min_balance_usdt":200,"gas_strategy":"fast","signal_timeout_seconds":60},"trader_class":"SpreadArbitrageTrader","trader_file":"autoTrader/SpreadArbitrageTrader.js"}'),

('lending_arbitrage', 'defi', '借贷利率套利', '跨协议借贷利差套利', 'Landmark',
 '{"strategy_id":"lending_arbitrage","category":"defi","version":"3.0","signal_type":"LENDING_ARBITRAGE","config_schema":[{"key":"min_rate_spread","type":"number","default":1.0},{"key":"min_profit_usdt","type":"number","default":10}],"risk_profile":{"max_concurrent":1,"daily_max_loss_usdt":150,"min_balance_usdt":500,"gas_strategy":"medium","signal_timeout_seconds":300},"trader_class":"LendingArbTrader","trader_file":"autoTrader/LendingArbTrader.js"}')
ON CONFLICT (strategy_id) DO NOTHING;

COMMIT;
```

---

## 3. 后端 API 设计

### 3.1 Gateway 路由总览

| 路由 | 方法 | 说明 | 所属文件 |
|------|------|------|----------|
| `GET /api/v3/strategies` | GET | 策略列表 | `routes/strategies.js` |
| `GET /api/v3/strategies/:id` | GET | 策略详情 | `routes/strategies.js` |
| `GET /api/v3/strategies/:id/config` | GET | 获取策略配置 | `routes/strategies.js` |
| `PUT /api/v3/strategies/:id/config` | PUT | 更新策略配置 | `routes/strategies.js` |
| `POST /api/v3/live/toggle` | POST | 启停策略自动交易 | `routes/liveTrading.js` |
| `GET /api/v3/live/status` | GET | 获取所有策略运行状态 | `routes/liveTrading.js` |
| `GET /api/v3/live/records` | GET | 全局交易记录(聚合) | `routes/liveTrading.js` |
| `GET /api/v3/signals/:strategy_id` | GET | 获取策略信号列表 | `routes/signals.js` |
| `GET /api/v3/learning/:strategy_id` | GET | 获取学习报告 | `routes/learning.js` |
| `POST /api/v3/learning/trigger` | POST | 手动触发学习 | `routes/learning.js` |

### 3.2 策略 API 详细规格

**GET /api/v3/strategies**

```json
// Response 200
{
  "code": 200,
  "data": [
    {
      "strategy_id": "momentum",
      "category": "dex",
      "display_name": "动量突破",
      "description": "箱型震荡+放量突破检测",
      "icon": "TrendingUp",
      "enabled": true,
      "auto_trading": true,
      "metrics": {
        "today_signals": 23,
        "today_trades": 5,
        "today_pnl": 142.50
      },
      "route": "/trade/momentum"
    },
    {
      "strategy_id": "spread_arbitrage",
      "category": "defi",
      "display_name": "DEX价差套利",
      "description": "同链跨DEX价差发现",
      "icon": "ArrowLeftRight",
      "enabled": true,
      "auto_trading": false,
      "metrics": {
        "today_signals": 7,
        "today_trades": 2,
        "today_pnl": 89.20
      },
      "route": "/defi/spread-arb"
    }
  ]
}
```

**GET /api/v3/strategies/:id/config**

```json
// Response 200
{
  "code": 200,
  "data": {
    "strategy_id": "momentum",
    "is_active": true,
    "min_score": 60,
    "max_single_amount": 500,
    "gas_strategy": "medium",
    "slippage_tolerance": 2.0,
    "daily_max_loss_usdt": 200,
    "max_concurrent": 3,
    "min_balance_usdt": 100,
    "extra_config": {},
    "schema": [
      { "key": "min_score", "type": "number", "default": 60, "min": 40, "max": 90, "description": "最低买入评分" },
      { "key": "max_single_amount", "type": "number", "default": 500, "min": 50, "max": 5000, "description": "单笔上限(USDT)" }
    ]
  }
}
```

**POST /api/v3/live/toggle**

```json
// Request
{
  "strategy_id": "momentum",
  "active": true
}

// Response 200
{
  "code": 200,
  "message": "动量突破 自动交易已开启",
  "data": { "strategy_id": "momentum", "active": true }
}
```

**GET /api/v3/live/status**

```json
// Response 200
{
  "code": 200,
  "data": {
    "wallet": {
      "connected": true,
      "address": "0x1234...abcd",
      "balance_usdt": 12345.67,
      "chain": "ETH"
    },
    "strategies": [
      {
        "strategy_id": "momentum",
        "display_name": "动量突破",
        "active": true,
        "today_trades": 5,
        "today_pnl": 142.50,
        "concurrent": 1
      },
      {
        "strategy_id": "spread_arbitrage",
        "display_name": "DEX价差套利",
        "active": false,
        "today_trades": 0,
        "today_pnl": 0,
        "concurrent": 0
      }
    ],
    "risk": {
      "daily_max_loss_usdt": 200,
      "today_loss_usdt": 18.50,
      "max_concurrent": 3,
      "current_concurrent": 1
    }
  }
}
```

**GET /api/v3/live/records**

```json
// Query: ?strategy_id=momentum&page=1&size=20
// Response 200
{
  "code": 200,
  "data": {
    "records": [
      {
        "id": 42,
        "strategy_id": "momentum",
        "strategy_name": "动量突破",
        "chain": "ETH",
        "token_symbol": "0x3f2a",
        "action": "BUY",
        "amount_in": 500,
        "net_pnl_usdt": null,
        "tx_hash": "0xabc...",
        "status": "executing",
        "created_at": "2026-06-26T11:42:00+08:00"
      }
    ],
    "total": 156,
    "page": 1,
    "size": 20
  }
}
```

**GET /api/v3/learning/:strategy_id**

```json
// Response 200
{
  "code": 200,
  "data": {
    "strategy_id": "momentum",
    "version": "v3",
    "last_learning": "2026-06-26T09:15:00+08:00",
    "total_experiences": 247,
    "new_experiences_since_learn": 31,
    "current_params": {
      "min_score": 62,
      "range_min_pct": 1.2,
      "range_max_pct": 8.5
    },
    "current_rules": ["震荡范围1-8%优先", "放量倍数≥2时加仓"],
    "history": [
      { "type": "optuna", "score": 0.72, "created_at": "..." },
      { "type": "deepseek", "rules": "...", "created_at": "..." }
    ]
  }
}
```

---

## 4. Redis 通道设计

### 4.1 通道定义

| 通道 | 类型 | 发布者 | 消费者 | 说明 |
|------|------|--------|--------|------|
| `trade:signals:momentum` | Pub/Sub | Worker | Gateway | 动量策略信号 |
| `trade:signals:spread_arbitrage` | Pub/Sub | Worker | Gateway | 价差套利信号 |
| `trade:signals:lending_arbitrage` | Pub/Sub | Worker | Gateway | 借贷套利信号 |
| `learning:trigger` | Pub/Sub | Gateway | Learning | 学习触发信号 |
| `params:{strategy_id}` | String | Learning | Worker + Gateway | 最优参数 |
| `rules:{strategy_id}` | String | Learning | Worker + Gateway | DeepSeek 规则 |
| `trade:active:{strategy_id}` | Hash | Gateway | Gateway | 用户×策略 开关 |
| `signal:dedup:{strategy_id}:{token}` | String(EX) | Gateway | Gateway | 信号去重 |
| `risk:daily_loss:{userId}:{strategy_id}` | String | Gateway | Gateway | 日亏损追踪 |

### 4.2 Pub/Sub 实现 (Gateway 侧)

```javascript
// services/gateway/src/execution/index.js

export async function initExecutionLayer({ db, redis, okxClient }) {
  const registry = new StrategyRegistry();
  await registry.loadFromDatabase(db);

  const dispatcher = new SignalDispatcher({ registry, db, redis, okxClient });
  await dispatcher.initialize();

  // 订阅所有已启用策略的信号通道
  const subscriber = redis.duplicate();  // 独立连接
  for (const entry of registry.listEnabled()) {
    const channel = `trade:signals:${entry.strategy_id}`;
    await subscriber.subscribe(channel);
    console.log(`[Execution] 已订阅 ${channel}`);
  }

  subscriber.on('message', async (channel, message) => {
    try {
      const signal = JSON.parse(message);
      
      // 检查该策略的活跃用户列表
      const activeUsers = await redis.hkeys(`trade:active:${signal.strategy_id}`);
      
      for (const userId of activeUsers) {
        const isActive = await redis.hget(`trade:active:${signal.strategy_id}`, userId);
        if (isActive !== '1') continue;
        
        const result = await dispatcher.dispatch({ ...signal, user_id: userId });
        if (result.executed) {
          // 触发学习检查
          await checkAndTriggerLearning(redis, db, signal.strategy_id);
        }
        console.log(`[Execution] ${signal.strategy_id}:${userId} → ${result.executed ? '✅' : result.reason}`);
      }
    } catch (err) {
      console.error('[Execution] 信号处理异常:', err.message);
    }
  });

  return { registry, dispatcher, subscriber };
}
```

### 4.3 学习触发逻辑

```javascript
// Gateway 侧 — 每笔交易完成后检查是否触发学习
async function checkAndTriggerLearning(redis, db, strategyId) {
  const key = `learning:check:${strategyId}`;
  const count = await db.query(
    `SELECT COUNT(*) FROM trade_records WHERE strategy_id = $1 AND status = 'completed'`,
    [strategyId]
  );
  const total = parseInt(count.rows[0].count);

  const lastCount = parseInt(await redis.get(key) || '0');
  if (total - lastCount >= 30) {
    await redis.publish('learning:trigger', JSON.stringify({
      strategy: strategyId,
      new_count: total,
      timestamp: Date.now(),
    }));
    await redis.set(key, String(total));
    console.log(`[Learning] 触发学习: ${strategyId} (${total} 条经验)`);
  }
}
```

---

## 5. 前端组件设计

### 5.1 路由配置

```typescript
// src/App.tsx 改造后
const routes = [
  { path: '/', redirect: '/trade' },
  { path: '/trade', component: TradePage },
  { path: '/trade/momentum', component: MomentumDetailPage },
  { path: '/trade/momentum/:token', component: MomentumDetailPage },
  { path: '/defi', component: DeFiPage },
  { path: '/defi/spread-arb', component: SpreadArbDetailPage },
  { path: '/defi/spread-arb/:pair', component: SpreadArbDetailPage },
  { path: '/live', component: LiveTradingPage },          // 🆕
  { path: '/config', component: ConfigPage },
  { path: '/system', component: SystemPage },
  // 旧路由兼容重定向
  { path: '/dex', redirect: '/trade' },
  { path: '/trades', redirect: '/live' },
  { path: '/signals', redirect: '/trade' },
];
```

### 5.2 组件树

```
App
├── Sidebar
│   ├── NavItem("DEX 交易", "/trade", icon=BarChart3)
│   ├── NavItem("DeFi 套利", "/defi", icon=ArrowLeftRight)
│   ├── NavItem("实盘交易", "/live", icon=Zap)      🆕
│   ├── NavItem("配置", "/config", icon=Settings)
│   └── NavItem("系统", "/system", icon=Monitor)
│
├── TradePage (/trade)
│   ├── PageHeader("DEX 交易", "策略寻利 · 实时信号 · AI 自主学习")
│   └── StrategyCardGrid
│       ├── StrategyCard(momentum)    ← 信号+学习入口
│       ├── StrategyCard(grid)        ← 建设中
│       ├── StrategyCard(trend)       ← 建设中
│       └── StrategyCard(new_token)   ← 建设中
│
├── DeFiPage (/defi)
│   ├── PageHeader("DeFi 套利", "...")
│   └── StrategyCardGrid
│       ├── StrategyCard(spread_arbitrage)
│       ├── StrategyCard(triangular)
│       ├── StrategyCard(flash_loan)
│       └── StrategyCard(lending)
│
├── LiveTradingPage (/live) 🆕
│   ├── WalletPanel               ← 复用现有钱包组件
│   │   ├── ConnectButton
│   │   ├── WalletInfo(address, balance, chain)
│   │   └── WalletActions(switch, create, transfer)
│   ├── StrategyTradingPanel      ← 按策略启停
│   │   └── StrategyToggleRow × N
│   │       ├── strategy_name + status_badge
│   │       ├── today_trades + today_pnl
│   │       └── [开启/暂停] [配置]
│   ├── RiskPanel                 ← 全局风控面板
│   │   ├── daily_loss_bar
│   │   ├── concurrent_display
│   │   └── gas_strategy_selector
│   └── TradeRecordStream         ← 实时交易流
│       ├── TradeRecordItem × N
│       └── [查看全部 →]
│
├── MomentumDetailPage (/trade/momentum)
│   ├── StrategyHeader("动量突破", auto_trading_badge)
│   ├── TabNav("信号流", "学习报告")
│   ├── SignalStream              ← 实时信号卡片流
│   │   └── SignalCard × N (chain, token, score, confidence, time)
│   └── LearningPanel             ← 学习状态 + 历史
│       ├── version + last_learned
│       ├── param_display
│       ├── rules_display
│       └── [触发学习] [学习历史]
│
├── SpreadArbDetailPage (/defi/spread-arb)
│   ├── StrategyHeader("DEX价差套利", auto_trading_badge)
│   ├── TabNav("机会列表", "学习报告")
│   ├── OpportunityTable
│   │   └── OppRow × N (pair, buy_dex, sell_dex, spread%, profit$, time)
│   └── LearningPanel
│
├── ConfigPage (/config)          ← 已有，微调
└── SystemPage (/system)           ← 已有，不变
```

### 5.3 核心组件接口

#### StrategyCard

```typescript
interface StrategyCardProps {
  strategy: {
    strategy_id: string;
    category: 'dex' | 'defi';
    display_name: string;
    description: string;
    icon: string;
    enabled: boolean;
    auto_trading: boolean;
    metrics: {
      today_signals: number;
      today_trades: number;
      today_pnl: number;
    };
    route: string;
  };
  onViewDetail: (route: string) => void;
}
```

#### WalletPanel (复用现有)

```typescript
// 从现有 MomentumLivePage 中提取为独立组件
interface WalletPanelProps {
  // 使用现有 useAccount hook
}
```

#### StrategyTradingPanel

```typescript
interface StrategyTradingPanelProps {
  strategies: Array<{
    strategy_id: string;
    display_name: string;
    active: boolean;
    today_trades: number;
    today_pnl: number;
  }>;
  onToggle: (strategyId: string, active: boolean) => void;
  onConfig: (strategyId: string) => void;
}
```

#### RiskPanel

```typescript
interface RiskPanelProps {
  dailyMaxLoss: number;
  todayLoss: number;
  maxConcurrent: number;
  currentConcurrent: number;
  onAdjust: () => void;
}
```

#### TradeRecordStream

```typescript
interface TradeRecordStreamProps {
  records: Array<{
    id: number;
    strategy_id: string;
    strategy_name: string;
    chain: string;
    token_symbol: string;
    action: string;
    amount_in: number;
    net_pnl_usdt: number | null;
    status: 'executing' | 'completed' | 'failed';
    created_at: string;
  }>;
  loading: boolean;
}
```

### 5.4 API 层新增

```typescript
// src/utils/api.ts 新增

export const strategyApi = {
  list: (category?: 'dex' | 'defi') =>
    api.get('/api/v3/strategies', { params: { category } }),
  getConfig: (strategyId: string) =>
    api.get(`/api/v3/strategies/${strategyId}/config`),
  updateConfig: (strategyId: string, config: object) =>
    api.put(`/api/v3/strategies/${strategyId}/config`, config),
};

export const liveApi = {
  getStatus: () =>
    api.get('/api/v3/live/status'),
  toggleStrategy: (strategyId: string, active: boolean) =>
    api.post('/api/v3/live/toggle', { strategy_id: strategyId, active }),
  getRecords: (params: { strategy_id?: string; page?: number; size?: number }) =>
    api.get('/api/v3/live/records', { params }),
};

export const signalApi = {
  getByStrategy: (strategyId: string, params?: { page?: number; size?: number }) =>
    api.get(`/api/v3/signals/${strategyId}`, { params }),
};

export const learningApi = {
  getReport: (strategyId: string) =>
    api.get(`/api/v3/learning/${strategyId}`),
  trigger: (strategyId: string) =>
    api.post('/api/v3/learning/trigger', { strategy_id: strategyId }),
};
```

### 5.5 WebSocket 实时推送

```typescript
// src/hooks/useRealtimeSignals.ts
export function useRealtimeSignals(strategyId: string) {
  const [signals, setSignals] = useState<SignalPayload[]>([]);
  
  useEffect(() => {
    const ws = new WebSocket(`ws://129.226.202.72:3100/ws/signals/${strategyId}`);
    ws.onmessage = (event) => {
      const signal = JSON.parse(event.data);
      setSignals(prev => [signal, ...prev].slice(0, 100));
    };
    return () => ws.close();
  }, [strategyId]);
  
  return signals;
}

// src/hooks/useRealtimeRecords.ts
export function useRealtimeRecords() {
  const [records, setRecords] = useState<TradeRecord[]>([]);
  
  useEffect(() => {
    const ws = new WebSocket('ws://129.226.202.72:3100/ws/records');
    ws.onmessage = (event) => {
      const record = JSON.parse(event.data);
      setRecords(prev => [record, ...prev].slice(0, 50));
    };
    return () => ws.close();
  }, []);
  
  return records;
}
```

---

## 6. Worker 改造方案

### 6.1 动量 Worker (mature_meme.py) 改动

改动量：~30 行（最小改动）

```python
# 改动点 1: publish 方法改为 V3 统一格式
# 位置: mature_meme.py 的 publish_signal 方法

async def publish_signal(self, signal_data: dict):
    """V3 改造: 统一信号格式"""
    # 原有评分逻辑保持不变
    signal = {
        "signal_id": str(uuid.uuid4()),
        "type": "MATURE_MEME",
        "strategy_id": "momentum",
        "version": "3.0",
        "timestamp": int(time.time() * 1000),
        "ttl_seconds": 120,
        "chain": signal_data["chain"],
        "action": signal_data["action"],
        "token_address": signal_data["contract"],
        "token_symbol": signal_data.get("symbol", ""),
        "score": signal_data["score"],
        "confidence": signal_data.get("confidence", 0.0),
        "execution_params": {
            "entry_price_usd": signal_data.get("price"),
            "liquidity_usd": signal_data.get("liquidity"),
            "hourly_bars": signal_data.get("hourly_bars"),
            "range_pct": signal_data.get("range_pct"),
            "signals": signal_data.get("signals", []),
        },
        "risk_tags": signal_data.get("risk_tags", []),
        "risk_score": signal_data.get("risk_score", 0),
        "source": "worker",
    }
    
    channel = f"trade:signals:momentum"
    await self.redis.publish(channel, json.dumps(signal))
    
    # 保留旧格式兼容 (给前端页面的 ZSET)
    await self.redis.zadd("signals:momentum:recent", {
        json.dumps(signal): signal["timestamp"]
    })
    await self.redis.expire("signals:momentum:recent", 3600)
```

### 6.2 套利 Worker (arbitrage.py) 改动

改动量：~80 行（补充扫描逻辑 + V3 格式）

```python
# 改动点 1: 补充扫描逻辑
# 改动点 2: 发布 V3 统一格式信号

async def scan_and_publish(self):
    """扫描 DEX 价差 → 发布信号"""
    # 从 OKX API 获取热门代币列表
    tokens = await self.okx_client.get_hot_tokens()
    
    for token in tokens:
        # 跨 DEX 查询报价 (OKX aggregator 已聚合)
        quotes = await self.get_cross_dex_quotes(token)
        if not quotes or len(quotes) < 2:
            continue
        
        # 找最优买价和最差卖价
        best_bid = max(quotes, key=lambda q: q.get('price', 0))
        best_ask = min(quotes, key=lambda q: q.get('price', 0))
        
        spread = best_bid['price'] - best_ask['price']
        spread_pct = (spread / best_ask['price']) * 100
        
        # 计算预估利润
        gas_cost = await self.estimate_gas(token['chain'])
        profit = (spread * token['amount']) - gas_cost
        
        if profit > self.min_profit_threshold:
            signal = {
                "signal_id": str(uuid.uuid4()),
                "type": "SPREAD_ARBITRAGE",
                "strategy_id": "spread_arbitrage",
                "version": "3.0",
                "timestamp": int(time.time() * 1000),
                "ttl_seconds": 60,
                "chain": token['chain'],
                "action": "ARBITRAGE",
                "token_address": token['contract'],
                "token_symbol": token['symbol'],
                "score": min(100, int(spread_pct * 25)),
                "confidence": min(1.0, spread_pct * 0.1),
                "execution_params": {
                    "buy_dex": best_ask['dex'],
                    "sell_dex": best_bid['dex'],
                    "buy_price": best_ask['price'],
                    "sell_price": best_bid['price'],
                    "estimated_profit_usdt": profit,
                    "token_pair": f"{token['symbol']}/USDT",
                    "spread_pct": spread_pct,
                },
                "risk_tags": [],
                "risk_score": 100 - min(100, int(spread_pct * 25)),
                "source": "worker",
            }
            
            await self.redis.publish("trade:signals:spread_arbitrage", json.dumps(signal))
```

---

## 7. 学习层改造方案

### 7.1 改动范围

| 文件 | 操作 | 说明 |
|------|------|------|
| `strategy_agnostic_learner.py` | **新建** | 通用学习引擎 (~300行) |
| `learning_profiles/*.json` | **新建** | 动量/套利/借贷学习配置 |
| `prompts/*.txt` | **新建** | 策略独立 DeepSeek prompt |
| `scheduler.py` | **修改** | 入口改为加载 Learner |
| `Dockerfile.learning` | **不动** | 容器入口不变 |

### 7.2 scheduler.py 改动

```python
# 改动量: ~15行

# 原有
from optuna_learner import ...
from deepseek_rules import ...

# V3 改为
from strategy_agnostic_learner import StrategyAgnosticLearner

async def main():
    learner = StrategyAgnosticLearner()
    await learner.run()

if __name__ == '__main__':
    asyncio.run(main())
```

### 7.3 Docker 容器无变动

```
# docker-compose.yml learning 服务
learning:
  build: ./services/learning
  volumes:
    - ./services/learning/src:/app/src   # 代码热挂载
  environment:
    - REDIS_URL=redis://redis:6379
    - DATABASE_URL=postgresql://...
  restart: unless-stopped
```

---

## 8. 部署与运维

### 8.1 部署步骤

```bash
# 1. 数据库迁移
ssh ubuntu@129.226.202.72
cd /home/ubuntu/aihunter
docker compose exec -T postgres psql -U aihunter -d aihunter < deploy/sql/migration_v3_20260626.sql

# 2. 重新构建 Gateway (含新执行层代码)
docker compose build gateway

# 3. 重启 Gateway
docker compose up -d gateway

# 4. 构建前端
cd /home/ubuntu/aihunter
docker compose exec frontend npx vite build
cp -r dist/* frontend/

# 5. 验证 API
curl http://localhost:3100/api/v3/strategies
curl http://localhost:3100/api/v3/live/status
```

### 8.2 回滚方案

```bash
# 数据库: 事务回滚 (migration 用 BEGIN/COMMIT)
# Gateway: git checkout 上一个 tag, 重新构建
# 前端: cp 旧 dist 备份到 frontend/
```

### 8.3 监控指标

| 指标 | 来源 | 告警阈值 |
|------|------|----------|
| Gateway 健康 | GET /health | HTTP 非200 |
| Redis 连接 | Gateway 日志 | 重连>3次/5min |
| 信号处理延迟 | signal.timestamp → execute time | > 30s |
| 日亏损 | Redis | > 日上限80% |
| Worker 存活 | Redis heartbeat key | 无更新>5min |

---

## 9. 测试策略

### 9.1 单元测试

| 模块 | 测试文件 | 覆盖重点 |
|------|----------|---------|
| StrategyRegistry | `tests/StrategyRegistry.test.js` | 注册/查询/分类过滤 |
| SignalDispatcher | `tests/SignalDispatcher.test.js` | 路由/懒加载/异常处理 |
| RiskMiddleware | `tests/RiskMiddleware.test.js` | 过期/亏损/并发/去重/余额 |

### 9.2 集成测试

```bash
# 模拟信号 → 执行层处理
redis-cli PUBLISH trade:signals:momentum '{"strategy_id":"momentum","action":"BUY","chain":"ETH","token_address":"0x...","score":75,"timestamp":...}'

# 验证: trade_records 表有记录, state=completed
# 验证: 手动触发学习
curl -X POST http://localhost:3100/api/v3/learning/trigger -H 'Content-Type: application/json' -d '{"strategy_id":"momentum"}'
```

### 9.3 端到端测试

```bash
# 1. 访问 /trade  → 看到动量策略卡片
# 2. 点击动量卡片 → 进入 /trade/momentum → 看到信号流 + 学习报告
# 3. 访问 /live → 看到钱包面板 + 策略开关 + 风控面板 + 记录流
# 4. 在 /live 开启动量自动交易 → 验证 Redis trade:active:momentum key
# 5. 在 /live 关闭动量自动交易 → 验证 Redis trade:active:momentum key 更新
```

---

## 10. 实施排期

### Phase 0: 基础设施 (2天)

| # | 任务 | 工时 | 文件 | 负责 |
|---|------|------|------|------|
| 0.1 | 数据库迁移脚本 | 2h | `migration_v3_20260626.sql` | Wayne |
| 0.2 | StrategyRegistry 类 | 3h | `strategies/StrategyRegistry.js` | backend-dev |
| 0.3 | 策略注册项 × 2 | 1h | `strategies/registrations/*.js` | backend-dev |
| 0.4 | BaseAutoTrader V3 | 4h | `execution/BaseAutoTrader.js` | Wayne |
| 0.5 | RiskMiddleware | 3h | `execution/RiskMiddleware.js` | backend-dev |
| 0.6 | RecordWriter | 2h | `execution/RecordWriter.js` | backend-dev |
| 0.7 | Gateway 集成 (~20行) | 1h | `index.js` | Wayne |

### Phase 1: 策略层 (2天)

| # | 任务 | 工时 | 文件 | 负责 |
|---|------|------|------|------|
| 1.1 | 动量 Worker 信号格式改造 | 2h | `mature_meme.py` | backend-dev |
| 1.2 | 套利 Worker 扫描补全 + V3格式 | 4h | `arbitrage.py` | backend-dev |
| 1.3 | Gateway 策略 + 信号 API | 3h | `routes/strategies.js`, `routes/signals.js` | backend-dev |
| 1.4 | WebSocket 信号推送 | 2h | `index.js` WebSocket 扩展 | backend-dev |

### Phase 2: 执行层 (3天)

| # | 任务 | 工时 | 文件 | 负责 |
|---|------|------|------|------|
| 2.1 | SignalDispatcher | 3h | `execution/SignalDispatcher.js` | Wayne |
| 2.2 | MomentumTrader | 3h | `execution/traders/MomentumTrader.js` | backend-dev |
| 2.3 | SpreadArbitrageTrader | 4h | `execution/traders/SpreadArbitrageTrader.js` | backend-dev |
| 2.4 | 执行层入口 + Redis订阅 | 3h | `execution/index.js` | Wayne |
| 2.5 | /live API (toggle/status/records) | 4h | `routes/liveTrading.js` | backend-dev |
| 2.6 | 集成测试 + 验证 | 3h | QA | tester |

### Phase 3: 学习层 (2天)

| # | 任务 | 工时 | 文件 | 负责 |
|---|------|------|------|------|
| 3.1 | StrategyAgnosticLearner | 5h | `strategy_agnostic_learner.py` | backend-dev |
| 3.2 | 学习配置 × 2 | 1h | `learning_profiles/*.json` | backend-dev |
| 3.3 | 学习 API | 2h | `routes/learning.js` | backend-dev |
| 3.4 | scheduler.py 改造 | 1h | `scheduler.py` | backend-dev |

### Phase 4: 前端 (3天)

| # | 任务 | 工时 | 文件 | 负责 |
|---|------|------|------|------|
| 4.1 | StrategyCard 统一组件 | 4h | `components/StrategyCard.tsx` | frontend-dev |
| 4.2 | TradePage 改造 | 4h | `pages/TradePage.tsx` | frontend-dev |
| 4.3 | DeFiPage 改造 | 4h | `pages/DeFiPage.tsx` | frontend-dev |
| 4.4 | LiveTradingPage 🆕 | 6h | `pages/LiveTradingPage.tsx` | frontend-dev |
| 4.5 | MomentumDetailPage (信号+学习) | 2h | `pages/MomentumDetailPage.tsx` | frontend-dev |
| 4.6 | SpreadArbDetailPage (机会+学习) | 2h | `pages/SpreadArbDetailPage.tsx` | frontend-dev |
| 4.7 | Sidebar + 路由 + API层 | 2h | `Sidebar.tsx`, `App.tsx`, `api.ts` | frontend-dev |

### Phase 5: 清理文档 (1天)

| # | 任务 | 工时 | 文件 | 负责 |
|---|------|------|------|------|
| 5.1 | 旧路由 301 重定向 | 1h | nginx | Wayne |
| 5.2 | README + 运维文档更新 | 2h | README.md | PM |
| 5.3 | 最终验证 + 部署 | 3h | all | Wayne |

**总工时**: 56h ≈ **10 人天** (1人2周 / 3人并行~4天)

---

## 附录 A: 文件改动清单

### 新建文件 (19个)

| # | 文件 | 预计行数 |
|---|------|---------|
| 1 | `deploy/sql/migration_v3_20260626.sql` | 100 |
| 2 | `services/gateway/src/strategies/StrategyRegistry.js` | 100 |
| 3 | `services/gateway/src/strategies/registrations/momentum.js` | 60 |
| 4 | `services/gateway/src/strategies/registrations/spread_arbitrage.js` | 60 |
| 5 | `services/gateway/src/strategies/registrations/lending_arbitrage.js` | 50 |
| 6 | `services/gateway/src/execution/BaseAutoTrader.js` | 200 |
| 7 | `services/gateway/src/execution/SignalDispatcher.js` | 80 |
| 8 | `services/gateway/src/execution/RiskMiddleware.js` | 120 |
| 9 | `services/gateway/src/execution/RecordWriter.js` | 80 |
| 10 | `services/gateway/src/execution/traders/MomentumTrader.js` | 80 |
| 11 | `services/gateway/src/execution/traders/SpreadArbitrageTrader.js` | 120 |
| 12 | `services/gateway/src/execution/index.js` | 80 |
| 13 | `services/gateway/src/routes/strategies.js` | 100 |
| 14 | `services/gateway/src/routes/signals.js` | 60 |
| 15 | `services/gateway/src/routes/liveTrading.js` | 150 |
| 16 | `services/gateway/src/routes/learning.js` | 80 |
| 17 | `services/learning/src/strategy_agnostic_learner.py` | 300 |
| 18 | `services/learning/src/learning_profiles/momentum.json` | 30 |
| 19 | `services/learning/src/learning_profiles/spread_arbitrage.json` | 30 |

### 修改文件 (8个)

| # | 文件 | 改动量 |
|---|------|--------|
| 1 | `services/gateway/src/index.js` | +20 行 |
| 2 | `services/worker/src/mature_meme.py` | ~30 行 (publish 方法) |
| 3 | `services/worker/src/arbitrage.py` | ~80 行 (扫描+发布) |
| 4 | `services/learning/src/scheduler.py` | ~15 行 (入口改造) |
| 5 | `src/App.tsx` | ~15 行 (路由) |
| 6 | `src/components/Sidebar.tsx` | ~10 行 (新增入口) |
| 7 | `src/utils/api.ts` | +50 行 |
| 8 | `docker-compose.yml` | ~5 行 (新服务挂载) |

### 不动文件 (明确排除)

`okx-trade.js` · `profitCalc.js` · 所有合约代码 · `Dockerfile.*` · `nginx/` · 现有前端组件 · `agentic_wallet` 相关 · 所有 `.test.*` 文件

---

## 附录 B: 依赖关系图

```
Phase 0 (基础设施)
  ├─ StrategyRegistry ──→ Phase 1 (策略层)
  │   ├─ Worker 信号格式依赖 Registry 的 signal_schema
  │   └─ 策略 API 依赖 Registry
  ├─ BaseAutoTrader ──→ Phase 2 (执行层)
  │   ├─ MomentumTrader extends BaseAutoTrader
  │   ├─ ArbitrageTrader extends BaseAutoTrader
  │   └─ /live API 依赖执行层
  └─ Migration ──→ 全 Phase 共享

Phase 1 ──→ Phase 4 (前端)
  ├─ 策略 API 就绪 → TradePage/DeFiPage 可开发
  └─ 信号 API 就绪 → DetailPage 可开发

Phase 2 ──→ Phase 4 (前端)
  ├─ /live API 就绪 → LiveTradingPage 可开发
  └─ WebSocket 就绪 → 实时推送可用

Phase 2 ──→ Phase 3 (学习层)
  └─ trade_records 有数据 → learning:trigger 触发
```
