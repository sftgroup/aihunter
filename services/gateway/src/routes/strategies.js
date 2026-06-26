/**
 * AIHunter V3 — 策略管理路由
 * GET/PUT /api/v3/strategies 策略注册表 + 用户配置
 */
import pg from 'pg';
import { Redis } from 'ioredis';

const { Pool } = pg;
const REDIS_URL = process.env.REDIS_URL;
const DATABASE_URL = process.env.DATABASE_URL;

export default async function strategyRoutes(fastify, opts) {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const redis = new Redis(REDIS_URL);

  // ===== 注册表查询 —— 从 DB 获取全部策略 =====
  fastify.get('/strategies', async (request, reply) => {
    try {
      const { category } = request.query;
      let query = 'SELECT sr.*, sc.config FROM strategy_registry sr LEFT JOIN strategy_configs sc ON sr.strategy_id = sc.strategy_id';
      const params = [];
      if (category) {
        params.push(category);
        query += ' WHERE sr.category = $' + params.length;
      }
      query += ' ORDER BY sr.display_name ASC';
      const result = await pool.query(query, params);

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();

      const strategies = await Promise.all(result.rows.map(async (row) => {
        let metrics = null;
        if (row.enabled) {
          try {
            const agg = await pool.query(
              'SELECT COUNT(*) AS signals, COUNT(*) FILTER (WHERE side = \'BUY\') AS trades, COALESCE(SUM(pnl_usd), 0) AS pnl FROM trade_records WHERE strategy_id = $1 AND created_at >= $2 AND created_at <= $3',
              [row.strategy_id, todayStart, todayEnd]
            );
            if (agg.rows.length > 0) {
              metrics = {
                signals: parseInt(agg.rows[0].signals) || 0,
                trades: parseInt(agg.rows[0].trades) || 0,
                pnl: parseFloat(agg.rows[0].pnl) || 0,
              };
            }
          } catch (e) {
            // trade_records 可能不存在或字段不同，静默降级
          }
        }

        return {
          strategy_id: row.strategy_id,
          category: row.category,
          display_name: row.display_name,
          description: row.description,
          icon: row.icon,
          enabled: row.enabled,
          metrics: row.enabled ? (metrics || { signals: 0, trades: 0, pnl: 0 }) : null,
        };
      }));

      return { code: 200, data: strategies };
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ code: 500, error: 'Internal server error' });
    }
  });

  // ===== 获取单策略用户配置 =====
  fastify.get('/strategies/:id/config', async (request, reply) => {
    try {
      const { id } = request.params;
      const { user_id } = request.query;
      const uid = user_id || 'paper';

      // 查询策略注册
      const reg = await pool.query(
        'SELECT registration FROM strategy_registry WHERE strategy_id = $1',
        [id]
      );
      if (reg.rows.length === 0) {
        return reply.status(404).send({ code: 404, error: 'Strategy not found' });
      }

      const registration = reg.rows[0].registration || {};
      const schema = typeof registration === 'string' ? JSON.parse(registration) : registration;
      const configDefaults = schema.defaults || {};

      // 查询用户配置
      const cfg = await pool.query(
        'SELECT config FROM strategy_configs WHERE strategy_id = $1 AND user_id = $2',
        [id, uid]
      );

      const config = cfg.rows.length > 0 ? cfg.rows[0].config : configDefaults;
      const configParsed = typeof config === 'string' ? JSON.parse(config) : config;

      return {
        code: 200,
        data: {
          strategy_id: id,
          ...configParsed,
          schema,
        },
      };
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ code: 500, error: 'Internal server error' });
    }
  });

  // ===== 更新用户策略配置 =====
  fastify.put('/strategies/:id/config', async (request, reply) => {
    try {
      const { id } = request.params;
      const { user_id, ...configFields } = request.body;
      const uid = user_id || 'paper';

      await pool.query(
        'INSERT INTO strategy_configs (strategy_id, user_id, config, updated_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT (strategy_id, user_id) DO UPDATE SET config = $3, updated_at = NOW()',
        [id, uid, JSON.stringify(configFields)]
      );

      return { code: 200, message: 'Config updated', data: configFields };
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ code: 500, error: 'Internal server error' });
    }
  });

  // 清理连接
  fastify.addHook('onClose', (instance, done) => {
    redis.quit();
    pool.end();
    done();
  });
}
