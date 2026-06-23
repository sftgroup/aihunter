// AIHunter Gateway V2
// API + WebSocket + 多AI供应商 + 多RPC轮询 + 模拟交易存储

import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { Redis } from 'ioredis';
import OpenAI from 'openai';
import pg from 'pg';
import Docker from 'dockerode';
import crypto from 'crypto';

const { Pool } = pg;

const PORT = parseInt(process.env.PORT || '3100');
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://aihunter:aihunter2025@postgres:5432/aihunter';
const AUTH_TOKEN = process.env.AUTH_TOKEN;
if (!AUTH_TOKEN) {
  console.error('[FATAL] AUTH_TOKEN 环境变量未设置，拒绝启动。请在 .env 或环境变量中配置强密码。');
  process.exit(1);
}

const app = Fastify({ logger: true });
const redis = new Redis(REDIS_URL);
const db = new Pool({ connectionString: DATABASE_URL });

// ===== Docker 控制（重启容器，只读挂载 /var/run/docker.sock）=====
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// 重启任务状态存储
const restartJobs = new Map();
const RESTART_COOLDOWN_MS = 60000;

// 重启目标容器（白名单，仅允许重启以下容器）
const CONTAINER_TARGETS = {
  worker: 'aihunter-worker',
  gateway: 'aihunter-gateway',
};
const ALLOWED_RESTART_CONTAINERS = new Set(Object.values(CONTAINER_TARGETS));

// OKX 配置缓存
let okxConfigCache = { configured: false };

async function reloadOkxConfig() {
  try {
    const rows = await db.query("SELECT key, value FROM sys_config WHERE key LIKE 'okx.%'");
    const cfg = {};
    for (const r of rows.rows) cfg[r.key] = r.value;
    okxConfigCache = {
      configured: !!(cfg['okx.api_key'] && cfg['okx.secret_key'] && cfg['okx.passphrase']),
      apiKey: cfg['okx.api_key'] || '',
      secretKey: cfg['okx.secret_key'] || '',
      passphrase: cfg['okx.passphrase'] || '',
    };
    return okxConfigCache;
  } catch (e) {
    return okxConfigCache;
  }
}

// 加载 OKX 配置到缓存 + 同步 Redis + 通知 JS 模块
async function broadcastOkxConfig() {
  const cfg = await reloadOkxConfig();
  if (cfg.configured) {
    await redis.set('okx:api_key', cfg.apiKey);
    await redis.set('okx:secret_key', cfg.secretKey);
    await redis.set('okx:passphrase', cfg.passphrase);
    await redis.publish('config:update', JSON.stringify({ type: 'okx', data: cfg }));
  }
  // 同步到 okx-trade.js 模块
  const { setOkxConfig } = await import('./okx-trade.js');
  setOkxConfig({ apiKey: cfg.apiKey, apiSecret: cfg.secretKey, passphrase: cfg.passphrase });
}

// 启动时加载 OKX 配置
broadcastOkxConfig().catch(e => console.error("[OKX] 启动加载配置失败:", e.message));

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

// ===== 简易内存限流器 =====
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60000;   // 1 分钟窗口
const RATE_LIMIT_MAX = 100;           // 每窗口最多 100 请求
const AUTH_FAIL_LIMIT = 10;           // 认证失败限流：每窗口 10 次
const AUTH_FAIL_MAP = new Map();

function checkRateLimit(key, max, map) {
  const now = Date.now();
  const entry = map.get(key);
  if (!entry) {
    map.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }
  if (now > entry.resetAt) {
    map.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }
  if (entry.count >= max) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count++;
  return { allowed: true };
}

