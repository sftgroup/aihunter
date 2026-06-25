# AIHunter - 链上交易自动化引擎

> V2.0-MVP | 动量突破策略 · OKX Agentic Wallet · 自动学习 · 多链实盘交易
> 适配 2C/2G 测试服务器 | DeepSeek + onchainos CLI

## 架构

```
┌──────────────┐     ┌─────────────────────────────────────────┐
│  Frontend    │────▶│  Gateway (3100)                          │
│  React/TS    │     │  Fastify + WebSocket + DeepSeek          │
│  纯前端 SPA  │     │  ┌─────────────────────────────────────┐│
└──────────────┘     │  │ AutoTrader — 自动交易引擎           ││
                     │  │ 信号→风控→执行→记录→广播            ││
                     │  └─────────────────────────────────────┘│
                     │  ┌─────────────────────────────────────┐│
                     │  │ OKX Agentic Wallet (onchainos CLI)  ││
                     │  │ login → verify → balance → swap     ││
                     │  └─────────────────────────────────────┘│
                     └───────────┬─────────────────────────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
              PostgreSQL    Redis 7      onchainos CLI
              (持久化)      (缓存/队列)   (Agentic Wallet)
```

## 核心模块

| 模块 | 技术 | 说明 |
|------|------|------|
| 前端 | React + TypeScript + Recharts | 玻璃拟态 UI，实盘面板 + 信号流 + 图表 |
| Gateway | Node.js / Fastify | API + WebSocket + AutoTrader + OKX Wallet CLI |
| Worker | Python / Polars / XGBoost | 特征计算 + 风险评分 |
| Learning | Python / Optuna | 自动学习调度 + 参数优化 |
| 存储 | PostgreSQL 15 + Redis 7 | 持久化 + 缓存 + 消息队列 |

## 实盘交易 (Live Trading)

### 策略: 动量突破 (Momentum Breakout)
- **数据源**: OKX OnchainOS DEX 聚合 API
- **信号筛选**: 放量突破 + 交易活跃度 + 安全评分
- **风控**: 每日亏损限额 / 最大持仓数 / 滑点保护
- **自动学习**: Learning 服务每 5 分钟分析交易结果，自动调整参数

### OKX Agentic Wallet 对接
- **方式**: `onchainos` CLI（非 REST API）
- **流程**: 邮箱登录 → OTP 验证 → 创建 TEE 钱包 → 自动签名
- **安全**: TEE (Trusted Execution Environment) 硬件隔离，一次授权持续交易
- **命令**: `wallet login`, `wallet verify`, `wallet balance`, `wallet status`

### API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/agentic-wallet/login` | 发送 OTP 到邮箱 |
| POST | `/api/agentic-wallet/verify` | 验证 OTP + 创建钱包 + 查余额 |
| GET | `/api/agentic-wallet/status` | 实时钱包状态和余额 |
| POST | `/api/agentic-wallet/revoke` | 撤销钱包授权 |
| GET | `/api/live-trading/config` | 获取实盘配置 |
| POST | `/api/live-trading/config` | 保存实盘配置 |
| GET | `/api/live-trading/params` | 获取学习参数（含差异对比）|
| POST | `/api/live-trading/start` | 启动自动交易 |
| POST | `/api/live-trading/stop` | 停止自动交易 |
| GET | `/api/live-trading/status` | 交易状态 + 今日统计 |
| GET | `/api/live-trading/trades` | 交易历史（分页）|
| GET | `/api/live-trading/chart/pnl` | 盈亏曲线 |
| GET | `/api/live-trading/chart/distribution` | 盈亏分布 |
| GET | `/api/live-trading/chart/assets` | 资产变化 |
| GET | `/api/live-trading/chart/tokens` | Token 盈亏排行 |

## 开发团队 (AI Agent 协作)

| 角色 | Agent | 职责 |
|------|-------|------|
| 行政助理 | Wayne | 架构设计 · 任务分配 · Bug修复 · 运维部署 |
| 产品经理 | PM | PRD · 需求拆解 · 验收标准 |
| 前端开发 | frontend-dev | React/TypeScript 新功能开发 |
| 后端开发 | backend-dev | Fastify/API 新功能开发 |
| 自动化测试 | tester | E2E / 单元测试 |
| 质量保证 | QA | Bug诊断 · L1+L2 代码审查 |
| 安全审查 | security | L3+L4 深度审查 · 安全扫描 |

## 部署

### 前置条件
- Docker + Docker Compose
- Node.js 20+（仅前端构建）
- `onchainos` CLI (容器构建时自动安装)

### 快速启动

```bash
# 1. 克隆仓库
git clone https://github.com/sftgroup/aihunter.git
cd aihunter

# 2. 配置环境变量
cp .env.example deploy/.env
# 编辑 deploy/.env，设置 DEEPSEEK_API_KEY 和 REDIS_PASSWORD

# 3. 启动所有服务
cd deploy
docker compose up -d

# 4. 访问
# 前端: http://服务器IP:3000
# Gateway: http://服务器IP:3100
```

### 前端开发

```bash
npm install
npm run dev     # Vite 开发服务器
npm run build   # 生产构建 → dist/
```

### 6 个 Docker 容器

| 容器 | 端口 | 说明 |
|------|------|------|
| aihunter-db | 5432 | PostgreSQL 15 |
| aihunter-redis | 6379 | Redis 7 |
| aihunter-gateway | 3100 | Fastify API + AutoTrader + OKX CLI |
| aihunter-worker | — | Python 链上监听 + 评分 |
| aihunter-learning | — | Python Optuna 自动学习 |
| aihunter-frontend | 3000 | Nginx 静态文件服务 |

## 项目状态

- ✅ 动量突破策略引擎
- ✅ OKX OnchainOS DEX 聚合
- ✅ OKX Agentic Wallet CLI 集成
- ✅ 自动交易执行循环 (AutoTrader)
- ✅ AI 自学习参数优化
- ✅ WebSocket 实时信号推送
- ✅ 前端玻璃拟态 UI 面板
- ⬜ 端到端实盘测试（等待钱包创建）

## License

Proprietary — sftgroup 2025-2026
