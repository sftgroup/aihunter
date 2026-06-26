import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Activity, BrainCircuit, TrendingUp, Zap, RefreshCw, AlertTriangle, ArrowUp, ArrowDown } from 'lucide-react';
import { signalApiV3, learningApiV3 } from '../utils/api';

const T = {
  accent: '#6366f1', accentGreen: '#10b981', accentRed: '#ef4444',
  accentBlue: '#3b82f6', accentPurple: '#8b5cf6', accentOrange: '#f59e0b',
  dark50: '#f0f0f0', dark100: '#e0e0e0', dark200: '#c0c0c0', dark300: '#a0a0a0',
  dark400: '#808080', dark500: '#606060', dark600: '#404040', dark700: '#2a2a2a',
  dark800: '#1a1a1a', dark900: '#111111', dark950: '#0a0a0a',
};

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
        background: active ? 'rgba(99,102,241,0.15)' : 'transparent',
        color: active ? T.accent : T.dark400,
        border: active ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
        cursor: 'pointer', transition: 'all 0.2s',
        display: 'flex', alignItems: 'center', gap: 6,
      }}
    >{children}</button>
  );
}

function fmtTime(ts: string) {
  try { return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch { return ts; }
}

function ScoreBadge({ score }: { score?: number }) {
  const s = score ?? 0;
  const color = s >= 80 ? T.accentGreen : s >= 60 ? T.accentOrange : s >= 40 ? T.dark300 : T.accentRed;
  const bg = s >= 80 ? 'rgba(16,185,129,0.12)' : s >= 60 ? 'rgba(245,158,11,0.12)' : s >= 40 ? 'rgba(255,255,255,0.04)' : 'rgba(239,68,68,0.12)';
  return (
    <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: bg, color, fontFamily: 'monospace' }}>{s}</span>
  );
}

function MetricBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ fontSize: 10, color: T.dark400, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

