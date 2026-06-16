/* ===== API 类型定义 ===== */

// 通用响应
export interface ApiResponse<T = any> {
  code: number;
  data?: T;
  error?: string;
  message?: string;
}

// 信号
export interface Signal {
  id: number;
  chain: string;
  contract: string;
  symbol: string;
  name: string;
  owner_renounced: boolean;
  owner_address: string;
  mintable: boolean;
  buy_tax: number;
  sell_tax: number;
  is_honeypot: string;
  lp_locked: boolean;
  lp_lock_pct: number;
  confidence: number;
  flags: string[];
  score: number;
  created_at: string;
  price_usd: number;
  liquidity_usd: number;
  pair_address: string;
}

// 模拟交易记录
export interface PaperTrade {
  id: string;
  user_id: string;
  chain: string;
  contract: string;
  symbol: string;
  side: 'buy' | 'sell';
  status: 'open' | 'closed';
  amount_usd: number;
  entry_price: number;
  exit_price: number;
  quantity: number;
  pnl_usd: number;
  pnl_pct: number;
  created_at: string;
  closed_at: string;
  strategy: string;
}

// 模拟配置
export interface PaperConfig {
  initial_balance: number;
  min_amount: number;
  max_amount: number;
  take_profit_pct: number;
  stop_loss_pct: number;
  enabled: boolean;
}

// 净值快照
export interface EquitySnapshot {
  balance: number;
  total_pnl: number;
  total_trades: number;
  win_rate: number;
  snapshot_at: string;
}

// 回测结果
export interface BacktestResult {
  total: number;
  stats: {
    total_pnl: number;
    win_rate: string;
    wins: number;
    losses: number;
    max_drawdown: number;
    sharpe_ratio: number;
    avg_pnl: number;
  };
  chain_stats: Record<string, { trades: number; wins: number; pnl: number }>;
  cum_pnl: Array<{ x: string; y: number }>;
  trades: PaperTrade[];
}

// 学习历史
export interface LearningHistory {
  id: number;
  strategy: string;
  params: Record<string, number>;
  score: number;
  experience_count: number;
  created_at: string;
}

// 学习参数
export interface LearningParams {
  experience_count: number;
  params: {
    max_slippage: number;
    position_pct: number;
    min_confidence: number;
    take_profit_pct: number;
    stop_loss_pct: number;
    trade_ratio: number;
  };
  rules: any[];
  score: number;
}

// 策略
export interface Strategy {
  id: number;
  name: string;
  type: string;
  enabled: boolean;
  config: Record<string, any>;
  created_at: string;
}

// 系统状态
export interface SystemStatus {
  gateway: { status: string };
  redis: { status: string };
  postgresql: { status: string };
  evm_worker: { status: string };
  sol_worker: { status: string };
  total_events: number;
  pending_events: number;
  open_positions: number;
  paper_pnl: number;
  recent_experiences: number;
  chain_count: number;
  chain_online: number;
}

// 借贷仓位
export interface LendingPosition {
  id: number;
  chain: string;
  protocol: string;
  asset: string;
  deposited: string;
  borrowed: string;
  health_factor: number;
  apy: number;
  created_at: string;
}

// 利率数据
export interface RateSnapshot {
  chain: string;
  protocol: string;
  asset: string;
  deposit_apy: number;
  borrow_apy: number;
  timestamp: string;
}

// 链信息
export const CHAINS = ['ETH', 'BSC', 'BASE', 'SOL'] as const;
export type Chain = typeof CHAINS[number];

export const CHAIN_COLORS: Record<string, string> = {
  ETH: '#627eea',
  BSC: '#f0b90b',
  BASE: '#0052ff',
  SOL: '#9945ff',
};
