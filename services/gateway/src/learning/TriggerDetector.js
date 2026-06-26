/**
 * AIHunter V3 Phase 3 — 检测学习触发条件
 *
 * 适配现有 DB schema:
 *   learning_history: id, strategy, params(jsonb), rules(jsonb), score, experience_count, created_at
 *   trade_records: id, strategy_id, ...
 */

export class TriggerDetector {
  constructor({ db, redis } = {}) {
    this.db = db;
    this.redis = redis;
  }

  /**
   * 检查是否应该触发学习
   * @param {string} strategyId
   * @param {object} options
   * @param {boolean} [options.force] - 强制触发
   * @returns {Promise<{should_trigger: boolean, reason: string}>}
   */
  async detect(strategyId, { force } = {}) {
    try {
      // ① 强制触发
      if (force) {
        return { should_trigger: true, reason: '手动强制触发' };
      }

      // ② 查询最新学习记录
      const latestLearning = await this.db.query(
        'SELECT score, params, created_at FROM learning_history '
        + 'WHERE strategy = $1 ORDER BY score DESC LIMIT 1',
        [strategyId]
      );

      // ③ 获取当前最大 trade_id
      const maxTradeResult = await this.db.query(
        'SELECT MAX(id) AS max_id FROM trade_records WHERE strategy_id = $1',
        [strategyId]
      );
      const currentMaxTradeId = maxTradeResult.rows[0]?.max_id || 0;

      if (latestLearning.rows.length === 0) {
        return { should_trigger: true, reason: '首次学习' };
      }

      const lastLearning = latestLearning.rows[0];
      const params = typeof lastLearning.params === 'string'
        ? JSON.parse(lastLearning.params)
        : (lastLearning.params || {});
      const lastMaxTradeId = params._max_trade_id || 0;

      // 每30笔新交易自动触发
      const newTradeCount = currentMaxTradeId - lastMaxTradeId;
      if (newTradeCount >= 30) {
        return {
          should_trigger: true,
          reason: '新增 ' + newTradeCount + ' 笔交易（阈值30笔），自动触发'
        };
      }

      // ④ 距离上次学习超过6小时自动触发
      const lastLearningTime = new Date(lastLearning.created_at).getTime();
      const now = Date.now();
      const hoursSinceLastLearning = (now - lastLearningTime) / (1000 * 60 * 60);
      if (hoursSinceLastLearning >= 6) {
        return {
          should_trigger: true,
          reason: '距离上次学习已 ' + hoursSinceLastLearning.toFixed(1)
            + ' 小时（阈值6小时），自动触发'
        };
      }

      return {
        should_trigger: false,
        reason: '未触发：新增 ' + newTradeCount + ' 笔交易（阈值30），距上次学习 '
          + hoursSinceLastLearning.toFixed(1) + ' 小时（阈值6小时）'
      };
    } catch (err) {
      console.error('[Learning] 检测触发条件失败:', err.message);
      return { should_trigger: false, reason: '检测异常: ' + err.message };
    }
  }
}
