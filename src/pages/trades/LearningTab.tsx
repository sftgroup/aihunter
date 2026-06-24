/**
 * AIHunter LearningTab — 自动学习页面 (项目统一设计规范)
 *
 * 对齐 /config /dex /live 等页面：
 * - 磨砂玻璃卡片 (linear-gradient + blur + shadow)
 * - 全局色板 (--accent: #6366f1, --accent-green: #10b981)
 * - 页面标题区 + 副标题
 * - 宽松间距 (gap: 24)
 */
import { useState, useEffect } from 'react';
import {
  Brain, TrendingUp, RefreshCw, Award, BarChart3, Activity,
  Target, Shield, Clock, Sparkles, ArrowUp, ArrowDown,
} from 'lucide-react';
import { learningApi } from '../../utils/api';

/* ===== Design Tokens ===== */
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

const cardBase: React.CSSProperties = {
  background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
  backdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 16,
  boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
};

const sectionTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: T.dark400,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

/* ===== Helpers ===== */
function fmtPct(v: number | undefined | null, d = 1): string {
  if (v === null || v === undefined) return '—';
  return (v * 100).toFixed(d) + '%';
}

function fmtNum(v: number | undefined | null): string {
  if (v === null || v === undefined) return '—';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v.toFixed(1);
}

