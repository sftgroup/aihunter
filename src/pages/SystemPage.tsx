import { useState, useEffect } from 'react';
import { Server, Database, Activity, Cpu, Wifi, TrendingUp, Layers } from 'lucide-react';
import { systemApi, learningApi } from '../utils/api';
import type { SystemStatus, LearningHistory } from '../types/api';
import * as echarts from 'echarts';

const cardBase: React.CSSProperties = {
  background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
  backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
};



const statusColors: Record<string, string> = {
  healthy: '#10b981',
  idle: '#f59e0b',
  down: '#ef4444',
};

const statusLabels: Record<string, string> = {
  healthy: '正常',
  idle: '空闲',
  down: '异常',
};

export default function SystemPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [learning, setLearning] = useState<LearningHistory[]>([]);

  useEffect(() => {
    loadStatus();
    loadLearning();
    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadStatus() {
    const res = await systemApi.getStatus();
    if (res.code === 200 && res.data) setStatus(res.data);
  }

  async function loadLearning() {
    const res = await learningApi.getHistory('signal_follow', 50);
    if (res.code === 200 && res.data) { setLearning(res.data);
      setLearning(res.data);
      setTimeout(() => renderLearnChart(res.data), 200);
    }
  }

  function renderLearnChart(data: LearningHistory[] | undefined) {
    const el = document.getElementById('sysLearnChart');
    if (!el || !data || data.length < 2) return;
    const chart = echarts.init(el);
    chart.setOption({
      tooltip: {
        trigger: 'axis', textStyle: { fontSize: 10 },
        formatter: (ps: any) => {
          const h = data[ps[0].dataIndex];
          return `<b>第${ps[0].dataIndex + 1}次学习</b><br/>
                  评分: ${h.score ? (h.score * 100).toFixed(1) + '%' : '-'}<br/>
                  经验: ${h.experience_count}条`;
        },
        backgroundColor: 'rgba(26,26,46,0.9)',
        borderColor: 'rgba(255,255,255,0.1)',
      },
      grid: { left: 40, right: 8, top: 8, bottom: 16 },
      xAxis: {
        type: 'category',
        data: data.map((_, i) => `#${i + 1}`),
        axisLabel: { color: '#808080', fontSize: 9 },
        axisLine: { show: false },
      },
      yAxis: [{
        type: 'value', max: 100,
        axisLabel: { color: '#808080', fontSize: 9, formatter: '{value}%' },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
      }, {
        type: 'value',
        axisLabel: { color: '#808080', fontSize: 9 },
        splitLine: { show: false },
      }],
      series: [
        {
          name: '评分', type: 'line', smooth: true, symbol: 'diamond', symbolSize: 6,
          data: data.map((h) => h.score ? h.score * 100 : null),
          lineStyle: { color: '#6366f1', width: 2 },
          areaStyle: {
            color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(99,102,241,0.2)' },
                { offset: 1, color: 'rgba(99,102,241,0)' },
              ] },
          },
        },
        {
          name: '经验数', type: 'bar', yAxisIndex: 1,
          data: data.map((h) => h.experience_count),
          barWidth: '40%',
          itemStyle: { color: 'rgba(99,102,241,0.3)' },
        },
      ],
    }, true);
  }

  const services = status
    ? [
      { key: 'gateway', label: 'Gateway', icon: Server, status: status.gateway?.status || 'unknown' },
      { key: 'redis', label: 'Redis', icon: Database, status: status.redis?.status || 'unknown' },
      { key: 'postgresql', label: 'PostgreSQL', icon: Database, status: status.postgresql?.status || 'unknown' },
      { key: 'evm_worker', label: 'EVM Worker', icon: Cpu, status: status.evm_worker?.status || 'idle' },
      { key: 'sol_worker', label: 'SOL Worker', icon: Cpu, status: status.sol_worker?.status || 'idle' },
    ]
    : [];



  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'white' }}>系统</h1>
        <p style={{ fontSize: 14, color: 'var(--dark-400)', marginTop: 4 }}>
          服务状态 · 统计数据 · AI 学习进度
        </p>
      </div>

      {/* Services */}
      <div>
        <h3 style={{
          fontSize: 12, fontWeight: 600, color: 'var(--dark-400)',
          textTransform: 'uppercase', letterSpacing: '0.05em',
          paddingLeft: 4, marginBottom: 12,
        }}>服务状态</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {services.map((svc) => {
            const Icon = svc.icon;
            const color = statusColors[svc.status] || '#808080';
            const label = statusLabels[svc.status] || svc.status;
            return (
              <div key={svc.key} style={{ ...cardBase, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <Icon size={18} color={color} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'white' }}>{svc.label}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: color, animation: svc.status !== 'down' ? 'pulse 2s infinite' : 'none',
                  }} />
                  <span style={{ fontSize: 12, color }}>{label}</span>
                </div>
              </div>
            );
          })}
          {!status && (
            <div style={{ ...cardBase, padding: 16 }}>
              <p style={{ color: 'var(--dark-400)', fontSize: 12 }}>加载中...</p>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div>
        <h3 style={{
          fontSize: 12, fontWeight: 600, color: 'var(--dark-400)',
          textTransform: 'uppercase', letterSpacing: '0.05em',
          paddingLeft: 4, marginBottom: 12,
        }}>统计信息</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
          {[
            { label: '总事件', value: status?.total_events ?? '-', icon: Activity, color: 'var(--accent)' },
            { label: '待处理', value: status?.pending_events ?? '-', icon: Layers, color: 'var(--accent-orange)' },
            { label: '持仓数', value: status?.open_positions ?? '-', icon: TrendingUp, color: 'var(--accent-green)' },
            { label: '模拟盈亏', value: status ? `$${status.paper_pnl?.toFixed(2) ?? '0.00'}` : '-', icon: TrendingUp, color: 'var(--accent-blue)' },
            { label: 'RPC 在线', value: status ? `${status.chain_online ?? 0}/${status.chain_count ?? 0}` : '-', icon: Wifi, color: 'var(--accent-cyan)' },
            { label: '经验数', value: status?.recent_experiences ?? '-', icon: Cpu, color: 'var(--accent-purple)' },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} style={{ ...cardBase, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Icon size={12} color={s.color} />
                  <p style={{ fontSize: 10, color: 'var(--dark-400)' }}>{s.label}</p>
                </div>
                <p style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>{s.value}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Learning Panel */}
      <div className="gradient-border" style={{ padding: 16 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'white', marginBottom: 12 }}>
          自我学习进度 — <span style={{ fontWeight: 400, color: 'var(--dark-400)' }}>Optuna 参数优化</span>
        </p>
        <div style={{ display: 'flex', gap: 24, marginBottom: 12, flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent-green)' }}>
              {learning.length > 0 ? learning[learning.length - 1].experience_count : 0}
            </span>
            <span style={{ fontSize: 11, color: 'var(--dark-400)', marginLeft: 6 }}>经验数</span>
          </div>
          <div>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>
              {learning.length > 0 ? (learning[learning.length - 1].score * 100).toFixed(1) + '%' : '-'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--dark-400)', marginLeft: 6 }}>最新评分</span>
          </div>
          <div>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'white' }}>
              {learning.length}
            </span>
            <span style={{ fontSize: 11, color: 'var(--dark-400)', marginLeft: 6 }}>学习次数</span>
          </div>
        </div>
        <div id="sysLearnChart" style={{ width: '100%', height: 140 }} />
      </div>
    </div>
  );
}
