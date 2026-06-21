/* ===== API 封装 ===== */
import type {
  ApiResponse, PaperConfig, BacktestResult,
  LearningHistory, LearningParams, SystemStatus, Strategy,
  RateSnapshot, LendingPosition, EquitySnapshot, PortfolioResponse,
  AiSentimentResult, SmartMoneyResult, OfflineBacktestResult,
} from '../types/api';

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
  getTrades: () => request<PortfolioResponse>('/trade/portfolio'),
  getEquity: (limit = 200) => request<EquitySnapshot[]>(`/trade/paper/equity?limit=${limit}`),
  backtest: (hours: string, chain: string, amount: number) =>
    request<BacktestResult>(`/trade/paper/backtest?hours=${encodeURIComponent(hours)}&chain=${encodeURIComponent(chain)}&amount=${amount}`),
};

// ===== 信号缓存 =====
export const signalsApi = {
  getRecent: (limit = 20) => request<any[]>(`/signals/recent?limit=${limit}`),
};

export const signalsPageApi = {
  getPage: (page: number, size: number, chain?: string) =>
    request<any[]>(`/signals/page?page=${page}&size=${size}${chain ? `&chain=${chain}` : ''}`),
};

// ===== 学习系统 =====
export const learningApi = {
  getParams: (strategy = 'signal_follow') => request<LearningParams>(`/learning/params/${strategy}`),
  getHistory: (strategy = 'signal_follow', limit = 50) =>
    request<LearningHistory[]>(`/learning/history?strategy=${strategy}&limit=${limit}`),
};

// ===== 策略配置 =====
export const strategyApi = {
  list: () => request<Strategy[]>('/strategies'),
  update: (data: Partial<Strategy>) =>
    request('/strategies', { method: 'POST', body: JSON.stringify(data) }),
};

// ===== 系统 =====
export const systemApi = {
  getStatus: () => request<SystemStatus>('/system/status'),
};

// ===== 借贷 =====
export const lendingApi = {
  getPositions: () => request<LendingPosition[]>('/lending/positions'),
  getRates: () => request<RateSnapshot[]>('/lending/rates'),
  getRateHistory: (chain: string, token: string, hours = '24') =>
    request<RateSnapshot[]>(`/lending/rate-history?chain=${encodeURIComponent(chain)}&token=${encodeURIComponent(token)}&hours=${hours}`),
};

// ===== AI 分析 =====
export const sentimentApi = {
  analyze: (provider: string, apiKey: string, tweets: string[]) =>
    request<AiSentimentResult>('/ai/sentiment', {
      method: 'POST',
      body: JSON.stringify({ provider, apiKey, tweets }),
    }),
};

export const smartMoneyApi = {
  analyze: (provider: string, apiKey: string, address: string, txHistory: string[] = []) =>
    request<SmartMoneyResult>('/ai/smart-money', {
      method: 'POST',
      body: JSON.stringify({ provider, apiKey, address, txHistory }),
    }),
};

// ===== 离线回测 =====
export const offlineBacktestApi = {
  run: (chain: string, hours: number, perAmount: number) =>
    request<OfflineBacktestResult>(`/backtest/offline?chain=${encodeURIComponent(chain)}&hours=${hours}&perAmount=${perAmount}`),
};
