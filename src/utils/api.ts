/* ===== API 封装 ===== */
import type { ApiResponse, Signal, PaperTrade, PaperConfig, BacktestResult, LearningHistory, LearningParams, SystemStatus, Strategy, RateSnapshot, LendingPosition, EquitySnapshot } from '../types/api';

const API_BASE = window.location.origin + '/api';

async function request<T>(url: string, options?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(API_BASE + url, {
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      ...options,
    });
    return await res.json();
  } catch (e: any) {
    return { code: 500, error: e.message };
  }
}

// ===== AI 配置 =====
export const aiApi = {
  getConfig: () => request<Record<string, string>>('/config/ai'),
  saveConfig: (provider: string, apiKey: string) =>
    request('/config/ai', { method: 'POST', body: JSON.stringify({ provider, apiKey }) }),
  getProviders: () => request<string[]>('/config/ai/providers'),
};

// ===== RPC 配置 =====
export const rpcApi = {
  getConfig: () => request<Record<string, string>>('/config/rpc'),
  addRpc: (chain: string, url: string) =>
    request('/config/rpc', { method: 'POST', body: JSON.stringify({ chain, url }) }),
  removeRpc: (chain: string, url: string) =>
    request('/config/rpc/remove', { method: 'POST', body: JSON.stringify({ chain, url }) }),
};

// ===== 模拟交易 =====
export const paperApi = {
  getConfig: (userId = 'paper') => request<PaperConfig>(`/trade/paper/config?userId=${userId}`),
  saveConfig: (config: Partial<PaperConfig>) =>
    request('/trade/paper/config', { method: 'POST', body: JSON.stringify({ ...config, userId: 'paper' }) }),
  reset: () => request<{ balance: number }>('/trade/paper/reset', { method: 'POST', body: JSON.stringify({ userId: 'paper' }) }),
  getTrades: (limit = 100) => request<PaperTrade[]>(`/trade/portfolio?limit=${limit}`),
  getEquity: (limit = 100) => request<EquitySnapshot[]>(`/trade/paper/equity?limit=${limit}`),
  backtest: (hours: string, chain: string, amount: number) =>
    request<BacktestResult>(`/trade/paper/backtest?hours=${encodeURIComponent(hours)}&chain=${encodeURIComponent(chain)}&amount=${amount}`),
};

// ===== 信号 =====
export const signalApi = {
  getRecent: (limit = 50) => request<Signal[]>(`/trade/paper/signals?limit=${limit}`),
};

// ===== 学习 =====
export const learningApi = {
  getParams: (strategy = 'signal_follow') => request<LearningParams>(`/learning/params/${strategy}`),
  getHistory: (strategy = 'signal_follow', limit = 50) =>
    request<LearningHistory[]>(`/learning/history?strategy=${strategy}&limit=${limit}`),
};

// ===== 策略 =====
export const strategyApi = {
  list: () => request<Strategy[]>('/strategies'),
  update: (id: number, data: Partial<Strategy>) =>
    request('/strategies', { method: 'POST', body: JSON.stringify({ id, ...data }) }),
};

// ===== 最近信号（缓存）=====
export const signalsApi = {
  getRecent: (limit = 20) => request<any[]>(`/signals/recent?limit=${limit}`),
};

// ===== 系统 =====
export const systemApi = {
  getStatus: () => request<SystemStatus>('/system/status'),
};

// ===== 套利 =====
export const lendingApi = {
  getPositions: () => request<LendingPosition[]>('/lending/positions'),
  getRates: () => request<RateSnapshot[]>('/lending/rates'),
  getRateHistory: (chain: string, protocol: string, asset: string) =>
    request<RateSnapshot[]>(`/lending/rate-history?chain=${chain}&protocol=${protocol}&asset=${asset}`),
};
