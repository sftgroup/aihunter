import { useState, useEffect } from 'react';
import { Brain, TrendingUp, RefreshCw, Award, BarChart3, Activity, Target, Shield, Clock, Sparkles, ArrowUp, ArrowDown } from 'lucide-react';
import { learningApi } from '../../utils/api';

// ===== 样式常量 =====
const card: React.CSSProperties = {
  background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
  backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
  padding: 20,
};

const label: React.CSSProperties = { fontSize: 10, color: '#808080', marginBottom: 4 };

// ===== 工具函数 =====
function fmtPct(v: number | undefined | null, d = 1): string {
  if (v === null || v === undefined) return '-';
  return (v * 100).toFixed(d) + '%';
}

function fmtNum(v: number | undefined | null, d = 1): string {
  if (v === null || v === undefined) return '-';
  if (v >= 1e6) return (v / 1e6).toFixed(d) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(d) + 'K';
  return v.toFixed(d);
}

function fmtTime(t: string | undefined | null): string {
  if (!t) return '-';
  const d = new Date(t);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hour = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${month}-${day} ${hour}:${min}`;
}

// ===== 评分徽章 =====
function ScoreBadge({ score, size = 'md' }: { score: number | null | undefined; size?: 'sm' | 'md' | 'lg' }) {
  const s = score ?? 0;
  const color = s >= 0.7 ? '#10b981' : s >= 0.4 ? '#f59e0b' : '#ef4444';
  const bg = s >= 0.7 ? 'rgba(16,185,129,0.1)' : s >= 0.4 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)';
  const px = size === 'sm' ? '4px 10px' : size === 'lg' ? '8px 20px' : '6px 14px';
  const fs = size === 'sm' ? 11 : size === 'lg' ? 18 : 14;
  return (
    <span style={{ padding: px, borderRadius: 100, background: bg, color, fontSize: fs, fontWeight: 700 }}>
      {fmtPct(s, 1)}
    </span>
  );
}

// ===== 主组件 =====
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
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
        <div style={{ textAlign: 'center' }}>
          <Brain size={40} color="#6366f1" style={{ opacity: 0.3, marginBottom: 16 }} />
          <p style={{ color: '#808080', fontSize: 13 }}>加载学习参数...</p>
        </div>
      </div>
    );
  }

  const p = params?.params || {};
  const rules = params?.rules || [];
  const expCount = params?.experience_count || 0;
  const lastScore = history.length > 0 ? history[history.length - 1]?.score : null;
  // scoreHistory unused

  const paramItems = [
    { label: '最低评分', value: p.min_score, icon: Target, color: '#6366f1', desc: '低于此分的信号跳过' },
    { label: '最少K线', value: p.min_hourly_bars, icon: BarChart3, color: '#8b5cf6', desc: '小时K线数量' },
    { label: '震荡下限', value: p.range_min_pct ? p.range_min_pct.toFixed(1) + '%' : '-', icon: ArrowDown, color: '#06b6d4', desc: '价格波动下限' },
    { label: '震荡上限', value: p.range_max_pct ? p.range_max_pct.toFixed(1) + '%' : '-', icon: ArrowUp, color: '#06b6d4', desc: '价格波动上限' },
    { label: '最小流动性', value: p.min_liquidity_k ? fmtNum(p.min_liquidity_k) + 'K' : '-', icon: Shield, color: '#10b981', desc: '低于此流动不交易' },
    { label: '止盈', value: p.take_profit_pct ? fmtPct(p.take_profit_pct) : '-', icon: TrendingUp, color: '#10b981', desc: '盈利目标' },
    { label: '止损', value: p.stop_loss_pct ? fmtPct(p.stop_loss_pct) : '-', icon: TrendingUp, color: '#ef4444', desc: '亏损上限' },
    { label: '仓位比例', value: p.trade_ratio ? fmtPct(p.trade_ratio) : '-', icon: Activity, color: '#f59e0b', desc: '单笔仓位占比' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={16} color="white" />
          </div>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'white' }}>自动学习</span>
          <span style={{ fontSize: 11, color: '#808080', marginLeft: 8 }}>{expCount} 次经验</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {lastScore !== null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: '#808080' }}>当前评分</span>
              <ScoreBadge score={lastScore} />
            </div>
          )}
          <button onClick={handleRefresh} disabled={refreshing}
            style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: refreshing ? '#808080' : '#ccc', cursor: refreshing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            <RefreshCw size={12} style={refreshing ? { animation: 'spin 0.8s linear infinite' } : {}} /> 刷新
          </button>
        </div>
      </div>

      {/* 参数值卡片网格 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
        {paramItems.map(item => {
          const Icon = item.icon;
          return (
            <div key={item.label} style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Icon size={12} color={item.color} />
                <span style={label}>{item.label}</span>
              </div>
              <p style={{ fontSize: 20, fontWeight: 700, color: item.color, marginBottom: 2 }}>{item.value}</p>
              <p style={{ fontSize: 9, color: '#606060' }}>{item.desc}</p>
            </div>
          );
        })}
      </div>

      {/* Tab 切换 */}
      <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 3 }}>
        {[
          { key: 'current', label: '当前参数', icon: Brain },
          { key: 'rules', label: '学习规则', icon: Award },
          { key: 'history', label: '学习历程', icon: Clock },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = paramTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setParamTab(tab.key as any)}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '8px 12px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 500,
                background: isActive ? 'rgba(99,102,241,0.15)' : 'transparent',
                color: isActive ? '#818cf8' : '#808080',
                cursor: 'pointer',
              }}>
              <Icon size={13} />{tab.label}
            </button>
          );
        })}
      </div>

      {/* 当前参数详情 */}
      {paramTab === 'current' && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Brain size={16} color="#6366f1" />
            <span style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>参数详情</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 12 }}>
              <p style={{ fontSize: 9, color: '#808080', marginBottom: 4 }}>信号筛选</p>
              <div style={{ display: 'flex', gap: 16 }}>
                <div><span style={{ fontSize: 10, color: '#606060' }}>最低评分 </span><span style={{ fontSize: 14, fontWeight: 600, color: '#6366f1' }}>{p.min_score ?? '-'}</span></div>
                <div><span style={{ fontSize: 10, color: '#606060' }}>最少K线 </span><span style={{ fontSize: 14, fontWeight: 600, color: '#8b5cf6' }}>{p.min_hourly_bars ?? '-'}</span></div>
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 12 }}>
              <p style={{ fontSize: 9, color: '#808080', marginBottom: 4 }}>震荡区间</p>
              <div style={{ display: 'flex', gap: 16 }}>
                <div><span style={{ fontSize: 10, color: '#606060' }}>下限 </span><span style={{ fontSize: 14, fontWeight: 600, color: '#06b6d4' }}>{p.range_min_pct?.toFixed(1)}%</span></div>
                <div><span style={{ fontSize: 10, color: '#606060' }}>上限 </span><span style={{ fontSize: 14, fontWeight: 600, color: '#06b6d4' }}>{p.range_max_pct?.toFixed(1)}%</span></div>
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 12 }}>
              <p style={{ fontSize: 9, color: '#808080', marginBottom: 4 }}>风控</p>
              <div style={{ display: 'flex', gap: 16 }}>
                <div><span style={{ fontSize: 10, color: '#606060' }}>止盈 </span><span style={{ fontSize: 14, fontWeight: 600, color: '#10b981' }}>{fmtPct(p.take_profit_pct)}</span></div>
                <div><span style={{ fontSize: 10, color: '#606060' }}>止损 </span><span style={{ fontSize: 14, fontWeight: 600, color: '#ef4444' }}>{fmtPct(p.stop_loss_pct)}</span></div>
                <div><span style={{ fontSize: 10, color: '#606060' }}>仓位 </span><span style={{ fontSize: 14, fontWeight: 600, color: '#f59e0b' }}>{fmtPct(p.trade_ratio)}</span></div>
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 12 }}>
              <p style={{ fontSize: 9, color: '#808080', marginBottom: 4 }}>流动性门槛</p>
              <p style={{ fontSize: 20, fontWeight: 700, color: '#10b981' }}>{p.min_liquidity_k ? fmtNum(p.min_liquidity_k) + 'K' : '-'}</p>
            </div>
          </div>
        </div>
      )}

      {/* 学习规则 */}
      {paramTab === 'rules' && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Award size={16} color="#10b981" />
            <span style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>自动学习规则</span>
            <span style={{ fontSize: 11, color: '#808080', marginLeft: 'auto' }}>{rules.length} 条</span>
          </div>
          {rules.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32 }}>
              <Award size={32} color="#808080" style={{ opacity: 0.3, marginBottom: 12 }} />
              <p style={{ fontSize: 12, color: '#808080' }}>暂无已学习规则</p>
              <p style={{ fontSize: 11, color: '#606060', marginTop: 4 }}>系统需要积累更多交易数据后自动生成</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rules.map((r: any, i: number) => (
                <div key={i} style={{
                  background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 14,
                  borderLeft: `3px solid ${r.action === 'BUY' ? '#10b981' : '#ef4444'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{
                      padding: '2px 10px', borderRadius: 100, fontSize: 10, fontWeight: 600,
                      background: r.action === 'BUY' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                      color: r.action === 'BUY' ? '#10b981' : '#ef4444',
                    }}>#{i + 1} {r.action === 'BUY' ? '✅ 买入' : '⛔ 观望'}</span>
                    {r.expected_win_rate && (
                      <span style={{ fontSize: 10, color: '#808080' }}>
                        预期胜率 <strong style={{ color: '#f59e0b' }}>{fmtPct(r.expected_win_rate, 0)}</strong>
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 12, color: '#ccc', lineHeight: 1.5, marginBottom: 6 }}>{r.reason}</p>
                  <code style={{
                    display: 'inline-block', padding: '3px 8px', borderRadius: 6,
                    background: 'rgba(0,0,0,0.3)', fontSize: 10, color: '#06b6d4',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>{r.condition}</code>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 学习历程 */}
      {paramTab === 'history' && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Clock size={16} color="#f59e0b" />
            <span style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>学习历程</span>
            <span style={{ fontSize: 11, color: '#808080', marginLeft: 'auto' }}>{history.length} 次</span>
          </div>
          {history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32 }}>
              <Clock size={32} color="#808080" style={{ opacity: 0.3, marginBottom: 12 }} />
              <p style={{ fontSize: 12, color: '#808080' }}>暂无学习历史</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '8px 10px', color: '#808080', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>轮次</th>
                    <th style={{ textAlign: 'center', padding: '8px 10px', color: '#808080', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>评分</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', color: '#808080', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>经验数</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', color: '#808080', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>时间</th>
                  </tr>
                </thead>
                <tbody>
                  {history.slice().reverse().map((h: any, i: number) => {
                    const score = h.score ?? 0;
                    const scoreColor = score >= 0.7 ? '#10b981' : score >= 0.4 ? '#f59e0b' : '#ef4444';
                    return (
                      <tr key={h.id || i} style={{ transition: 'background 0.2s' }}>
                        <td style={{ padding: '8px 10px', color: '#808080', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>#{history.length - i}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                          <span style={{
                            padding: '2px 8px', borderRadius: 100, fontSize: 10, fontWeight: 600,
                            background: score >= 0.7 ? 'rgba(16,185,129,0.1)' : score >= 0.4 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
                            color: scoreColor,
                          }}>{fmtPct(score, 1)}</span>
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', color: '#ccc', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>{h.experience_count ?? '-'}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', color: '#606060', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: 10 }}>{fmtTime(h.created_at)}</td>
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
