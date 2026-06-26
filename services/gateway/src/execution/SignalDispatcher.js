// ============================================================
// SignalDispatcher — 信号分发器
// ESM: 从 strategy_registry 查找策略 → 懒加载 Trader → 执行 onSignal
// ============================================================

const ALLOWED_TRADER_CLASSES = new Set(["BaseAutoTrader", "MomentumTrader", "SpreadArbitrageTrader"]);

class SignalDispatcher {
  constructor({ registry, db, redis, okxClient } = {}) {
    this.registry = registry;
    this.db = db;
    this.redis = redis;
    this.okxClient = okxClient;
    this._traderCache = new Map();
    console.log('[SignalDispatcher] initialized');
  }

  /**
   * 分发信号到对应策略处理器
   * @param {Object} signal - { strategy_id, chain, token_address, ... }
   * @param {string} userId
   * @returns {Promise<{executed: boolean, reason?: string}>}
   */
  async dispatch(signal, userId) {
    const strategyId = signal.strategy_id;
    if (!strategyId) {
      console.log('[SignalDispatcher] dispatch skipped: no strategy_id in signal');
      return { executed: false, reason: 'missing_strategy_id' };
    }

    try {
      // ① 从 registry 获取策略注册项
      const strategyEntry = this.registry.get(strategyId);
      if (!strategyEntry) {
        console.log(`[SignalDispatcher] strategy not found: ${strategyId}`);
        return { executed: false, reason: 'strategy_not_registered' };
      }

      // ② 懒加载 Trader
      const trader = await this._loadTrader(strategyEntry);
      if (!trader) {
        console.log(`[SignalDispatcher] trader loading failed for ${strategyId}`);
        return { executed: false, reason: 'trader_load_failed' };
      }

      // ③ 添加 userId 到 signal 并执行
      const signalWithUser = { ...signal, user_id: userId };
      const result = await trader.onSignal(userId, signalWithUser);

      // ④ 返回执行结果
      if (result && result.ok) {
        return { executed: true, detail: result.execResult };
      }
      return { executed: false, reason: result?.reason || 'trade_rejected' };
    } catch (err) {
      console.log(`[SignalDispatcher] dispatch error: ${err.message}`);
      return { executed: false, reason: `dispatch_error: ${err.message}` };
    }
  }

  /**
   * 懒加载 Trader 实例（带缓存）
   */
  async _loadTrader(strategyEntry) {
    const strategyId = strategyEntry.strategy_id;
    if (this._traderCache.has(strategyId)) {
      return this._traderCache.get(strategyId);
    }

    try {
      // 从 registration 获取 trader_class，构造模块路径
      const traderClass = strategyEntry.trader_class || 'BaseAutoTrader';
      if (!ALLOWED_TRADER_CLASSES.has(traderClass)) {
        console.log(`[SignalDispatcher] trader NOT in whitelist: ${traderClass}`);
        return null;
      }
      const modulePath = `./traders/${traderClass}.js`;

      let TraderModule;
      try {
        TraderModule = await import(modulePath);
      } catch (importErr) {
        // 降级：用 trader_file 字段尝试
        const traderFile = strategyEntry.trader_file || '';
        if (traderFile) {
          const fallbackPath = `./traders/${traderFile.replace(/\.js$/, '')}.js`;
          TraderModule = await import(fallbackPath);
        } else {
          throw importErr;
        }
      }

      const TraderClass = TraderModule.default;
      if (typeof TraderClass !== 'function') {
        console.log(`[SignalDispatcher] ${modulePath} does not export default class`);
        return null;
      }

      const trader = new TraderClass({
        db: this.db,
        redis: this.redis,
        okxClient: this.okxClient,
        strategyEntry,
      });

      // 注入风控 + 记录写入
      const { default: RiskMiddleware } = await import('./RiskMiddleware.js');
      const { default: RecordWriter } = await import('./RecordWriter.js');
      trader.setRiskMiddleware(new RiskMiddleware({ db: this.db, redis: this.redis }));
      trader.setRecordWriter(new RecordWriter({ db: this.db }));

      this._traderCache.set(strategyId, trader);
      console.log(`[SignalDispatcher] trader loaded: ${traderClass} for ${strategyId}`);
      return trader;
    } catch (err) {
      console.log(`[SignalDispatcher] _loadTrader error: ${err.message}`);
      return null;
    }
  }

  /** 清空 trader 缓存（用于热加载） */
  clearCache() {
    this._traderCache.clear();
    console.log('[SignalDispatcher] trader cache cleared');
  }
}

export default SignalDispatcher;
