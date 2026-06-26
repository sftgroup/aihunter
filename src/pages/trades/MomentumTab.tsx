import { useState, useEffect, useRef } from 'react';
import { Activity, Zap, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { signalsPageApi } from "../../utils/api";
import LearningTab from "./LearningTab";


const cardBase: React.CSSProperties = {
  background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
  backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
};

const chainColors: Record<string, string> = {
  ETH: '#627eea', BSC: '#f0b90b', BASE: '#0052ff', SOL: '#9945ff',
};
const PAGE_SIZE = 20;

export default function MomentumTab() {
  const [signals, setSignals] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [chainFilter, setChainFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [view, setView] = useState('signals');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (view !== 'signals') return;
    setLoading(true);
    signalsPageApi.getPage(page, PAGE_SIZE, chainFilter || undefined).then((sr) => {
      if (sr?.code === 200 && sr.data) { setSignals((sr as any).data); setTotal((sr as any).total || 0); }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [page, chainFilter, view]);

  const filtered = actionFilter ? signals.filter(s => s.action === actionFilter) : signals;
  const totalPages = Math.ceil((actionFilter ? filtered.length : total) / PAGE_SIZE);

  const navBtn: React.CSSProperties = {
    padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.05)', color: 'white', cursor: 'pointer',
    fontSize: 12, display: 'flex', alignItems: 'center', gap: 4,
  };
  const navBtnDisabled: React.CSSProperties = { ...navBtn, opacity: 0.3, cursor: 'not-allowed' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 导航标签 */}
      <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 3 }}>
        {[{ key: 'signals', label: '扫描中代币', icon: Activity }, { key: 'learn', label: '自动学习', icon: Zap }].map(v => {
          const Icon = v.icon;
          const isActive = view === v.key;
          return (
            <button key={v.key} onClick={() => { setView(v.key); setPage(1); }}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '8px 12px', borderRadius: 6, background: isActive ? 'rgba(99,102,241,0.15)' : 'transparent', border: 'none', color: isActive ? 'var(--accent)' : 'var(--dark-400)', cursor: 'pointer', fontSize: 11, fontWeight: 500 }}>
              <Icon size={13} />{v.label}
            </button>
          );
        })}
      </div>

      {/* 扫描中代币 */}
      {view === 'signals' && (
        <div style={{ ...cardBase, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <Filter size={12} color="var(--dark-400)" />
              {['', 'buy', 'pass'].map(a => (
                <button key={a} onClick={() => { setActionFilter(a); setPage(1); }}
                  style={{
                    padding: '3px 8px', borderRadius: 6, border: 'none', fontSize: 10, fontWeight: 500,
                    cursor: 'pointer',
                    background: actionFilter === a ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.05)',
                    color: actionFilter === a ? 'white' : 'var(--dark-400)',
                  }}>
                  {a === '' ? '全部' : a === 'buy' ? 'BUY' : 'PASS'}
                </button>
              ))}
              <span style={{width:8}}></span>
              {['', 'ETH', 'BSC', 'BASE', 'SOL'].map(c => (
                <button key={c} onClick={() => { setChainFilter(c); setPage(1); }}
                  style={{
                    padding: '3px 8px', borderRadius: 6, border: 'none', fontSize: 10, fontWeight: 500,
                    cursor: 'pointer',
                    background: chainFilter === c ? (chainColors[c] || 'rgba(99,102,241,0.3)') : 'rgba(255,255,255,0.05)',
                    color: chainFilter === c ? 'white' : 'var(--dark-400)',
                  }}>
                  {c || '全部'}
                </button>
              ))}
            </div>
          </div>

          {loading && signals.length === 0 ? <p style={{ textAlign: 'center', color: 'var(--dark-400)', padding: 24, fontSize: 13 }}>加载中...</p>
          : filtered.length === 0 ? <p style={{ textAlign: 'center', color: 'var(--dark-400)', padding: 24, fontSize: 13 }}>暂无匹配的代币</p>
          : <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {filtered.map((sig: any) => {
                const cc = chainColors[sig.chain] || '#808080';
                const sc = sig.score || sig.confidence || 0;
                return (
                  <div key={sig.id} style={{ ...cardBase, padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#2a2a3e,#1a1a2e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                      {(sig.symbol || '?').charAt(0)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>{sig.symbol || sig.contract?.slice(0, 10)}</span>
                        <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 100, background: cc + '20', color: cc, fontWeight: 500 }}>{sig.chain}</span>
                        {sig.action === 'buy' && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 100, background: 'rgba(16,185,129,0.15)', color: '#10b981', fontWeight: 500 }}>BUY</span>}
                        {sig.safety_risk_level && sig.safety_risk_level >= '3' && (
                          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 100, background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontWeight: 500 }}>{'⚠️风险' + sig.safety_risk_level}</span>
                        )}
                        {sig.safety_concentration === 'High' && (
                          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 100, background: 'rgba(245,158,11,0.1)', color: '#f59e0b', fontWeight: 500 }}>集中度高</span>
                        )}
                        {sig.safety_tags?.includes('honeypot') && (
                          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 100, background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 600 }}>蜜罐</span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--dark-400)' }}>
                        {sig.price_usd ? '$' + (sig.price_usd < 0.001 ? sig.price_usd.toFixed(8) : sig.price_usd < 1 ? sig.price_usd.toFixed(6) : sig.price_usd.toFixed(4)) : '-'}
                        {' - '}{sig.liquidity_usd >= 1000000 ? (sig.liquidity_usd / 1000000).toFixed(1) + 'M' : (sig.liquidity_usd / 1000).toFixed(1) + 'K'}
                        {' - 评分 ' + sc}
                        {sig.hourly_bars ? ' - ' + sig.hourly_bars + 'h' : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: sc >= 70 ? '#10b981' : sc >= 50 ? '#f59e0b' : '#ef4444' }}>{sc}%</div>
                      <p style={{ fontSize: 10, color: 'var(--dark-400)', marginTop: 1 }}>可信度</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16 }}>
                <button disabled={page <= 1} style={page <= 1 ? navBtnDisabled : navBtn} onClick={() => setPage(p => Math.max(1, p - 1))}>
                  <ChevronLeft size={14} />上一页
                </button>
                <span style={{ fontSize: 12, color: 'var(--dark-400)' }}>
                  第 {page} / {totalPages} 页
                </span>
                <button disabled={page >= totalPages} style={page >= totalPages ? navBtnDisabled : navBtn} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
                  下一页<ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>}
        </div>
      )}

      {/* 自动学习 */}
      {view === 'learn' && <LearningTab />}
    </div>
  );
}



function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr || '-';
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

declare const window: Window & typeof globalThis & { ethereum?: any };
