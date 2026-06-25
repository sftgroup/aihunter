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
  ArrowUp, ArrowDown, History, Send, Key, Mail
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

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 10,
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: 'white',
  fontSize: 13,
  fontFamily: 'monospace',
  outline: 'none',
};

const btnPrimary: React.CSSProperties = {
  width: '100%',
  padding: '10px 16px',
  borderRadius: 10,
  background: T.accent,
  border: 'none',
  color: 'white',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
};

/* ================================================================== */
/*  API                                                                */
/* ================================================================== */
const API = '/api';
const getUserId = () => {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem('aihunter_user_id');
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('aihunter_user_id', id); }
  return id;
};
const USER_ID = getUserId();

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */
interface WalletBalance {
  symbol?: string;
  balance?: string;
  usdValue?: string;
}

interface WalletStatus {
  id?: number;
  wallet_address?: string;
  chain?: string;
  status?: string;
  balance?: number;
  totalUsd?: number;
  balances?: WalletBalance[];
  authorized?: boolean;
  expires_at?: string;
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
  symbol: string; chain: string; signal: string; score: number;
  price: number; volume24h: number; liquidity: number;
}

interface ChartPoint { time?: string; pnl?: number; value?: number; name?: string; color?: string; }

interface TradeRecord {
  id: number; token_in: string; token_out: string; amount_in: number;
  amount_out?: number; price?: number; status: string; created_at: string;
  pnl_usd?: number; chain?: string;
}

/* ================================================================== */
/*  Sub-components (module-level for stable React refs)                */
/* ================================================================== */
const SectionTitle: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
  <h3 style={sectionTitle}>{icon} {label}</h3>
);

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 34 }}>
    <span style={{ fontSize: 12, color: T.dark300, width: 130, flexShrink: 0 }}>{label}</span>
    <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
  </div>
);

const CF = Row;
const CI = (p: React.InputHTMLAttributes<HTMLInputElement> & { style?: React.CSSProperties }) => (
  <input {...p} style={{ ...inputStyle, ...p.style }} />
);

const ToggleRow: React.FC<{ label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, desc, checked, onChange }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
    <div><div style={{ fontSize: 12, fontWeight: 500, color: T.dark200 }}>{label}</div><div style={{ fontSize: 10, color: T.dark500, marginTop: 2 }}>{desc}</div></div>
    <label style={{ position: 'relative', display: 'inline-block', width: 36, height: 20, cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
      <span style={{ position: 'absolute', inset: 0, background: checked ? T.accent : T.dark600, borderRadius: 20, transition: '0.2s' }} />
      <span style={{ position: 'absolute', left: checked ? 18 : 2, top: 2, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: '0.2s' }} />
    </label>
  </div>
);

const LoadingBlock: React.FC = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '16px 0' }}>
    <RefreshCw size={14} className="animate-spin" color={T.dark400} />
    <span style={{ fontSize: 12, color: T.dark400 }}>加载中...</span>
  </div>
);

const ParamDiffBadge: React.FC<{ paramKey: string; oldVal: any; newVal: any }> = ({ paramKey, oldVal, newVal }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
    <span style={{ color: T.dark400, fontFamily: 'monospace' }}>{paramKey}</span>
    <span style={{ color: T.accentRed, textDecoration: 'line-through' }}>{String(oldVal)}</span>
    <ArrowUp size={10} color={T.accentGreen} />
    <span style={{ color: T.accentGreen, fontWeight: 600 }}>{String(newVal)}</span>
  </div>
);

/* ================================================================== */
/*  Helper                                                             */
/* ================================================================== */
const fmtAddr = (a: string) => a ? `${a.slice(0, 6)}...${a.slice(-4)}` : '';
const injectAnim = () => {
  if (typeof document === 'undefined') return;
  if (!document.getElementById('live-pulse-led')) {
    const s = document.createElement('style');
    s.id = 'live-pulse-led';
    s.textContent = '@keyframes pulseLED{0%,100%{opacity:1}50%{opacity:0.25}}';
    document.head.appendChild(s);
  }
};

/* ================================================================== */
/*  Main Component                                                     */
/* ================================================================== */

