# AIHunter SaaS — 完整开发方案

> 整合日期：2026-06-27
> 作者：Wayne（评估报告 + 复用分析） + PM（任务拆解）
> 目的：将 AIHunter 从单用户交易工具升级为多用户 SaaS 策略市场

---

## 一、产品定位

链上策略市场 + 自动交易平台。策略师写策略、回测、铸造 Agent NFT 上架；交易者订阅策略、部署自动交易、坐享收益。

### 核心角色

| 角色 | 行为 | 核心需求 |
|------|------|----------|
| **策略师** | 写策略 → 回测 → 铸造 Agent NFT → 上架 → 收订阅费 | IDE + 回测引擎 + ERC-8004 铸造 |
| **交易者** | 浏览市场 → 订阅策略 → 部署交易 → 查看收益 | 一键跟单 + 自动执行 + 收益仪表盘 |

---

## 二、项目复用策略

### 复用项目清单

| 来源 | 复用内容 | 覆盖 Phase | 节省估计 |
|------|----------|-----------|----------|
| 🔥 **AItrader** (QuantDinger) | 回测引擎 + 50+策略模板 + 策略编译器 | P1 | 75% |
| 🔥 **ERC-8004** | 10合约 + 8个wagmi hooks + 市场前端 | P2+P3+P4 | 78% |
| 🔧 **PocketX** | Sidebar/ConnectModal/TopBar 布局组件 | P2 | 加速 |
| 📖 **AIOps-SaaS** | Prisma 多租户 Schema + 中间件参考 | P3+P4 | 参考 |

### 已有基础设施（不需额外开发）

| 系统 | 状态 | 覆盖 |
|------|------|------|
| **OKX Agentic Wallet** | ✅ 已接入 | 代理地址系统（TEE 签名 + 多钱包管理） |
| **OKX DEX OnchainOS** | ✅ 已接入 | AutoTrader/DeFiTrader 执行层 |
| **Redis + PostgreSQL** | ✅ 运行中 | 信号缓存 + 订阅管理存储 |
| **DeepSeek API** | ✅ 已配置 | AI 策略生成 + 自主学习 |

### 综合节省估算

| Phase | 原估人天 | 复用项目 | 新估人天 | 节省 |
|------|---------|----------|---------|------|
| **P1: 策略工作台** | 59 | AItrader（回测引擎 + 策略模板 + IDE） | ~15 | 💰 75% |
| **P2: 策略市场 + NFT** | 67 | ERC-8004（合约 hooks + 市场页） | ~15 | 💰 78% |
| **P3: 订阅 + 自动交易** | 50 | ERC-8004（支付）+ OKX Agentic Wallet（已有） | ~22 | 💰 56% |
| **P4: 评价 + 学习** | 52 | ERC-8004（评价合约）+ AIOps-SaaS | ~20 | 💰 62% |
| **总计** | **228** | — | **~72** | **💥 68%** |

---

## 三、完整任务拆解（PM）

### Phase 1 — 策略工作台 MVP（4 周 / 原估 59 人天 / 复用后 ~15 人天）