export default function MomentumDetailPage() {
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'learning' ? 'learning' : 'signals';
  const [activeTab, setActiveTab] = useState<'signals' | 'learning'>(initialTab);
  const [signals, setSignals] = useState<any[]>([]);
  const [learningReport, setLearningReport] = useState<any>(null);
  const [loadingSignals, setLoadingSignals] = useState(true);
  const [loadingReport, setLoadingReport] = useState(true);
  const [triggering, setTriggering] = useState(false);

  useEffect(() => {
    (async () => {
      setLoadingSignals(true);
      try {
        const res = await signalApiV3.getByStrategy('momentum');
        if (res && (res as any).code === 200 && (res as any).data) {
          setSignals((res as any).data?.signals || (Array.isArray((res as any).data) ? (res as any).data : []));
        }
      } catch (e) { console.error(e); }
      setLoadingSignals(false);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setLoadingReport(true);
      try {
        const res = await learningApiV3.getReport('momentum');
        if (res && (res as any).code === 200 && (res as any).data) {
          setLearningReport((res as any).data);
        }
      } catch (e) { console.error(e); }
      setLoadingReport(false);
    })();
  }, []);

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      await learningApiV3.trigger('momentum');
      setTimeout(async () => {
        const res = await learningApiV3.getReport('momentum');
        if (res && (res as any).code === 200 && (res as any).data) {
          setLearningReport((res as any).data);
        }
        setTriggering(false);
      }, 2000);
    } catch (e) { console.error(e); setTriggering(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'white' }}>动量突破</h1>
          <p style={{ fontSize: 14, color: T.dark400, marginTop: 4 }}>箱型震荡 + 放量突破检测 · 实时信号 · 自学习优化</p>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 100, background: 'rgba(16,185,129,0.1)', color: T.accentGreen, fontSize: 11, fontWeight: 600 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.accentGreen }} />
          已开启
        </span>
      </div>

      <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 4, width: 'fit-content' }}>
        <TabBtn active={activeTab === 'signals'} onClick={() => setActiveTab('signals')}><Activity size={14} /> 实时信号流</TabBtn>
        <TabBtn active={activeTab === 'learning'} onClick={() => setActiveTab('learning')}><BrainCircuit size={14} /> 自主学习</TabBtn>
      </div>

      {activeTab === 'signals' && (
        <div style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 16, padding: 20 }}>
          <h3 style={{ fontSize: 12, fontWeight: 600, color: T.dark400, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={14} color={T.accentGreen} /> 实时信号流
            <span style={{ marginLeft: 'auto', fontWeight: 400, fontSize: 11, textTransform: 'none', color: T.dark500 }}>{signals.length > 0 ? signals.length + ' 条信号' : ''}</span>
          </h3>
          {loadingSignals ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}><RefreshCw size={24} color={T.dark500} style={{ margin: '0 auto 8px', opacity: 0.3 }} /><p style={{ fontSize: 13, color: T.dark400 }}>加载中...</p></div>
          ) : signals.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}><Activity size={36} color={T.dark500} style={{ margin: '0 auto 8px', opacity: 0.3 }} /><p style={{ fontSize: 13, color: T.dark400 }}>暂无信号数据</p><p style={{ fontSize: 11, color: T.dark500, marginTop: 4 }}>开启实盘后将收到实时信号</p></div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr>
                  <th style={{ textAlign: 'left', padding: '10px 12px', color: T.dark400, fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>时间</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', color: T.dark400, fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>链</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', color: T.dark400, fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>代币</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', color: T.dark400, fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>方向</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px', color: T.dark400, fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>评分</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px', color: T.dark400, fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>置信度</th>
                </tr></thead>
                <tbody>
                  {signals.map((s: any, i: number) => {
                    const isBuy = (s.direction || s.side) === 'BUY';
                    return (
                      <tr key={s.id || i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: T.dark400 }}>{fmtTime(s.time || s.created_at || s.createdAt || '')}</td>
                        <td style={{ padding: '10px 12px' }}><span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: 'rgba(99,102,241,0.15)', color: T.accent }}>{s.chain || 'ETH'}</span></td>
                        <td style={{ padding: '10px 12px', fontWeight: 600, color: 'white' }}>{s.symbol || s.token || '—'}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: isBuy ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: isBuy ? T.accentGreen : T.accentRed }}>
                            {isBuy ? <ArrowUp size={12} /> : <ArrowDown size={12} />}{s.direction || s.side || '—'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}><ScoreBadge score={s.score} /></td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', color: 'white' }}>{s.confidence != null ? s.confidence + '%' : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'learning' && (
        <div style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 16, padding: 20 }}>
          <h3 style={{ fontSize: 12, fontWeight: 600, color: T.dark400, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <BrainCircuit size={14} color={T.accentPurple} /> 自学习报告
          </h3>
          {loadingReport ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}><RefreshCw size={24} color={T.dark500} /><p style={{ fontSize: 13, color: T.dark400, marginTop: 8 }}>加载中...</p></div>
          ) : learningReport ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                <MetricBox label="学习版本" value={String(learningReport.version ?? '-')} color={T.accent} />
                <MetricBox label="经验条数" value={String(learningReport.experience_count ?? '-')} color={T.accentGreen} />
                <MetricBox label="最佳分数" value={String(learningReport.best_score ?? '-')} color={T.accentPurple} />
                <MetricBox label="总训练轮次" value={String(learningReport.total_epochs ?? '-')} color={T.accentBlue} />
              </div>
              {learningReport.best_params && Object.keys(learningReport.best_params).length > 0 && (
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 14 }}>
                  <h4 style={{ fontSize: 12, fontWeight: 600, color: T.accent, marginBottom: 8 }}>Optuna 最佳参数</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                    {Object.entries(learningReport.best_params).map(([k, v]) => (
                      <div key={k} style={{ padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)' }}>
                        <div style={{ fontSize: 10, color: T.dark400 }}>{k}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'white', fontFamily: 'monospace' }}>{String(v)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {learningReport.deepseek_rules && (
                <div style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: 12, padding: 14 }}>
                  <h4 style={{ fontSize: 12, fontWeight: 600, color: T.accentPurple, marginBottom: 8 }}>DeepSeek 规则</h4>
                  <ul style={{ paddingLeft: 16 }}>
                    {(Array.isArray(learningReport.deepseek_rules) ? learningReport.deepseek_rules : [learningReport.deepseek_rules]).map((rule: string, i: number) => (
                      <li key={i} style={{ fontSize: 12, color: T.dark300, marginBottom: 4 }}>{rule}</li>
                    ))}
                  </ul>
                </div>
              )}
              <button onClick={handleTrigger} disabled={triggering}
                style={{ padding: '10px 24px', borderRadius: 10, background: triggering ? 'rgba(99,102,241,0.3)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: triggering ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, width: 'fit-content' }}>
                <Zap size={14} />{triggering ? '学习中...' : '触发学习'}
              </button>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <BrainCircuit size={36} color={T.dark500} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
              <p style={{ fontSize: 13, color: T.dark400 }}>暂无学习报告</p>
              <button onClick={handleTrigger} disabled={triggering}
                style={{ marginTop: 16, padding: '10px 24px', borderRadius: 10, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                <Zap size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />开始首次学习
              </button>
            </div>
          )}
        </div>
      )}

      <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: T.dark300 }}>
        <AlertTriangle size={14} color={T.accentOrange} />
        <span>交易控制在 <Link to="/live" style={{ color: T.accent, fontWeight: 600 }}>/live</Link> 页面操作</span>
      </div>
    </div>
  );
}