export default function MomentumLivePage() {
  useEffect(() => { injectAnim(); }, []);

  /* ---- wallet ---- */
  const [wallet, setWallet] = useState<WalletStatus | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);

  /* ---- wallet login flow ---- */
  const [loginEmail, setLoginEmail] = useState('');
  const [loginOtp, setLoginOtp] = useState('');
  const [loginStep, setLoginStep] = useState('idle');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

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
  const statusTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

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
  useEffect(() => { let c = false; (async () => { setWalletLoading(true); const d = await safeGet<WalletStatus>(`${API}/agentic-wallet/status`, 'wallet'); if (!c && d) setWallet(d); if (!c) setWalletLoading(false); })(); return () => { c = true; }; }, [safeGet]);
  useEffect(() => { let c = false; (async () => { setConfigLoading(true); const d = await safeGet<LiveConfig>(`${API}/live-trading/config?strategy=momentum`, 'config'); if (!c && d) setConfig(d); if (!c) setConfigLoading(false); })(); return () => { c = true; }; }, [safeGet]);
  useEffect(() => { safeGet<{ date: string; pnl: number }[]>(`${API}/live-trading/chart/pnl?days=${chartDays}`, 'pnl').then(d => d && setPnlData(d.map(r => ({ time: r.date, pnl: r.pnl })))); safeGet<{ wins: number; losses: number }>(`${API}/live-trading/chart/distribution`, 'dist').then(d => d && setDistributionData([{ name: '盈利', value: d.wins || 0, color: T.accentGreen }, { name: '亏损', value: d.losses || 0, color: T.accentRed }])); safeGet<{ date: string; total: number }[]>(`${API}/live-trading/chart/assets?days=${chartDays}`, 'assets').then(d => d && setAssetData(d.map(r => ({ time: r.date, value: r.total })))); safeGet<{ token: string; pnl: number }[]>(`${API}/live-trading/chart/tokens`, 'tokens').then(d => d && setTokenData(d)); }, [safeGet, chartDays]);
  useEffect(() => { safeGet<{ records: TradeRecord[]; total: number }>(`${API}/live-trading/trades?date=${tradeDate}&page=${tradePage}&limit=20`, 'trades').then(d => d && setTrades(d.records)); }, [safeGet, tradeDate, tradePage]);

  /* ---- Trading status polling ---- */
  useEffect(() => {
    const poll = async () => {
      const s = await safeGet<{ is_active: boolean; today_trades: number; today_pnl: number; today_loss: number; current_holdings: number }>(`${API}/live-trading/status`, 'status');
      if (s) { setIsTrading(s.is_active || false); setTradingStatus({ today_trades: s.today_trades, today_pnl: s.today_pnl, today_loss: s.today_loss, current_holdings: s.current_holdings }); }
    };
    poll();
    statusTimer.current = setInterval(poll, 5000);
    return () => { if (statusTimer.current) clearInterval(statusTimer.current); };
  }, [safeGet]);

  /* ---- WebSocket for signals ---- */
  useEffect(() => {
    const token = getAuthToken();
    const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?token=${encodeURIComponent(token ?? "")}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'signal') {
          setSignals(prev => [msg.data, ...prev].slice(0, 50));
        } else if (msg.type === 'learning') {
          setLearningBanner(msg.data);
        }
      } catch {}
    };
    ws.onclose = () => { wsRef.current = null; };
    return () => { ws.close(); };
  }, []);

  /* ---- Learning params & diff ---- */
  useEffect(() => {
    safeGet<LiveConfig>(`${API}/live-trading/params?strategy=momentum`, 'params').then(d => {
      if (d) setLearningParams(d);
    });
  }, [safeGet]);

  useEffect(() => {
    if (!learningParams || !config) { setLearningDiff(null); return; }
    const diff: Record<string, { old: any; new: any }> = {};
    const keys: (keyof LiveConfig)[] = ['max_single_amount', 'slippage_tolerance', 'take_profit_pct', 'stop_loss_pct', 'daily_max_loss', 'max_holdings'];
    for (const k of keys) {
      if (learningParams[k] != null && learningParams[k] !== config[k]) {
        diff[k] = { old: config[k], new: learningParams[k] };
      }
    }
    setLearningDiff(Object.keys(diff).length > 0 ? diff : null);
  }, [learningParams, config]);

  /* ================================================================== */
  /*  Wallet login flow                                                  */
  /* ================================================================== */
  const handleSendOtp = useCallback(async () => {
    if (!loginEmail || loginLoading) return;
    setLoginLoading(true); setLoginError('');
    try {
      const res: any = await api.post(`${API}/agentic-wallet/login`, { json: { userId: USER_ID, email: loginEmail } });
      if (res && res.code === 200) {
        setLoginStep('otp');
      } else {
        setLoginError(res?.message || '发送验证码失败');
      }
    } catch (e: any) {
      setLoginError(e?.message || '请求失败');
    } finally {
      setLoginLoading(false);
    }
  }, [loginEmail, loginLoading]);

  const handleVerifyOtp = useCallback(async () => {
    if (!loginOtp || loginLoading) return;
    setLoginLoading(true); setLoginError('');
    try {
      const res: any = await api.post(`${API}/agentic-wallet/verify`, { json: { userId: USER_ID, code: loginOtp } });
      if (res && res.code === 200 && res.data) {
        setWallet(res.data);
        setLoginStep('idle');
        setLoginEmail('');
        setLoginOtp('');
      } else {
        setLoginError(res?.message || '验证失败');
      }
    } catch (e: any) {
      setLoginError(e?.message || '请求失败');
    } finally {
      setLoginLoading(false);
    }
  }, [loginOtp, loginLoading]);

  const handleCancelLogin = useCallback(() => {
    setLoginStep('idle');
    setLoginEmail('');
    setLoginOtp('');
    setLoginError('');
  }, []);

  /* ================================================================== */
  /*  Actions                                                            */
  /* ================================================================== */
  const handleConfigChange = useCallback((patch: Partial<LiveConfig>) => {
    setConfig(prev => ({ ...prev, ...patch }));
  }, []);

  const handleSaveConfig = useCallback(async () => {
    setActionLoading(true);
    await safePost(`${API}/live-trading/config`, { strategy: 'momentum', ...config }, 'saveConfig');
    setActionLoading(false);
  }, [config, safePost]);

  const handleStart = useCallback(async () => {
    if (!wallet?.wallet_address) {
      setErrors(e => ({ ...e, start: '请先连接 Agentic Wallet' }));
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
    await safePost(`${API}/agentic-wallet/revoke`, {}, 'revoke');
    setWallet(null);
  }, [safePost]);

  const handleApplyLearning = useCallback(async () => {
    if (!learningParams) return;
    setActionLoading(true);
    await safePost(`${API}/live-trading/config`, { strategy: 'momentum', ...learningParams }, 'applyLearning');
    setConfig(learningParams);
    setActionLoading(false);
  }, [learningParams, safePost]);

  const walletConnected = !!wallet?.wallet_address;
  const authorized = !!wallet?.wallet_address;

  /* ================================================================== */
  /*  RENDER                                                            */
  /* ================================================================== */
  return (
    <div style={{ padding: '0 8px', maxWidth: 1600, margin: '0 auto' }}>
      {/* ============================================================ */}
      {/*  Page Header                                                   */}
      {/* ============================================================ */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <Activity size={18} color={T.accent} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'white' }}>实盘交易</h2>
          <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: 'rgba(99,102,241,0.15)', color: T.accent }}>DEX 动量策略</span>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: T.dark400 }}>
          Agentic Wallet · 自动交易 · AI 自学习优化
        </p>
      </div>

      <div style={{ display: 'flex', gap: 32 }}>
        {/* ===================================================== */}
        {/*  LEFT SIDEBAR — 380px                                  */}
        {/* ===================================================== */}
        <div style={{ width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Wallet Card */}
          <div style={{ ...cardBase, padding: 20 }}>
            <h3 style={sectionTitle}><Wallet size={14} color={T.accent} /> Agentic Wallet</h3>
            {walletLoading ? (
              <LoadingBlock />
            ) : walletConnected ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>Agentic Wallet</div>
                    <div style={{ fontSize: 10, color: T.dark400, textTransform: 'uppercase', marginTop: 2 }}>{wallet.chain || 'ETH'}</div>
                  </div>
                  <button onClick={handleRevoke} style={{ padding: '4px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: T.dark300, fontSize: 11, cursor: 'pointer' }}>断开</button>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: T.dark300 }}>{fmtAddr(wallet.wallet_address!)}</span>
                  <button onClick={() => navigator.clipboard.writeText(wallet.wallet_address!)} style={{ background: 'none', border: 'none', color: T.dark400, cursor: 'pointer', padding: 0 }}>
                    <Copy size={13} />
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 10, color: T.dark400, textTransform: 'uppercase' }}>余额</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: 'white', fontFamily: 'monospace' }}>
                      ${(wallet.totalUsd ?? wallet.balance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, background: authorized ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: authorized ? T.accentGreen : T.accentRed, animation: authorized ? 'pulseLED 2s infinite' : 'none' }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: authorized ? T.accentGreen : T.accentRed }}>{authorized ? '已授权' : '未授权'}</span>
                  </div>
                </div>
                {/* Balances list */}
                {wallet.balances && wallet.balances.length > 0 && (
                  <div style={{ marginTop: 12, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ fontSize: 10, color: T.dark500, marginBottom: 6, textTransform: 'uppercase' }}>资产明细</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {wallet.balances.slice(0, 5).map((b, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                          <span style={{ color: T.dark200, fontFamily: 'monospace' }}>{b.symbol || 'N/A'}</span>
                          <span style={{ color: T.dark300 }}>{b.balance ? Number(b.balance).toFixed(4) : '-'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {authorized && wallet.expires_at && <div style={{ fontSize: 10, color: T.dark400, marginTop: 8 }}>有效期至 {wallet.expires_at.slice(0, 10)}</div>}
              </>
            ) : loginStep === 'idle' ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <AlertCircle size={24} color={T.accentOrange} style={{ margin: '0 auto 8px' }} />
                <p style={{ fontSize: 12, color: T.dark400, marginBottom: 4 }}>未连接 Agentic Wallet</p>
                <p style={{ fontSize: 10, color: T.dark500, marginBottom: 12 }}>用你的邮箱创建独立 TEE 安全钱包</p>
                <button onClick={() => setLoginStep('email')} style={btnPrimary}>
                  <Wallet size={14} /> 连接钱包
                </button>
              </div>
            ) : loginStep === 'email' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 12, color: T.dark300 }}>输入你的邮箱创建 Agentic Wallet</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="email"
                    placeholder="your@email.com"
                    value={loginEmail}
                    onChange={e => setLoginEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSendOtp()}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button onClick={handleSendOtp} disabled={loginLoading || !loginEmail} style={{ ...btnPrimary, width: 'auto', whiteSpace: 'nowrap', opacity: loginLoading ? 0.5 : 1 }}>
                    {loginLoading ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                    发送
                  </button>
                </div>
                <button onClick={handleCancelLogin} style={{ background: 'none', border: 'none', color: T.dark500, fontSize: 11, cursor: 'pointer', padding: 0, alignSelf: 'flex-start' }}>取消</button>
                {loginError && <div style={{ fontSize: 11, color: T.accentRed, display: 'flex', alignItems: 'center', gap: 4 }}><AlertCircle size={12} />{loginError}</div>}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 12, color: T.dark300 }}>
                  验证码已发送至 <span style={{ color: T.accent, fontWeight: 600 }}>{loginEmail}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    placeholder="输入 6 位验证码"
                    value={loginOtp}
                    onChange={e => setLoginOtp(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleVerifyOtp()}
                    maxLength={6}
                    style={{ ...inputStyle, flex: 1, letterSpacing: '0.2em', textAlign: 'center' }}
                  />
                  <button onClick={handleVerifyOtp} disabled={loginLoading || !loginOtp} style={{ ...btnPrimary, width: 'auto', whiteSpace: 'nowrap', opacity: loginLoading ? 0.5 : 1 }}>
                    {loginLoading ? <RefreshCw size={14} className="animate-spin" /> : <Key size={14} />}
                    验证
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button onClick={() => { setLoginStep('email'); setLoginError(''); }} style={{ background: 'none', border: 'none', color: T.dark400, fontSize: 11, cursor: 'pointer', padding: 0 }}>← 修改邮箱</button>
                  <button onClick={handleCancelLogin} style={{ background: 'none', border: 'none', color: T.dark500, fontSize: 11, cursor: 'pointer', padding: 0 }}>取消</button>
                </div>
                {loginError && <div style={{ fontSize: 11, color: T.accentRed, display: 'flex', alignItems: 'center', gap: 4 }}><AlertCircle size={12} />{loginError}</div>}
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
                <button onClick={handleSaveConfig} disabled={actionLoading} style={{ ...btnPrimary, marginTop: 4 }}>
                  {actionLoading ? <RefreshCw size={14} className="animate-spin" /> : null} 保存配置
                </button>
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
                    <button onClick={handleApplyLearning} disabled={actionLoading} style={{ ...btnPrimary, marginTop: 10, fontSize: 12 }}>
                      {actionLoading ? <RefreshCw size={12} className="animate-spin" /> : <Zap size={12} />} 应用学习参数
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ===================================================== */}
        {/*  RIGHT MAIN — fluid                                    */}
        {/* ===================================================== */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Control Bar */}
          <div style={{ ...cardBase, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 10, background: isTrading ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${isTrading ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: isTrading ? T.accentGreen : T.accentRed, animation: isTrading ? 'pulseLED 2s infinite' : 'none' }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: isTrading ? T.accentGreen : T.accentRed }}>{isTrading ? '运行中' : '已停止'}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {isTrading ? (
                  <button onClick={handleStop} disabled={actionLoading} style={{ padding: '8px 16px', borderRadius: 8, background: T.accentRed, border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: actionLoading ? 0.5 : 1 }}>
                    <Pause size={14} /> 停止
                  </button>
                ) : (
                  <button onClick={handleStart} disabled={actionLoading} style={{ padding: '8px 16px', borderRadius: 8, background: T.accentGreen, border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: actionLoading ? 0.5 : 1 }}>
                    <Play size={14} /> 启动
                  </button>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 24 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: T.dark500, textTransform: 'uppercase' }}>今日交易</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'white', fontFamily: 'monospace' }}>{tradingStatus.today_trades ?? '-'}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: T.dark500, textTransform: 'uppercase' }}>今日盈亏</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: (tradingStatus.today_pnl ?? 0) >= 0 ? T.accentGreen : T.accentRed, fontFamily: 'monospace' }}>
                  {(tradingStatus.today_pnl ?? 0) >= 0 ? '+' : ''}{tradingStatus.today_pnl?.toFixed(2) ?? '-'} USDT
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: T.dark500, textTransform: 'uppercase' }}>持仓数</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'white', fontFamily: 'monospace' }}>{tradingStatus.current_holdings ?? '-'}</div>
              </div>
            </div>
          </div>

          {errors.start && (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <span style={{ fontSize: 12, color: T.accentRed, display: 'flex', alignItems: 'center', gap: 6 }}><AlertCircle size={13} /> {errors.start}</span>
            </div>
          )}

          {learningBanner && (
            <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Activity size={14} color={T.accent} />
                <span style={{ fontSize: 12, color: T.dark200 }}>学习系统发现更优参数</span>
              </div>
              <button onClick={handleApplyLearning} style={{ padding: '5px 12px', borderRadius: 6, background: T.accent, border: 'none', color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>应用</button>
            </div>
          )}

          {/* Signal Stream */}
          <div style={{ ...cardBase, padding: 16 }}>
            <h3 style={{ ...sectionTitle, marginBottom: 8 }}><Zap size={14} color={T.accentGreen} /> 交易信号流 (WebSocket)</h3>
            <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {signals.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                  <BarChartIcon size={20} color={T.dark600} style={{ margin: '0 auto 6px' }} />
                  <div style={{ fontSize: 11, color: T.dark500 }}>等待信号...</div>
                </div>
              ) : (
                signals.map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', fontSize: 12 }}>
                    <span style={{ fontWeight: 600, color: 'white', fontFamily: 'monospace', minWidth: 60 }}>{s.symbol}</span>
                    <span style={{ color: T.dark500, fontSize: 10, minWidth: 28 }}>{s.chain}</span>
                    <span style={{ color: s.signal.includes('BUY') ? T.accentGreen : T.accentRed, fontWeight: 600, minWidth: 42 }}>{s.signal}</span>
                    <span style={{ color: T.dark300, fontFamily: 'monospace', marginLeft: 'auto' }}>{s.price?.toFixed(6)}</span>
                    <span style={{ color: T.accent, fontWeight: 600, minWidth: 44, textAlign: 'right' }}>{s.score?.toFixed(1)} 分</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Charts — 2x2 grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* PnL Chart */}
            <div style={{ ...cardBase, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <h3 style={{ ...sectionTitle, marginBottom: 0 }}><TrendingUp size={13} color={T.accentGreen} /> 盈亏曲线</h3>
                <select value={chartDays} onChange={e => setChartDays(Number(e.target.value))} style={{ padding: '3px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: T.dark300, fontSize: 10 }}>
                  <option value={7}>7天</option><option value={30}>30天</option><option value={90}>90天</option>
                </select>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={pnlData}>
                  <defs><linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={T.accentGreen} stopOpacity={0.2} /><stop offset="100%" stopColor={T.accentGreen} stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="time" tick={{ fontSize: 9, fill: T.dark500 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: T.dark500 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: T.dark800, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }} />
                  <Area type="monotone" dataKey="pnl" stroke={T.accentGreen} fill="url(#pnlGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Win/Loss Distribution */}
            <div style={{ ...cardBase, padding: 16 }}>
              <h3 style={{ ...sectionTitle, marginBottom: 8 }}><Shield size={13} color={T.accentPurple} /> 盈亏分布</h3>
              {distributionData.some(d => (d.value ?? 0) > 0) ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={distributionData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4}>
                      {distributionData.map((d, i) => <Cell key={i} fill={d.color || T.accent} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: T.dark800, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
                  <span style={{ fontSize: 12, color: T.dark500 }}>暂无数据</span>
                </div>
              )}
            </div>

            {/* Asset Chart */}
            <div style={{ ...cardBase, padding: 16 }}>
              <h3 style={{ ...sectionTitle, marginBottom: 8 }}><BarChartIcon size={13} color={T.accentBlue} /> 资产变化</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={assetData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="time" tick={{ fontSize: 9, fill: T.dark500 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: T.dark500 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: T.dark800, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }} />
                  <Bar dataKey="value" fill={T.accentBlue} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Token PnL */}
            <div style={{ ...cardBase, padding: 16 }}>
              <h3 style={{ ...sectionTitle, marginBottom: 8 }}><Activity size={13} color={T.accentOrange} /> Token 盈亏排行</h3>
              {tokenData.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                  {tokenData.map((t, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', borderRadius: 6, background: i % 2 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                      <span style={{ fontSize: 11, color: T.dark200, fontFamily: 'monospace' }}>{t.name}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: (t.value ?? 0) >= 0 ? T.accentGreen : T.accentRed, fontFamily: 'monospace' }}>
                        {(t.value ?? 0) >= 0 ? '+' : ''}{t.value?.toFixed(2)} USDT
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
                  <span style={{ fontSize: 12, color: T.dark500 }}>暂无数据</span>
                </div>
              )}
            </div>
          </div>

          {/* Trade History */}
          <div style={{ ...cardBase, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ ...sectionTitle, marginBottom: 0 }}><History size={13} color={T.dark400} /> 交易历史</h3>
              <select value={tradeDate} onChange={e => setTradeDate(e.target.value)} style={{ padding: '3px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: T.dark300, fontSize: 10 }}>
                <option value="all">全部</option><option value="today">今日</option><option value="week">本周</option><option value="month">本月</option>
              </select>
            </div>
            {trades.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <History size={18} color={T.dark600} style={{ margin: '0 auto 6px' }} />
                <div style={{ fontSize: 11, color: T.dark500 }}>暂无交易记录</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: T.dark500, fontWeight: 500, fontSize: 10 }}>时间</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: T.dark500, fontWeight: 500, fontSize: 10 }}>链</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: T.dark500, fontWeight: 500, fontSize: 10 }}>Token</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: T.dark500, fontWeight: 500, fontSize: 10 }}>状态</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', color: T.dark500, fontWeight: 500, fontSize: 10 }}>金额</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', color: T.dark500, fontWeight: 500, fontSize: 10 }}>盈亏</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((t, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                        <td style={{ padding: '6px 8px', color: T.dark400, fontFamily: 'monospace', fontSize: 11 }}>{t.created_at?.slice(0, 16).replace('T', ' ')}</td>
                        <td style={{ padding: '6px 8px', color: T.dark300, fontSize: 11 }}>{t.chain || '-'}</td>
                        <td style={{ padding: '6px 8px', color: T.dark200, fontFamily: 'monospace', fontSize: 11 }}>{t.token_out}</td>
                        <td style={{ padding: '6px 8px' }}>
                          <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: t.status === 'completed' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)', color: t.status === 'completed' ? T.accentGreen : T.accentOrange }}>
                            {t.status === 'completed' ? '完成' : t.status}
                          </span>
                        </td>
                        <td style={{ padding: '6px 8px', color: T.dark200, fontFamily: 'monospace', fontSize: 11, textAlign: 'right' }}>{t.amount_in?.toFixed(2)}</td>
                        <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 11, textAlign: 'right', color: (t.pnl_usd ?? 0) >= 0 ? T.accentGreen : T.accentRed }}>
                          {(t.pnl_usd ?? 0) >= 0 ? '+' : ''}{t.pnl_usd?.toFixed(2) ?? '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
