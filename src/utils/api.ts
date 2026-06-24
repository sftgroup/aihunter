/* ===== API Utility — centralized HTTP client for AIHunter backend =====
 *
 * Backend:  http://129.226.202.72:3100
 * WebSocket: ws://129.226.202.72:3100/ws
 *
 * Auth: Bearer Token via Authorization header.
 * Token is read from localStorage key "aihunter_token" with
 * VITE_AUTH_TOKEN env var fallback.
 *
 * P0 fix — all requests include Authorization header.
 * Missing token → AuthError (user-friendly, not silent).
 */

import type {
  ApiResponse, PaperConfig, BacktestResult,
  LearningHistory, LearningParams, SystemStatus, Strategy,
  RateSnapshot, LendingPosition, EquitySnapshot, PortfolioResponse,
  AiSentimentResult, SmartMoneyResult, OfflineBacktestResult,
} from '../types/api';

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

export const AUTH_TOKEN_KEY = 'aihunter_token';

/**
 * Read the auth token from the canonical source.
 * Priority: localStorage > VITE_AUTH_TOKEN env var (auto-synced to localStorage).
 *
 * At app startup (module load), if VITE_AUTH_TOKEN is set and localStorage
 * has no token yet, we automatically persist it so that hasAuthToken()
 * returns true even before any user interaction.
 */
let _envTokenSynced = false;

function _syncEnvToken(): void {
  if (_envTokenSynced) return;
  _envTokenSynced = true;
  if (typeof window === 'undefined') return;
  const envToken = import.meta.env.VITE_AUTH_TOKEN;
  if (envToken && !localStorage.getItem(AUTH_TOKEN_KEY)) {
    localStorage.setItem(AUTH_TOKEN_KEY, envToken);
  }
}

export function getAuthToken(): string | null {
  if (typeof window !== 'undefined') {
    _syncEnvToken();
    const stored = localStorage.getItem(AUTH_TOKEN_KEY);
    if (stored) return stored;
  }
  const envToken = import.meta.env.VITE_AUTH_TOKEN;
  if (envToken) return envToken;
  return null;
}

/** Persist the auth token (e.g. after login). */
export function setAuthToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

/** Remove the auth token (logout). */
export function clearAuthToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

/** Return true when a usable token exists. */
export function hasAuthToken(): boolean {
  return getAuthToken() !== null;
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class AuthError extends Error {
  constructor(message = 'Authentication required. Please log in.') {
    super(message);
    this.name = 'AuthError';
  }
}

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, data: unknown) {
    const msg =
      typeof data === 'object' && data !== null && 'message' in data
        ? String((data as Record<string, unknown>).message)
        : `Request failed with status ${status}`;
    super(msg);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

// ---------------------------------------------------------------------------
// Central fetch wrapper
// ---------------------------------------------------------------------------

interface RequestOptions extends Omit<RequestInit, 'body'> {
  /** Query parameters appended to the URL. */
  params?: Record<string, string | number | boolean | undefined>;
  /** JSON-serialisable request body (sets Content-Type: application/json). */
  json?: unknown;
}

/**
 * Central fetch wrapper.
 *
 * - Injects `Authorization: Bearer <token>` on every request.
 * - Throws `AuthError` when no token is available.
 * - Deserialises JSON responses.
 * - Preserves existing error handling.
 */
export async function request<T = unknown>(
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  // --- Token check (P0 fix — no silent 401s) ---
  const token = getAuthToken();
  if (!token) {
    throw new AuthError(
      'No authentication token found. Please configure AUTH_TOKEN.',
    );
  }

  // Build URL with optional query params
  let url = `${path}`;
  if (options.params) {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(options.params)) {
      if (v !== undefined && v !== null) {
        search.set(k, String(v));
      }
    }
    const qs = search.toString();
    if (qs) url += `?${qs}`;
  }

  // Build headers
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  // Forward custom headers from the caller
  if (options.headers) {
    const custom = options.headers as Record<string, string>;
    for (const [k, v] of Object.entries(custom)) {
      headers[k] = v;
    }
  }

  // Build body
  let body: BodyInit | undefined;
  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.json);
  } else if (options.body !== undefined) {
    body = options.body as BodyInit;
  }

  // Fire
  const response = await fetch(url, {
    method,
    headers,
    body,
    signal: options.signal,
    credentials: options.credentials,
    cache: options.cache,
  });

  // Handle non-2xx
  if (!response.ok) {
    if (response.status === 401) {
      throw new AuthError('Session expired or invalid token. Please log in again.');
    }

    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      data = await response.text();
    }
    throw new ApiError(response.status, data);
  }

  // NoContent → return null-like
  if (response.status === 204) {
    return null as T;
  }

  // Parse JSON
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json() as Promise<T>;
  }

  // Fallback — treat as text
  return response.text() as unknown as T;
}

// ---------------------------------------------------------------------------
// Convenience wrappers
// ---------------------------------------------------------------------------

export const api = {
  get<T = unknown>(path: string, options?: RequestOptions) {
    return request<T>('GET', path, options);
  },
  post<T = unknown>(path: string, options?: RequestOptions) {
    return request<T>('POST', path, options);
  },
  put<T = unknown>(path: string, options?: RequestOptions) {
    return request<T>('PUT', path, options);
  },
  patch<T = unknown>(path: string, options?: RequestOptions) {
    return request<T>('PATCH', path, options);
  },
  delete<T = unknown>(path: string, options?: RequestOptions) {
    return request<T>('DELETE', path, options);
  },
};

// ---------------------------------------------------------------------------
// Typed API helpers (backward-compatible with existing code)
// ---------------------------------------------------------------------------

