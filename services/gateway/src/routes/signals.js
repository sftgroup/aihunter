/**
 * AIHunter V3 — 信号历史查询路由
 * GET /api/v3/signals/:strategy_id — 从 Redis ZSET 读取信号历史
 */
import { Redis } from 'ioredis';

const REDIS_URL = process.env.REDIS_URL;

export default async function signalRoutes(fastify, opts) {
  const redis = new Redis(REDIS_URL);

  // ===== 查询策略信号历史 =====
  fastify.get('/signals/:strategy_id', async (request, reply) => {
    try {
      const { strategy_id } = request.params;
      const page = parseInt(request.query.page) || 1;
      const size = parseInt(request.query.size) || 20;

      const zsetKey = 'signals:' + strategy_id + ':recent';

      // 获取总数
      const total = await redis.zcard(zsetKey);

      // 按 score（时间戳）降序分页
      const start = (page - 1) * size;
      const end = start + size - 1;
      const raw = await redis.zrevrange(zsetKey, start, end);

      const signals = raw
        .map((s) => {
          try { return JSON.parse(s); } catch { return null; }
        })
        .filter(Boolean);

      return {
        code: 200,
        data: { signals, total, page, size },
      };
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ code: 500, error: 'Internal server error' });
    }
  });

  // 清理 Redis 连接
  fastify.addHook('onClose', (instance, done) => {
    redis.quit();
    done();
  });
}
