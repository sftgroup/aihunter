# AIHunter Embed SDK PRD v1.0

> **版本**: 1.0 | **日期**: 2026-06-26 | **作者**: AIHunter Product Team (PM)
>
> **前置阅读**:
> - [V3 三层架构蓝图](./aihunter-v3-architecture.md)
> - [DeFi 套利 PRD](./prd-aihunter-defi-arbitrage.md)
> - [实盘交易 P0 PRD](./prd-aihunter-live.md)

---

## 目录

1. [产品定位](#1-产品定位)
2. [接入方画像](#2-接入方画像)
3. [接入方式对比](#3-接入方式对比)
4. [推荐方案与理由](#4-推荐方案与理由)
5. [核心能力](#5-核心能力)
6. [安全模型](#6-安全模型)
7. [嵌入 UI 规范](#7-嵌入-ui-规范)
8. [事件回调](#8-事件回调)
9. [技术方案](#9-技术方案)
10. [用户故事](#10-用户故事)
11. [里程碑与交付计划](#11-里程碑与交付计划)
12. [附录](#12-附录)

---

## 1. 产品定位

### 1.1 AIHunter Embed SDK 是什么

AIHunter Embed SDK 是一套**轻量级的嵌入式接入工具包**，允许第三方钱包应用和 dApp 在其产品内集成 AIHunter 的策略信号、自动交易执行和自主学习能力。

它并不是一个独立产品，而是 AIHunter V3 三层架构（策略层 · 执行层 · 学习层）的**能力外溢通道**：

```
┌──────────────────────────────────────────────────────────────┐
│              AIHunter V3 三层架构 (内部)                      │
│                                                              │
│  📊 策略层 ──── 🔧 执行层 ──── 🧠 学习层                    │
│  (信号扫描)     (自动交易)      (参数优化/规则蒸馏)           │
│       │                                                        │
│       │  ┌─────────────────────────────────────────┐         │
│       └──│      AIHunter Embed SDK (对外)           │         │
│          │                                         │         │
│          │  ┌─────────┐  ┌─────────┐  ┌─────────┐ │         │
│          │  │ 钱包嵌入 │  │ dApp嵌入 │  │ Open API│ │         │
│          │  │ (信号+交易)│ │ (策略模块)│ │ (数据查询)│ │         │
│          │  └─────────┘  └─────────┘  └─────────┘ │         │
│          └─────────────────────────────────────────┘         │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 为谁解决什么问题

| 接入方 | 痛点 | SDK 解决的 |
|--------|------|-----------|
| **钱包客户端** (MetaMask/OKX Wallet/TokenPocket) | 用户切换 App 成本高，钱包内无法直接看到交易信号，交易流程碎片化 | 用户留在钱包内即可查看 AI 信号、一键交易，无需安装 AIHunter |
| **dApp (DeFi 项目)** | 想集成智能套利/交易能力，但自建成本高（需链上监听 + AI 模型 + 执行引擎） | 嵌入 AIHunter 的策略模块即可获得价差套利/动量突破等能力 |
| **DEX 聚合器** | 需要信号流作为用户停留理由，但开发 AI 策略团队成本高 | 通过 Open API 获取实时信号流，丰富聚合器功能 |
| **交易社区/Telegram Bot** | 想推送 Alpha 信号但缺乏稳定信号源 | 接入信号 API，按需推送高评分信号 |

### 1.3 核心价值主张

> **让 AIHunter 的策略寻利 + 自动执行能力，像 SDK 一样嵌入任何钱包或 dApp。**
>
> 接入方不需要理解 V3 三层架构的内部实现——只需 3 行代码，即可获得 AI 驱动的链上交易能力。

### 1.4 不做什么 (Out of Scope)

- ❌ **不是白标产品** — SDK 嵌入后保持 AIHunter 品牌可见，不提供完全去品牌化
- ❌ **不是开源协议层** — 不开放策略引擎源码，信号评分模型不开源
- ❌ **不负责钱包创建** — SDK 不提供独立的钱包创建/私钥管理，依赖宿主的钱包/Provider
- ❌ **初期不支持 CE 交易所** — M1 阶段仅支持链上 DEX 交易，不包含 CEX API 交易

---

## 2. 接入方画像

### 2.1 钱包客户端 — 典型场景

```
┌─────────────────────────────────────────────────┐
│  OKX Wallet                               🔔 ⚙  │
├─────────────────────────────────────────────────┤
│  资产  │  NFT  │  交易  │ [AIHunter 信号] │ 发现  │  ← 新 Tab 入口
├─────────────────────────────────────────────────┤
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │ 🚀 动量突破         今日信号 23 · 评分≥60 │   │
│  │ ──────────────────────────────────────── │   │
│  │ ETH 0x3f2a...  评分78  置信0.82  [买入]  │   │
│  │ BSC 0x7b1c...  评分65  置信0.71  [买入]  │   │
│  │ BASE 0xa91d... 评分71  置信0.79  [买入]  │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │ 💱 DEX价差套利      今日机会 7 · 利润≥$5  │   │
│  │ ──────────────────────────────────────── │   │
│  │ ETH USDC/USDT  spread 0.8% +$12 [执行]   │   │
│  │ ARB WETH/USDC  spread 1.2% +$8  [执行]   │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  由 AIHunter 提供 · 交易通过 OKX 聚合器执行       │
└─────────────────────────────────────────────────┘
```

**核心需求**:
1. 用户留在钱包 App 内完成"发现信号→确认交易→查看结果"全流程
2. 交易执行依赖钱包的 Provider（EIP-1193 / OKX Wallet API）
3. 嵌入页面适配钱包的深色/亮色主题
4. 极轻量 — 不能显著影响钱包 App 体积

### 2.2 dApp — 典型场景

```
┌─────────────────────────────────────────────────┐
│  SushiSwap Pro                              🌓  │
├─────────────────────────────────────────────────┤
│  Swap  │  Pool  │  策略 (AIHunter)  │  分析      │  ← 嵌入的策略 Tab
├─────────────────────────────────────────────────┤
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │ AI 套利策略 (Powered by AIHunter)         │   │
│  │                                           │   │
│  │ 当前扫描: ETH/USDT (Uni V3 ↔ Sushi V2)   │   │
│  │ 价差: 0.85%  │  预估利润: $14.20         │   │
│  │                                           │   │
│  │ 买: SushiSwap @ $3,421  →  卖: Uniswap @ $3,450 │
│  │                                           │   │
│  │ [执行一键套利]  [查看套利历史]             │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  策略配置:                                       │
│  ┌──────────────────────────────────────────┐   │
│  │ 最低价差: [0.5%]  最大金额: [$1000]       │   │
│  │ 目标 DEX: [Uniswap] [SushiSwap] [Curve]  │   │
│  │ [保存配置]                                │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
└─────────────────────────────────────────────────┘
```

**核心需求**:
1. 嵌入特定策略模块（如只嵌入价差套利），不需要全量策略
2. 策略配置在 dApp 侧管理
3. 与 dApp 自身 UI 风格融合
4. 用户钱包由 dApp 提供（wagmi / ethers / viem）

---

## 3. 接入方式对比

### 3.1 四种技术方案

| 方案 | 接入方式 | 接入复杂度 | 定制能力 | 安全性 | 性能 | 适用场景 |
|------|---------|-----------|---------|--------|------|---------|
| **A. iframe 嵌入** | `<iframe src="...">` 直嵌 | ⭐ 极低 | ⭐ 低 | ⭐⭐ 中 | ⭐⭐ 中 | 快速验证、内部工具 |
| **B. JS SDK (npm)** | `npm install @aihunter/sdk` | ⭐⭐ 低 | ⭐⭐⭐⭐ 高 | ⭐⭐⭐⭐ 高 | ⭐⭐⭐⭐ 高 | 主流方式、深度集成 |
| **C. Widget Loader** | `<script>` + `<aihunter-*>` | ⭐ 极低 | ⭐⭐ 中 | ⭐⭐⭐ 高 | ⭐⭐⭐ 高 | 快速接入、低代码 |
| **D. Open API** | REST/WebSocket API 直调 | ⭐⭐⭐ 中 | ⭐⭐⭐⭐⭐ 最高 | ⭐⭐⭐ 高 | ⭐⭐⭐⭐⭐ 最高 | 后端集成、Telegram Bot |

### 3.2 方案 A — iframe 嵌入

```html
<!-- 接入方只需一行 -->
<iframe
  src="https://embed.aihunter.io/strategies/momentum?apiKey=xxx&theme=dark&chain=ETH"
  width="100%"
  height="600"
  frameborder="0"
  allow="clipboard-write"
/>
```

**优点**:
- 接入最快，一行 HTML 即可
- AIHunter 完全控制 UI 渲染和更新
- 安全隔离 — iframe 无法访问宿主 DOM

**缺点**:
- 无法深度定制 UI（只能通过 URL 参数控制主题/语言等）
- 通信依赖 `postMessage`，复杂交互体验差
- 响应式布局受限（iframe 固定高度，滚动问题）
- SEO 和 Accessibility 较差
- 钱包连接需要 iframe 内独立处理，无法复用宿主钱包

**判定**: ⚠️ 仅适用于快速 Demo 或内部工具，不适合生产级集成。

### 3.3 方案 B — JS SDK (npm 包)

```bash
# 安装
npm install @aihunter/sdk

# 使用
```

```javascript
import { createAIHunter } from '@aihunter/sdk';

const aihunter = createAIHunter({
  apiKey: 'ah_live_xxx',
  theme: 'dark',
  locale: 'zh-CN',
  chain: 'ETH',
});

// 渲染策略信号组件
aihunter.mountSignalList('#my-signal-container', {
  strategies: ['momentum', 'spread_arbitrage'],
  onSignalClick: (signal) => { /* 自定义处理 */ },
});

// 渲染套利看板组件
aihunter.mountArbitrageBoard('#my-arb-container', {
  pairs: ['USDC/USDT', 'WETH/USDC'],
  minSpreadPct: 0.3,
  onTrade: async (trade) => {
    // dApp 用自有钱包执行交易
    const tx = await wallet.sendTransaction(trade.tx);
    return tx.hash;
  },
});
```

**优点**:
- 完全可定制 UI（React/Vue 组件化）
- 宿主提供钱包 Provider，无缝复用
- 事件回调精确，可深度集成
- TypeScript 类型支持完善
- 支持 Tree-shaking，减小包体积

**缺点**:
- 需要接入方了解 npm/模块打包
- 版本升级需要接入方手动更新
- 不同框架（React/Vue/Vanilla）需要提供对应适配

**判定**: ✅ 推荐作为**主要接入方式**，面向有前端开发能力的接入方。

### 3.4 方案 C — Widget Loader

```html
<!-- 从 CDN 加载 -->
<script src="https://cdn.aihunter.io/sdk/loader.js"></script>

<!-- 声明式使用 -->
<aihunter-signal-list
  data-api-key="ah_live_xxx"
  data-strategies="momentum,spread_arbitrage"
  data-theme="dark"
  data-chain="ETH"
  style="width:100%;min-height:400px"
></aihunter-signal-list>

<aihunter-arbitrage-board
  data-api-key="ah_live_xxx"
  data-min-spread="0.5"
  data-pairs="USDC/USDT,WETH/USDC"
  style="width:100%;min-height:300px"
></aihunter-arbitrage-board>

<aihunter-learning-report
  data-api-key="ah_live_xxx"
  data-strategy-id="momentum"
  style="width:100%;min-height:200px"
></aihunter-learning-report>
```

**优点**:
- 零配置，纯 HTML 声明式使用
- CDN 加载，无需构建工具
- 自动处理主题适配
- 升级自动生效（通过 CDN 版本）

**缺点**:
- 定制能力中等（通过 data 属性控制）
- Web Component 生态兼容性（Shadow DOM 隔离）
- 与 React/Vue 框架集成时有 hydration 问题

**判定**: ✅ 推荐作为**轻量级接入方式**，面向想快速接入的轻量钱包和静态站点。

### 3.5 方案 D — Open API

```bash
# REST 查询信号
curl https://api.aihunter.io/v3/signals \
  -H "Authorization: Bearer ah_key_xxx" \
  -H "Content-Type: application/json" \
  -d '{"strategy_id": "momentum", "chain": "ETH", "min_score": 60}'

# WebSocket 订阅实时信号
wss://api.aihunter.io/v3/ws/signals?apiKey=ah_key_xxx

# 触达策略学习报告
curl https://api.aihunter.io/v3/learning/momentum/report \
  -H "Authorization: Bearer ah_key_xxx"
```

**优点**:
- 完全灵活的 UI 实现
- 适用于非 Web 场景（Telegram Bot、移动原生、后端服务）
- 性能最优 — 无前端 SDK 开销
- 适合构建自定义分析面板

**缺点**:
- 接入方需自行实现全部 UI
- 安全性要求高（API Key 管理、签名等）
- 无内建 UI 组件，开发成本高

**判定**: ✅ 提供作为**高级接入方式**，面向有完全定制需求或非 Web 场景的接入方。

### 3.6 方案选择矩阵

```
                    接入难度 (低→高)
                    ────────────────→
                    快                    慢

定制能力    高    │ JS SDK (B)        │ Open API (D)    │
(低→高)           │ ★★★★ 推荐          │ 高级用户         │
  │               │                   │                 │
  │               │                   │                 │
  │     中        │ Widget Loader (C) │                 │
  │               │ ★★★★ 推荐          │                 │
  │               │                   │                 │
  │               │                   │                 │
  │     低        │ iframe (A)        │                 │
  ↓               │ 仅 Demo 场景       │                 │
```

---

## 4. 推荐方案与理由

### 4.1 推荐策略

| 优先级 | 方案 | 目标用户 | 交付顺序 |
|--------|------|---------|---------|
| **P0** | **JS SDK (npm)** | 钱包 + dApp 深度集成 | M1 首发 |
| **P1** | **Widget Loader (CDN)** | 轻量钱包 + 静态站点 | M2 首发 |
| **P1** | **Open API** | 后端 + Bot + 高级用户 | M1 首发 |
| P2 | iframe 嵌入 | Demo / 内部工具 | M3 |

### 4.2 为什么 JS SDK 是首选

1. **钱包客户端都有前端工程化基础** — OKX Wallet / MetaMask / TokenPocket 都使用 React/TypeScript 技术栈，npm 是标准交付方式
2. **钱包 Provider 复用** — 钱包天然有 EIP-1193 Provider，JS SDK 可以直接消费，无需 SDK 内建钱包
3. **按需加载** — Tree-shaking 可做到仅加载所需策略模块（如仅 `spread_arbitrage`），把包体积控制在 ~50KB gzipped
4. **事件驱动** — JS SDK 的回调机制非常适合钱包内"查看信号→点击交易→调用钱包签名→展示结果"的交互流程
5. **版本管理** — npm 有成熟的 semver 机制，接入方可以显式锁定版本

### 4.3 为什么同时提供 Widget Loader + Open API

- **Widget Loader** 覆盖不想引入 npm 依赖的长尾钱包（如 10 人团队的小型钱包），只需一行 `<script>` 即可
- **Open API** 覆盖非 Web 场景 — Telegram Bot（最大需求）、移动原生 App、后端事件驱动系统
- 三者共享同一套后端 API 鉴权和数据格式，只是前端交付形态不同

---

## 5. 核心能力

### 5.1 SDK 能力全景图

```
AIHunter Embed SDK 能力矩阵

                              JS SDK    Widget    Open API
                              ──────    ──────    ────────
📊 策略信号查询                  ✅        ✅         ✅
📊 信号实时订阅 (WebSocket)      ✅        ✅         ✅
📊 信号筛选 (策略/链/评分)       ✅        ✅         ✅
📊 信号历史查询                  ✅        ✅         ✅

🔧 交易执行(宿主钱包签名)         ✅        ✅         ❌ (接入方实现)
🔧 交易状态查询                  ✅        ✅         ✅
🔧 交易记录查询                  ✅        ✅         ✅
🔧 交易手续费预估                ✅        ✅         ✅

🛡️ 风控参数查询                  ✅        ✅         ✅
🛡️ 风控事件回调                  ✅        ✅         ✅

🧠 学习报告查询                  ✅        ✅         ✅
🧠 学习历史查询                  ✅        ✅         ✅
🧠 触发学习                      ✅        ✅         ✅

⚙️  策略配置管理                  ✅        ✅         ✅
⚙️  链/代币白名单                 ✅        ✅         ✅

🎨 UI 组件 (React/Vue)           ✅        ❌         ❌
🎨 主题适配 (亮色/暗色)           ✅        ✅         ❌
```

### 5.2 JS SDK API 设计

```typescript
// ============================================================
// SDK 初始化
// ============================================================

interface AIHunterConfig {
  /** API Key (从 AIHunter 平台获取) */
  apiKey: string;
  /** 是否连接测试环境 */
  testnet?: boolean;
  /** 默认链 */
  chain?: ChainId;               // 'ETH' | 'BSC' | 'ARB' | 'BASE' | 'SOL'
  /** 主题 */
  theme?: 'light' | 'dark' | 'auto';
  /** 语言 */
  locale?: 'zh-CN' | 'en-US';
  /** 覆盖 API 端点 */
  apiBaseUrl?: string;
  /** 宿主钱包 Provider (EIP-1193) */
  walletProvider?: EIP1193Provider;
  /** 交易执行委托（若不提供 walletProvider） */
  txExecutor?: TxExecutor;
}

function createAIHunter(config: AIHunterConfig): AIHunterSDK;

// ============================================================
// 信号查询
// ============================================================

interface SignalQueryParams {
  /** 策略 ID 列表 */
  strategies?: string[];           // ['momentum', 'spread_arbitrage']
  /** 链列表 */
  chains?: ChainId[];
  /** 最低评分 */
  minScore?: number;               // 0-100
  /** 最低置信度 */
  minConfidence?: number;          // 0-1
  /** 排序方式 */
  sortBy?: 'score' | 'timestamp' | 'profit_est';
  /** 排序方向 */
  sortDirection?: 'asc' | 'desc';
  /** 分页 */
  limit?: number;                  // 默认 20, 最大 100
  offset?: number;
}

interface SignalResult {
  signals: SignalPayload[];
  total: number;
  hasMore: boolean;
}

/** 查询信号列表 */
AiHunterSDK.signals.query(params: SignalQueryParams): Promise<SignalResult>;

/** 实时信号订阅 (WebSocket) */
AiHunterSDK.signals.subscribe(
  strategies: string[],
  callback: (signal: SignalPayload) => void,
  filter?: SignalQueryParams
): Unsubscribe;

/** 获取单个信号详情 */
AiHunterSDK.signals.get(signalId: string): Promise<SignalPayload>;

/** 获取信号历史 */
AiHunterSDK.signals.history(params: SignalQueryParams): Promise<SignalResult>;

// ============================================================
// 交易执行 (通过宿主钱包)
// ============================================================

interface TradeRequest {
  signalId: string;
  amount?: number;                 // 可选，若不传则使用策略默认金额
  slippageBps?: number;            // 滑点 (bps), 默认 100 (1%)
  deadline?: number;               // 过期时间 (timestamp)
}

interface TradeResult {
  tradeId: string;
  txHash: string;
  status: 'executing' | 'completed' | 'failed';
  amountIn: number;
  estimatedOut: number;
  gasEstimate: number;
}

/** 执行交易 (通过宿主钱包签名并发送) */
AiHunterSDK.trading.execute(request: TradeRequest): Promise<TradeResult>;

/** 查询交易状态 */
AiHunterSDK.trading.getStatus(tradeId: string): Promise<TradeResult>;

/** 查询交易记录 */
AiHunterSDK.trading.listRecords(params?: {
  strategyId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<TradeRecord[]>;

// ============================================================
// 学习报告
// ============================================================

interface LearningReport {
  strategyId: string;
  version: string;
  lastRun: string;                 // 上次学习时间
  totalExperience: number;
  bestParams: Record<string, any>;
  performance: {
    winRate: number;
    avgPnl: number;
    sharpeRatio: number;
  };
  rules: string[];                 // DeepSeek 蒸馏的规则
}

/** 获取学习报告 */
AiHunterSDK.learning.getReport(strategyId: string): Promise<LearningReport>;

/** 获取学习历史 */
AiHunterSDK.learning.history(strategyId: string): Promise<LearningReport[]>;

/** 手动触发学习 */
AiHunterSDK.learning.trigger(strategyId: string): Promise<void>;

// ============================================================
// 配置管理
// ============================================================

interface StrategyConfig {
  strategyId: string;
  params: Record<string, any>;
  chains: ChainId[];
  tokenWhitelist?: string[];
  tokenBlacklist?: string[];
  autoTrading?: boolean;
}

/** 获取当前策略配置 */
AiHunterSDK.config.get(strategyId: string): Promise<StrategyConfig>;

/** 更新策略配置 */
AiHunterSDK.config.update(strategyId: string, config: Partial<StrategyConfig>): Promise<void>;

// ============================================================
// UI 组件 (React / Vue / Vanilla)
// ============================================================

/** 挂载信号列表组件 */
AiHunterSDK.ui.mountSignalList(
  container: string | HTMLElement,
  options: SignalListOptions
): void;

/** 挂载套利看板 */
AiHunterSDK.ui.mountArbitrageBoard(
  container: string | HTMLElement,
  options: ArbitrageBoardOptions
): void;

/** 挂载学习报告面板 */
AiHunterSDK.ui.mountLearningPanel(
  container: string | HTMLElement,
  options: LearningPanelOptions
): void;

/** 销毁组件 */
AiHunterSDK.ui.destroy(container: string | HTMLElement): void;
```

### 5.3 Widget Loader 自定义元素

| 自定义元素 | 用途 | 关键属性 |
|-----------|------|---------|
| `<aihunter-signal-list>` | 信号列表 | `data-strategies`, `data-chain`, `data-min-score`, `data-theme` |
| `<aihunter-arbitrage-board>` | 套利看板 | `data-pairs`, `data-min-spread`, `data-max-amount`, `data-auto-refresh` |
| `<aihunter-learning-report>` | 学习报告 | `data-strategy-id`, `data-show-history`, `data-theme` |
| `<aihunter-trade-history>` | 交易历史 | `data-strategy-id`, `data-limit`, `data-theme` |

### 5.4 Open API 端点

| Method | Endpoint | 说明 |
|--------|----------|------|
| `GET` | `/v3/signals` | 查询信号列表 |
| `WS` | `/v3/ws/signals` | 实时信号订阅 |
| `GET` | `/v3/signals/:id` | 获取信号详情 |
| `POST` | `/v3/trade/quote` | 获取交易报价 |
| `POST` | `/v3/trade/submit` | 提交交易（提交已签名 tx） |
| `GET` | `/v3/trade/:id` | 查询交易状态 |
| `GET` | `/v3/trades` | 查询交易记录列表 |
| `GET` | `/v3/learning/:strategyId/report` | 获取学习报告 |
| `GET` | `/v3/learning/:strategyId/history` | 获取学习历史 |
| `POST` | `/v3/learning/:strategyId/trigger` | 触发学习 |
| `GET` | `/v3/config/:strategyId` | 获取策略配置 |
| `PUT` | `/v3/config/:strategyId` | 更新策略配置 |

---

## 6. 安全模型

### 6.1 鉴权体系

```
┌──────────────────────────────────────────────────────────────┐
│                    AIHunter Embed SDK 鉴权体系                │
│                                                              │
│  接入方注册                                                  │
│  ┌──────────┐  提交信息    ┌─────────────────┐              │
│  │ dApp/钱包 │ ──────────→ │ AIHunter Platform │              │
│  │ 开发者    │             │ (审核开通 API 权限)│              │
│  └──────────┘             └────────┬────────┘              │
│                                    │                        │
│                              申请 API Key                    │
│                                    │                        │
│                                    ▼                        │
│                          ┌─────────────────┐               │
│                          │  ah_live_xxx    │ (生产)          │
│                          │  ah_test_xxx   │ (测试)          │
│                          └────────┬────────┘               │
│                                   │                         │
│          ┌────────────────────────┼──────────────────┐     │
│          │                        ▼                    │     │
│          │    ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐      │     │
│          │    │  API Key 模式 (M1 首发)                     │     │
│          │    │  • Header: X-API-Key                │     │     │
│          │    │  • 服务端调用 或 前端前端              │     │     │
│          │    │  • IP 白名单(可选) + Rate Limit       │     │     │
│          │    └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘      │     │
│          │                                              │     │
│          │    ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐      │     │
│          │    │  JWT 模式 (M2 增强)                          │     │
│          │    │  • 接入方服务端签发 JWT                │     │     │
│          │    │  • 用户级权限控制                       │     │     │
│          │    │  • 前端安全(不暴露API Key)             │     │     │
│          │    └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘      │     │
│          │                                              │     │
│          │    ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐      │     │
│          │    │  Wallet 签名模式 (M3 增强)                   │     │
│          │    │  • 用户钱包签名验证                    │     │     │
│          │    │  • 去中心化鉴权, 零信任              │     │     │
│          │    └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘      │     │
│          └────────────────────────────────────────────┘     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 6.2 API Key 模式 (M1)

```
请求头:
  Authorization: Bearer ah_live_abc123def456
  X-API-Key: ah_live_abc123def456

安全措施:
  • API Key 绑定注册域名/Origin (CORS白名单)
  • 可选 IP 白名单
  • Rate Limit (见 6.4)
  • 定期轮换提醒
  • 密钥泄露自动熔断
```

### 6.3 交易安全 — 签名权始终在用户侧

**核心原则：SDK 绝不接触私钥。**

```
交易流程中的安全边界

┌──────────────────────────────────────────────┐
│  AIHunter SDK 域 (不接触私钥)                  │
│                                               │
│  ① 查询信号 → ② 获取报价(Quote)               │
│       │               │                       │
│       │               │ 返回未签名交易数据      │
│       │               ▼                       │
│       │        ③ 组装交易参数                  │
│       │       tx = { to, data, value, ... }   │
│       │               │                       │
│       ▼               ▼                       │
│  ─ ─ ─ ─ ─ ─ 安全边界 ─ ─ ─ ─ ─ ─           │
│                       │                       │
│  ┌──────────────────────────────────────┐    │
│  │  宿主钱包域 (控制私钥)                  │    │
│  │                                       │    │
│  │  ④ 钱包弹出确认 → ⑤ 用户签名          │    │
│  │  ⑥ 发送交易 → ⑦ 返回 txHash          │    │
│  └──────────────────────────────────────┘    │
│                                               │
│  SDK 仅接收 txHash 用于展示和记录              │
└──────────────────────────────────────────────┘
```

**交易执行方式对比**:

| 方式 | 签名位置 | 适合场景 | 风险 |
|------|---------|---------|------|
| **钱包 Provider** | 宿主钱包 (MetaMask/OKX) | 钱包嵌入场景 | ✅ 最低风险 |
| **TxExecutor 回调** | dApp 自定义 | dApp 集成场景 | ✅ dApp 控制签名 |
| Agentic Wallet (内部) | AIHunter TEE 钱包 | AIHunter 自有 App | ⚠️ 仅 AIHunter 自身使用 |
| SDK 内建签名 | — | ❌ 永远不做 | 🔴 绝对不在 SDK 中处理私钥 |

### 6.4 限流策略

| 端点类别 | 免费 Tier | 付费 Tier (Pro) | 企业 Tier |
|---------|-----------|----------------|-----------|
| 信号查询 (REST) | 30 req/min | 300 req/min | 1000 req/min |
| 信号订阅 (WS) | 1 连接/IP | 10 连接/IP | 100 连接/IP |
| 交易报价 | 20 req/min | 200 req/min | 无限制 |
| 学习报告 | 10 req/min | 50 req/min | 200 req/min |
| 总并发连接 | 5 | 50 | 500 |

限流实现：
- **Token Bucket 算法**在 API Gateway 层实现
- 超过限制返回 `429 Too Many Requests` + `Retry-After` 头
- 免费 Tier 特有速率用 `X-RateLimit-*` 响应头告知

### 6.5 权限控制矩阵

```
                    read:signals   write:trade   read:learning   write:config
                    ────────────   ───────────   ─────────────   ────────────
免费账号             ✅              ❌              ✅               ❌
付费账号 (Pro)       ✅              ✅              ✅               ✅
企业账号             ✅              ✅              ✅               ✅
SDK Key (前端)       ✅              ✅ *            ✅               ❌
Server Key (后端)    ✅              ✅              ✅               ✅

* SDK Key 的交易写入需要额外配置白名单域名
```

---

## 7. 嵌入 UI 规范

### 7.1 主题适配

SDK 组件支持三种主题模式：

```typescript
type ThemeMode = 'light' | 'dark' | 'auto';

// 主题色规范
const themeColors = {
  light: {
    '--ah-bg-primary':      '#FFFFFF',
    '--ah-bg-secondary':    '#F9FAFB',
    '--ah-bg-tertiary':     '#F3F4F6',
    '--ah-text-primary':    '#111827',
    '--ah-text-secondary':  '#6B7280',
    '--ah-text-tertiary':   '#9CA3AF',
    '--ah-border':          '#E5E7EB',
    '--ah-accent':          '#3B82F6',
    '--ah-success':         '#10B981',
    '--ah-warning':         '#F59E0B',
    '--ah-danger':          '#EF4444',
    '--ah-chart-up':        '#22C55E',
    '--ah-chart-down':      '#EF4444',
  },
  dark: {
    '--ah-bg-primary':      '#111827',
    '--ah-bg-secondary':    '#1F2937',
    '--ah-bg-tertiary':     '#374151',
    '--ah-text-primary':    '#F9FAFB',
    '--ah-text-secondary':  '#9CA3AF',
    '--ah-text-tertiary':   '#6B7280',
    '--ah-border':          '#374151',
    '--ah-accent':          '#60A5FA',
    '--ah-success':         '#34D399',
    '--ah-warning':         '#FBBF24',
    '--ah-danger':          '#F87171',
    '--ah-chart-up':        '#4ADE80',
    '--ah-chart-down':      '#F87171',
  },
};
```

使用 CSS Variables 实现，接入方可通过覆盖 CSS 变量深度定制：

```css
/* 接入方覆盖示例 */
aihunter-signal-list {
  --ah-accent: #ec4899;     /* 匹配品牌色 */
  --ah-bg-primary: #0f172a; /* 匹配暗色背景 */
}
```

### 7.2 响应式规范

| 断点 | 宽度 | 列数 | 组件行为 |
|------|------|------|---------|
| Mobile | < 640px | 1 | 卡片纵向排列，简化信息密度 |
| Tablet | 640px – 1024px | 1-2 | 双列卡片，完整信息展示 |
| Desktop | ≥ 1024px | 2-3 | 多列卡片 + 侧边详情面板 |

**最小宽度**: 320px（支持 iPhone SE）

**推荐最小高度**: 400px（若容器高度不足，组件内部滚动）

### 7.3 品牌露出规范

```
┌──────────────────────────────────┐
│                                   │
│   [组件内容区域]                    │
│                                   │
│                                   │
├──────────────────────────────────┤
│  Powered by AIHunter   🔗 了解更多 │   ← 底部品牌条 (40px)
└──────────────────────────────────┘
```

- 每个嵌入组件底部有 40px 的品牌条
- 包含 "Powered by AIHunter" 文字 + 可跳转官网的链接
- 付费企业版本可去除此品牌条（需单独协议）

### 7.4 加载与错误状态

| 状态 | UI 表现 |
|------|---------|
| **加载中** | 骨架屏 (Skeleton)，匹配组件形状 |
| **空数据** | 策略名称 + 空状态插图 + 说明文字 |
| **网络错误** | 错误图标 + "信号加载失败" + [重试] 按钮 |
| **API Key 无效** | "未授权 — 请检查 API Key" + 链接到设置 |
| **限流** | "请求过于频繁，请稍后再试" + 倒计时 |

### 7.5 国际化 (i18n)

M1 支持：简体中文 (zh-CN)、英文 (en-US)
M2 扩展：繁体中文 (zh-TW)、日文 (ja-JP)、韩文 (ko-KR)

所有文本通过 i18n key 管理，接入方可通过配置传自定义 locale：

```javascript
createAIHunter({
  locale: 'en-US',
  // 或自定义覆盖部分文案
  customI18n: {
    'signal.buy': 'Swap',
    'signal.sell': 'Dump',
  },
});
```

---

## 8. 事件回调

### 8.1 事件体系

```typescript
// ============================================================
// SDK 事件类型
// ============================================================

interface AIHunterEvents {
  // --- 生命周期 ---
  'ready': () => void;
  'error': (error: AIHunterError) => void;

  // --- 信号事件 ---
  'signal:new': (signal: SignalPayload) => void;
  'signal:update': (signal: SignalPayload) => void;
  'signal:expired': (signalId: string) => void;

  // --- 交易事件 ---
  'trade:request': (request: TradeRequest) => void;           // 交易请求发起 (可在回调中修改)
  'trade:quote': (quote: TradeQuote) => void;                  // 报价返回
  'trade:confirm': (trade: ConfirmedTrade) => void;            // 用户确认(钱包签名前)
  'trade:signed': (txHash: string) => void;                    // 签名完成
  'trade:submitted': (txHash: string) => void;                 // 交易已广播
  'trade:success': (result: TradeSuccess) => void;             // 交易成功
  'trade:failed': (result: TradeFailed) => void;               // 交易失败
  'trade:reverted': (result: TradeReverted) => void;           // 交易被回滚

  // --- 风控事件 ---
  'risk:triggered': (event: RiskEvent) => void;                // 风控拦截
  'risk:warning': (event: RiskEvent) => void;                  // 风控预警

  // --- 学习事件 ---
  'learning:started': (strategyId: string) => void;
  'learning:completed': (report: LearningReport) => void;
  'learning:failed': (strategyId: string, error: string) => void;

  // --- 连接事件 ---
  'connection:change': (status: 'connected' | 'disconnected' | 'reconnecting') => void;
  'rateLimit': (info: { retryAfter: number }) => void;
}
```

### 8.2 回调使用示例

**场景 1: 钱包 — 监听交易结果并展示 Toast**

```javascript
const aihunter = createAIHunter({
  apiKey: 'ah_live_xxx',
  walletProvider: window.ethereum,
});

aihunter.on('trade:success', (result) => {
  toast.success(`交易成功! ${result.netPnl > 0 ? '+' : ''}$${result.netPnl.toFixed(2)}`, {
    action: { label: '查看', onClick: () => openTxExplorer(result.txHash) },
  });
});

aihunter.on('trade:failed', (result) => {
  toast.error(`交易失败: ${result.reason}`);
});

aihunter.on('risk:triggered', (event) => {
  toast.warning(`风控拦截: ${event.reason}`, {
    description: `策略: ${event.strategyId} | ${event.detail}`,
  });
});
```

**场景 2: dApp — 自定义交易确认流程**

```javascript
aihunter.on('trade:request', async (request) => {
  // dApp 插入自定义检查
  const confirmed = await showCustomConfirmDialog({
    title: '确认套利',
    body: `在 ${request.dexBuy} 买入 → ${request.dexSell} 卖出`,
    profit: request.estimatedProfit,
    gas: request.gasEstimate,
  });

  if (!confirmed) {
    return { abort: true, reason: 'user_rejected' };
  }

  // 可以修改金额
  return { ...request, amount: customAmount };
});
```

**场景 3: 接入方分析 — 记录所有信号和交易**

```javascript
aihunter.on('signal:new', (signal) => {
  analytics.track('aihunter_signal', {
    strategy: signal.strategy_id,
    chain: signal.chain,
    score: signal.score,
    token: signal.token_symbol,
  });
});

aihunter.on('trade:success', (result) => {
  analytics.track('aihunter_trade_completed', {
    strategy: result.strategyId,
    pnl: result.netPnl,
    duration: result.durationMs,
  });
});
```

---

## 9. 技术方案

### 9.1 整体架构

```
┌───────────────────────────────────────────────────────────────────┐
│                       接入方 (钱包 / dApp)                          │
│                                                                    │
│  ┌──────────────────────────────────────────────────┐             │
│  │  @aihunter/sdk (前端 npm)                         │             │
│  │                                                    │             │
│  │  ┌─────────┐  ┌──────────┐  ┌──────────────────┐ │             │
│  │  │ Core    │  │ UI       │  │ Connector         │ │             │
│  │  │ 鉴权    │  │ React    │  │ • EIP-1193        │ │             │
│  │  │ 缓存    │  │ Vue      │  │ • 自定义 TxExecutor│ │             │
│  │  │ 事件    │  │ Vanilla  │  │ • OKX Wallet API  │ │             │
│  │  └────┬────┘  └────┬─────┘  └────────┬─────────┘ │             │
│  │       │            │                 │            │             │
│  └───────┼────────────┼─────────────────┼────────────┘             │
│          │            │                 │                           │
└──────────┼────────────┼─────────────────┼───────────────────────────┘
           │            │                 │
           │  HTTPS + WSS                │ 钱包签名 (本地)
           │            │                 │
┌──────────┼────────────┼─────────────────┼───────────────────────────┐
│          ▼            ▼                                     │       │
│  ┌──────────────────────────────────────────────────────┐  │       │
│  │               AIHunter API Gateway                     │  │       │
│  │                                                        │  │       │
│  │  ┌─────────────┐  ┌───────────────┐  ┌─────────────┐  │  │       │
│  │  │ API Key     │  │ Rate Limiter   │  │ CORS         │  │  │       │
│  │  │ Validator   │  │ (Token Bucket) │  │ Enforcer     │  │  │       │
│  │  └──────┬──────┘  └──────┬────────┘  └──────┬──────┘  │  │       │
│  │         │                │                  │          │  │       │
│  │         ▼                ▼                  ▼          │  │       │
│  │  ┌─────────────────────────────────────────────────┐  │  │       │
│  │  │              SDK API Router                      │  │  │       │
│  │  │  /v3/signals  /v3/trade  /v3/learning  /v3/config│  │  │       │
│  │  └──────────────────────┬──────────────────────────┘  │  │       │
│  │                         │                              │  │       │
│  │         ┌───────────────┼───────────────┐             │  │       │
│  │         ▼               ▼               ▼             │  │       │
│  │  ┌──────────┐  ┌──────────────┐  ┌──────────────┐   │  │       │
│  │  │ 信号服务  │  │ 执行层服务    │  │ 学习服务     │   │  │       │
│  │  │ (Redis)  │  │ (AutoTrader) │  │ (Learner)    │   │  │       │
│  │  └──────────┘  └──────────────┘  └──────────────┘   │  │       │
│  │                                                        │  │       │
│  │  ⬆ 复用现有 V3 三层架构, 不重复建设                    │  │       │
│  └──────────────────────────────────────────────────────┘  │       │
│                                                              │       │
│  AIHunter Backend (现有 V3 基础设施)                          │       │
└──────────────────────────────────────────────────────────────┘       │
```

### 9.2 前端 SDK 包结构

```
packages/aihunter-sdk/
├── package.json
├── tsconfig.json
├── rollup.config.ts                 # 打包配置 (Rollup, 输出 ESM + CJS + UMD)
├── README.md
├── CHANGELOG.md
│
├── src/
│   ├── index.ts                     # 入口: createAIHunter()
│   ├── core/
│   │   ├── AIHunterSDK.ts           # SDK 主类
│   │   ├── config.ts               # 配置管理
│   │   ├── auth.ts                 # 鉴权 (API Key 处理)
│   │   ├── cache.ts                # 内存缓存 (信号/配置)
│   │   ├── events.ts               # 事件系统 (EventEmitter)
│   │   └── websocket.ts            # WebSocket 管理 (重连/心跳)
│   │
│   ├── modules/
│   │   ├── signals/
│   │   │   ├── SignalsModule.ts    # 信号查询/订阅模块
│   │   │   └── types.ts            # SignalPayload 类型
│   │   ├── trading/
│   │   │   ├── TradingModule.ts    # 交易执行模块
│   │   │   └── types.ts
│   │   ├── learning/
│   │   │   ├── LearningModule.ts   # 学习报告模块
│   │   │   └── types.ts
│   │   └── config/
│   │       ├── ConfigModule.ts     # 策略配置模块
│   │       └── types.ts
│   │
│   ├── connectors/
│   │   ├── EIP1193Connector.ts     # 标准 EIP-1193 钱包连接器
│   │   ├── OKXConnector.ts         # OKX Wallet 特殊适配
│   │   └── CustomConnector.ts      # 自定义 txExecutor 连接器
│   │
│   ├── ui/
│   │   ├── react/                  # React 组件
│   │   │   ├── AIHunterProvider.tsx # Context Provider
│   │   │   ├── SignalList.tsx      # 信号列表组件
│   │   │   ├── ArbitrageBoard.tsx  # 套利看板组件
│   │   │   ├── LearningPanel.tsx   # 学习面板组件
│   │   │   ├── TradeHistory.tsx    # 交易历史组件
│   │   │   ├── Skeleton.tsx        # 骨架屏
│   │   │   └── hooks/
│   │   │       ├── useSignals.ts   # 信号订阅 Hook
│   │   │       ├── useTrading.ts   # 交易执行 Hook
│   │   │       └── useAIHunter.ts  # SDK 实例 Hook
│   │   ├── vue/                    # Vue 3 组件 (M2)
│   │   ├── vanilla/                # Vanilla JS 渲染 (M1)
│   │   └── styles/
│   │       ├── theme.css           # CSS Variables 主题
│   │       ├── components.css      # 组件样式
│   │       └── responsive.css      # 响应式
│   │
│   └── types/
│       ├── index.ts                # 导出所有类型
│       ├── signal.ts               # 统一信号类型 (对齐 V3 SignalPayload)
│       ├── trade.ts
│       └── learning.ts
│
├── widgets/                         # Widget Loader (Web Components)
│   ├── loader.js                    # CDN 入口
│   ├── elements/
│   │   ├── SignalListElement.ts
│   │   ├── ArbitrageBoardElement.ts
│   │   ├── LearningPanelElement.ts
│   │   └── TradeHistoryElement.ts
│   └── runtime.js                   # 共享运行时
│
└── tests/
    ├── unit/
    └── integration/
```

### 9.3 后端 API 扩展

在现有 Gateway (`services/gateway/`) 上新增 SDK 专属路由层，不修改现有巨石 index.js，遵循 V3 架构策略：

```
services/gateway/src/
├── index.js                         # [不修改] 现有 Gateway
├── sdk/                             # [新增] SDK 专属路由层
│   ├── index.js                     # SDK 路由注册 (app.register sdkRouter)
│   ├── auth.js                      # API Key 验证中间件
│   ├── ratelimit.js                 # Token Bucket 限流
│   ├── cors.js                      # CORS 白名单管理
│   ├── routes/
│   │   ├── signals.js              # GET /v3/signals, WS /v3/ws/signals
│   │   ├── trades.js               # POST /v3/trade/quote, /submit, GET /v3/trade/:id
│   │   ├── learning.js             # GET /v3/learning/:strategyId/*
│   │   └── config.js               # GET/PUT /v3/config/:strategyId
│   └── ws/
│       └── signals.js               # WebSocket 信号推送管理
│
├── strategies/                      # [现有, V3 架构]
└── execution/                       # [现有, V3 架构]
```

关键设计原则：
- **只读 + 触发** — SDK 层不直接操作数据库写，交易执行通过现有的执行层（BaseAutoTrader）
- **缓存层** — 信号查询走 Redis 缓存（sorted set），不穿透 DB
- **WebSocket 管理** — 独立管理 WS 连接池，按 strategy_id 建立 room 分组推送

### 9.4 API Key 管理后台

在现有 ConfigPage / SystemPage 中新增 "SDK 管理" 入口：

```
┌────────────────────────────────────────────────┐
│  SDK 管理                          AIHunter      │
├────────────────────────────────────────────────┤
│                                                 │
│  API Keys                                       │
│  ┌─────────────────────────────────────────┐   │
│  │  ah_live_abc123  │  生产环境  │  创建于..│   │
│  │  本月请求: 14,230  │  [轮换] [删除]    │   │
│  ├─────────────────────────────────────────┤   │
│  │  ah_test_xyz789  │  测试环境  │  创建于..│   │
│  │  本月请求: 892     │  [轮换] [删除]    │   │
│  └─────────────────────────────────────────┘   │
│  [+ 创建新 API Key]                             │
│                                                 │
│  接入域名白名单                                   │
│  ┌─────────────────────────────────────────┐   │
│  │  https://app.uniswap.org  │  [删除]      │   │
│  │  https://wallet.example.com│  [删除]     │   │
│  │  [+ 添加域名]                             │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  使用统计 (近30天)                               │
│  ┌─────────────────────────────────────────┐   │
│  │  总请求: 15,122   │  信号查询: 12,000   │   │
│  │  交易报价: 2,830   │  学习报告: 292      │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
└────────────────────────────────────────────────┘
```

### 9.5 关键数据表新增

```sql
-- SDK API Key 管理表
CREATE TABLE sdk_api_keys (
    id              BIGSERIAL PRIMARY KEY,
    key_hash        TEXT NOT NULL UNIQUE,          -- SHA256(api_key)
    key_prefix      TEXT NOT NULL,                  -- 'ah_live_abc123' 前 15 位 (展示用)
    user_id         TEXT NOT NULL,
    environment     TEXT DEFAULT 'production',      -- 'production' | 'testnet'
    permissions     TEXT[] NOT NULL,                -- ['read:signals', 'write:trade', ...]
    allowed_origins TEXT[] DEFAULT '{}',            -- CORS 白名单域名
    allowed_ips     TEXT[] DEFAULT '{}',            -- IP 白名单
    rate_limit      JSONB,                         -- 自定义限流配置 (覆盖默认)
    requests_count  BIGINT DEFAULT 0,              -- 总请求计数
    last_used_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    rotated_at      TIMESTAMPTZ
);

-- 接入方事件日志 (用于审计和计费)
CREATE TABLE sdk_event_log (
    id              BIGSERIAL PRIMARY KEY,
    api_key_id      BIGINT REFERENCES sdk_api_keys(id),
    event_type      TEXT NOT NULL,                  -- 'signal_query' | 'trade_submit' | ...
    endpoint        TEXT,
    status_code     SMALLINT,
    response_ms     SMALLINT,
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sdk_event_api_key ON sdk_event_log(api_key_id, created_at DESC);
CREATE INDEX idx_sdk_event_type ON sdk_event_log(event_type, created_at DESC);
```

---

## 10. 用户故事

### 10.1 钱包客户端 — OKX Wallet 集成 AIHunter 信号

**角色**: OKX Wallet 产品经理 Xiao

**场景**: OKX Wallet 希望在 App 内新增 "AI 交易信号" Tab，让用户不需要切换 App 就能查看 AIHunter 的策略信号并完成交易。

**故事**:

1. Xiao 在 AIHunter 平台注册并获取了生产 API Key `ah_live_okx_001`
2. 前端团队安装 `npm install @aihunter/sdk`，在 OKX Wallet React 应用中初始化 SDK：

```javascript
// OKX Wallet 集成代码
import { createAIHunter } from '@aihunter/sdk';

const aihunter = createAIHunter({
  apiKey: 'ah_live_okx_001',
  chain: 'ETH',
  theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  walletProvider: window.okxwallet,   // OKX 自有 Provider
});

// 在 "AI 交易" Tab 中渲染信号列表
aihunter.ui.mountSignalList('#ai-signals-container', {
  strategies: ['momentum', 'spread_arbitrage'],
  minScore: 60,
  onTrade: (trade) => {
    // 使用 OKX DEX Aggregator 执行
  },
});

// 订阅实时信号更新
aihunter.signals.subscribe(
  ['momentum'],
  (signal) => {
    // 高评分信号推送 App 通知
    if (signal.score >= 80) {
      pushNotification(`🚀 ${signal.token_symbol} 高评分信号 (${signal.score})`);
    }
  }
);

aihunter.on('trade:success', (result) => {
  analytics.report('aihunter_trade', { pnl: result.netPnl });
});
```

**结果**: 3 个工作日完成集成，用户在 OKX Wallet 内即可查看 AIHunter 信号，交易通过 OKX Wallet 自有聚合器执行。用户留存率提升 15%。

---

### 10.2 dApp — SushiSwap 嵌入价差套利策略

**角色**: SushiSwap 产品经理 DeFiDave

**场景**: SushiSwap 希望在其 Pro 版 dApp 中嵌入 AI 驱动的 DEX 价差套利功能，引导用户在 SushiSwap 和其他 DEX 之间执行套利交易。

**故事**:

1. DeFiDave 申请 API Key（绑定域名 `app.sushi.com`）
2. 在 SushiSwap 的策略 Tab 中嵌入 AIHunter 套利看板：

```javascript
import { createAIHunter } from '@aihunter/sdk';

const aihunter = createAIHunter({
  apiKey: 'ah_live_sushi_001',
  theme: 'dark',
  walletProvider: useWallet().provider,  // wagmi provider
  txExecutor: async (tx) => {
    // SushiSwap 自定义执行逻辑：通过自家的 Router 执行
    const signer = useSigner();
    const receipt = await signer.sendTransaction(tx);
    return receipt;
  },
});

// 在套利 Tab 渲染
aihunter.ui.mountArbitrageBoard('#arbitrage-panel', {
  pairs: ['WETH/USDC', 'USDC/USDT', 'WBTC/WETH'],
  minSpreadPct: 0.3,
  dexes: ['uniswap_v3', 'sushiswap_v2', 'curve'],
  onArbitrageFound: (opp) => {
    // 高利润机会通知
    if (opp.estimatedProfit > 50) {
      showToast(`🔥 高利润套利机会: +$${opp.estimatedProfit}`);
    }
  },
});

aihunter.on('trade:success', (result) => {
  // SushiSwap 统计套利交易量
  updateProtocolVolume(result.amountIn, 'arbitrage');
});
```

**结果**: 上线首周，套利策略模块贡献了 $2.3M 额外交易量。SushiSwap 在路线图中新增了 "AI 策略交易" 板块。

---

### 10.3 Telegram Bot — Alpha 信号推送

**角色**: 加密社区运营 CryptoWhale

**场景**: 运营一个 5000+ 人的交易 Telegram 群，想自动推送 AIHunter 的高评分信号到群里，附带一键交易链接。

**故事**:

1. CryptoWhale 在 AIHunter 平台创建 Server API Key
2. 使用 Open API 构建 Telegram Bot：

```python
import asyncio
import websockets
import json
from telegram import Bot

async def subscribe_signals():
    bot = Bot(token="YOUR_TELEGRAM_BOT_TOKEN")
    chat_id = -1001234567890

    async with websockets.connect(
        "wss://api.aihunter.io/v3/ws/signals",
        extra_headers={"Authorization": "Bearer ah_live_tg_001"}
    ) as ws:
        # 订阅动量策略信号
        await ws.send(json.dumps({
            "action": "subscribe",
            "strategies": ["momentum"],
            "min_score": 75
        }))

        async for message in ws:
            signal = json.loads(message)

            # 格式化为 Telegram 消息
            text = (
                f"🚀 *AI 交易信号*\n"
                f"策略: 动量突破\n"
                f"代币: {signal['token_symbol']} ({signal['chain']})\n"
                f"评分: {signal['score']}/100 | 置信度: {signal['confidence']:.0%}\n"
                f"建议操作: {'买入' if signal['action']=='BUY' else '卖出'}\n"
                f"\n"
                f"[在 AIHunter 查看详情](https://app.aihunter.io/trade/momentum/{signal['token_address']})"
            )

            await bot.send_message(chat_id=chat_id, text=text, parse_mode='Markdown')

asyncio.run(subscribe_signals())
```

**结果**: 群活跃度提升 40%，每天 20-30 条自动信号推送，群成员通过链接跳转到 AIHunter Web 完成交易。

---

### 10.4 小型钱包 — TokenPocket 快速接入

**角色**: TokenPocket 前端开发者 Tian

**场景**: TokenPocket 团队规模小（5 人），想快速接入 AIHunter 信号，但不希望引入 npm 依赖和管理 SDK 版本。

**故事**:

1. Tian 在 HTML 页面中插入一行脚本标签：

```html
<script src="https://cdn.aihunter.io/sdk/loader.js"></script>

<!-- 在 DApp 浏览器中新增 "AI 信号" 页面 -->
<aihunter-signal-list
  data-api-key="ah_live_tp_001"
  data-strategies="momentum,spread_arbitrage"
  data-chain="ETH"
  data-min-score="60"
  data-theme="dark"
  style="width:100%;min-height:100vh"
></aihunter-signal-list>
```

2. 监听交易事件：

```html
<script>
  document.querySelector('aihunter-signal-list')
    .addEventListener('trade:success', (event) => {
      tp.toast(`交易成功! Tx: ${event.detail.txHash.slice(0, 10)}...`);
    });
</script>
```

**结果**: 半天完成接入，Widget Loader 自动适配 TokenPocket 的暗色主题，SDK 版本跟随 CDN 自动更新。

---

### 10.5 学习报告集成 — dApp 展示策略优化效果

**角色**: DeFi 数据分析师 Alice

**场景**: Alice 集成了 AIHunter 的套利策略到她的分析 dApp 中。她想在 dApp 里展示 AI 学习的效果——AI 是如何持续优化策略参数的。

**故事**:

1. Alice 调用学习 API 获取最新报告：

```javascript
const report = await aihunter.learning.getReport('spread_arbitrage');
// {
//   strategyId: 'spread_arbitrage',
//   version: 'v3',
//   lastRun: '2026-06-25T14:30:00Z',
//   totalExperience: 247,
//   bestParams: { min_spread_pct: 0.5, max_slippage_pct: 2.0, min_profit_usdt: 5 },
//   performance: { winRate: 0.72, avgPnl: 12.40, sharpeRatio: 1.8 },
//   rules: ['优先选择 USDC/USDT 等稳定币对', '价差 > 0.5% 时执行', '避免 Gas > 50 Gwei 时交易']
// }

// 渲染学习面板
aihunter.ui.mountLearningPanel('#learning-panel', {
  strategyId: 'spread_arbitrage',
  showHistory: true,
});
```

2. Alice 的 dApp 新增 "AI 学习报告" 页面，展示：
   - Optuna 参数调优轨迹图
   - 胜率变化趋势
   - DeepSeek 蒸馏的策略规则文本

**结果**: dApp 用户对 AI 策略的信任度提升，页面 PV 增长 200%。

---

## 11. 里程碑与交付计划

### 11.1 总览

```
M1: 基础嵌入 (6 weeks)
│  信号查询 + 手动交易 + JS SDK + Open API
│
├── Week 1-2: 后端 SDK API
├── Week 3-4: JS SDK + React 组件
├── Week 5: 接入测试 + 文档
└── Week 6: 内测发布 (2-3 个合作方)

    │
    ▼
M2: 交易执行 (4 weeks)
│  自动化交易 + Widget Loader + JWT鉴权 + WebSocket 信号流
│
├── Week 7-8: 交易执行管道 + 风控回调
├── Week 9: Widget Loader + CDN
└── Week 10: 外部发布 + 开发者门户

    │
    ▼
M3: 自定义策略 (4 weeks)
│  策略配置 + 学习报告 + 多链 + 高级鉴权
│
├── Week 11-12: 策略自定义 + 学习面板
├── Week 13: Wallet 签名鉴权 + Vue 组件
└── Week 14: GA 公开发布
```

### 11.2 M1 — 基础嵌入 (Week 1-6)

**目标**: 接入方可以查询信号并手动触发交易。

| 交付物 | 描述 | 优先级 | 负责 |
|--------|------|--------|------|
| SDK API Key 管理后台 | 创建/轮换/删除 API Key, CORS 白名单 | P0 | 后端 |
| API Key 鉴权中间件 | X-API-Key Header 验证, Token Bucket 限流 | P0 | 后端 |
| `GET /v3/signals` | 信号查询 REST API | P0 | 后端 |
| `WS /v3/ws/signals` | 信号推送 WebSocket | P0 | 后端 |
| `POST /v3/trade/quote` | 交易报价 API | P0 | 后端 |
| `GET /v3/trade/:id` | 交易状态查询 | P0 | 后端 |
| `GET /v3/trades` | 交易记录列表 | P1 | 后端 |
| `GET /v3/learning/:strategyId/report` | 学习报告 | P1 | 后端 |
| `@aihunter/sdk` npm 包 | Core + SignalsModule + TradingModule | P0 | 前端 |
| React UI 组件 | SignalList, ArbitrageBoard (基础版) | P0 | 前端 |
| TypeScript 类型定义 | 完整类型导出 | P0 | 前端 |
| API 参考文档 | OpenAPI 3.0 Spec + 在线文档 | P0 | 文档 |
| 快速开始指南 | "5 分钟接入" 教程 | P0 | 文档 |
| Vanilla JS 渲染器 | 非 React 框架的基础渲染 | P1 | 前端 |
| 示例项目 | 钱包嵌入 + dApp 嵌入 完整 Demo | P1 | 前/后端 |

**M1 验收标准**:
- [ ] 接入方能用 API Key 调用信号查询 API，返回正确格式
- [ ] JS SDK 可渲染信号列表，点击信号触发钱包确认
- [ ] 交易通过宿主钱包 Provider 签名并广播
- [ ] 限流器正常拦截超过阈值的请求
- [ ] 至少 1 个外部合作方成功集成

### 11.3 M2 — 交易执行增强 (Week 7-10)

| 交付物 | 描述 | 优先级 |
|--------|------|--------|
| 自动化交易执行 | `POST /v3/trade/submit` 提交已签名交易 | P0 |
| 交易状态 WebSocket 推送 | 实时交易状态回调 | P0 |
| 风控事件回调 | risk:triggered / risk:warning 事件 | P1 |
| Widget Loader | Web Components + CDN 部署 | P1 |
| JWT 鉴权模式 | 接入方签发 JWT, 用户级权限 | P1 |
| 交易历史组件 | TradeHistory 组件 (React + Widget) | P1 |
| 骨架屏/Loading/Empty 状态 | 完整状态覆盖 | P2 |
| 暗色/亮色主题自动切换 | CSS Variables + 跟随宿主题 | P2 |
| 开发者门户 | docs.aihunter.io/sdk + 交互式 API Playground | P1 |
| Vue 3 组件 (基础) | SignalList Vue 版 | P2 |

**M2 验收标准**:
- [ ] 自动交易执行管道可用: 信号→报价→签名→广播→状态更新
- [ ] Widget Loader 可直接用 `<script>` 标签接入
- [ ] JWT 鉴权模式可用
- [ ] 至少 3 个合作方在生产环境使用

### 11.4 M3 — 自定义策略 & 生态 (Week 11-14)

| 交付物 | 描述 | 优先级 |
|--------|------|--------|
| 策略自定义配置 API | GET/PUT /v3/config/:strategyId | P0 |
| 用户自定义代币白名单 | 配置过滤 | P1 |
| 学习面板组件 | LearningPanel (React + Widget) | P1 |
| 学习手动触发 | POST /v3/learning/:strategyId/trigger | P1 |
| Wallet 签名鉴权 | EIP-712 签名替代 API Key | P2 |
| 多链支持 | BSC, BASE, SOL 信号查询 | P1 |
| Vue 3 完整组件 | 全部组件 Vue 版 | P2 |
| 盈利仪表盘 | 嵌入版 PnL 统计面板 | P2 |
| GA 公开发布 | docs.aihunter.io/sdk 正式上线 | P0 |

---

## 12. 附录

### 12.1 术语表

| 术语 | 含义 |
|------|------|
| **Embed SDK** | AIHunter 嵌入工具包，允许第三方应用集成 AIHunter 能力 |
| **接入方** | 使用 Embed SDK 的第三方钱包或 dApp |
| **Provider** | EIP-1193 标准的钱包 Provider 对象（如 `window.ethereum`） |
| **TxExecutor** | 自定义交易执行回调，由接入方实现 |
| **Widget Loader** | 基于 Web Component 的声明式接入方案 |
| **SignalPayload** | V3 统一信号格式（见 [V3架构文档](./aihunter-v3-architecture.md) §4.2） |
| **Token Bucket** | 令牌桶限流算法 |
| **Agent Wallet** | AIHunter 的 TEE Agentic 钱包（仅 AIHunter 自身使用，SDK 不接触） |

### 12.2 与 V3 三层架构的关系

```
V3 三层                               Embed SDK 对外暴露
───────                               ────────────────
📊 策略层 (Worker → Redis → 统一信号)   → SDK signals 模块
🔧 执行层 (BaseAutoTrader → OKX)       → SDK trading 模块 (通过宿主钱包)
🧠 学习层 (StrategyAgnosticLearner)     → SDK learning 模块
⚙️  策略注册中心                         → SDK config 模块

SDK 不修改 V3 任何一行代码，完全通过新增 API 层对接。
```

### 12.3 拒绝的反模式

在 SDK 设计中明确不采用以下模式：

| 反模式 | 问题 | 代替方案 |
|--------|------|---------|
| SDK 内建钱包/私钥管理 | 安全风险极高 | 使用宿主 Provider 或 TxExecutor |
| iframe 作为主要方案 | 体验差，无法复用钱包 | 仅保留作 Demo |
| 直接暴露数据库查询 | 安全风险和耦合 | 通过 API Gateway 路由 |
| SDK 包含策略引擎 | 体积过大，策略不可控 | 策略引擎保留在服务端 |
| 去品牌化嵌入 | 品牌价值流失 | 保留底部品牌条 |

### 12.4 与竞品对标

| 维度 | AIHunter Embed SDK | Moralis Streams | Pyth Network | 1inch Fusion |
|------|-------------------|-----------------|--------------|--------------|
| 核心能力 | AI 策略信号 + 执行 | 链上数据流 | 价格预言机 | DEX 聚合交易 |
| 嵌入方式 | JS SDK / Widget / API | Webhook / SDK | 链上合约查询 | Widget / API |
| AI 能力 | ✅ Optuna + DeepSeek 学习 | ❌ | ❌ | ❌ |
| 钱包复用 | ✅ 宿主 Provider | ❌ 独立 | ❌ | ⚠️ 有限 |
| 定制化 | ⭐⭐⭐⭐ 高 | ⭐⭐⭐ 中 | ⭐⭐ 低 | ⭐⭐ 低 |

**差异化优势**：AIHunter 是唯一提供 **AI 自主学习 + 策略信号 + 自动执行** 三位一体的嵌入 SDK。其他竞品要么提供数据流、要么提供执行，但没有端到端的 AI 驱动交易解决方案。

---

> **下一步**: 待此 PRD 评审通过后，产出 M1 详细技术方案（API 规格 + SDK 接口设计文档）。