| Epic | P | Task ID | 任务描述 | 模块 | 人天 |
|------|---|---------|---------|------|------|
| E1.1 策略 IDE | P0 | P1-1.1 | 搭建策略 IDE 前端页面（/workshop 路由、分类选择页） | 前端 | 2 |
| E1.1 | P0 | P1-1.2 | 集成 Monaco Editor + Python 语法高亮与 LSP | 前端 | 3 |
| E1.1 | P0 | P1-1.3 | 实现策略分类选择组件（DEX/DeFi 二选一） | 前端 | 1 |
| E1.1 | P0 | P1-1.4 | 构建策略代码模板框架（dex/_template.py + defi/_template.py） | 后端 | 2 |
| E1.1 | P0 | P1-1.5 | 策略代码持久化存储（保存/加载/版本管理到 PostgreSQL） | 后端 | 2 |
| E1.1 | P0 | P1-1.6 | strategies 表创建 + strategy_category 枚举字段 | 后端 | 1 |
| E1.1 | P0 | P1-1.7 | 策略创建 API（POST /api/strategies） | 后端 | 2 |
| E1.1 | P0 | P1-1.8 | 策略列表/详情 API（GET /api/strategies） | 后端 | 1 |
| E1.2 AI 生成 | P0 | P1-2.1 | DeepSeek API 接入层（统一调用、Token 管理、限流） | 后端 | 2 |
| E1.2 | P0 | P1-2.2 | DEX 策略 AI 生成 prompt 模板 | 后端 | 1.5 |
| E1.2 | P0 | P1-2.3 | DeFi 策略 AI 生成 prompt 模板 | 后端 | 1.5 |
| E1.2 | P0 | P1-2.4 | AI 生成策略前端交互（自然语言→AI生成→编辑器渲染） | 前端 | 3 |
| E1.2 | P0 | P1-2.5 | AI 生成策略 API（POST /api/strategies/ai-generate） | 后端 | 2 |
| E1.3 DEX回测 | P0 | P1-3.1 | K线数据拉取模块（kline_fetcher.py：ETH/BSC/BASE/SOL） | 后端 | 3 |
| E1.3 | P0 | P1-3.2 | 回测执行核心引擎（engine.py：Bar/Tick回放+Signal输出） | 后端 | 4 |
| E1.3 | P0 | P1-3.3 | DEX 回测指标（Sharpe/MDD/胜率/盈亏比/年化收益） | 后端 | 3 |
| E1.3 | P0 | P1-3.4 | 回测报告生成（净值曲线+月度热力图+指标JSON） | 后端 | 3 |
| E1.3 | P0 | P1-3.5 | 回测运行 API（POST /api/backtest/run，异步任务+轮询） | 后端 | 3 |
| E1.3 | P0 | P1-3.6 | 回测结果前端可视化（净值曲线+热力图+指标卡片） | 前端 | 4 |
| E1.4 DeFi回测 | P0 | P1-4.1 | 链上池数据拉取模块（onchain_fetcher.py） | 后端 | 4 |
| E1.4 | P0 | P1-4.2 | DeFi 回测指标（成功率/Gas占比/资金利用率/最优规模） | 后端 | 3 |
| E1.4 | P0 | P1-4.3 | 回测 Gas 与滑点模拟 | 后端 | 2 |
| E1.4 | P0 | P1-4.4 | DeFi 回测报告前端（机会热力图+套利收益曲线） | 前端 | 3 |
| E1.5 参数扫描 | P1 | P1-5.1 | 参数网格搜索（optimizer.py：参数空间→批量回测） | 后端 | 2 |
| E1.5 | P1 | P1-5.2 | 参数优化前端 UI（参数空间配置+批量结果对比表） | 前端 | 2 |
| E1.6 我的策略 | P1 | P1-6.1 | /my-strategies 页面（DEX/DeFi分组、已发布/草稿状态） | 前端 | 3 |
| E1.6 | P1 | P1-6.2 | 回测历史记录 API（按策略ID查询所有运行记录） | 后端 | 1.5 |
| E1.6 | P1 | P1-6.3 | /workshop/backtest/:id 回测详情页 | 前端 | 2 |

> 🔧 复用提示：AItrader 回测引擎（backtest.py）直接 Docker 化，策略模板（strategy_templates.json）直接套用。仅 Monaco IDE 需从 Vue 转 React（5天）。

---

### Phase 2 — 策略市场 + Agent NFT（4 周 / 原估 67 人天 / 复用后 ~15 人天）

