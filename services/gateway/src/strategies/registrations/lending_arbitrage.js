// ============================================================
// 借贷套利 — 策略注册项
// ============================================================

const lendingArbitrageRegistration = {
  strategy_id: "lending_arbitrage",
  category: "defi",
  version: "3.0",
  display_name: "借贷利率套利",
  description: "跨协议借贷利率差异套利策略",
  icon: "💰",
  worker_class: "LendingArbitrageWorker",
  worker_file: "lending_arbitrage.js",
  signal_type: "lending_signal",
  config_schema: [
    { key: "min_rate_spread", type: "number", default: 0.02, label: "最低利率差" },
    { key: "max_single_amount", type: "number", default: 1000, label: "单笔最大金额 USDT" },
    { key: "slippage_tolerance", type: "number", default: 0.001, label: "滑点容忍度" },
  ],
  risk_profile: {
    max_concurrent: 1,
    daily_max_loss_usdt: 300,
    min_balance_usdt: 200,
    gas_strategy: "optimized",
    signal_timeout_seconds: 300,
  },
  trader_class: "LendingArbitrageTrader",
  trader_file: "lending_arbitrage.js",
  learning_profile: {
    param_space: ["min_rate_spread", "max_single_amount"],
    feature_keys: ["protocol_a_rate", "protocol_b_rate", "rate_spread", "total_liquidity_a", "total_liquidity_b"],
    prompt_template: "Analyze lending arbitrage opportunity for {{token_symbol}}. Rate A: {{protocol_a_rate}}%, Rate B: {{protocol_b_rate}}%. Spread: {{rate_spread}}%",
  },
  enabled: true,
};

export default lendingArbitrageRegistration;
