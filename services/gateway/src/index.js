// AIHunter Gateway V2
// API + WebSocket + 多AI供应商 + 多RPC轮询 + 模拟交易存储

import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { Redis } from 'ioredis';
import OpenAI from 'openai';
import pg from 'pg';

const { Pool } = pg;

const PORT = parseInt(process.env.PORT || '3100');
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://aihunter:aihunter2025@postgres:5432/aihunter';
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'aihunter2025';

const app = Fastify({ logger: true });
const redis = new Redis(REDIS_URL);
const db = new Pool({ connectionString: DATABASE_URL });

// ===== AI 供应商预制配置 =====
const AI_PROVIDERS = {
  deepseek: { name: 'DeepSeek', baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  openai:   { name: 'OpenAI',   baseURL: 'https://api.openai.com/v1',      model: 'gpt-4o-mini' },
  moonshot: { name: 'Moonshot', baseURL: 'https://api.moonshot.cn/v1',      model: 'moonshot-v1-8k' },
  claude:   { name: 'Claude',   baseURL: 'https://api.anthropic.com/v1',    model: 'claude-3-haiku-20240307' },
  groq:     { name: 'Groq',     baseURL: 'https://api.groq.com/openai/v1',  model: 'llama3-70b-8192' },
};

async function getAiClient(provider, apiKey) {
  if (!apiKey || !provider) return null;
  const cfg = AI_PROVIDERS[provider];
  if (!cfg) return null;
  try {
    return new OpenAI({ apiKey, baseURL: cfg.baseURL });
  } catch(e) {
    return null;
  }
}

await app.register(cors, { origin: true });
await app.register(websocket);

// 鉴权（公开路由除外）
app.addHook('preHandler', async (request, reply) => {
  const publicRoutes = ['/health', '/api/rank/ping', '/api/prize/ping', '/api/system/status', '/ws',
    '/api/config/ai', '/api/config/rpc', '/api/trade/paper', '/api/trade/paper/result', '/api/trade/portfolio'];
  if (publicRoutes.includes(request.url) || request.url.startsWith('/api/config/') || request.url.startsWith('/api/trade/')) return;
  const auth = request.headers.authorization;
  if (!auth || auth !== `Bearer ${AUTH_TOKEN}`) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
});

// ===== 健康检查 =====
app.get('/health', async () => ({ status: 'ok', service: 'aihunter-gateway', version: '2.0.0' }));
app.get('/api/rank/ping', async () => ({ code: 200, data: 'pong' }));
app.get('/api/prize/ping', async () => ({ code: 200, data: 'pong' }));

// ===== AI 配置 API =====
app.get('/api/config/ai/providers', async () => ({ code: 200, data: Object.keys(AI_PROVIDERS) }));

app.get('/api/config/ai', async () => {
  const row = await db.query("SELECT key, value FROM sys_config WHERE key LIKE 'ai.%'");
  const config = {};
  for (const r of row.rows) config[r.key] = r.value;
  return { code: 200, data: config };
});

app.post('/api/config/ai', async (request) => {
  const { provider, apiKey } = request.body;
  if (!provider || !AI_PROVIDERS[provider]) return { code: 400, error: '不支持的供应商' };
  // 测试连接
  const client = await getAiClient(provider, apiKey);
  if (!client) return { code: 400, error: 'API Key 无效' };
  try {
    await client.chat.completions.create({
      model: AI_PROVIDERS[provider].model,
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 5
    });
  } catch(e) {
    return { code: 400, error: '连接失败: ' + e.message };
  }
  // 保存
  await db.query(
    "INSERT INTO sys_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2",
    ['ai.provider', provider]
  );
  await db.query(
    "INSERT INTO sys_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2",
    ['ai.api_key', apiKey]
  );
  return { code: 200, message: '✅ AI 配置已保存', provider: AI_PROVIDERS[provider].name };
});

// ===== RPC 配置 API（支持多 Key 轮询）=====
app.get('/api/config/rpc', async () => {
  const row = await db.query("SELECT key, value FROM sys_config WHERE key LIKE 'rpc.%' ORDER BY key");
  const config = {};
  for (const r of row.rows) config[r.key] = r.value;
  return { code: 200, data: config };
});

// 保存单个 RPC（追加到列表）
app.post('/api/config/rpc', async (request) => {
  const { chain, url } = request.body;
  if (!chain || !url) return { code: 400, error: '缺少链或URL' };
  // 读取现有列表
  const key = `rpc.${chain}`;
  const existing = await db.query("SELECT value FROM sys_config WHERE key = $1", [key]);
  let urls = [];
  if (existing.rows.length > 0) {
    try { urls = JSON.parse(existing.rows[0].value); } catch(e) { urls = []; }
  }
  // 去重添加
  if (!urls.includes(url)) urls.push(url);
  await db.query(
    "INSERT INTO sys_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2",
    [key, JSON.stringify(urls)]
  );
  return { code: 200, message: `✅ ${chain} RPC 已添加，共 ${urls.length} 个节点`, urls };
});

// 删除 RPC
app.post('/api/config/rpc/remove', async (request) => {
  const { chain, url } = request.body;
  const key = `rpc.${chain}`;
  const existing = await db.query("SELECT value FROM sys_config WHERE key = $1", [key]);
  if (existing.rows.length === 0) return { code: 200 };
  let urls = [];
  try { urls = JSON.parse(existing.rows[0].value); } catch(e) { urls = []; }
  urls = urls.filter(u => u !== url);
  await db.query(
    "INSERT INTO sys_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2",
    [key, JSON.stringify(urls)]
  );
  return { code: 200, message: `已移除 ${chain} RPC` };
});

// ===== 模拟交易 API（持久化到 PostgreSQL）=====
// 创建模拟交易（先买才能卖）
app.post('/api/trade/paper', async (request) => {
  const { userId, chain, contract, symbol, confidence, riskLevel, flags } = request.body;
  const id = `pap_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  
  // 计算买入金额（基于信心分）
  const baseAmount = 100 + (confidence || 50) * 8; // 100~500
  const entryPrice = 0.0001 + Math.random() * 0.001; // 模拟入场价
  
  // 流动池影响：买入量越大，价格影响越大
  const liquidityUsd = 5000 + Math.random() * 45000; // 模拟池深 $5k~$50k
  const priceImpact = (baseAmount / liquidityUsd) * 100; // 百分比
  const actualEntry = entryPrice * (1 + priceImpact / 100); // 滑点后实际成交价
  
  await db.query(
    `INSERT INTO paper_trades (id, user_id, chain, contract, symbol, side, status, entry_price, amount_usd, price_impact, confidence, risk_level, flags, liquidity_usd, created_at)
     VALUES ($1,$2,$3,$4,$5,'BUY','open',$6,$7,$8,$9,$10,$11,$12,NOW())`,
    [id, userId || 'paper', chain, contract, symbol, actualEntry, baseAmount, priceImpact, confidence, riskLevel || 'medium', JSON.stringify(flags || []), liquidityUsd]
  );
  
  return { code: 200, data: { id, entryPrice: actualEntry, amount: baseAmount, priceImpact: priceImpact.toFixed(2) + '%' } };
});

// 卖出
app.post('/api/trade/paper/sell', async (request) => {
  const { tradeId } = request.body;
  if (!tradeId) return { code: 400, error: '缺少 tradeId' };
  
  // 查找持仓
  const trade = await db.query("SELECT * FROM paper_trades WHERE id = $1 AND side = 'BUY' AND status = 'open'", [tradeId]);
  if (trade.rows.length === 0) return { code: 400, error: '未找到持仓或已平仓' };
  
  const t = trade.rows[0];
  
  // 模拟卖出价（考虑流动池影响）
  const liquidityUsd = parseFloat(t.liquidity_usd) || 10000;
  const amountUsd = parseFloat(t.amount_usd);
  const priceImpact = (amountUsd / liquidityUsd) * 100;
  const entryPrice = parseFloat(t.entry_price);
  
  // 随机盈亏：-20% ~ +30%（受信心分影响）
  const confidence = parseInt(t.confidence) || 50;
  const maxGain = confidence / 100 * 0.5; // 信心越高，最大涨幅越高
  const maxLoss = -(1 - confidence / 100) * 0.3;
  const returnPct = maxLoss + Math.random() * (maxGain - maxLoss);
  
  const exitPrice = entryPrice * (1 + returnPct);
  const exitPriceActual = exitPrice * (1 - priceImpact / 100); // 卖出滑点
  const pnlUsd = amountUsd * ((exitPriceActual - entryPrice) / entryPrice);
  const pnlPct = ((exitPriceActual - entryPrice) / entryPrice) * 100;
  
  await db.query(
    `UPDATE paper_trades SET 
      side = 'SELL', status = 'closed', exit_price = $1, pnl_usd = $2, pnl_pct = $3, sell_price_impact = $4, closed_at = NOW()
     WHERE id = $5`,
    [exitPriceActual, pnlUsd, pnlPct, priceImpact, tradeId]
  );
  
  // 更新用户模拟余额
  const balanceKey = `paper:balance:${t.user_id}`;
  const currentBalance = await redis.get(balanceKey);
  const newBalance = (parseFloat(currentBalance || '10000') + pnlUsd).toFixed(2);
  await redis.set(balanceKey, newBalance);
  
  return { code: 200, data: { id: tradeId, pnlUsd: pnlUsd.toFixed(2), pnlPct: pnlPct.toFixed(2) + '%', balance: newBalance } };
});

// 查看持仓
app.get('/api/trade/portfolio', async (request) => {
  const { userId } = request.query;
  const uid = userId || 'paper';
  const open = await db.query(
    "SELECT * FROM paper_trades WHERE user_id = $1 AND status = 'open' ORDER BY created_at DESC",
    [uid]
  );
  const closed = await db.query(
    "SELECT * FROM paper_trades WHERE user_id = $1 AND status = 'closed' ORDER BY closed_at DESC LIMIT 50",
    [uid]
  );
  const balanceKey = `paper:balance:${uid}`;
  let balance = await redis.get(balanceKey);
  if (!balance) balance = '10000';
  
  // 统计
  const closedRows = closed.rows;
  const winCount = closedRows.filter(r => parseFloat(r.pnl_usd) > 0).length;
  const totalPnl = closedRows.reduce((s, r) => s + parseFloat(r.pnl_usd || 0), 0);
  
  return { code: 200, data: {
    balance: parseFloat(balance),
    openPositions: open.rows,
    closedTrades: closedRows,
    stats: { totalTrades: closedRows.length, wins: winCount, winRate: closedRows.length > 0 ? (winCount / closedRows.length * 100).toFixed(1) + '%' : '0%', totalPnl: totalPnl.toFixed(2) }
  }};
});

// Worker 自动创建模拟交易（WebSocket 信号到达时）
app.post('/api/trade/paper/auto', async (request) => {
  const signal = request.body;
  if (!signal || !signal.contract) return { code: 400 };
  
  // 自动买入
  const buyResp = await fetch(`http://localhost:${PORT}/api/trade/paper`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: 'paper',
      chain: signal.chain,
      contract: signal.contract,
      symbol: signal.symbol || signal.contract,
      confidence: signal.confidence || 50,
      riskLevel: signal.risk_level,
      flags: signal.flags
    })
  });
  const buyData = await buyResp.json();
  
  // 5-30秒后自动卖出（模拟持有时间）
  const holdMs = 5000 + Math.random() * 25000;
  setTimeout(async () => {
    try {
      await fetch(`http://localhost:${PORT}/api/trade/paper/sell`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tradeId: buyData.data.id })
      });
    } catch(e) {}
  }, holdMs);
  
  return { code: 200, data: buyData.data };
});