| Epic | P | Task ID | 任务描述 | 模块 | 人天 |
|------|---|---------|---------|------|------|
| E2.1 市场首页 | P0 | P2-1.1 | /market 市场首页（两大分类入口卡片+统计） | 前端 | 3 |
| E2.1 | P0 | P2-1.2 | 市场首页 API（GET /api/market） | 后端 | 2 |
| E2.1 | P0 | P2-1.3 | 🔥 热门策略区（按订阅数/30d收益排行） | 前端 | 1.5 |
| E2.1 | P0 | P2-1.4 | 🆕 最新上架策略区（按发布时间倒序） | 前端 | 1 |
| E2.1 | P0 | P2-1.5 | 策略卡片组件（DEX蓝/DeFi绿标签+指标+价格） | 前端 | 3 |
| E2.2 列表筛选 | P0 | P2-2.1 | /market/dex DEX 策略列表页（分页） | 前端 | 2 |
| E2.2 | P0 | P2-2.2 | /market/defi DeFi 策略列表页（分页） | 前端 | 2 |
| E2.2 | P0 | P2-2.3 | 策略列表 API（分类/链/收益/价格/评分筛选） | 后端 | 3 |
| E2.2 | P0 | P2-2.4 | 多维度筛选栏前端 | 前端 | 3 |
| E2.2 | P0 | P2-2.5 | 关键词搜索（策略名称+描述+策略师地址、全文检索） | 后端 | 2 |
| E2.2 | P0 | P2-2.6 | 搜索框前端+搜索结果页 | 前端 | 1.5 |
| E2.3 策略详情 | P0 | P2-3.1 | /market/strategy/:id 策略详情页 | 前端 | 3 |
| E2.3 | P0 | P2-3.2 | 策略详情 API（含回测报告+实时信号样例） | 后端 | 2 |
| E2.3 | P0 | P2-3.3 | 回测报告可视化嵌入详情页 | 前端 | 2 |
| E2.3 | P0 | P2-3.4 | 订阅方案展示+购买按钮 | 前端 | 2 |
| E2.4 NFT铸造 | P0 | P2-4.1 | IPFS 上传服务（策略元数据JSON→IPFS） | 后端 | 2 |
| E2.4 | P0 | P2-4.2 | IdentityRegistry 铸造交互（register with tokenURI） | 合约+前端 | 2 |
| E2.4 | P0 | P2-4.3 | SubscriptionManager 定价方案创建（createPlan） | 合约+前端 | 2 |
| E2.4 | P0 | P2-4.4 | AgentWallet 绑定（策略师接收收入） | 合约+前端 | 1 |
| E2.4 | P0 | P2-4.5 | 上架流程前端（3步向导：上传→定价→确认） | 前端 | 3 |
| E2.5 x402支付 | P0 | P2-5.1 | PaymentGateway 支付交互（createPayment with ETH/USDC） | 合约+前端 | 3 |
| E2.5 | P0 | P2-5.2 | 平台分账逻辑（5%平台+95%策略师） | 合约 | 1 |
| E2.5 | P0 | P2-5.3 | 支付状态确认+链上回执（waitForTransactionReceipt） | 前端 | 1 |
| E2.5 | P0 | P2-5.4 | 支付记录 API（查询用户支付历史） | 后端 | 1 |
| E2.6 导航整合 | P1 | P2-6.1 | 侧边栏新增入口（市场/工作台/我的策略） | 前端 | 1 |
| E2.6 | P1 | P2-6.2 | 路由守卫（未连接钱包→跳转登录） | 前端 | 1 |

> 🔧 复用提示：ERC-8004 的 marketplace/page.tsx + AgentCard.tsx + AgentList.tsx + SearchFilters.tsx 直接改造，8 个 wagmi hooks 直接搬。仅需部署 7 个扩展合约到 Sepolia（0.5天）。

---

### Phase 3 — 订阅 + 自动交易（3 周 / 原估 50 人天 / 复用后 ~22 人天）

