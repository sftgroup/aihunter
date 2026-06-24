import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar
} from 'recharts';
import { Wallet, Play, Pause, Settings, History, TrendingUp, AlertCircle, RefreshCw, BarChart as BarChartIcon } from 'lucide-react';
import { api, getAuthToken } from '../utils/api';

const API = '/api';
const USER_ID = 'live-user-1';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface WalletStatus {
  id?: number;
  wallet_address?: string;
  chain?: string;
  status?: string;
  balance?: number;
  authorized?: boolean;
  expires_at?: string;
}

interface LiveConfig {
  max_single_amount: number;
  slippage_tolerance: number;
  gas_strategy: 'slow' | 'medium' | 'fast';
  take_profit_pct: number;
  stop_loss_pct: number;
  auto_apply_params: boolean;
  pause_on_param_change: boolean;
}

interface TradeSignal {
  id: string;
  time?: string;
  token?: string;
  symbol?: string;
  direction: 'BUY' | 'SELL';
  price?: string;
  price_usd?: number;
  score?: number;
  confidence?: number;
  status?: string;
}

interface TradeRecord {
  id: string;
  created_at?: string;
  time?: string;
  token?: string;
  token_out?: string;
  direction?: string;
  amount_in?: string;
  pnl_usd?: string;
  status?: string;
}

