// AIHunter Gateway - 主入口
// 轻量版：API + WebSocket + DeepSeek对接 + 规则引擎

import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { Redis } from 'ioredis';
import OpenAI from 'openai';
import pg from 'pg';
import crypto from 'crypto';

const { Pool } = pg;

// ========== 配置 ==========
const PORT = parseInt(process.env.PORT || '3100');
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://aihunter:aihunter2025@localhost:5432/aihunter';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'aihunter-dev-token';

// ========== 初始化 ==========
const app = Fastify({ logger: true });
const redis = new Redis(REDIS_URL);
const db = new Pool({ connectionString: DATABASE_URL });
const deepseek = DEEPSEEK_API_KEY ? new OpenAI({ apiKey: DEEPSEEK_API_KEY, baseURL: 'https://api.deepseek.com/v1' }) : null;

// ========== 插件 ==========
await app.register(cors, { origin: true });
await app.register(websocket);

// ========== 鉴权中间件 ==========
app.addHook('preHandler', async (request, reply) => {
  // 健康检查不需要鉴权
  if (request.url === '/health') return;
  
  const auth = request.headers.authorization;
  if (!auth || auth !== `Bearer ${AUTH_TOKEN}`) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
});

// ========== API 路由 ==========

// 健康检查
app.get('/health', async () => ({ status: 'ok', service: 'aihunter-gateway' }));

// 1. 等级计算（调用 Rank & Prize Engine 或本地规则）
app.post('/api/rank/calculate', async (request) => {
  const { userId, chain } = request.body;
  // 简化版：根据直推人数和经验匹配规则
  const rule = await getMatchingRule('rank', { userId, chain });
  return { code: 200, data: { userId, rankLevel: rule?.rankLevel || 0 } };
});

// 2. 触发奖励发放
app.post('/api/prize/issue', async (request) => {
  const { goodsRecordId, buyerUserId, price } = request.body;
  // 简化版：记录订单，触发 Worker 处理
  const orderId = crypto.randomUUID();
  await redis.lpush('prize:queue', JSON.stringify({ orderId, goodsRecordId, buyerUserId, price }));
  return { code: 200, data: { orderId, status: 'queued' } };
});

// 3. DeepSeek 社交情绪分析
app.post('/api/ai/sentiment', async (request) => {
  if (!deepseek) return { code: 400, error: 'DeepSeek未配置' };
  
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

// 4. DeepSeek 聪明钱分析
app.post('/api/ai/smart-money', async (request) => {
  if (!deepseek) return { code: 400, error: 'DeepSeek未配置' };
  
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

// 5. 获取规则配置
app.get('/api/rules/:strategy', async (request) => {
  const { strategy } = request.params;
  const rules = await redis.get(`rules:${strategy}`);
  return { code: 200, data: rules ? JSON.parse(rules) : null };
});

// 6. 更新规则配置
app.post('/api/rules/:strategy', async (request) => {
  const { strategy } = request.params;
  const rules = request.body;
  await redis.set(`rules:${strategy}`, JSON.stringify(rules));
  await redis.publish('rule_updates', JSON.stringify({ strategy, newRule: rules, status: 'promoted' }));
  return { code: 200, message: '规则已更新' };
});

// 7. 提交交易经验
app.post('/api/experiences', async (request) => {
  const exp = request.body;
  exp.id = crypto.randomUUID();
  exp.executed_at = new Date();
  
  await db.query(`INSERT INTO trade_experiences (id, user_id, chain, strategy_type, mode, features_snapshot, params_used, market_context, outcome, success_label, executed_at, rule_version) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [exp.id, exp.user_id, exp.chain, exp.strategy_type, exp.mode || 'paper',
     JSON.stringify(exp.features_snapshot || {}), JSON.stringify(exp.params_used || {}),
     JSON.stringify(exp.market_context || {}), JSON.stringify(exp.outcome || {}),
     exp.success_label, exp.executed_at, exp.rule_version || 'v1']);
  
  // 通知学习器
  await redis.publish('learning:trigger', JSON.stringify({ strategy: exp.strategy_type }));
  
  return { code: 200, data: { id: exp.id } };
});

// 8. WebSocket - 实时推送
app.register(async function (fastify) {
  fastify.get('/ws', { websocket: true }, (socket, req) => {
    // 订阅 Redis 频道推送
    const subscriber = new Redis(REDIS_URL);
    
    subscriber.subscribe('trade:signals', (err) => {
      if (!err) socket.send(JSON.stringify({ type: 'connected', message: 'AIHunter WebSocket已连接' }));
    });
    
    subscriber.on('message', (channel, message) => {
      socket.send(JSON.stringify({ type: 'signal', channel, data: JSON.parse(message) }));
    });
    
    socket.on('close', () => subscriber.quit());
  });
});

// ========== 规则匹配辅助函数 ==========
async function getMatchingRule(strategy, context) {
  const cached = await redis.get(`rules:${strategy}`);
  if (cached) {
    const rules = JSON.parse(cached);
    return rules.find(r => {
      if (r.directNum && context.directCount < r.directNum) return false;
      if (r.subNum && context.teamCount < r.subNum) return false;
      return true;
    });
  }
  return null;
}

// ========== 启动 ==========
try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`🏹 AIHunter Gateway 运行在 :${PORT}`);
  console.log(`🔑 DeepSeek: ${deepseek ? '已配置 ✓' : '未配置'}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
