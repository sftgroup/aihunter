# AIHunter SaaS V4 技术方案

> **版本**: 1.0 | **日期**: 2026-06-27 | **作者**: Wayne (架构师)
>
> **关联 PRD**: [AIHunter SaaS 产品需求文档](https://www.feishu.cn/docx/AOStdIY6xokuxexeitGcezNrn4c)
> **关联方案**: [完整开发方案 (PM拆解+复用评估)](https://www.feishu.cn/docx/FMupdtpL1o5kO6x4cxCcbPMGngb)
> **GitHub**: https://github.com/sftgroup/aihunter/blob/main/docs/aihunter-saas-v4-tech-spec.md

---

## 目录

1. [总体架构](#1-总体架构)
2. [数据模型](#2-数据模型)
3. [后端 API 设计](#3-后端-api-设计)
4. [ERC-8004 合约集成](#4-erc-8004-合约集成)
5. [Redis 通道设计](#5-redis-通道设计)
6. [策略工作台 (IDE + 回测)](#6-策略工作台-ide--回测)
7. [策略市场](#7-策略市场)
8. [订阅 + 自动交易执行](#8-订阅--自动交易执行)
9. [前端路由与组件](#9-前端路由与组件)
10. [部署与运维](#10-部署与运维)

---

## 1. 总体架构

### 1.1 部署拓扑（V4 新增层）

```
┌───────────────────────────────────────────────────────────────┐
│                     测试服务器 129.226.202.72                   │
│                                                               │
│  ┌─────────┐ ┌───────────┐ ┌──────────┐ ┌──────────────┐    │
│  │ Nginx   │ │ Frontend  │ │ Gateway  │ │ PostgreSQL   │    │
│  │ :80/443 │ │ :3000     │ │ :3100    │ │ :5432        │    │
│  │ React   │ │ Vite SPA  │ │ Fastify  │ │              │    │
│  └────┬────┘ └─────┬─────┘ └────┬─────┘ └──────┬───────┘    │
│       │            │            │               │             │
│       ▼            ▼            ▼               ▼             │
│  ┌──────────────────────────────────────────────────────┐    │
│  │                    V3 现有层                           │    │
│  │  Worker(Python) ──→ Redis PUB/SUB ──→ SignalDispatcher│    │
│  │       │                                    │          │    │
│  │  Learning(Python)                   OKX OnchainOS     │    │
│  │  (Optuna+DeepSeek)                  (DEX+Agentic)     │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐    │
│  │                    V4 新增层                           │    │
│  │                                                       │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │    │
│  │  │ Strategy IDE  │  │ Marketplace  │  │ Subscription │ │    │
│  │  │ (Monaco +     │  │ (ERC-8004    │  │ Engine       │ │    │
│  │  │  Backtest)    │  │  contracts)  │  │ (Cron+Renew) │ │    │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘ │    │
│  │         │                 │                  │        │    │
│  │         ▼                 ▼                  ▼        │    │
│  │  ┌──────────────────────────────────────────────┐    │    │
│  │  │           V4 SaaS Gateway 扩展               │    │    │
│  │  │  routes/workshop.js  routes/market.js        │    │    │
│  │  │  routes/subscription.js  routes/execution.js │    │    │
│  │  │  services/backtest.py (Docker sidecar)       │    │    │
│  │  └──────────────────────────────────────────────┘    │    │
│  └──────────────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────┘
```

### 1.2 V4 数据流全景

```
┌────────── 策略师 ──────────┐   ┌────────── 交易者 ──────────┐
│                            │   │                            │
│  ① /workshop 写策略        │   │  ⑥ /market 浏览市场        │
│  ② AI生成 / 手动编写       │   │  ⑦ /market/strategy/:id    │
│  ③ /backtest 回测          │   │     查看回测报告+定价      │
│  ④ 优化参数 → 满意          │   │  ⑧ Subscribe (x402支付)   │
│  ⑤ 铸造 Agent NFT → 上架   │   │  ⑨ /live 激活自动交易      │
│     (ERC-8004 + IPFS)      │   │  ⑩ 代理地址执行 → 收益     │
│                            │   │                            │
└────────────────────────────┘   └────────────────────────────┘
              │                              │
              ▼                              ▼
┌─────────────────────────────────────────────────────────┐
│                   V3 执行层 (复用)                        │
│                                                         │
│  Worker 扫描 ──→ Redis trade:signals:*                   │
│       │                                                 │
│       ▼                                                 │
│  SignalDispatcher ──→ 检查订阅者 trade:active:*:*        │
│       │                                                 │
│       ▼                                                 │
│  AutoTrader/DeFiTrader ──→ OKX Agentic Wallet ──→ 链上  │
│       │                                                 │
│       ▼                                                 │
│  trade_records 表 ──→ WebSocket ──→ /live 实时展示       │
└─────────────────────────────────────────────────────────┘
```

### 1.3 角色与权限模型

| 角色 | 标识 | 权限 |
|------|------|------|
| **未登录用户** | 无钱包连接 | 仅浏览市场列表 |
| **策略师** | 连接钱包 + 拥有 Agent NFT | 创建策略、回测、铸造 NFT、上架、管理定价 |
| **交易者/订阅者** | 连接钱包 | 浏览市场、订阅策略、部署自动交易、查看收益 |
| **平台管理员** | 指定地址 | 策略审核、用户管理、灰度开关、收入报表 |

> 同一地址可同时是策略师和交易者，根据当前操作自动切换角色。

---

## 2. 数据模型

### 2.1 新增表（PostgreSQL）

```sql
-- ============================================
-- V4 SaaS 新增表（在 V3 已有表基础上）
-- ============================================

-- 策略师档案
CREATE TABLE IF NOT EXISTS strategy_creators (
    id              BIGSERIAL PRIMARY KEY,
    wallet_address  TEXT NOT NULL UNIQUE,      -- 钱包地址 = DID
    display_name    TEXT,                      -- 可选显示名
    avatar_ipfs     TEXT,                      -- 头像 IPFS CID
    bio             TEXT,                      -- 简介
    agent_nft_count INT DEFAULT 0,             -- 铸造的 Agent NFT 数量
    total_revenue   NUMERIC(12,2) DEFAULT 0,   -- 累计收入 (USDT)
    total_subscribers INT DEFAULT 0,           -- 总订阅者数
    reputation_score NUMERIC(5,1) DEFAULT 0,   -- 链上评分 (0-100)
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 策略表（核心实体）
CREATE TABLE IF NOT EXISTS strategies (
    id              BIGSERIAL PRIMARY KEY,
    strategy_uuid   TEXT NOT NULL UNIQUE,      -- 系统内部 UUID
    creator_address TEXT NOT NULL,             -- 策略师钱包地址
    name            TEXT NOT NULL,
    description     TEXT,
    category        TEXT NOT NULL,             -- dex | defi
    sub_category    TEXT,                      -- trend|momentum|arbitrage|spread|flashloan
    status          TEXT DEFAULT 'draft',      -- draft|backtested|published|suspended|delisted
    
    -- 策略代码
    source_code     TEXT,                      -- Python 策略源码
    template_key    TEXT,                      -- 使用的模板 key
    
    -- 回测结果
    latest_backtest JSONB,                     -- 最新回测报告
    -- { sharpe_ratio, max_drawdown, win_rate, annual_return, equity_curve, ... }
    
    -- 市场展示
    cover_image_ipfs TEXT,                     -- 封面图 IPFS
    tags            TEXT[] DEFAULT '{}',        -- 标签数组
    supported_chains TEXT[] DEFAULT '{eth}',     -- 支持的链
    min_capital_usdt NUMERIC(10,2) DEFAULT 100, -- 最低资金要求
    
    -- 上架信息
    token_id        INT,                       -- ERC-721 Agent NFT Token ID
    metadata_ipfs   TEXT,                      -- IPFS 元数据 CID
    listing_tx      TEXT,                      -- 铸造交易 hash
    published_at    TIMESTAMPTZ,
    
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_strategies_category ON strategies(category, status);
CREATE INDEX idx_strategies_creator ON strategies(creator_address);
CREATE INDEX idx_strategies_listed ON strategies(status, published_at DESC);
CREATE INDEX idx_strategies_search ON strategies USING GIN(to_tsvector('english', name || ' ' || COALESCE(description, '')));

-- 策略定价方案（一个策略可有多个定价方案）
CREATE TABLE IF NOT EXISTS strategy_pricing (
    id              BIGSERIAL PRIMARY KEY,
    strategy_uuid   TEXT NOT NULL REFERENCES strategies(strategy_uuid),
    plan_name       TEXT NOT NULL,             -- 基础版/专业版/旗舰版
    plan_type       TEXT DEFAULT 'subscription', -- subscription|usage|hybrid
    token_address   TEXT DEFAULT '0x0000000000000000000000000000000000000000', -- ETH(=0) or USDC address
    price           NUMERIC(24,8) NOT NULL,    -- 价格 (token 最小单位)
    billing_period  TEXT DEFAULT 'monthly',    -- daily|weekly|monthly|quarterly|yearly
    max_usage       INT DEFAULT 0,             -- 0 = unlimited
    chain_plan_id   INT,                       -- 链上 SubscriptionManager planId
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_strategy_pricing_strategy ON strategy_pricing(strategy_uuid);

-- 用户订阅
CREATE TABLE IF NOT EXISTS user_subscriptions (
    id              BIGSERIAL PRIMARY KEY,
    subscriber_address TEXT NOT NULL,          -- 订阅者钱包地址
    strategy_uuid   TEXT NOT NULL REFERENCES strategies(strategy_uuid),
    pricing_id      BIGINT NOT NULL REFERENCES strategy_pricing(id),
    
    status          TEXT DEFAULT 'active',     -- active|cancelled|expired|payment_failed
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL,
    auto_renew      BOOLEAN DEFAULT true,
    
    -- 链上支付信息
    payment_id      INT,                       -- PaymentGateway paymentId
    payment_tx      TEXT,                      -- 支付交易 hash
    payment_amount  NUMERIC(24,8),
    payment_token   TEXT,
    
    -- 代理地址
    proxy_wallet_id TEXT,                      -- OKX Agentic Wallet ID
    proxy_address   TEXT,                      -- 代理地址
    
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(subscriber_address, strategy_uuid)
);

CREATE INDEX idx_subscriptions_active ON user_subscriptions(subscriber_address, status);
CREATE INDEX idx_subscriptions_expires ON user_subscriptions(expires_at) WHERE status = 'active';

-- 策略评论/评价
CREATE TABLE IF NOT EXISTS strategy_reviews (
    id              BIGSERIAL PRIMARY KEY,
    strategy_uuid   TEXT NOT NULL REFERENCES strategies(strategy_uuid),
    reviewer_address TEXT NOT NULL,
    rating          INT NOT NULL CHECK(rating >= 1 AND rating <= 5),  -- 1-5星
    content         TEXT,
    reputation_tx   TEXT,                      -- ReputationRegistry 评分 hash
    ipfs_cid        TEXT,                      -- 评价 IPFS CID
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(strategy_uuid, reviewer_address)
);

-- 交易者档案
CREATE TABLE IF NOT EXISTS trader_profiles (
    id              BIGSERIAL PRIMARY KEY,
    wallet_address  TEXT NOT NULL UNIQUE,
    total_spent     NUMERIC(12,2) DEFAULT 0,
    total_trades    INT DEFAULT 0,
    total_pnl       NUMERIC(12,2) DEFAULT 0,
    active_subscriptions INT DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.2 现存表复用

V3 以下表直接复用，仅增加 V4 字段：

| 表 | V4 新增字段 | 说明 |
|----|-----------|------|
| `strategy_configs` | `strategy_uuid` | 从策略师策略 UUID 关联 |
| `trade_records` | `strategy_uuid`, `subscriber_address` | 记录到具体策略和订阅者 |
| `learning_history` | `strategy_uuid` | 关联策略师策略 |
| `strategy_registry` | 不变 | 系统内置策略注册表 |

---

## 3. 后端 API 设计

### 3.1 路由总览

| 分组 | 方法 | 路由 | 认证 | 说明 |
|------|------|------|------|------|
| **策略工作台** | | | | |
| | GET | `/api/v4/strategies` | ✅ | 我的策略列表 |
| | POST | `/api/v4/strategies` | ✅ | 创建策略 |
| | GET | `/api/v4/strategies/:uuid` | ❌ | 策略详情（公开） |
| | PUT | `/api/v4/strategies/:uuid` | ✅ | 更新策略 |
| | DELETE | `/api/v4/strategies/:uuid` | ✅ | 删除草稿策略 |
| **AI 生成** | | | | |
| | POST | `/api/v4/strategies/ai-generate` | ✅ | AI 生成策略代码 |
| **回测引擎** | | | | |
| | POST | `/api/v4/backtest/run` | ✅ | 发起回测（异步） |
| | GET | `/api/v4/backtest/:task_id` | ✅ | 查询回测结果 |
| | GET | `/api/v4/strategies/:uuid/backtests` | ✅ | 策略回测历史 |
| **策略市场** | | | | |
| | GET | `/api/v4/market` | ❌ | 市场首页（分类统计+热门+最新） |
| | GET | `/api/v4/market/strategies` | ❌ | 策略列表（筛选+分页+搜索） |
| | GET | `/api/v4/market/strategies/:uuid` | ❌ | 策略详情（含回测+定价方案） |
| | GET | `/api/v4/market/strategies/:uuid/reviews` | ❌ | 策略评价列表 |
| **上架** | | | | |
| | POST | `/api/v4/strategies/:uuid/publish` | ✅ | 上架（IPFS+铸造+定价） |
| | POST | `/api/v4/strategies/:uuid/pricing` | ✅ | 添加定价方案 |
| | PUT | `/api/v4/strategies/:uuid/pricing/:id` | ✅ | 更新定价 |
| **订阅** | | | | |
| | POST | `/api/v4/subscriptions` | ✅ | 创建订阅（支付后调用） |
| | GET | `/api/v4/subscriptions` | ✅ | 我的订阅列表 |
| | GET | `/api/v4/subscriptions/:id` | ✅ | 订阅详情 |
| | POST | `/api/v4/subscriptions/:id/renew` | ✅ | 续费 |
| | POST | `/api/v4/subscriptions/:id/cancel` | ✅ | 取消自动续费 |
| **执行** | | | | |
| | POST | `/api/v4/execution/deploy` | ✅ | 部署策略到代理地址 |
| | POST | `/api/v4/execution/:id/start` | ✅ | 启动自动交易 |
| | POST | `/api/v4/execution/:id/stop` | ✅ | 停止自动交易 |
| | GET | `/api/v4/execution/:id/status` | ✅ | 执行状态 |
| | GET | `/api/v4/execution/:id/logs` | ✅ | 执行日志 (WebSocket) |
| **评价** | | | | |
| | POST | `/api/v4/reviews` | ✅ | 提交评价 |
| **策略师面板** | | | | |
| | GET | `/api/v4/creator/dashboard` | ✅ | 策略师仪表盘 |
| | GET | `/api/v4/creator/revenue` | ✅ | 收入明细 |

### 3.2 认证方案

V4 采用钱包签名认证，复用现有 token 机制：

```
1. 前端: 钱包签名消息 (EIP-4361 / Sign-In with Ethereum)
2. 后端: 验证签名 → 签发 JWT (72h 有效期)
3. 前端: 存储 token 到 localStorage
4. 请求: Authorization: Bearer <token>
```

**公开路由**（无需 token，Gateway `publicRoutes` 白名单）：
- 所有市场相关路由
- 策略详情路由

### 3.3 关键 API 规格

#### POST /api/v4/backtest/run

```json
// Request
{
  "strategy_uuid": "st_abc123",
  "chain": "eth",
  "token_pair": "0x.../0x...",
  "start_date": "2026-01-01",
  "end_date": "2026-06-01",
  "timeframe": "1H",
  "initial_capital": 1000,
  "params": { "fast_period": 10, "slow_period": 30 }
}

// Response 202
{
  "code": 200,
  "data": {
    "task_id": "bt_xyz789",
    "status": "running",
    "estimated_seconds": 30
  }
}
```

#### GET /api/v4/backtest/:task_id

```json
// Response 200 (completed)
{
  "code": 200,
  "data": {
    "task_id": "bt_xyz789",
    "status": "completed",
    "result": {
      "sharpe_ratio": 1.82,
      "max_drawdown_pct": 12.5,
      "win_rate": 0.62,
      "annual_return_pct": 45.3,
      "total_trades": 87,
      "profit_factor": 2.1,
      "calmar_ratio": 3.6,
      "equity_curve": [[timestamp, equity], ...],
      "monthly_returns": { "2026-01": 5.2, "2026-02": 8.1, ... },
      "trade_log": [
        { "entry_time": "...", "exit_time": "...", "entry_price": 1.5, "exit_price": 1.8, "pnl_pct": 20, "type": "long" }
      ]
    }
  }
}
```

#### POST /api/v4/strategies/:uuid/publish

```json
// Request
{
  "name": "ETH 动量突破策略",
  "description": "基于30分钟K线的箱体突破策略，配合成交量确认",
  "tags": ["动量", "突破", "ETH"],
  "supported_chains": ["eth", "base"],
  "min_capital_usdt": 200,
  "pricing_plans": [
    {
      "plan_name": "标准版",
      "plan_type": "subscription",
      "token_address": "0x0000000000000000000000000000000000000000",
      "price": "0.01",     // ETH
      "billing_period": "monthly"
    }
  ]
}

// Response 200
{
  "code": 200,
  "data": {
    "strategy_uuid": "st_abc123",
    "token_id": 42,
    "metadata_ipfs": "ipfs://Qm...",
    "listing_tx": "0x...",
    "pricing_plans": [{ "id": 1, "chain_plan_id": 7 }],
    "status": "published"
  }
}
```

#### POST /api/v4/subscriptions

```json
// Request (支付完成后调用)
{
  "strategy_uuid": "st_abc123",
  "pricing_id": 1,
  "payment_tx": "0x...",
  "payment_id": 15,
  "auto_renew": true
}

// Response 201
{
  "code": 201,
  "data": {
    "subscription_id": 100,
    "strategy_uuid": "st_abc123",
    "status": "active",
    "expires_at": "2026-07-27T00:00:00Z",
    "proxy_wallet_id": "okx_wallet_xxx",
    "proxy_address": "0x..."
  }
}
```

---

## 4. ERC-8004 合约集成

### 4.1 合约地址（Sepolia）

| 合约 | 地址 | 状态 | 用途 |
|------|------|------|------|
| IdentityRegistry | `0x4Bd537B9E4e4501D25f32B3Cd57C84dF1f229352` | ✅ | 铸造 Agent NFT |
| ReputationRegistry | `0x6E66299B52F1707b244347F6953Cc869760f444E` | ✅ | 评价评分 |
| ValidationRegistry | `0x55946d37635bfF0393509002ADd60877F009c311` | ✅ | 身份验证 |
| PaymentGateway | TBD | 🔲 待部署 | x402 支付 |
| SubscriptionManager | TBD | 🔲 待部署 | 订阅计划 |
| AgentWallet | TBD | 🔲 待部署 | 策略师钱包 |
| AgentFactory | TBD | 🔲 待部署 | 模板工厂 |

### 4.2 铸造流程

```
策略师点击"上架"
  │
  ├── ① Gateway: 策略元数据 JSON → IPFS (Pinata/Infura)
  │      → metadata_ipfs = ipfs://Qm...
  │
  ├── ② Gateway: 调用 IdentityRegistry.register(tokenURI=metadata_ipfs)
  │      → token_id (ERC-721)
  │
  ├── ③ Gateway: 每条定价方案 → SubscriptionManager.createPlan(agentId, name, desc, token, price, period, maxUsage)
  │      → chain_plan_id
  │
  ├── ④ Gateway: AgentWallet 绑定 token_id → creator address
  │
  └── ⑤ Gateway: 更新 strategies 表 status='published', token_id, listing_tx
```

### 4.3 支付流程

```
交易者点击"订阅"
  │
  ├── ① 前端: wagmi useWriteContract → PaymentGateway.createPayment(agentId, token, amount, desc, useEscrow=false)
  │      → { value: price }  (ETH) 或 approve + call (USDC)
  │
  ├── ② 前端: useWaitForTransactionReceipt → 等待确认
  │
  ├── ③ 后端: POST /api/v4/subscriptions (payment_tx, payment_id)
  │      → 创建 user_subscriptions 记录
  │      → 创建 OKX Agentic Wallet 代理地址
  │      → 返回 subscription_id + proxy_address
  │
  └── ④ 分账: PaymentGateway 自动分账
         → 5% 平台 → platform wallet
         → 95% → AgentWallet (策略师)
```

### 4.4 wagmi Hooks 复用清单

从 `erc8004/platform/components/agent/hooks/` 直接搬：

| Hook | 使用场景 |
|------|---------|
| `useAgentRegistry` | 市场列表、策略搜索、分页 |
| `useSubscription` | 定价方案 CRUD |
| `usePaymentGateway` | 支付交互 |
| `useReputation` | 评分查询/提交 |
| `useAgentFactory` | 一键铸造 |

---

## 5. Redis 通道设计

### 5.1 新增通道（V4 叠加 V3）

```
V3 现有:
  trade:signals:{strategy_id}          ← Worker → SignalDispatcher
  trade:active:{strategy_id}:{userId}  ← 自动交易启停标识
  learning:trigger                     ← 触发学习

V4 新增:
  strategy:backtest:{task_id}          ← 回测任务状态
  subscription:expiry:check            ← 每日订阅到期检查
  market:strategy:publish              ← 策略上架事件
  market:strategy:update               ← 策略更新事件
  execution:deploy:{subscription_id}   ← 部署代理地址
  execution:proxy:{proxy_address}      ← 代理地址执行日志
```

### 5.2 执行层改动

现有 `SignalDispatcher` 需要增加订阅者路由：

```js
// 现有逻辑: 检查 trade:active:{strategy}:{userId}
// V4 新增: 检查 user_subscriptions 表

class SignalDispatcher {
  async onSignal(channel, signalPayload) {
    const strategyId = extractStrategyId(channel);

    // V3: 自建策略用户
    const selfUsers = await getActiveSelfUsers(strategyId);

    // V4: 订阅者
    const subscribers = await db.query(
      `SELECT us.subscriber_address, us.proxy_address, us.proxy_wallet_id
       FROM user_subscriptions us
       JOIN strategies s ON us.strategy_uuid = s.strategy_uuid
       WHERE s.strategy_id = $1 AND us.status = 'active'`,
      [strategyId]
    );

    // 合并执行
    const allTargets = [...selfUsers, ...subscribers];
    for (const target of allTargets) {
      const trader = await this.getTrader(strategyId, target);
      await trader.execute(signalPayload);
    }
  }

  async getTrader(strategyId, target) {
    // V3: 使用用户自己的 OKX wallet
    // V4 订阅者: 使用 proxy_wallet_id → OKX Agentic Wallet
    const walletId = target.proxy_wallet_id || target.user_wallet_id;
    return new AutoTrader({ walletId, strategy: strategyId, ...target });
  }
}
```

---

## 6. 策略工作台 (IDE + 回测)

### 6.1 Monaco Editor 集成

```tsx
// /workshop 页面
// 使用 @monaco-editor/react，Python 语法高亮 + 自动补全
// 左侧: 策略代码编辑器
// 右侧: 策略配置面板（参数定义、链选择、分类）

<StrategyWorkspace>
  <MonacoEditor
    language="python"
    value={code}
    onChange={setCode}
    options={{
      minimap: { enabled: false },
      fontSize: 14,
      lineNumbers: 'on',
      automaticLayout: true,
    }}
  />
  <StrategyConfigPanel
    category={category}
    tags={tags}
    chains={supportedChains}
    params={params}
  />
</StrategyWorkspace>
```

### 6.2 AI 策略生成

```
用户输入自然语言描述
  │
  ▼
POST /api/v4/strategies/ai-generate
  │
  ├── 后端构建 system prompt（根据 category DEX/DeFi 不同）
  │   DEX: "你是量化策略专家，生成 Python 动量交易策略代码..."
  │   DeFi: "你是 DeFi 协议专家，生成 Solidity/Python 套利策略代码..."
  │
  ├── DeepSeek API 调用
  │   返回策略代码 + 参数说明 + 风险提示
  │
  └── 前端渲染到 Monaco Editor（可编辑）
```

### 6.3 回测引擎（Docker Sidecar）

```
┌─────────────────────────────────────┐
│  Gateway (Fastify)                  │
│  POST /api/v4/backtest/run          │
│    → Redis RPUSH backtest:queue     │
│    → Redis SUB backtest:result:*    │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  backtest-engine (Docker)           │
│  Python: AItrader backtest.py 改造  │
│  ├── kline_fetcher.py (OKX KLines)  │
│  ├── onchain_fetcher.py (OKX Pools) │
│  ├── engine.py (Bar/Tick回放)       │
│  ├── metrics.py (Sharpe/MDD/胜率)   │
│  └── reporter.py (净值曲线JSON)     │
│                                     │
│  从 Redis 取任务 → 执行 → 写结果    │
└─────────────────────────────────────┘
```

**复用 AItrader 的关键文件：**
- `backtest.py` → 核心回测逻辑
- `strategy_templates.json` → 50+ 策略模板
- `strategy.py` → 策略生命周期管理
- `strategy_compiler.py` → Python AST 安全校验

**需要改写：**
- 数据源：CCXT → OKX OnchainOS API（K线 + 链上池数据）
- 前端图表：AItrader 用 ECharts（Vue），V4 用 Recharts（React）

### 6.4 策略模板（50+ 从 AItrader 复用）

```json
{
  "key": "ma_crossover",
  "name": "均线交叉策略",
  "name_en": "MA Crossover",
  "category": "trend",
  "difficulty": "beginner",
  "markets": ["Crypto"],
  "default_params": { "fast_period": 10, "slow_period": 30, "timeframe": "1H" },
  "tags": ["trend", "moving-average", "beginner"]
}
```

---

## 7. 策略市场

### 7.1 页面结构

```
/market
├── 大分类入口卡片（DEX 交易 / DeFi 套利）
│   ├── 策略师数量统计
│   ├── 策略总数
│   └── 累计交易量
├── 🔥 热门策略区（按 30d 订阅量排行，前 8）
└── 🆕 最新上架区（按发布时间，前 8）

/market/dex
  └── DEX 策略列表（筛选栏 + 卡片列表 + 分页）

/market/defi
  └── DeFi 策略列表（同上）

/market/strategy/:uuid
  ├── 策略详情 Hero（名称/标签/评分/策略师）
  ├── 回测报告可视化
  ├── 定价方案 + 订阅按钮
  ├── 实时信号样例（最近10条）
  └── 评价区
```

### 7.2 策略卡片组件

```tsx
// 从 ERC-8004 AgentCard.tsx 改造
// 核心差异：Agent → Strategy, Pricing → SubscriptionPlan

<StrategyCard>
  <CategoryBadge category="dex" />  {/* 蓝色 "DEX" */}
  <StrategyName />
  <CreatorAddress />
  <Stats> {/* 30d收益 / 订阅数 / 评分 */} </Stats>
  <PriceTag /> {/* 最低价格方案 */}
  <Tags />
</StrategyCard>
```

### 7.3 筛选与搜索

| 筛选维度 | 实现 |
|---------|------|
| **分类** | dex / defi（路由级别分离） |
| **链** | ETH / BSC / BASE / SOL（多选） |
| **30d 收益** | 范围滑块（0-10%, 10-30%, 30%+） |
| **价格** | 免费 / <0.01ETH / 0.01-0.1ETH / 0.1ETH+ |
| **评分** | 4.5+ / 4.0+ / 3.0+ |
| **排序** | 热门 / 最新 / 收益最高 / 价格最低 |
| **搜索** | PostgreSQL `ts_vector` 全文搜索 + `ILIKE` |

---

## 8. 订阅 + 自动交易执行

### 8.1 订阅生命周期

```
交易者订阅 → active → expires_at 到期
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
          续费       自动续费     过期
              │       (auto_renew)   │
              ▼          ▼          ▼
         延长 30d    扣款→延长    status=expired
                                    │
                              停止自动交易
                              代理地址冻结
```

### 8.2 定时任务（Cron）

```yaml
# deploy/crontab 或 systemd timer
tasks:
  - name: 订阅到期检查
    schedule: "0 * * * *"          # 每小时
    script: node scripts/check-subscriptions.js

  - name: 到期前提醒
    schedule: "0 8 * * *"          # 每天早8点
    script: node scripts/subscription-reminders.js

  - name: 自动续费扣款
    schedule: "0 0 * * *"          # 每天午夜
    script: node scripts/auto-renew-subscriptions.js
```

### 8.3 代理地址执行

```
订阅创建成功
  │
  ├── Gateway: 调用 OKX API 创建独立 Agentic Wallet
  │      POST /api/v5/wallet/account/create-wallet
  │      → wallet_id, address
  │
  ├── 存储: user_subscriptions.proxy_wallet_id/address
  │
  ├── 交易者: 向代理地址转入执行资金（ETH/USDC/SOL）
  │
  └── 策略信号到达时:
         SignalDispatcher → 查找订阅者列表
         → 对每个订阅者使用其 proxy_wallet_id
         → OKX Agentic Wallet TEE 签名
         → DEX 聚合执行
         → trade_records 记录（含 subscriber_address）
```

---

## 9. 前端路由与组件

### 9.1 路由表

| 路由 | 页面 | 认证 | 说明 |
|------|------|------|------|
| `/market` | MarketPage | ❌ | 市场首页 |
| `/market/dex` | DexMarketPage | ❌ | DEX 策略列表 |
| `/market/defi` | DefiMarketPage | ❌ | DeFi 策略列表 |
| `/market/strategy/:uuid` | StrategyDetailPage | ❌ | 策略详情 |
| `/workshop` | WorkshopPage | ✅ | 策略工作台入口 |
| `/workshop/new` | StrategyEditorPage | ✅ | 新建/编辑策略 |
| `/workshop/backtest/:uuid` | BacktestPage | ✅ | 回测详情 |
| `/my-strategies` | MyStrategiesPage | ✅ | 我的策略列表 |
| `/my-subscriptions` | MySubscriptionsPage | ✅ | 我的订阅列表 |
| `/live` | LiveTradingPage | ✅ | 实盘控制台（扩展现有） |
| `/admin` | AdminPage | ✅ | 运营后台 |

### 9.2 组件树

```
App
├── WagmiProvider (复用 ERC-8004 config)
├── QueryClientProvider
├── Sidebar (复用 PocketX)
│   ├── Market (new)
│   ├── Workshop (new)
│   ├── My Strategies (new)
│   ├── Live Trading (existing, enhanced)
│   ├── My Subscriptions (new)
│   └── Settings (existing)
├── TopBar (复用 PocketX)
│   ├── WalletConnect (复用 ERC-8004)
│   └── NetworkSwitcher
└── Routes
    ├── /market/* (new)
    │   ├── MarketPage
    │   │   ├── CategoryCards
    │   │   ├── HotStrategies
    │   │   └── NewStrategies
    │   ├── StrategyListPage
    │   │   ├── SearchFilters (复用 ERC-8004)
    │   │   ├── StrategyCard (改造 ERC-8004 AgentCard)
    │   │   └── Pagination
    │   └── StrategyDetailPage
    │       ├── BacktestCharts
    │       ├── PricingTable
    │       ├── SubscribeButton
    │       └── ReviewsSection
    ├── /workshop/* (new)
    │   ├── StrategyEditorPage
    │   │   ├── MonacoEditor
    │   │   ├── AIPromptInput
    │   │   └── ConfigPanel
    │   └── BacktestPage
    │       ├── EquityCurveChart
    │       ├── MonthlyHeatmap
    │       ├── MetricsCards
    │       └── TradeLogTable
    ├── /live (existing, enhanced)
    │   └── LiveTradingPage
    │       ├── DEXTab / DeFiTab
    │       ├── ActiveTraderList
    │       └── TradeStream (WebSocket)
    └── /admin (new)
        ├── DataOverview
        ├── StrategyManager
        ├── UserManager
        └── RevenueReport
```

### 9.3 技术栈

| 层 | 选型 | 来源 |
|----|------|------|
| 框架 | React 19 + TypeScript | 现有 |
| 构建 | Vite | 现有 |
| 样式 | Tailwind CSS | 现有 |
| 路由 | react-router-dom v6 | 现有 |
| 链交互 | wagmi v2 + viem | 复用 ERC-8004 config |
| 代码编辑器 | @monaco-editor/react | 新增 |
| 图表 | Recharts | 新增（替换 ECharts） |
| 钱包连接 | WalletConnect + injected + metaMask | 复用 PocketX/ERC-8004 |
| 状态管理 | React Query (TanStack) | 复用 ERC-8004 |
| IPFS | Pinata SDK / Infura IPFS | 新增 |

---

## 10. 部署与运维

### 10.1 Docker Compose 扩展

```yaml
# deploy/docker-compose.yml (V4 新增服务)

services:
  # === V3 现有 ===
  postgres: ...
  redis: ...
  gateway: ...
  worker: ...
  learning: ...
  frontend: ...

  # === V4 新增 ===
  backtest-engine:
    build:
      context: ../services/backtest-engine
      dockerfile: Dockerfile
    image: aihunter-backtest:latest
    container_name: aihunter-backtest
    restart: unless-stopped
    environment:
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql://...
      - OKX_API_KEY=${OKX_API_KEY}
      - OKX_SECRET_KEY=${OKX_SECRET_KEY}
    depends_on:
      - redis
      - postgres
    volumes:
      - ../services/backtest-engine/app:/app

  ipfs-pinata:
    # 如果不用 Infura IPFS，部署本地 IPFS 节点
    image: ipfs/kubo:latest
    container_name: aihunter-ipfs
    restart: unless-stopped
    ports:
      - "4001:4001"
      - "5001:5001"
```

### 10.2 环境变量（新增）

```bash
# deploy/.env (新增项)

# === ERC-8004 合约地址 (Sepolia) ===
IDENTITY_REGISTRY_ADDRESS=0x4Bd537B9E4e4501D25f32B3Cd57C84dF1f229352
REPUTATION_REGISTRY_ADDRESS=0x6E66299B52F1707b244347F6953Cc869760f444E
VALIDATION_REGISTRY_ADDRESS=0x55946d37635bfF0393509002ADd60877F009c311
PAYMENT_GATEWAY_ADDRESS=TBD
SUBSCRIPTION_MANAGER_ADDRESS=TBD
AGENT_WALLET_ADDRESS=TBD

# === IPFS ===
IPFS_PROVIDER=infura              # infura | pinata | local
INFURA_IPFS_PROJECT_ID=xxx
INFURA_IPFS_SECRET=xxx
PINATA_API_KEY=xxx
PINATA_SECRET_KEY=xxx

# === Chain RPC ===
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/${INFURA_PROJECT_ID}

# === Platform ===
PLATFORM_FEE_BPS=500              # 5% (500 basis points)
PLATFORM_WALLET_ADDRESS=0x...

# === Backtest Engine ===
BACKTEST_CONTAINER_NAME=aihunter-backtest
BACKTEST_MAX_CONCURRENT=5
BACKTEST_TIMEOUT_SECONDS=300
```

### 10.3 部署步骤

```bash
# 1. 部署扩展合约到 Sepolia
cd contracts && npx hardhat run scripts/deploy/extensions.js --network sepolia
# → 记录合约地址，更新 .env

# 2. 构建回测引擎镜像
cd services/backtest-engine && docker build -t aihunter-backtest:latest .

# 3. 数据库迁移
cd deploy && docker compose run --rm gateway node scripts/migrate-v4.js

# 4. 启动全部服务
docker compose --env-file .env up -d

# 5. 构建前端
cd .. && npx vite build && cp -r dist/* deploy/frontend/
docker restart aihunter-frontend
```

### 10.4 监控

| 指标 | 工具 | 说明 |
|------|------|------|
| API 响应时间 | Gateway logs → Prometheus | 已有基础 |
| 回测队列长度 | Redis LLEN backtest:queue | 新增 |
| 订阅到期数 | SQL: `COUNT(*) WHERE expires_at < NOW() + INTERVAL '3 days'` | 新增 |
| 合约调用失败率 | wagmi `useWaitForTransactionReceipt` error count | 新增 |
| 代理地址余额 | OKX API 定时轮询 | 新增 |

---

## 附录 A: 与 V3 的变更对比

| 维度 | V3 现状 | V4 新增 |
|------|---------|---------|
| 用户模型 | 单用户（自己用） | 钱包地址 DID + 策略师/交易者双角色 |
| 策略来源 | Worker 内置 3 策略 | + 用户自建策略（IDE + AI 生成） |
| 策略存储 | `strategy_registry` 内置 | + `strategies` 表（用户创建） |
| 执行层 | 个人 OKX wallet | + 每订阅者独立代理地址 |
| 路由 | 7 个页面 | + 4 个新页面（/market /workshop /my-strategies /my-subscriptions） |
| 合约 | 无 | ERC-8004 10 合约 (Sepolia) |
| IPFS | 无 | 策略元数据存储 |
| 回测 | 无 | AItrader 引擎 Docker 化 |
| 学习层 | Optuna 自用 | + 策略师参数优化通知 |

---

## 附录 B: 参考仓库

| 仓库 | 复用内容 | 链接 |
|------|----------|------|
| ERC-8004 | 10合约 + 8hooks + 市场前端 | https://github.com/sftgroup/erc8004 |
| AItrader (QuantDinger) | 回测引擎 + 50+策略模板 | https://github.com/sftgroup/AItrader |
| PocketX | Sidebar/ConnectModal/TopBar | https://github.com/sftgroup/pocketX |
| AIOps-SaaS | Prisma Schema + 中间件 | https://github.com/sftgroup/aiops-saas |
| AIHunter V3 | 现有执行层+Worker+学习层 | https://github.com/sftgroup/aihunter |

---

> 📋 V4 技术方案 v1.0 · 2026-06-27 · Wayne
