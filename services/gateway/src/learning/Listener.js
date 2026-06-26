/**
 * AIHunter V3 Phase 3 — 学习事件监听器
 * 订阅 Redis learning:trigger 事件，自动执行学习
 */

import { StrategyAgnosticLearner } from './StrategyAgnosticLearner.js';

export async function startLearningListener({ redis, db, deepseekClient }) {
  const learner = new StrategyAgnosticLearner({ db, redis, deepseekClient });

  const subscriber = redis.duplicate();
  await subscriber.subscribe('learning:trigger');

  subscriber.on('message', async (channel, message) => {
    try {
      let parsed;
      try {
        parsed = JSON.parse(message);
      } catch {
        // 如果不是 JSON，把整个消息当作策略ID
        parsed = { strategy: message };
      }

      const strategy = parsed.strategy || parsed.strategy_id;
      if (!strategy) {
        console.error('[Learning] 收到无效触发事件:', message);
        return;
      }

      const timestamp = parsed.timestamp || new Date().toISOString();
      console.log('[Learning] 收到触发事件: ' + strategy + ' @ ' + timestamp);

      const result = await learner.triggerLearning(strategy);
      console.log('[Learning] ' + strategy + ' 学习完成: v' + result.version);

      // 发布完成事件
      const completeEvent = JSON.stringify({
        strategy,
        version: result.version,
        timestamp: new Date().toISOString(),
        status: 'completed'
      });
      await redis.publish('learning:complete', completeEvent).catch(() => {});
    } catch (err) {
      console.error('[Learning] 学习异常:', err.message);
    }
  });

  console.log('[Learning] 监听器已启动，订阅 channel: learning:trigger');
  return { subscriber, learner };
}
