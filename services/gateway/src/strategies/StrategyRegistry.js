// ============================================================
// StrategyRegistry — 策略注册中心
// ============================================================

class StrategyRegistry {
  constructor() {
    this._items = new Map();
    console.log('[StrategyRegistry] initialized');
  }

  register(entry) {
    if (!entry || !entry.strategy_id) {
      console.log('[StrategyRegistry] register skipped: missing strategy_id');
      return;
    }
    this._items.set(entry.strategy_id, entry);
    console.log(`[StrategyRegistry] registered: ${entry.strategy_id}`);
  }

  get(strategyId) {
    return this._items.get(strategyId) || null;
  }

  listByCategory(category) {
    const results = [];
    for (const entry of this._items.values()) {
      if (entry.category === category) {
        results.push(entry);
      }
    }
    return results;
  }

  listEnabled() {
    const results = [];
    for (const entry of this._items.values()) {
      if (entry.enabled === true) {
        results.push(entry);
      }
    }
    return results;
  }

  async loadFromDatabase(db) {
    try {
      const { rows } = await db.query(
        'SELECT strategy_id, category, display_name, description, icon, enabled, registration FROM strategy_registry WHERE enabled = true'
      );
      for (const row of rows) {
        const entry = {
          strategy_id: row.strategy_id,
          category: row.category,
          display_name: row.display_name,
          description: row.description,
          icon: row.icon,
          enabled: row.enabled,
          ...(typeof row.registration === 'object' ? row.registration : {}),
        };
        this.register(entry);
      }
      console.log(`[StrategyRegistry] loadFromDatabase: ${rows.length} entries loaded`);
      return rows.length;
    } catch (err) {
      console.log(`[StrategyRegistry] loadFromDatabase error: ${err.message}`);
      return 0;
    }
  }
}

export default StrategyRegistry;
