/**
 * AIHunter V3 Phase 3 — 学习 API 路由
 * GET    /api/v3/learning/:strategy_id  获取最近学习报告
 * POST   /api/v3/learning/trigger       手动触发学习
 * POST   /api/v3/learning/:strategy_id/detect 检测是否触发学习
 */

import pg from 'pg';
import { Redis } from 'ioredis';
import { StrategyAgnosticLearner } from '../learning/StrategyAgnosticLearner.js';
import { TriggerDetector } from '../learning/TriggerDetector.js';

const { Pool } = pg;
const REDIS_URL = process.env.REDIS_URL;
const DATABASE_URL = process.env.DATABASE_URL;

export default async function learningRoutes(fastify, opts) {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const redis = new Redis(REDIS_URL);

  const learner = new StrategyAgnosticLearner({
    db: pool,
    redis: redis,
    deepseekClient: null
  });

  const detector = new TriggerDetector({
    db: pool,
    redis: redis
  });

  // ===== 获取学习报告 =====
  fastify.get('/learning/:strategy_id', async (request, reply) => {
    try {
      const { strategy_id } = request.params;
      const result = await learner.getLatestLearning(strategy_id);

      if (!result) {
        return reply.status(404).send({
          code: 404,
          error: '未找到学习记录',
          strategy_id
        });
      }

      return {
        code: 200,
        data: result
      };
    } catch (err) {
      console.error('[Learning] 获取报告失败:', err.message);
      return reply.status(500).send({
        code: 500,
        error: err.message
      });
    }
  });

  // ===== 触发学习 =====
  fastify.post('/learning/trigger', async (request, reply) => {
    try {
      const { strategy_id } = request.body;
      if (!strategy_id) {
        return reply.status(400).send({
          code: 400,
          error: '缺少 strategy_id'
        });
      }

      const result = await learner.triggerLearning(strategy_id);

      return {
        code: 200,
        data: {
          version: result.version,
          metrics: result.metrics,
          suggestions: result.suggestions,
          ai_analysis: result.ai_analysis || null
        }
      };
    } catch (err) {
      console.error('[Learning] 触发学习失败:', err.message);
      return reply.status(500).send({
        code: 500,
        error: err.message
      });
    }
  });

  // ===== 检测学习触发条件 =====
  fastify.post('/learning/:strategy_id/detect', async (request, reply) => {
    try {
      const { strategy_id } = request.params;
      const { force } = request.body || {};

      const result = await detector.detect(strategy_id, { force: !!force });

      return {
        code: 200,
        data: result
      };
    } catch (err) {
      console.error('[Learning] 检测失败:', err.message);
      return reply.status(500).send({
        code: 500,
        error: err.message
      });
    }
  });
}
