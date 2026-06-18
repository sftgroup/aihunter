import { useState, useEffect } from 'react';
import { Server, Database, Activity, Cpu, Wifi, TrendingUp, Layers } from 'lucide-react';
import { systemApi } from '../utils/api';

export default function SystemPage() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    systemApi.getStatus().then(r => { if (r.code === 200 && r.data) setStatus(r.data); }).catch(() => {});
    const iv = setInterval(() => {
      systemApi.getStatus().then(r => { if (r.code === 200 && r.data) setStatus(r.data); }).catch(() => {});
    }, 5000);
    return () => clearInterval(iv);
  }, []);

  const card = { background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 16, padding: 16 };
  const col = { healthy: '#10b981', idle: '#f59e0b', down: '#ef4444' };
  const lbl = { healthy: '正常', idle: '空闲', down: '异常' };

  const svc = status ? [
    { k: 'gateway', label: 'Gateway', icon: Server, s: status.gateway?.status },
    { k: 'redis', label: 'Redis', icon: Database, s: status.redis?.status },
    { k: 'postgresql', label: 'PostgreSQL', icon: Database, s: status.postgresql?.status },
    { k: 'evm_worker', label: 'EVM Worker', icon: Cpu, s: status.evm_worker?.status },
    { k: 'sol_worker', label: 'SOL Worker', icon: Cpu, s: status.sol_worker?.status },
  ] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'white' }}>系统</h1>
        <p style={{ fontSize: 14, color: '#808080', marginTop: 4 }}>服务状态 · 统计信息</p>
      </div>
      <div>
        <h3 style={{ fontSize: 12, fontWeight: 600, color: '#808080', textTransform: 'uppercase', paddingLeft: 4, marginBottom: 12 }}>服务状态</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {svc.map(x => {
            const Icon = x.icon;
            const c = col[x.s] || '#808080';
            const l = lbl[x.s] || x.s;
            return (
              <div key={x.k} style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <Icon size={18} color={c} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'white' }}>{x.label}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />
                  <span style={{ fontSize: 12, color: c }}>{l}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <h3 style={{ fontSize: 12, fontWeight: 600, color: '#808080', textTransform: 'uppercase', paddingLeft: 4, marginBottom: 12 }}>统计信息</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
          {[
            { label: '总事件', value: status?.total_events ?? '-', icon: Activity, color: 'var(--accent)' },
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
    </div>
  );
}
