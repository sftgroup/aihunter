/**
 * AIHunter /live — 实盘交易页面 (项目统一设计规范)
 *
 * 设计对齐所有其他页面：
 * - 磨砂玻璃卡片 (linear-gradient + blur + 阴影)
 * - 全局色板 (--accent: #6366f1, --accent-green: #10b981, --accent-red: #ef4444)
 * - 统一底色 var(--dark-950)=#111111 / 文本色 var(--dark-400)=#808080
 * - 页面标题区 + 副标题
 * - 卡片圆角 16px, 边框 rgba(255,255,255,0.05), boxShadow 0 8px 32px
 *
 * Layout: Left Sidebar (380px) + Right Main (fluid)
 *   Left:  Wallet → Strategy Params → Auto-Learning
 *   Right: Control Bar → Signal Stream → Charts(2x2, 320px) → Trade History
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar
} from 'recharts';
import {
  Wallet, Play, Pause, Settings, TrendingUp, AlertCircle,
  RefreshCw, BarChart as BarChartIcon, Copy, Zap, Activity, Shield,
  ArrowUp, ArrowDown, History
} from 'lucide-react';
import { api, getAuthToken } from '../utils/api';

/* ================================================================== */
/*  Project Design Tokens (from index.css)                             */
/* ================================================================== */
const T = {
  accent:       '#6366f1',
  accentGreen:  '#10b981',
  accentRed:    '#ef4444',
  accentBlue:   '#3b82f6',
  accentPurple: '#8b5cf6',
  accentOrange: '#f59e0b',
  accentCyan:   '#06b6d4',
  dark50:   '#f0f0f0',
  dark100:  '#e0e0e0',
  dark200:  '#c0c0c0',
  dark300:  '#a0a0a0',
  dark400:  '#808080',
  dark500:  '#606060',
  dark600:  '#404040',
  dark700:  '#2a2a2a',
  dark800:  '#1a1a1a',
  dark900:  '#111111',
  dark950:  '#0a0a0a',
};

const cardBase: React.CSSProperties = {
  background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
  backdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 16,
  boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
};

const sectionTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: T.dark400,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  paddingLeft: 4,
  marginBottom: 12,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

/* ================================================================== */
/*  API                                                                */
/* ================================================================== */
const API = '/api';
const getUserId = () => {
  if (typeof window === 'undefined') return 'unknown';
  let id = localStorage.getItem('aihunter_user_id');
  if (!id) {
    // crypto.randomUUID() requires HTTPS/secure context; fallback for HTTP
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      id = crypto.randomUUID();
    } else {
      id = 'user-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    }
    localStorage.setItem('aihunter_user_id', id);
  }
  return id;
};
const USER_ID = getUserId();

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */
interface WalletStatus {
  id?: number;
  wallet_address?: string;
  chain?: string;
  status?: string;
  balance?: number;
  authorized?: boolean;
  expires_at?: string;
  wallets?: WalletStatus[];
  email?: string;
  label?: string;
  totalUsd?: number;
  is_default?: boolean;
}

interface LiveConfig {
  max_single_amount: number;
  slippage_tolerance: number;
  gas_strategy: 'slow' | 'medium' | 'fast';
  take_profit_pct: number;
  stop_loss_pct: number;
  daily_max_loss: number;
  max_holdings: number;
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
  tx_hash?: string;
  chain?: string;
}

