// AIHunter Live Trading API Routes
// 动量突破策略实盘交易后端 API
// v2: onchainos CLI integrated for Agentic Wallet

import pg from 'pg';
const { Pool } = pg;
import { Redis } from 'ioredis';
import { execSync } from "child_process";

function onchainos(args) {
  try {
    const stdout = execSync(`/root/.local/bin/onchainos ${args}`, {
      encoding: 'utf8', timeout: 30000, maxBuffer: 10 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  } catch (err) {
    if (err.stdout) { try { return JSON.parse(err.stdout); } catch {} }
    if (err.stderr) { try { return JSON.parse(err.stderr); } catch {} }
    throw new Error(`onchainos 失败: ${err.message}`);
  }
}

class LiveTradingRoutes {
  constructor(fastify, options) {
    this.fastify = fastify;
    this.db = new Pool({ connectionString: process.env.DATABASE_URL });
    this.redis = new Redis(process.env.REDIS_URL);
    this.registerRoutes();
  }

  registerRoutes() {
    this.fastify.post('/api/agentic-wallet/login', this.loginWallet.bind(this));
    this.fastify.post('/api/agentic-wallet/verify', this.verifyOtp.bind(this));
    this.fastify.get('/api/agentic-wallet/status', this.getWalletStatus.bind(this));
    this.fastify.post('/api/agentic-wallet/revoke', this.revokeWallet.bind(this));

    this.fastify.get('/api/live-trading/config', this.getConfig.bind(this));
    this.fastify.post('/api/live-trading/config', this.saveConfig.bind(this));
    this.fastify.get('/api/live-trading/params', this.getParams.bind(this));

    this.fastify.post('/api/live-trading/start', this.startTrading.bind(this));
    this.fastify.post('/api/live-trading/stop', this.stopTrading.bind(this));
    this.fastify.get('/api/live-trading/status', this.getStatus.bind(this));

    this.fastify.get('/api/live-trading/trades', this.getTrades.bind(this));

    this.fastify.get('/api/live-trading/chart/pnl', this.getPnlChart.bind(this));
    this.fastify.get('/api/live-trading/chart/distribution', this.getDistributionChart.bind(this));
    this.fastify.get('/api/live-trading/chart/assets', this.getAssetsChart.bind(this));
    this.fastify.get('/api/live-trading/chart/tokens', this.getTokensChart.bind(this));
  }

  // ===== Agentic Wallet (onchainos CLI) =====

  async loginWallet(request, reply) {
    try {
      const { userId, email } = request.body || {};
      if (!userId || !email) {
        return reply.status(400).send({ code: 400, message: '缺少 userId 或 email' });
      }

      const loginResult = onchainos(`wallet login ${email}`);
      if (!loginResult.ok) {
        return reply.status(500).send({ code: 500, message: loginResult.message || '登录请求失败' });
      }

      await this.redis.set(`agentic:login:${userId}`, email, 'EX', 300);
      return reply.send({ code: 200, message: '验证码已发送，请输入邮箱验证码', data: { email } });
    } catch (error) {
      console.error('[loginWallet]', error);
      return reply.status(500).send({ code: 500, message: error.message });
    }
  }

  async verifyOtp(request, reply) {
    try {
      const { userId, code, chain = 'ethereum' } = request.body || {};
      if (!userId || !code) {
        return reply.status(400).send({ code: 400, message: '缺少 userId 或验证码' });
      }

      const email = await this.redis.get(`agentic:login:${userId}`);
      if (!email) {
        return reply.status(400).send({ code: 400, message: '登录会话已过期，请重新发起登录' });
      }

      const verifyResult = onchainos(`wallet verify ${code}`);
      if (!verifyResult.ok) {
        return reply.status(400).send({ code: 400, message: verifyResult.message || '验证码错误' });
      }

      // 获取钱包状态和余额
      let walletAddress = '';
      let totalUsd = 0;
      let balances = [];
      try {
        const statusResult = onchainos('wallet status');
        const sd = statusResult.data || statusResult;
        walletAddress = sd.currentAccountId || '';
        if (walletAddress) {
          const balResult = onchainos(`wallet balance --chain ${chain}`);
          const bd = balResult.data || balResult;
          balances = bd.balances || [];
          totalUsd = typeof bd.totalUsd === 'number' ? bd.totalUsd : 0;
        }
      } catch (e) {
        console.warn('[Wallet] 获取余额失败:', e.message);
      }

      const chainUpper = chain.toUpperCase();
      const result = await this.db.query(
        `INSERT INTO agentic_wallets (user_id, wallet_address, chain, status, created_at)
         VALUES ($1, $2, $3, 'authorized', NOW())
         ON CONFLICT (user_id) DO UPDATE SET wallet_address = $2, chain = $3, status = 'authorized', authorized_at = NOW()
         RETURNING *`,
        [userId, walletAddress, chainUpper]
      );

      await this.redis.del(`agentic:login:${userId}`);
      return reply.send({ code: 200, data: { ...result.rows[0], balances, totalUsd }, message: '钱包创建/登录成功' });
    } catch (error) {
      console.error('[verifyOtp]', error);
      return reply.status(500).send({ code: 500, message: error.message });
    }
  }

  async getWalletStatus(request, reply) {
    try {
      const { userId } = request.query || {};
      if (!userId) return reply.status(400).send({ code: 400, message: '缺少 userId' });

      const result = await this.db.query(
        `SELECT * FROM agentic_wallets WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, [userId]
      );

      if (result.rows.length === 0) {
        return reply.send({ code: 200, data: null, message: '暂无钱包' });
      }

      const wallet = result.rows[0];

      // 实时余额
      let totalUsd = 0, balances = [];
      try {
        const chain = (wallet.chain || 'ETH').toLowerCase() === 'eth' ? 'ethereum' : wallet.chain?.toLowerCase() || 'ethereum';
        const balResult = onchainos(`wallet balance --chain ${chain}`);
        const bd = balResult.data || balResult;
        balances = bd.balances || [];
        totalUsd = typeof bd.totalUsd === 'number' ? bd.totalUsd : 0;
      } catch (e) {
        console.warn('[Wallet] 实时余额查询失败:', e.message);
      }

      return reply.send({ code: 200, data: { ...wallet, balances, totalUsd } });
    } catch (error) {
      console.error('[getWalletStatus]', error);
      return reply.status(500).send({ code: 500, message: error.message });
    }
  }

  async revokeWallet(request, reply) {
    try {
      const { userId } = request.body || {};
      if (!userId) return reply.status(400).send({ code: 400, message: '缺少 userId' });

      const result = await this.db.query(
        `UPDATE agentic_wallets SET status = 'revoked', expires_at = NOW() WHERE user_id = $1`, [userId]
      );
      if (result.rowCount === 0) return reply.status(404).send({ code: 404, message: '钱包不存在' });

      return reply.send({ code: 200, message: '授权已撤销' });
    } catch (error) {
      console.error('[revokeWallet]', error);
      return reply.status(500).send({ code: 500, message: error.message });
    }
  }

  // ===== 实盘交易配置 =====

  async getConfig(request, reply) {
    try {
      const { userId, strategy } = request.query || {};
      if (!userId) return reply.status(400).send({ code: 400, message: '缺少 userId' });

      let query = `SELECT * FROM live_trading_configs WHERE user_id = $1`;
      const params = [userId];
      if (strategy) { query += ` AND strategy = $2`; params.push(strategy); }
      const result = await this.db.query(query, params);

      if (result.rows.length === 0) {
        return reply.send({ code: 200, data: {
          strategy:'momentum',max_single_amount:1000,slippage_tolerance:1.0,gas_strategy:'medium',
          take_profit_pct:10,stop_loss_pct:5,auto_apply_params:true,pause_on_param_change:false,
          daily_max_loss:500,max_holdings:10,is_active:false
        }, message: '返回默认配置' });
      }
      return reply.send({ code: 200, data: result.rows[0] });
    } catch (error) {
      console.error('[getConfig]', error);
      return reply.status(500).send({ code: 500, message: error.message });
    }
  }

  async saveConfig(request, reply) {
    try {
      const body = request.body || {};
      const { userId, strategy, max_single_amount, slippage_tolerance, gas_strategy,
              take_profit_pct, stop_loss_pct, auto_apply_params, pause_on_param_change,
              daily_max_loss, max_holdings } = body;
      if (!userId) return reply.status(400).send({ code: 400, message: '缺少 userId' });

      if (daily_max_loss != null && (isNaN(daily_max_loss) || Number(daily_max_loss) < 0))
        return reply.status(400).send({ code: 400, message: 'daily_max_loss 必须为非负数' });
      if (max_holdings != null && (isNaN(max_holdings) || !Number.isInteger(Number(max_holdings)) || Number(max_holdings) < 0))
        return reply.status(400).send({ code: 400, message: 'max_holdings 必须为非负整数' });

      const result = await this.db.query(
        `INSERT INTO live_trading_configs
         (user_id,strategy,max_single_amount,slippage_tolerance,gas_strategy,take_profit_pct,stop_loss_pct,auto_apply_params,pause_on_param_change,daily_max_loss,max_holdings,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           strategy=EXCLUDED.strategy,max_single_amount=EXCLUDED.max_single_amount,
           slippage_tolerance=EXCLUDED.slippage_tolerance,gas_strategy=EXCLUDED.gas_strategy,
           take_profit_pct=EXCLUDED.take_profit_pct,stop_loss_pct=EXCLUDED.stop_loss_pct,
           auto_apply_params=EXCLUDED.auto_apply_params,pause_on_param_change=EXCLUDED.pause_on_param_change,
           daily_max_loss=EXCLUDED.daily_max_loss,max_holdings=EXCLUDED.max_holdings,updated_at=NOW()
         RETURNING *`,
        [userId,strategy||'momentum',max_single_amount??1000,slippage_tolerance??1.0,gas_strategy||'medium',
         take_profit_pct??10,stop_loss_pct??5,auto_apply_params!==false,pause_on_param_change===true,
         daily_max_loss??0,max_holdings??0]
      );
      return reply.send({ code: 200, data: result.rows[0], message: '配置已保存' });
    } catch (error) {
      console.error('[saveConfig]', error);
      return reply.status(500).send({ code: 500, message: error.message });
    }
  }

  async getParams(request, reply) {
    try {
      const { userId } = request.query || {};
      if (!userId) return reply.status(400).send({ code: 400, message: '缺少 userId' });

      const params = await this.redis.get(`params:momentum:${userId}`);
      const configResult = await this.db.query(`SELECT updated_at FROM live_trading_configs WHERE user_id=$1`, [userId]);
      const updatedAt = configResult.rows.length > 0 ? configResult.rows[0].updated_at : null;
      const redisVersion = await this.redis.get(`learning:params:version:${userId}`);
      const isValidRedisVersion = redisVersion && /^\d{13}$/.test(redisVersion);
      const version = isValidRedisVersion ? redisVersion : (updatedAt ? new Date(updatedAt).getTime().toString() : null);
      const updatedAtISO = updatedAt ? new Date(updatedAt).toISOString() : null;

      return reply.send({ code: 200, data: params ? JSON.parse(params) : null, version, updated_at: updatedAtISO, message: params ? '成功' : '暂无学习参数' });
    } catch (error) {
      console.error('[getParams]', error);
      return reply.status(500).send({ code: 500, message: error.message });
    }
  }

  // ===== 交易控制 =====

  async startTrading(request, reply) {
    try {
      const { userId } = request.body || {};
      if (!userId) return reply.status(400).send({ code: 400, message: '缺少 userId' });

      const walletResult = await this.db.query(
        `SELECT * FROM agentic_wallets WHERE user_id=$1 AND status='authorized' AND expires_at>NOW()`, [userId]
      );
      if (walletResult.rows.length === 0) return reply.status(400).send({ code: 400, message: '请先登录创建钱包' });

      await this.db.query(`UPDATE live_trading_configs SET is_active=true,updated_at=NOW() WHERE user_id=$1`, [userId]);
      await this.redis.set(`live:trading:active:${userId}`, '1');
      await this.redis.publish('live:trading:control', JSON.stringify({ userId, action: 'start' }));
      return reply.send({ code: 200, message: '实盘交易已开启' });
    } catch (error) {
      console.error('[startTrading]', error);
      return reply.status(500).send({ code: 500, message: error.message });
    }
  }

  async stopTrading(request, reply) {
    try {
      const { userId } = request.body || {};
      if (!userId) return reply.status(400).send({ code: 400, message: '缺少 userId' });

      await this.db.query(`UPDATE live_trading_configs SET is_active=false,updated_at=NOW() WHERE user_id=$1`, [userId]);
      await this.redis.set(`live:trading:active:${userId}`, '0');
      await this.redis.publish('live:trading:control', JSON.stringify({ userId, action: 'stop' }));
      return reply.send({ code: 200, message: '实盘交易已暂停' });
    } catch (error) {
      console.error('[stopTrading]', error);
      return reply.status(500).send({ code: 500, message: error.message });
    }
  }

  async getStatus(request, reply) {
    try {
      const { userId } = request.query || {};
      if (!userId) return reply.status(400).send({ code: 400, message: '缺少 userId' });

      const [c, s, l, h] = await Promise.all([
        this.db.query(`SELECT * FROM live_trading_configs WHERE user_id=$1`, [userId]),
        this.db.query(`SELECT COUNT(*)::int as today_trades, COALESCE(SUM(pnl_usd),0)::float as today_pnl FROM live_trade_records WHERE user_id=$1 AND created_at>=CURRENT_DATE`, [userId]),
        this.db.query(`SELECT COALESCE(SUM(pnl_usd),0)::float as today_loss FROM live_trade_records WHERE user_id=$1 AND created_at>=CURRENT_DATE AND pnl_usd<0`, [userId]),
        this.db.query(`SELECT COUNT(*)::int as current_holdings FROM (SELECT token_out FROM live_trade_records WHERE user_id=$1 AND created_at>=CURRENT_DATE GROUP BY token_out HAVING SUM(CASE WHEN status='BUY' THEN amount_in ELSE 0 END)-SUM(CASE WHEN status='SELL' THEN COALESCE(amount_out,0) ELSE 0 END)>0) sub`, [userId])
      ]);

      const today_loss = l.rows[0]?.today_loss || 0;
      const current_holdings = h.rows[0]?.current_holdings || 0;

      if (c.rows.length === 0) {
        const stats = s.rows[0] || { today_trades:0, today_pnl:0 };
        return reply.send({ code: 200, data: { is_active:false, strategy:'momentum', config:null, ...stats, today_loss, current_holdings }, message: '暂无配置，交易未开启' });
      }

      const stats = s.rows[0] || { today_trades:0, today_pnl:0 };
      return reply.send({ code: 200, data: { ...c.rows[0], ...stats, today_loss, current_holdings } });
    } catch (error) {
      console.error('[getStatus]', error);
      return reply.status(500).send({ code: 500, message: error.message });
    }
  }

  async checkDailyLossLimit(userId, config) {
    try {
      const dailyMaxLoss = parseFloat(config.daily_max_loss) || 0;
      if (isNaN(dailyMaxLoss) || dailyMaxLoss <= 0) return { passed: true, todayLoss: 0, reason: null };

      const result = await this.db.query(
        `SELECT COALESCE(SUM(pnl_usd),0)::float as today_loss FROM live_trade_records WHERE user_id=$1 AND created_at>=CURRENT_DATE AND pnl_usd<0`, [userId]
      );
      const todayLoss = Math.abs(result.rows[0]?.today_loss || 0);
      if (todayLoss >= dailyMaxLoss) return { passed: false, todayLoss, reason: `当日亏损 ${todayLoss.toFixed(2)} >= 限额 ${dailyMaxLoss.toFixed(2)}` };
      return { passed: true, todayLoss, reason: null };
    } catch (error) {
      console.error('[checkDailyLossLimit]', error);
      return { passed: false, todayLoss: 0, reason: `风控检查异常: ${error.message}` };
    }
  }

  async checkHoldingsLimit(userId, config) {
    try {
      const maxHoldings = parseInt(config.max_holdings) || 0;
      if (isNaN(maxHoldings) || maxHoldings <= 0) return { passed: true, currentHoldings: 0, reason: null };

      const result = await this.db.query(
        `SELECT COUNT(*)::int as current_holdings FROM (SELECT token_out FROM live_trade_records WHERE user_id=$1 AND created_at>=CURRENT_DATE GROUP BY token_out HAVING SUM(CASE WHEN status='BUY' THEN amount_in ELSE 0 END)-SUM(CASE WHEN status='SELL' THEN COALESCE(amount_out,0) ELSE 0 END)>0) sub`, [userId]
      );
      const currentHoldings = result.rows[0]?.current_holdings || 0;
      if (currentHoldings >= maxHoldings) return { passed: false, currentHoldings, reason: `持仓 ${currentHoldings} >= 限额 ${maxHoldings}` };
      return { passed: true, currentHoldings, reason: null };
    } catch (error) {
      console.error('[checkHoldingsLimit]', error);
      return { passed: false, currentHoldings: 0, reason: `风控检查异常: ${error.message}` };
    }
  }

  // ===== 交易记录 =====

  async getTrades(request, reply) {
    try {
      const { userId, page=1, limit=20, date, startDate, endDate } = request.query || {};
      if (!userId) return reply.status(400).send({ code: 400, message: '缺少 userId' });

      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(500, Math.max(1, parseInt(limit) || 20));
      let query = `SELECT * FROM live_trade_records WHERE user_id=$1`;
      const params = [userId]; let pi = 2;

      if (date && date !== 'all') {
        const intervals = { today: "1 day", week: "7 days", month: "30 days" };
        if (intervals[date]) query += ` AND created_at >= NOW() - INTERVAL '${intervals[date]}'`;
      } else if (startDate) {
        query += ` AND created_at >= $${pi}`; params.push(startDate); pi++;
        if (endDate) { query += ` AND created_at <= $${pi}`; params.push(endDate); pi++; }
      }

      query += ` ORDER BY created_at DESC LIMIT $${pi} OFFSET $${pi+1}`;
      params.push(limitNum, (pageNum-1)*limitNum);
      const result = await this.db.query(query, params);

      let cq = `SELECT COUNT(*) as total FROM live_trade_records WHERE user_id=$1`;
      const cp = [userId];
      if (startDate) { cq += ` AND created_at >= $${2}`; cp.push(startDate); }
      if (endDate) { cq += ` AND created_at <= $${3}`; cp.push(endDate); }
      const ct = await this.db.query(cq, cp);

      return reply.send({ code: 200, data: { records: result.rows, total: parseInt(ct.rows[0].total)||0, page: pageNum, limit: limitNum } });
    } catch (error) {
      console.error('[getTrades]', error);
      return reply.status(500).send({ code: 500, message: error.message });
    }
  }

  // ===== 图表数据 =====

  async getPnlChart(request, reply) {
    try {
      const { userId, days=7 } = request.query || {};
      if (!userId) return reply.status(400).send({ code: 400, message: '缺少 userId' });
      const daysNum = Math.min(365, Math.max(1, parseInt(days)||7));
      if (isNaN(daysNum)) return reply.status(400).send({ code: 400, message: 'days 参数无效' });
      const result = await this.db.query(
        `SELECT DATE(created_at) as date, SUM(pnl_usd) as pnl FROM live_trade_records WHERE user_id=$1 AND created_at>=NOW()-$2::interval GROUP BY DATE(created_at) ORDER BY date`,
        [userId, daysNum+' days']
      );
      return reply.send({ code: 200, data: result.rows });
    } catch (error) {
      console.error('[getPnlChart]', error);
      return reply.status(500).send({ code: 500, message: error.message });
    }
  }

  async getDistributionChart(request, reply) {
    try {
      const { userId } = request.query || {};
      if (!userId) return reply.status(400).send({ code: 400, message: '缺少 userId' });
      const result = await this.db.query(
        `SELECT COUNT(CASE WHEN COALESCE(pnl_usd,0)>0 THEN 1 END) as wins, COUNT(CASE WHEN COALESCE(pnl_usd,0)<=0 THEN 1 END) as losses FROM live_trade_records WHERE user_id=$1`, [userId]
      );
      return reply.send({ code: 200, data: result.rows[0] });
    } catch (error) {
      console.error('[getDistributionChart]', error);
      return reply.status(500).send({ code: 500, message: error.message });
    }
  }

  async getAssetsChart(request, reply) {
    try {
      const { userId, days=7 } = request.query || {};
      if (!userId) return reply.status(400).send({ code: 400, message: '缺少 userId' });
      const daysNum = Math.min(365, Math.max(1, parseInt(days)||7));
      if (isNaN(daysNum)) return reply.status(400).send({ code: 400, message: 'days 参数无效' });
      const result = await this.db.query(
        `SELECT DATE(created_at) as date, SUM(amount_in) as total FROM live_trade_records WHERE user_id=$1 AND created_at>=NOW()-$2::interval GROUP BY DATE(created_at) ORDER BY date`,
        [userId, daysNum+' days']
      );
      return reply.send({ code: 200, data: result.rows });
    } catch (error) {
      console.error('[getAssetsChart]', error);
      return reply.status(500).send({ code: 500, message: error.message });
    }
  }

  async getTokensChart(request, reply) {
    try {
      const { userId } = request.query || {};
      if (!userId) return reply.status(400).send({ code: 400, message: '缺少 userId' });
      const result = await this.db.query(
        `SELECT token_out as token, SUM(COALESCE(pnl_usd,0)) as pnl FROM live_trade_records WHERE user_id=$1 GROUP BY token_out ORDER BY pnl DESC LIMIT 10`, [userId]
      );
      return reply.send({ code: 200, data: result.rows });
    } catch (error) {
      console.error('[getTokensChart]', error);
      return reply.status(500).send({ code: 500, message: error.message });
    }
  }
}

export default LiveTradingRoutes;
