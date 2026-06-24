import { useState, useEffect } from 'react';
import { Server, Database, Activity, Cpu, Wifi, TrendingUp, Layers, Brain, BarChart3 } from 'lucide-react';
import { systemApi } from '../utils/api';

const card = {
  background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
  backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 16, padding: 16,
};

const col = { healthy: '#10b981', idle: '#f59e0b', down: '#ef4444' };
const lbl = { healthy: '正常', idle: '空闲', down: '异常' };

function StatusDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      <span style={{ fontSize: 12, color }}>{label}</span>
    </div>
  );
}

function fmtTime(t: string | null) {
  if (!t) return '-';
  const d = new Date(t);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return `${diff}秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  return `${Math.floor(diff / 3600)}小时前`;
}

export default function SystemPage() {
  const [status, setStatus] = useState<any>(null);

  useEffect(() => {
    const load = () => systemApi.getStatus().then(r => { if (r.code === 200 && r.data) setStatus(r.data); }).catch(() => {});
    load();
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, []);

  const svc = status ? [
    { k: 'gateway', label: 'Gateway', icon: Server, s: status.gateway?.status },
    { k: 'redis', label: 'Redis', icon: Database, s: status.redis?.status },
    { k: 'postgresql', label: 'PostgreSQL', icon: Database, s: status.postgresql?.status },
    { k: 'v2_engine', label: 'V2 引擎', icon: TrendingUp, s: status.v2_engine?.status },
  ] : [];

  const dc = status?.data_collection;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'white' }}>系统</h1>
        <p style={{ fontSize: 14, color: '#808080', marginTop: 4 }}>服务状态 · 数据采集 · 自学习</p>
      </div>

      {/* 服务状态 */}
      <div>
        <h3 style={{ fontSize: 12, fontWeight: 600, color: '#808080', textTransform: 'uppercase', paddingLeft: 4, marginBottom: 12 }}>服务状态</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {svc.map((x: any) => {
            const Icon = x.icon;
            const c = col[x.s as keyof typeof col] || '#808080';
            const l = lbl[x.s as keyof typeof lbl] || x.s;
            return (
              <div key={x.k} style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <Icon size={18} color={c} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'white' }}>{x.label}</span>
                </div>
                <StatusDot color={c} label={l} />
              </div>
            );
          })}
        </div>
      </div>

      {/* 数据采集 */}
      <div>
        <h3 style={{ fontSize: 12, fontWeight: 600, color: '#808080', textTransform: 'uppercase', paddingLeft: 4, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <BarChart3 size={14} /> 数据采集
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Database size={14} color="#6366f1" />
              <p style={{ fontSize: 10, color: '#808080' }}>价格数据</p>
            </div>
            <p style={{ fontSize: 20, fontWeight: 700, color: 'white' }}>{dc?.price_count?.toLocaleString() || '-'}</p>
            <p style={{ fontSize: 10, color: '#808080', marginTop: 4 }}>最后更新: {fmtTime(dc?.price_last_update)}</p>
          </div>
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <BarChart3 size={14} color="#8b5cf6" />
              <p style={{ fontSize: 10, color: '#808080' }}>K线数据</p>
            </div>
            <p style={{ fontSize: 20, fontWeight: 700, color: 'white' }}>{dc?.candle_count?.toLocaleString() || '-'}</p>
            <p style={{ fontSize: 10, color: '#808080', marginTop: 4 }}>最后更新: {fmtTime(dc?.candle_last_update)}</p>
          </div>
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Brain size={14} color="#06b6d4" />
              <p style={{ fontSize: 10, color: '#808080' }}>自学习</p>
            </div>
            <p style={{ fontSize: 20, fontWeight: 700, color: 'white' }}>{dc?.learn_count || '-'}</p>
            <p style={{ fontSize: 10, color: '#808080', marginTop: 4 }}>最后学习: {fmtTime(dc?.learn_last_update)}</p>
          </div>
        </div>
      </div>

      {/* 统计信息 */}
      <div>
        <h3 style={{ fontSize: 12, fontWeight: 600, color: '#808080', textTransform: 'uppercase', paddingLeft: 4, marginBottom: 12 }}>统计信息</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
          {[
            { label: '总事件', value: status?.total_events ?? '-', icon: Activity, color: '#6366f1' },
            { label: '待处理', value: status?.pending_events ?? '-', icon: Layers, color: '#f59e0b' },
            { label: '持仓数', value: status?.open_positions ?? '-', icon: TrendingUp, color: '#10b981' },
            { label: 'RPC 在线', value: status ? (status.chain_online || 0) + '/' + (status.chain_count || 0) : '-', icon: Wifi, color: '#06b6d4' },
          ].map(s => {
            const Icon = s.icon;
            return (
              <div key={s.label} style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Icon size={14} color={s.color} />
                  <p style={{ fontSize: 10, color: '#808080' }}>{s.label}</p>
                </div>
                <p style={{ fontSize: 20, fontWeight: 700, color: 'white' }}>{s.value}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 模拟交易 */}
      {status?.paper_trading && (
        <div>
          <h3 style={{ fontSize: 12, fontWeight: 600, color: '#808080', textTransform: 'uppercase', paddingLeft: 4, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={14} /> 模拟交易
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
            {[
              { label: '总交易', value: status.paper_trading.total_trades, icon: Activity, color: '#6366f1' },
              { label: '胜', value: status.paper_trading.wins, icon: TrendingUp, color: '#10b981' },
              { label: '累计盈亏', value: '$' + (status.paper_trading.total_pnl || 0).toFixed(2), icon: TrendingUp, color: status.paper_trading.total_pnl >= 0 ? '#10b981' : '#ef4444' },
              { label: '当前持仓', value: status.paper_trading.open_positions, icon: Layers, color: '#06b6d4' },
            ].map(s => (
              <div key={s.label} style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <s.icon size={14} color={s.color} />
                  <p style={{ fontSize: 10, color: '#808080' }}>{s.label}</p>
                </div>
                <p style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