| Epic | P | Task ID | 任务描述 | 模块 | 人天 |
|------|---|---------|---------|------|------|
| E3.1 订阅管理 | P0 | P3-1.1 | subscriptions 表创建（用户+策略+过期+自动续费） | 后端 | 1 |
| E3.1 | P0 | P3-1.2 | 订阅创建 API（POST /api/subscriptions） | 后端 | 2 |
| E3.1 | P0 | P3-1.3 | 订阅到期检查定时任务（Cron，每日扫描） | 后端 | 1 |
| E3.1 | P0 | P3-1.4 | 自动续费流程（扣款+延长+失败重试） | 后端 | 2 |
| E3.1 | P0 | P3-1.5 | /my-subscriptions 页面（活跃/到期/续费按钮） | 前端 | 3 |
| E3.1 | P0 | P3-1.6 | 订阅通知（到期前3天/当天告警） | 后端 | 1 |
| E3.2 代理地址 | P0 | P3-2.1 | OKX Agentic Wallet 多钱包创建（每订阅者×每策略一个） | 后端 | 2 |
| E3.2 | P0 | P3-2.2 | 代理地址→策略绑定关系存储 | 后端 | 1 |
| E3.2 | P0 | P3-2.3 | 资金划转（主钱包→代理地址，Gas 自动补充） | 后端 | 2 |
| E3.2 | P0 | P3-2.4 | 代理地址余额查询 API | 后端 | 1 |
| E3.3 DEX部署 | P0 | P3-3.1 | AutoTrader 订阅策略绑定（策略信号→代理地址执行） | 后端 | 3 |
| E3.3 | P0 | P3-3.2 | 选链+资金+风控配置前端 | 前端 | 2 |
| E3.3 | P0 | P3-3.3 | 部署状态+运行日志实时展示 | 前端 | 2 |
| E3.3 | P0 | P3-3.4 | 暂停/恢复/停止 AutoTrader 控制 | 后端+前端 | 2 |
| E3.4 DeFi部署 | P0 | P3-4.1 | DeFiTrader 闪电贷/跨池套利集成 | 后端 | 3 |
| E3.4 | P0 | P3-4.2 | Flashbots/MEV 防抢跑保护 | 后端 | 2 |
| E3.4 | P0 | P3-4.3 | DeFi 套利执行结果+利润报表 | 后端+前端 | 2 |
| E3.5 实盘控制台 | P0 | P3-5.1 | /live 按分类分组（DEX/DeFi 标签页） | 前端 | 2 |
| E3.5 | P0 | P3-5.2 | 实时交易流 WebSocket（Signal→Order→Fill→PnL） | 后端+前端 | 3 |
| E3.5 | P0 | P3-5.3 | 策略运行状态监控面板（在线/暂停/异常） | 前端 | 2 |

> 🔧 复用提示：OKX Agentic Wallet 已有（TEE+多链+签名），ERC-8004 PaymentGateway+SubscriptionManager 合约已有。仅需做绑定层。

---

### Phase 4 — 评价 + 学习 + 运营（3 周 / 原估 52 人天 / 复用后 ~20 人天）

| Epic | P | Task ID | 任务描述 | 模块 | 人天 |
|------|---|---------|---------|------|------|
| E4.1 评价系统 | P0 | P4-1.1 | ReputationRegistry 评分交互（rateAgent 0-100） | 合约+前端 | 2 |
| E4.1 | P0 | P4-1.2 | 文字评价上传（IPFS 存储评价JSON） | 后端 | 2 |
| E4.1 | P0 | P4-1.3 | 策略详情页评价区（评分+评价列表+分页） | 前端 | 3 |
| E4.1 | P0 | P4-1.4 | 评价回复+举报功能 | 前端+后端 | 2 |
| E4.2 策略师面板 | P0 | P4-2.1 | /my-strategies 增强（DEX/DeFi收入分组统计） | 前端 | 3 |
| E4.2 | P0 | P4-2.2 | 订阅者管理（列表+到期状态+订阅历史） | 后端+前端 | 2 |
| E4.2 | P0 | P4-2.3 | 收入仪表盘（日/周/月/累计 + 图表） | 前端 | 3 |
| E4.2 | P0 | P4-2.4 | 策略表现报表（Sharpe/MDD/收益 vs 基准） | 后端+前端 | 2 |
| E4.3 自主学习 | P0 | P4-3.1 | Optuna 参数优化集成（回测结果→自动调参） | 后端 | 3 |
| E4.3 | P0 | P4-3.2 | 优化结果通知（Redis→策略师+订阅者） | 后端 | 1 |
| E4.3 | P0 | P4-3.3 | 学习日志展示前端（优化历史+参数对比） | 前端 | 2 |
| E4.4 运营后台 | P1 | P4-4.1 | /admin 运营后台（策略/用户/交易数据大盘） | 前端 | 4 |
| E4.4 | P1 | P4-4.2 | 策略审核管理（上架/下架/冻结） | 后端+前端 | 3 |
| E4.4 | P1 | P4-4.3 | 用户管理（列表+角色+禁用） | 后端+前端 | 2 |
| E4.4 | P1 | P4-4.4 | 灰度开关（功能开关+分用户组） | 后端 | 2 |
| E4.4 | P1 | P4-4.5 | 收入报表+分账对账 | 后端+前端 | 2 |
| E4.5 集成上线 | P0 | P4-5.1 | 统一导航+路由整合 | 前端 | 2 |
| E4.5 | P0 | P4-5.2 | 生产环境部署（Docker Compose + nginx + SSL） | 基础设施 | 3 |
| E4.5 | P0 | P4-5.3 | 监控告警（Prometheus + Grafana + 飞书通知） | 基础设施 | 2 |

