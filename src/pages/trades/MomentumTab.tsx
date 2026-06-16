import { useState, useEffect, useRef } from 'react';
import { TrendingUp, Activity, BarChart3, Zap } from 'lucide-react';
import { signalApi } from '../../utils/api';
import type { Signal } from '../../types/api';

const cardBase: React.CSSProperties = {
  background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
  backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
};

export default function MomentumTab() {
  const [signals, setSignals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadSignals() {
    setLoading(true);
    const res = await signalApi.getRecent(50);
    if (res.code === 200 && res.data) {
      setSignals(res.data);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadSignals();
    const iv = setInterval(loadSignals, 15000);
    return () => clearInterval(iv);
  }, []);

  // 真实信号中过滤出有价格的作为"动量"类信号
  const withPrice = signals.filter(s => s.price_usd && s.price_usd > 0);
  const bullishCount = withPrice.filter(s => s.confidence >= 60).length;
  const breakCount = withPrice.filter(s => s.confidence >= 70).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        {[
          { label: '扫描中代币', value: String(signals.length), icon: Activity, color: 'var(--accent)' },
          { label: '高置信度', value: String(bullishCount), icon: Zap, color: 'var(--accent-green)' },
          { label: '突破信号', value: String(breakCount), icon: TrendingUp, color: 'var(--accent-blue)' },
          { label: '模拟盈亏', value: '-', icon: BarChart3, color: 'var(--text2)' },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} style={{ ...cardBase, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Icon size={14} color={s.color} />
                <p style={{ fontSize: 11, color: 'var(--dark-400)' }}>{s.label}</p>
              </div>
              <p style={{ fontSize: 20, fontWeight: 700, color: 'white' }}>{s.value}</p>
            </div>
          );
        })}
      </div>

      {/* Active Signals */}
      <div className="gradient-border" style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>实时信号</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{
              padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 500,
              background: 'rgba(99,102,241,0.1)', color: 'var(--accent)',
              border: '1px solid rgba(99,102,241,0.2)',
            }}>{signals.length} 条</span>
          </div>
        </div>

        {loading && signals.length === 0 ? (
          <p style={{ color: 'var(--dark-400)', fontSize: 12, textAlign: 'center', padding: 24 }}>
            加载中...
          </p>
        ) : signals.length === 0 ? (
          <p style={{ color: 'var(--dark-400)', fontSize: 12, textAlign: 'center', padding: 24 }}>
            暂无交易信号
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {signals.slice(0, 20).map((sig: any) => {
              const chainColor = sig.chain === 'ETH' ? '#627eea' : sig.chain === 'SOL' ? '#9945ff' : sig.chain === 'BSC' ? '#f0b90b' : '#0052ff';
              const confidenceLevel = sig.confidence >= 70 ? '高' : sig.confidence >= 50 ? '中' : '低';
              const confColor = sig.confidence >= 70 ? 'var(--accent-green)' : sig.confidence >= 50 ? 'var(--accent-orange)' : 'var(--accent-red)';
              const priceStr = sig.price_usd ? '$' + sig.price_usd.toFixed(sig.price_usd < 0.001 ? 8 : sig.price_usd < 1 ? 6 : 4) : '-';
              const liqStr = sig.liquidity_usd ? '$' + (sig.liquidity_usd >= 1000000 ? (sig.liquidity_usd / 1000000).toFixed(1) + 'M' : sig.liquidity_usd >= 1000 ? (sig.liquidity_usd / 1000).toFixed(1) + 'K' : sig.liquidity_usd.toFixed(0)) : '-';

              return (
                <div key={sig.id} style={{
                  ...cardBase, padding: 12, display: 'flex', alignItems: 'center', gap: 12,
                  cursor: 'pointer', transition: 'all 0.2s',
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.2)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: 'linear-gradient(135deg, var(--dark-600), var(--dark-700))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700, color: 'white', flexShrink: 0,
                  }}>
                    {(sig.symbol || sig.contract || '?').charAt(0)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>{sig.symbol || sig.contract?.slice(0, 8)}</span>
                      <span style={{
                        fontSize: 9, padding: '1px 6px', borderRadius: 4,
                        background: `rgba(${sig.chain === 'ETH' ? '98,126,234' : sig.chain === 'SOL' ? '153,69,255' : sig.chain === 'BSC' ? '240,185,11' : '0,82,255'},0.15)`,
                        color: chainColor, fontWeight: 500,
                      }}>{sig.chain}</span>
                      <span style={{
                        fontSize: 9, padding: '1px 6px', borderRadius: 4,
                        background: sig.confidence >= 70 ? 'rgba(16,185,129,0.1)' : sig.confidence >= 50 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
                        color: confColor, fontWeight: 500,
                      }}>可信度 {confidenceLevel}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--dark-400)' }}>
                      <span>{priceStr}</span>
                      <span>·</span>
                      <span>流动性 {liqStr}</span>
                      <span>·</span>
                      <span>评分 {sig.score || sig.confidence || '-'}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: confColor }}>
                      {sig.confidence}%
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--dark-400)', marginTop: 2 }}>可信度</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', padding: 16 }}>
        <p style={{ fontSize: 12, color: 'var(--dark-400)' }}>
          基于链上实时信号 · 可信度评分 · 流动性分析
        </p>
      </div>
    </div>
  );
}
