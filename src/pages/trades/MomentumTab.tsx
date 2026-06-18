import { useState, useEffect } from 'react';
import { TrendingUp, Activity, BarChart3, Zap, Wallet } from 'lucide-react';
import { signalsApi, paperApi } from '../../utils/api';

const cardBase: React.CSSProperties = {
  background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
  backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
};

const chainColors: Record<string, string> = {
  ETH: '#627eea', BSC: '#f0b90b', BASE: '#0052ff', SOL: '#9945ff',
};

export default function MomentumTab() {
  const [signals, setSignals] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [view, setView] = useState('signals');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    signalsApi.getRecent(50).then(r => {
      if (r?.code === 200 && r.data) setSignals(r.data);
      setLoading(false);
    }).catch(() => setLoading(false));
    paperApi.getTrades(50).then(tr => {
      if (tr?.code === 200 && tr.data) {
        const d = tr.data.closedTrades || tr.data;
        setTrades(Array.isArray(d) ? d : []);
      }
    }).catch(() => {});
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* View Tabs */}
      <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 3 }}>
        {[
          { key: 'signals', label: '扫描中代币', icon: Activity },
          { key: 'sim', label: '模拟交易', icon: BarChart3 },
          { key: 'real', label: '实盘交易', icon: TrendingUp },
          { key: 'learn', label: '自动学习', icon: Zap },
        ].map(v => {
          const Icon = v.icon;
          const isActive = view === v.key;
          return (
            <button key={v.key} onClick={() => setView(v.key)}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                padding: '8px 12px', borderRadius: 6,
                background: isActive ? 'rgba(99,102,241,0.15)' : 'transparent',
                border: 'none', color: isActive ? 'var(--accent)' : 'var(--dark-400)',
                cursor: 'pointer', fontSize: 11, fontWeight: 500,
              }}>
              <Icon size={13} />{v.label}
            </button>
          );
        })}
      </div>

      {/* 扫描中代币 */}
      {view === 'signals' && (
        <div style={{ ...cardBase, padding: 20 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'white', marginBottom: 12 }}>
            扫描中代币 <span style={{ fontSize: 11, color: 'var(--dark-400)' }}>{loading ? '加载中...' : signals.length + ' 个'}</span>
          </p>
          {loading && signals.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--dark-400)', padding: 24, fontSize: 13 }}>加载中...</p>
          ) : signals.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--dark-400)', padding: 24, fontSize: 13 }}>暂无代币数据</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {signals.slice(0, 20).map((sig: any) => {
                const cc = chainColors[sig.chain] || '#808080';
                const sc = sig.score || sig.confidence || 0;
                const priceStr = sig.price_usd ? '$' + (sig.price_usd < 0.001 ? sig.price_usd.toFixed(8) : sig.price_usd < 1 ? sig.price_usd.toFixed(6) : sig.price_usd.toFixed(4)) : '-';
                const liqStr = sig.liquidity_usd >= 1000000 ? (sig.liquidity_usd/1000000).toFixed(1) + 'M' : (sig.liquidity_usd/1000).toFixed(1) + 'K';
                return (
                  <div key={sig.id} style={{ ...cardBase, padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#2a2a3e,#1a1a2e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                      {(sig.symbol || '?').charAt(0)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>{sig.symbol || sig.contract?.slice(0, 10)}</span>
                        <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 100, background: cc+'20', color: cc, fontWeight: 500 }}>{sig.chain}</span>
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--dark-400)' }}>
                        {priceStr} - {liqStr} - {sc}
                        {sig.time ? ' - ' + new Date(sig.time).toLocaleTimeString() : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: sc>=70?'#10b981':sc>=50?'#f59e0b':'#ef4444' }}>{sc}%</div>
                      <p style={{ fontSize: 10, color: 'var(--dark-400)', marginTop: 1 }}>可信度</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 模拟交易 */}
      {view === 'sim' && (
        <div style={{ ...cardBase, padding: 20 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'white', marginBottom: 12 }}>模拟交易</p>
          <p style={{ textAlign: 'center', color: 'var(--dark-400)', padding: 24, fontSize: 13 }}>暂无模拟交易记录</p>
        </div>
      )}

      {/* 实盘交易 */}
      {view === 'real' && (
        <div style={{ ...cardBase, padding: 20 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'white', marginBottom: 12 }}>实盘交易</p>
          <p style={{ textAlign: 'center', color: 'var(--dark-400)', padding: 24, fontSize: 13 }}>请先连接钱包以启用实盘交易</p>
        </div>
      )}

      {/* 自动学习 */}
      {view === 'learn' && (
        <div style={{ ...cardBase, padding: 20 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'white', marginBottom: 12 }}>自动学习</p>
          <p style={{ textAlign: 'center', color: 'var(--dark-400)', padding: 24, fontSize: 13 }}>自动学习功能接入中</p>
        </div>
      )}
    </div>
  );
}
