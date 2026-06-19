import { useState, useEffect } from 'react';
import { TrendingUp, Activity, Zap, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { signalsPageApi, learningApi } from '../../utils/api';

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
        {[{ key: 'signals', label: '扫描中代币', icon: Activity }, { key: 'real', label: '实盘交易', icon: TrendingUp }, { key: 'learn', label: '自动学习', icon: Zap }].map(v => {
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

      {/* 实盘交易 */}
      {view === 'real' && (
        <div style={{ ...cardBase, padding: 20 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'white', marginBottom: 12 }}>实盘交易</p>
          <p style={{ textAlign: 'center', color: 'var(--dark-400)', padding: 24, fontSize: 13 }}>请先连接钱包以启用实盘交易</p>
        </div>
      )}

      {/* 自动学习 */}
      {view === 'learn' && <LearningTab />}
    </div>
  );
}

function formatNumber(n: number, decimals: number = 2): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toFixed(decimals);
}

function formatPct(v: number): string {
  return (v * 100).toFixed(1) + '%';
}

function LearningTab() {
  const [params, setParams] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      learningApi.getParams('signal_follow'),
      learningApi.getHistory('signal_follow', 100),
    ]).then(([pr, hr]) => {
      if (pr?.code === 200 && pr?.data) setParams(pr.data);
      if (hr?.code === 200 && hr?.data) setHistory(hr.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const latestScore = history.length > 0 ? history[history.length - 1].score : 0;
  const avgScore = history.length > 0 ? history.reduce((s, h) => s + parseFloat(h.score || 0), 0) / history.length : 0;
  const expCount = params?.experience_count || 0;
  const optuna = params?.params || {};
  const rules = params?.rules || [];

  // 评分曲线 SVG
  const scoreChart = history.length > 1 ? (() => {
    const vals = history.map(h => parseFloat(h.score || 0));
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const w = 400, h = 80;
    const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
    return (
      <svg style={{ width: '100%', height: h }}>
        <polyline fill="none" stroke="#10b981" strokeWidth={2} points={pts} />
      </svg>
    );
  })() : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 概览卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        <div style={{ ...cardBase, padding: 16 }}>
          <p style={{ fontSize: 11, color: 'var(--dark-400)', marginBottom: 4 }}>学习次数</p>
          <p style={{ fontSize: 22, fontWeight: 700, color: 'white' }}>{history.length}</p>
        </div>
        <div style={{ ...cardBase, padding: 16 }}>
          <p style={{ fontSize: 11, color: 'var(--dark-400)', marginBottom: 4 }}>当前经验</p>
          <p style={{ fontSize: 22, fontWeight: 700, color: 'white' }}>{formatNumber(expCount)}</p>
        </div>
        <div style={{ ...cardBase, padding: 16 }}>
          <p style={{ fontSize: 11, color: 'var(--dark-400)', marginBottom: 4 }}>最新评分</p>
          <p style={{ fontSize: 22, fontWeight: 700, color: latestScore >= 0.7 ? '#10b981' : '#f59e0b' }}>{formatPct(latestScore)}</p>
        </div>
        <div style={{ ...cardBase, padding: 16 }}>
          <p style={{ fontSize: 11, color: 'var(--dark-400)', marginBottom: 4 }}>平均评分</p>
          <p style={{ fontSize: 22, fontWeight: 700, color: '#818cf8' }}>{formatPct(avgScore)}</p>
        </div>
      </div>

      {/* 评分趋势 */}
      <div style={{ ...cardBase, padding: 16 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: 'white', marginBottom: 8 }}>评分趋势</p>
        {scoreChart || <p style={{ fontSize: 12, color: 'var(--dark-400)' }}>数据不足</p>}
      </div>

      {/* 当前参数 */}
      <div style={{ ...cardBase, padding: 16 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: 'white', marginBottom: 8 }}>当前参数（Optuna 优化）</p>
        {Object.keys(optuna).length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
            {Object.entries(optuna).map(([k, v]) => (
              <div key={k} style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
                <p style={{ fontSize: 10, color: 'var(--dark-400)', marginBottom: 2 }}>{k}</p>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>
                  {k.includes('pct') || k.includes('ratio') || k.includes('confidence') ?
                    (typeof v === 'number' ? formatPct(v) : v) :
                    (typeof v === 'number' ? v.toFixed(4) : v)}
                </p>
              </div>
            ))}
          </div>
        ) : <p style={{ fontSize: 12, color: 'var(--dark-400)' }}>暂无参数数据</p>}
      </div>

      {/* 规则列表 */}
      {rules.length > 0 && (
        <div style={{ ...cardBase, padding: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'white', marginBottom: 8 }}>
            策略规则 <span style={{ fontSize: 10, color: 'var(--dark-400)' }}>DeepSeek 生成</span>
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rules.map((r: any, i: number) => (
              <div key={i} style={{ padding: 10, background: 'rgba(0,0,0,0.2)', borderRadius: 8, fontSize: 11, color: '#ccc' }}>
                <div style={{ marginBottom: 4 }}>
                  <span style={{ color: '#10b981', fontWeight: 600 }}>IF </span>
                  <span>{r.condition || '-'}</span>
                </div>
                <div>
                  <span style={{ color: '#818cf8', fontWeight: 600 }}>THEN </span>
                  <span>{r.action || '-'}</span>
                  {r.expected_win_rate && <span style={{ color: 'var(--dark-400)', marginLeft: 8 }}>预期胜率: {formatPct(r.expected_win_rate)}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 学习历史表格 */}
      <div style={{ ...cardBase, padding: 16 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: 'white', marginBottom: 8 }}>学习历史</p>
        {history.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px 10px', color: '#808080', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>#</th>
                  <th style={{ textAlign: 'right', padding: '6px 10px', color: '#808080', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>评分</th>
                  <th style={{ textAlign: 'right', padding: '6px 10px', color: '#808080', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>经验数</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px', color: '#808080', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>时间</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(-20).reverse().map((h: any) => (
                  <tr key={h.id}>
                    <td style={{ padding: '6px 10px', color: 'var(--dark-400)', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>{h.id}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: parseFloat(h.score || 0) >= 0.7 ? '#10b981' : '#f59e0b', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>{formatPct(parseFloat(h.score || 0))}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: '#ccc', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>{h.experience_count || '-'}</td>
                    <td style={{ padding: '6px 10px', color: 'var(--dark-400)', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: 10 }}>{(h.created_at || '').slice(0, 19).replace('T', ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p style={{ fontSize: 12, color: 'var(--dark-400)' }}>暂无学习记录</p>}
      </div>
    </div>
  );
}
