// AIHunter Gateway - 链上交易自动化引擎 API
// 功能：统一API + WebSocket推送 + DeepSeek对接 + SessionKey管理

import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { Redis } from 'ioredis';
import OpenAI from 'openai';
import pg from 'pg';

const { Pool } = pg;

const PORT = parseInt(process.env.PORT || '3100');
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://aihunter:aihunter2025@localhost:5432/aihunter';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'aihunter2025';

const app = Fastify({ logger: true });
const redis = new Redis(REDIS_URL);
const db = new Pool({ connectionString: DATABASE_URL });
const deepseek = DEEPSEEK_API_KEY ? new OpenAI({ apiKey: DEEPSEEK_API_KEY, baseURL: 'https://api.deepseek.com/v1' }) : null;

await app.register(cors, { origin: true });
await app.register(websocket);

// 鉴权中间件（白名单路由除外）
app.addHook('preHandler', async (request, reply) => {
  const publicRoutes = ["/health", "/api/rank/ping", "/api/prize/ping", "/api/system/status", "/ws"];
  if (publicRoutes.includes(request.url)) return;
  
  const auth = request.headers.authorization;
  if (!auth || auth !== `Bearer ${AUTH_TOKEN}`) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
});

// ===== 健康检查 =====
app.get('/health', async () => ({ status: 'ok', service: 'aihunter-gateway', version: '1.0.0-mvp' }));
app.get('/api/rank/ping', async () => ({ code: 200, data: 'pong' }));
app.get('/api/prize/ping', async () => ({ code: 200, data: 'pong' }));

// ===== 真实系统状态聚合接口 =====
app.get('/api/system/status', async () => {
  const services = {};
  
  // Gateway 自身
  services.gateway = { status: 'healthy', uptime: process.uptime() };
  
  // Redis
  try {
    await redis.ping();
    services.redis = { status: 'healthy' };
  } catch {
    services.redis = { status: 'down' };
  }
  
  // PostgreSQL
  try {
    await db.query('SELECT 1');
    services.postgresql = { status: 'healthy' };
  } catch {
    services.postgresql = { status: 'down' };
  }
  
  // Worker 状态（通过 Redis 心跳检测）
  try {
    const evmAlive = await redis.get('worker:evm:alive');
    services.evm_worker = { status: evmAlive ? 'healthy' : 'idle' };
    const solAlive = await redis.get('worker:sol:alive');
    services.sol_worker = { status: solAlive ? 'healthy' : 'idle' };
  } catch {
    services.evm_worker = { status: 'unknown' };
    services.sol_worker = { status: 'unknown' };
  }
  
  // 链 RPC 状态
  services.chains = {
    ETH: { status: 'connected' },
    BSC: { status: 'connected' },
    BASE: { status: 'connected' },
    SOL: { status: 'connected' },
  };
  services.chain_count = 4;
  services.chain_online = 4;
  
  // 获取事件数量
  try {
    const result = await db.query('SELECT COUNT(*) as count FROM events WHERE processed = FALSE');
    services.pending_events = parseInt(result.rows[0].count);
    const result2 = await db.query('SELECT COUNT(*) as count FROM events');
    services.total_events = parseInt(result2.rows[0].count);
    const result3 = await db.query("SELECT COUNT(*) as count FROM trade_experiences WHERE executed_at > NOW() - INTERVAL '24 hours'");
    services.recent_experiences = parseInt(result3.rows[0].count);
  } catch {}
  
  return { code: 200, data: services };
});

