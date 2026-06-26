# AIHunter V3 三层架构重构蓝图

> **版本**: 1.0 | **日期**: 2026-06-26 | **作者**: AIHunter Architecture Team (PM)
>
> **前置阅读**:
> - [实盘交易 P0 PRD](./prd-aihunter-live.md)
> - [实盘交易 P1 PRD](./prd-aihunter-live-p1.md)
> - [DeFi 套利 PRD](./prd-aihunter-defi-arbitrage.md)
> - [AutoTrader 重构方案](./autotrader-refactor-prd.md)（前次 PM 方案 B）
> - [任务分配总表](./aihunter_task_assignment.md)

---

## 目录

1. [诚实评估：当前散装代码全景](#1-诚实评估当前散装代码全景)
2. [目标三层架构图](#2-目标三层架构图)
3. [页面组织设计 — 策略卡片体系](#3-页面组织设计--策略卡片体系)
4. [策略层设计 — 信号统一与策略注册](#4-策略层设计--信号统一与策略注册)
5. [执行层设计 — 通用交易执行引擎](#5-执行层设计--通用交易执行引擎)
6. [学习层设计 — 多策略通用学习框架](#6-学习层设计--多策略通用学习框架)
7. [代码迁移路线 — 散装 → 三层映射](#7-代码迁移路线--散装--三层映射)
8. [分阶段实施计划](#8-分阶段实施计划)
9. [文件改动清单](#9-文件改动清单)
10. [风险与权衡](#10-风险与权衡)
11. [附录：完整信号格式规范](#11-附录完整信号格式规范)

---

## 1. 诚实评估：当前散装代码全景

### 1.1 代码仓库总览

```
aihunter/
├── src/                               # 前端 (React + TypeScript + Vite + wagmi)
│   ├── App.tsx                        # 路由 (6条: /dex /defi /signals /trades /config /system)
│   ├── components/
│   │   ├── Sidebar.tsx                # 侧边栏 (4入口: DEX交易/DeFi套利/配置/系统)
│   │   └── ...
│   └── pages/
│       ├── DexPage.tsx                # ✅ DEX 交易页 (卡片: 动量✅ + 网格灰)
│       ├── DeFiPage.tsx               # ✅ DeFi 套利页 (利率监控表格,执行假)
│       ├── TradesPage.tsx             # ⚠️ 交易中心 (含3个Tab: 新土狗/动量/DeFi)
│       ├── ConfigPage.tsx             # ✅ 配置页
│       ├── SystemPage.tsx             # ✅ 系统页
│       └── trades/
│           ├── MomentumTab.tsx         # ⚠️ 650行+动量Tab (含硬编码swap + wagmi钱包)
│           ├── NewTokenTab.tsx         # ⚠️ 新土狗Tab
│           ├── DeFiTab.tsx             # ⚠️ DeFi套利Tab (空壳)
│           └── LearningTab.tsx         # ⚠️ 学习Tab
│
├── services/
│   ├── gateway/src/                    # Node.js Gateway (Fastify)
│   │   ├── index.js                   # 🔴 巨石 1277行 (所有路由/WS/逻辑混一起)
│   │   ├── okx-trade.js               # ✅ OKX DEX Aggregator 封装 (114行)
│   │   ├── backtest_offline.py        # ⚠️ 离线回测
│   │   ├── routes/
│   │   │   └── arbitrage.js           # ⚠️ 套利路由 (355行,执行端mock)
│   │   └── services/
│   │       └── profitCalc.js           # ✅ 利润计算纯函数 (42行)
│   │
│   ├── worker/src/                     # Python Worker
│   │   ├── main.py                    # 🟡 Worker入口 (新代币监听为主)
│   │   ├── mature_meme.py             # ✅ 动量引擎 (1400+行,完整扫描+评分+Redis)
│   │   ├── arbitrage.py               # ⚠️ 套利引擎 (287行,扫描逻辑半成品)
│   │   ├── lending_arb.py             # ⚠️ 借贷套利 (逻辑不完整)
│   │   ├── risk_engine.py             # ✅ 风险告警引擎
│   │   ├── okx_client.py              # ⚠️ OKX数据客户端(NameError bug)
│   │   ├── price_refresh.py           # ✅ 价格刷新
│   │   └── sol_worker.py              # ⚠️ SOL链Worker
│   │
│   └── learning/src/                   # Python 学习服务
│       └── scheduler.py               # ⚠️ 仅动量策略 (Optuna参数调优 + DeepSeek规则)
│
└── deploy/
    ├── docker-compose.yml
    ├── nginx/
    ├── redis/
    └── sql/
        └── init.sql                    # ⚠️ 缺10+张表定义
```

### 1.2 诚实状态矩阵

| 层 | 模块 | 文件 | 状态 | 完成度 | 关键问题 |
|----|------|------|------|--------|---------|
| **策略层** | 动量扫描 | `mature_meme.py` | ✅ 真 | 90% | 评分系统完整, Redis 信号发布 |
| **策略层** | 套利扫描 | `arbitrage.py` | ⚠️ 半真 | 40% | 价格查询真, 扫描逻辑不完整, 字段缺失 |
| **策略层** | 借贷套利 | `lending_arb.py` | ⚠️ 半真 | 30% | 框架存在, 逻辑待完善 |
| **策略层** | 风险引擎 | `risk_engine.py` | ✅ 真 | 75% | 告警完善, 但无交易拦截 |
| **执行层** | OKX 执行 | `okx-trade.js` | ✅ 真 | 90% | Quote/Approve/Swap 完整封装 |
| **执行层** | Agent 钱包 | `index.js` (liveTrading) | ✅ 真 | 85% | 登录/创建/授权/查询完整 |
| **执行层** | AutoTrader | — | ❌ 不存在 | 0% | 两个策略均无自动交易执行 |
| **执行层** | 利润计算 | `profitCalc.js` | ✅ 真 | 80% | 纯函数, 被复用 |
| **执行层** | 套利执行 | `arbitrage.js` POST execute | 🔴 假 | 5% | onchainosWalletSend 是 mock |
| **学习层** | Optuna 调优 | `scheduler.py` | ⚠️ 半真 | 50% | 仅动量, 硬编码V2特征名 |
| **学习层** | DeepSeek 规则 | `scheduler.py` | ⚠️ 半真 | 50% | 仅动量, 硬编码prompt |
| **学习层** | 多策略学习 | — | ❌ 不存在 | 0% | 完全缺失 |
| **前端** | DEX页面 | `DexPage.tsx` | ✅ 真 | 85% | 动量卡片✅, 网格灰色占位 |
| **前端** | DeFi页面 | `DeFiPage.tsx` | ✅ 真 | 50% | 利率表格✅, 套利执行假 |
| **前端** | 交易中心 | `TradesPage.tsx` | ⚠️ 半真 | 60% | 三个Tab, MomentumTab体积过大 |
| **前端** | MomentumTab | `MomentumTab.tsx` | ⚠️ 半真 | 60% | 650行: swap假/硬编码0.01ETH/无滑点 |

### 1.3 核心矛盾

1. **策略层有信号，执行层无自动交易** — 动量 Worker 扫描→评分→Redis 发布，但无代码消费信号执行实盘
2. **学习层只认识动量** — `scheduler.py` 的 objective 函数、prompt、特征名全部硬编码为 V2 动量引擎
3. **前端页面组织不符合三层架构** — DEX/DeFi 是两个正交维度，但三层是策略/执行/学习三个统一层
4. **巨石 Gateway** — `index.js` 1277 行混在一起，Gateway 拆分(C1)与三层架构应协同推进

---

## 2. 目标三层架构图

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           AIHunter V3 三层架构                            │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │                        📊 策略层 — 寻利                         │      │
│  │                                                                │      │
│  │  ┌──────────────────────────┐  ┌───────────────────────────┐  │      │
│  │  │     DEX 交易方向          │  │      DeFi 套利方向         │  │      │
│  │  │                          │  │                           │  │      │
│  │  │  🚀 动量突破   mature_   │  │  💱 DEX价差套利 spread_   │  │      │
│  │  │               meme       │  │               arbitrage   │  │      │
│  │  │  📊 网格交易   grid_     │  │  🔺 三角套利  triangular_  │  │      │
│  │  │               trading    │  │               arbitrage   │  │      │
│  │  │  📈 趋势跟随   trend_    │  │  ⚡ 闪电贷    flash_       │  │      │
│  │  │               following  │  │               loan         │  │      │
│  │  │  🐕 新土狗     new_token │  │  🏦 借贷套利  lending_     │  │      │
│  │  │                          │  │               arbitrage   │  │      │
│  │  │  ...未来更多...          │  │  🌉 跨链套利  cross_chain  │  │      │
│  │  └──────────┬───────────────┘  └─────────────┬─────────────┘  │      │
│  │             │                                │                │      │
│  │             ▼                                ▼                │      │
│  │  ┌───────────────────────────────────────────────────────┐   │      │
│  │  │              策略注册中心 (StrategyRegistry)            │   │      │
│  │  │  • strategy_id / type / display_name / icon           │   │      │
│  │  │  • signal_schema / config_schema / risk_profile       │   │      │
│  │  │  • worker_class / enabled / version                   │   │      │
│  │  └───────────────────────────────────────┬───────────────┘   │      │
│  └──────────────────────────────────────────┼───────────────────┘      │
│                                             │                          │
│                  ┌──────────────────────────┼──────────────┐           │
│                  │        统一信号通道       │              │           │
│                  │  Redis → trade:signals   │              │           │
│                  │  统一格式 SignalPayload  │              │           │
│                  └──────────────────────────┼──────────────┘           │
│                                             ▼                          │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │                     🔧 执行层 — 自动交易                        │      │
│  │                                                                │      │
│  │  ┌───────────────────────────────────────────────────────┐    │      │
│  │  │         通用执行引擎 (BaseAutoTrader)                    │    │      │
│  │  │                                                        │    │      │
│  │  │  onSignal(userId, signal):                             │    │      │
│  │  │   ① 实盘开关检查   ② 策略配置加载   ③ 信号过滤         │    │      │
│  │  │   ④ 风控引擎检查   ⑤ Agent钱包查询   ⑥ 金额计算         │    │      │
│  │  │   ⑦ 链上交易执行   ⑧ 交易记录写入   ⑨ 通知推送         │    │      │
│  │  │                                                        │    │      │
│  │  │  • 基于策略注册自动加载对应 Trader 插件                  │    │      │
│  │  │  • 统一风控: 日亏损上限/最大并发/滑点保护/Gas策略       │    │      │
│  │  │  • 统一记录: trade_records 表 (策略字段区分)            │    │      │
│  │  └───────────────────────────────────────────────────────┘    │      │
│  │                          │                                     │      │
│  │     ┌────────────────────┼────────────────────┐               │      │
│  │     ▼                    ▼                     ▼               │      │
│  │  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐        │      │
│  │  │Momentum  │  │Arbitrage     │  │GridTrader        │        │      │
│  │  │Trader    │  │Trader        │  │(未来)            │        │      │
│  │  └──────────┘  └──────────────┘  └──────────────────┘        │      │
│  │                          │                                     │      │
│  │                          ▼                                     │      │
│  │  ┌───────────────────────────────────────────────────────┐    │      │
│  │  │  底层执行设施 (不动)                                    │    │      │
│  │  │  • okx-trade.js     — DEX Aggregator  Quote/Approve/Swap│   │      │
│  │  │  • Agentic Wallet   — TEE 钱包 登录/创建/授权/签名      │    │      │
│  │  │  • profitCalc.js    — 毛利-滑点-Gas=净利               │    │      │
│  │  └───────────────────────────────────────────────────────┘    │      │
│  └───────────────────────────────────────────────────────────────┘      │
│                                    │                                    │
│                  记录写入 trade_records / arb_trades                    │
│                                    │                                    │
│                                    ▼                                    │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │                     🧠 学习层 — 自主学习                        │      │
│  │                                                                │      │
│  │  ┌───────────────────────────────────────────────────────┐    │      │
│  │  │              多策略学习引擎 (StrategyAgnosticLearner)   │    │      │
│  │  │                                                        │    │      │
│  │  │  LearningCycle(strategy_id):                           │    │      │
│  │  │   ① 经验采集  → 从 trade_records 提取 labeled data     │    │      │
│  │  │   ② 参数调优  → Optuna study (策略注册的参数空间)       │    │      │
│  │  │   ③ 规则蒸馏  → DeepSeek 根据策略特征生成规则           │    │      │
│  │  │   ④ 效果回测  → 新参数对历史数据模拟验证                │    │      │
│  │  │   ⑤ 热加载    → Redis pub params:{strategy_id}         │    │      │
│  │  └───────────────────────────────────────────────────────┘    │      │
│  │                          │                                     │      │
│  │     ┌────────────────────┼────────────────────┐               │      │
│  │     ▼                    ▼                     ▼               │      │
│  │  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐        │      │
│  │  │Momentum  │  │Arbitrage     │  │GridLearning      │        │      │
│  │  │Learning  │  │Learning      │  │(未来)            │        │      │
│  │  │Profile   │  │Profile       │  │                  │        │      │
│  │  └──────────┘  └──────────────┘  └──────────────────┘        │      │
│  └───────────────────────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.1 三层数据流

```
策略层 Worker → 统一信号 → Redis channel → 执行层 AutoTrader → OKX/Agent钱包 → 链上交易
                                                      │
                                                      ▼
                                             DB trade_records
                                                      │
                                                      ▼
                                          学习层 Learner → 参数优化 → Redis → 策略层重新加载
```

### 2.2 与前次方案 B (BaseAutoTrader) 的关系

本蓝图将方案 B 的 BaseAutoTrader + 策略插件模式，从**仅执行层重构**扩展为**三层全面重构**：

| 维度 | 方案 B (autotrader-refactor-prd.md) | 本蓝图 (V3) |
|------|-------------------------------------|------------|
| 策略层 | 保持原样（Worker不变） | 新增策略注册中心 + 统一信号格式 |
| 执行层 | BaseAutoTrader + 2插件 | **继承**方案B设计 + 扩展为多策略执行引擎 |
| 学习层 | 保持原样（仅动量） | 重构为多策略通用学习框架 |
| 前端 | 保持原样 | 策略卡片重组 + 统一交互模式 |
| 新增文件 | ~3个 | ~15个 |
| 改动文件 | ~2个 | ~8个 |

---

## 3. 页面组织设计 — 策略卡片体系

### 3.1 页面路由重构

**当前**:
```
/  → /dex  (DexPage: 动量+网格卡片)
/defi      (DeFiPage: 利率表格, 执行mock)
/signals   (SignalsPage: 信号列表)
/trades    (TradesPage: 三个Tab 混杂)
/config    (ConfigPage)
/system    (SystemPage)
```

**目标 V3** (2026-06-26 修订 by Steven):
```
/  → /trade  (TradePage: DEX 交易策略卡片矩阵)
/defi        (DeFiPage: DeFi 套利策略卡片矩阵)
/live        (LiveTradingPage: 实盘交易控制台 🆕 独立页)
  ├─ 钱包管理 (登录/创建/切换)
  ├─ 自动交易总开关 (按策略独立启停)
  ├─ 全局风控面板
  └─ 实时交易记录流
/trade/momentum/:token?   (MomentumDetailPage: 信号 + 学习)
/defi/spread-arb/:pair?   (SpreadArbDetailPage: 信号 + 学习)
/config      (ConfigPage: 策略参数配置)
/system      (SystemPage: 不变)
```

> **关键改动**: 实盘交易从每个策略页抽离，独立为 `/live` 统一控制台。
> 策略详情页**只负责信号展示 + 自主学习**，不包含交易控制。

### 3.2 策略卡片 UI 规范

每个策略在列表页以**统一卡片**呈现，遵循以下规范：

```
┌────────────────────────────────────────────┐
│  🔵 图标   策略名称            [🟢 运行中] │
│            策略简述 (24字)                 │
│  ──────────────────────────────────────── │
│  今日信号   │  今日交易   │  今日盈亏       │
│    23 条    │    5 笔     │  +$142.50     │
│  ──────────────────────────────────────── │
│  [查看详情]  [开启/暂停交易]  [配置参数]    │
└────────────────────────────────────────────┘
```

**卡片数据字段规范**:
```typescript
interface StrategyCard {
  strategy_id: string;       // 唯一标识: 'momentum' | 'grid' | 'spread_arb' | ...
  display_name: string;      // 中文名: '动量突破'
  icon: string;              // Lucide icon name: 'TrendingUp'
  description: string;       // 简述: '箱型震荡+放量突破检测'
  auto_trading: boolean;     // 是否已在 /live 开启自动交易 (只读展示)
  status: 'running' | 'stopped' | 'disabled';
  metrics: {
    today_signals: number;
    today_trades: number;
    today_pnl: number;
  };
  category: 'dex' | 'defi';  // 分类
  route: string;             // 详情页: '/trade/momentum'
}
```

> **修订**: 卡片上不再有 [开启/暂停] 按钮，改为显示自动交易状态（从 `/live` 控制）。

### 3.3 `/trade` 页面 — DEX 交易策略卡片矩阵

```
┌────────────────────────────────────────────────────────────────────┐
│  DEX 交易                                                         │
│  策略寻利 · 实时信号 · AI 自主学习                                  │
├────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐  ┌─────────────────────┐                  │
│  │ 🚀 动量突破          │  │ 📊 网格交易          │                  │
│  │ 震荡突破检测+智能捕捉 │  │ 自动挂单低买高卖     │                  │
│  │ ─────────────────── │  │ ─────────────────── │                  │
│  │ 今日信号 23 │ 学习v3 │  │ 建设中...           │                  │
│  │ 自动交易 [🟢 已开启] │  │                     │                  │
│  │ [查看信号] [学习报告] │  │ [参与内测]          │                  │
│  └─────────────────────┘  └─────────────────────┘                  │
│  ┌─────────────────────┐  ┌─────────────────────┐                  │
│  │ 📈 趋势跟随          │  │ 🐕 新土狗猎人        │                  │
│  │ MA金叉+放量确认      │  │ 新合约监听+狙击      │                  │
│  │ ─────────────────── │  │ ─────────────────── │                  │
│  │ 建设中...           │  │ 建设中...           │                  │
│  │ [参与内测]          │  │ [参与内测]          │                  │
│  └─────────────────────┘  └─────────────────────┘                  │
└────────────────────────────────────────────────────────────────────┘
```

> **修订**: 去掉卡片上的 [开启/暂停交易] 按钮，改为显示自动交易状态标识。
> 交易启停统一在 `/live` 页面操作。

### 3.4 `/defi` 页面 — DeFi 套利策略卡片矩阵

```
┌────────────────────────────────────────────────────────────────────┐
│  DeFi 套利                                                        │
│  跨DEX价差 · 三角套利 · 借贷利率 · 闪电贷                           │
├────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐  ┌─────────────────────┐                  │
│  │ 💱 DEX价差套利       │  │ 🔺 三角套利          │                  │
│  │ 同链跨DEX价差发现    │  │ 池内路径汇率不闭合   │                  │
│  │ ─────────────────── │  │ ─────────────────── │                  │
│  │ 今日机会 7 │ 学习v1 │  │ 建设中...           │                  │
│  │ 自动交易 [🟢 已开启] │  │                     │                  │
│  │ [查看机会] [学习报告] │  │ [参与内测]          │                  │
│  └─────────────────────┘  └─────────────────────┘                  │
│  ┌─────────────────────┐  ┌─────────────────────┐                  │
│  │ ⚡ 闪电贷套利        │  │ 🏦 借贷利率套利      │                  │
│  │ 0本金原子交易        │  │ 跨协议利率差套利     │                  │
│  │ ─────────────────── │  │ ─────────────────── │                  │
│  │ 建设中...           │  │ 今日利差 3 │ 利差监控│                  │
│  │ [参与内测]          │  │ [利率看板]          │                  │
│  └─────────────────────┘  └─────────────────────┘                  │
└────────────────────────────────────────────────────────────────────┘
```

> **修订**: 同样的，去掉交易控制按钮，显示自动交易状态。

### 3.5 `/live` 页面 — 实盘交易控制台 🆕

```
┌────────────────────────────────────────────────────────────────────┐
│  ⚡ 实盘交易控制台                                                 │
│  Agentic Wallet · 自动交易引擎 · 风控面板                           │
├────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────┐         │
│  │  🔑 Agentic Wallet                          [已连接] │         │
│  │  地址: 0x1234...abcd   │  余额: $12,345.67          │         │
│  │  [切换钱包] [创建新地址] [转出]              ETH链   │         │
│  └──────────────────────────────────────────────────────┘         │
│                                                                    │
│  ┌──────────────────────────┐  ┌──────────────────────────┐       │
│  │ 🚀 动量突破              │  │ 💱 DEX价差套利            │       │
│  │ 状态 [🟢 运行中]        │  │ 状态 [⚪ 已暂停]          │       │
│  │ 今日 5笔 | 盈亏 +$142   │  │ 今日 0笔 | 盈亏 $0       │       │
│  │ [暂停] [配置]           │  │ [开启] [配置]             │       │
│  └──────────────────────────┘  └──────────────────────────┘       │
│  ┌──────────────────────────┐  ┌──────────────────────────┐       │
│  │ 📈 趋势跟随              │  │ 🔺 三角套利              │       │
│  │ 状态 [🔘 未启用]        │  │ 状态 [🔘 未启用]          │       │
│  │ [启用策略]               │  │ [启用策略]               │       │
│  └──────────────────────────┘  └──────────────────────────┘       │
│                                                                    │
│  ┌──────────────────────────────────────────────────────┐         │
│  │  🛡️ 全局风控                                         │         │
│  │  日亏损上限 $200 │ 最大并发 3 │ Gas策略 medium       │         │
│  │  今日已亏损 $18.50 / $200  ████░░░░░░░░░░░░  9.25%  │         │
│  │  [调整风控参数]                                       │         │
│  └──────────────────────────────────────────────────────┘         │
│                                                                    │
│  ┌──────────────────────────────────────────────────────┐         │
│  │  📜 实时交易记录流 (所有策略聚合)                      │         │
│  │  11:42  [动量] BUY 0x3f2a...  $500 → 等待确认       │         │
│  │  11:38  [套利] ARB  USDC/USDT  +$23.50 ✅           │         │
│  │  11:35  [动量] SELL 0x7b1c... +$89.20 ✅            │         │
│  │  [查看全部记录 →]                                     │         │
│  └──────────────────────────────────────────────────────┘         │
└────────────────────────────────────────────────────────────────────┘
```

> **这是 Steven 的核心设计意图**: 策略专注寻利（信号+学习），交易统一控制（钱包+自动交易+风控）。

### 3.6 侧边栏调整

**当前** (4入口):
```
☰ DEX 交易
☰ DeFi 套利
☰ 配置
☰ 系统
```

**V3 目标** (5入口):
```
☰ DEX 交易    → /trade      (策略卡片 · 信号+学习)
☰ DeFi 套利   → /defi       (策略卡片 · 信号+学习)
☰ 实盘交易    → /live       (钱包+自动交易+风控 🆕)
☰ 配置        → /config     (策略参数)
☰ 系统        → /system     (不变)
```

> **修订**: `交易记录` 改为 `实盘交易`，作为独立控制台页。交易记录流内置在 `/live` 页面中。

### 3.7 策略详情页 — 信号 + 学习 (不含交易控制)

策略详情页只做两件事：

```
┌──────────────────────────────────────────────────────────────┐
│  🚀 动量突破 详情                          [自动交易: 🟢 已开启]│
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────┐  ┌────────────────────────────┐    │
│  │ 📡 实时信号流        │  │ 🧠 自主学习                 │    │
│  │                     │  │                            │    │
│  │ 11:50 ETH 0x3f2a   │  │ 学习版本: v3              │    │
│  │ 评分 78 · 置信 0.82 │  │ 最近学习: 2h前            │    │
│  │                     │  │ 经验条数: 247             │    │
│  │ 11:48 BSC 0x7b1c   │  │ Optuna最佳参数:           │    │
│  │ 评分 65 · 置信 0.71 │  │ min_score=62, ...         │    │
│  │                     │  │                            │    │
│  │ 11:45 BASE 0xa91d  │  │ DeepSeek规则:             │    │
│  │ 评分 71 · 置信 0.79 │  │ 震荡范围1-8%优先...       │    │
│  │                     │  │                            │    │
│  │ [展开更多...]       │  │ [学习历史] [触发学习]     │    │
│  └─────────────────────┘  └────────────────────────────┘    │
│                                                              │
│  ⚠️ 交易控制在 /live 页面操作                                │
└──────────────────────────────────────────────────────────────┘
```

> **核心原则**: 策略详情页 = 信号 + 学习。交易开关、风控参数、钱包管理全部在 `/live`。

---

## 4. 策略层设计 — 信号统一与策略注册

### 4.1 策略注册中心 (StrategyRegistry)

策略层核心概念：**每个策略是一个注册项**，包含 Worker 实现、信号格式、配置项、学习Profile。

```javascript
// services/gateway/src/strategies/StrategyRegistry.js

/**
 * 策略注册项数据结构
 */
interface StrategyRegistryEntry {
  // === 标识 ===
  strategy_id: string;        // 唯一 ID: 'momentum' | 'spread_arbitrage' | ...
  category: 'dex' | 'defi';   // 分类
  version: string;            // 策略版本号

  // === 显示 ===
  display_name: string;       // '动量突破'
  description: string;        // 一句话描述
  icon: string;               // Lucide icon name

  // === Worker ===
  worker_class: string;       // Python Worker 类名: 'MatureMemeEngine'
  worker_file: string;        // 源文件: 'mature_meme.py'

  // === 信号 ===
  signal_type: string;        // SignalPayload.type: 'MATURE_MEME'
  signal_schema: object;      // JSON Schema for validation

  // === 配置 ===
  config_table: string;       // 策略配置表: 'momentum_configs'
  config_schema: object[];    // 配置项定义: [{key, type, default, min, max, description}]

  // === 风控 ===
  risk_profile: {
    max_concurrent: number;   // 最大并发交易
    daily_max_loss_usdt: number;
    min_balance_usdt: number;
    gas_strategy: 'slow' | 'medium' | 'fast' | 'only_fast';
    signal_timeout_seconds: number;
  };

  // === 执行 ===
  trader_class: string;       // Trader 类名: 'MomentumTrader'
  trader_file: string;        // 源文件路径

  // === 学习 ===
  learning_profile: {
    param_space: object;      // Optuna 参数空间定义
    feature_keys: string[];   // 学习用的特征字段
    prompt_template: string;  // DeepSeek 规则蒸馏 prompt 模板
  };

  // === 状态 ===
  enabled: boolean;           // 是否启用
  status: 'running' | 'stopped' | 'error';
}

/**
 * 策略注册中心
 * - 集中管理所有策略元数据
 * - 支持热注册/热卸载
 * - 提供按分类查询、按ID查询
 */
class StrategyRegistry {
  strategies: Map<string, StrategyRegistryEntry>;

  register(entry: StrategyRegistryEntry): void;
  unregister(strategy_id: string): void;
  get(strategy_id: string): StrategyRegistryEntry;
  listByCategory(category: 'dex' | 'defi'): StrategyRegistryEntry[];
  listEnabled(): StrategyRegistryEntry[];
  getTraderClass(strategy_id: string): typeof BaseAutoTrader;
  getLearningProfile(strategy_id: string): object;
  getConfigSchema(strategy_id: string): object[];
}
```

### 4.2 统一信号格式 (SignalPayload)

**当前问题**: `mature_meme.py` 发布的信号和 `arbitrage.py` 发布的信号字段不一致，无法被同一套执行层消费。

**统一格式**:

```typescript
/**
 * V3 统一信号格式 — 所有策略必须遵循
 */
interface SignalPayload {
  // === 信号元数据 ===
  signal_id: string;              // UUID v4
  type: SignalType;               // 'MATURE_MEME' | 'SPREAD_ARBITRAGE' | 'GRID_TRADING' | ...
  strategy_id: string;            // 'momentum' | 'spread_arbitrage' | ...
  version: string;                // 信号 schema 版本: '3.0'
  timestamp: number;              // Unix ms
  ttl_seconds: number;            // 信号有效期 (5-300秒)

  // === 交易参数 ===
  chain: string;                  // 'ETH' | 'BSC' | 'BASE' | 'SOL' | 'ARB'
  action: 'BUY' | 'SELL' | 'WATCH';
  token_address: string;          // 合约地址
  token_symbol: string;           // 代币符号

  // === 策略评分 ===
  score: number;                  // 0-100, 策略引擎综合评分
  confidence: number;             // 0-1, 可信度

  // === 执行参数 (策略特定) ===
  execution_params: {
    // 动量策略专用
    entry_price_usd?: number;
    liquidity_usd?: number;
    hourly_bars?: number;
    range_pct?: number;
    signals?: string[];

    // 套利策略专用
    buy_dex?: string;
    sell_dex?: string;
    buy_price?: number;
    sell_price?: number;
    estimated_profit_usdt?: number;
    token_pair?: string;

    // 通用 (所有策略可扩展)
    [key: string]: any;
  };

  // === 风控标注 ===
  risk_tags: string[];            // 风控标签: ['high_volatility', 'low_liquidity']
  risk_score: number;             // 风控评分 0-100

  // === 来源 ===
  source: 'worker' | 'manual' | 'learning';
  user_id?: string;               // 如果信号是用户触发的
}
```

### 4.3 策略 Worker 改造规范

每个策略的 Python Worker 在发布信号时，需要：

1. **统一输出格式** — 构造符合 `SignalPayload` 的 dict
2. **统一 Redis channel** — 所有策略都 PUBLISH 到 `trade:signals:${strategy_id}`
3. **策略注册** — Worker 启动时向 Redis 写入 `strategy:${strategy_id}:meta`
4. **从 learning 获取参数** — 通过 `params:{strategy_id}` 动态加载，不再硬编码

```python
# Worker 发布信号示例 (改造后)
async def publish_signal(self, strategy_id: str, payload: dict):
    """所有策略统一的信号发布方法"""
    signal = {
        "signal_id": str(uuid.uuid4()),
        "type": payload.get("type", strategy_id.upper()),
        "strategy_id": strategy_id,
        "version": "3.0",
        "timestamp": int(time.time() * 1000),
        "ttl_seconds": payload.get("ttl_seconds", 60),
        "chain": payload["chain"],
        "action": payload["action"],
        "token_address": payload["token_address"],
        "token_symbol": payload.get("token_symbol", ""),
        "score": payload.get("score", 0),
        "confidence": payload.get("confidence", 0.0),
        "execution_params": payload.get("execution_params", {}),
        "risk_tags": payload.get("risk_tags", []),
        "risk_score": payload.get("risk_score", 0),
        "source": "worker",
    }
    await self.redis.publish(f"trade:signals:{strategy_id}", json.dumps(signal))
    # 同时写入 sorted set 供轮询
    await self.redis.zadd(f"signals:{strategy_id}:recent", {
        json.dumps(signal): signal["timestamp"]
    })
    # 保持过期控制
    await self.redis.expire(f"signals:{strategy_id}:recent", 3600)
```

### 4.4 策略注册示例

```javascript
// services/gateway/src/strategies/registrations/momentum.js

export const momentumRegistration = {
  strategy_id: 'momentum',
  category: 'dex',
  version: '3.0',
  display_name: '动量突破',
  description: '箱型震荡+放量突破检测，智能捕捉趋势启动点',
  icon: 'TrendingUp',
  worker_class: 'MatureMemeEngine',
  worker_file: 'mature_meme.py',
  signal_type: 'MATURE_MEME',
  signal_schema: { /* JSON Schema */ },
  config_table: 'strategy_configs',   // V3 统一配置表
  config_schema: [
    { key: 'min_score', type: 'number', default: 60, min: 40, max: 90, description: '最低买入评分' },
    { key: 'max_single_amount', type: 'number', default: 500, min: 50, max: 5000, description: '单笔上限(USDT)' },
    { key: 'slippage_tolerance', type: 'number', default: 2.0, min: 0.5, max: 10, description: '滑点容忍(%)' },
    { key: 'take_profit_pct', type: 'number', default: 30, min: 5, max: 50, description: '止盈(%)' },
    { key: 'stop_loss_pct', type: 'number', default: 15, min: 5, max: 30, description: '止损(%)' },
    { key: 'gas_strategy', type: 'enum', default: 'medium', options: ['slow', 'medium', 'fast'], description: 'Gas策略' },
    { key: 'daily_max_loss_usdt', type: 'number', default: 200, min: 50, max: 2000, description: '日亏损上限(USDT)' },
    { key: 'max_concurrent', type: 'number', default: 3, min: 1, max: 10, description: '最大并发持仓' },
  ],
  risk_profile: {
    max_concurrent: 3,
    daily_max_loss_usdt: 200,
    min_balance_usdt: 100,
    gas_strategy: 'medium',
    signal_timeout_seconds: 120,
  },
  trader_class: 'MomentumTrader',
  trader_file: 'autoTrader/MomentumTrader.js',
  learning_profile: {
    param_space: {
      min_score: { type: 'int', low: 40, high: 80 },
      min_hourly_bars: { type: 'int', low: 3, high: 24 },
      range_min_pct: { type: 'float', low: 0.5, high: 5.0 },
      range_max_pct: { type: 'float', low: 5.0, high: 20.0 },
      min_liquidity_k: { type: 'float', low: 50, high: 500 },
      take_profit_pct: { type: 'float', low: 0.05, high: 0.50 },
      stop_loss_pct: { type: 'float', low: 0.05, high: 0.30 },
      trade_ratio: { type: 'float', low: 0.02, high: 0.20 },
    },
    feature_keys: ['score', 'range_pct', 'hourly_bars', 'liquidity_usd'],
    prompt_template: 'prompts/momentum.txt',
  },
  enabled: true,
  status: 'running',
};
```

---

## 5. 执行层设计 — 通用交易执行引擎

### 5.1 继承前次方案 B，扩展为多策略执行引擎

本执行层设计**完全继承** `autotrader-refactor-prd.md` 中的方案 B 架构，并在其上作三层扩展：

1. **从硬编码 2 个 Trader 扩展为策略驱动** — Trader 由 StrategyRegistry 动态加载
2. **信号路由从 if/else 改为策略分发器** — 新增 `SignalDispatcher` 
3. **风控从内联逻辑升级为独立中间件** — 新增 `RiskMiddleware`
4. **交易记录写入统一为一张表** — `trade_records` (加 `strategy_id` 字段区分)

### 5.2 执行层组件全景

```
services/gateway/src/execution/
├── BaseAutoTrader.js           ← [从方案B继承] 通用执行引擎基类 (~200行)
├── SignalDispatcher.js         ← [新增] 策略信号分发器 (~80行)
├── RiskMiddleware.js           ← [新增] 独立风控中间件 (~120行)
├── RecordWriter.js             ← [新增] 统一交易记录写入器 (~80行)
├── traders/                    ← [新增目录]
│   ├── MomentumTrader.js       ← [从方案B继承] 动量策略插件 (~80行)
│   ├── SpreadArbitrageTrader.js← [新增] 价差套利插件 (~120行)
│   └── GridTrader.js           ← [Phase 2] 网格交易插件
└── index.js                    ← [新增] 执行层入口 & 初始化
```

### 5.3 BaseAutoTrader V3 — 策略驱动的通用引擎

在方案 B 的基础上，V3 版本的核心改进：

```javascript
// services/gateway/src/execution/BaseAutoTrader.js (V3 改进版)

class BaseAutoTrader {
  /**
   * V3 改进：
   *   - 不再在 constructor 里硬编码 configTable/recordTable
   *   - 改为接收 strategyEntry (StrategyRegistryEntry) 
   *   - 统一的 trade_records 表，用 strategy_id 字段区分
   */
  constructor({ db, redis, okxClient, strategyEntry }) {
    this.db = db;
    this.redis = redis;
    this.okx = okxClient;
    this.strategy = strategyEntry;       // 完整的策略注册项
    this.strategyId = strategyEntry.strategy_id;
    this.redisActiveKey = `trade:active:${this.strategyId}`;
    this.riskProfile = strategyEntry.risk_profile;
  }

  /**
   * 核心入口 — 当信号到达时调用
   * V3: 不变，8步管道
   */
  async onSignal(userId, signal) {
    try {
      // ① 实盘开关检查
      if (!(await this.checkActive(userId)))
        return { executed: false, reason: 'trading_inactive' };

      // ② 策略配置加载 (从统一 strategy_configs 表)
      const config = await this.loadStrategyConfig(userId);
      if (!config) return { executed: false, reason: 'no_config' };

      // ③ 信号过滤 (策略钩子)
      if (!this.passSignalFilter(signal, config))
        return { executed: false, reason: 'signal_filter' };

      // ④ 风控检查 (代理到 RiskMiddleware)
      const riskResult = await this.riskMiddleware.check(userId, signal, config);
      if (!riskResult.passed)
        return { executed: false, reason: riskResult.reason };

      // ⑤ Agent 钱包查询
      const wallet = await this.getActiveWallet(userId);
      if (!wallet) return { executed: false, reason: 'no_wallet' };

      // ⑥ 交易金额计算 (策略钩子)
      const amount = this.calculateAmount(signal, config, wallet);

      // ⑦ 链上交易执行 (策略钩子)
      const execResult = await this.executeTrade(signal, config, wallet, amount);
      if (!execResult.success)
        return { executed: false, reason: execResult.error };

      // ⑧ 交易记录写入 (统一 RecordWriter)
      const record = await this.recordWriter.write({
        userId, strategyId: this.strategyId,
        signal, config, execResult,
      });

      // ⑨ 通知推送 (可选)
      await this.sendNotification(userId, { signal, record });

      return { executed: true, record };
    } catch (err) {
      console.error(`[${this.strategyId}] 执行异常:`, err);
      return { executed: false, reason: 'exception', error: err.message };
    }
  }

  // ===== 共享实现 (在方案B基础上增强) =====

  async loadStrategyConfig(userId) {
    const result = await this.db.query(
      `SELECT * FROM strategy_configs 
       WHERE user_id = $1 AND strategy_id = $2 AND is_active = true`,
      [userId, this.strategyId]
    );
    return result.rows[0] || null;
  }

  async getActiveWallet(userId) {
    const result = await this.db.query(
      `SELECT * FROM agentic_wallets 
       WHERE user_id = $1 AND status = 'active' LIMIT 1`,
      [userId]
    );
    return result.rows[0] || null;
  }

  // ===== 策略钩子 (子类必须实现) =====
  /** @abstract */
  passSignalFilter(signal, config) { throw new Error('Not implemented'); }
  /** @abstract */
  calculateAmount(signal, config, wallet) { throw new Error('Not implemented'); }
  /** @abstract */
  async executeTrade(signal, config, wallet, amount) { throw new Error('Not implemented'); }
}
```

### 5.4 SignalDispatcher — 策略信号分发器

```javascript
// services/gateway/src/execution/SignalDispatcher.js

/**
 * 取代方案B中的 if/else 硬编码路由
 * 根据信号中的 strategy_id 自动路由到对应 Trader
 */
class SignalDispatcher {
  constructor({ registry, db, redis, okxClient }) {
    this.registry = registry;           // StrategyRegistry
    this.traders = new Map();           // strategy_id → Trader instance
    this.db = db;
    this.redis = redis;
    this.okxClient = okxClient;
  }

  /** 初始化所有已注册策略的 Trader */
  async initialize() {
    for (const entry of this.registry.listEnabled()) {
      await this.ensureTrader(entry.strategy_id);
    }
    console.log(`[Dispatcher] 已初始化 ${this.traders.size} 个策略 Trader`);
  }

  /** 按需懒加载 Trader */
  async ensureTrader(strategyId) {
    if (this.traders.has(strategyId)) return this.traders.get(strategyId);
    const entry = this.registry.get(strategyId);
    if (!entry) throw new Error(`策略未注册: ${strategyId}`);
    
    const TraderClass = await import(`./traders/${entry.trader_file.split('/').pop()}`);
    const instance = new TraderClass.default({
      db: this.db, redis: this.redis, okxClient: this.okxClient,
      strategyEntry: entry,
    });
    this.traders.set(strategyId, instance);
    return instance;
  }

  /** 接收信号并路由 */
  async dispatch(signal) {
    const { strategy_id: strategyId, user_id: userId } = signal;
    if (!strategyId) return { executed: false, reason: 'no_strategy_id' };

    const trader = await this.ensureTrader(strategyId);
    return await trader.onSignal(userId || signal.userId || 'default', signal);
  }
}
```

### 5.5 RiskMiddleware — 独立风控中间件

```javascript
// services/gateway/src/execution/RiskMiddleware.js

class RiskMiddleware {
  constructor({ db, redis }) {
    this.db = db;
    this.redis = redis;
  }

  async check(userId, signal, config) {
    // ① 信号时效性检查
    if (this.isSignalExpired(signal)) {
      return { passed: false, reason: 'signal_expired' };
    }

    // ② 日亏损上限
    const dailyLossCheck = await this.checkDailyLoss(userId, signal.strategy_id, config);
    if (!dailyLossCheck.passed) return dailyLossCheck;

    // ③ 最大并发
    const concurrentCheck = await this.checkConcurrent(userId, signal.strategy_id, config);
    if (!concurrentCheck.passed) return concurrentCheck;

    // ④ 最低余额
    const balanceCheck = await this.checkBalance(userId, config);
    if (!balanceCheck.passed) return balanceCheck;

    // ⑤ 信号去重 (同一 token 短时间内不过度交易)
    const dupCheck = await this.checkDuplicate(userId, signal);
    if (!dupCheck.passed) return dupCheck;

    return { passed: true };
  }

  isSignalExpired(signal) {
    const now = Date.now();
    const age = now - signal.timestamp;
    return age > (signal.ttl_seconds || 120) * 1000;
  }

  async checkDailyLoss(userId, strategyId, config) {
    const dailyMaxLoss = parseFloat(config.daily_max_loss_usdt || 0);
    if (dailyMaxLoss <= 0) return { passed: true };

    const result = await this.db.query(
      `SELECT COALESCE(SUM(CASE WHEN net_pnl_usdt < 0 THEN net_pnl_usdt ELSE 0 END), 0) as total_loss
       FROM trade_records
       WHERE user_id = $1 AND strategy_id = $2 
       AND created_at >= CURRENT_DATE AND status = 'completed'`,
      [userId, strategyId]
    );
    const totalLoss = Math.abs(parseFloat(result.rows[0].total_loss));
    if (totalLoss >= dailyMaxLoss) {
      return { passed: false, reason: 'daily_loss_limit', detail: { totalLoss, dailyMaxLoss } };
    }
    return { passed: true };
  }

  async checkConcurrent(userId, strategyId, config) {
    const maxConcurrent = parseInt(config.max_concurrent || 1);
    if (maxConcurrent <= 0) return { passed: true };

    const result = await this.db.query(
      `SELECT COUNT(*) as count FROM trade_records
       WHERE user_id = $1 AND strategy_id = $2 AND status = 'executing'`,
      [userId, strategyId]
    );
    if (parseInt(result.rows[0].count) >= maxConcurrent) {
      return { passed: false, reason: 'max_concurrent', detail: { current: result.rows[0].count, max: maxConcurrent } };
    }
    return { passed: true };
  }

  async checkDuplicate(userId, signal) {
    // 同一 token 地址 5 分钟内不重复交易
    const key = `risk:dup:${userId}:${signal.token_address}`;
    const exists = await this.redis.get(key);
    if (exists) return { passed: false, reason: 'duplicate_token' };
    await this.redis.set(key, '1', 'EX', 300); // 5分钟
    return { passed: true };
  }

  async checkBalance(userId, config) {
    // 查询钱包余额
    const wallet = await this.db.query(
      `SELECT balance_usdt FROM agentic_wallets WHERE user_id = $1 AND status = 'active' LIMIT 1`,
      [userId]
    );
    const minBalance = parseFloat(config.min_balance_usdt || 100);
    const balance = parseFloat(wallet.rows[0]?.balance_usdt || 0);
    if (balance < minBalance) {
      return { passed: false, reason: 'insufficient_balance', detail: { balance, minBalance } };
    }
    return { passed: true };
  }
}
```

### 5.6 统一交易记录表 (V3 降维)

**当前问题**: 动量用 `live_trade_records`，套利用 `arb_trades`，两表 schema 不同。

**V3 统一方案**: 所有策略写入 `trade_records` 表，用 `strategy_id` + `execution_detail` (JSONB) 区分。

```sql
-- V3 统一交易记录表
CREATE TABLE trade_records (
    id              BIGSERIAL PRIMARY KEY,
    user_id         TEXT NOT NULL,
    strategy_id     TEXT NOT NULL,              -- 'momentum' | 'spread_arbitrage' | ...

    -- 交易基本信息
    chain           TEXT NOT NULL,
    token_address   TEXT NOT NULL,
    token_symbol    TEXT,
    action          TEXT NOT NULL,              -- 'BUY' | 'SELL' | 'ARBITRAGE'
    amount_in       NUMERIC(24,8),
    amount_out      NUMERIC(24,8),
    entry_price_usd NUMERIC(24,4),
    exit_price_usd  NUMERIC(24,4),

    -- 盈亏
    gross_profit_usdt  NUMERIC(12,2),
    gas_cost_usdt      NUMERIC(12,2),
    slippage_loss_usdt NUMERIC(12,2),
    net_pnl_usdt       NUMERIC(12,2),

    -- 链上信息
    tx_hash         TEXT,
    tx_hash_2       TEXT,                      -- 双笔交易的第二笔(套利)

    -- 策略特定 (JSONB 灵活扩展)
    execution_detail JSONB,                    -- {buy_dex, sell_dex, signal_score, ...}

    -- 状态
    status          TEXT DEFAULT 'executing',  -- 'executing' | 'completed' | 'failed' | 'reverted'
    error_message   TEXT,

    -- 时间
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,

    -- 索引
    UNIQUE(tx_hash)
);

CREATE INDEX idx_trade_records_user_strategy ON trade_records(user_id, strategy_id, created_at DESC);
CREATE INDEX idx_trade_records_status ON trade_records(status);
CREATE INDEX idx_trade_records_created ON trade_records(created_at);
```

### 5.7 执行层入口初始化

```javascript
// services/gateway/src/execution/index.js

import { StrategyRegistry } from '../strategies/StrategyRegistry.js';
import { SignalDispatcher } from './SignalDispatcher.js';
import { RiskMiddleware } from './RiskMiddleware.js';

export async function initExecutionLayer({ db, redis, okxClient }) {
  // ① 注册所有策略
  const registry = new StrategyRegistry();
  // 策略注册项由 strategies/registrations/ 目录下的文件提供
  // (在实际实现时可通过 glob 自动发现)
  await registry.loadFromDirectory('./strategies/registrations/');

  // ② 初始化风控
  const riskMiddleware = new RiskMiddleware({ db, redis });

  // ③ 初始化信号分发器
  const dispatcher = new SignalDispatcher({
    registry, db, redis, okxClient,
  });
  await dispatcher.initialize();

  // ④ 订阅所有策略信号
  for (const entry of registry.listEnabled()) {
    const channel = `trade:signals:${entry.strategy_id}`;
    redis.subscribe(channel);
    console.log(`[Execution] 已订阅 ${channel}`);
  }

  // ⑤ 全局信号处理
  redis.on('message', async (channel, message) => {
    try {
      const signal = JSON.parse(message);
      // 提取 userId (从信号中或从用户关联表)
      const userId = signal.user_id || await resolveUserId(signal);
      if (!userId) return;

      const result = await dispatcher.dispatch({ ...signal, user_id: userId });
      if (!result.executed) {
        console.log(`[Execution] ${signal.strategy_id} 信号未执行: ${result.reason}`);
      } else {
        console.log(`[Execution] ✅ ${signal.strategy_id} 信号已执行: ${result.record.id}`);
      }
    } catch (err) {
      console.error('[Execution] 信号处理异常:', err.message);
    }
  });

  return { registry, dispatcher, riskMiddleware };
}
```

### 5.8 执行层与 Gateway 巨石的关系

执行层新增代码**独立于 index.js**，通过 `initExecutionLayer()` 初始化入口接入：

```javascript
// index.js 改动 (仅新增 ~20行)
// ...现有代码保持不变...
import { initExecutionLayer } from './execution/index.js';

// 在 app.listen 之前初始化
const executionLayer = await initExecutionLayer({ db, redis, okxClient: okxTrade });
app.decorate('execution', executionLayer);
console.log('[Gateway] ✅ 执行层已就绪');
```

---

## 6. 学习层设计 — 多策略通用学习框架

### 6.1 当前学习层问题

`services/learning/src/scheduler.py` 存在以下硬编码：

| 硬编码项 | 位置 | 当前值 | 需要改造 |
|----------|------|--------|---------|
| 策略名 | L89 `_should_learn` | `'default'` | 从消息中获取 |
| Optuna 参数 | L82-L90 `objective()` | 硬编码8个V2参数 | 从 strategyEntry 中获取 |
| DeepSeek prompt | L135-L180 | 硬编码V2描述 | 策略独立 prompt 模板 |
| 特征字段 | L165-L170 prompt 中的示例 | `score/range_pct/hourly_bars/liquidity_usd` | 从 learning_profile 获取 |
| trade_experiences 表 | L41-L44 | `trade_experiences` | 统一为 `trade_records` |
| paper_config 更新 | L205-L215 | 直接写止盈止损 | 通用参数回写 |

### 6.2 V3 多策略通用学习框架

```
services/learning/src/
├── strategy_agnostic_learner.py   ← [重构] 策略无关学习引擎 (~300行)
├── learning_profiles/              ← [新增] 策略学习配置目录
│   ├── momentum.json               ← 动量策略学习配置
│   ├── spread_arbitrage.json       ← 价差套利学习配置
│   └── grid_trading.json           ← 网格交易学习配置(未来)
├── prompts/                        ← [新增] 策略独立 prompt 模板
│   ├── momentum.txt
│   ├── spread_arbitrage.txt
│   └── grid_trading.txt
└── scheduler.py                   ← [保留] 入口 (改为加载 learner)
```

### 6.3 StrategyAgnosticLearner 核心设计

```python
# services/learning/src/strategy_agnostic_learner.py

import json
import asyncio
from typing import Dict, List, Optional

class LearningProfile:
    """策略学习配置 — 从JSON文件加载"""
    strategy_id: str
    param_space: Dict          # Optuna suggest_* 的参数定义
    feature_keys: List[str]    # 用于学习的关键特征
    prompt_template: str       # DeepSeek prompt 模板路径
    data_source: str           # 'trade_records' 表名
    experience_threshold: int  # 最少经验条数触发学习

class StrategyAgnosticLearner:
    """
    多策略通用学习引擎
    
    流程:
    1. 监听 learning:trigger channel → 获取 strategy_id
    2. 加载对应 LearningProfile
    3. 从 trade_records WHERE strategy_id=xxx 取经验
    4. 用 profile.param_space 构建 Optuna objective
    5. 用 profile.prompt_template 调用 DeepSeek
    6. 结果写入 Redis params:{strategy_id} / rules:{strategy_id}
    7. 记录 learning_history
    """

    def __init__(self):
        self.profiles: Dict[str, LearningProfile] = {}
        self.redis = None
        self.db = None

    async def load_profiles(self):
        """从 learning_profiles/ 目录加载所有策略学习配置"""
        import os, glob
        profile_dir = os.path.join(os.path.dirname(__file__), 'learning_profiles')
        for path in glob.glob(f'{profile_dir}/*.json'):
            with open(path) as f:\n                data = json.load(f)\n                profile = LearningProfile()\n                profile.strategy_id = data['strategy_id']\n                profile.param_space = data['param_space']
                profile.feature_keys = data['feature_keys']
                profile.prompt_template = data.get('prompt_template', '')
                profile.data_source = data.get('data_source', 'trade_records')
                profile.experience_threshold = data.get('experience_threshold', 30)
                self.profiles[profile.strategy_id] = profile
        print(f"📚 已加载 {len(self.profiles)} 个策略学习配置: {list(self.profiles.keys())}")

    async def _should_learn(self, strategy_id: str) -> bool:
        """检查是否有足够的增量经验触发学习"""
        profile = self.profiles.get(strategy_id)
        if not profile:
            return False
        
        with self.db.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM trade_records WHERE strategy_id = %s AND status = 'completed'",
                (strategy_id,)
            )
            total = cur.fetchone()[0] or 0
        
        last_key = f"learning:last_count:{strategy_id}"
        last_count = int(await self.redis.get(last_key) or 0)
        
        return (total - last_count) >= profile.experience_threshold

    async def _run_optuna(self, strategy_id: str):
        """通用 Optuna 参数调优 — 基于 LearningProfile.param_space 动态构建"""
        profile = self.profiles.get(strategy_id)
        if not profile:
            return

        try:
            import optuna
            from optuna.samplers import TPESampler

            # 获取经验数据
            with self.db.cursor() as cur:
                cur.execute(
                    "SELECT net_pnl_usdt, execution_detail FROM trade_records "
                    "WHERE strategy_id = %s AND status = 'completed' ORDER BY created_at DESC LIMIT 200",
                    (strategy_id,)
                )
                rows = cur.fetchall()

            if len(rows) < 20:
                return

            def build_suggest(trial, name, spec):
                """根据 param_space 规格动态调用 suggest_*"""
                t = spec['type']
                if t == 'int':
                    return trial.suggest_int(name, spec['low'], spec['high'])
                elif t == 'float':
                    return trial.suggest_float(name, spec['low'], spec['high'])
                elif t == 'categorical':
                    return trial.suggest_categorical(name, spec['choices'])
                elif t == 'loguniform':
                    return trial.suggest_loguniform(name, spec['low'], spec['high'])
                return trial.suggest_float(name, 0, 1)

            def objective(trial):
                params = {
                    name: build_suggest(trial, name, spec)
                    for name, spec in profile.param_space.items()
                }
                # 用交易结果评分
                wins = sum(1 for pnl, _ in rows if (pnl or 0) > 0)
                return wins / max(len(rows), 1)

            study = optuna.create_study(
                direction='maximize',
                sampler=TPESampler(),
                study_name=f'optuna_{strategy_id}'
            )
            await asyncio.to_thread(lambda: study.optimize(objective, n_trials=50))

            best_params = study.best_params
            await self.redis.set(f"params:{strategy_id}", json.dumps(best_params))
            print(f"🎯 [{strategy_id}] Optuna 最优参数: {best_params}")

            return best_params

        except Exception as e:\n            print(f"⚠️ [{strategy_id}] Optuna 异常: {e}")

    async def _call_deepseek(self, strategy_id: str):
        """通用 DeepSeek 规则蒸馏 — 使用策略独立 prompt 模板"""
        profile = self.profiles.get(strategy_id)
        if not profile:
            return

        # 加载策略特定的 prompt 模板
        prompt_dir = os.path.join(os.path.dirname(__file__), 'prompts')
        template_path = os.path.join(prompt_dir, f'{strategy_id}.txt')
        
        with open(template_path) as f:\n            prompt_template = f.read()\n\n        # 替换模板变量\n        prompt = prompt_template.replace('{{strategy_id}}', strategy_id)\n\n        # ... DeepSeek API 调用 (与 scheduler.py 现有逻辑相同) ...
        # 结果写入 Redis rules:{strategy_id}

    async def run(self):
        await self.connect()
        await self.load_profiles()

        pubsub = self.redis.pubsub()
        await pubsub.subscribe('learning:trigger')
        print("📡 等待学习触发信号...")

        async for message in pubsub.listen():
            if message['type'] != 'message':
                continue
            
            data = json.loads(message['data'])
            strategy_id = data.get('strategy', data.get('strategy_id', ''))
            
            if not strategy_id or strategy_id not in self.profiles:
                print(f"⚠️ 未知策略: {strategy_id}")
                continue

            print(f"🧠 收到学习信号: {strategy_id}")

            if await self._should_learn(strategy_id):
                await asyncio.gather(
                    self._run_optuna(strategy_id),
                    self._call_deepseek(strategy_id),
                )
                await self._save_learning_history(strategy_id)
            else:
                print(f"⏸️ [{strategy_id}] 经验不足，跳过学习")
```

### 6.4 学习配置示例

```json
// services/learning/src/learning_profiles/momentum.json
{
  "strategy_id": "momentum",
  "data_source": "trade_records",
  "experience_threshold": 30,
  "feature_keys": ["score", "range_pct", "hourly_bars", "liquidity_usd"],
  "param_space": {
    "min_score": { "type": "int", "low": 40, "high": 80 },
    "min_hourly_bars": { "type": "int", "low": 3, "high": 24 },
    "range_min_pct": { "type": "float", "low": 0.5, "high": 5.0 },
    "range_max_pct": { "type": "float", "high": 20.0, "low": 5.0 },
    "min_liquidity_k": { "type": "float", "low": 50, "high": 500 },
    "take_profit_pct": { "type": "float", "low": 0.05, "high": 0.50 },
    "stop_loss_pct": { "type": "float", "low": 0.05, "high": 0.30 },
    "trade_ratio": { "type": "float", "low": 0.02, "high": 0.20 }
  },
  "prompt_template": "prompts/momentum.txt"
}
```

```json
// services/learning/src/learning_profiles/spread_arbitrage.json
{
  "strategy_id": "spread_arbitrage",
  "data_source": "trade_records",
  "experience_threshold": 30,
  "feature_keys": ["spread_pct", "profit_est_usd", "liquidity_buy", "liquidity_sell", "gas_estimate_usd"],
  "param_space": {
    "min_spread_pct": { "type": "float", "low": 0.1, "high": 3.0 },
    "max_slippage_pct": { "type": "float", "low": 0.5, "high": 5.0 },
    "min_profit_usdt": { "type": "float", "low": 1, "high": 20 },
    "max_position_usdt": { "type": "float", "low": 100, "high": 5000 },
    "gas_cap_gwei": { "type": "int", "low": 10, "high": 200 }
  },
  "prompt_template": "prompts/spread_arbitrage.txt"
}
```

### 6.5 学习触发机制

学习由执行层在交易记录写入后触发：

```javascript
// RecordWriter.js
async write({ userId, strategyId, signal, config, execResult }) {
  const record = await this.db.query(
    `INSERT INTO trade_records (...) VALUES (...) RETURNING *`,
    [/*...*/]
  );

  // 触发学习检查 (不阻塞)
  const countResult = await this.db.query(
    `SELECT COUNT(*) FROM trade_records WHERE strategy_id = $1`, [strategyId]
  );
  const lastCount = await this.redis.get(`learning:last_count:${strategyId}`);
  const diff = parseInt(countResult.rows[0].count) - parseInt(lastCount || 0);
  
  if (diff >= 30) {
    await this.redis.publish('learning:trigger', JSON.stringify({
      strategy: strategyId,
      new_count: parseInt(countResult.rows[0].count),
    }));
    console.log(`[Learning] 触发学习: ${strategyId} (${diff}条新经验)`);
  }

  return record.rows[0];
}
```

---

## 7. 代码迁移路线 — 散装 → 三层映射

### 7.1 三大迁移路径

```
路径 A: 策略层迁移 (Python Worker)
  散装代码 → 统一信号格式 → 策略注册 → publish 统一 channel

路径 B: 执行层迁移 (Node.js Gateway)
  index.js 巨石 → extraction/ 独立目录 → SignalDispatcher 统一路由

路径 C: 学习层迁移 (Python Learning)
  scheduler.py 硬编码 → StrategyAgnosticLearner → LearningProfile 配置驱动
```

### 7.2 详细迁移映射表

| 当前文件 | 行数 | 当前角色 | V3 角色 | 迁移方式 | 风险 |
|---------|------|---------|---------|---------|------|
| `mature_meme.py` | ~940 | 动量 Worker | 动量策略 Worker (策略层) | **微改**: 信号发布改为 V3 统一格式 + publish 到 `trade:signals:momentum` | 🟢 低 |
| `arbitrage.py` | ~287 | 套利 Worker | 价差套利 Worker (策略层) | **重构**: 补充完整扫描逻辑 + V3 信号格式 | 🟡 中 |
| `lending_arb.py` | ~? | 借贷 Worker | 借贷套利 Worker (策略层) | **重构**: 完善逻辑 + V3 信号格式 | 🟡 中 |
| `risk_engine.py` | ~? | 风控告警 | 保留告警, 风控拦截迁移到执行层 RiskMiddleware | **微改**: 增加 V3 signal 格式兼容 | 🟢 低 |
| `scheduler.py` | ~300 | 动量学习 | 入口改为加载 StrategyAgnosticLearner | **重构**: 新建 learner, 保留 scheduler 做入口 | 🟡 中 |
| `index.js` (Gateway) | ~1277 | 巨石 Gateway | **微改**: import execution/index.js | 🟢 低 (只新增,不删改) |
| `okx-trade.js` | ~114 | OKX 执行 | **不动** — 执行层底层设施 | — | 🟢 无 |
| `profitCalc.js` | ~42 | 利润计算 | **不动** — 被 RecordWriter 复用 | — | 🟢 无 |
| `arbitrage.js` (route) | ~355 | 套利路由 | **改造**: execute 端点从 mock 改为调用执行层 | 🟡 中 |
| `DexPage.tsx` | ~72 | DEX 页面 | **改名** → TradePage.tsx | 🟢 低 |
| `DeFiPage.tsx` | ~158 | DeFi 页面 | **改造**: 从利率表格改为策略卡片矩阵 | 🟡 中 |
| `TradesPage.tsx` | ~73 | 交易中心 | **改造**: 融合 MomentumLivePage 为策略详情页 | 🟡 中 |
| `MomentumTab.tsx` | ~650 | 动量 Tab | **拆分**: 拆为 MomentumDetailPage + 提取共享组件 | 🟡 中 |
| `Sidebar.tsx` | ~107 | 侧边栏 | **微改**: 增加"交易记录"入口, 路由调整 | 🟢 低 |
| `App.tsx` | ~111 | 路由 | **微改**: 路由调整 | 🟢 低 |
| `Dockerfile` (learning) | — | 学习容器 | **微改**: 挂载 learning_profiles/ + prompts/ | 🟢 低 |

### 7.3 新增文件完整清单

```
services/gateway/src/
├── strategies/
│   ├── StrategyRegistry.js         ← [新增] 策略注册中心 (~120行)
│   └── registrations/
│       ├── momentum.js             ← [新增] 动量策略注册项 (~60行)
│       └── spread_arbitrage.js     ← [新增] 价差套利注册项 (~60行)

├── execution/
│   ├── index.js                    ← [新增] 执行层入口 (~80行)
│   ├── BaseAutoTrader.js           ← [新增] 通用执行引擎 (~200行)
│   ├── SignalDispatcher.js         ← [新增] 信号分发器 (~80行)
│   ├── RiskMiddleware.js           ← [新增] 风控中间件 (~120行)
│   ├── RecordWriter.js             ← [新增] 记录写入器 (~80行)
│   └── traders/
│       ├── MomentumTrader.js       ← [新增] 动量Trader (~80行)
│       └── SpreadArbitrageTrader.js← [新增] 价差套利Trader (~120行)

services/learning/src/
├── strategy_agnostic_learner.py    ← [新增] 通用学习引擎 (~300行)
├── learning_profiles/
│   ├── momentum.json               ← [新增] 动量学习配置 (~30行)
│   └── spread_arbitrage.json       ← [新增] 套利学习配置 (~30行)
└── prompts/
    ├── momentum.txt                ← [新增] 动量prompt模板
    └── spread_arbitrage.txt        ← [新增] 套利prompt模板

前端
src/pages/
├── TradePage.tsx                   ← [重命名+改造] 原DexPage
├── DeFiPage.tsx                    ← [改造] 策略卡片矩阵
├── RecordsPage.tsx                 ← [新增] 全局交易记录
├── MomentumDetailPage.tsx          ← [新增] 动量策略详情
├── SpreadArbDetailPage.tsx         ← [新增] 价差套利详情

src/components/strategy/
├── StrategyCard.tsx                ← [新增] 策略卡片组件
├── StrategyMetrics.tsx             ← [新增] 策略统计组件
├── StrategyConfigPanel.tsx         ← [新增] 通用配置面板
└── StrategyStatusBadge.tsx         ← [新增] 状态徽章

数据库
deploy/sql/
└── migration_v3.sql                ← [新增] V3 统一表迁移
```

---

## 8. 分阶段实施计划

### Phase 0: 基础设施 (1 人 × 2 天)

**目标**: 搭建三层架构骨架，不改变业务逻辑

| 任务 | 文件 | 工时 | 详情 |
|------|------|------|------|
| P0.1 | 创建目录结构 | 0.25d | execution/ strategies/ registrations/ |
| P0.2 | StrategyRegistry | 0.5d | 注册中心 + 2个注册项 |
| P0.3 | BaseAutoTrader V3 | 0.5d | 在方案B基础上改造成策略驱动 |
| P0.4 | 数据库迁移 | 0.25d | trade_records 统一表 + migration_v3.sql |
| P0.5 | 集成验证 | 0.5d | Gateway initExecutionLayer 接入，无业务影响 |

**验收标准**:
- StrategyRegistry 可加载2个策略注册项
- BaseAutoTrader 可通过 mock 信号走通 8 步管道
- `trade_records` 表创建成功

### Phase 1: 策略层统一 (1 人 × 2 天)

**目标**: 统一信号格式，Worker 改造

| 任务 | 文件 | 工时 | 详情 |
|------|------|------|------|
| P1.1 | mature_meme.py 改造 | 0.5d | publish_signal 改用 V3 格式 + channel |
| P1.2 | arbitrage.py 改造 | 0.75d | 补充扫描逻辑 + V3 信号格式 |
| P1.3 | 信号格式验证 | 0.25d | JSON Schema 验证 + 端到端测试 |
| P1.4 | 前端信号适配 | 0.5d | WebSocket 接收端适配 SignalPayload |

**验收标准**:
- mature_meme.py 发布到 `trade:signals:momentum`
- arbitrage.py 发布到 `trade:signals:spread_arbitrage`
- SignalPayload 格式通过 Schema 验证
- 前端 WebSocket 可接收并展示新格式信号

### Phase 2: 执行层上线 (1 人 × 3 天)

**目标**: AutoTrader 真实执行 + 风控 + 记录

| 任务 | 文件 | 工时 | 详情 |
|------|------|------|------|
| P2.1 | MomentumTrader 实现 | 0.5d | passFilter/calcAmt/executeTrade/writeRecord |
| P2.2 | SpreadArbitrageTrader 实现 | 0.75d | dual swap + 利润重算 |
| P2.3 | RiskMiddleware 实现 | 0.5d | 日亏损/并发/去重/余额/信号过期 |
| P2.4 | SignalDispatcher 实现 | 0.25d | Redis 订阅 + 策略路由 |
| P2.5 | RecordWriter 实现 | 0.25d | 统一写入 trade_records + 学习触发 |
| P2.6 | Gateway 集成 | 0.25d | index.js 接入 execution |
| P2.7 | 端到端测试 | 0.5d | Worker→信号→执行→OKX→记录 全链路 |

**验收标准**:
- 动量信号 → 自动执行买入 swap → trade_records 有记录
- 风控: 日亏损达上限 → 拦截
- 套利信号 → 双笔 swap 均执行
- `arbitrage.js` execute 端点 mock 替换为真实执行

### Phase 3: 学习层升级 (1 人 × 2 天)

**目标**: 多策略通用学习框架

| 任务 | 文件 | 工时 | 详情 |
|------|------|------|------|
| P3.1 | StrategyAgnosticLearner | 1d | 通用 learner + 动态 param_space + prompt 模板 |
| P3.2 | 学习配置编写 | 0.25d | momentum.json / spread_arbitrage.json |
| P3.3 | Prompt 模板编写 | 0.25d | 两个策略的 DeepSeek prompt |
| P3.4 | scheduler 入口改造 | 0.25d | 改为加载 StrategyAgnosticLearner |
| P3.5 | 验证 | 0.25d | 两个策略的学习触发→调优→回写闭环 |

**验收标准**:
- 动量策略: 学习触发 → Optuna 调优 → params:momentum 写入 Redis
- 套利策略: 同样的流程
- params 被 Worker 正确加载
- learning_history 记录两个策略的学习历史

### Phase 4: 前端重组 (1 人 × 3 天)

**目标**: 策略卡片体系 + 细节页面

| 任务 | 文件 | 工时 | 详情 |
|------|------|------|------|
| P4.1 | StrategyCard 组件 | 0.5d | 统一卡片 + metrics 展示 |
| P4.2 | TradePage 改造 | 0.5d | DexPage→TradePage, 卡片矩阵(信号+学习入口) |
| P4.3 | DeFiPage 改造 | 0.5d | 利率表格→策略卡片矩阵(信号+学习入口) |
| P4.4 | LiveTradingPage 🆕 | 0.75d | 实盘交易控制台(钱包+启停+风控+记录流) |
| P4.5 | MomentumDetailPage | 0.25d | 信号流展示 + 学习报告(不含交易控制) |
| P4.6 | SpreadArbDetailPage | 0.25d | 机会列表 + 学习报告(不含交易控制) |
| P4.7 | Sidebar + 路由 | 0.25d | 新增"实盘交易"入口, 路由调整 |

**验收标准**:
- `/trade` 显示动量+网格策略卡片，点击进详情(信号+学习)
- `/defi` 显示价差套利+三角套利+借贷套利卡片
- `/live` 实盘交易控制台: 钱包管理 + 按策略启停 + 风控面板 + 交易记录流
- 策略详情页**不含交易控制**，只展示信号流和学习报告
- 前端功能与现状等价 (无退化)

### Phase 5: 清理与文档 (1 人 × 1 天)

| 任务 | 工时 | 详情 |
|------|------|------|
| P5.1 | 删除冗余代码 | 0.25d | 删除 MomentumTab.tsx.bak, arbitrage.js mock 函数等 |
| P5.2 | 文档更新 | 0.25d | README + 架构图 + API 文档 |
| P5.3 | 回归测试 | 0.25d | 全链路回归 |
| P5.4 | 代码审查 | 0.25d | PR review |

### 8.1 总工时汇总

| Phase | 内容 | 工时 | 人员 |
|-------|------|------|------|
| P0 | 基础设施 | 2d | 1人 |
| P1 | 策略层统一 | 2d | 1人 |
| P2 | 执行层上线 | 3d | 1人 |
| P3 | 学习层升级 | 2d | 1人 |
| P4 | 前端重组 | 3d | 1人 |
| P5 | 清理文档 | 1d | 1人 |
| **总计** | | **13 人天** | 1人约 3 周 |

| 并行配置 | 工期 |
|----------|------|
| 1 人顺序 | **13 天 (~3 周)** |
| 2 人并行 (后端+前端) | **8 天 (~1.5 周)** |
| 3 人并行 (策略+执行+前端) | **6 天 (~1 周)** |

### 8.2 关键依赖链

```
P0 (基础设施) ——→ P1 (策略层) ——→ P2 (执行层)
                              ↘
                                P3 (学习层, 可在 P2 完成后并行)
                P0 ——→ P4 (前端, 可在 P1 完成后启动)
P0-P4 全部完成 ——→ P5 (清理)
```

### 8.3 与已有任务的关系

| 已有任务 (aihunter_task_assignment.md) | 与本蓝图的关系 |
|-----------------------------------------|---------------|
| C1: Gateway 巨石拆分 | **协同**: 本蓝图的执行层本身就是 C1 的一部分 |
| A2: 模拟交易改用真实价格 | **被替代**: 执行层上线后，模拟交易自然用真实价格 |
| B1: 修复 DEX/DeFi 页面黑屏 | **可替代**: Phase 4 直接重构页面 |
| B2/B3: Swap 滑点/硬编码 | **被替代**: 执行层用 okx-trade.js (已有正确滑点处理) |
| A4: 补 SQL 迁移 | **扩展**: V3 migration 包含所有缺失表 |

---

## 9. 文件改动清单

### 9.1 新建文件 (17 个)

| # | 文件路径 | 行数估计 | 说明 |
|---|---------|---------|------|
| 1 | `services/gateway/src/strategies/StrategyRegistry.js` | ~120 | 策略注册中心 |
| 2 | `services/gateway/src/strategies/registrations/momentum.js` | ~60 | 动量策略注册项 |
| 3 | `services/gateway/src/strategies/registrations/spread_arbitrage.js` | ~60 | 价差套利注册项 |
| 4 | `services/gateway/src/execution/index.js` | ~80 | 执行层入口 |
| 5 | `services/gateway/src/execution/BaseAutoTrader.js` | ~200 | 通用执行引擎 |
| 6 | `services/gateway/src/execution/SignalDispatcher.js` | ~80 | 信号分发器 |
| 7 | `services/gateway/src/execution/RiskMiddleware.js` | ~120 | 风控中间件 |
| 8 | `services/gateway/src/execution/RecordWriter.js` | ~80 | 记录写入器 |
| 9 | `services/gateway/src/execution/traders/MomentumTrader.js` | ~80 | 动量策略插件 |
| 10 | `services/gateway/src/execution/traders/SpreadArbitrageTrader.js` | ~120 | 价差套利插件 |
| 11 | `services/learning/src/strategy_agnostic_learner.py` | ~300 | 通用学习引擎 |
| 12 | `services/learning/src/learning_profiles/momentum.json` | ~30 | 动量学习配置 |
| 13 | `services/learning/src/learning_profiles/spread_arbitrage.json` | ~30 | 套利学习配置 |
| 14 | `services/learning/src/prompts/momentum.txt` | ~50 | 动量 prompt |
| 15 | `services/learning/src/prompts/spread_arbitrage.txt` | ~50 | 套利 prompt |
| 16 | `src/pages/TradePage.tsx` | ~120 | DEX 策略卡片矩阵 (替代 DexPage) |
| 17 | `src/pages/LiveTradingPage.tsx` | ~250 | 实盘交易控制台 🆕 (钱包+启停+风控+记录流) |
| 18 | `src/pages/MomentumDetailPage.tsx` | ~150 | 动量详情: 信号流 + 学习报告 |
| 19 | `src/pages/SpreadArbDetailPage.tsx` | ~130 | 套利详情: 机会列表 + 学习报告 |
| 20 | `src/components/strategy/StrategyCard.tsx` | ~80 | 策略卡片组件 |
| 21 | `src/components/strategy/StrategyMetrics.tsx` | ~50 | 策略统计 |
| 22 | `src/components/strategy/StrategyConfigPanel.tsx` | ~120 | 通用配置面板 |
| 23 | `deploy/sql/migration_v3.sql` | ~80 | V3 数据库迁移 |

**新建总行数: ~2350 行**

### 9.2 修改文件 (8 个)

| # | 文件路径 | 改动行数 | 改动方式 | 说明 |
|---|---------|---------|---------|------|
| 1 | `services/gateway/src/index.js` | +30 | 新增 import + exec layer 初始化 | 不动现有代码 |
| 2 | `services/gateway/src/routes/arbitrage.js` | -30 / +50 | 替换 execute mock → 调用执行层; 删除 onchainosWalletSend | 修改 execute 处理函数 |
| 3 | `services/worker/src/mature_meme.py` | ~40 | publish_signal 改用 V3 格式 | 修改 publish 逻辑 |
| 4 | `services/worker/src/arbitrage.py` | ~150 | 补充扫描逻辑 + V3 信号格式 | 重构扫描部分 |
| 5 | `services/learning/src/scheduler.py` | ~30 | 入口改为加载 StrategyAgnosticLearner | 保留核心调度逻辑 |
| 6 | `src/App.tsx` | ~10 | 调整路由 | 新增路由 + 重定向 |
| 7 | `src/components/Sidebar.tsx` | ~15 | 新增"交易记录"入口, 路由调整 | 替换导航项 |
| 8 | `src/pages/DeFiPage.tsx` | ~100 | 利率表格 → 策略卡片矩阵 | 保留利率数据源 |

**修改总行数: ~455 行**

### 9.3 删除/废弃文件 (5 个)

| # | 文件路径 | 说明 |
|---|---------|------|
| 1 | `src/pages/DexPage.tsx` | 被 TradePage.tsx 替代 |
| 2 | `src/pages/TradesPage.tsx` | 功能分散到详情页 |
| 3 | `src/pages/trades/DeFiTab.tsx` | 空壳, 被 DeFiPage 策略卡片替代 |
| 4 | `src/pages/trades/MomentumTab.tsx.bak` | 备份文件 |
| 5 | `src/pages/trades/MomentumTab.tsx.bak2` | 备份文件 |

### 9.4 不动清单 (明确排除)

| 文件/模块 | 原因 |
|-----------|------|
| `okx-trade.js` | 底层执行设施，稳定复用 |
| `profitCalc.js` | 利润计算纯函数，被执行层复用 |
| 所有 Agentic Wallet 相关代码 | 钱包管理不变 |
| `risk_engine.py` | 风控告警保留，只增加 V3 信号格式兼容 |
| `main.py` (Worker 入口) | Worker 主流程不变，策略 Worker 内部改 |
| `price_refresh.py`, `sol_worker.py` | 辅助 Worker，不变 |
| 所有合约代码 | 不涉及 |
| `deploy/docker-compose.yml` | 不涉及(学习层只需挂载配置文件) |

---

## 10. 风险与权衡

### 10.1 技术风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 信号格式兼容 | 低 | 中 | Phase 0 先建 Schema, Phase 1 逐步迁移 |
| DB 迁移导致数据丢失 | 低 | 高 | migration_v3.sql 使用 CREATE TABLE IF NOT EXISTS, 旧表保留不动 |
| 执行层 bug 导致误交易 | 中 | 高 | RiskMiddleware 多重检查 + Paper 模式先行验证 |
| Gateway 巨石拆分冲突 | 中 | 中 | 执行层新增文件独立于 index.js, 只新增 import |
| 学习层 prompt 模板退化 | 低 | 中 | V3 学习框架保留手动写 prompt 的通道 |
| 前端功能退化 | 低 | 中 | 每个 Phase 保持现有页面可用, 新页面渐进上线 |

### 10.2 设计权衡

| 权衡点 | 选择 | 原因 |
|--------|------|------|
| 策略配置表: 统一 vs 独立 | **统一表** `strategy_configs` | 配置面板可复用, 学习层查询统一 |
| 交易记录表: 统一 vs 独立 | **统一表** `trade_records` | 全局统计/记录页一键聚合; JSONB 保留策略特异性 |
| 信号 channel: 统一 vs 独立 | **独立** `trade:signals:{strategy_id}` | 避免全局广播, 信号路由精确 |
| 执行 lock: 用 Redis 还是 DB | **Redis** SET NX EX | 信号级锁, 10秒过期, 比 DB 快 |
| 学习触发: 同步 vs 异步 | **异步** publish/sub | 不阻塞交易执行 |
| 学习参数存储: Redis vs DB | **Redis** params:{id} | 学习参数需要热加载, Worker 秒级获取 |
| 前端策略卡片: 手写 vs 配置驱动 | **配置驱动** | 统一 StrategyCard 组件 + strategy entry 驱动 |

### 10.3 已知未解决问题

1. **GridTrader / TrendFollowingTrader / TriangularArbitrageTrader** — 本版本仅注册占位，Trader 实现留给后续 PRD
2. **跨链套利** — 需要桥接基础设施，Phase 3 后再评估
3. **闪电贷合约** — 需要 Solidity 合约开发，不在本蓝图范围
4. **学习层 A/B 测试回滚** — 当新学习参数导致亏损时应自动回滚，此功能需要单独设计
5. **多用户并发执行的资源争用** — 当前设计每用户独立 Trader，但 wallet 余额是共享的，需要细粒度余额锁定

---

## 11. 附录：完整信号格式规范

### 11.1 SignalPayload JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "AIHunter V3 SignalPayload",
  "type": "object",
  "required": ["signal_id", "type", "strategy_id", "timestamp", "chain", "token_address", "score"],
  "properties": {
    "signal_id": {
      "type": "string",
      "format": "uuid",
      "description": "信号唯一ID"
    },
    "type": {
      "type": "string",
      "enum": ["MATURE_MEME", "SPREAD_ARBITRAGE", "TRIANGULAR_ARBITRAGE", "LENDING_ARBITRAGE", "GRID_TRADING", "TREND_FOLLOWING", "FLASH_LOAN"],
      "description": "信号类型"
    },
    "strategy_id": {
      "type": "string",
      "enum": ["momentum", "spread_arbitrage", "triangular_arbitrage", "lending_arbitrage", "grid_trading", "trend_following", "flash_loan"],
      "description": "策略唯一标识"
    },
    "version": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+$",
      "default": "3.0"
    },
    "timestamp": {
      "type": "number",
      "description": "Unix毫秒时间戳"
    },
    "ttl_seconds": {
      "type": "number",
      "minimum": 1,
      "maximum": 600,
      "default": 60,
      "description": "信号有效期(秒)"
    },
    "chain": {
      "type": "string",
      "enum": ["ETH", "BSC", "BASE", "SOL", "ARB", "OP", "POLYGON"],
      "description": "链标识"
    },
    "action": {
      "type": "string",
      "enum": ["BUY", "SELL", "WATCH"],
      "description": "建议动作"
    },
    "token_address": {
      "type": "string",
      "pattern": "^0x[a-fA-F0-9]{40}$",
      "description": "代币合约地址"
    },
    "token_symbol": {
      "type": "string",
      "description": "代币符号"
    },
    "score": {
      "type": "number",
      "minimum": 0,
      "maximum": 100,
      "description": "策略综合评分"
    },
    "confidence": {
      "type": "number",
      "minimum": 0,
      "maximum": 1,
      "description": "可信度"
    },
    "execution_params": {
      "type": "object",
      "description": "策略特定的执行参数",
      "properties": {
        "entry_price_usd": { "type": "number" },
        "liquidity_usd": { "type": "number" },
        "hourly_bars": { "type": "integer" },
        "range_pct": { "type": "number" },
        "signals": { "type": "array", "items": { "type": "string" } },
        "buy_dex": { "type": "string" },
        "sell_dex": { "type": "string" },
        "buy_price": { "type": "number" },
        "sell_price": { "type": "number" },
        "estimated_profit_usdt": { "type": "number" },
        "token_pair": { "type": "string" },
        "spread_pct": { "type": "number" }
      }
    },
    "risk_tags": {
      "type": "array",
      "items": { "type": "string" },
      "description": "风控标签"
    },
    "risk_score": {
      "type": "number",
      "minimum": 0,
      "maximum": 100,
      "description": "风控评分"
    },
    "source": {
      "type": "string",
      "enum": ["worker", "manual", "learning"],
      "description": "信号来源"
    },
    "user_id": {
      "type": "string",
      "description": "关联用户ID(可选)"
    }
  }
}
```

### 11.2 Agent 钱包接口（不动，仅文档化）

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/agentic-wallet/create` | POST | 创建 TEE 钱包 |
| `/api/agentic-wallet/status` | GET | 查询钱包状态 |
| `/api/agentic-wallet/authorize` | POST | 授权 TEE 签名 |
| `/api/agentic-wallet/revoke` | POST | 撤销授权 |
| `/api/live-trading/config` | GET/POST | 配置读写 |
| `/api/live-trading/start` | POST | 开启交易 |
| `/api/live-trading/stop` | POST | 暂停交易 |
| `/api/live-trading/status` | GET | 查询状态 |
| `/api/live-trading/trades` | GET | 交易记录 |

### 11.3 OKX DEX Aggregator 接口（不动，仅文档化）

| 函数 | 说明 |
|------|------|
| `getQuote({ chain, fromToken, toToken, amount, slippage })` | 获取报价 |
| `getApproveTransaction({ chain, tokenAddress, amount })` | 获取授权交易数据 |
| `executeSwap({ chain, fromToken, toToken, amount, slippage, walletAddress })` | 执行 Swap |
| `getSwapStatus({ chain, txHash })` | 查询交易状态 |

---

## 总结

本蓝图将 AIHunter 从「散装代码」重构为「三层架构」，核心原则：

1. **策略层** — 基于 StrategyRegistry 的策略注册机制 + 统一 SignalPayload 格式，所有策略 Worker 平等
2. **执行层** — 策略驱动的 BaseAutoTrader + SignalDispatcher + RiskMiddleware，一次实现多策略共享
3. **学习层** — 策略无关的 StrategyAgnosticLearner + LearningProfile 配置驱动，从硬编码到热拔插
4. **前端** — 策略卡片统一交互模式，每个策略同等展示、同等操作
5. **最小改动** — 不动 okx-trade.js / Agentic Wallet / profitCalc / risk_engine，只新增不删除

前次方案 B (BaseAutoTrader) 在此蓝图中成为执行层的核心组件，学习层从前次"保持不变"提升为"通用多策略框架"。

---

*文档版本: 1.0 | 最后更新: 2026-06-26T08:55+08:00 | 存档: /root/.openclaw/workspace/pm/aihunter-v3-architecture.md*
