// AIHunter Live Trading API Routes
// 动量突破策略实盘交易后端 API

const { Pool } = require('pg');
const Redis = require('ioredis');

class LiveTradingRoutes {
  constructor(fastify, options) {
    this.fastify = fastify;
    this.db = new Pool({ connectionString: process.env.DATABASE_URL });
    this.redis = new Redis(process.env.REDIS_URL);
    this.okxClient = options.okxClient;
    
    this.registerRoutes();
  }

  registerRoutes() {
    // Agentic Wallet 管理
    this.fastify.post('/api/agentic-wallet/create', this.createWallet.bind(this));
    this.fastify.get('/api/agentic-wallet/status', this.getWalletStatus.bind(this));
    this.fastify.post('/api/agentic-wallet/authorize', this.authorizeWallet.bind(this));
    this.fastify.post('/api/agentic-wallet/revoke', this.revokeWallet.bind(this));

    // 实盘交易配置
    this.fastify.get('/api/live-trading/config', this.getConfig.bind(this));
    this.fastify.post('/api/live-trading/config', this.saveConfig.bind(this));
    this.fastify.get('/api/live-trading/params', this.getParams.bind(this));

    // 交易控制
    this.fastify.post('/api/live-trading/start', this.startTrading.bind(this));
    this.fastify.post('/api/live-trading/stop', this.stopTrading.bind(this));
    this.fastify.get('/api/live-trading/status', this.getStatus.bind(this));

    // 交易记录
    this.fastify.get('/api/live-trading/trades', this.getTrades.bind(this));

    // 图表数据
    this.fastify.get('/api/live-trading/chart/pnl', this.getPnlChart.bind(this));
    this.fastify.get('/api/live-trading/chart/distribution', this.getDistributionChart.bind(this));
    this.fastify.get('/api/live-trading/chart/assets', this.getAssetsChart.bind(this));
    this.fastify.get('/api/live-trading/chart/tokens', this.getTokensChart.bind(this));
  }

  // ===== Agentic Wallet =====
  async createWallet(request, reply) {
    try {
      const { userId, email, chain = 'ETH' } = request.body;
      
      // 调用 OKX API 创建 Agentic Wallet
      const wallet = await this.okxClient.createAgenticWallet(email, chain);
      
      const result = await this.db.query(
        `INSERT INTO agentic_wallets (user_id, wallet_address, chain, status, created_at)
         VALUES ($1, $2, $3, 'active', NOW())
         RETURNING *`,
        [userId, wallet.address, chain]
      );

      return reply.send({ code: 200, data: result.rows[0] });
    } catch (error) {
      return reply.status(500).send({ code: 500, error: error.message });
    }
  }

  async getWalletStatus(request, reply) {
    try {
      const { userId } = request.query;
      
      const result = await this.db.query(
        `SELECT * FROM agentic_wallets WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return reply.send({ code: 200, data: null });
      }

      return reply.send({ code: 200, data: result.rows[0] });
    } catch (error) {
      return reply.status(500).send({ code: 500, error: error.message });
    }
  }

  async authorizeWallet(request, reply) {
    try {
      const { userId, walletId } = request.body;
      
      // 调用 OKX API 授权
      const auth = await this.okxClient.authorizeWallet(walletId);
      
      const result = await this.db.query(
        `UPDATE agentic_wallets 
         SET status = 'authorized', authorized_at = NOW(), expires_at = NOW() + INTERVAL '1 year'
         WHERE id = $1 AND user_id = $2
         RETURNING *`,
        [walletId, userId]
      );

      return reply.send({ code: 200, data: result.rows[0] });
    } catch (error) {
      return reply.status(500).send({ code: 500, error: error.message });
    }
  }

  async revokeWallet(request, reply) {
    try {
      const { userId, walletId } = request.body;
      
      await this.db.query(
        `UPDATE agentic_wallets 
         SET status = 'revoked', expires_at = NOW()
         WHERE id = $1 AND user_id = $2`,
        [walletId, userId]
      );

      return reply.send({ code: 200, message: '授权已撤销' });
    } catch (error) {
      return reply.status(500).send({ code: 500, error: error.message });
    }
  }

  // ===== 实盘交易配置 =====
  async getConfig(request, reply) {
    try {
      const { userId } = request.query;
      
      const result = await this.db.query(
        `SELECT * FROM live_trading_configs WHERE user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        // 返回默认配置
        return reply.send({
          code: 200,
          data: {
            strategy: 'momentum',
            max_single_amount: 1000,
            slippage_tolerance: 1.0,
            gas_strategy: 'medium',
            take_profit_pct: 10,
            stop_loss_pct: 5,
            auto_apply_params: true,
            pause_on_param_change: false,
            is_active: false
          }
        });
      }

      return reply.send({ code: 200, data: result.rows[0] });
    } catch (error) {
      return reply.status(500).send({ code: 500, error: error.message });
    }
  }

  async saveConfig(request, reply) {
    try {
      const { userId, ...config } = request.body;
      
      const result = await this.db.query(
        `INSERT INTO live_trading_configs 
         (user_id, strategy, max_single_amount, slippage_tolerance, gas_strategy, 
          take_profit_pct, stop_loss_pct, auto_apply_params, pause_on_param_change, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         ON CONFLICT (user_id) 
         DO UPDATE SET 
           strategy = EXCLUDED.strategy,
           max_single_amount = EXCLUDED.max_single_amount,
           slippage_tolerance = EXCLUDED.slippage_tolerance,
           gas_strategy = EXCLUDED.gas_strategy,
           take_profit_pct = EXCLUDED.take_profit_pct,
           stop_loss_pct = EXCLUDED.stop_loss_pct,
           auto_apply_params = EXCLUDED.auto_apply_params,
           pause_on_param_change = EXCLUDED.pause_on_param_change,
           updated_at = NOW()
         RETURNING *`,
        [userId, config.strategy || 'momentum', config.max_single_amount || 1000,
         config.slippage_tolerance || 1.0, config.gas_strategy || 'medium',
         config.take_profit_pct || 10, config.stop_loss_pct || 5,
         config.auto_apply_params !== false, config.pause_on_param_change === true]
      );

      return reply.send({ code: 200, data: result.rows[0] });
    } catch (error) {
      return reply.status(500).send({ code: 500, error: error.message });
    }
  }

