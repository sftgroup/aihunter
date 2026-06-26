// ============================================================
// 价差套利 — 策略注册项
// ============================================================

const spreadArbitrageRegistration = {
  strategy_id: "spread_arbitrage",
  category: "defi",
  version: "3.0",
  display_name: "DEX价差套利",
  description: "跨DEX价格差异套利策略",
  icon: "🔄",
  worker_class: "SpreadArbitrageWorker",
  worker_file: "spread_arbitrage.js",
  signal_type: "spread_signal",
  config_schema: [
    { key: "min_spread", type: "number", default: 0.01, label: "最低价差" },
    { key: "max_single_amount", type: "number", default: 200, label: "单笔最大金额 USDT" },
    { key: "slippage_tolerance", type: "number", default: 0.003, label: "滑点容忍度" },
  ],
  risk_profile: {
    max_concurrent: 2,
    daily_max_loss_usdt: 800,
    min_balance_usdt: 100,
    gas_strategy: "aggressive",
    signal_timeout_seconds: 60,
  },
  trader_class: "SpreadArbitrageTrader",
  trader_file: "spread_arbitrage.js",
  learning_profile: {
    param_space: ["min_spread", "slippage_tolerance", "max_single_amount"],
    feature_keys: ["dex_a_price", "dex_b_price", "spread_pct", "liquidity_a", "liquidity_b"],
    prompt_template: "Evaluate spread arbitrage for {{token_symbol}} between DEXes. Spread: {{spread_pct}}%. Liquidity: {{liquidity_a}} / {{liquidity_b}}",
  },
  enabled: true,
};

export default spreadArbitrageRegistration;