const API_BASE = window.location.origin + '/api';

async function typedRequest<T>(url: string, options?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const response = await request<ApiResponse<T>>('GET', API_BASE + url, {
      headers: { 'Content-Type': 'application/json', ...options?.headers } as Record<string, string>,
      method: (options?.method || 'GET') as string,
      body: options?.body,
    });
    return response;
  } catch (e: any) {
    if (e && e.name === 'ApiError' && e.data && typeof e.data === 'object') {
      return e.data as ApiResponse<T>;
    }
    return { code: 500, error: e.message };
  }
}

async function typedPost<T>(url: string, body?: unknown): Promise<ApiResponse<T>> {
  try {
    return await request<ApiResponse<T>>('POST', API_BASE + url, {
      json: body,
    });
  } catch (e: any) {
    if (e && e.name === 'ApiError' && e.data && typeof e.data === 'object') {
      return e.data as ApiResponse<T>;
    }
    return { code: 500, error: e.message };
  }
}

// ===== AI 配置 =====
export const aiApi = {
  getConfig: () => typedRequest<Record<string, string>>('/config/ai'),
  saveConfig: (provider: string, apiKey: string) =>
    typedPost('/config/ai', { provider, apiKey }),
  getProviders: () => typedRequest<string[]>('/config/ai/providers'),
};

// ===== RPC 配置 =====
export const rpcApi = {
  getConfig: () => typedRequest<Record<string, string>>('/config/rpc'),
  addRpc: (chain: string, url: string) =>
    typedPost('/config/rpc', { chain, url }),
  removeRpc: (chain: string, url: string) =>
    typedPost('/config/rpc/remove', { chain, url }),
};

// ===== 模拟交易 =====
export const paperApi = {
  getConfig: (userId = 'paper') => typedRequest<PaperConfig>(`/trade/paper/config?userId=${userId}`),
  saveConfig: (config: Partial<PaperConfig>) =>
    typedPost('/trade/paper/config', { ...config, userId: 'paper' }),
  reset: () => typedPost<{ balance: number }>('/trade/paper/reset', { userId: 'paper' }),
  getTrades: () => typedRequest<PortfolioResponse>('/trade/portfolio'),
  getEquity: (limit = 200) => typedRequest<EquitySnapshot[]>(`/trade/paper/equity?limit=${limit}`),
  backtest: (hours: string, chain: string, amount: number) =>
    typedRequest<BacktestResult>(`/trade/paper/backtest?hours=${encodeURIComponent(hours)}&chain=${encodeURIComponent(chain)}&amount=${amount}`),
};

// ===== 信号缓存 =====
export const signalsApi = {
  getRecent: (limit = 20) => typedRequest<any[]>(`/signals/recent?limit=${limit}`),
};

export const signalsPageApi = {
  getPage: (page: number, size: number, chain?: string) =>
    typedRequest<any[]>(`/signals/page?page=${page}&size=${size}${chain ? `&chain=${chain}` : ''}`),
};

// ===== 学习系统 =====
export const learningApi = {
  getParams: (strategy = 'signal_follow') => typedRequest<LearningParams>(`/learning/params/${strategy}`),
  getHistory: (strategy = 'signal_follow', limit = 50) =>
    typedRequest<LearningHistory[]>(`/learning/history?strategy=${strategy}&limit=${limit}`),
};

// ===== 策略配置 =====
export const strategyApi = {
  list: () => typedRequest<Strategy[]>('/strategies'),
  update: (data: Partial<Strategy>) =>
    typedPost('/strategies', data),
};

// ===== 系统 =====
export const systemApi = {
  getStatus: () => typedRequest<SystemStatus>('/system/status'),
};

// ===== 借贷 =====
export const lendingApi = {
  getPositions: () => typedRequest<LendingPosition[]>('/lending/positions'),
  getRates: () => typedRequest<RateSnapshot[]>('/lending/rates'),
  getRateHistory: (chain: string, token: string, hours = '24') =>
    typedRequest<RateSnapshot[]>(`/lending/rate-history?chain=${encodeURIComponent(chain)}&token=${encodeURIComponent(token)}&hours=${hours}`),
};

// ===== AI 分析 =====
export const sentimentApi = {
  analyze: (provider: string, apiKey: string, tweets: string[]) =>
    typedPost('/ai/sentiment', { provider, apiKey, tweets }),
};

export const smartMoneyApi = {
  analyze: (provider: string, apiKey: string, address: string, txHistory: string[] = []) =>
    typedPost('/ai/smart-money', { provider, apiKey, address, txHistory }),
};

// ===== 离线回测 =====
export const offlineBacktestApi = {
  run: (chain: string, hours: number, perAmount: number) =>
    typedRequest<OfflineBacktestResult>(`/backtest/offline?chain=${encodeURIComponent(chain)}&hours=${hours}&perAmount=${perAmount}`),
};

// ===== OKX 配置 + 重启 =====
export const okxApi = {
  getConfig: () => typedRequest<{ configured: boolean }>('/config/okx'),
  getStatus: () => typedRequest<{ configured: boolean; hasKey: boolean; hasSecret: boolean; hasPassphrase: boolean; keyHint: string }>('/config/okx/status'),
  saveConfig: (apiKey: string, secretKey: string, passphrase: string) =>
    typedPost('/config/okx', { apiKey, secretKey, passphrase }),
};

export const systemApiExt = {
  restart: (target = 'worker') =>
    typedPost<{ jobId: string; status: string }>('/system/restart', { target }),
  restartStatus: (jobId: string) =>
    typedRequest<{ status: string; target?: string; error?: string }>(
      `/system/restart/status?jobId=${jobId}`,
    ),
};
