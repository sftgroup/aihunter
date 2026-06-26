// ============================================================
// Live Trading V3 API Routes — ESM Fastify plugin
// 与现有 liveTrading.js (agentic-wallet) 完全独立
// Prefix: /api/v3
// ============================================================


/** 验证 userId 为合法 EVM 地址 */
function validateUserId(userId) {
  if (!userId || typeof userId !== "string") return false;
  return /^0x[a-fA-F0-9]{40}$/.test(userId);
}

export default async function liveTradingV3Routes(fastify, opts) {
  // ================================================================
  // POST /api/v3/live/toggle — 开启/暂停策略
  // ================================================================
  fastify.post('/live/toggle', async (request, reply) => {
    try {
      const { strategy_id, active, userId } = request.body || {};
      if (!strategy_id || !userId) {
        return reply.status(400).send({ code: 400, error: '缺少 strategy_id 或 userId' });
      }
      if (!validateUserId(userId)) {
        return reply.status(400).send({ code: 400, error: '无效的 userId 格式' });
      }

      const redis = request.server.redis || (request.server.execution?.dispatcher?.redis);
      if (!redis) {
        return reply.status(500).send({ code: 500, error: 'Redis 不可用' });
      }

      const isActive = active ? '1' : '0';
      await redis.hset(`trade:active:${strategy_id}`, userId, isActive);

      const message = active ? '策略已开启' : '策略已暂停';
      console.log(`[LiveTradingV3] toggle: strategy=${strategy_id} userId=${userId} active=${active}`);
      return { code: 200, message };
    } catch (err) {
      console.error('[LiveTradingV3] toggle error:', err.message);
      return reply.status(500).send({ code: 500, error: err.message });
    }
  });

  // ================================================================
  // GET /api/v3/live/status — 查询当前实盘状态
  // 返回: wallet, strategies, risk 三部分
  // ================================================================
  fastify.get('/live/status', async (request, reply) => {
    try {
      const { userId } = request.query;
      if (!userId) {
        return reply.status(400).send({ code: 400, error: '缺少 userId' });
      }

      const server = request.server;
      const redis = server.redis || (server.execution?.dispatcher?.redis);
      const db = server.db || (server.execution?.dispatcher?.db);

      if (!redis || !db) {
        return reply.status(500).send({ code: 500, error: '依赖服务不可用' });
      }

      // ----- 策略状态 -----
      const registry = server.execution?.registry;
      let strategies = [];

      if (registry) {
        const allEntries = registry.listEnabled();
        for (const entry of allEntries) {
          const isActive = await redis.hget(`trade:active:${entry.strategy_id}`, userId);
          strategies.push({
            strategy_id: entry.strategy_id,
            display_name: entry.display_name,
            category: entry.category,
            description: entry.description,
            icon: entry.icon,
            active: isActive === '1',
          });
        }
      }

      // ----- 钱包状态 -----
      let wallet = {};
      try {
        const { rows } = await db.query(
          `SELECT * FROM agentic_wallets WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
          [userId]
        );
        if (rows.length > 0) {
          const w = rows[0];
          wallet = {
            wallet_address: w.wallet_address,
            chain: w.chain,
            status: w.status,
            authorized_at: w.authorized_at,
            expires_at: w.expires_at,
          };
        }
      } catch (walletErr) {
        console.log('[LiveTradingV3] wallet query error:', walletErr.message);
      }

      // ----- 风控统计 -----
      let risk = { daily_max_loss: 0, today_loss: 0, max_concurrent: 0, current_concurrent: 0 };
      try {
        // 当日亏损汇总
        const lossRow = await db.query(
          `SELECT COALESCE(SUM(COALESCE(net_pnl_usdt, 0)), 0) AS today_loss
           FROM trade_records
           WHERE user_id = $1 AND status = 'completed' AND net_pnl_usdt < 0
             AND created_at >= CURRENT_DATE`,
          [userId]
        );
        risk.today_loss = parseFloat(lossRow.rows[0]?.today_loss || 0);

        // 当前并发执行数
        const concurrentRow = await db.query(
          `SELECT COUNT(*) AS cnt FROM trade_records
           WHERE user_id = $1 AND status = 'executing'`,
          [userId]
        );
        risk.current_concurrent = parseInt(concurrentRow.rows[0]?.cnt || '0', 10);

        // 取风控配置（从任意策略配置）
        const configRows = await db.query(
          `SELECT daily_max_loss_usdt, max_concurrent FROM strategy_configs
           WHERE user_id = $1 AND is_active = true LIMIT 1`,
          [userId]
        );
        if (configRows.rows.length > 0) {
          risk.daily_max_loss = parseFloat(configRows.rows[0].daily_max_loss_usdt || 0);
          risk.max_concurrent = parseInt(configRows.rows[0].max_concurrent || '0', 10);
        }
      } catch (riskErr) {
        console.log('[LiveTradingV3] risk query error:', riskErr.message);
      }

      return {
        code: 200,
        data: { wallet, strategies, risk },
      };
    } catch (err) {
      console.error('[LiveTradingV3] status error:', err.message);
      return reply.status(500).send({ code: 500, error: err.message });
    }
  });

  // ================================================================
  // GET /api/v3/live/records — 查询交易记录（分页）
  // ================================================================
  fastify.get('/live/records', async (request, reply) => {
    try {
      const { userId, strategy_id, page = 1, size = 20 } = request.query;
      if (!userId) {
        return reply.status(400).send({ code: 400, error: '缺少 userId' });
      }

      const server = request.server;
      const db = server.db || (server.execution?.dispatcher?.db);
      if (!db) {
        return reply.status(500).send({ code: 500, error: '数据库不可用' });
      }

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(size, 10) || 20));
      const offset = (pageNum - 1) * pageSize;

      let whereClause = 'WHERE user_id = $1';
      const params = [userId];
      let paramIdx = 2;

      if (strategy_id) {
        whereClause += ` AND strategy_id = $${paramIdx}`;
        params.push(strategy_id);
        paramIdx++;
      }

      // 总数
      const countResult = await db.query(
        `SELECT COUNT(*) AS total FROM trade_records ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0]?.total || '0', 10);

      // 分页数据
      const dataResult = await db.query(
        `SELECT * FROM trade_records ${whereClause} ORDER BY created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, pageSize, offset]
      );

      return {
        code: 200,
        data: {
          records: dataResult.rows,
          total,
          page: pageNum,
          size: pageSize,
        },
      };
    } catch (err) {
      console.error('[LiveTradingV3] records error:', err.message);
      return reply.status(500).send({ code: 500, error: err.message });
    }
  });
}
