# AIHunter - 链上交易自动化引擎

> 轻量版 | 适配 2C/2G 测试服务器
> 使用 DeepSeek API 替代本地大模型

## 架构（简化版）

```
┌───────────────┐     ┌────────────────┐     ┌─────────────────┐
│  前端 (3000)  │────►│  Gateway (3100)│────►│  Worker (3200)  │
│  Next.js 面板 │     │  Node/Fastify  │     │  Python/Polars  │
└───────────────┘     │  DeepSeek 对接 │     │  XGBoost 推理   │
                      │  规则引擎       │     │  WebSocket 监听  │
                      └────────────────┘     └─────────────────┘
                              │                        │
                              ▼                        ▼
                      ┌────────────────┐     ┌─────────────────┐
                      │  Redis (6379)  │     │  PostgreSQL      │
                      │  缓存/队列     │     │  (5432)          │
                      └────────────────┘     │  订单/事件/经验  │
                                             └─────────────────┘
```

## 技术栈

| 层 | 技术 | 说明 |
|----|------|------|
| 前端 | Next.js 14 + wagmi + viem | OKX风格交易面板 |
| 网关 | Node.js / Fastify | API + WebSocket + DeepSeek对接 |
| Worker | Python / Polars / XGBoost | 特征计算 + 风险评分 + 链上监听 |
| 学习 | Python / Optuna | 定时调优（每日凌晨） |
| 存储 | PostgreSQL 15 + Redis 7 | 持久化 + 缓存 |
| 签名 | signer-agent（Node） | SessionKey本地签名 |

## 2C/2G 资源分配

```
PostgreSQL     ~300MB
Redis          ~100MB  
Gateway        ~200MB
Worker         ~300MB  (含 XGBoost)
Signer Agent   ~50MB
───────────────
总计           ~950MB  ← 2G 绰绰有余
```

## DeepSeek API 替代方案

| 原方案 | 改为 | 说明 |
|--------|------|------|
| 本地 NLP 模型 | DeepSeek API | 社交情绪分析、聪明钱识别 |
| XGBoost 本地训练 | XGBoost 本地训练 | ✅ 保留，<1ms推理 |
| SHAP 分析 | 每周手动触发 | 计算量大，改低频 |
| Optuna 调优 | 保留，凌晨跑 | 2C也能跑，就是慢点 |
| 策略规则生成 | DeepSeek API | 从交易经验提取规则 |

## 部署

```bash
# 一键启动
cd deploy
docker compose up -d

# 查看日志
docker compose logs -f
```