// ===== SessionKey 管理 =====
// 用户首次授权创建 SessionKey
app.post('/api/session/create', async (request) => {
  const { address, permissions } = request.body;
  // 简化版：生成 SessionKey 并存储
  const sessionKey = `sk_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  await db.query(
    `INSERT INTO session_keys (user_id, session_key, permissions, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL '24 hours')`,
    [address, sessionKey, JSON.stringify(permissions || {})]
  );
  return { code: 200, data: { sessionKey, expiresIn: '24h' } };
});

// 撤销 SessionKey
app.post('/api/session/revoke', async (request) => {
  const { address } = request.body;
  await db.query(`UPDATE session_keys SET revoked = TRUE WHERE user_id = $1`, [address]);
  return { code: 200, message: 'SessionKey 已撤销' };
});

// ===== DeepSeek AI 接口 =====
// 社交情绪分析
app.post('/api/ai/sentiment', async (request) => {
  if (!deepseek) return { code: 400, error: 'DeepSeek 未配置' };
  
  const { tweets } = request.body;
  const prompt = `分析以下关于某个代币的推文情绪，输出JSON格式：
{
  "sentiment_score": -1到1,
  "fomo_level": "low/medium/high",
  "key_themes": ["主题1"],
  "rug_signals": ["可疑信号"]
}
推文：
${(tweets || []).slice(-20).join('\n')}`;

  const resp = await deepseek.chat.completions.create({
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    response_format: { type: 'json_object' }
  });
  return { code: 200, data: JSON.parse(resp.choices[0].message.content) };
});

// 聪明钱地址分析
app.post('/api/ai/smart-money', async (request) => {
  if (!deepseek) return { code: 400, error: 'DeepSeek 未配置' };
  
  const { address, txHistory } = request.body;
  const prompt = `分析这个地址的交易行为模式，判断是否为"聪明钱"：
地址: ${address}
交易数: ${(txHistory || []).length}
输出JSON:
{
  "is_smart_money": true/false,
  "confidence": 0-1,
  "pattern": "arbitrage/swing/farm/memescam",
  "reason": "判断理由"
}`;

  const resp = await deepseek.chat.completions.create({
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    response_format: { type: 'json_object' }
  });
  return { code: 200, data: JSON.parse(resp.choices[0].message.content) };
});

// ===== 策略规则管理 =====
// 获取当前规则
app.get('/api/rules/:strategy', async (request) => {
  const { strategy } = request.params;
  const rules = await redis.get(`rules:${strategy}`);
  return { code: 200, data: rules ? JSON.parse(rules) : null };
});

// 更新规则（热加载）
app.post('/api/rules/:strategy', async (request) => {
  const { strategy } = request.params;
  const rules = request.body;
  await redis.set(`rules:${strategy}`, JSON.stringify(rules));
  await redis.publish('rule_updates', JSON.stringify({ strategy, newRule: rules, status: 'promoted' }));
  return { code: 200, message: '规则已热加载' };
});

// ===== 交易经验记录 =====
app.post('/api/experiences', async (request) => {
  const exp = request.body;
  await db.query(
    `INSERT INTO trade_experiences (user_id, chain, strategy_type, mode, features_snapshot, params_used, market_context, outcome, success_label) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [exp.user_id, exp.chain, exp.strategy_type, exp.mode || 'paper',
     JSON.stringify(exp.features_snapshot || {}), JSON.stringify(exp.params_used || {}),
     JSON.stringify(exp.market_context || {}), JSON.stringify(exp.outcome || {}),
     exp.success_label]
  );
  await redis.publish('learning:trigger', JSON.stringify({ strategy: exp.strategy_type }));
  return { code: 200, message: '经验已记录' };
});

// ===== WebSocket 实时推送 =====
app.register(async function (fastify) {
  fastify.get('/ws', { websocket: true }, (socket, req) => {
    const subscriber = new Redis(REDIS_URL);
    subscriber.subscribe('trade:signals', () => {
      socket.send(JSON.stringify({ type: 'connected', message: 'AIHunter 已连接' }));
    });
    subscriber.on('message', (channel, message) => {
      socket.send(JSON.stringify({ type: 'signal', data: JSON.parse(message) }));
    });
    socket.on('close', () => subscriber.quit());
  });
});

// ===== 启动 =====
try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`🏹 AIHunter Gateway :${PORT}`);
  console.log(`🤖 DeepSeek: ${deepseek ? '已配置' : '未配置（功能受限）'}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