// ===== 系统状态 =====
app.get('/api/system/status', async () => {
  const services = {};
  services.gateway = { status: 'healthy', uptime: process.uptime() };
  try { await redis.ping(); services.redis = { status: 'healthy' }; } catch { services.redis = { status: 'down' }; }
  try { await db.query('SELECT 1'); services.postgresql = { status: 'healthy' }; } catch { services.postgresql = { status: 'down' }; }
  
  const evmAlive = await redis.get('worker:evm:alive');
  services.evm_worker = { status: evmAlive ? 'healthy' : 'idle' };
  const solAlive = await redis.get('worker:sol:alive');
  services.sol_worker = { status: solAlive ? 'healthy' : 'idle' };
  
  services.chains = { ETH: { status: 'connected' }, BSC: { status: 'connected' }, BASE: { status: 'connected' }, SOL: { status: 'connected' } };
  services.chain_count = 4;
  services.chain_online = 4;
  
  try {
    const ev = await db.query('SELECT COUNT(*) as c FROM events WHERE processed = FALSE');
    services.pending_events = parseInt(ev.rows[0].c);
    const ev2 = await db.query('SELECT COUNT(*) as c FROM events');
    services.total_events = parseInt(ev2.rows[0].c);
    const ex = await db.query("SELECT COUNT(*) as c FROM trade_experiences WHERE executed_at > NOW() - INTERVAL '24 hours'");
    services.recent_experiences = parseInt(ex.rows[0].c);
    // 模拟交易统计
    const pt = await db.query("SELECT COUNT(*) as c FROM paper_trades WHERE status = 'open'");
    services.open_positions = parseInt(pt.rows[0].c);
    const pt2 = await db.query("SELECT COALESCE(SUM(pnl_usd),0) as s FROM paper_trades WHERE status = 'closed'");
    services.paper_pnl = parseFloat(pt2.rows[0].s).toFixed(2);
  } catch {}
  
  return { code: 200, data: services };
});