> 🔧 复用提示：ERC-8004 ReputationRegistry 已部署 Sepolia，RevenueDisplay.tsx 组件可直接搬。

---

## 四、任务总览

| 维度 | 数据 |
|------|------|
| 总工期 | **14 周 / 4 个 Phase** |
| 总任务 | **82 个 Task**（P0: 62, P1: 20） |
| 原估总人天 | **228 人天** |
| 复用后总人天 | **~72 人天** |
| 节省比例 | **68%** |
| 涉及模块 | 前端 35% / 后端 40% / 合约 10% / 基础设施 15% |

---

## 五、关键技术决策

| 决策 | 选型 | 原因 |
|------|------|------|
| 策略源代码语言 | Python | 策略师最熟悉，AIHunter 现有 Worker 用 Python |
| 策略编辑器 | Monaco Editor | VS Code 同款，成熟稳定 |
| 策略元数据存储 | IPFS | 去中心化永久存储，ERC-8004 要求 |
| Agent 身份 | ERC-8004（ERC-721） | 10 合约已部署 Sepolia，生态现成 |
| 支付协议 | x402（PaymentGateway） | 支持订阅/用量/一次性/托管 4 种模式 |
| 支付代币 | ETH + USDC | 链上最主流 |
| 代理地址 | OKX Agentic Wallet（TEE） | 私钥不泄露，TEE 签名，20+ 链 |
| DEX 聚合 | OKX DEX OnchainOS | 500+ DEX，最优路由 |
| 前端框架 | React + TypeScript + Vite | 现有 AIHunter 技术栈 |
| wagmi 版本 | v2 | 与 ERC-8004 / PocketX 统一 |

---

## 六、开发路线图

```
Week 1-4:   Phase 1 ── 策略工作台（IDE + AI生成 + 回测引擎）
Week 5-8:   Phase 2 ── 策略市场 + Agent NFT（市场 + 铸造 + 支付）
Week 9-11:  Phase 3 ── 订阅 + 自动交易（订阅管理 + 代理地址 + AutoTrader）
Week 12-14: Phase 4 ── 评价 + 学习 + 运营（评价上链 + Optuna + 管理后台）
```

---

## 七、参考资源

| 资源 | 链接 |
|------|------|
| PRD 文档 | https://www.feishu.cn/docx/AOStdIY6xokuxexeitGcezNrn4c |
| 代码复用评估 | https://www.feishu.cn/docx/FMupdtpL1o5kO6x4cxCcbPMGngb |
| ERC-8004 合约 | https://github.com/sftgroup/erc8004 |
| AItrader 回测引擎 | https://github.com/sftgroup/AItrader |
| PocketX 前端 | https://github.com/sftgroup/pocketX |
| AIOps-SaaS 架构 | https://github.com/sftgroup/aiops-saas |
| AIHunter 现有代码 | https://github.com/sftgroup/aihunter |
