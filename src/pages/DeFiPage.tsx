import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PiggyBank, TrendingUp, TrendingDown, Zap, RefreshCw, Radar, Clock, ListOrdered, ChevronDown, ChevronUp, Download, X, ExternalLink, Activity } from 'lucide-react';
import { lendingApi, arbitrageApi, strategyApiV3 } from '../utils/api';
import type { RateSnapshot, ArbOpportunity, ArbConfig, ArbTrade, ArbTradeStats, ArbTradeResult, StrategyInfo } from '../utils/api';
import StrategyCard from '../components/StrategyCard';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

const cardBase: React.CSSProperties = {
  background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
  backdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 16,
  boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
};

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(99,102,241,0.3)',
  borderRadius: 8,
  color: 'white',
  fontSize: 14,
  padding: '10px 14px',
  width: '100%',
  outline: 'none',
  boxSizing: 'border-box' as const,
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  color: T.dark400,
  marginBottom: 6,
  fontWeight: 500,
};

const btnBase: React.CSSProperties = {
  padding: '7px 14px',
  borderRadius: 10,
  border: '1px solid transparent',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.2s',
};

const tabBtn = (isActive: boolean): React.CSSProperties => ({
  background: isActive ? 'rgba(99,102,241,0.15)' : 'transparent',
  color: isActive ? T.accent : T.dark400,
  border: isActive ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
  padding: '7px 14px',
  borderRadius: 10,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.2s',
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtUsd(v: number): string {
  if (v >= 0) return '+$' + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return '-$' + Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(v: number): string {
  return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
}

function fmtCountdown(seconds: number): string {
  if (seconds <= 0) return '已过期';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const STORAGE_KEY = 'aihunter_arb_config';
function loadConfig(): ArbConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    userId: localStorage.getItem('aihunter_user_id') || 'default',
    minSpreadPct: 0.3,
    maxSlippagePct: 1.0,
    gasCapGwei: 50,
    minProfitUsdt: 10,
    chains: ['ETH', 'BSC'],
  };
}
function saveConfig(c: ArbConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
}

const CHAIN_OPTIONS = ['ETH', 'BSC', 'BASE', 'SOL', 'ARB', 'OP'];
const CHAIN_COLORS: Record<string, string> = {
  ETH: '#627eea', BSC: '#f0b90b', BASE: '#0052ff', SOL: '#9945ff', ARB: '#28a0f0', OP: '#ff0420',
};

// ---------------------------------------------------------------------------
// Inline animations
// ---------------------------------------------------------------------------
let _animInjected = false;
function injectAnim() {
  if (_animInjected) return;
  _animInjected = true;
  if (typeof document === 'undefined') return;
  const s = document.createElement('style');
  s.textContent = `
    @keyframes blinkRed { 0%,100% { color: #ef4444; } 50% { color: rgba(239,68,68,0.3); } }
    @keyframes fadeSlideIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
    .arb-row-in { animation: fadeSlideIn 0.3s ease-out; }
    .arb-blink { animation: blinkRed 0.6s ease-in-out infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `;
  document.head.appendChild(s);
}

// =========================================================================
//  Tab 1: 套利雷达
// =========================================================================

function ArbitrageRadar() {
  const [cfg, setCfg] = useState<ArbConfig>(loadConfig);
  const [cfgCollapsed, setCfgCollapsed] = useState(() => {
    try { return localStorage.getItem('arb_cfg_collapsed') === 'true'; } catch { return false; }
  });
  const [opportunities, setOpportunities] = useState<ArbOpportunity[]>([]);
  const [loadingOpps, setLoadingOpps] = useState(true);
  const [showExecute, setShowExecute] = useState<ArbOpportunity | null>(null);
  const [executing, setExecuting] = useState(false);
  const [execResult, setExecResult] = useState<ArbTradeResult | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const userId = localStorage.getItem('aihunter_user_id') || 'default';

  // Load opportunities
  const loadOpps = useCallback(async () => {
    const res = await arbitrageApi.getOpportunities({ minProfit: cfg.minProfitUsdt, limit: 50 });
    if (res.code === 200 && res.data) {
      setOpportunities(res.data);
    }
    setLoadingOpps(false);
  }, [cfg.minProfitUsdt]);

  useEffect(() => {
    loadOpps();
    timerRef.current = setInterval(loadOpps, 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [loadOpps]);

  // Save config toggles
  const updateCfg = useCallback((patch: Partial<ArbConfig>) => {
    setCfg(prev => {
      const next = { ...prev, ...patch };
      saveConfig(next);
      return next;
    });
  }, []);

  const toggleChain = useCallback((ch: string) => {
    setCfg(prev => {
      const next = { ...prev, chains: prev.chains.includes(ch) ? prev.chains.filter(c => c !== ch) : [...prev.chains, ch] };
      saveConfig(next);
      return next;
    });
  }, []);

  const toggleCfg = useCallback(() => {
    setCfgCollapsed(prev => { const n = !prev; localStorage.setItem('arb_cfg_collapsed', n ? 'true' : 'false'); return n; });
  }, []);

  // Stats
  const bestProfit = opportunities.reduce((max, o) => Math.max(max, o.estimatedProfitUsdt), 0);
  const avgSpread = opportunities.length > 0
    ? opportunities.reduce((sum, o) => sum + o.spreadPct, 0) / opportunities.length
    : 0;

  // Execute
  const handleExecute = useCallback(async () => {
    if (!showExecute) return;
    setExecuting(true);
    setExecResult(null);
    const res = await arbitrageApi.execute({ userId, opportunityId: showExecute.id, amount: '0', slippage: cfg.maxSlippagePct });
    if (res.code === 200 && res.data) {
      setExecResult(res.data);
    } else {
      setExecResult({ tradeId: 0, status: 'failed', failReason: res.error || '交易执行失败' });
    }
    setExecuting(false);
  }, [showExecute, userId, cfg.maxSlippagePct]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* === Config Panel === */}
      <div style={{ ...cardBase, padding: 16 }}>
        <div
          onClick={toggleCfg}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Radar size={16} color={T.accent} />
            <p style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>套利参数</p>
            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 100, background: 'rgba(99,102,241,0.12)', color: T.accent }}>
              {opportunities.length} 个机会
            </span>
          </div>
          {cfgCollapsed ? <ChevronDown size={14} color={T.dark400} /> : <ChevronUp size={14} color={T.dark400} />}
        </div>

        {!cfgCollapsed && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
            {/* Min Spread */}
            <div style={{ flex: '1 1 160px' }}>
              <p style={labelStyle}>最小价差 (%)</p>
              <input style={inputStyle} type="number" step="0.1" min="0"
                value={cfg.minSpreadPct}
                onChange={e => updateCfg({ minSpreadPct: parseFloat(e.target.value) || 0 })}
              />
            </div>
            {/* Max Slippage */}
            <div style={{ flex: '1 1 160px' }}>
              <p style={labelStyle}>最大滑点 (%)</p>
              <input style={inputStyle} type="number" step="0.1" min="0"
                value={cfg.maxSlippagePct}
                onChange={e => updateCfg({ maxSlippagePct: parseFloat(e.target.value) || 0 })}
              />
            </div>
            {/* Gas Cap */}
            <div style={{ flex: '1 1 160px' }}>
              <p style={labelStyle}>Gas 上限 (Gwei)</p>
              <input style={inputStyle} type="number" step="1" min="0"
                value={cfg.gasCapGwei}
                onChange={e => updateCfg({ gasCapGwei: parseInt(e.target.value) || 0 })}
              />
            </div>
            {/* Min Profit */}
            <div style={{ flex: '1 1 160px' }}>
              <p style={labelStyle}>最小利润 (USDT)</p>
              <input style={inputStyle} type="number" step="1" min="0"
                value={cfg.minProfitUsdt}
                onChange={e => updateCfg({ minProfitUsdt: parseFloat(e.target.value) || 0 })}
              />
            </div>
            {/* Chains */}
            <div style={{ flex: '1 1 100%' }}>
              <p style={labelStyle}>监控链</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {CHAIN_OPTIONS.map(ch => (
                  <button key={ch}
                    onClick={() => toggleChain(ch)}
                    style={{
                      padding: '4px 12px', borderRadius: 100, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1px solid',
                      background: cfg.chains.includes(ch) ? `${CHAIN_COLORS[ch] || T.accent}20` : 'transparent',
                      color: cfg.chains.includes(ch) ? (CHAIN_COLORS[ch] || T.accent) : T.dark400,
                      borderColor: cfg.chains.includes(ch) ? (CHAIN_COLORS[ch] || T.accent) : 'rgba(255,255,255,0.08)',
                      transition: 'all 0.2s',
                    }}
                  >{ch}</button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* === Stats Bar === */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        {[
          { label: '机会数量', value: String(opportunities.length), icon: Radar, color: T.accent },
          { label: '最佳利润', value: bestProfit > 0 ? '$' + bestProfit.toFixed(2) : '-', icon: TrendingUp, color: T.accentGreen },
          { label: '平均价差', value: avgSpread > 0 ? avgSpread.toFixed(2) + '%' : '-', icon: Activity, color: T.accentOrange },
          { label: '监控频率', value: '5 秒/次', icon: RefreshCw, color: T.dark400 },
        ].map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} style={{ ...cardBase, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Icon size={13} color={s.color} />
                <p style={{ fontSize: 11, color: T.dark400 }}>{s.label}</p>
              </div>
              <p style={{ fontSize: 18, fontWeight: 700, color: 'white' }}>{s.value}</p>
            </div>
          );
        })}
      </div>

      {/* === Opportunity List === */}
      <div style={{ ...cardBase, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>套利机会</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {loadingOpps && (
              <div style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid rgba(99,102,241,0.3)', borderTopColor: T.accent, animation: 'spin 0.8s linear infinite' }} />
            )}
          </div>
        </div>

        {opportunities.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 16px' }}>
            <Radar size={32} color={T.dark400} style={{ marginBottom: 8 }} />
            <p style={{ color: T.dark400, fontSize: 12 }}>{loadingOpps ? '正在扫描链上套利机会...' : '暂未发现套利机会'}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {opportunities.map((opp) => {
              const isExpiring = opp.ttl < 5;
              return (
                <div key={opp.id} className="arb-row-in" style={{
                  display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12,
                  padding: '12px 16px', borderRadius: 12,
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
                  transition: 'background 0.2s',
                }}>
                  {/* Token pair + chain */}
                  <div style={{ flex: '1 1 180px', minWidth: 140 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>{opp.tokenPair}</span>
                      <span style={{
                        padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                        background: `${(CHAIN_COLORS[opp.chain] || T.accent)}20`,
                        color: CHAIN_COLORS[opp.chain] || T.accent,
                      }}>{opp.chain}</span>
                    </div>
                  </div>

                  {/* Route */}
                  <div style={{ flex: '1 1 200px', minWidth: 140 }}>
                    <p style={{ fontSize: 11, color: T.dark400 }}>
                      {opp.buyDex} <span style={{ color: T.accentGreen }}>→</span> {opp.sellDex}
                    </p>
                  </div>

                  {/* Prices */}
                  <div style={{ flex: '1 1 160px', minWidth: 120 }}>
                    <p style={{ fontSize: 11, color: T.dark400 }}>
                      买 <span style={{ color: 'white' }}>${opp.buyPrice.toFixed(4)}</span> / 卖 <span style={{ color: 'white' }}>${opp.sellPrice.toFixed(4)}</span>
                    </p>
                  </div>

                  {/* Spread */}
                  <div style={{ minWidth: 70, textAlign: 'right' }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: opp.spreadPct > 0.5 ? T.accentGreen : T.accentOrange }}>
                      {fmtPct(opp.spreadPct)}
                    </p>
                  </div>

                  {/* Profit */}
                  <div style={{ minWidth: 90, textAlign: 'right' }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: opp.estimatedProfitUsdt > 0 ? T.accentGreen : T.dark400 }}>
                      {fmtUsd(opp.estimatedProfitUsdt)}
                    </p>
                    <p style={{ fontSize: 10, color: T.dark400 }}>
                      Gas: ${opp.gasEstimateUsdt.toFixed(2)}
                    </p>
                  </div>

                  {/* Countdown */}
                  <div style={{ minWidth: 60, textAlign: 'right' }}>
                    <p style={{
                      fontSize: 12, fontWeight: 600,
                      color: isExpiring ? T.accentRed : T.dark400,
                      ...(isExpiring ? { animation: 'blinkRed 0.6s ease-in-out infinite' } : {}),
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      <Clock size={10} style={{ marginRight: 2, verticalAlign: 'middle' }} />
                      {fmtCountdown(opp.ttl)}
                    </p>
                  </div>

                  {/* Execute button */}
                  <div>
                    <button
                      onClick={() => { setShowExecute(opp); setExecResult(null); }}
                      style={{
                        ...btnBase,
                        background: 'rgba(99,102,241,0.15)',
                        color: T.accent,
                        border: '1px solid rgba(99,102,241,0.3)',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.25)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.15)'; }}
                    >
                      <Zap size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                      执行套利
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* === Execute Modal === */}
      {showExecute && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000,
        }} onClick={() => { if (!executing) setShowExecute(null); }}>
          <div style={{
            ...cardBase, padding: 24, width: 420, maxWidth: '90vw',
          }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Zap size={18} color={T.accent} />
                <p style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>确认执行套利</p>
              </div>
              <X size={16} color={T.dark400} style={{ cursor: executing ? 'not-allowed' : 'pointer' }}
                onClick={() => { if (!executing) setShowExecute(null); }} />
            </div>

            {/* Info */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>{showExecute.tokenPair}</span>
                <span style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                  background: `${(CHAIN_COLORS[showExecute.chain] || T.accent)}20`,
                  color: CHAIN_COLORS[showExecute.chain] || T.accent,
                }}>{showExecute.chain}</span>
              </div>
              <p style={{ fontSize: 12, color: T.dark400 }}>
                {showExecute.buyDex} → {showExecute.sellDex}
              </p>
            </div>

            {/* Profit breakdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)' }}>
                <p style={{ fontSize: 12, color: T.dark400 }}>买入价</p>
                <p style={{ fontSize: 12, color: 'white', fontWeight: 600 }}>${showExecute.buyPrice.toFixed(4)}</p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)' }}>
                <p style={{ fontSize: 12, color: T.dark400 }}>卖出价</p>
                <p style={{ fontSize: 12, color: 'white', fontWeight: 600 }}>${showExecute.sellPrice.toFixed(4)}</p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)' }}>
                <p style={{ fontSize: 12, color: T.dark400 }}>价差</p>
                <p style={{ fontSize: 12, fontWeight: 700, color: showExecute.spreadPct > 0.5 ? T.accentGreen : T.accentOrange }}>
                  {fmtPct(showExecute.spreadPct)}
                </p>
              </div>
              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: 'rgba(16,185,129,0.05)' }}>
                <p style={{ fontSize: 12, color: T.dark400 }}>预估毛利</p>
                <p style={{ fontSize: 12, color: T.accentGreen, fontWeight: 600 }}>{fmtUsd(showExecute.estimatedProfitUsdt)}</p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.05)' }}>
                <p style={{ fontSize: 12, color: T.dark400 }}>Gas 费用</p>
                <p style={{ fontSize: 12, color: T.accentRed, fontWeight: 600 }}>-${showExecute.gasEstimateUsdt.toFixed(2)}</p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.05)' }}>
                <p style={{ fontSize: 12, color: T.dark400 }}>预估滑点</p>
                <p style={{ fontSize: 12, color: T.accentOrange, fontWeight: 600 }}>-${(showExecute.estimatedProfitUsdt * cfg.maxSlippagePct / 100).toFixed(2)}</p>
              </div>
              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: 'rgba(99,102,241,0.08)' }}>
                <p style={{ fontSize: 13, color: 'white', fontWeight: 600 }}>预估净利润</p>
                <p style={{ fontSize: 14, fontWeight: 700, color: (showExecute.estimatedProfitUsdt - showExecute.gasEstimateUsdt - (showExecute.estimatedProfitUsdt * cfg.maxSlippagePct / 100)) > 0 ? T.accentGreen : T.accentRed }}>
                  {fmtUsd(showExecute.estimatedProfitUsdt - showExecute.gasEstimateUsdt - (showExecute.estimatedProfitUsdt * cfg.maxSlippagePct / 100))}
                </p>
              </div>
            </div>

            {/* Result feedback */}
            {execResult && (
              <div style={{
                padding: '10px 14px', borderRadius: 10, marginBottom: 12,
                background: execResult.status === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                border: `1px solid ${execResult.status === 'success' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
              }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: execResult.status === 'success' ? T.accentGreen : T.accentRed, marginBottom: 4 }}>
                  {execResult.status === 'success' ? '✅ 套利执行成功' : '❌ 套利执行失败'}
                </p>
                {execResult.netProfit !== undefined && (
                  <p style={{ fontSize: 11, color: T.dark400 }}>净利润: {fmtUsd(execResult.netProfit)}</p>
                )}
                {execResult.failReason && (
                  <p style={{ fontSize: 11, color: T.accentRed }}>{execResult.failReason}</p>
                )}
                {execResult.txHashBuy && (
                  <p style={{ fontSize: 10, color: T.accent, marginTop: 4 }}>
                    Tx: {execResult.txHashBuy.slice(0, 10)}...{execResult.txHashBuy.slice(-6)}
                  </p>
                )}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowExecute(null)}
                style={{
                  ...btnBase, flex: 1,
                  background: 'rgba(255,255,255,0.05)', color: T.dark400, border: '1px solid rgba(255,255,255,0.08)',
                }}
                disabled={executing}
              >取消</button>
              <button
                onClick={handleExecute}
                disabled={executing || !!execResult}
                style={{
                  ...btnBase, flex: 1,
                  background: executing ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.15)',
                  color: T.accent, border: '1px solid rgba(99,102,241,0.3)',
                  cursor: (executing || !!execResult) ? 'not-allowed' : 'pointer',
                }}
              >
                {executing ? (
                  <span>
                    <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(99,102,241,0.3)', borderTopColor: T.accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginRight: 6, verticalAlign: 'middle' }} />
                    执行中...
                  </span>
                ) : execResult ? '关闭' : '确认执行'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =========================================================================
//  Tab 2: 套利记录
// =========================================================================

function ArbitrageTrades() {
  const [stats, setStats] = useState<ArbTradeStats | null>(null);
  const [trades, setTrades] = useState<ArbTrade[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const pageSize = 20;
  const userId = localStorage.getItem('aihunter_user_id') || 'default';

  const loadData = useCallback(async () => {
    setLoading(true);
    const [statsRes, tradesRes] = await Promise.all([
      arbitrageApi.getTradeStats(userId),
      arbitrageApi.getTrades({ userId, page, limit: pageSize, status: statusFilter || undefined }),
    ]);
    if (statsRes.code === 200 && statsRes.data) setStats(statsRes.data);
    if (tradesRes.code === 200 && tradesRes.data) {
      setTrades(tradesRes.data.trades);
      setTotal(tradesRes.data.total);
    }
    setLoading(false);
  }, [userId, page, statusFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // CSV export
  const exportCsv = useCallback(() => {
    const header = 'ID,链,交易对,买入DEX,卖出DEX,数量,金额(USDT),毛利润,Gas,滑点,净利润,状态,失败原因,交易哈希(买),交易哈希(卖),创建时间,完成时间\n';
    const rows = trades.map(t =>
      [t.id, t.chain, t.tokenPair, t.buyDex, t.sellDex, t.amountIn, t.amountInUsdt,
        t.grossProfitUsdt, t.gasCostUsdt, t.slippageLossUsdt, t.netProfitUsdt,
        t.status, t.failReason || '', t.txHashBuy || '', t.txHashSell || '',
        t.createdAt, t.completedAt || ''
      ].join(',')
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `arbitrage_trades_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }, [trades]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        {[
          { label: '累计交易', value: stats ? String(stats.totalTrades) : '-', icon: ListOrdered, color: T.accent },
          { label: '成功率', value: stats ? (stats.successRate * 100).toFixed(1) + '%' : '-', icon: Activity, color: T.accentGreen },
          { label: '累计利润', value: stats ? fmtUsd(stats.cumulativeProfit) : '-', icon: TrendingUp, color: stats && stats.cumulativeProfit > 0 ? T.accentGreen : T.accentRed },
          { label: '平均利润', value: stats ? fmtUsd(stats.avgProfit) : '-', icon: Zap, color: T.accentOrange },
        ].map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} style={{ ...cardBase, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Icon size={13} color={s.color} />
                <p style={{ fontSize: 11, color: T.dark400 }}>{s.label}</p>
              </div>
              <p style={{ fontSize: 18, fontWeight: 700, color: 'white' }}>{s.value}</p>
            </div>
          );
        })}
      </div>

      {/* Filter bar */}
      <div style={{ ...cardBase, padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <p style={{ fontSize: 11, color: T.dark400, fontWeight: 500 }}>筛选:</p>
          {[{ label: '全部', value: '' }, { label: '成功', value: 'success' }, { label: '失败', value: 'failed' }, { label: '进行中', value: 'pending' }].map(f => (
            <button key={f.value}
              onClick={() => { setStatusFilter(f.value); setPage(1); }}
              style={{
                padding: '4px 12px', borderRadius: 100, fontSize: 11, fontWeight: 500, cursor: 'pointer', border: '1px solid',
                background: statusFilter === f.value ? 'rgba(99,102,241,0.15)' : 'transparent',
                color: statusFilter === f.value ? T.accent : T.dark400,
                borderColor: statusFilter === f.value ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.08)',
              }}
            >{f.label} {f.value === '' && total > 0 ? `(${total})` : ''}</button>
          ))}
          <div style={{ flex: 1 }} />
          <button onClick={exportCsv} style={{
            ...btnBase,
            background: 'rgba(16,185,129,0.1)', color: T.accentGreen, border: '1px solid rgba(16,185,129,0.2)',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <Download size={12} /> CSV 导出
          </button>
        </div>
      </div>

      {/* Trade list */}
      <div style={{ ...cardBase, padding: 16 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid rgba(99,102,241,0.3)', borderTopColor: T.accent, animation: 'spin 0.8s linear infinite', margin: '0 auto 8px' }} />
            <p style={{ color: T.dark400, fontSize: 12 }}>加载中...</p>
          </div>
        ) : trades.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <ListOrdered size={32} color={T.dark400} style={{ marginBottom: 8 }} />
            <p style={{ color: T.dark400, fontSize: 12 }}>暂无套利记录</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {trades.map(t => (
              <div key={t.id} className="arb-row-in" style={{
                display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10,
                padding: '10px 14px', borderRadius: 10,
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
              }}>
                {/* Pair + Chain */}
                <div style={{ flex: '1 1 150px', minWidth: 120 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>{t.tokenPair}</span>
                    <span style={{
                      padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 600,
                      background: `${(CHAIN_COLORS[t.chain] || T.accent)}20`,
                      color: CHAIN_COLORS[t.chain] || T.accent,
                    }}>{t.chain}</span>
                  </div>
                  <p style={{ fontSize: 10, color: T.dark400, marginTop: 2 }}>
                    {t.buyDex} → {t.sellDex}
                  </p>
                </div>

                {/* Amount */}
                <div style={{ minWidth: 80 }}>
                  <p style={{ fontSize: 11, color: T.dark400 }}>数量</p>
                  <p style={{ fontSize: 12, color: 'white', fontWeight: 500 }}>{t.amountIn.toFixed(4)}</p>
                </div>

                {/* Profit */}
                <div style={{ minWidth: 80, textAlign: 'right' }}>
                  <p style={{ fontSize: 11, color: T.dark400 }}>净利润</p>
                  <p style={{ fontSize: 13, fontWeight: 700, color: t.netProfitUsdt > 0 ? T.accentGreen : (t.netProfitUsdt < 0 ? T.accentRed : T.dark400) }}>
                    {fmtUsd(t.netProfitUsdt)}
                  </p>
                </div>

                {/* Status */}
                <div style={{ minWidth: 60, textAlign: 'right' }}>
                  <span style={{
                    padding: '2px 8px', borderRadius: 100, fontSize: 10, fontWeight: 600,
                    background: t.status === 'success' ? 'rgba(16,185,129,0.12)' :
                      t.status === 'failed' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                    color: t.status === 'success' ? T.accentGreen :
                      t.status === 'failed' ? T.accentRed : T.accentOrange,
                  }}>
                    {t.status === 'success' ? '成功' : t.status === 'failed' ? '失败' : '进行中'}
                  </span>
                </div>

                {/* Tx link */}
                <div style={{ minWidth: 70, textAlign: 'right' }}>
                  {t.txHashBuy && (
                    <a href={`https://etherscan.io/tx/${t.txHashBuy}`} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 10, color: T.accent, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                      Tx <ExternalLink size={9} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 16 }}>
            <button style={{ ...btnBase, padding: '6px 12px', background: 'rgba(255,255,255,0.04)', color: T.dark400, border: '1px solid rgba(255,255,255,0.06)' }}
              disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}
            >上一页</button>
            <p style={{ fontSize: 11, color: T.dark400 }}>
              {page} / {totalPages} 页 · 共 {total} 条
            </p>
            <button style={{ ...btnBase, padding: '6px 12px', background: 'rgba(255,255,255,0.04)', color: T.dark400, border: '1px solid rgba(255,255,255,0.06)' }}
              disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
            >下一页</button>
          </div>
        )}
      </div>
    </div>
  );
}

// =========================================================================
//  Tab 3: 借贷利率 (preserved from original DeFiPage)
// =========================================================================

function LendingRates() {
  const [rates, setRates] = useState<RateSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadRates() {
    setLoading(true);
    const res = await lendingApi.getRates();
    if (res.code === 200 && res.data) {
      const map = new Map<string, RateSnapshot>();
      for (const r of res.data) {
        const key = r.chain + ':' + r.token;
        map.set(key, r);
      }
      setRates(Array.from(map.values()));
    }
    setLoading(false);
  }

  useEffect(() => {
    loadRates();
    const iv = setInterval(loadRates, 60000);
    return () => clearInterval(iv);
  }, []);

  const protocols = new Set(rates.map(r => r.protocol)).size;
  const assets = rates.length;
  const maxSpread = rates.reduce((max, r) => {
    const s = (r.borrow_apy ? r.borrow_apy : 0) - (r.supply_apy ? r.supply_apy : 0);
    return s > max ? s : max;
  }, 0);
  const arbCount = rates.filter(r => {
    const spread = (r.borrow_apy ? r.borrow_apy : 0) - (r.supply_apy ? r.supply_apy : 0);
    return spread > 0.3;
  }).length;

  function toPercent(val: string | number | null | undefined): string {
    if (val == null) return '-';
    const n = typeof val === 'string' ? Number(val) : val;
    return n.toFixed(2) + '%';
  }

  function calcSpread(supply: string | number | null | undefined, borrow: string | number | null | undefined): string {
    const s = supply ? Number(supply) : 0;
    const b = borrow ? Number(borrow) : 0;
    return (b - s).toFixed(2) + '%';
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        {[
          { label: '监控协议', value: String(protocols), icon: PiggyBank, color: T.accent },
          { label: '监控资产', value: String(assets), icon: TrendingUp, color: '#3b82f6' },
          { label: '套利机会', value: String(arbCount), icon: Zap, color: T.accentGreen },
          { label: '最大利差', value: maxSpread > 0 ? maxSpread.toFixed(2) + '%' : '-', icon: TrendingDown, color: T.accentOrange },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} style={{ ...cardBase, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Icon size={14} color={s.color} />
                <p style={{ fontSize: 11, color: T.dark400 }}>{s.label}</p>
              </div>
              <p style={{ fontSize: 20, fontWeight: 700, color: 'white' }}>{s.value}</p>
            </div>
          );
        })}
      </div>

      <div className="gradient-border" style={{ padding: 16, ...cardBase }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>Aave V3 利率监控</p>
          <RefreshCw size={14} style={{ color: loading ? T.accent : T.dark400, cursor: 'pointer' }} onClick={loadRates} />
        </div>
        {rates.length === 0 ? (
          <p style={{ color: T.dark400, fontSize: 12, textAlign: 'center', padding: 24 }}>
            {loading ? '加载中...' : '暂无利率数据'}
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: T.dark400, fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>链</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: T.dark400, fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>协议</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: T.dark400, fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>资产</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', color: T.dark400, fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>存款 APY</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', color: T.dark400, fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>借款 APY</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', color: T.dark400, fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>利差</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((r, i) => {
                  const spread = calcSpread(r.supply_apy, r.borrow_apy);
                  const deposit = toPercent(r.supply_apy);
                  const borrow = toPercent(r.borrow_apy);
                  return (
                    <tr key={i} style={{ transition: 'background 0.2s' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 500,
                          background: r.chain === 'ETH' ? 'rgba(98,126,234,0.15)' : r.chain === 'BSC' ? 'rgba(240,185,11,0.15)' : 'rgba(0,82,255,0.15)',
                          color: r.chain === 'ETH' ? '#627eea' : r.chain === 'BSC' ? '#f0b90b' : '#0052ff',
                        }}>{r.chain}</span>
                      </td>
                      <td style={{ padding: '10px 12px', color: T.dark200, borderBottom: '1px solid rgba(255,255,255,0.03)' }}>{r.protocol}</td>
                      <td style={{ padding: '10px 12px', color: 'white', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.03)' }}>{r.token}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: T.accentGreen, borderBottom: '1px solid rgba(255,255,255,0.03)' }}>{deposit}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: parseFloat(borrow) > 0 ? T.accentRed : T.dark400, borderBottom: '1px solid rgba(255,255,255,0.03)' }}>{borrow}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: parseFloat(spread) > 0.3 ? T.accentOrange : T.dark400, fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.03)' }}>{spread}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', padding: 8 }}>
        <p style={{ fontSize: 11, color: T.dark400 }}>
          利率数据来自 Aave V3 链上 · 利差 &gt; 30bps 触发信号 · 闪电贷需 SessionKey
        </p>
      </div>
    </div>
  );
}

// =========================================================================
//  Main DeFiPage — Multi-tab
// =========================================================================

const defiFallbackStrategies: StrategyInfo[] = [
  {
    strategy_id: 'spread_arbitrage', category: 'defi', display_name: '价差套利',
    description: '跨 DEX 价差扫描 + 自动执行，支持多链',
    icon: 'activity', enabled: true, auto_trading: true,
    metrics: { today_signals: 12, today_trades: 3, today_pnl: 89.40 },
    route: '/defi/spread-arb',
  },
  {
    strategy_id: 'triangle_arb', category: 'defi', display_name: '三角套利',
    description: '三角循环套利，同一 DEX 内三币价差异常检测',
    icon: 'triangle', enabled: false, auto_trading: false,
    metrics: { today_signals: 0, today_trades: 0, today_pnl: 0 },
    route: '/defi/triangle-arb',
  },
  {
    strategy_id: 'flash_loan', category: 'defi', display_name: '闪电贷',
    description: '闪电贷无本金套利，Aave/Uniswap 协议',
    icon: 'zap', enabled: false, auto_trading: false,
    metrics: { today_signals: 0, today_trades: 0, today_pnl: 0 },
    route: '/defi/flash-loan',
  },
];

export default function DeFiPage() {
  const [activeTab, setActiveTab] = useState<'radar' | 'trades' | 'lending'>('lending');
  const [strategies, setStrategies] = useState<StrategyInfo[]>(defiFallbackStrategies);
  const [strategiesLoading, setStrategiesLoading] = useState(true);

  useEffect(() => { injectAnim(); }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await strategyApiV3.list('defi');
        if (res && (res as any).code === 200 && (res as any).data) {
          const apiData = (res as any).data || [];
          setStrategies(apiData.map((s: any) => ({
            ...s,
            route: s.route || (
              s.strategy_id === 'lending_arbitrage' ? '/defi/spread-arb' :
              '/defi/spread-arb'
            ),
          })));
        }
      } catch (e) { console.error('Failed to load DeFi strategies, using fallback:', e); }
      setStrategiesLoading(false);
    })();
  }, []);

  const navigate = useNavigate();
  const handleViewDetail = (route: string) => {
    navigate(route);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Page header */}
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'white' }}>DeFi 套利</h1>
        <p style={{ fontSize: 14, color: T.dark400, marginTop: 4 }}>策略矩阵 · 借贷利率监控</p>
      </div>

      {/* Strategy cards */}
      {strategiesLoading ? (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid rgba(99,102,241,0.3)', borderTopColor: T.accent, animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {strategies.map((s) => (
            <StrategyCard
              key={s.strategy_id}
              strategy={s}
              onViewDetail={handleViewDetail}
              disabled={!s.enabled}
            />
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 4, width: 'fit-content' }}>
        {[
          { key: 'lending', label: '借贷利率', icon: PiggyBank },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              style={tabBtn(isActive)}
            >
              <Icon size={13} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'lending' && <LendingRates />}
    </div>
  );
}
