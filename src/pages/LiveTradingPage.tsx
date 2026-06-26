import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount } from 'wagmi';
import { Wallet, TrendingUp, Activity, Shield, RefreshCw, Copy, ArrowUp, ArrowDown, ExternalLink } from 'lucide-react';
import { liveApiV3 } from '../utils/api';

const T = {
  accent: '#6366f1', accentGreen: '#10b981', accentRed: '#ef4444',
  accentBlue: '#3b82f6', accentPurple: '#8b5cf6', accentOrange: '#f59e0b', accentCyan: '#06b6d4',
  dark50: '#f0f0f0', dark100: '#e0e0e0', dark200: '#c0c0c0', dark300: '#a0a0a0',
  dark400: '#808080', dark500: '#606060', dark600: '#404040', dark700: '#2a2a2a',
  dark800: '#1a1a1a', dark900: '#111111', dark950: '#0a0a0a',
};

const cardBase: React.CSSProperties = {
  background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
  backdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 16,
  boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
  padding: 20,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: T.dark400, textTransform: 'uppercase',
  letterSpacing: '0.05em', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8,
};

function fmtAddr(addr?: string) {
  if (!addr || addr.length < 10) return addr || '-';
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function fmtPnl(v: number | string | undefined) {
  const n = Number(v ?? 0);
  return (n >= 0 ? '+' : '') + '$' + Math.abs(n).toFixed(2);
}

function fmtTime(ts: string) {
  try { return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }); }
  catch { return ts || ''; }
}

function WalletPanel() {
  const { address, isConnected } = useAccount();

  return (
    <div style={cardBase}>
      <h3 style={sectionTitle}><Wallet size={14} color={T.accent} /> 钱包</h3>
      {isConnected && address ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>已连接</div>
              <div style={{ fontSize: 10, color: T.dark400, textTransform: 'uppercase', marginTop: 2 }}>外部钱包</div>
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: T.dark300 }}>{fmtAddr(address)}</span>
            <button onClick={() => navigator.clipboard.writeText(address)} style={{ background: 'none', border: 'none', color: T.dark400, cursor: 'pointer', padding: 0 }}>
              <Copy size={13} />
            </button>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ width: 40, height: 40, borderRadius: 20, background: 'rgba(99,102,241,0.1)', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Wallet size={20} color={T.accent} />
          </div>
          <p style={{ fontSize: 12, color: T.dark300, marginBottom: 12 }}>请连接外部钱包</p>
          <wcm-button />
        </div>
      )}
    </div>
  );
}

