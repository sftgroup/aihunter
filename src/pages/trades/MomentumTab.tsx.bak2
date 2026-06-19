import { useState, useEffect } from 'react';
import { TrendingUp, Activity, Zap, ChevronLeft, ChevronRight, Filter, Copy, Check, Wallet, ExternalLink } from 'lucide-react';
import { signalsPageApi, learningApi } from '../../utils/api';
import { useAccount, useDisconnect, useBalance } from 'wagmi';

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
      {view === 'real' && <RealTradeTab />}

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
        <p style={{ fontSize: 12, fontWeight: 600, color: 'white', marginBottom: 12 }}>当前参数（Optuna 优化）</p>
        {Object.keys(optuna).length > 0 ? (
          <>
            {/* 维度参数 */}
            <p style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 500, marginBottom: 6 }}>▸ 筛选维度参数</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 6, marginBottom: 16 }}>
              {[
                {key: 'min_score', label: '最低评分', suffix: '分', fmt: (v: number) => Math.round(v).toString()},
                {key: 'min_hourly_bars', label: '最少小时柱', suffix: 'h', fmt: (v: number) => Math.round(v).toString()},
                {key: 'range_min_pct', label: '最小震荡', suffix: '%', fmt: (v: number) => v.toFixed(1)},
                {key: 'range_max_pct', label: '最大震荡', suffix: '%', fmt: (v: number) => v.toFixed(1)},
                {key: 'min_liquidity_k', label: '最小流动性', suffix: 'K', fmt: (v: number) => Math.round(v).toString()},
              ].map(({key, label, suffix, fmt}) => {
                const val = optuna[key];
                if (val === undefined) return null;
                return (
                  <div key={key} style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
                    <p style={{ fontSize: 10, color: 'var(--dark-400)', marginBottom: 2 }}>{label}</p>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>{fmt(val)}{suffix}</p>
                  </div>
                );
              })}
            </div>
            {/* 止盈止损参数 */}
            <p style={{ fontSize: 11, color: '#f59e0b', fontWeight: 500, marginBottom: 6 }}>▸ 止盈止损参数</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 6 }}>
              {[
                {key: 'take_profit_pct', label: '止盈', fmt: (v: number) => formatPct(v)},
                {key: 'stop_loss_pct', label: '止损', fmt: (v: number) => formatPct(v)},
                {key: 'trade_ratio', label: '交易比例', fmt: (v: number) => formatPct(v)},
                {key: 'max_slippage', label: '最大滑点', fmt: (v: number) => formatPct(v)},
                {key: 'position_pct', label: '仓位比例', fmt: (v: number) => formatPct(v)},
                {key: 'min_confidence', label: '最低可信度', fmt: (v: number) => formatPct(v)},
              ].map(({key, label, fmt}) => {
                const val = optuna[key];
                if (val === undefined) return null;
                return (
                  <div key={key} style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
                    <p style={{ fontSize: 10, color: 'var(--dark-400)', marginBottom: 2 }}>{label}</p>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>{fmt(val)}</p>
                  </div>
                );
              })}
            </div>
          </>
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

function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr || '-';
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function RealTradeTab() {
  const { address, isConnected } = useAccount();
  const { data: balance } = useBalance({ address });
  const { disconnect } = useDisconnect();
  const [copied, setCopied] = useState(false);

  const copyAddr = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isConnected || !address) {
    return (
      <div style={{ ...cardBase, padding: 40, textAlign: 'center' }}>
        <Wallet size={48} style={{ color: 'var(--dark-500)', marginBottom: 16 }} />
        <p style={{ fontSize: 16, fontWeight: 600, color: 'white', marginBottom: 8 }}>未连接钱包</p>
        <p style={{ fontSize: 13, color: 'var(--dark-400)', marginBottom: 20 }}>
          请连接钱包以查看实盘持仓和交易
        </p>
        <p style={{ fontSize: 12, color: 'var(--accent)', cursor: 'pointer' }}>
          点击右上角「连接钱包」按钮
        </p>
      </div>
    );
  }

  const ethBalance = balance ? parseFloat(balance.formatted).toFixed(4) : '0';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 钱包信息 */}
      <div style={{ ...cardBase, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>钱包信息</p>
          <button onClick={() => disconnect()}
            style={{
              padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)',
              background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 10, cursor: 'pointer',
            }}>
            断开连接
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
            <Wallet size={14} color="var(--accent)" />
            <span style={{ fontSize: 12, color: '#ccc', fontFamily: "'JetBrains Mono', monospace" }}>{shortAddr(address)}</span>
            <button onClick={copyAddr} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
              {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} color="var(--dark-400)" />}
            </button>
            <a href={`https://etherscan.io/address/${address}`} target="_blank" rel="noreferrer" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
              <ExternalLink size={14} color="var(--dark-400)" />
            </a>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1, padding: '8px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
              <p style={{ fontSize: 10, color: 'var(--dark-400)', marginBottom: 2 }}>{balance?.symbol || 'ETH'} 余额</p>
              <p style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>{ethBalance}</p>
            </div>
            <div style={{ flex: 1, padding: '8px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
              <p style={{ fontSize: 10, color: 'var(--dark-400)', marginBottom: 2 }}>链</p>
              <p style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>{balance?.chain?.name || 'Ethereum'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 持仓（从模拟交易读取，实盘暂无） */}
      <div style={{ ...cardBase, padding: 20 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'white', marginBottom: 12 }}>持仓</p>
        <RealPositions address={address} />
      </div>
    </div>
  );
}

function RealPositions({ address }: { address: string }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 从 API 获取持仓数据（模拟交易持仓，实盘待接入）
    fetch('/api/trade/portfolio?limit=50')
      .then(r => r.json())
      .then(d => {
        if (d?.code === 200 && d?.data) {
          const td = d.data as any;
          setOrders((td.openPositions || []).slice(0, 20));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ fontSize: 12, color: 'var(--dark-400)', textAlign: 'center', padding: 16 }}>加载中...</p>;
  if (orders.length === 0) return <p style={{ fontSize: 12, color: 'var(--dark-400)', textAlign: 'center', padding: 16 }}>暂无持仓</p>;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '6px 10px', color: '#808080', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>合约</th>
            <th style={{ textAlign: 'right', padding: '6px 10px', color: '#808080', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>方向</th>
            <th style={{ textAlign: 'right', padding: '6px 10px', color: '#808080', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>入场价</th>
            <th style={{ textAlign: 'right', padding: '6px 10px', color: '#808080', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>数量</th>
            <th style={{ textAlign: 'right', padding: '6px 10px', color: '#808080', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>盈亏</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((t: any) => {
            const pnl = parseFloat(t.pnl_usd || 0);
            return (
              <tr key={t.id}>
                <td style={{ padding: '6px 10px', color: 'white', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: 10 }}>{t.contract?.slice(0, 14) || '-'}</td>
                <td style={{ padding: '6px 10px', textAlign: 'right', color: t.side === 'buy' ? '#10b981' : '#ef4444', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>{t.side?.toUpperCase()}</td>
                <td style={{ padding: '6px 10px', textAlign: 'right', color: '#ccc', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>{'$' + parseFloat(t.entry_price || 0).toFixed(8)}</td>
                <td style={{ padding: '6px 10px', textAlign: 'right', color: '#ccc', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>{parseFloat(t.quantity || 0).toFixed(2)}</td>
                <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: pnl >= 0 ? '#10b981' : '#ef4444', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>{(pnl >= 0 ? '+' : '') + '$' + pnl.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
