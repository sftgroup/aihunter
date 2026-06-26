// ============================================================
// RiskMiddleware — 风控中间件
// ============================================================

class RiskMiddleware {
  constructor({ db, redis } = {}) {
    this.db = db;
    this.redis = redis;
    console.log('[RiskMiddleware] initialized');
  }

  /**
   * 5 项风控检查
   * @returns {{ ok: boolean, reason?: string }}
   */
  async check(userId, signal, config) {
    try {
      // ① 信号时效检查
      if (signal && config?.risk_profile?.signal_timeout_seconds) {
        const ttl = config.risk_profile.signal_timeout_seconds;
        const age = signal.signal_age || signal.age || 0;
        if (age > ttl) {
          console.log(`[RiskMiddleware] signal expired: age=${age}s ttl=${ttl}s`);
          return { ok: false, reason: 'signal_expired' };
        }
      }

      // ② 日亏损检查
      if (config?.daily_max_loss_usdt > 0) {
        const dailyLoss = await this._sumDailyLoss(userId, config.strategy_id);
        if (dailyLoss >= config.daily_max_loss_usdt) {
          console.log(`[RiskMiddleware] daily loss limit hit: ${dailyLoss} >= ${config.daily_max_loss_usdt}`);
          return { ok: false, reason: 'daily_loss_limit' };
        }
      }

      // ③ 最大并发检查
      if (config?.max_concurrent > 0) {
        const concurrent = await this._countConcurrent(userId, config.strategy_id);
        if (concurrent >= config.max_concurrent) {
          console.log(`[RiskMiddleware] max concurrent reached: ${concurrent}/${config.max_concurrent}`);
          return { ok: false, reason: 'max_concurrent' };
        }
      }

      // ④ 信号去重（Redis 5min TTL）
      if (this.redis && signal?.token_address) {
        const dedupKey = `risk:dup:${userId}:${signal.token_address}`;
        const existed = await this.redis.setnx(dedupKey, '1');
        if (existed === 0) {
          console.log(`[RiskMiddleware] duplicate signal for token=${signal.token_address}`);
          return { ok: false, reason: 'duplicate_signal' };
        }
        await this.redis.expire(dedupKey, 300);
      }

      // ⑤ 余额检查
      if (config?.min_balance_usdt > 0) {
        const balance = await this._getWalletBalance(userId);
        if (balance < config.min_balance_usdt) {
          console.log(`[RiskMiddleware] insufficient balance: ${balance} < ${config.min_balance_usdt}`);
          return { ok: false, reason: 'insufficient_balance' };
        }
      }

      return { ok: true };
    } catch (err) {
      console.log(`[RiskMiddleware] check error: ${err.message}`);
      return { ok: false, reason: 'risk_check_error' };
    }
  }

  /** 汇总当日已完成亏损 */
  async _sumDailyLoss(userId, strategyId) {
    try {
      if (!this.db) return 0;
      const { rows } = await this.db.query(
        `SELECT COALESCE(SUM(net_pnl_usdt), 0) AS total_loss
         FROM trade_records
         WHERE user_id = $1
           AND strategy_id = $2
           AND status = 'completed'
           AND net_pnl_usdt < 0
           AND created_at >= CURRENT_DATE`,
        [userId, strategyId]
      );
      return parseFloat(rows[0]?.total_loss || 0);
    } catch (err) {
      console.log(`[RiskMiddleware] _sumDailyLoss error: ${err.message}`);
      return 0;
    }
  }

  /** 统计执行中的交易 */
  async _countConcurrent(userId, strategyId) {
    try {
      if (!this.db) return 0;
      const { rows } = await this.db.query(
        `SELECT COUNT(*) AS cnt
         FROM trade_records
         WHERE user_id = $1
           AND strategy_id = $2
           AND status = 'executing'`,
        [userId, strategyId]
      );
      return parseInt(rows[0]?.cnt || 0, 10);
    } catch (err) {
      console.log(`[RiskMiddleware] _countConcurrent error: ${err.message}`);
      return 0;
    }
  }

  /** 查询钱包余额（USDT 本位） */
  async _getWalletBalance(userId) {
    try {
      if (!this.db) return 0;
      const { rows } = await this.db.query(
        `SELECT balance_usdt FROM agentic_wallets WHERE user_id = $1 AND is_active = true LIMIT 1`,
        [userId]
      );
      return parseFloat(rows[0]?.balance_usdt || 0);
    } catch (err) {
      console.log(`[RiskMiddleware] _getWalletBalance error: ${err.message}`);
      return 0;
    }
  }
}

export default RiskMiddleware;
