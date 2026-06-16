import { useState, useEffect } from 'react';
import { Radio, Shield, AlertTriangle, Activity, TrendingUp, Zap, PiggyBank, Crosshair, ChevronDown, ChevronUp } from 'lucide-react';

const cardBase: React.CSSProperties = {
  background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
  backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
};

const WS_URL = window.location.origin.replace(/^http/, 'ws') + '/ws';

const SIG_TYPES: Record<string, { label: string; icon: any; color: string }> = {
  '开盘狙击': { label: '土狗狙击', icon: Crosshair, color: '#6366f1' },
  MATURE_MEME: { label: '动量突破', icon: TrendingUp, color: '#10b981' },
  ARBITRAGE: { label: 'DEX套利', icon: Zap, color: '#f59e0b' },
  LENDING_ARB: { label: '存币套利', icon: PiggyBank, color: '#06b6d4' },
  LENDING_ARB_EXECUTED: { label: '套利执行', icon: PiggyBank, color: '#8b5cf6' },
};

function getSigType(data: any): string {
  return data.type || '开盘狙击';
}

function getSigLabel(data: any): string {
  const t = getSigType(data);
  return SIG_TYPES[t]?.label || t;
}

function getSigIcon(data: any): any {
  const t = getSigType(data);
  return SIG_TYPES[t]?.icon || Crosshair;
}

function getSigColor(data: any): string {
  const t = getSigType(data);
  return SIG_TYPES[t]?.color || '#6366f1';
}

function getConfLevel(score: number): { label: string; color: string } {
  if (score >= 70) return { label: '高', color: 'var(--accent-green)' };
  if (score >= 40) return { label: '中', color: 'var(--accent-orange)' };
  return { label: '低', color: 'var(--accent-red)' };
}

function getFlagLabel(flag: string) {
  const map: Record<string, { text: string; className: string }> = {
    owner_renounced: { text: '已放弃', className: 'flag-safe' },
    lp_locked: { text: 'LP已锁', className: 'flag-safe' },
    mintable: { text: '可增发', className: 'flag-warn' },
    honeypot: { text: '蜜罐', className: 'flag-danger' },
    high_tax: { text: '高税', className: 'flag-warn' },
    tax_high: { text: '高税', className: 'flag-warn' },
    no_mint: { text: '无增发', className: 'flag-safe' },
  };
  return map[flag] || { text: flag, className: 'flag-warn' };
}

const CHAIN_COLORS: Record<string, string> = {
  ETH: '#627eea',
  BSC: '#f0b90b',
  BASE: '#0052ff',
  SOL: '#9945ff',
};

