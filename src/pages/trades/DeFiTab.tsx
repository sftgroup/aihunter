import { useState, useEffect } from 'react';
import { PiggyBank, TrendingUp, TrendingDown, Zap, RefreshCw } from 'lucide-react';
import { lendingApi } from '../../utils/api';
import type { RateSnapshot } from '../../types/api';

const cardBase: React.CSSProperties = {
  background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
  backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
};

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

export default function DeFiTab() {
  const [rates, setRates] = useState<RateSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadRates() {
    setLoading(true);
    const res = await lendingApi.getRates();
    if (res.code === 200 && res.data) {
      // 去重：每个 chain+token 取最新一条
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

  // 统计
  const protocols = new Set(rates.map(r => r.protocol)).size;
  const assets = rates.length;
  const maxSpread = rates.reduce((max, r) => {
    const s = (r.borrow_apy ? r.borrow_apy : 0) - (r.supply_apy ? r.supply_apy : 0);
    return s > max ? s : max;
  }, 0);
  const arbCount = rates.filter(r => {
    const spread = (r.borrow_apy ? r.borrow_apy : 0) - (r.supply_apy ? r.supply_apy : 0);
    return spread > 0.3; // > 30bps
  }).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        {[
          { label: '监控协议', value: String(protocols), icon: PiggyBank, color: 'var(--accent)' },
          { label: '监控资产', value: String(assets), icon: TrendingUp, color: 'var(--accent-blue)' },
          { label: '套利机会', value: String(arbCount), icon: Zap, color: 'var(--accent-green)' },
          { label: '最大利差', value: maxSpread > 0 ? maxSpread.toFixed(2) + '%' : '-', icon: TrendingDown, color: 'var(--accent-orange)' },
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

      {/* Rate Table */}
      <div className="gradient-border" style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>Aave V3 利率监控</p>
          <RefreshCw size={14} style={{ color: loading ? 'var(--accent)' : 'var(--dark-400)', cursor: 'pointer' }} onClick={loadRates} />
        </div>
        {rates.length === 0 ? (
          <p style={{ color: 'var(--dark-400)', fontSize: 12, textAlign: 'center', padding: 24 }}>
            {loading ? '加载中...' : '暂无利率数据'}
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--dark-400)', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>链</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--dark-400)', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>协议</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--dark-400)', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>资产</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--dark-400)', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>存款 APY</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--dark-400)', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>借款 APY</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--dark-400)', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>利差</th>
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
                      <td style={{ padding: '10px 12px', color: 'var(--dark-200)', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>{r.protocol}</td>
                      <td style={{ padding: '10px 12px', color: 'white', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.03)' }}>{r.token}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--accent-green)', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>{deposit}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: parseFloat(borrow) > 0 ? 'var(--accent-red)' : 'var(--dark-400)', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>{borrow}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: parseFloat(spread) > 0.3 ? 'var(--accent-orange)' : 'var(--dark-400)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.03)' }}>{spread}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', padding: 8 }}>
        <p style={{ fontSize: 11, color: 'var(--dark-400)' }}>
          利率数据来自 Aave V3 链上 · 利差 &gt; 30bps 触发信号 · 闪电贷需 SessionKey
        </p>
      </div>
    </div>
  );
}
