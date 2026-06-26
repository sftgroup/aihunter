// ============================================================
// 动量突破 — 策略注册项
// ============================================================

const momentumRegistration = {
  strategy_id: "momentum",
  category: "dex",
  version: "3.0",
  display_name: "动量突破",
  description: "基于链上动量指标的突破交易策略",
  icon: "⚡",
  worker_class: "MomentumWorker",
  worker_file: "momentum.js",
  signal_type: "momentum_signal",
  config_schema: [
    { key: "min_score", type: "number", default: 0.5, label: "最低信号分" },
    { key: "max_single_amount", type: "number", default: 100, label: "单笔最大金额 USDT" },
    { key: "slippage_tolerance", type: "number", default: 0.005, label: "滑点容忍度" },
  ],
  risk_profile: {
    max_concurrent: 3,
    daily_max_loss_usdt: 500,
    min_balance_usdt: 50,
    gas_strategy: "standard",
    signal_timeout_seconds: 120,
  },
  trader_class: "MomentumTrader",
  trader_file: "momentum.js",
  learning_profile: {
    param_space: ["min_score", "slippage_tolerance", "max_single_amount"],
    feature_keys: ["price_change_1m", "volume_spike", "rsi", "buy_pressure"],
    prompt_template: "Analyze DEX momentum signal for {{token_symbol}} on {{chain}}. Score: {{score}}. Indicators: {{indicators}}",
  },
  enabled: true,
};

export default momentumRegistration;
