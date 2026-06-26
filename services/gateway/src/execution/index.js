// ============================================================
// 执行层入口 — Redis 信号订阅 + 分发
// ESM module
// ============================================================

import StrategyRegistry from '../strategies/StrategyRegistry.js';
import SignalDispatcher from './SignalDispatcher.js';

/**
 * 初始化执行层
 * @param {Object} deps - { db, redis, okxClient }
 * @returns {Promise<{registry, dispatcher, subscriber}>}
 */
export async function initExecutionLayer({ db, redis, okxClient } = {}) {
  const registry = new StrategyRegistry();
  await registry.loadFromDatabase(db);

  const dispatcher = new SignalDispatcher({ registry, db, redis, okxClient });

  // 订阅所有已启用策略的信号通道
  const subscriber = redis.duplicate();
  const enabledEntries = registry.listEnabled();

  for (const entry of enabledEntries) {
    await subscriber.subscribe(`trade:signals:${entry.strategy_id}`);
    console.log(`[Execution] 已订阅 ${entry.strategy_id}`);
  }

  subscriber.on('message', async (channel, message) => {
    try {
      const signal = JSON.parse(message);
      const strategyId = signal.strategy_id || channel.replace('trade:signals:', '');
      const activeUsers = await redis.hkeys(`trade:active:${strategyId}`);

      for (const userId of activeUsers) {
        const isActive = await redis.hget(`trade:active:${strategyId}`, userId);
        if (isActive !== '1') continue;

        const result = await dispatcher.dispatch({ ...signal, user_id: userId });
        if (result.executed) {
          // 学习触发检查：每 30 笔交易触发一次
          await checkLearningTrigger(redis, db, strategyId);
        }
        console.log(`[Execution] ${strategyId}:${userId} → ${result.executed ? '✅' : '⏭️ ' + (result.reason || '')}`);
      }
    } catch (err) {
      console.error('[Execution] 信号处理异常:', err.message);
    }
  });

  console.log(`[Execution] 执行层已启动, 已订阅 ${enabledEntries.length} 个策略通道`);
  return { registry, dispatcher, subscriber };
}

/**
 * 检查是否需要触发学习（每 30 笔 completed 交易触发一次）
 */
async function checkLearningTrigger(redis, db, strategyId) {
  try {
    const key = `learning:check:${strategyId}`;
    const { rows } = await db.query(
      `SELECT COUNT(*) AS cnt FROM trade_records WHERE strategy_id = $1 AND status = 'completed'`,
      [strategyId]
    );
    const total = parseInt(rows[0]?.cnt || '0', 10);
    const last = parseInt(await redis.get(key) || '0', 10);

    if (total - last >= 30) {
      await redis.publish('learning:trigger', JSON.stringify({
        strategy: strategyId,
        new_count: total,
        timestamp: Date.now(),
      }));
      await redis.set(key, String(total));
      console.log(`[Execution] learning trigger fired for ${strategyId}, total=${total}`);
    }
  } catch (err) {
    console.log(`[Execution] checkLearningTrigger error: ${err.message}`);
  }
}