interface ChartPoint {
  time: string;
  pnl?: number;
  name?: string;
  value?: number;
  color?: string;
  token?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fmtAddr(addr?: string) {
  if (!addr || addr.length < 10) return addr || '—';
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function fmtPnl(v: number | string | undefined) {
  const n = Number(v ?? 0);
  const p = n >= 0;
  return `${p ? '+' : ''}$${n.toFixed(2)}`;
}

const COLORS = ['#10b981', '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899'];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function MomentumLivePage() {
  /* ---- wallet ---- */
  const [wallet, setWallet] = useState<WalletStatus | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);

  /* ---- config ---- */
  const [config, setConfig] = useState<LiveConfig>({
    max_single_amount: 1000,
    slippage_tolerance: 1.0,
    gas_strategy: 'medium',
    take_profit_pct: 10,
    stop_loss_pct: 5,
    auto_apply_params: true,
    pause_on_param_change: false,
  });
  const [configLoading, setConfigLoading] = useState(true);

  /* ---- trading ---- */
  const [isTrading, setIsTrading] = useState(false);
  const [tradingStatus, setTradingStatus] = useState<{ today_trades?: number; today_pnl?: number }>({});
  const [actionLoading, setActionLoading] = useState(false);

  /* ---- signals ---- */
  const [signals, setSignals] = useState<TradeSignal[]>([]);

  /* ---- charts ---- */
  const [pnlData, setPnlData] = useState<ChartPoint[]>([]);
  const [distributionData, setDistributionData] = useState<ChartPoint[]>([]);
  const [assetData, setAssetData] = useState<ChartPoint[]>([]);
  const [tokenData, setTokenData] = useState<ChartPoint[]>([]);
  const [chartDays, setChartDays] = useState(7);

  /* ---- trades ---- */
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [tradeDate, setTradeDate] = useState('all');
  const [tradePage, setTradePage] = useState(1);

  /* ---- errors ---- */
  const [errors, setErrors] = useState<Record<string, string>>({});

  /* ---- refs ---- */
  const statusTimer = useRef<ReturnType<typeof setInterval>>();
  const mountedRef = useRef(true);

  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  /* ================================================================== */
  /*  API helpers                                                        */
  /* ================================================================== */

  const safeGet = useCallback(async <T,>(path: string, key: string): Promise<T | null> => {
    try {
      const sep = path.includes('?') ? '&' : '?';
      const url = `${path}${sep}userId=${USER_ID}`;
      const res = await api.get<{ code: number; data?: T; message?: string }>(url);
      if (res && res.code === 200 && res.data !== undefined) {
        setErrors(e => { const n = { ...e }; delete n[key]; return n; });
        return res.data;
      }
      return null;
    } catch (e: any) {
      const msg = e?.message || '请求失败';
      setErrors(e => ({ ...e, [key]: msg }));
      return null;
    }
  }, []);

  const safePost = useCallback(async <T,>(path: string, body: unknown, key: string): Promise<T | null> => {
    try {
      const bodyWithUser = { ...(body as Record<string, unknown>), userId: USER_ID };
      const res = await api.post<{ code: number; data?: T; message?: string; error?: string }>(path, { json: bodyWithUser });
      if (res && res.code === 200) {
        setErrors(e => { const n = { ...e }; delete n[key]; return n; });
        return (res.data ?? res) as unknown as T;
      }
      setErrors(e => ({ ...e, [key]: res?.message || '操作失败' }));
      return null;
    } catch (e: any) {
      setErrors(e => ({ ...e, [key]: e?.message || '请求失败' }));
      return null;
    }
  }, []);

  /* ================================================================== */
  /*  Load wallet & config                                               */
  /* ================================================================== */

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setWalletLoading(true);
      const data = await safeGet<WalletStatus>(`${API}/agentic-wallet/status`, 'wallet');
      if (!cancelled && data) setWallet(data);
      if (!cancelled) setWalletLoading(false);
    })();
    return () => { cancelled = true; };
  }, [safeGet]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setConfigLoading(true);
      const data = await safeGet<LiveConfig>(`${API}/live-trading/config?strategy=momentum`, 'config');
      if (!cancelled && data) setConfig(data);
      if (!cancelled) setConfigLoading(false);
    })();
    return () => { cancelled = true; };
  }, [safeGet]);

  /* ---- load charts once ---- */
  useEffect(() => {
    safeGet<{ date: string; pnl: number }[]>(`${API}/live-trading/chart/pnl?days=${chartDays}`, 'pnl').then(d => d && setPnlData(d.map(r => ({ time: r.date, pnl: r.pnl }))));
    safeGet<{ wins: number; losses: number }>(`${API}/live-trading/chart/distribution`, 'dist').then(d => d && setDistributionData([
      { name: '盈利', value: d.wins || 0, color: '#10b981' },
      { name: '亏损', value: d.losses || 0, color: '#ef4444' },
    ]));
    safeGet<{ date: string; total: number }[]>(`${API}/live-trading/chart/assets?days=${chartDays}`, 'assets').then(d => d && setAssetData(d.map(r => ({ time: r.date, value: r.total }))));
    safeGet<{ token: string; pnl: number }[]>(`${API}/live-trading/chart/tokens`, 'tokens').then(d => d && setTokenData(d));
  }, [safeGet, chartDays]);

  /* ---- load trades ---- */
  useEffect(() => {
    safeGet<{ records: TradeRecord[]; total: number }>(`${API}/live-trading/trades?date=${tradeDate}&page=${tradePage}&limit=20`, 'trades')
      .then(d => d && setTrades(d.records));
  }, [safeGet, tradeDate, tradePage]);

  /* ---- trading status polling ---- */
  useEffect(() => {
    if (!isTrading) return;
    let cancelled = false;
    const poll = () => {
      safeGet<{ is_active?: boolean; today_trades?: number; today_pnl?: number }>(
        `${API}/live-trading/status`, 'status'
      ).then(d => {
        if (!cancelled && d) {
          setIsTrading(!!d.is_active);
          setTradingStatus({ today_trades: d.today_trades, today_pnl: d.today_pnl });
        }
      });
    };
    poll();
    statusTimer.current = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(statusTimer.current); };
  }, [isTrading, safeGet]);

  /* ---- WebSocket signals ---- */
  useEffect(() => {
    const wsOrigin = window.location.origin.replace(/^http/, 'ws');
    const token = getAuthToken();
    const url = token ? `${wsOrigin}/ws?token=${encodeURIComponent(token)}` : `${wsOrigin}/ws`;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if ((msg.type === 'signal' || msg.type === 'SIGNAL') && msg.data) {
          setSignals(prev => [msg.data, ...prev].slice(0, 100));
        }
      } catch { /* ignore */ }
    };
    return () => ws.close();
  }, []);

  /* ================================================================== */
  /*  Actions                                                            */
  /* ================================================================== */

  const handleSaveConfig = useCallback(async () => {
    await safePost(`${API}/live-trading/config`, config, 'saveConfig');
  }, [config, safePost]);

  const configTimer = useRef<ReturnType<typeof setTimeout>>();
  const handleConfigChange = useCallback((patch: Partial<LiveConfig>) => {
    setConfig(prev => {
      const next = { ...prev, ...patch };
      clearTimeout(configTimer.current);
      configTimer.current = setTimeout(() => {
        safePost(`${API}/live-trading/config`, next, 'saveConfig');
      }, 500);
      return next;
    });
  }, [safePost]);

  useEffect(() => { return () => clearTimeout(configTimer.current); }, []);

  const handleStart = useCallback(async () => {
    if (!wallet?.authorized) {
      setErrors(e => ({ ...e, start: '请先创建并授权 Agentic Wallet' }));
      return;
    }
    setActionLoading(true);
    const ok = await safePost(`${API}/live-trading/start`, {}, 'start');
    if (ok) setIsTrading(true);
    setActionLoading(false);
  }, [wallet, safePost]);

  const handleStop = useCallback(async () => {
    setActionLoading(true);
    const ok = await safePost(`${API}/live-trading/stop`, {}, 'stop');
    if (ok) setIsTrading(false);
    setActionLoading(false);
  }, [safePost]);

  const handleRevoke = useCallback(async () => {
    await safePost(`${API}/agentic-wallet/revoke`, { walletId: wallet?.id }, 'revoke');
    setWallet(null);
  }, [wallet, safePost]);

  /* ================================================================== */
  /*  Render                                                             */
  /* ================================================================== */

  const walletConnected = !!wallet?.wallet_address;
  const authorized = !!wallet?.authorized;

  return (
    <div className="min-h-screen bg-[#0d1117] text-gray-100">
      <div className="max-w-7xl mx-auto px-4 py-6">

        {/* ============ Wallet Status ============ */}
        <div className="bg-gray-900/50 backdrop-blur-md border border-gray-800 rounded-xl p-6 mb-6">
          {walletLoading ? (
            <div className="flex items-center space-x-3 text-gray-400">
              <RefreshCw className="w-4 h-4 animate-spin" /><span className="text-sm">加载钱包状态...</span>
            </div>
          ) : walletConnected ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-6">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                    <Wallet className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">Agentic Wallet</div>
                    <div className="text-xs text-gray-400">{fmtAddr(wallet.wallet_address)}</div>
                  </div>
                </div>
                <div className="h-8 w-px bg-gray-700" />
                <div>
                  <div className="text-xs text-gray-400">余额</div>
                  <div className="text-lg font-bold text-white">
                    ${(wallet.balance ?? 0).toLocaleString()}
                  </div>
                </div>
                <div className="h-8 w-px bg-gray-700" />
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${authorized ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                  <span className={`text-sm ${authorized ? 'text-green-400' : 'text-red-400'}`}>
                    {authorized ? '已授权' : '未授权'}
                  </span>
                  {authorized && wallet.expires_at && (
                    <span className="text-xs text-gray-500">有效期至 {wallet.expires_at.slice(0, 10)}</span>
                  )}
                </div>
              </div>
              <button
                onClick={handleRevoke}
                className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 transition"
              >
                断开连接
              </button>
            </div>
          ) : (
            <div className="text-center py-2">
              <AlertCircle className="w-5 h-5 text-yellow-400 mx-auto mb-2" />
              <p className="text-sm text-gray-400">未连接 Agentic Wallet</p>
              <p className="text-xs text-gray-500 mt-1">请通过 API 创建钱包后刷新页面</p>
            </div>
          )}
        </div>

        {/* ============ Config Grid ============ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Strategy Params */}
          <div className="bg-gray-900/50 backdrop-blur-md border border-gray-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
              <Settings className="w-5 h-5 mr-2" />
              策略参数
            </h3>
            {configLoading ? (
              <div className="text-center text-gray-400 text-sm py-4">
                <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2" />加载中...
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">单笔上限 (USDT)</label>
                  <input
                    type="number"
                    value={config.max_single_amount}
                    onChange={(e) => handleConfigChange({ max_single_amount: Number(e.target.value) })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">滑点容忍 (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={config.slippage_tolerance}
                    onChange={(e) => handleConfigChange({ slippage_tolerance: Number(e.target.value) })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Gas 策略</label>
                  <select
                    value={config.gas_strategy}
                    onChange={(e) => handleConfigChange({ gas_strategy: e.target.value as 'slow' | 'medium' | 'fast' })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="slow">慢 (Slow)</option>
                    <option value="medium">中 (Medium)</option>
                    <option value="fast">快 (Fast)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">止盈 / 止损 (%)</label>
                  <div className="flex space-x-2">
                    <input
                      type="number"
                      value={config.take_profit_pct}
                      onChange={(e) => handleConfigChange({ take_profit_pct: Number(e.target.value) })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                      placeholder="止盈"
                    />
                    <input
                      type="number"
                      value={config.stop_loss_pct}
                      onChange={(e) => handleConfigChange({ stop_loss_pct: Number(e.target.value) })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                      placeholder="止损"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Learning Config */}
          <div className="bg-gray-900/50 backdrop-blur-md border border-gray-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
              <TrendingUp className="w-5 h-5 mr-2" />
              自动学习配置
            </h3>
            {configLoading ? (
              <div className="text-center text-gray-400 text-sm py-4">
                <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2" />加载中...
              </div>
            ) : (
              <div className="space-y-4">
                <Toggle
                  label="自动应用学习参数"
                  desc="学习系统优化后的参数自动应用到实盘"
                  checked={config.auto_apply_params}
                  onChange={(v) => handleConfigChange({ auto_apply_params: v })}
                />
                <Toggle
                  label="参数变更时暂停"
                  desc="学习参数更新时自动暂停实盘交易"
                  checked={config.pause_on_param_change}
                  onChange={(v) => handleConfigChange({ pause_on_param_change: v })}
                />
              </div>
            )}
          </div>
        </div>

        {/* ============ Trade Control ============ */}
        <div className="bg-gray-900/50 backdrop-blur-md border border-gray-800 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <button
                onClick={handleStart}
                disabled={isTrading || actionLoading}
                className={`px-6 py-3 rounded-lg font-medium transition flex items-center space-x-2 ${
                  isTrading ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              >
                <Play className="w-4 h-4" />
                <span>{actionLoading ? '处理中...' : '开启实盘'}</span>
              </button>
              <button
                onClick={handleStop}
                disabled={!isTrading || actionLoading}
                className={`px-6 py-3 rounded-lg font-medium transition flex items-center space-x-2 ${
                  !isTrading ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
              >
                <Pause className="w-4 h-4" />
                <span>{actionLoading ? '处理中...' : '暂停实盘'}</span>
              </button>
              <div className="h-8 w-px bg-gray-700" />
              <div className="flex items-center space-x-4 text-sm">
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${isTrading ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
                  <span className="text-gray-400">
                    状态: <span className={isTrading ? 'text-green-400' : 'text-gray-500'}>{isTrading ? '运行中' : '已暂停'}</span>
                  </span>
                </div>
                <div className="text-gray-400">
                  今日交易: <span className="text-white font-medium">{tradingStatus.today_trades ?? '—'}笔</span>
                </div>
                <div className="text-gray-400">
                  今日盈亏: <span className={(tradingStatus.today_pnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {fmtPnl(tradingStatus.today_pnl)}
                  </span>
                </div>
              </div>
            </div>
            {errors.start && <span className="text-xs text-red-400 ml-4">{errors.start}</span>}
          </div>
        </div>

        {/* ============ Signal Stream ============ */}
        <div className="bg-gray-900/50 backdrop-blur-md border border-gray-800 rounded-xl p-6 mb-6">
          <h3 className="text-lg font-semibold text-white mb-4">实时信号流</h3>
          {signals.length === 0 ? (
            <div className="text-center py-6">
              <AlertCircle className="w-8 h-8 text-gray-600 mx-auto mb-2" />
              <p className="text-sm text-gray-500">等待实时信号...</p>
              <p className="text-xs text-gray-600 mt-1">开启实盘后将通过 WebSocket 接收信号</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-900">
                  <tr className="text-gray-400 border-b border-gray-700">
                    <th className="text-left py-2">时间</th>
                    <th className="text-left py-2">代币</th>
                    <th className="text-left py-2">方向</th>
                    <th className="text-left py-2">价格</th>
                    <th className="text-left py-2">评分</th>
                    <th className="text-left py-2">状态</th>
                  </tr>
                </thead>
                <tbody className="text-gray-300">
                  {signals.map((s, i) => {
                    const sc = s.score ?? s.confidence ?? 0;
                    return (
                      <tr key={s.id || i} className="border-b border-gray-800">
                        <td className="py-3">{s.time || '—'}</td>
                        <td className="py-3 font-medium text-white">{s.symbol || s.token || '—'}</td>
                        <td className="py-3">
                          <span className={`px-2 py-1 rounded text-xs ${
                            s.direction === 'BUY' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
                          }`}>{s.direction}</span>
                        </td>
                        <td className="py-3">{s.price ?? (s.price_usd ? `$${s.price_usd}` : '—')}</td>
                        <td className="py-3 text-blue-400">{sc}</td>
                        <td className="py-3">
                          <span className={s.status === '已执行' || s.status === 'executed' ? 'text-green-400' : 'text-yellow-400'}>
                            {s.status === '已执行' || s.status === 'executed' ? '✓' : '⏳'} {s.status || '待执行'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ============ Charts ============ */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-white">数据图表</h3>
          <div className="flex space-x-2">
            {[7, 30, 90].map(d => (
              <button key={d} onClick={() => setChartDays(d)}
                className={`px-3 py-1 rounded text-sm ${chartDays === d ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                {d}天
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <ChartCard title="盈亏曲线">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={pnlData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="time" stroke="#9ca3af" fontSize={11} />
                <YAxis stroke="#9ca3af" fontSize={11} />
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: 8 }} />
                <Line type="monotone" dataKey="pnl" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="交易分布">
            {distributionData.length === 0 ? (
              <EmptyChart />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={distributionData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={5} dataKey="value">
                      {distributionData.map((_, i) => (
                        <Cell key={i} fill={_.color || COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center space-x-4 mt-2">
                  {distributionData.map((e, i) => (
                    <div key={e.name || i} className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: e.color || COLORS[i % COLORS.length] }} />
                      <span className="text-xs text-gray-400">{e.name} {e.value}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </ChartCard>

          <ChartCard title="资产变化">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={assetData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="time" stroke="#9ca3af" fontSize={11} />
                <YAxis stroke="#9ca3af" fontSize={11} />
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: 8 }} />
                <Area type="monotone" dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="代币盈亏排名">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={tokenData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis type="number" stroke="#9ca3af" fontSize={11} />
                <YAxis dataKey="token" type="category" stroke="#9ca3af" fontSize={11} width={60} />
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: 8 }} />
                <Bar dataKey="pnl" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* ============ Trade History ============ */}
        <div className="bg-gray-900/50 backdrop-blur-md border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white flex items-center">
              <History className="w-5 h-5 mr-2" />
              交易记录
            </h3>
            <div className="flex space-x-2">
              {[
                { key: 'all', label: '全部' },
                { key: 'today', label: '今日' },
                { key: 'week', label: '本周' },
                { key: 'month', label: '本月' },
              ].map(b => (
                <button key={b.key} onClick={() => { setTradeDate(b.key); setTradePage(1); }}
                  className={`px-3 py-1 rounded text-sm ${tradeDate === b.key ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                  {b.label}
                </button>
              ))}
            </div>
          </div>
          {trades.length === 0 ? (
            <div className="text-center py-8">
              <History className="w-8 h-8 text-gray-600 mx-auto mb-2" />
              <p className="text-sm text-gray-500">暂无交易记录</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-700">
                      <th className="text-left py-2">时间</th>
                      <th className="text-left py-2">代币</th>
                      <th className="text-left py-2">方向</th>
                      <th className="text-left py-2">金额</th>
                      <th className="text-left py-2">盈亏</th>
                      <th className="text-left py-2">状态</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-300">
                    {trades.map((t) => {
                      const pnl = parseFloat(t.pnl_usd || '0');
                      const dir = t.direction || (pnl !== 0 ? (pnl > 0 ? 'BUY' : 'SELL') : '—');
                      return (
                        <tr key={t.id} className="border-b border-gray-800">
                          <td className="py-3">{t.time || t.created_at || '—'}</td>
                          <td className="py-3 font-medium text-white">{t.token || t.token_out || '—'}</td>
                          <td className="py-3">
                            <span className={dir === 'BUY' ? 'text-green-400' : 'text-red-400'}>{dir}</span>
                          </td>
                          <td className="py-3">{t.amount_in ? `$${t.amount_in}` : '—'}</td>
                          <td className={`py-3 ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmtPnl(pnl)}</td>
                          <td className="py-3">
                            <span className={`px-2 py-1 rounded text-xs ${
                              t.status === '成功' || t.status === 'success' ? 'bg-green-900/50 text-green-400' :
                              t.status === '失败' || t.status === 'failed' ? 'bg-red-900/50 text-red-400' :
                              'bg-yellow-900/50 text-yellow-400'
                            }`}>{t.status || '—'}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-center space-x-4 mt-4">
                <button onClick={() => setTradePage(p => Math.max(1, p - 1))} disabled={tradePage <= 1}
                  className="px-3 py-1 rounded bg-gray-800 text-gray-400 text-sm disabled:opacity-30">上一页</button>
                <span className="text-sm text-gray-400 self-center">第 {tradePage} 页</span>
                <button onClick={() => setTradePage(p => p + 1)} disabled={trades.length < 20}
                  className="px-3 py-1 rounded bg-gray-800 text-gray-400 text-sm disabled:opacity-30">下一页</button>
              </div>
            </>
          )}
        </div>

        {/* ============ Error toast ============ */}
        {Object.keys(errors).length > 0 && (
          <div className="fixed bottom-4 right-4 bg-red-900/90 border border-red-700 rounded-lg p-3 max-w-sm z-50">
            <p className="text-sm text-red-200 font-medium mb-1">数据加载失败</p>
            {Object.entries(errors).slice(0, 3).map(([k, v]) => (
              <p key={k} className="text-xs text-red-300">{v}</p>
            ))}
            <button onClick={() => setErrors({})}
              className="text-xs text-red-400 hover:text-red-200 mt-2">✕ 关闭</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900/50 backdrop-blur-md border border-gray-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>
      {children}
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="text-center py-10">
      <BarChartIcon className="w-8 h-8 text-gray-600 mx-auto mb-2" />
      <p className="text-xs text-gray-500">暂无数据</p>
    </div>
  );
}

function Toggle({ label, desc, checked, onChange }: {
  label: string; desc: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm text-white">{label}</div>
        <div className="text-xs text-gray-400">{desc}</div>
      </div>
      <label className="relative inline-flex items-center cursor-pointer">
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="sr-only peer" />
        <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
      </label>
    </div>
  );
}