  async getParams(request, reply) {
    try {
      const { userId } = request.query;
      
      // 从 Redis 获取最新学习参数
      const params = await this.redis.get(`params:momentum`);
      
      return reply.send({
        code: 200,
        data: params ? JSON.parse(params) : null
      });
    } catch (error) {
      return reply.status(500).send({ code: 500, error: error.message });
    }
  }

  // ===== 交易控制 =====
  async startTrading(request, reply) {
    try {
      const { userId } = request.body;
      
      // 检查钱包和授权状态
      const walletResult = await this.db.query(
        `SELECT * FROM agentic_wallets WHERE user_id = $1 AND status = 'authorized'`,
        [userId]
      );

      if (walletResult.rows.length === 0) {
        return reply.status(400).send({ code: 400, error: '请先创建并授权钱包' });
      }

      await this.db.query(
        `UPDATE live_trading_configs SET is_active = true, updated_at = NOW() WHERE user_id = $1`,
        [userId]
      );

      return reply.send({ code: 200, message: '实盘交易已开启' });
    } catch (error) {
      return reply.status(500).send({ code: 500, error: error.message });
    }
  }

  async stopTrading(request, reply) {
    try {
      const { userId } = request.body;
      
      await this.db.query(
        `UPDATE live_trading_configs SET is_active = false, updated_at = NOW() WHERE user_id = $1`,
        [userId]
      );

      return reply.send({ code: 200, message: '实盘交易已暂停' });
    } catch (error) {
      return reply.status(500).send({ code: 500, error: error.message });
    }
  }

  async getStatus(request, reply) {
    try {
      const { userId } = request.query;
      
      const result = await this.db.query(
        `SELECT is_active FROM live_trading_configs WHERE user_id = $1`,
        [userId]
      );

      const isActive = result.rows.length > 0 ? result.rows[0].is_active : false;

      return reply.send({ code: 200, data: { is_active: isActive } });
    } catch (error) {
      return reply.status(500).send({ code: 500, error: error.message });
    }
  }

  // ===== 交易记录 =====
  async getTrades(request, reply) {
    try {
      const { userId, page = 1, limit = 20, startDate, endDate } = request.query;
      
      let query = `SELECT * FROM live_trade_records WHERE user_id = $1`;
      const params = [userId];
      
      if (startDate) {
        query += ` AND created_at >= $${params.length + 1}`;
        params.push(startDate);
      }
      if (endDate) {
        query += ` AND created_at <= $${params.length + 1}`;
        params.push(endDate);
      }
      
      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, (page - 1) * limit);

      const result = await this.db.query(query, params);

      return reply.send({ code: 200, data: result.rows });
    } catch (error) {
      return reply.status(500).send({ code: 500, error: error.message });
    }
  }

  // ===== 图表数据 =====
  async getPnlChart(request, reply) {
    try {
      const { userId, days = 7 } = request.query;
      
      const result = await this.db.query(
        `SELECT DATE(created_at) as date, SUM(pnl_usd) as pnl
         FROM live_trade_records 
         WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '${days} days'
         GROUP BY DATE(created_at)
         ORDER BY date`,
        [userId]
      );

      return reply.send({ code: 200, data: result.rows });
    } catch (error) {
      return reply.status(500).send({ code: 500, error: error.message });
    }
  }

  async getDistributionChart(request, reply) {
    try {
      const { userId } = request.query;
      
      const result = await this.db.query(
        `SELECT 
           COUNT(CASE WHEN pnl_usd > 0 THEN 1 END) as wins,
           COUNT(CASE WHEN pnl_usd <= 0 THEN 1 END) as losses
         FROM live_trade_records 
         WHERE user_id = $1`,
        [userId]
      );

      return reply.send({ code: 200, data: result.rows[0] });
    } catch (error) {
      return reply.status(500).send({ code: 500, error: error.message });
    }
  }

  async getAssetsChart(request, reply) {
    try {
      const { userId, days = 7 } = request.query;
      
      const result = await this.db.query(
        `SELECT DATE(created_at) as date, SUM(amount_in) as total
         FROM live_trade_records 
         WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '${days} days'
         GROUP BY DATE(created_at)
         ORDER BY date`,
        [userId]
      );

      return reply.send({ code: 200, data: result.rows });
    } catch (error) {
      return reply.status(500).send({ code: 500, error: error.message });
    }
  }

  async getTokensChart(request, reply) {
    try {
      const { userId } = request.query;
      
      const result = await this.db.query(
        `SELECT token_out as token, SUM(pnl_usd) as pnl
         FROM live_trade_records 
         WHERE user_id = $1
         GROUP BY token_out
         ORDER BY pnl DESC
         LIMIT 10`,
        [userId]
      );

      return reply.send({ code: 200, data: result.rows });
    } catch (error) {
      return reply.status(500).send({ code: 500, error: error.message });
    }
  }
}

module.exports = LiveTradingRoutes;
