import { useState, useEffect } from 'react';
import { TrendingUp, Activity, BarChart3, Zap, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { signalsPageApi, paperApi } from '../../utils/api';

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
  const [trades, setTrades] = useState<any[]>([]);
  const [equity, setEquity] = useState<any[]>([]);
  const [view, setView] = useState('signals');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      signalsPageApi.getPage(page, PAGE_SIZE, chainFilter || undefined),
      paperApi.getTrades(50),
      paperApi.getEquity(200),
    ]).then(([sr, tr, er]) => {
      if (sr?.code === 200 && sr.data) { setSignals((sr as any).data); setTotal((sr as any).total || 0); }
      if (tr?.code === 200 && tr.data) {
        const td = tr.data as any;
        setTrades((td.openPositions || []).concat(td.closedTrades || []));
      }
      if (er?.code === 200 && er.data) setEquity(er.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [page, chainFilter]);

  const filtered = actionFilter ? signals.filter(s => s.action === actionFilter) : signals;
  const totalPages = Math.ceil((actionFilter ? filtered.length : total) / PAGE_SIZE);

  const closed = trades.filter(t => t.status === 'closed');
  const totalPnl = closed.reduce((s, t) => s + parseFloat(t.pnl_usd || 0), 0);
  const wins = closed.filter(t => parseFloat(t.pnl_usd || 0) > 0).length;
  const priceMap: Record<string, number> = {};
  signals.forEach(s => { if (s.contract && s.price_usd > 0) priceMap[s.chain + ':' + s.contract] = s.price_usd; });

  const equityChart = equity.length > 1 ? (() => {
    const vals = equity.slice(-100).map(e => parseFloat(e.balance || 0));
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const w = 300, h = 60;
    const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
    const color = vals[vals.length - 1] >= vals[0] ? '#10b981' : '#ef4444';
    return (
      <div style={{ marginBottom: 12, padding: 12, background: 'rgba(0,0,0,0.2)', borderRadius: 10 }}>
        <p style={{ fontSize: 10, color: '#808080', marginBottom: 4 }}>净值曲线</p>
        <svg style={{ width: '100%', height: h }}>
          <polyline fill="none" stroke={color} strokeWidth={2} points={pts} />
        </svg>
      </div>
    );
  })() : null;

  const navBtn: React.CSSProperties = {
    padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.05)', color: 'white', cursor: 'pointer',
    fontSize: 12, display: 'flex', alignItems: 'center', gap: 4,
  };
  const navBtnDisabled: React.CSSProperties = { ...navBtn, opacity: 0.3, cursor: 'not-allowed' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 3 }}>
        {[{ key: 'signals', label: '扫描中代币', icon: Activity }, { key: 'sim', label: '模拟交易', icon: BarChart3 }, { key: 'real', label: '实盘交易', icon: TrendingUp }, { key: 'learn', label: '自动学习', icon: Zap }].map(v => {
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

      {view === 'signals' && (
        <div style={{ ...cardBase, padding: 20 }}>
          {/* 头部：标题 + 链筛选 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>
              扫描中代币 <span style={{ fontSize: 11, color: 'var(--dark-400)' }}>{loading ? '加载中...' : total + ' 个'}</span>
            </p>
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
              {filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE).map((sig: any) => {
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

            {/* 翻页控件 */}
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

      {view === 'sim' && (
        <div style={{ ...cardBase, padding: 20 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'white', marginBottom: 12 }}>模拟交易 <span style={{ fontSize: 11, color: 'var(--dark-400)' }}>{loading ? '加载中...' : trades.length + ' 条'}</span></p>
          {trades.length === 0 ? <p style={{ textAlign: 'center', color: 'var(--dark-400)', padding: 24, fontSize: 13 }}>暂无模拟交易记录</p>
          : <div>
            {equityChart}
            <div style={{ display: 'flex', gap: 16, marginBottom: 12, padding: 12, background: 'rgba(0,0,0,0.2)', borderRadius: 10, flexWrap: 'wrap' }}>
              <div><span style={{ fontSize: 13, fontWeight: 700, color: totalPnl >= 0 ? '#10b981' : '#ef4444' }}>{(totalPnl >= 0 ? '+' : '') + '$' + totalPnl.toFixed(2)}</span><span style={{ fontSize: 10, color: 'var(--dark-400)', marginLeft: 4 }}>盈亏</span></div>
              <div><span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>{closed.length}</span><span style={{ fontSize: 10, color: 'var(--dark-400)', marginLeft: 4 }}>总交易</span></div>
              <div><span style={{ fontSize: 13, fontWeight: 700, color: '#10b981' }}>{wins}</span><span style={{ fontSize: 10, color: 'var(--dark-400)', marginLeft: 4 }}>胜</span></div>
              <div><span style={{ fontSize: 13, fontWeight: 700, color: '#ef4444' }}>{closed.length - wins}</span><span style={{ fontSize: 10, color: 'var(--dark-400)', marginLeft: 4 }}>负</span></div>
              <div><span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>{closed.length > 0 ? ((wins / closed.length) * 100).toFixed(1) + '%' : '-'}</span><span style={{ fontSize: 10, color: 'var(--dark-400)', marginLeft: 4 }}>胜率</span></div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '8px 10px', color: '#808080', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>合约</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', color: '#808080', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>方向</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', color: '#808080', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>入场价</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', color: '#808080', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>数量</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', color: '#808080', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>盈亏</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', color: '#808080', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>收益率</th>
                    <th style={{ textAlign: 'left', padding: '8px 10px', color: '#808080', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.slice(0, 30).map((t: any) => {
                    let pnl = parseFloat(t.pnl_usd || 0);
                    let pct = parseFloat(t.pnl_pct || 0);
                    const fp = priceMap[t.chain + ':' + t.contract];
                    if (t.status === 'open' && fp && parseFloat(t.entry_price) > 0) {
                      const ep = parseFloat(t.entry_price);
                      pnl = ((fp - ep) / ep) * parseFloat(t.amount_usd || 0);
                      pct = ((fp - ep) / ep) * 100;
                    }
                    return (
                      <tr key={t.id}>
                        <td style={{ padding: '8px 10px', color: 'white', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: 10 }}>{t.contract?.slice(0, 12) || '-'}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', color: t.side === 'buy' ? '#10b981' : '#ef4444', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>{t.side?.toUpperCase()}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', color: '#ccc', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>{'$' + parseFloat(t.entry_price || 0).toFixed(8)}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', color: '#ccc', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>{'' + parseFloat(t.quantity || 0).toFixed(2)}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.03)', color: pnl >= 0 ? '#10b981' : '#ef4444' }}>{(pnl >= 0 ? '+' : '') + '$' + pnl.toFixed(2)}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.03)', color: pct >= 0 ? '#10b981' : '#ef4444' }}>{(pct >= 0 ? '+' : '') + pct.toFixed(2) + '%'}</td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                          <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: t.status === 'closed' ? 'rgba(99,102,241,0.1)' : 'rgba(16,185,129,0.1)', color: t.status === 'closed' ? '#808080' : '#10b981' }}>
                            {t.status === 'closed' ? '已平仓' : '持仓中'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>}
        </div>
      )}

      {view === 'real' && (
        <div style={{ ...cardBase, padding: 20 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'white', marginBottom: 12 }}>实盘交易</p>
          <p style={{ textAlign: 'center', color: 'var(--dark-400)', padding: 24, fontSize: 13 }}>请先连接钱包以启用实盘交易</p>
        </div>
      )}

      {view === 'learn' && (
        <div style={{ ...cardBase, padding: 20 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'white', marginBottom: 12 }}>自动学习</p>
          <p style={{ textAlign: 'center', color: 'var(--dark-400)', padding: 24, fontSize: 13 }}>自动学习功能接入中</p>
        </div>
      )}
    </div>
  );
}