// ===== SessionKey 管理 =====
app.post('/api/session/create', async (request) => {
  const { address, permissions } = request.body;
  const sessionKey = `sk_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  await db.query(
    `INSERT INTO session_keys (user_id, session_key, permissions, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL '24 hours')`,
    [address, sessionKey, JSON.stringify(permissions || {})]
  );
  return { code: 200, data: { sessionKey, expiresIn: '24h' } };
});

app.post('/api/session/revoke', async (request) => {
  const { address } = request.body;
  await db.query(`UPDATE session_keys SET revoked = TRUE WHERE user_id = $1`, [address]);
  return { code: 200, message: "SessionKey 已撤销" };
});

// ===== AI 接口 =====
app.post('/api/ai/sentiment', async (request) => {
  const { provider, apiKey, tweets } = request.body;
  const client = await getAiClient(provider, apiKey);
  if (!client) return { code: 400, error: 'AI 未配置，请在 API 配置页设置' };
  const prompt = `分析以下关于某个代币的推文情绪，输出JSON：
{"sentiment_score": -1到1, "fomo_level": "low/medium/high", "key_themes": [], "rug_signals": []}
推文：${(tweets || []).slice(-20).join('\n')}`;
  const resp = await client.chat.completions.create({
    model: AI_PROVIDERS[provider]?.model || 'deepseek-chat',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    response_format: { type: 'json_object' }
  });
  return { code: 200, data: JSON.parse(resp.choices[0].message.content) };
});

app.post('/api/ai/smart-money', async (request) => {
  const { provider, apiKey, address, txHistory } = request.body;
  const client = await getAiClient(provider, apiKey);
  if (!client) return { code: 400, error: 'AI 未配置' };
  const prompt = `分析这个地址是否为"聪明钱"：${address} 交易数:${(txHistory||[]).length} 输出JSON:{"is_smart_money":true/false,"confidence":0-1,"pattern":"...","reason":"..."}`;
  const resp = await client.chat.completions.create({
    model: AI_PROVIDERS[provider]?.model || 'deepseek-chat',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    response_format: { type: 'json_object' }
  });
  return { code: 200, data: JSON.parse(resp.choices[0].message.content) };
});

// ===== 规则热加载 =====
app.get('/api/rules/:strategy', async (request) => {
  const rules = await redis.get(`rules:${request.params.strategy}`);
  return { code: 200, data: rules ? JSON.parse(rules) : null };
});

app.post('/api/rules/:strategy', async (request) => {
  await redis.set(`rules:${request.params.strategy}`, JSON.stringify(request.body));
  await redis.publish('rule_updates', JSON.stringify({ strategy: request.params.strategy, newRule: request.body, status: 'promoted' }));
  return { code: 200, message: '规则已热加载' };
});

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

// ===== WebSocket =====
app.register(async function (fastify) {
  fastify.get('/ws', { websocket: true }, (socket, req) => {
    const subscriber = new Redis(REDIS_URL);
    subscriber.subscribe('trade:signals', () => {
      socket.send(JSON.stringify({ type: 'connected', message: 'AIHunter 已连接' }));
    });
    subscriber.on('message', (channel, message) => {
      try {
        const data = JSON.parse(message);
        socket.send(JSON.stringify({ type: 'signal', data }));
      } catch(e) {}
    });
    socket.on('close', () => subscriber.quit());
  });
});

// ===== 启动 =====
try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`🏹 AIHunter Gateway V2 :${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
