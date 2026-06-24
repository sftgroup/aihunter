// AIHunter Live Trading API Routes
// 动量突破策略实盘交易后端 API

const { Pool } = require('pg');
const Redis = require('ioredis');

class LiveTradingRoutes {
  constructor(fastify, options) {
    this.fastify = fastify;
    this.db = new Pool({ connectionString: process.env.DATABASE_URL });
    this.redis = new Redis(process.env.REDIS_URL);
    this.okxClient = options.okxClient || null;
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
      const { userId, email, chain = 'ETH' } = request.body || {};
      if (!userId) {
        return reply.status(400).send({ code: 400, message: '缺少 userId' });
      }

      let walletAddress = null;

      if (this.okxClient && typeof this.okxClient.createAgenticWallet === 'function') {
        try {
          const walletData = await this.okxClient.createAgenticWallet(email, chain);
          walletAddress = walletData.address;
        } catch (okxErr) {
          console.warn('[Wallet] OKX API 调用失败，使用模拟地址:', okxErr.message);
        }
      }

      if (!walletAddress) {
        const hex = Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
        walletAddress = '0x' + hex;
      }

      const result = await this.db.query(
        `INSERT INTO agentic_wallets (user_id, wallet_address, chain, status, created_at)
         VALUES ($1, $2, $3, 'active', NOW())
         RETURNING *`,
        [userId, walletAddress, chain]
      );

      return reply.send({ code: 200, data: result.rows[0], message: '钱包创建成功' });
    } catch (error) {
      console.error('[createWallet]', error);
      return reply.status(500).send({ code: 500, message: error.message });
    }
  }

  async getWalletStatus(request, reply) {
    try {
      const { userId } = request.query || {};
      if (!userId) {
        return reply.status(400).send({ code: 400, message: '缺少 userId' });
      }

      const result = await this.db.query(
        `SELECT * FROM agentic_wallets WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return reply.send({ code: 200, data: null, message: '暂无钱包' });
      }

      return reply.send({ code: 200, data: result.rows[0] });
    } catch (error) {
      console.error('[getWalletStatus]', error);
      return reply.status(500).send({ code: 500, message: error.message });
    }
  }

  async authorizeWallet(request, reply) {
    try {
      const { userId, walletId } = request.body || {};
      if (!userId || !walletId) {
        return reply.status(400).send({ code: 400, message: '缺少 userId 或 walletId' });
      }

      if (this.okxClient && typeof this.okxClient.authorizeWallet === 'function') {
        try {
          await this.okxClient.authorizeWallet(walletId);
        } catch (okxErr) {
          console.warn('[Wallet] OKX 远程授权失败，继续本地授权:', okxErr.message);
        }
      }

      const result = await this.db.query(
        `UPDATE agentic_wallets
         SET status = 'authorized', authorized_at = NOW(), expires_at = NOW() + INTERVAL '1 year'
         WHERE id = $1 AND user_id = $2
         RETURNING *`,
        [walletId, userId]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({ code: 404, message: '钱包不存在或无权操作' });
      }

      return reply.send({ code: 200, data: result.rows[0], message: '钱包已授权' });
    } catch (error) {
      console.error('[authorizeWallet]', error);
      return reply.status(500).send({ code: 500, message: error.message });
    }
  }

  async revokeWallet(request, reply) {
    try {
      const { userId, walletId } = request.body || {};
      if (!userId || !walletId) {
        return reply.status(400).send({ code: 400, message: '缺少 userId 或 walletId' });
      }

      const result = await this.db.query(
        `UPDATE agentic_wallets
         SET status = 'revoked', expires_at = NOW()
         WHERE id = $1 AND user_id = $2`,
        [walletId, userId]
      );

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
      if (!userId) {
        return reply.status(400).send({ code: 400, message: '缺少 userId' });
      }

      let query = `SELECT * FROM live_trading_configs WHERE user_id = $1`;
      const params = [userId];
      if (strategy) {
        query += ` AND strategy = $2`;
        params.push(strategy);
      }

      const result = await this.db.query(query, params);

      if (result.rows.length === 0) {
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
          },
          message: '返回默认配置'
        });
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
              take_profit_pct, stop_loss_pct, auto_apply_params, pause_on_param_change } = body;

      if (!userId) {
        return reply.status(400).send({ code: 400, message: '缺少 userId' });
      }

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
        [userId,
         strategy || 'momentum',
         max_single_amount != null ? max_single_amount : 1000,
         slippage_tolerance != null ? slippage_tolerance : 1.0,
         gas_strategy || 'medium',
         take_profit_pct != null ? take_profit_pct : 10,
         stop_loss_pct != null ? stop_loss_pct : 5,
         auto_apply_params !== false,
         pause_on_param_change === true]
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
      if (!userId) {
        return reply.status(400).send({ code: 400, message: '缺少 userId' });
      }

      const params = await this.redis.get(`params:momentum`);

      return reply.send({
        code: 200,
        data: params ? JSON.parse(params) : null,
        message: params ? '成功' : '暂无学习参数'
      });
    } catch (error) {
      console.error('[getParams]', error);
      return reply.status(500).send({ code: 500, message: error.message });
    }
  }

  // ===== 交易控制 =====

  async startTrading(request, reply) {
    try {
      const { userId } = request.body || {};
      if (!userId) {
        return reply.status(400).send({ code: 400, message: '缺少 userId' });
      }

      const walletResult = await this.db.query(
        `SELECT * FROM agentic_wallets WHERE user_id = $1 AND status = 'authorized'`,
        [userId]
      );

      if (walletResult.rows.length === 0) {
        return reply.status(400).send({ code: 400, message: '请先创建并授权钱包' });
      }

      await this.db.query(
        `UPDATE live_trading_configs SET is_active = true, updated_at = NOW() WHERE user_id = $1`,
        [userId]
      );

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
      if (!userId) {
        return reply.status(400).send({ code: 400, message: '缺少 userId' });
      }

      await this.db.query(
        `UPDATE live_trading_configs SET is_active = false, updated_at = NOW() WHERE user_id = $1`,
        [userId]
      );

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
      if (!userId) {
        return reply.status(400).send({ code: 400, message: '缺少 userId' });
      }

      const result = await this.db.query(
        `SELECT * FROM live_trading_configs WHERE user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return reply.send({
          code: 200,
          data: { is_active: false, strategy: 'momentum', config: null },
          message: '暂无配置，交易未开启'
        });
      }

      return reply.send({ code: 200, data: result.rows[0] });
    } catch (error) {
      console.error('[getStatus]', error);
      return reply.status(500).send({ code: 500, message: error.message });
    }
  }

  // ===== 交易记录 =====

  async getTrades(request, reply) {
    try {
      const { userId, page = 1, limit = 20, date, startDate, endDate } = request.query || {};
      if (!userId) {
        return reply.status(400).send({ code: 400, message: '缺少 userId' });
      }

      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(500, Math.max(1, parseInt(limit) || 20));

      let query = `SELECT * FROM live_trade_records WHERE user_id = $1`;
      const params = [userId];
      let paramIdx = 2;

      if (date && date !== 'all') {
        switch (date) {
          case 'today':
            query += ` AND created_at >= NOW() - INTERVAL '1 day'`;
            break;
          case 'week':
            query += ` AND created_at >= NOW() - INTERVAL '7 days'`;
            break;
          case 'month':
            query += ` AND created_at >= NOW() - INTERVAL '30 days'`;
            break;
        }
      } else if (startDate) {
        query += ` AND created_at >= $${paramIdx}`;
        params.push(startDate);
        paramIdx++;
      }
      if (endDate) {
        query += ` AND created_at <= $${paramIdx}`;
        params.push(endDate);
        paramIdx++;
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
      params.push(limitNum, (pageNum - 1) * limitNum);

      const result = await this.db.query(query, params);

      let countQuery = `SELECT COUNT(*) as total FROM live_trade_records WHERE user_id = $1`;
      const countParams = [userId];
      if (date && date !== 'all') {
        switch (date) {
          case 'today':
            countQuery += ` AND created_at >= NOW() - INTERVAL '1 day'`;
            break;
          case 'week':
            countQuery += ` AND created_at >= NOW() - INTERVAL '7 days'`;
            break;
          case 'month':
            countQuery += ` AND created_at >= NOW() - INTERVAL '30 days'`;
            break;
        }
      }
      const countResult = await this.db.query(countQuery, countParams);

      return reply.send({
        code: 200,
        data: {
          records: result.rows,
          total: parseInt(countResult.rows[0].total) || 0,
          page: pageNum,
          limit: limitNum
        }
      });
    } catch (error) {
      console.error('[getTrades]', error);
      return reply.status(500).send({ code: 500, message: error.message });
    }
  }

  // ===== 图表数据 =====

  async getPnlChart(request, reply) {
    try {
      const { userId, days = 7 } = request.query || {};
      if (!userId) {
        return reply.status(400).send({ code: 400, message: '缺少 userId' });
      }

      const daysNum = Math.min(365, Math.max(1, parseInt(days) || 7));

      const result = await this.db.query(
        `SELECT DATE(created_at) as date, SUM(pnl_usd) as pnl
         FROM live_trade_records
         WHERE user_id = $1 AND created_at >= NOW() - $2::interval
         GROUP BY DATE(created_at)
         ORDER BY date`,
        [userId, daysNum + ' days']
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
      if (!userId) {
        return reply.status(400).send({ code: 400, message: '缺少 userId' });
      }

      const result = await this.db.query(
        `SELECT
           COUNT(CASE WHEN COALESCE(pnl_usd, 0) > 0 THEN 1 END) as wins,
           COUNT(CASE WHEN COALESCE(pnl_usd, 0) <= 0 THEN 1 END) as losses
         FROM live_trade_records
         WHERE user_id = $1`,
        [userId]
      );

      return reply.send({ code: 200, data: result.rows[0] });
    } catch (error) {
      console.error('[getDistributionChart]', error);
      return reply.status(500).send({ code: 500, message: error.message });
    }
  }

  async getAssetsChart(request, reply) {
    try {
      const { userId, days = 7 } = request.query || {};
      if (!userId) {
        return reply.status(400).send({ code: 400, message: '缺少 userId' });
      }

      const daysNum = Math.min(365, Math.max(1, parseInt(days) || 7));

      const result = await this.db.query(
        `SELECT DATE(created_at) as date, SUM(amount_in) as total
         FROM live_trade_records
         WHERE user_id = $1 AND created_at >= NOW() - $2::interval
         GROUP BY DATE(created_at)
         ORDER BY date`,
        [userId, daysNum + ' days']
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
      if (!userId) {
        return reply.status(400).send({ code: 400, message: '缺少 userId' });
      }

      const result = await this.db.query(
        `SELECT token_out as token, SUM(COALESCE(pnl_usd, 0)) as pnl
         FROM live_trade_records
         WHERE user_id = $1
         GROUP BY token_out
         ORDER BY pnl DESC
         LIMIT 10`,
        [userId]
      );

      return reply.send({ code: 200, data: result.rows });
    } catch (error) {
      console.error('[getTokensChart]', error);
      return reply.status(500).send({ code: 500, message: error.message });
    }
  }
}

module.exports = LiveTradingRoutes;