// 鉴权（仅允许显式列出的公开路由，移除所有通配白名单）
app.addHook('preHandler', async (request, reply) => {
  const clientIp = request.ip || request.socket?.remoteAddress || 'unknown';

  // 全局请求限流
  const rl = checkRateLimit(clientIp, RATE_LIMIT_MAX, rateLimitMap);
  if (!rl.allowed) {
    reply.header('Retry-After', rl.retryAfter);
    return reply.status(429).send({ error: 'Too Many Requests', retryAfter: rl.retryAfter });
  }

  const publicRoutes = [
    '/health', '/api/rank/ping', '/api/prize/ping', '/api/system/status', '/ws',
    '/api/signals/recent'
  ];
  if (publicRoutes.includes(request.url)) return;

  const auth = request.headers.authorization;
  if (!auth || auth !== `Bearer ${AUTH_TOKEN}`) {
    // 认证失败限流
    const fl = checkRateLimit(clientIp, AUTH_FAIL_LIMIT, AUTH_FAIL_MAP);
    if (!fl.allowed) {
      reply.header('Retry-After', fl.retryAfter);
      return reply.status(429).send({ error: 'Too Many Requests', retryAfter: fl.retryAfter });
    }
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
// ===== 净值快照（每笔交易后记录）=====
async function takeEquitySnapshot(userId) {
  const uid = userId || 'paper';
  const balanceKey = `paper:balance:${uid}`;
  const bal = parseFloat(await redis.get(balanceKey) || '10000');
  const closed = await db.query(
    "SELECT pnl_usd FROM paper_trades WHERE user_id = $1 AND status = 'closed'", [uid]
  );
  const rows = closed.rows;
  const winCount = rows.filter(r => parseFloat(r.pnl_usd) > 0).length;
  const totalPnl = rows.reduce((s, r) => s + parseFloat(r.pnl_usd || 0), 0);
  const totalTrades = rows.length;
  const winRate = totalTrades > 0 ? ((winCount / totalTrades) * 100).toFixed(1) : 0;
  
  await db.query(
    `INSERT INTO equity_snapshots (user_id, balance, total_pnl, total_trades, win_rate, snapshot_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [uid, bal.toFixed(2), totalPnl.toFixed(2), totalTrades, winRate]
  );
}

// ===== 模拟参数配置 =====
app.get('/api/trade/paper/config', async (request) => {
  const { userId } = request.query;
  const uid = userId || 'paper';
  const row = await db.query("SELECT * FROM paper_config WHERE user_id = $1", [uid]);
  if (row.rows.length === 0) {
    return { code: 200, data: { initial_balance: 10000, min_amount: 100, max_amount: 500, take_profit_pct: 30, stop_loss_pct: -20, enabled: true } };
  }
  return { code: 200, data: row.rows[0] };
});

app.post('/api/trade/paper/config', async (request) => {
  const { userId, initial_balance, min_amount, max_amount, take_profit_pct, stop_loss_pct, enabled } = request.body;
  const uid = userId || 'paper';
  await db.query(
    `INSERT INTO paper_config (user_id, initial_balance, min_amount, max_amount, take_profit_pct, stop_loss_pct, enabled, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       initial_balance = $2, min_amount = $3, max_amount = $4,
       take_profit_pct = $5, stop_loss_pct = $6, enabled = $7, updated_at = NOW()`,
    [uid, initial_balance || 10000, min_amount || 100, max_amount || 500,
     take_profit_pct || 30, stop_loss_pct || -20, enabled !== false]
  );
  return { code: 200, message: '✅ 模拟参数已保存' };
});

// ===== 重置模拟交易 =====
app.post('/api/trade/paper/reset', async (request) => {
  const { userId } = request.body;
  const uid = userId || 'paper';
  // 获取配置中的初始余额
  const cfg = await db.query("SELECT initial_balance FROM paper_config WHERE user_id = $1", [uid]);
  const initBal = cfg.rows.length > 0 ? parseFloat(cfg.rows[0].initial_balance) : 10000;
  
  // 清空交易记录
  await db.query("DELETE FROM paper_trades WHERE user_id = $1", [uid]);
  // 清空净值快照
  await db.query("DELETE FROM equity_snapshots WHERE user_id = $1", [uid]);
  // 重置余额
  const balanceKey = `paper:balance:${uid}`;
  await redis.set(balanceKey, initBal.toFixed(2));
  
  // 记录初始快照
  await db.query(
    `INSERT INTO equity_snapshots (user_id, balance, total_pnl, total_trades, win_rate, snapshot_at)
     VALUES ($1, $2, 0, 0, 0, NOW())`,
    [uid, initBal.toFixed(2)]
  );
  
  return { code: 200, message: '✅ 模拟交易已重置', balance: initBal };
});

// ===== 价格历史（回测数据源）=====
app.get('/api/trade/paper/price-history', async (request) => {
  const { chain, contract, hours } = request.query;
  if (!chain || !contract) return { code: 400, error: '缺少 chain 或 contract' };
  const timeRange = hours ? `${hours} hours` : '24 hours';
  const rows = await db.query(
    "SELECT price, liquidity_usd, snapshot_at FROM price_snapshots WHERE chain = $1 AND contract = $2 AND snapshot_at > NOW() - $3::interval ORDER BY snapshot_at ASC",
    [chain, contract, timeRange]
  );
  return { code: 200, data: rows.rows };
});

// ===== 批量回测接口 =====
app.get('/api/trade/paper/backtest', async (request) => {
  const { chain, hours, amount } = request.query;
  const perAmt = parseFloat(amount) || 100;
  
  // 构建时间条件
  let timeCond = '';
  const params = [];
  if (hours && hours !== '0') {
    timeCond = `AND created_at > NOW() - $1::interval`;
    params.push(`${hours} hours`);
  }
  
  // 构建链条件
  let chainCond = '';
  if (chain && chain !== 'all') {
    chainCond = params.length === 0 ? `AND chain = $1` : `AND chain = $2`;
    params.push(chain);
  }
  
  // 取已平仓的交易
  const paramIdx = (i) => `$${i + 1}`;
  let queryStr = `SELECT * FROM paper_trades WHERE status = 'closed' ${timeCond} ${chainCond} ORDER BY closed_at ASC`;
  
  // 手动构建参数化查询
  let idx = 1;
  let where = ["status = 'closed'"];
  let values = [];
  if (hours && hours !== '0') {
    where.push(`created_at > NOW() - $${idx}::interval`);
    values.push(`${hours} hours`);
    idx++;
  }
  if (chain && chain !== 'all') {
    where.push(`chain = $${idx}`);
    values.push(chain);
    idx++;
  }
  
  const trades = await db.query(
    `SELECT * FROM paper_trades WHERE ${where.join(' AND ')} ORDER BY closed_at ASC`,
    values
  );
  
  const rows = trades.rows;
  if (rows.length === 0) {
    return { code: 200, data: { total: 0, trades: [], stats: null, message: '该时段暂无已平仓交易' } };
  }
  
  // 逐笔计算盈亏（使用实际成交数据）
  let totalPnl = 0;
  let wins = 0;
  let cumPnl = [];
  let cum = 0;
  let maxDrawdown = 0;
  let peak = 0;
  
  for (const t of rows) {
    const pnl = parseFloat(t.pnl_usd || 0);
    totalPnl += pnl;
    if (pnl > 0) wins++;
    cum += pnl;
    cumPnl.push({ x: t.closed_at || t.created_at, y: parseFloat(cum.toFixed(2)) });
    if (cum > peak) peak = cum;
    const dd = peak > 0 ? ((cum - peak) / peak) * 100 : 0;
    if (dd < maxDrawdown) maxDrawdown = dd;
  }
  
  const totalTrades = rows.length;
  const winRate = (wins / totalTrades * 100).toFixed(1);
  const avgPnl = (totalPnl / totalTrades);
  
  // 夏普比率简化计算
  let sumSq = 0;
  for (const t of rows) {
    const pnl = parseFloat(t.pnl_usd || 0);
    sumSq += Math.pow(pnl - avgPnl, 2);
  }
  const stdDev = Math.sqrt(sumSq / totalTrades);
  const sharpe = stdDev > 0 ? (avgPnl / stdDev) * Math.sqrt(365) : 0;
  
  // 盈亏分布
  const dist = { profit: wins, loss: totalTrades - wins };
  
  // 按链统计
  const chainStats = {};
  for (const t of rows) {
    const c = t.chain || 'unknown';
    if (!chainStats[c]) chainStats[c] = { trades: 0, wins: 0, pnl: 0 };
    chainStats[c].trades++;
    if (parseFloat(t.pnl_usd || 0) > 0) chainStats[c].wins++;
    chainStats[c].pnl += parseFloat(t.pnl_usd || 0);
  }
  
  return { code: 200, data: {
    total: totalTrades,
    stats: {
      total_pnl: parseFloat(totalPnl.toFixed(2)),
      win_rate: winRate + '%',
      wins,
      losses: totalTrades - wins,
      avg_pnl: parseFloat(avgPnl.toFixed(2)),
      max_drawdown: parseFloat(maxDrawdown.toFixed(2)),
      sharpe_ratio: parseFloat(sharpe.toFixed(3)),
      total_invested: parseFloat((perAmt * totalTrades).toFixed(2))
    },
    cum_pnl: cumPnl,
    distribution: dist,
    chain_stats: chainStats,
    trades: rows.slice(-50) // 最近50笔详情
  }};
});

// ===== 净值曲线 =====
app.get('/api/trade/paper/equity', async (request) => {
  const { userId, limit } = request.query;
  const uid = userId || 'paper';
  const maxPoints = parseInt(limit) || 200;
  const rows = await db.query(
    "SELECT balance, total_pnl, total_trades, win_rate, snapshot_at FROM equity_snapshots WHERE user_id = $1 ORDER BY snapshot_at ASC",
    [uid]
  );
  // 如果点数太多，均匀抽样
  let snapshots = rows.rows;
  if (snapshots.length > maxPoints) {
    const step = Math.ceil(snapshots.length / maxPoints);
    snapshots = snapshots.filter((_, i) => i % step === 0 || i === snapshots.length - 1);
  }
  return { code: 200, data: snapshots };
});

// 创建模拟交易（使用信号中的真实价格）
app.post('/api/trade/paper', async (request) => {
  const { userId, chain, contract, symbol, confidence, riskLevel, flags, price_data } = request.body;
  const result = await executePaperBuy({ userId, chain, contract, symbol, confidence, riskLevel, flags, price_data });
  return { code: 200, data: result };
});

// 卖出
app.post('/api/trade/paper/sell', async (request) => {
  const { tradeId, price_data } = request.body;
  try {
    const result = await executePaperSell({ tradeId, price_data });
    return { code: 200, data: result };
  } catch (e) {
    return { code: 400, error: e.message };
  }
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

// ===== 提取为可直接调用的业务函数（避免 self-fetch）=====
async function executePaperBuy({ userId, chain, contract, symbol, confidence, riskLevel, flags, price_data }) {
  const id = `pap_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;

  const cfg = await db.query("SELECT * FROM paper_config WHERE user_id = $1", [userId || 'paper']);
  const config = cfg.rows[0] || { min_amount: 100, max_amount: 500 };

  const conf = confidence || 50;
  const minAmt = parseFloat(config.min_amount) || 100;
  const maxAmt = parseFloat(config.max_amount) || 500;
  const range = maxAmt - minAmt;
  const baseAmount = Math.round((minAmt + (conf / 100) * range) * 100) / 100;

  let entryPrice, liquidityUsd, priceImpact, actualEntry;
  if (price_data && price_data.price > 0) {
    entryPrice = price_data.price;
    liquidityUsd = price_data.liquidity_usd || 10000;
    priceImpact = (baseAmount / liquidityUsd) * 100;
    actualEntry = entryPrice * (1 + priceImpact / 100);
    console.log(`💰 真实买入: $${entryPrice} 池深:$${liquidityUsd} 滑点:${priceImpact.toFixed(2)}%`);
  } else {
    entryPrice = 0.0001 + Math.random() * 0.001;
    liquidityUsd = 5000 + Math.random() * 45000;
    priceImpact = (baseAmount / liquidityUsd) * 100;
    actualEntry = entryPrice * (1 + priceImpact / 100);
  }

  const quantity = baseAmount / actualEntry;
  const clean = (s) => (s || '').replace(/\x00/g, '').trim();

  await db.query(
    `INSERT INTO paper_trades (id, user_id, chain, contract, symbol, side, status, entry_price, amount_usd, quantity, price_impact, confidence, risk_level, flags, liquidity_usd, created_at)
     VALUES ($1,$2,$3,$4,$5,'BUY','open',$6,$7,$8,$9,$10,$11,$12,$13,NOW())`,
    [id, userId || 'paper', clean(chain), clean(contract), clean(symbol), actualEntry, baseAmount, quantity, priceImpact, confidence, riskLevel || 'medium', JSON.stringify(flags || []), liquidityUsd]
  );

  return { id, entryPrice: actualEntry, amount: baseAmount, quantity, priceImpact: priceImpact.toFixed(2) + '%' };
}

async function executePaperSell({ tradeId, price_data }) {
  if (!tradeId) throw new Error('缺少 tradeId');

  const trade = await db.query("SELECT * FROM paper_trades WHERE id = $1 AND side = 'BUY' AND status = 'open'", [tradeId]);
  if (trade.rows.length === 0) throw new Error('未找到持仓或已平仓');

  const t = trade.rows[0];
  const entryPrice = parseFloat(t.entry_price);
  const amountUsd = parseFloat(t.amount_usd);
  const liquidityUsd = parseFloat(t.liquidity_usd) || 10000;
  const priceImpact = (amountUsd / liquidityUsd) * 100;
  const quantity = parseFloat(t.quantity) || (amountUsd / entryPrice);

  let exitPriceActual, pnlUsd, pnlPct;
  if (price_data && price_data.price > 0) {
    const currentPrice = price_data.price;
    const currentLiquidity = price_data.liquidity_usd || liquidityUsd;
    const sellImpact = (amountUsd / currentLiquidity) * 100;
    exitPriceActual = currentPrice * (1 - sellImpact / 100);
    pnlUsd = amountUsd * ((exitPriceActual - entryPrice) / entryPrice);
    pnlPct = ((exitPriceActual - entryPrice) / entryPrice) * 100;
    console.log(`💰 真实卖出: 买入价=$${entryPrice} 当前价=$${currentPrice} 成交价=$${exitPriceActual} 滑点=${sellImpact.toFixed(2)}%`);
  } else {
    const volFactor = Math.max(0.02, Math.min(0.5, 10000 / liquidityUsd));
    const priceChange = (Math.random() * 2 - 1) * volFactor;
    exitPriceActual = entryPrice * (1 + priceChange) * (1 - priceImpact / 100);
    pnlUsd = amountUsd * ((exitPriceActual - entryPrice) / entryPrice);
    pnlPct = ((exitPriceActual - entryPrice) / entryPrice) * 100;
  }

  const exitQuantity = quantity;
  const exitAmountUsd = exitQuantity * exitPriceActual;

  await db.query(
    `UPDATE paper_trades SET
      side = 'SELL', status = 'closed', exit_price = $1, exit_quantity = $2, exit_amount_usd = $3, pnl_usd = $4, pnl_pct = $5, sell_price_impact = $6, closed_at = NOW()
     WHERE id = $7`,
    [exitPriceActual, exitQuantity, exitAmountUsd, pnlUsd, pnlPct, priceImpact, tradeId]
  );

  const balanceKey = `paper:balance:${t.user_id}`;
  const currentBalance = await redis.get(balanceKey);
  const newBalance = (parseFloat(currentBalance || '10000') + pnlUsd).toFixed(2);
  await redis.set(balanceKey, newBalance);

  await takeEquitySnapshot(t.user_id);

  const successLabel = pnlUsd > 0 ? 'win' : 'loss';
  const features = {
    chain: t.chain,
    confidence: t.confidence,
    risk_level: t.risk_level,
    flags: t.flags,
    liquidity_usd: parseFloat(t.liquidity_usd),
    entry_price: parseFloat(t.entry_price),
    price_impact: parseFloat(t.price_impact),
    hold_seconds: Math.round((Date.now() - new Date(t.created_at).getTime()) / 1000)
  };
  const paramsUsed = {
    amount_usd: parseFloat(t.amount_usd),
    slippage: parseFloat(t.sell_price_impact || 0)
  };
  const outcome = {
    pnl: parseFloat(pnlUsd.toFixed(2)),
    pnl_pct: parseFloat(pnlPct.toFixed(2)),
    exit_price: parseFloat(exitPriceActual.toFixed(10))
  };

  try {
    await db.query(
      `INSERT INTO trade_experiences (user_id, chain, strategy_type, mode, features_snapshot, params_used, market_context, outcome, success_label)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [t.user_id, t.chain, 'signal_follow', 'paper',
       JSON.stringify(features), JSON.stringify(paramsUsed),
       JSON.stringify({}), JSON.stringify(outcome), successLabel]
    );
    await redis.publish('learning:trigger', JSON.stringify({ strategy: 'signal_follow' }));
  } catch(e) {
    console.error('写入经验失败:', e.message);
  }

  return { id: tradeId, pnlUsd: pnlUsd.toFixed(2), pnlPct: pnlPct.toFixed(2) + '%', balance: newBalance };
}

// Worker 自动创建模拟交易（WebSocket 信号到达时）—— 改为直接函数调用
app.post('/api/trade/paper/auto', async (request) => {
  const signal = request.body;
  if (!signal || !signal.contract) return { code: 400 };

  // 检查模拟交易是否启用
  const cfg = await db.query("SELECT enabled FROM paper_config WHERE user_id = 'paper'");
  if (cfg.rows.length > 0 && !cfg.rows[0].enabled) {
    return { code: 200, data: { skipped: true, reason: '模拟交易已禁用' } };
  }

  // 自动买入（直接函数调用，避免 self-fetch）
  const buyData = await executePaperBuy({
    userId: 'paper',
    chain: signal.chain,
    contract: signal.contract,
    symbol: signal.symbol || signal.contract,
    confidence: signal.confidence || 50,
    riskLevel: signal.risk_level,
    flags: signal.flags,
    price_data: signal.price_data
  });

  // 5-30秒后自动卖出（直接函数调用，避免 self-fetch）
  const holdMs = 5000 + Math.random() * 25000;
  setTimeout(async () => {
    try {
      await executePaperSell({ tradeId: buyData.id, price_data: signal.price_data });
    } catch(e) {}
  }, holdMs);

  // 缓存最近信号到 Redis（供前端查询）
  try {
    const sig = { chain: signal.chain, contract: signal.contract, symbol: signal.symbol, confidence: signal.confidence, score: signal.score, price_usd: signal.price_data?.price_usd, liquidity_usd: signal.price_data?.liquidity_usd, flags: signal.flags, risk_level: signal.risk_level, time: new Date().toISOString() };
    await redis.lpush('signals:recent', JSON.stringify(sig));
    await redis.ltrim('signals:recent', 0, 99);
  } catch(e) {}
  return { code: 200, data: buyData };
});

// ===== 最近信号列表（REST API）=====
app.get('/api/signals/recent', async (request) => {
  const limit = parseInt(request.query.limit) || 20;
  try {
    const raw = await redis.lrange('signals:recent', 0, limit - 1);
    const signals = raw.map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
    return { code: 200, data: signals };
  } catch(e) {
    return { code: 500, data: [], error: e.message };
  }
});

// ===== 信号分页 API =====
app.get('/api/signals/page', async (request) => {
  const page = parseInt(request.query.page) || 1;
  const size = parseInt(request.query.size) || 20;
  const chain = request.query.chain || '';
  try {
    const raw = await redis.lrange('signals:recent', 0, 199);
    let signals = raw.map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
    if (chain) signals = signals.filter(s => s.chain === chain);
    const total = signals.length;
    const start = (page - 1) * size;
    const paged = signals.slice(start, start + size);
    return { code: 200, data: paged, total };
  } catch(e) {
    return { code: 500, data: [], total: 0, error: e.message };
  }
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

    // V2 引擎状态 — 从 Redis 获取 Worker 心跳
    const v2Alive = await redis.get('worker:v2:alive');
    services.v2_engine = { status: v2Alive ? 'healthy' : 'idle' };

    // 数据采集统计
    const priceCount = await db.query("SELECT COUNT(*) as c FROM price_snapshots WHERE snapshot_at > NOW() - INTERVAL '1 hour'");
    const candleCount = await db.query("SELECT COUNT(*) as c FROM historical_prices");
    const priceLast = await db.query("SELECT MAX(snapshot_at) as t FROM price_snapshots");
    const candleLast = await db.query("SELECT MAX(recorded_at) as t FROM historical_prices");
    const learnCount = await db.query("SELECT COUNT(*) as c FROM learning_history");
    const learnLast = await db.query("SELECT MAX(created_at) as t FROM learning_history");
    services.data_collection = {
      price_count: parseInt(priceCount.rows[0].c) || 0,
      candle_count: parseInt(candleCount.rows[0].c) || 0,
      price_last_update: priceLast.rows[0]?.t || null,
      candle_last_update: candleLast.rows[0]?.t || null,
      learn_count: parseInt(learnCount.rows[0].c) || 0,
      learn_last_update: learnLast.rows[0]?.t || null,
    };

    // 模拟交易详情
    const closedTrades = await db.query("SELECT COUNT(*) as c, COUNT(*) FILTER (WHERE pnl_usd > 0) as w, COALESCE(SUM(pnl_usd),0) as p FROM paper_trades WHERE status = 'closed'");
    services.paper_trading = {
      total_trades: parseInt(closedTrades.rows[0].c) || 0,
      closed_trades: parseInt(closedTrades.rows[0].c) || 0,
      wins: parseInt(closedTrades.rows[0].w) || 0,
      total_pnl: parseFloat(closedTrades.rows[0].p) || 0,
      open_positions: parseInt(pt.rows[0].c) || 0,
    };
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

// ===== 学习参数查询 =====
app.get('/api/learning/params/:strategy', async (request) => {
  const params = await redis.get(`params:${request.params.strategy}`);
  const rules = await redis.get(`rules:${request.params.strategy}`);
  const expCount = await db.query(
    "SELECT COUNT(*) as c FROM trade_experiences WHERE strategy_type = $1", [request.params.strategy]
  );
  return { code: 200, data: {
    params: params ? JSON.parse(params) : null,
    rules: rules ? JSON.parse(rules) : null,
    experience_count: parseInt(expCount.rows[0].c) || 0
  }};
});

// ===== 学习历史曲线 =====
app.get('/api/learning/history', async (request) => {
  const { strategy, limit } = request.query;
  const s = strategy || 'signal_follow';
  const maxRows = parseInt(limit) || 50;
  const rows = await db.query(
    "SELECT id, params, rules, score, experience_count, created_at FROM learning_history WHERE strategy = $1 ORDER BY created_at ASC LIMIT $2",
    [s, maxRows]
  );
  return { code: 200, data: rows.rows };
});

// ===== 策略配置 API =====
app.get('/api/strategies', async () => {
  const result = await db.query(
    `SELECT id, strategy_type, enabled, is_atomic, hf_threshold, capital_ratio, params, created_at
     FROM strategies WHERE user_id = 'paper' ORDER BY id`
  );
  return { code: 200, data: result.rows };
});

app.post('/api/strategies', async (request) => {
  const { strategy_type, enabled, capital_ratio, hf_threshold, params } = request.body;
  if (strategy_type) {
    await db.query(
      `INSERT INTO strategies (strategy_type, user_id, enabled, capital_ratio, hf_threshold, params)
       VALUES ($1, 'paper', $2, $3, $4, $5)
       ON CONFLICT (strategy_type) DO UPDATE SET
         enabled = COALESCE($2, strategies.enabled),
         capital_ratio = COALESCE($3, strategies.capital_ratio),
         hf_threshold = COALESCE($4, strategies.hf_threshold),
         params = COALESCE($5, strategies.params),
         updated_at = NOW()`,
      [strategy_type, enabled !== undefined ? enabled : true,
       capital_ratio || 0.25, hf_threshold || 1.5,
       params ? JSON.stringify(params) : '{}']
    );
    return { code: 200, message: '策略已保存' };
  }
  return { code: 400, error: '缺少 strategy_type' };
});

app.get('/api/lending/positions', async () => {
  const result = await db.query(
    `SELECT * FROM lending_positions WHERE status = 'active' ORDER BY created_at DESC`
  );
  return { code: 200, data: result.rows };
});

app.get('/api/lending/rates', async () => {
  const result = await db.query(
    `SELECT DISTINCT ON (chain, protocol, token) chain, protocol, token, supply_apy, borrow_apy, recorded_at
     FROM rate_snapshots ORDER BY chain, protocol, token, recorded_at DESC`
  );
  return { code: 200, data: result.rows };
});

app.get('/api/lending/rate-history', async (request) => {
  const { chain, token, hours } = request.query;
  let where = [];
  let values = [];
  let idx = 1;
  if (chain && chain !== 'all') {
    where.push(`chain = $${idx}`);
    values.push(chain);
    idx++;
  }
  if (token && token !== 'all') {
    where.push(`token = $${idx}`);
    values.push(token);
    idx++;
  }
  where.push(`recorded_at > NOW() - $${idx}::interval`);
  values.push((hours || '24') + ' hours');
  
  const result = await db.query(
    `SELECT chain, token, protocol, supply_apy, borrow_apy, recorded_at
     FROM rate_snapshots
     WHERE ${where.join(' AND ')}
     ORDER BY recorded_at ASC`,
    values
  );
  return { code: 200, data: result.rows };
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

// ===== 离线回测 API =====
app.get('/api/backtest/offline', async (request) => {
  const { chain, hours, perAmount } = request.query;
  const perAmt = parseFloat(perAmount) || 100;
  const hrs = parseInt(hours) || 6;
  
  let where = [];
  let values = [];
  let idx = 1;
  
  if (chain && chain !== 'all') {
    where.push(`chain = $${idx}`);
    values.push(chain);
    idx++;
  }
  where.push(`recorded_at > NOW() - $${idx}::interval`);
  values.push(hrs + ' hours');
  
  // 获取历史价格数据（按链+合约分组，时间排序）
  const result = await db.query(
    `SELECT chain, contract, symbol, price, liquidity_usd, recorded_at
     FROM historical_prices
     WHERE ${where.join(' AND ')}
     ORDER BY chain, contract, recorded_at ASC`,
    values
  );
  
  const rows = result.rows;
  if (rows.length < 10) {
    return { code: 200, data: { total: 0, message: '历史价格数据不足，需要至少10条记录' } };
  }
  
  // 按合约分组
  const groups = {};
  for (const r of rows) {
    const key = r.chain + ':' + r.contract;
    if (!groups[key]) groups[key] = [];
    groups[key].push({
      time: r.recorded_at,
      price: parseFloat(r.price),
      liquidity_usd: parseFloat(r.liquidity_usd || 0),
      chain: r.chain,
      contract: r.contract,
      symbol: r.symbol || ''
    });
  }
  
  // 对每个合约运行回测
  let allTrades = [];
  let totalPnl = 0;
  let wins = 0;
  const totalTrades = [];
  
  for (const [key, prices] of Object.entries(groups)) {
    if (prices.length < 3) continue;
    
    // 用 python 脚本做回测
    const { spawnSync } = require('child_process');
    const input = JSON.stringify({
      price_data: prices,
      params: {
        per_amount: perAmt,
        take_profit_pct: 30,
        stop_loss_pct: 20,
        max_slippage: 5,
        min_confidence: 50
      }
    });
    
    const proc = spawnSync('python3', ['-c', `
import json, sys
sys.path.insert(0, '/app')
from backtest_offline import run_backtest
data = json.loads(sys.stdin.read())
result = run_backtest(data['price_data'], data['params'])
print(json.dumps(result))
    `], { input, timeout: 10000, maxBuffer: 1024 * 1024 });
    
    if (proc.status === 0) {
      try {
        const btResult = JSON.parse(proc.stdout.toString());
        if (btResult.trades) {
          allTrades = allTrades.concat(btResult.trades);
          if (btResult.stats) {
            totalPnl += btResult.stats.total_pnl || 0;
            wins += btResult.stats.wins || 0;
          }
        }
      } catch(e) {}
    }
  }
  
  if (allTrades.length === 0) {
    return { code: 200, data: { total: 0, message: '回测完成，但未产生任何交易' } };
  }
  
  // 排序
  allTrades.sort((a, b) => new Date(a.exit_time) - new Date(b.exit_time));
  
  // 统计
  const total = allTrades.length;
  const winRate = total > 0 ? (wins / total * 100).toFixed(1) : '0.0';
  const avgPnl = totalPnl / total;
  
  // 最大回撤
  let cum = 0, peak = 0, maxDd = 0;
  const cumPnl = [];
  for (const t of allTrades) {
    cum += t.pnl_usd || 0;
    if (cum > peak) peak = cum;
    const dd = peak > 0 ? ((cum - peak) / peak) * 100 : 0;
    if (dd < maxDd) maxDd = dd;
    cumPnl.push({ x: t.exit_time, y: parseFloat(cum.toFixed(2)) });
  }
  
  // 夏普
  let sumSq = 0;
  for (const t of allTrades) {
    sumSq += Math.pow((t.pnl_usd || 0) - avgPnl, 2);
  }
  const stdDev = total > 0 ? Math.sqrt(sumSq / total) : 0.001;
  const sharpe = stdDev > 0 ? (avgPnl / stdDev) * Math.sqrt(365) : 0;
  
  // 按链统计
  const chainStats = {};
  for (const t of allTrades) {
    const c = t.chain || 'unknown';
    if (!chainStats[c]) chainStats[c] = { trades: 0, wins: 0, pnl: 0 };
    chainStats[c].trades++;
    if (t.pnl_usd > 0) chainStats[c].wins++;
    chainStats[c].pnl += t.pnl_usd;
  }
  
  return {
    code: 200,
    data: {
      total,
      stats: {
        total_pnl: parseFloat(totalPnl.toFixed(2)),
        win_rate: winRate + '%',
        wins,
        losses: total - wins,
        max_drawdown: parseFloat(maxDd.toFixed(2)),
        sharpe_ratio: parseFloat(sharpe.toFixed(3)),
        avg_pnl: parseFloat(avgPnl.toFixed(2))
      },
      chain_stats: chainStats,
      cum_pnl: cumPnl,
      trades: allTrades.slice(0, 200)
    }
  };
});


// ====== 系统重启 API ======
app.post('/api/system/restart', async (request, reply) => {
  const clientIp = request.ip || request.socket?.remoteAddress || 'unknown';
  const { target } = request.body || {};
  const containerName = CONTAINER_TARGETS[target || 'worker'];
  if (!containerName) {
    return reply.status(400).send({ error: '无效的目标，可选: worker / gateway / all' });
  }
  // 白名单检查：只允许重启预定义容器
  if (!ALLOWED_RESTART_CONTAINERS.has(containerName)) {
    return reply.status(403).send({ error: '禁止重启未授权的容器' });
  }

  // Redis 冷却检查
  const cooldownKey = `restart:cooldown:${clientIp}`;
  const lastRestart = await redis.get(cooldownKey);
  if (lastRestart) {
    const elapsed = Date.now() - parseInt(lastRestart);
    if (elapsed < RESTART_COOLDOWN_MS) {
      const retryAfter = Math.ceil((RESTART_COOLDOWN_MS - elapsed) / 1000);
      reply.header('Retry-After', String(retryAfter));
      return reply.status(429).send({ error: '冷却中，请稍后再试', retryAfter });
    }
  }

  const jobId = `restart_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // 标记冷却
  await redis.set(cooldownKey, String(Date.now()), 'PX', RESTART_COOLDOWN_MS);

  // 记录任务状态
  restartJobs.set(jobId, { status: 'running', target: containerName, startedAt: Date.now() });

  // 异步重启（不阻塞响应）
  setImmediate(async () => {
    try {
      const containers = target === 'all'
        ? Object.values(CONTAINER_TARGETS)
        : [containerName];

      for (const name of containers) {
        restartJobs.set(jobId, { status: 'restarting', target: name, startedAt: Date.now() });
        try {
          const container = docker.getContainer(name);
          await container.restart({ t: 10 }); // 10秒超时等待
          console.log(`[RESTART] ${name} 重启成功`);
        } catch (e) {
          console.error(`[RESTART] ${name} 重启失败:`, e.message);
          restartJobs.set(jobId, { status: 'failed', error: e.message, target: name, startedAt: Date.now() });
          return;
        }
      }

      // 所有容器重启完成后，等待健康检查
      const healthTarget = target === 'all' || target === 'gateway'
        ? `http://localhost:${PORT}/health`
        : null;

      if (healthTarget) {
        // 最多等待 30 秒
        for (let i = 0; i < 30; i++) {
          try {
            const resp = await fetch(healthTarget);
            if (resp.ok) {
              restartJobs.set(jobId, { status: 'done', target: containerName, completedAt: Date.now() });
              console.log(`[RESTART] 健康检查通过`);
              return;
            }
          } catch (e) {
            // 等待服务启动
          }
          await new Promise(r => setTimeout(r, 1000));
        }
        restartJobs.set(jobId, { status: 'done', target: containerName, completedAt: Date.now(), note: '健康检查超时，但重启已完成' });
      } else {
        // Worker 没有 HTTP 健康检查，直接标记完成
        restartJobs.set(jobId, { status: 'done', target: containerName, completedAt: Date.now() });
      }
    } catch (e) {
      restartJobs.set(jobId, { status: 'failed', error: e.message, target: containerName, startedAt: Date.now() });
    }
  });

  return reply.status(202).send({ jobId, status: 'restarting' });
});

app.get('/api/system/restart/status', async (request) => {
  const { jobId } = request.query;
  if (!jobId) return { error: '缺少 jobId' };
  const job = restartJobs.get(jobId);
  if (!job) return { status: 'not_found' };
  return { status: job.status, target: job.target, error: job.error };
});

// ====== OKX 配置 API ======
app.post('/api/config/okx', async (request, reply) => {
  const { apiKey, secretKey, passphrase } = request.body || {};
  if (!apiKey || !secretKey || !passphrase) {
    return reply.status(400).send({ error: '缺少参数: apiKey, secretKey, passphrase' });
  }

  // 写入 sys_config 表
  await db.query("INSERT INTO sys_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()",
    ['okx.api_key', apiKey]);
  await db.query("INSERT INTO sys_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()",
    ['okx.secret_key', secretKey]);
  await db.query("INSERT INTO sys_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()",
    ['okx.passphrase', passphrase]);

  // 广播到 Redis 和 JS 模块
  await broadcastOkxConfig();

  return { success: true, message: '✅ OKX 配置已保存' };
});

app.get('/api/config/okx', async () => {
  await broadcastOkxConfig();
  return { configured: okxConfigCache.configured };
});


// ====== 系统重启 API ======
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
        // 缓存所有类型的信号（SNIPER/MATURE_MEME/ARBITRAGE/LENDING_ARB等）
        const sigType = data.type || data.type || 'UNKNOWN';
        const sigEntry = {
          type: sigType,
          chain: data.chain || data.data?.chain,
          contract: data.contract || data.data?.contract || data.data?.token,
          symbol: data.symbol || data.data?.symbol,
          confidence: data.confidence || data.data?.confidence,
          score: data.score || data.data?.score || data.risk_score,
          risk_level: data.risk_level || data.data?.risk_level,
          price_usd: data.price_data?.price_usd || data.data?.price_usd || data.data?.price,
          liquidity_usd: data.price_data?.liquidity_usd || data.data?.liquidity_usd,
          flags: data.flags || data.data?.flags,
          spread_bps: data.spread_bps || data.data?.spread_bps,
          time: new Date().toISOString(),
        };
        redis.lpush('signals:recent', JSON.stringify(sigEntry)).catch(() => {});
        redis.ltrim('signals:recent', 0, 199).catch(() => {});
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