function fmtTime(t: string | undefined | null): string {
  if (!t) return '—';
  const d = new Date(t);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hour = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${month}-${day} ${hour}:${min}`;
}

function scoreColor(s: number): string {
  return s >= 0.7 ? T.accentGreen : s >= 0.4 ? T.accentOrange : T.accentRed;
}
function scoreBg(s: number): string {
  return s >= 0.7 ? 'rgba(16,185,129,0.1)' : s >= 0.4 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)';
}

/* ===== Main Component ===== */
export default function LearningTab() {
  const [params, setParams] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [paramTab, setParamTab] = useState<'current' | 'rules' | 'history'>('current');

  useEffect(() => {
    loadData();
    const iv = setInterval(loadData, 30000);
    return () => clearInterval(iv);
  }, []);

  async function loadData() {
    const [pr, hr] = await Promise.all([
      learningApi.getParams('signal_follow'),
      learningApi.getHistory('signal_follow', 50),
    ]);
    if (pr.code === 200) setParams(pr.data);
    if (hr.code === 200) setHistory(hr.data || []);
    setLoading(false);
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <div style={{ textAlign: 'center' }}>
          <Brain size={48} color={T.accent} style={{ opacity: 0.3, marginBottom: 16 }} />
          <p style={{ fontSize: 13, color: T.dark400 }}>加载学习参数...</p>
        </div>
      </div>
    );
  }

  const p = params?.params || {};
  const rules = params?.rules || [];
  const expCount = params?.experience_count || 0;
  const lastScore = history.length > 0 ? history[history.length - 1]?.score : null;

  // Parameter stat cards
  const statCards = [
    { label: '最低评分', value: p.min_score ?? '—', icon: Target, color: T.accent, desc: '低于此分的信号跳过', fmt: (v: any) => v },
    { label: '最少K线数', value: p.min_hourly_bars ?? '—', icon: BarChart3, color: T.accentPurple, desc: '小时K线数量要求', fmt: (v: any) => String(v) },
    { label: '震荡下限', value: p.range_min_pct, icon: ArrowDown, color: T.accentCyan, desc: '价格波动下限', fmt: (v: any) => v?.toFixed(1) + '%' },
    { label: '震荡上限', value: p.range_max_pct, icon: ArrowUp, color: T.accentCyan, desc: '价格波动上限', fmt: (v: any) => v?.toFixed(1) + '%' },
    { label: '最小流动性', value: p.min_liquidity_k, icon: Shield, color: T.accentGreen, desc: '低于此不交易', fmt: (v: any) => fmtNum(v) + 'K' },
    { label: '止盈', value: p.take_profit_pct, icon: TrendingUp, color: T.accentGreen, desc: '盈利目标', fmt: (v: any) => fmtPct(v) },
    { label: '止损', value: p.stop_loss_pct, icon: TrendingUp, color: T.accentRed, desc: '亏损上限', fmt: (v: any) => fmtPct(v) },
    { label: '仓位比例', value: p.trade_ratio, icon: Activity, color: T.accentOrange, desc: '单笔仓位占比', fmt: (v: any) => fmtPct(v) },
  ];

  const tabs = [
    { key: 'current', label: '当前参数', icon: Brain },
    { key: 'rules', label: '学习规则', icon: Award },
    { key: 'history', label: '学习历程', icon: Clock },
  ] as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Sparkles size={20} color="white" />
            </div>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: 'white', margin: 0 }}>自动学习</h2>
              <p style={{ fontSize: 12, color: T.dark400, marginTop: 2 }}>
                AI 分析历史交易数据 · 自动优化参数 · {expCount} 次学习经验
              </p>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {lastScore !== null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: T.dark400 }}>当前评分</span>
              <span style={{
                padding: '4px 16px', borderRadius: 100, fontSize: 16, fontWeight: 700,
                background: scoreBg(lastScore), color: scoreColor(lastScore),
              }}>{fmtPct(lastScore, 1)}</span>
            </div>
          )}
          <button onClick={handleRefresh} disabled={refreshing}
            style={{
              padding: '8px 20px', borderRadius: 10, fontSize: 12, fontWeight: 600,
              background: refreshing ? 'rgba(255,255,255,0.03)' : 'rgba(99,102,241,0.1)',
              border: refreshing ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(99,102,241,0.2)',
              color: refreshing ? T.dark400 : T.accent,
              cursor: refreshing ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? '刷新中...' : '刷新数据'}
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        {statCards.map(item => {
          const Icon = item.icon;
          const displayValue = item.value !== undefined && item.value !== null ? item.fmt(item.value) : '—';
          return (
            <div key={item.label} style={{ ...cardBase, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Icon size={16} color={item.color} />
                <span style={{ fontSize: 11, fontWeight: 500, color: T.dark400, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</span>
              </div>
              <p style={{ fontSize: 28, fontWeight: 700, color: item.color, margin: '0 0 4px', fontFamily: 'JetBrains Mono, monospace' }}>{displayValue}</p>
              <p style={{ fontSize: 11, color: T.dark500 }}>{item.desc}</p>
            </div>
          );
        })}
      </div>

      {/* Info Cards: Filter + Risk */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        {/* Signal Filtering */}
        <div style={{ ...cardBase, padding: 20 }}>
          <h3 style={{ ...sectionTitle, marginBottom: 16 }}><Target size={14} color={T.accent} /> 信号筛选</h3>
          <div style={{ display: 'flex', gap: 32 }}>
            <div>
              <div style={{ fontSize: 10, color: T.dark400, textTransform: 'uppercase', marginBottom: 4 }}>最低评分</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: T.accent, fontFamily: 'JetBrains Mono, monospace' }}>{p.min_score ?? '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: T.dark400, textTransform: 'uppercase', marginBottom: 4 }}>最少K线数</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: T.accentPurple, fontFamily: 'JetBrains Mono, monospace' }}>{p.min_hourly_bars ?? '—'}</div>
            </div>
          </div>
        </div>

        {/* Range + Liquidity */}
        <div style={{ ...cardBase, padding: 20 }}>
          <h3 style={{ ...sectionTitle, marginBottom: 16 }}><Activity size={14} color={T.accentCyan} /> 震荡区间 & 流动性</h3>
          <div style={{ display: 'flex', gap: 32 }}>
            <div>
              <div style={{ fontSize: 10, color: T.dark400, textTransform: 'uppercase', marginBottom: 4 }}>区间范围</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: T.accentCyan, fontFamily: 'JetBrains Mono, monospace' }}>
                {p.range_min_pct?.toFixed(1)}% ~ {p.range_max_pct?.toFixed(1)}%
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: T.dark400, textTransform: 'uppercase', marginBottom: 4 }}>最小流动性</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: T.accentGreen, fontFamily: 'JetBrains Mono, monospace' }}>
                {p.min_liquidity_k ? fmtNum(p.min_liquidity_k) + 'K' : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Risk Control */}
        <div style={{ ...cardBase, padding: 20 }}>
          <h3 style={{ ...sectionTitle, marginBottom: 16 }}><Shield size={14} color={T.accentGreen} /> 风控参数</h3>
          <div style={{ display: 'flex', gap: 32 }}>
            <div>
              <div style={{ fontSize: 10, color: T.dark400, textTransform: 'uppercase', marginBottom: 4 }}>止盈</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: T.accentGreen, fontFamily: 'JetBrains Mono, monospace' }}>{fmtPct(p.take_profit_pct)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: T.dark400, textTransform: 'uppercase', marginBottom: 4 }}>止损</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: T.accentRed, fontFamily: 'JetBrains Mono, monospace' }}>{fmtPct(p.stop_loss_pct)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: T.dark400, textTransform: 'uppercase', marginBottom: 4 }}>仓位</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: T.accentOrange, fontFamily: 'JetBrains Mono, monospace' }}>{fmtPct(p.trade_ratio)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: 6, background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 4, width: 'fit-content' }}>
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = paramTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setParamTab(tab.key as any)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 24px', borderRadius: 10, border: 'none',
                fontSize: 12, fontWeight: 600,
                background: isActive ? 'rgba(99,102,241,0.15)' : 'transparent',
                color: isActive ? T.accent : T.dark400,
                cursor: 'pointer', transition: 'all 0.15s',
              }}>
              <Icon size={15} />{tab.label}
            </button>
          );
        })}
      </div>

      {/* Parameter Detail */}
      {paramTab === 'current' && (
        <div style={{ ...cardBase, padding: 24 }}>
          <h3 style={{ ...sectionTitle, marginBottom: 20 }}><Brain size={14} color={T.accent} /> 参数详情</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            {/* Filter Params */}
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 11, color: T.accent, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>信号筛选</div>
              <div style={{ display: 'flex', gap: 32 }}>
                <div>
                  <div style={{ fontSize: 10, color: T.dark400, marginBottom: 4 }}>最低评分</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: T.accent, fontFamily: 'monospace' }}>{p.min_score ?? '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: T.dark400, marginBottom: 4 }}>最少K线</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: T.accentPurple, fontFamily: 'monospace' }}>{p.min_hourly_bars ?? '—'}</div>
                </div>
              </div>
            </div>
            {/* Range Params */}
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 11, color: T.accentCyan, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>震荡区间</div>
              <div style={{ display: 'flex', gap: 32 }}>
                <div>
                  <div style={{ fontSize: 10, color: T.dark400, marginBottom: 4 }}>下限</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: T.accentCyan, fontFamily: 'monospace' }}>{p.range_min_pct?.toFixed(1)}%</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: T.dark400, marginBottom: 4 }}>上限</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: T.accentCyan, fontFamily: 'monospace' }}>{p.range_max_pct?.toFixed(1)}%</div>
                </div>
              </div>
            </div>
            {/* Risk Params */}
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 11, color: T.accentGreen, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>风控</div>
              <div style={{ display: 'flex', gap: 32 }}>
                <div>
                  <div style={{ fontSize: 10, color: T.dark400, marginBottom: 4 }}>止盈</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: T.accentGreen, fontFamily: 'monospace' }}>{fmtPct(p.take_profit_pct)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: T.dark400, marginBottom: 4 }}>止损</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: T.accentRed, fontFamily: 'monospace' }}>{fmtPct(p.stop_loss_pct)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: T.dark400, marginBottom: 4 }}>仓位</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: T.accentOrange, fontFamily: 'monospace' }}>{fmtPct(p.trade_ratio)}</div>
                </div>
              </div>
            </div>
            {/* Liquidity */}
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 11, color: T.accentGreen, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>流动性门槛</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: T.accentGreen, fontFamily: 'monospace' }}>{p.min_liquidity_k ? fmtNum(p.min_liquidity_k) + 'K' : '—'}</div>
              <div style={{ fontSize: 11, color: T.dark400, marginTop: 4 }}>低于此门槛不交易</div>
            </div>
          </div>
        </div>
      )}

      {/* Learning Rules */}
      {paramTab === 'rules' && (
        <div style={{ ...cardBase, padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h3 style={{ ...sectionTitle, marginBottom: 0 }}><Award size={14} color={T.accentGreen} /> 自动学习规则</h3>
            <span style={{ fontSize: 12, color: T.dark400 }}>{rules.length} 条规则</span>
          </div>
          {rules.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <Award size={48} color={T.dark500} style={{ opacity: 0.3, marginBottom: 12 }} />
              <p style={{ fontSize: 14, color: T.dark400 }}>暂无已学习规则</p>
              <p style={{ fontSize: 12, color: T.dark500, marginTop: 6 }}>系统需要积累更多交易数据后自动生成</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {rules.map((r: any, i: number) => (
                <div key={i} style={{
                  background: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: '18px 20px',
                  borderLeft: '4px solid ' + (r.action === 'BUY' ? T.accentGreen : T.accentRed),
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <span style={{
                      padding: '3px 14px', borderRadius: 100, fontSize: 12, fontWeight: 700,
                      background: r.action === 'BUY' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                      color: r.action === 'BUY' ? T.accentGreen : T.accentRed,
                    }}>#{i + 1} {r.action === 'BUY' ? '✅ 买入' : '⛔ 观望'}</span>
                    {r.expected_win_rate != null && (
                      <span style={{ fontSize: 12, color: T.dark400 }}>
                        预期胜率 <strong style={{ color: T.accentOrange }}>{fmtPct(r.expected_win_rate, 0)}</strong>
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 13, color: T.dark200, lineHeight: 1.6, marginBottom: 10 }}>{r.reason}</p>
                  <code style={{
                    display: 'inline-block', padding: '4px 12px', borderRadius: 8,
                    background: 'rgba(0,0,0,0.3)', fontSize: 11, color: T.accentCyan,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>{r.condition}</code>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Learning History */}
      {paramTab === 'history' && (
        <div style={{ ...cardBase, padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h3 style={{ ...sectionTitle, marginBottom: 0 }}><Clock size={14} color={T.accentOrange} /> 学习历程</h3>
            <span style={{ fontSize: 12, color: T.dark400 }}>{history.length} 次</span>
          </div>
          {history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <Clock size={48} color={T.dark500} style={{ opacity: 0.3, marginBottom: 12 }} />
              <p style={{ fontSize: 14, color: T.dark400 }}>暂无学习历史</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '12px 14px', color: T.dark400, fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>轮次</th>
                    <th style={{ textAlign: 'center', padding: '12px 14px', color: T.dark400, fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>评分</th>
                    <th style={{ textAlign: 'right', padding: '12px 14px', color: T.dark400, fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>经验数</th>
                    <th style={{ textAlign: 'right', padding: '12px 14px', color: T.dark400, fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>时间</th>
                  </tr>
                </thead>
                <tbody>
                  {history.slice().reverse().map((h: any, i: number) => {
                    const score = h.score ?? 0;
                    return (
                      <tr key={h.id || i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding: '12px 14px', color: T.dark300, fontWeight: 500 }}>#{history.length - i}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          <span style={{
                            padding: '3px 12px', borderRadius: 100, fontSize: 12, fontWeight: 600,
                            background: scoreBg(score), color: scoreColor(score),
                          }}>{fmtPct(score, 1)}</span>
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', color: T.dark200, fontWeight: 500, fontFamily: 'monospace' }}>{h.experience_count ?? '—'}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', color: T.dark500, fontSize: 11 }}>{fmtTime(h.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