export default function SignalsPage() {
  const [signals, setSignals] = useState<any[]>([]);
  const [connected, setConnected] = useState(false);
  const [wsStatus, setWsStatus] = useState('连接中...');
  const [filterType, setFilterType] = useState<string>('全部');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      ws = new WebSocket(WS_URL);
      ws.onopen = () => { setConnected(true); setWsStatus('● 已连接'); };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'signal' && msg.data) {
            setSignals((prev) => {
              const sig = { ...msg.data, _id: msg.data.tx_hash || msg.data.contract + '_' + Date.now() };
              return [sig, ...prev].slice(0, 200);
            });
          }
        } catch { /* ignore */ }
      };
      ws.onclose = () => {
        setConnected(false);
        setWsStatus('● 已断开，重连中...');
        reconnectTimer = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
    }
    connect();
    return () => { clearTimeout(reconnectTimer); ws?.close(); };
  }, []);

  // 统计
  const typeCount: Record<string, number> = {};
  for (const s of signals) {
    const t = getSigType(s);
    typeCount[t] = (typeCount[t] || 0) + 1;
  }
  const typeList = Object.keys(typeCount).sort();
  const filteredSignals = filterType === '全部' ? signals : signals.filter(s => getSigType(s) === filterType);

  const highConf = signals.filter(s => s.confidence >= 70).length;
  const lowConf = signals.filter(s => s.confidence < 40).length;
  const chainCount = new Set(signals.map(s => s.chain)).size;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'white' }}>信号雷达</h1>
          <p style={{ fontSize: 14, color: 'var(--dark-400)', marginTop: 4 }}>
            实时链上信号 · 多策略 · AI 风险评分
          </p>
        </div>
        <span style={{
          fontSize: 12, fontWeight: 500,
          color: connected ? 'var(--accent-green)' : 'var(--accent-orange)',
          padding: '4px 12px', borderRadius: 999,
          background: connected ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
          border: `1px solid ${connected ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}`,
        }}>{wsStatus}</span>
      </div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {[
          { label: '总信号', value: signals.length, icon: Radio, color: 'var(--accent)' },
          { label: '高置信度', value: highConf, icon: Shield, color: 'var(--accent-green)' },
          { label: '低风险', value: lowConf, icon: AlertTriangle, color: 'var(--accent-red)' },
          { label: '链数量', value: chainCount, icon: Activity, color: 'var(--accent-blue)' },
          ...typeList.map(t => ({
            label: SIG_TYPES[t]?.label || t,
            value: typeCount[t],
            icon: SIG_TYPES[t]?.icon || Crosshair,
            color: SIG_TYPES[t]?.color || '#6366f1',
          })),
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} style={{ ...cardBase, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Icon size={14} color={s.color} />
                <p style={{ fontSize: 11, color: 'var(--dark-400)', fontWeight: 500 }}>{s.label}</p>
              </div>
              <p style={{ fontSize: 22, fontWeight: 700, color: 'white' }}>{s.value}</p>
            </div>
          );
        })}
      </div>

      {/* Type Filter */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['全部', ...typeList].map(t => {
          const isActive = filterType === t;
          const info = SIG_TYPES[t];
          return (
            <button key={t} onClick={() => setFilterType(t)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 10,
              fontSize: 12, fontWeight: 500,
              background: isActive ? `${info?.color || '#6366f1'}20` : 'rgba(255,255,255,0.03)',
              border: isActive ? `1px solid ${info?.color || '#6366f1'}40` : '1px solid transparent',
              color: isActive ? (info?.color || 'var(--accent)') : 'var(--dark-300)',
              cursor: 'pointer', transition: 'all 0.2s',
            }}>
              {info && <info.icon size={14} />}
              {info?.label || t} ({typeCount[t] || signals.length})
            </button>
          );
        })}
      </div>

      {/* Signal List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filteredSignals.length === 0 ? (
          <div style={{ ...cardBase, padding: 40, textAlign: 'center' }}>
            <Radio size={32} style={{ color: 'var(--dark-500)', marginBottom: 12 }} />
            <p style={{ color: 'var(--dark-400)' }}>
              {filterType === '全部' ? '正在监听链上信号...' : '暂无此类信号'}
            </p>
            <p style={{ fontSize: 12, color: 'var(--dark-500)', marginTop: 8 }}>
              ETH · BSC · BASE · SOL
            </p>
          </div>
        ) : (
          filteredSignals.map((signal, idx) => {
            const sigType = getSigType(signal);
            const typeInfo = SIG_TYPES[sigType];
            const conf = getConfLevel(signal.confidence);
            const sid = signal._id || `sig-${idx}`;
            const expanded = expandedId === sid;
            const isBuy = signal.paper_trade === 'yes';
            const priceStr = signal.price_data?.price_usd
              ? '$' + parseFloat(signal.price_data.price_usd).toFixed(signal.price_data.price_usd < 0.001 ? 10 : 6)
              : signal.price_data?.price
              ? '$' + parseFloat(signal.price_data.price).toFixed(6)
              : null;
            const liqStr = signal.price_data?.liquidity_usd
              ? '$' + (signal.price_data.liquidity_usd >= 1000000
                  ? (signal.price_data.liquidity_usd / 1000000).toFixed(1) + 'M'
                  : (signal.price_data.liquidity_usd / 1000).toFixed(1) + 'K')
              : null;
            const spreadBps = signal.spread_bps || signal.data?.spread_bps;

            return (
              <div key={sid} style={{
                animation: 'fadeIn 0.3s ease-out',
                ...cardBase, padding: '14px 16px',
                borderLeft: `3px solid ${typeInfo?.color || '#6366f1'}`,
                cursor: 'pointer', transition: 'all 0.3s',
              }}
                onClick={() => setExpandedId(expanded ? null : sid)}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = typeInfo?.color || '#6366f1'; e.currentTarget.style.boxShadow = `0 0 15px ${typeInfo?.color}20`; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.3)'; }}
              >
                {/* Top Row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {/* Type Icon */}
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: `${typeInfo?.color || '#6366f1'}20`,
                    color: typeInfo?.color || 'var(--accent)',
                  }}>
                    {typeInfo ? <typeInfo.icon size={16} /> : <Crosshair size={16} />}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>
                        {signal.symbol || signal.data?.symbol || 'Unknown'}
                      </h3>
                      <span style={{
                        fontSize: 9, padding: '2px 6px', borderRadius: 4, fontWeight: 500,
                        background: `${typeInfo?.color || '#6366f1'}15`,
                        color: typeInfo?.color || 'var(--accent)',
                      }}>{typeInfo?.label || sigType}</span>
                      {signal.chain && (
                        <span style={{
                          fontSize: 9, padding: '2px 6px', borderRadius: 4,
                          background: `${CHAIN_COLORS[signal.chain] || '#606060'}20`,
                          color: CHAIN_COLORS[signal.chain] || 'var(--dark-400)',
                        }}>{signal.chain}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--dark-400)', flexWrap: 'wrap' }}>
                      {signal.contract && (
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>
                          {signal.contract.slice(0, 18)}...
                        </span>
                      )}
                      {priceStr && <span>价格 {priceStr}</span>}
                      {liqStr && <span>流动性 {liqStr}</span>}
                      {spreadBps && <span>利差 {spreadBps}bps</span>}
                    </div>
                  </div>

                  {/* Score & Expand */}
                  <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: conf.color }}>
                        {signal.confidence || signal.risk_score ? (100 - (signal.risk_score || 0) * 100).toFixed(0) : '-'}%
                      </div>
                      <p style={{ fontSize: 10, color: 'var(--dark-400)' }}>可信度</p>
                    </div>
                    {isBuy && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(16,185,129,0.15)', color: 'var(--accent-green)' }}>自动买入</span>}
                    {expanded ? <ChevronUp size={16} style={{ color: 'var(--dark-400)' }} /> : <ChevronDown size={16} style={{ color: 'var(--dark-400)' }} />}
                  </div>
                </div>

                {/* Expanded Details */}
                {expanded && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: 12 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {signal.token && <div><span style={{ color: 'var(--dark-400)' }}>代币: </span><span style={{ color: 'var(--dark-200)', fontFamily: "'JetBrains Mono', monospace" }}>{signal.token}</span></div>}
                      {signal.tx_hash && <div><span style={{ color: 'var(--dark-400)' }}>交易: </span><span style={{ color: 'var(--dark-200)', fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>{signal.tx_hash.slice(0, 20)}...</span></div>}
                      {signal.paper_reason && <div><span style={{ color: 'var(--dark-400)' }}>判断: </span><span style={{ color: isBuy ? 'var(--accent-green)' : 'var(--accent-red)' }}>{signal.paper_reason}</span></div>}
                      {signal.paper_trade === 'no' && <div><span style={{ color: 'var(--dark-400)' }}>跳过原因: </span><span style={{ color: 'var(--accent-red)' }}>{signal.paper_reason || '规则过滤'}</span></div>}
                    </div>
                    {signal.flags && signal.flags.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                        {signal.flags.map((flag: string) => {
                          const f = getFlagLabel(flag);
                          return <span key={flag} style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10 }} className={f.className}>{f.text}</span>;
                        })}
                      </div>
                    )}
                    {signal.features && (
                      <div style={{ marginTop: 8, color: 'var(--dark-400)' }}>
                        <span>买入税: {signal.features.buy_tax_pct}% · 卖出税: {signal.features.sell_tax_pct}% · LP: ${signal.features.initial_lp_usd || 0}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
