// ============================================================
// BaseAutoTrader — 通用自动交易执行引擎
// ============================================================

class BaseAutoTrader {
  constructor({ db, redis, okxClient, strategyEntry } = {}) {
    this.db = db;
    this.redis = redis;
    this.okxClient = okxClient;
    this.strategyEntry = strategyEntry;
    console.log(`[BaseAutoTrader] initialized for strategy:`, strategyEntry?.strategy_id || 'unknown');
  }

  // ---- 9 步管道 ----
  async onSignal(userId, signal) {
    const strategyId = this.strategyEntry?.strategy_id;
    try {
      // ① 实盘开关检查
      if (this.redis) {
        const active = await this.redis.hget(`trade:active:${strategyId}`, userId);
        if (active !== '1') {
          console.log(`[BaseAutoTrader] trade not active for user=${userId} strategy=${strategyId}`);
          return { ok: false, reason: 'trade_not_active' };
        }
      }

      // ② 配置加载
      const config = await this.loadStrategyConfig(userId, strategyId);
      if (!config || !config.is_active) {
        console.log(`[BaseAutoTrader] config not found or inactive for user=${userId} strategy=${strategyId}`);
        return { ok: false, reason: 'config_not_found_or_inactive' };
      }

      // ③ 信号过滤（策略钩子）
      const filtered = await this.passSignalFilter(signal, config);
      if (!filtered) {
        console.log(`[BaseAutoTrader] signal filtered out by strategy hook`);
        return { ok: false, reason: 'signal_filtered' };
      }

      // ④ 风控检查
      const riskCheck = await this.riskMiddleware?.check(userId, signal, config);
      if (riskCheck && !riskCheck.ok) {
        console.log(`[BaseAutoTrader] risk check failed: ${riskCheck.reason}`);
        return { ok: false, reason: riskCheck.reason };
      }

      // ⑤ 钱包获取
      const wallet = await this.getActiveWallet(userId);
      if (!wallet) {
        console.log(`[BaseAutoTrader] no active wallet for user=${userId}`);
        return { ok: false, reason: 'no_active_wallet' };
      }

      // ⑥ 计算金额（策略钩子）
      const amount = await this.calculateAmount(signal, config, wallet);
      if (!amount || amount <= 0) {
        console.log(`[BaseAutoTrader] calculated amount invalid: ${amount}`);
        return { ok: false, reason: 'invalid_amount' };
      }

      // ⑦ 执行交易（策略钩子）
      const execResult = await this.executeTrade(signal, config, wallet, amount);
      if (!execResult || execResult.status === 'failed') {
        console.log(`[BaseAutoTrader] executeTrade returned failure`);
        return { ok: false, reason: 'execution_failed', detail: execResult };
      }

      // ⑧ 记录写入
      if (this.recordWriter) {
        await this.recordWriter.write({
          userId,
          strategyId,
          signal,
          config,
          execResult,
        });
      }

      // ⑨ WebSocket 通知（可选）
      if (this._onTradeComplete) {
        try {
          await this._onTradeComplete(userId, signal, execResult);
        } catch (notifyErr) {
          console.log(`[BaseAutoTrader] notification error: ${notifyErr.message}`);
        }
      }

      console.log(`[BaseAutoTrader] trade completed for user=${userId} strategy=${strategyId}`);
      return { ok: true, execResult };
    } catch (err) {
      console.log(`[BaseAutoTrader] onSignal error: ${err.message}`);
      return { ok: false, reason: 'internal_error', error: err.message };
    }
  }

  // ---- 抽象钩子（由子类实现） ----
  async passSignalFilter(signal, config) {
    throw new Error('passSignalFilter must be implemented by subclass');
  }

  async calculateAmount(signal, config, wallet) {
    throw new Error('calculateAmount must be implemented by subclass');
  }

  async executeTrade(signal, config, wallet, amount) {
    throw new Error('executeTrade must be implemented by subclass');
  }

  // ---- 共享方法 ----
  async loadStrategyConfig(userId, strategyId) {
    try {
      if (!this.db) return null;
      const { rows } = await this.db.query(
        `SELECT * FROM strategy_configs WHERE user_id = $1 AND strategy_id = $2 LIMIT 1`,
        [userId, strategyId]
      );
      return rows.length > 0 ? rows[0] : null;
    } catch (err) {
      console.log(`[BaseAutoTrader] loadStrategyConfig error: ${err.message}`);
      return null;
    }
  }

  async getActiveWallet(userId) {
    try {
      if (!this.db) return null;
      const { rows } = await this.db.query(
        `SELECT * FROM agentic_wallets WHERE user_id = $1 AND is_active = true LIMIT 1`,
        [userId]
      );
      return rows.length > 0 ? rows[0] : null;
    } catch (err) {
      console.log(`[BaseAutoTrader] getActiveWallet error: ${err.message}`);
      return null;
    }
  }

  setRiskMiddleware(rw) {
    this.riskMiddleware = rw;
  }

  setRecordWriter(rw) {
    this.recordWriter = rw;
  }

  setOnTradeComplete(fn) {
    this._onTradeComplete = fn;
  }
}

export default BaseAutoTrader;
