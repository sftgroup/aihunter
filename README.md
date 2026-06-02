# AIHunter - 链上交易自动化引擎

> V1.0-MVP | 非托管 · 免逐笔签名 · 多链兼容 · 自学习闭环
> 适配 2C/2G 测试服务器 | 使用 DeepSeek API

## 架构

```
Frontend (3000) → Gateway (3100) → Worker (链上监听/评分)
                    │                    │
                    ▼                    ▼
               DeepSeek API        PostgreSQL + Redis
               (情绪/聪明钱/规则)    (事件/订单/经验)
```

## 核心模块

| 模块 | 技术 | 说明 |
|------|------|------|
| 前端 | 纯静态 HTML/JS | OKX 风格面板 |
| Gateway | Node.js / Fastify | API + WebSocket + DeepSeek |
| Worker | Python / Polars / XGBoost | 特征计算 + 风险评分 |
| Learning | Python / Optuna | 自动学习调度 |
| 存储 | PostgreSQL 15 + Redis 7 | 持久化 + 缓存 |

## DeepSeek API 用途

- 社交情绪分析（替代本地 NLP）
- 聪明钱地址识别
- 策略规则自动生成
- 每日交易报告总结

## 资源占用

```
PostgreSQL ~300M + Redis ~100M + Gateway ~200M + Worker ~300M + Learning ~100M + Frontend ~30M
= 约 1GB / 2GB ✓
```

## 部署

```bash
cd deploy
echo "DEEPSEEK_API_KEY=***" > .env
docker compose up -d
```

访问 http://服务器IP:3000