function StrategyTradingPanel() {
  const [strategies, setStrategies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await liveApiV3.getStatus();
      if (res && (res as any).code === 200 && (res as any).data) {
        setStrategies(((res as any).data).strategies || []);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (id: string, active: boolean) => {
    setToggling(id);
    try {
      await liveApiV3.toggleStrategy(id, active);
      setStrategies(prev => prev.map((s: any) => (s.strategy_id || s.id) === id ? { ...s, active } : s));
    } catch (e) { console.error(e); }
    setToggling(null);
  };

  return (
    <div style={cardBase}>
      <h3 style={sectionTitle}><Activity size={14} color={T.accentGreen} /> 策略运行状态</h3>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px 0' }}><RefreshCw size={14} className="animate-spin" color={T.dark400} /><p style={{ fontSize: 12, color: T.dark400, marginTop: 8 }}>加载中...</p></div>
      ) : strategies.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px 0' }}><Activity size={24} color={T.dark500} style={{ opacity: 0.3, marginBottom: 8 }} /><p style={{ fontSize: 12, color: T.dark400 }}>暂无策略运行状态</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {strategies.map((s: any) => {
            const isActive = s.active || s.enabled;
            return (
              <div key={s.strategy_id || s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: isActive ? '1px solid rgba(16,185,129,0.15)' : '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: isActive ? 'rgba(16,185,129,0.1)' : 'rgba(128,128,128,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <TrendingUp size={16} color={isActive ? T.accentGreen : T.dark400} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>{s.display_name || s.name || s.strategy_id}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 2 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, padding: '1px 6px', borderRadius: 100, background: isActive ? 'rgba(16,185,129,0.1)' : 'rgba(128,128,128,0.1)', color: isActive ? T.accentGreen : T.dark400 }}>
                        <span style={{ width: 4, height: 4, borderRadius: '50%', background: isActive ? T.accentGreen : T.dark400 }} />
                        {isActive ? '运行中' : '已暂停'}
                      </span>
                      <span style={{ fontSize: 10, color: T.dark400 }}>{s.today_trades || 0} 笔</span>
                      <span style={{ fontSize: 10, color: (s.today_pnl || 0) >= 0 ? T.accentGreen : T.accentRed }}>{fmtPnl(s.today_pnl)}</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => handleToggle(s.strategy_id || s.id, !isActive)}
                    disabled={toggling === (s.strategy_id || s.id)}
                    style={{ padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: isActive ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', border: isActive ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(16,185,129,0.2)', color: isActive ? T.accentRed : T.accentGreen, cursor: toggling === (s.strategy_id || s.id) ? 'not-allowed' : 'pointer' }}
                  >{toggling === (s.strategy_id || s.id) ? '...' : (isActive ? '暂停' : '开启')}</button>
                  <button style={{ padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)', color: T.accent, cursor: 'pointer' }}>配置</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RiskPanel() {
  const [risk, setRisk] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await liveApiV3.getStatus();
        if (res && (res as any).code === 200 && (res as any).data) {
          setRisk(((res as any).data).risk || null);
        }
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  const todayLoss = risk?.today_loss ?? 0;
  const dailyMaxLoss = risk?.daily_max_loss ?? 1000;
  const lossPct = dailyMaxLoss > 0 ? Math.min(todayLoss / dailyMaxLoss, 1) : 0;
  const currentConcurrency = risk?.current_concurrency ?? 0;
  const maxConcurrency = risk?.max_concurrency ?? 5;
  const gasStrategy = risk?.gas_strategy || 'medium';

  return (
    <div style={cardBase}>
      <h3 style={sectionTitle}><Shield size={14} color={T.accentOrange} /> 全局风控</h3>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px 0' }}><RefreshCw size={14} className="animate-spin" color={T.dark400} /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: T.dark400 }}>日亏损上限</span>
              <span style={{ fontSize: 11, color: lossPct > 0.8 ? T.accentRed : T.dark300 }}>${todayLoss.toFixed(2)} / ${dailyMaxLoss.toFixed(2)}</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 3, background: lossPct > 0.8 ? T.accentRed : (lossPct > 0.5 ? T.accentOrange : T.accentGreen), width: (lossPct * 100) + '%', transition: 'width 0.3s' }} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: T.dark400 }}>当前并发 / 最大并发</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>{currentConcurrency} / {maxConcurrency}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: T.dark400 }}>Gas 策略</span>
            <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: gasStrategy === 'fast' ? 'rgba(239,68,68,0.1)' : gasStrategy === 'slow' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', color: gasStrategy === 'fast' ? T.accentRed : gasStrategy === 'slow' ? T.accentGreen : T.accentOrange }}>
              {gasStrategy === 'fast' ? '快' : gasStrategy === 'slow' ? '慢' : '中'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function TradeRecordStream() {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const load = useCallback(async () => {
    try {
      const res = await liveApiV3.getRecords({ size: 20 });
      if (res && (res as any).code === 200 && (res as any).data) {
        const data = (res as any).data;
        setRecords((data.records || data) as any[]);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [load]);

  return (
    <div style={cardBase}>
      <h3 style={{ ...sectionTitle, marginBottom: 12 }}>
        <Activity size={14} color={T.accentCyan} /> 交易记录
        <span style={{ marginLeft: 'auto', fontWeight: 400, fontSize: 11, textTransform: 'none', color: T.dark500 }}>自动刷新 · 5秒</span>
      </h3>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px 0' }}><RefreshCw size={14} className="animate-spin" color={T.dark400} /></div>
      ) : records.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0' }}><Activity size={24} color={T.dark500} style={{ opacity: 0.3, marginBottom: 8 }} /><p style={{ fontSize: 12, color: T.dark400 }}>暂无交易记录</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {records.map((r: any, i: number) => {
            const isBuy = (r.direction || r.side) === 'BUY';
            const isCompleted = r.status === 'success' || r.status === 'completed' || r.status === 'filled';
            const isFailed = r.status === 'failed' || r.status === 'rejected';
            return (
              <div key={r.id || i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', fontSize: 12 }}>
                <span style={{ fontFamily: 'monospace', color: T.dark400, fontSize: 11, flexShrink: 0 }}>{fmtTime(r.created_at || r.createdAt || r.time || '')}</span>
                <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, flexShrink: 0, background: 'rgba(99,102,241,0.12)', color: T.accent }}>{r.strategy || r.strategy_id || '-'}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontWeight: 700, fontSize: 11, flexShrink: 0, color: isBuy ? T.accentGreen : T.accentRed }}>
                  {isBuy ? <ArrowUp size={10} /> : <ArrowDown size={10} />}{r.direction || r.side || ''}
                </span>
                <span style={{ fontFamily: 'monospace', color: 'white', flexShrink: 0 }}>{r.symbol || r.token || '-'}</span>
                <span style={{ fontFamily: 'monospace', color: T.dark300, fontSize: 11, flexShrink: 0 }}>${Number(r.amount_in || r.amount || r.amountInUsdt || 0).toFixed(2)}</span>
                <span style={{ flex: 1 }} />
                {isCompleted && <span style={{ color: T.accentGreen, fontWeight: 600, fontSize: 11 }}>{fmtPnl(r.pnl_usd || r.pnl || r.netProfitUsdt)}</span>}
                {isFailed && <span style={{ color: T.accentRed, fontWeight: 600, fontSize: 11 }}>失败</span>}
                {!isCompleted && !isFailed && <span style={{ color: T.accentOrange, fontSize: 11 }}>等待确认</span>}
                {r.tx_hash && <a href={'https://etherscan.io/tx/' + r.tx_hash} target="_blank" rel="noopener noreferrer" style={{ color: T.accent, fontSize: 10, flexShrink: 0, textDecoration: 'none' }}><ExternalLink size={10} /></a>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function LiveTradingPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'white' }}>实盘交易控制台</h1>
        <p style={{ fontSize: 14, color: T.dark400, marginTop: 4 }}>统一交易启停 · 策略运行监控 · 风控参数</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <StrategyTradingPanel />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <WalletPanel />
          <RiskPanel />
        </div>
      </div>
      <TradeRecordStream />
      <style>{'@keyframes fadeSlideIn { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }'}</style>
    </div>
  );
}