interface ChartPoint {
  time: string;
  pnl?: number;
  name?: string;
  value?: number;
  color?: string;
  token?: string;
}

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */
function fmtAddr(addr?: string) {
  if (!addr || addr.length < 10) return addr || '—';
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function fmtPnl(v: number | string | undefined) {
  const n = Number(v ?? 0);
  return `${n >= 0 ? '+' : ''}$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtTxHash(hash?: string) {
  if (!hash || hash.length < 10) return hash || '—';
  return hash.slice(0, 6) + '...' + hash.slice(-4);
}

function getExplorerUrl(chain: string | undefined, txHash: string | undefined): string {
  if (!txHash) return '#';
  const exp: Record<string, string> = { ETH: `https://etherscan.io/tx/${txHash}`, BSC: `https://bscscan.com/tx/${txHash}`, BASE: `https://basescan.org/tx/${txHash}`, SOL: `https://solscan.io/tx/${txHash}` };
  return exp[chain?.toUpperCase() ?? ''] || `https://etherscan.io/tx/${txHash}`;
}

function scoreColor(s: number): string {
  if (s >= 80) return T.accentGreen;
  if (s >= 60) return T.accentOrange;
  if (s >= 40) return T.dark300;
  return T.accentRed;
}

function scoreBg(s: number): string {
  if (s >= 80) return 'rgba(16,185,129,0.12)';
  if (s >= 60) return 'rgba(245,158,11,0.12)';
  if (s >= 40) return 'rgba(255,255,255,0.04)';
  return 'rgba(239,68,68,0.12)';
}

let _ai = false;
function injectAnim() {
  if (_ai) return; _ai = true;
  if (typeof document === 'undefined') return;
  const s = document.createElement('style');
  s.textContent = `
    @keyframes signalRowIn { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }
    @keyframes pulseLED { 0%,100%{ opacity:1; } 50%{ opacity:0.4; } }
  `;
  document.head.appendChild(s);
}

/* ================================================================== */
/*  Main Component                                                     */
/* ================================================================== */

export default function MomentumLivePage() {
  useEffect(() => { injectAnim(); }, []);

  /* ---- wallet login ---- */
  const [wallet, setWallet] = useState<WalletStatus | null>(null);
  const [wallets, setWallets] = useState<WalletStatus[]>([]);
  const [walletLoading, setWalletLoading] = useState(true);
  const [loginStep, setLoginStep] = useState<'idle' | 'email' | 'lookup' | 'otp'>('idle');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginOtp, setLoginOtp] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginSending, setLoginSending] = useState(false);
  const [loginVerifying, setLoginVerifying] = useState(false);
  const [lookupWallets, setLookupWallets] = useState<WalletStatus[] | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  /* ---- config ---- */
  const [config, setConfig] = useState<LiveConfig>({
    max_single_amount: 1000, slippage_tolerance: 1.0, gas_strategy: 'medium',
    take_profit_pct: 10, stop_loss_pct: 5, daily_max_loss: 500, max_holdings: 10,
    auto_apply_params: true, pause_on_param_change: false,
  });
  const [configLoading, setConfigLoading] = useState(true);

  /* ---- learning ---- */
  const [learningParams, setLearningParams] = useState<LiveConfig | null>(null);
  const [learningDiff, setLearningDiff] = useState<Record<string, { old: any; new: any }> | null>(null);
  const [learningBanner, setLearningBanner] = useState<{ diff: Record<string, { old: any; new: any }> } | null>(null);

  /* ---- trading ---- */
  const [isTrading, setIsTrading] = useState(false);
  const [tradingStatus, setTradingStatus] = useState<{ today_trades?: number; today_pnl?: number; today_loss?: number; current_holdings?: number }>({});
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
  const wsRef = useRef<WebSocket | null>(null);
  const statusTimer = useRef<ReturnType<typeof setInterval>>();
  useEffect(() => { let m = true; return () => { m = false; }; }, []);

  /* ================================================================== */
  /*  API helpers                                                        */
  /* ================================================================== */
  const safeGet = useCallback(async <T,>(path: string, key: string): Promise<T | null> => {
    try {
      const sep = path.includes('?') ? '&' : '?';
      const res = await api.get<{ code: number; data?: T; message?: string }>(`${path}${sep}userId=${USER_ID}`);
      if (res && res.code === 200 && res.data !== undefined) { setErrors(e => { const n = { ...e }; delete n[key]; return n; }); return res.data; }
      return null;
    } catch (e: any) { setErrors(e => ({ ...e, [key]: e?.message || '请求失败' })); return null; }
  }, []);

  const safePost = useCallback(async <T,>(path: string, body: unknown, key: string): Promise<T | null> => {
    try {
      const b = { ...(body as Record<string, unknown>), userId: USER_ID };
      const res = await api.post<{ code: number; data?: T; message?: string }>(path, { json: b });
      if (res && res.code === 200) { setErrors(e => { const n = { ...e }; delete n[key]; return n; }); return (res.data ?? res) as unknown as T; }
      setErrors(e => ({ ...e, [key]: res?.message || '操作失败' })); return null;
    } catch (e: any) { setErrors(e => ({ ...e, [key]: e?.message || '请求失败' })); return null; }
  }, []);

  /* ================================================================== */
  /*  Data loading                                                       */
  /* ================================================================== */
  useEffect(() => { let c = false; (async () => { setWalletLoading(true); try { const d = await safeGet<WalletStatus>(`${API}/agentic-wallet/status`, 'wallet'); if (!c && d) { setWallet(d); if (d.wallets) setWallets(d.wallets); } } finally { if (!c) setWalletLoading(false); } })(); return () => { c = true; }; }, [safeGet]);
  useEffect(() => { let c = false; (async () => { setConfigLoading(true); const d = await safeGet<LiveConfig>(`${API}/live-trading/config?strategy=momentum`, 'config'); if (!c && d) setConfig(d); if (!c) setConfigLoading(false); })(); return () => { c = true; }; }, [safeGet]);
  useEffect(() => { safeGet<{ date: string; pnl: number }[]>(`${API}/live-trading/chart/pnl?days=${chartDays}`, 'pnl').then(d => d && setPnlData(d.map(r => ({ time: r.date, pnl: r.pnl })))); safeGet<{ wins: number; losses: number }>(`${API}/live-trading/chart/distribution`, 'dist').then(d => d && setDistributionData([{ name: '盈利', value: d.wins || 0, color: T.accentGreen }, { name: '亏损', value: d.losses || 0, color: T.accentRed }])); safeGet<{ date: string; total: number }[]>(`${API}/live-trading/chart/assets?days=${chartDays}`, 'assets').then(d => d && setAssetData(d.map(r => ({ time: r.date, value: r.total })))); safeGet<{ token: string; pnl: number }[]>(`${API}/live-trading/chart/tokens`, 'tokens').then(d => d && setTokenData(d)); }, [safeGet, chartDays]);
  useEffect(() => { safeGet<{ records: TradeRecord[]; total: number }>(`${API}/live-trading/trades?date=${tradeDate}&page=${tradePage}&limit=20`, 'trades').then(d => d && setTrades(d.records)); }, [safeGet, tradeDate, tradePage]);

  /* ---- trading status polling ---- */
  useEffect(() => {
    if (!isTrading) return; let c = false;
    const poll = () => { safeGet<{ is_active?: boolean; today_trades?: number; today_pnl?: number; today_loss?: number; current_holdings?: number }>(`${API}/live-trading/status`, 'status').then(d => { if (!c && d) { setIsTrading(!!d.is_active); setTradingStatus({ today_trades: d.today_trades, today_pnl: d.today_pnl, today_loss: d.today_loss, current_holdings: d.current_holdings }); } }); };
    poll(); statusTimer.current = setInterval(poll, 3000);
    return () => { c = true; clearInterval(statusTimer.current); };
  }, [isTrading, safeGet]);

  /* ---- WebSocket signals ---- */
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const reconnectAttempt = useRef(0);
  useEffect(() => {
    let c = false; const MAX = 30000;
    const conn = () => {
      if (c) return;
      const o = window.location.origin.replace(/^http/, 'ws');
      const tk = getAuthToken();
      const u = tk ? `${o}/ws?token=${encodeURIComponent(tk)}` : `${o}/ws`;
      const ws = new WebSocket(u); wsRef.current = ws;
      ws.onopen = () => { reconnectAttempt.current = 0; };
      ws.onmessage = (e) => { try { const m = JSON.parse(e.data); if ((m.type === 'signal' || m.type === 'SIGNAL') && m.data) setSignals(prev => [m.data, ...prev].slice(0, 100)); } catch {} };
      ws.onclose = () => { if (c) return; const d = Math.min(1000 * Math.pow(2, reconnectAttempt.current), MAX); reconnectAttempt.current++; reconnectTimer.current = setTimeout(conn, d); };
      ws.onerror = () => ws.close();
    };
    conn();
    return () => { c = true; clearTimeout(reconnectTimer.current); if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); } };
  }, []);

  /* ================================================================== */
  /*  Actions                                                            */
  /* ================================================================== */
  const configTimer = useRef<ReturnType<typeof setTimeout>>();
  const [confirmDialog, setConfirmDialog] = useState<{ patch: Partial<LiveConfig> } | null>(null);

  const handleConfigChange = useCallback((patch: Partial<LiveConfig>) => {
    setConfig(prev => {
      const next = { ...prev, ...patch };
      const critical = ['max_single_amount', 'slippage_tolerance', 'take_profit_pct', 'stop_loss_pct', 'daily_max_loss', 'max_holdings'];
      if (isTrading && Object.keys(patch).some(k => critical.includes(k))) { clearTimeout(configTimer.current); setConfirmDialog({ patch }); }
      else { clearTimeout(configTimer.current); configTimer.current = setTimeout(() => safePost(`${API}/live-trading/config`, next, 'saveConfig'), 500); }
      return next;
    });
  }, [safePost, isTrading]);

  const confirmConfigChange = useCallback(() => { if (!confirmDialog) return; safePost(`${API}/live-trading/config`, { ...config, ...confirmDialog.patch }, 'saveConfig'); setConfirmDialog(null); }, [confirmDialog, config, safePost]);
  const cancelConfigChange = useCallback(() => { if (!confirmDialog) return; setConfig(prev => { const n = { ...prev }; Object.keys(confirmDialog.patch).forEach(k => { (n as any)[k] = prev[k as keyof typeof prev]; }); return n; }); setConfirmDialog(null); }, [confirmDialog]);
  useEffect(() => { return () => clearTimeout(configTimer.current); }, []);

  /* ---- learning params polling ---- */
  useEffect(() => {
    let c = false; let t: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (c) return;
      const d = await safeGet<{ version: number; auto_apply_params?: boolean; pause_on_param_change?: boolean } & Record<string, any>>(`${API}/live-trading/params?strategy=momentum`, 'learningParams');
      if (c || !d) { t = setTimeout(poll, 10000); return; }
      setLearningParams(prev => {
        if (!prev) return d as unknown as LiveConfig;
        if ((d as any).version !== (prev as any).version) {
          const diff: Record<string, { old: any; new: any }> = {};
          for (const k of ['take_profit_pct', 'stop_loss_pct', 'daily_max_loss', 'max_holdings', 'max_single_amount', 'slippage_tolerance', 'gas_strategy']) {
            if (String(d[k] ?? '') !== String((prev as any)[k] ?? '')) diff[k] = { old: (prev as any)[k], new: d[k] };
          }
          if (Object.keys(diff).length) { setLearningDiff(diff); if (d.auto_apply_params) { safePost(`${API}/live-trading/config`, diff, 'autoApply'); setConfig(cc => ({ ...cc, ...Object.fromEntries(Object.entries(diff).map(([k, v]) => [k, v.new])) })); setLearningDiff(null); } else { setLearningBanner({ diff }); } if (d.pause_on_param_change && isTrading) { safePost(`${API}/live-trading/stop`, {}, 'autoStop'); setIsTrading(false); } }
        }
        return d as unknown as LiveConfig;
      });
      t = setTimeout(poll, 10000);
    };
    poll(); return () => { c = true; clearTimeout(t); };
  }, [safeGet, isTrading]);

  /* ---- lookup wallet (no OTP) ---- */
  const handleLookupWallet = useCallback(async () => {
    if (!loginEmail.trim()) { setLoginError('请输入邮箱地址'); return; }
    setLookupLoading(true);
    setLoginError('');
    try {
      const res = await fetch(`${API}/agentic-wallet/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: USER_ID, email: loginEmail.trim() }),
      });
      const d = await res.json();
      if (d.code === 200 && d.data?.hasWallets) {
        // 保存正确的 user_id 到 localStorage
        const w0 = d.data.wallets[0];
        if (w0 && w0.user_id) { localStorage.setItem('aihunter_user_id', w0.user_id); }
        // 已有地址，直接展示，无需 OTP
        setLookupWallets(d.data.wallets);
        setLoginStep('lookup');
      } else {
        // 没有已有地址 → 发 OTP 创建新地址
        setLookupWallets([]);
        setLoginStep('otp');
        // 触发发送验证码
        const otpRes = await fetch(`${API}/agentic-wallet/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: USER_ID, email: loginEmail.trim() }),
        });
        const otpData = await otpRes.json();
        if (otpData.code !== 200) {
          setLoginError(otpData.message || '发送验证码失败');
          setLoginStep('email');
        }
      }
    } catch (e: any) {
      setLoginError(e.message || '网络错误');
    } finally {
      setLookupLoading(false);
    }
  }, [loginEmail, USER_ID]);

  /* ---- select existing wallet (no OTP) ---- */
  const handleSelectWallet = useCallback(async (w: WalletStatus) => {
    setWalletLoading(true);
    try {
      // 保存正确的 user_id
      if (w.user_id) { localStorage.setItem('aihunter_user_id', w.user_id); }
      // 切换到该钱包
      await fetch(`${API}/agentic-wallet/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: USER_ID, walletAddress: w.wallet_address }),
      });
      // 刷新状态
      const d = await safeGet<WalletStatus>(`${API}/agentic-wallet/status`, 'wallet');
      if (d) {
        setWallet(d);
        if (d.wallets) setWallets(d.wallets);
      }
      setLoginStep('idle');
      setLoginEmail('');
      setLoginError('');
    } catch (e: any) {
      setLoginError(e.message || '切换失败');
    } finally {
      setWalletLoading(false);
    }
  }, [USER_ID, safeGet]);

  /* ---- add new address to existing wallet (requires OTP) ---- */
  const handleAddNewAddress = useCallback(async () => {
    if (!loginEmail.trim()) { setLoginError('请输入邮箱地址'); return; }
    setLoginSending(true);
    setLoginError('');
    try {
      const res = await fetch(`${API}/agentic-wallet/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: USER_ID, email: loginEmail.trim() }),
      });
      const d = await res.json();
      if (d.code === 200) { setLoginStep('otp'); setLoginError(''); }
      else { setLoginError(d.message || '发送验证码失败'); }
    } catch (e: any) { setLoginError(e.message || '网络错误'); }
    finally { setLoginSending(false); }
  }, [loginEmail, USER_ID]);

  /* ---- send OTP (legacy, for first-time creation) ---- */
  const handleSendOtp = useCallback(async () => {
    if (!loginEmail.trim()) { setLoginError('请输入邮箱地址'); return; }
    setLoginSending(true);
    setLoginError('');
    try {
      const res = await fetch(`${API}/agentic-wallet/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: USER_ID, email: loginEmail }),
      });
      const d = await res.json();
      if (d.code === 200) { setLoginStep('otp'); setLoginError(''); }
      else { setLoginError(d.message || '发送验证码失败'); }
    } catch (e: any) { setLoginError(e.message || '网络错误'); }
    finally { setLoginSending(false); }
  }, [loginEmail, USER_ID]);

  const handleVerifyOtp = useCallback(async () => {
    if (!loginOtp.trim()) { setLoginError('请输入验证码'); return; }
    setLoginVerifying(true);
    setLoginError('');
    try {
      const res = await fetch(`${API}/agentic-wallet/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: USER_ID, code: loginOtp }),
      });
      const d = await res.json();
      if (d.code === 200) {
        setLoginStep('idle');
        setLoginEmail('');
        setLoginOtp('');
        setLoginError('');
        // Refresh wallet status
        const w = await safeGet<WalletStatus>(`${API}/agentic-wallet/status`, 'wallet');
        if (w) { setWallet(w); if (w.wallets) setWallets(w.wallets); }
      } else { setLoginError(d.message || '验证失败'); }
    } catch (e: any) { setLoginError(e.message || '网络错误'); }
    finally { setLoginVerifying(false); }
  }, [loginOtp, USER_ID, safeGet]);

  const handleCancelLogin = useCallback(() => {
    setLoginStep('idle');
    setLoginEmail('');
    setLoginOtp('');
    setLoginError('');
  }, []);

  const handleStart = useCallback(async () => { if (!wallet?.authorized) { setErrors(e => ({ ...e, start: '请先创建并授权 Agentic Wallet' })); return; } setActionLoading(true); const ok = await safePost(`${API}/live-trading/start`, {}, 'start'); if (ok) setIsTrading(true); setActionLoading(false); }, [wallet, safePost]);
  const handleStop = useCallback(async () => { setActionLoading(true); const ok = await safePost(`${API}/live-trading/stop`, {}, 'stop'); if (ok) setIsTrading(false); setActionLoading(false); }, [safePost]);
  const handleSwitchWallet = useCallback(async (address: string) => {
    try {
      await fetch(`${API}/agentic-wallet/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: USER_ID, walletAddress: address }),
      });
      const d = await safeGet<WalletStatus>(`${API}/agentic-wallet/status`, 'wallet');
      if (d) { setWallet(d); if (d.wallets) setWallets(d.wallets); }
    } catch (e: any) {}
  }, [USER_ID, safeGet]);

  const handleRevoke = useCallback(async () => { await safePost(`${API}/agentic-wallet/revoke`, { walletId: wallet?.id }, 'revoke'); setWallet(null); setWallets([]); }, [wallet, safePost]);

  /* ================================================================== */
  /*  Render                                                             */
  /* ================================================================== */
  const walletConnected = !!wallet?.wallet_address;
  const hasWallets = wallets.length > 1;
  const authorized = !!wallet?.authorized;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Page Header (aligned with all other pages) */}
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'white' }}>实盘交易</h1>
        <p style={{ fontSize: 14, color: T.dark400, marginTop: 4 }}>
          Agentic Wallet · 自动交易 · AI 自学习优化
        </p>
      </div>

      {/* Learning Banner */}
      {learningBanner && (
        <div style={{ ...cardBase, padding: '16px 20px', borderColor: 'rgba(99,102,241,0.3)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <TrendingUp size={16} color={T.accent} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>学习系统已优化参数</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {Object.entries(learningBanner.diff).map(([k, v]) => (<ParamDiffBadge key={k} paramKey={k} oldVal={v.old} newVal={v.new} />))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button onClick={() => { const p: any = {}; Object.entries(learningBanner.diff).forEach(([k, v]) => { p[k] = v.new; }); safePost(`${API}/live-trading/config`, p, 'applyLearning'); setConfig(c => ({ ...c, ...p })); setLearningBanner(null); }} style={{ padding: '6px 16px', borderRadius: 10, background: T.accent, color: '#fff', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>应用</button>
            <button onClick={() => setLearningBanner(null)} style={{ padding: '6px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: T.dark300, fontSize: 12, cursor: 'pointer' }}>忽略</button>
            <a href="/learning" target="_blank" rel="noopener noreferrer" style={{ padding: '6px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: T.accent, fontSize: 12, textDecoration: 'none' }}>查看详情</a>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 32 }}>
        {/* ===================================================== */}
        {/*  LEFT SIDEBAR — 380px                                  */}
        {/* ===================================================== */}
        <div style={{ width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Wallet Card */}
          <div style={{ ...cardBase, padding: 20 }}>
            <h3 style={sectionTitle}><Wallet size={14} color={T.accent} /> Agentic Wallet</h3>
            {walletLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '16px 0' }}>
                <RefreshCw size={14} className="animate-spin" color={T.dark400} />
                <span style={{ fontSize: 12, color: T.dark400 }}>加载钱包状态...</span>
              </div>
            ) : walletConnected ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>Agentic Wallet</div>
                    <div style={{ fontSize: 10, color: T.dark400, textTransform: 'uppercase', marginTop: 2 }}>{wallet.chain || 'ETH'}</div>
                  </div>
                  <button onClick={handleRevoke} style={{ padding: '4px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: T.dark300, fontSize: 11, cursor: 'pointer' }}>断开</button>
                </div>

                {/* Multi-address list */}
                {hasWallets && (
                  <div style={{ marginBottom: 12, background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: '6px 8px' }}>
                    <div style={{ fontSize: 10, color: T.dark400, marginBottom: 6 }}>钱包地址列表</div>
                    {wallets.map((w, i) => (
                      <div
                        key={w.wallet_address || i}
                        onClick={() => handleSwitchWallet(w.wallet_address!)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '4px 8px', borderRadius: 6, cursor: w.wallet_address === wallet.wallet_address ? 'default' : 'pointer',
                          background: w.wallet_address === wallet.wallet_address ? 'rgba(99,102,241,0.1)' : 'transparent',
                          marginBottom: 2,
                        }}
                      >
                        <span style={{ fontSize: 10, fontFamily: 'monospace', color: w.wallet_address === wallet.wallet_address ? T.accent : T.dark300 }}>
                          {w.label || fmtAddr(w.wallet_address)}
                        </span>
                        <span style={{ fontSize: 10, fontFamily: 'monospace', color: T.dark300 }}>
                          ${(w.totalUsd ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {!hasWallets && (
                  <button
                    onClick={() => { setLoginEmail(wallet.email || ''); setLoginStep('email'); }}
                    style={{
                      width: '100%', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
                      borderRadius: 8, color: T.accent, fontSize: 10, padding: '6px 0', cursor: 'pointer', marginBottom: 12,
                    }}
                  >+ 添加新地址</button>
                )}
                {loginStep === 'email' && (
                  <div style={{ padding: '4px 8px', marginBottom: 12, background: 'rgba(99,102,241,0.05)', borderRadius: 10 }}>
                    <input
                      type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddNewAddress()}
                      placeholder="输入邮箱创建新地址" autoFocus
                      style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 8, color: 'white', fontSize: 13, padding: '8px 12px', outline: 'none' }}
                    />
                    {loginError && <p style={{ fontSize: 10, color: T.accentRed, marginTop: 4, textAlign: 'center' }}>{loginError}</p>}
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button onClick={handleCancelLogin} style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: T.dark300, fontSize: 11, padding: '6px 0', cursor: 'pointer' }}>取消</button>
                      <button onClick={handleAddNewAddress} disabled={loginSending} style={{ flex: 1, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', borderRadius: 8, color: 'white', fontSize: 11, fontWeight: 600, padding: '6px 0', cursor: loginSending ? 'default' : 'pointer', opacity: loginSending ? 0.6 : 1 }}>{loginSending ? '发送中...' : '发送验证码'}</button>
                    </div>
                  </div>
                )}
                {loginStep === 'otp' && (
                  <div style={{ padding: '4px 8px', marginBottom: 12, background: 'rgba(99,102,241,0.05)', borderRadius: 10 }}>
                    <input
                      type="text" value={loginOtp} onChange={e => setLoginOtp(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleVerifyOtp()}
                      placeholder="输入验证码" autoFocus maxLength={6}
                      style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 8, color: 'white', fontSize: 13, fontWeight: 600, padding: '8px 12px', textAlign: 'center', letterSpacing: 3, outline: 'none' }}
                    />
                    {loginError && <p style={{ fontSize: 10, color: T.accentRed, marginTop: 4, textAlign: 'center' }}>{loginError}</p>}
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button onClick={handleCancelLogin} style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: T.dark300, fontSize: 11, padding: '6px 0', cursor: 'pointer' }}>取消</button>
                      <button onClick={handleVerifyOtp} disabled={loginVerifying} style={{ flex: 1, background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', borderRadius: 8, color: 'white', fontSize: 11, fontWeight: 600, padding: '6px 0', cursor: loginVerifying ? 'default' : 'pointer', opacity: loginVerifying ? 0.6 : 1 }}>{loginVerifying ? '验证中...' : '验证'}</button>
                    </div>
                  </div>
                )}
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: T.dark300 }}>{fmtAddr(wallet.wallet_address)}</span>
                  <button onClick={() => navigator.clipboard.writeText(wallet.wallet_address!)} style={{ background: 'none', border: 'none', color: T.dark400, cursor: 'pointer', padding: 0 }}>
                    <Copy size={13} />
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 10, color: T.dark400, textTransform: 'uppercase' }}>余额</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: 'white', fontFamily: 'monospace' }}>
                      ${(wallet.balance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, background: authorized ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: authorized ? T.accentGreen : T.accentRed, animation: authorized ? 'pulseLED 2s infinite' : 'none' }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: authorized ? T.accentGreen : T.accentRed }}>{authorized ? '已授权' : '未授权'}</span>
                  </div>
                </div>
                {authorized && wallet.expires_at && <div style={{ fontSize: 10, color: T.dark400, marginTop: 8 }}>有效期至 {wallet.expires_at.slice(0, 10)}</div>}
              </>
            ) : (
              <div style={{ textAlign: 'center', paddingTop: 16, paddingBottom: 20 }}>
                {loginStep === 'idle' && (
                  <div>
                    <div style={{ width: 40, height: 40, borderRadius: 20, background: 'rgba(99,102,241,0.1)', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Wallet size={20} color={T.accent} />
                    </div>
                    <p style={{ fontSize: 12, color: T.dark300, marginBottom: 4 }}>未连接 Agentic Wallet</p>
                    <p style={{ fontSize: 10, color: T.dark500, marginBottom: 16 }}>用你的邮箱创建独立 TEE 安全钱包</p>
                    <button
                      onClick={() => setLoginStep('email')}
                      style={{
                        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                        border: 'none', color: 'white', borderRadius: 10,
                        padding: '10px 28px', fontSize: 13, fontWeight: 600,
                        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
                      }}
                    ><Wallet size={14} /> 连接钱包</button>
                  </div>
                )}
                {loginStep === 'email' && (
                  <div style={{ padding: '0 4px' }}>
                    <p style={{ fontSize: 12, color: T.dark300, marginBottom: 12 }}>输入邮箱查找或创建钱包</p>
                    <input
                      type="email"
                      value={loginEmail}
                      onChange={e => setLoginEmail(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleLookupWallet()}
                      placeholder="your@email.com"
                      autoFocus
                      style={{
                        width: '100%', boxSizing: 'border-box',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 10, color: 'white', fontSize: 13,
                        padding: '10px 14px', outline: 'none',
                      }}
                    />
                    {loginError && <p style={{ fontSize: 11, color: T.accentRed, marginTop: 8 }}>{loginError}</p>}
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button onClick={handleCancelLogin} style={{
                        flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 10, color: T.dark300, fontSize: 12, padding: '8px 0', cursor: 'pointer',
                      }}>取消</button>
                      <button onClick={handleLookupWallet} disabled={lookupLoading} style={{
                        flex: 1, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                        border: 'none', borderRadius: 10, color: 'white', fontSize: 12, fontWeight: 600,
                        padding: '8px 0', cursor: lookupLoading ? 'default' : 'pointer', opacity: lookupLoading ? 0.6 : 1,
                      }}>{lookupLoading ? '查找中...' : '查找已有地址'}</button>
                    </div>
                  </div>
                )}
                {loginStep === 'lookup' && lookupWallets && (
                  <div style={{ padding: '0 4px' }}>
                    <p style={{ fontSize: 11, color: T.accentGreen, marginBottom: 12 }}>
                      ✅ 找到 {lookupWallets.length} 个钱包地址
                    </p>
                    <div style={{ maxHeight: 160, overflowY: 'auto', marginBottom: 12 }}>
                      {lookupWallets.map((w, i) => (
                        <div
                          key={w.wallet_address || i}
                          onClick={() => handleSelectWallet(w)}
                          style={{
                            background: 'rgba(255,255,255,0.04)',
                            borderRadius: 8, padding: '8px 12px', marginBottom: 6,
                            cursor: 'pointer', border: '1px solid rgba(99,102,241,0.2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          }}
                        >
                          <div>
                            <span style={{ fontSize: 11, fontFamily: 'monospace', color: T.dark300 }}>{fmtAddr(w.wallet_address)}</span>
                            <span style={{ fontSize: 9, color: T.dark500, marginLeft: 8 }}>{w.label || ''}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'white' }}>
                              ${(w.totalUsd ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                            {w.is_default ? <span style={{ fontSize: 9, color: T.accentGreen, background: 'rgba(16,185,129,0.15)', padding: '1px 6px', borderRadius: 4 }}>当前</span> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                    <p style={{ fontSize: 10, color: T.dark500, marginBottom: 8 }}>或创建新地址（需要邮箱验证码）</p>
                    <button
                      onClick={() => { setLoginStep('otp'); handleSendOtp(); }}
                      disabled={loginSending}
                      style={{
                        width: '100%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                        border: 'none', borderRadius: 10, color: 'white', fontSize: 12, fontWeight: 600,
                        padding: '8px 0', cursor: loginSending ? 'default' : 'pointer', opacity: loginSending ? 0.6 : 1,
                      }}
                    >{loginSending ? '发送中...' : '创建新地址'}</button>
                    <button onClick={handleCancelLogin} style={{
                      width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 10, color: T.dark300, fontSize: 12, padding: '8px 0', cursor: 'pointer', marginTop: 8,
                    }}>取消</button>
                  </div>
                )}
                {loginStep === 'otp' && (
                  <div style={{ padding: '0 4px' }}>
                    <p style={{ fontSize: 11, color: T.dark400, marginBottom: 12 }}>验证码已发送至 <span style={{ color: T.accent }}>{loginEmail}</span></p>
                    <input
                      type="text"
                      value={loginOtp}
                      onChange={e => setLoginOtp(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleVerifyOtp()}
                      placeholder="请输入 6 位验证码"
                      autoFocus
                      maxLength={6}
                      style={{
                        width: '100%', boxSizing: 'border-box',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(99,102,241,0.3)',
                        borderRadius: 10, color: 'white', fontSize: 14, fontWeight: 600,
                        padding: '10px 14px', textAlign: 'center', letterSpacing: 4,
                        outline: 'none',
                      }}
                    />
                    {loginError && <p style={{ fontSize: 11, color: T.accentRed, marginTop: 8 }}>{loginError}</p>}
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button onClick={handleCancelLogin} style={{
                        flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 10, color: T.dark300, fontSize: 12, padding: '8px 0', cursor: 'pointer',
                      }}>取消</button>
                      <button onClick={handleVerifyOtp} disabled={loginVerifying} style={{
                        flex: 1, background: 'linear-gradient(135deg, #10b981, #059669)',
                        border: 'none', borderRadius: 10, color: 'white', fontSize: 12, fontWeight: 600,
                        padding: '8px 0', cursor: loginVerifying ? 'default' : 'pointer', opacity: loginVerifying ? 0.6 : 1,
                      }}>{loginVerifying ? '验证中...' : '验证并连接'}</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Strategy Parameters */}
          <div style={{ ...cardBase, padding: 20 }}>
            <h3 style={sectionTitle}><Settings size={14} color={T.accent} /> 策略参数</h3>
            {configLoading ? <LoadingBlock /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <CF label="单笔上限 (USDT)"><CI type="number" value={config.max_single_amount} onChange={e => handleConfigChange({ max_single_amount: Number(e.target.value) })} /></CF>
                <CF label="滑点容忍 (%)"><CI type="number" step="0.1" value={config.slippage_tolerance} onChange={e => handleConfigChange({ slippage_tolerance: Number(e.target.value) })} /></CF>
                <CF label="Gas 策略">
                  <select value={config.gas_strategy} onChange={e => handleConfigChange({ gas_strategy: e.target.value as any })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontSize: 13, fontFamily: 'monospace' }}>
                    <option value="slow">慢 (Slow)</option><option value="medium">中 (Medium)</option><option value="fast">快 (Fast)</option>
                  </select>
                </CF>
                <CF label="止盈 / 止损 (%)">
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                      <CI type="number" value={config.take_profit_pct} onChange={e => handleConfigChange({ take_profit_pct: Number(e.target.value) })} style={{ paddingRight: 28 }} />
                      <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 10, fontWeight: 700, color: T.accentGreen }}>TP</span>
                    </div>
                    <div style={{ flex: 1, position: 'relative' }}>
                      <CI type="number" value={config.stop_loss_pct} onChange={e => handleConfigChange({ stop_loss_pct: Number(e.target.value) })} style={{ paddingRight: 28 }} />
                      <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 10, fontWeight: 700, color: T.accentRed }}>SL</span>
                    </div>
                  </div>
                </CF>
                <CF label="每日最大亏损 (USDT)"><CI type="number" value={config.daily_max_loss} onChange={e => handleConfigChange({ daily_max_loss: Number(e.target.value) })} /></CF>
                <CF label="最大持仓数"><CI type="number" value={config.max_holdings} onChange={e => handleConfigChange({ max_holdings: Number(e.target.value) })} /></CF>
              </div>
            )}
          </div>

          {/* Auto Learning */}
          <div style={{ ...cardBase, padding: 20 }}>
            <h3 style={sectionTitle}><TrendingUp size={14} color={T.accentPurple} /> 自动学习配置</h3>
            {configLoading ? <LoadingBlock /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <ToggleRow label="自动应用学习参数" desc="学习系统优化后的参数自动应用到实盘" checked={config.auto_apply_params} onChange={v => handleConfigChange({ auto_apply_params: v })} />
                <ToggleRow label="参数变更时暂停" desc="学习参数更新时自动暂停实盘交易" checked={config.pause_on_param_change} onChange={v => handleConfigChange({ pause_on_param_change: v })} />
                {learningDiff && Object.keys(learningDiff).length > 0 && (
                  <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 10, padding: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: T.accent, marginBottom: 8 }}>参数差异</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {Object.entries(learningDiff).map(([k, v]) => (<ParamDiffBadge key={k} paramKey={k} oldVal={v.old} newVal={v.new} />))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ===================================================== */}
        {/*  RIGHT MAIN — fluid                                   */}
        {/* ===================================================== */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Trading Control Bar */}
          <div style={{ ...cardBase, padding: '18px 24px', borderColor: isTrading ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <button onClick={handleStart} disabled={isTrading || actionLoading}
                  style={{ padding: '12px 32px', borderRadius: 12, background: isTrading ? 'rgba(255,255,255,0.05)' : T.accentGreen, border: isTrading ? '1px solid rgba(255,255,255,0.1)' : 'none', color: isTrading ? T.dark400 : '#fff', fontSize: 14, fontWeight: 700, cursor: isTrading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, opacity: isTrading ? 0.4 : 1 }}>
                  <Play size={16} />{actionLoading ? '处理中...' : '开启实盘'}
                </button>
                <button onClick={handleStop} disabled={!isTrading || actionLoading}
                  style={{ padding: '12px 32px', borderRadius: 12, background: !isTrading ? 'rgba(255,255,255,0.05)' : T.accentRed, border: !isTrading ? '1px solid rgba(255,255,255,0.1)' : 'none', color: !isTrading ? T.dark400 : '#fff', fontSize: 14, fontWeight: 700, cursor: !isTrading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, opacity: !isTrading ? 0.4 : 1 }}>
                  <Pause size={16} />{actionLoading ? '处理中...' : '暂停实盘'}
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: isTrading ? T.accentGreen : T.dark400, animation: isTrading ? 'pulseLED 2s infinite' : 'none' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: isTrading ? T.accentGreen : T.dark400 }}>{isTrading ? '运行中' : '已暂停'}</span>
                </div>
                {errors.start && <span style={{ fontSize: 12, color: T.accentRed }}>{errors.start}</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
                <HS label="今日交易" value={`${tradingStatus.today_trades ?? '—'}笔`} />
                <HS label="今日盈亏" value={fmtPnl(tradingStatus.today_pnl)} valueColor={(tradingStatus.today_pnl ?? 0) >= 0 ? T.accentGreen : T.accentRed} />
                <HS label="今日亏损" value={fmtPnl(tradingStatus.today_loss)} valueColor={T.accentRed} alert={(tradingStatus.today_loss ?? 0) <= -(config.daily_max_loss)} alertLabel="已达上限" />
                <HS label="当前持仓" value={`${tradingStatus.current_holdings ?? '—'}个`} alert={(tradingStatus.current_holdings ?? 0) >= config.max_holdings} alertLabel="已达上限" />
              </div>
            </div>
          </div>

          {/* Signal Stream */}
          <div style={{ ...cardBase, padding: 20 }}>
            <h3 style={{ ...sectionTitle, marginBottom: 8 }}><Zap size={14} color={T.accentGreen} /> 实时信号流
              <span style={{ marginLeft: 'auto', fontWeight: 400, fontSize: 11, textTransform: 'none', color: T.dark500 }}>{signals.length > 0 ? `${signals.length} 条信号` : '等待信号'}</span>
            </h3>
            {signals.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <Activity size={36} color={T.dark500} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
                <p style={{ fontSize: 13, color: T.dark400 }}>等待实时信号...</p>
                <p style={{ fontSize: 11, color: T.dark500, marginTop: 4 }}>开启实盘后将通过 WebSocket 接收信号</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto', maxHeight: 460, overflowY: 'auto' }}>
                <style>{`.signal-table-2 tbody tr{animation:signalRowIn .35s ease-out}.signal-table-2 tbody tr:hover{background:rgba(99,102,241,0.04)}`}</style>
                <table className="signal-table-2" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr>
                    <th style={{ textAlign: 'left', padding: '10px 12px', color: T.dark400, fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>时间</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px', color: T.dark400, fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>代币</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px', color: T.dark400, fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>方向</th>
                    <th style={{ textAlign: 'right', padding: '10px 12px', color: T.dark400, fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>价格</th>
                    <th style={{ textAlign: 'right', padding: '10px 12px', color: T.dark400, fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>评分</th>
                    <th style={{ textAlign: 'right', padding: '10px 12px', color: T.dark400, fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>状态</th>
                  </tr></thead>
                  <tbody>
                    {signals.map((s, i) => {
                      const sc = s.score ?? s.confidence ?? 0;
                      const isBuy = s.direction === 'BUY';
                      const exec = s.status === '已执行' || s.status === 'executed';
                      return (
                        <tr key={s.id || i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                          <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: T.dark400 }}>{s.time || '—'}</td>
                          <td style={{ padding: '10px 12px', fontWeight: 600, color: 'white' }}>{s.symbol || s.token || '—'}</td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: isBuy ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: isBuy ? T.accentGreen : T.accentRed }}>
                              {isBuy ? <ArrowUp size={12} /> : <ArrowDown size={12} />}{s.direction}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', color: 'white' }}>{s.price ?? (s.price_usd ? `$${s.price_usd}` : '—')}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                            <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, fontFamily: 'monospace', background: scoreBg(sc), color: scoreColor(sc) }}>{sc}</span>
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, color: exec ? T.accentGreen : T.accentOrange }}>{exec ? '✓ 已执行' : (s.status || '待执行')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Charts Dashboard */}
          <div style={{ ...cardBase, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <BarChartIcon size={16} color={T.accent} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>数据图表</span>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {[7, 30, 90].map(d => (
                  <button key={d} onClick={() => setChartDays(d)}
                    style={{ padding: '4px 14px', borderRadius: 8, fontSize: 11, fontWeight: 600, border: chartDays === d ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent', background: chartDays === d ? 'rgba(99,102,241,0.1)' : 'transparent', color: chartDays === d ? T.accent : T.dark400, cursor: 'pointer' }}>{d}天</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 16 }}>
              <ChartBox title="盈亏曲线" titleColor={T.accentGreen}>
                {pnlData.length === 0 ? <EC /> : (
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={pnlData}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" /><XAxis dataKey="time" stroke={T.dark400} fontSize={10} tickLine={false} axisLine={false} /><YAxis stroke={T.dark400} fontSize={10} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ background: 'rgba(0,0,0,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11, color: 'white' }} /><Line type="monotone" dataKey="pnl" stroke={T.accentGreen} strokeWidth={2} dot={false} /></LineChart>
                  </ResponsiveContainer>
                )}
              </ChartBox>
              <ChartBox title="交易分布" titleColor={T.accentBlue}>
                {distributionData.length === 0 ? <EC /> : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <ResponsiveContainer width="100%" height={320}>
                      <PieChart><Pie data={distributionData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={4} dataKey="value">
                        {distributionData.map((_, i) => (<Cell key={i} fill={_.color || [T.accentGreen, T.accentRed][i % 2]} stroke="rgba(0,0,0,0.6)" strokeWidth={2} />))}
                      </Pie></PieChart>
                    </ResponsiveContainer>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 8 }}>
                      {distributionData.map((e, i) => (<div key={e.name || i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: e.color || [T.accentGreen, T.accentRed][i % 2] }} /><span style={{ fontSize: 12, color: T.dark300 }}>{e.name} {e.value}%</span></div>))}
                    </div>
                  </div>
                )}
              </ChartBox>
              <ChartBox title="资产变化" titleColor={T.accentPurple}>
                {assetData.length === 0 ? <EC /> : (
                  <ResponsiveContainer width="100%" height={320}>
                    <AreaChart data={assetData}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" /><XAxis dataKey="time" stroke={T.dark400} fontSize={10} tickLine={false} axisLine={false} /><YAxis stroke={T.dark400} fontSize={10} tickLine={false} axisLine={false} /><defs><linearGradient id="ag2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={T.accentPurple} stopOpacity={0.3} /><stop offset="95%" stopColor={T.accentPurple} stopOpacity={0} /></linearGradient></defs><Tooltip contentStyle={{ background: 'rgba(0,0,0,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11, color: 'white' }} /><Area type="monotone" dataKey="value" stroke={T.accentPurple} strokeWidth={2} fill="url(#ag2)" /></AreaChart>
                  </ResponsiveContainer>
                )}
              </ChartBox>
              <ChartBox title="代币盈亏排名" titleColor={T.accentOrange}>
                {tokenData.length === 0 ? <EC /> : (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={tokenData} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" /><XAxis type="number" stroke={T.dark400} fontSize={10} tickLine={false} axisLine={false} /><YAxis dataKey="token" type="category" stroke={T.dark400} fontSize={10} tickLine={false} axisLine={false} width={60} /><Tooltip contentStyle={{ background: 'rgba(0,0,0,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11, color: 'white' }} /><Bar dataKey="pnl" radius={[0, 4, 4, 0]}>{tokenData.map((_, i) => (<Cell key={i} fill={(tokenData[i]?.pnl ?? 0) >= 0 ? T.accentGreen : T.accentRed} />))}</Bar></BarChart>
                  </ResponsiveContainer>
                )}
              </ChartBox>
            </div>
          </div>

          {/* Trade History */}
          <div style={{ ...cardBase, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ ...sectionTitle, marginBottom: 0 }}><History size={14} color={T.dark400} /> 交易记录</h3>
              <div style={{ display: 'flex', gap: 4 }}>
                {[{ k: 'all', l: '全部' }, { k: 'today', l: '今日' }, { k: 'week', l: '本周' }, { k: 'month', l: '本月' }].map(b => (
                  <button key={b.k} onClick={() => { setTradeDate(b.k); setTradePage(1); }}
                    style={{ padding: '4px 14px', borderRadius: 8, fontSize: 11, fontWeight: 600, border: tradeDate === b.k ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent', background: tradeDate === b.k ? 'rgba(99,102,241,0.08)' : 'transparent', color: tradeDate === b.k ? T.accent : T.dark400, cursor: 'pointer' }}>{b.l}</button>
                ))}
              </div>
            </div>
            {trades.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <History size={36} color={T.dark500} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
                <p style={{ fontSize: 13, color: T.dark400 }}>暂无交易记录</p>
              </div>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead><tr>
                      <th style={{ textAlign: 'left', padding: '10px 12px', color: T.dark400, fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>时间</th>
                      <th style={{ textAlign: 'left', padding: '10px 12px', color: T.dark400, fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>代币</th>
                      <th style={{ textAlign: 'left', padding: '10px 12px', color: T.dark400, fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>方向</th>
                      <th style={{ textAlign: 'right', padding: '10px 12px', color: T.dark400, fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>金额</th>
                      <th style={{ textAlign: 'right', padding: '10px 12px', color: T.dark400, fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>盈亏</th>
                      <th style={{ textAlign: 'right', padding: '10px 12px', color: T.dark400, fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>状态</th>
                      <th style={{ textAlign: 'right', padding: '10px 12px', color: T.dark400, fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>TxHash</th>
                    </tr></thead>
                    <tbody>{trades.map(t => {
                      const pnl = parseFloat(t.pnl_usd || '0');
                      const dir = t.direction || (pnl !== 0 ? (pnl > 0 ? 'BUY' : 'SELL') : '—');
                      const isBuy = dir === 'BUY';
                      const ok = t.status === '成功' || t.status === 'success';
                      const fail = t.status === '失败' || t.status === 'failed';
                      return (
                        <tr key={t.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                          <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: T.dark400 }}>{t.time || t.created_at || '—'}</td>
                          <td style={{ padding: '10px 12px', fontWeight: 600, color: 'white' }}>{t.token || t.token_out || '—'}</td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: isBuy ? T.accentGreen : T.accentRed }}>
                              {isBuy ? <ArrowUp size={12} /> : <ArrowDown size={12} />}{dir}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', color: 'white' }}>{t.amount_in ? `$${t.amount_in}` : '—'}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: pnl >= 0 ? T.accentGreen : T.accentRed }}>{fmtPnl(pnl)}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11 }}>
                            <span style={{ padding: '2px 8px', borderRadius: 6, fontWeight: 600, background: ok ? 'rgba(16,185,129,0.1)' : fail ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)', color: ok ? T.accentGreen : fail ? T.accentRed : T.accentOrange }}>{t.status || '—'}</span>
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', color: T.dark400 }}>
                            {t.tx_hash ? (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                                <a href={getExplorerUrl(t.chain, t.tx_hash)} target="_blank" rel="noopener noreferrer" style={{ color: T.accent, textDecoration: 'none' }}>{fmtTxHash(t.tx_hash)}</a>
                                <button onClick={() => navigator.clipboard.writeText(t.tx_hash!)} style={{ background: 'none', border: 'none', color: T.dark400, cursor: 'pointer', padding: 0 }}><Copy size={12} /></button>
                              </div>
                            ) : <span style={{ color: T.dark500 }}>—</span>}
                          </td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 16 }}>
                  <button onClick={() => setTradePage(p => Math.max(1, p - 1))} disabled={tradePage <= 1}
                    style={{ padding: '6px 16px', borderRadius: 8, fontSize: 11, fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: T.dark400, cursor: tradePage <= 1 ? 'not-allowed' : 'pointer', opacity: tradePage <= 1 ? 0.3 : 1 }}>← 上一页</button>
                  <span style={{ fontSize: 12, color: T.dark400 }}>第 {tradePage} 页</span>
                  <button onClick={() => setTradePage(p => p + 1)} disabled={trades.length < 20}
                    style={{ padding: '6px 16px', borderRadius: 8, fontSize: 11, fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: T.dark400, cursor: trades.length < 20 ? 'not-allowed' : 'pointer', opacity: trades.length < 20 ? 0.3 : 1 }}>下一页 →</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Confirm Dialog */}
      {confirmDialog && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, background: 'rgba(0,0,0,0.7)' }} onClick={cancelConfigChange}>
          <div style={{ ...cardBase, padding: 24, maxWidth: 360, borderColor: 'rgba(245,158,11,0.3)' }} onClick={e => e.stopPropagation()}>
            <h4 style={{ fontSize: 15, fontWeight: 600, color: T.accentOrange, marginBottom: 8 }}>⚠️ 确认修改</h4>
            <p style={{ fontSize: 12, color: T.dark300, marginBottom: 16 }}>实盘交易运行中，修改关键参数可能影响正在进行的交易。确定要保存吗？</p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={confirmConfigChange} style={{ flex: 1, padding: '10px 16px', borderRadius: 10, background: T.accentOrange, color: '#000', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>确认修改</button>
              <button onClick={cancelConfigChange} style={{ flex: 1, padding: '10px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: T.dark300, fontSize: 12, cursor: 'pointer' }}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* Error Toast */}
      {Object.keys(errors).length > 0 && (
        <div style={{ position: 'fixed', bottom: 16, right: 16, borderRadius: 12, padding: 12, maxWidth: 320, zIndex: 50, background: 'rgba(239,68,68,0.95)', border: '1px solid rgba(239,68,68,0.5)' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 4 }}>数据加载失败</p>
          {Object.entries(errors).slice(0, 3).map(([k, v]) => (<p key={k} style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)' }}>{v}</p>))}
          <button onClick={() => setErrors({})} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 10, cursor: 'pointer', padding: 0, marginTop: 4 }}>✕ 关闭</button>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Sub-components (aligned with project design)                       */
/* ================================================================== */

function ChartBox({ title, titleColor, children }: { title: string; titleColor: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: 16, border: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: titleColor, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function HS({ label, value, valueColor, alert, alertLabel }: { label: string; value: string; valueColor?: string; alert?: boolean; alertLabel?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <span style={{ fontSize: 10, textTransform: 'uppercase', color: T.dark400 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: valueColor || 'white' }}>{value}</span>
        {alert && alertLabel && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, fontWeight: 600, background: 'rgba(239,68,68,0.1)', color: T.accentRed }}>{alertLabel}</span>}
      </div>
    </div>
  );
}

function CF({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: T.dark400, marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

function CI(props: React.InputHTMLAttributes<HTMLInputElement> & { style?: React.CSSProperties }) {
  const { style, ...rest } = props;
  return (
    <input {...rest} style={{
      width: '100%', padding: '8px 12px', borderRadius: 8,
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.1)',
      color: 'white', fontSize: 13, fontFamily: 'JetBrains Mono, monospace',
      ...style,
    }} />
  );
}

function LoadingBlock() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 0', gap: 8 }}>
      <RefreshCw size={14} className="animate-spin" color={T.dark400} />
      <span style={{ fontSize: 12, color: T.dark400 }}>加载中...</span>
    </div>
  );
}

function EC() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0' }}>
      <BarChartIcon size={24} color={T.dark500} style={{ marginBottom: 8, opacity: 0.3 }} />
      <span style={{ fontSize: 12, color: T.dark400 }}>暂无数据</span>
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'white' }}>{label}</div>
        <div style={{ fontSize: 11, color: T.dark400, marginTop: 2 }}>{desc}</div>
      </div>
      <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
        <div style={{ width: 44, height: 24, borderRadius: 12, transition: 'background 0.2s', background: checked ? T.accent : 'rgba(255,255,255,0.1)' }}>
          <div style={{ position: 'absolute', top: 2, left: 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'transform 0.2s', transform: checked ? 'translateX(20px)' : 'translateX(0)' }} />
        </div>
      </label>
    </div>
  );
}

function ParamDiffBadge({ paramKey, oldVal, newVal }: { paramKey: string; oldVal: any; newVal: any }) {
  const m: Record<string, string> = { take_profit_pct: '止盈', stop_loss_pct: '止损', daily_max_loss: '每日最大亏损', max_holdings: '最大持仓', max_single_amount: '单笔上限', slippage_tolerance: '滑点容忍', gas_strategy: 'Gas策略' };
  const s: Record<string, string> = { take_profit_pct: '%', stop_loss_pct: '%', slippage_tolerance: '%' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 6, fontSize: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <span style={{ color: T.dark400 }}>{m[paramKey] || paramKey}</span>
      <span style={{ color: T.accentRed, textDecoration: 'line-through' }}>{String(oldVal)}{s[paramKey] || ''}</span>
      <span style={{ color: T.dark500 }}>→</span>
      <span style={{ color: T.accentGreen, fontWeight: 700 }}>{String(newVal)}{s[paramKey] || ''}</span>
    </span>
  );
}
