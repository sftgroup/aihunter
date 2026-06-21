import { useState, useEffect } from 'react';
import { Server, Database, Activity, Cpu, Wifi, TrendingUp, Layers, Brain, Search } from 'lucide-react';
import { systemApi, learningApi, aiApi } from '../utils/api';
import type { SystemStatus, LearningHistory } from '../types/api';
import * as echarts from 'echarts';
import AiSentimentPanel from '../components/AiSentimentPanel';
import SmartMoneyPanel from '../components/SmartMoneyPanel';



type AiTab = 'sentiment' | 'smart-money';

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
  const [aiConfig, setAiConfig] = useState<Record<string, string>>({});
  const [aiTab, setAiTab] = useState<AiTab>('sentiment');

  useEffect(() => {
    loadStatus();
    loadLearning();
    loadAiConfig();
    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadStatus() {
    const res = await systemApi.getStatus();
    if (res.code === 200 && res.data) setStatus(res.data);
  }

  async function loadLearning() {
    const res = await learningApi.getHistory('signal_follow', 50);
    if (res.code === 200 && res.data) {
      setLearning(res.data);
      setTimeout(() => renderLearnChart(res.data), 200);
    }
  }

  async function loadAiConfig() {
    const res = await aiApi.getConfig();
    if (res.code === 200 && res.data) setAiConfig(res.data);
  }

  function renderLearnChart(data: LearningHistory[] | undefined) {
    try {
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
    } catch (e) {
      console.error('学习图表渲染失败', e);
    }
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
          服务状态 · 统计数据 · AI 学习进度 · 分析工具
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
              <div key={svc.key} className="card" style={{ padding: 16 }}>
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
            <div className="card" style={{ padding: 16 }}>
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
            { label: '模拟盈亏', value: status ? `$${parseFloat(status.paper_pnl || '0').toFixed(2)}` : '-', icon: TrendingUp, color: 'var(--accent-blue)' },
            { label: 'RPC 在线', value: status ? `${status.chain_online ?? 0}/${status.chain_count ?? 0}` : '-', icon: Wifi, color: 'var(--accent-cyan)' },
            { label: '经验数', value: status?.recent_experiences ?? '-', icon: Cpu, color: 'var(--accent-purple)' },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="card" style={{ padding: 14 }}>
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

      {/* AI Analysis Tools */}
      <div>
        <h3 style={{
          fontSize: 12, fontWeight: 600, color: 'var(--dark-400)',
          textTransform: 'uppercase', letterSpacing: '0.05em',
          paddingLeft: 4, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Brain size={14} /> AI 分析工具
        </h3>

        {/* Tab bar */}
        <div style={{
          display: 'flex', gap: 8, marginBottom: 12,
        }}>
          {[
            { key: 'sentiment' as AiTab, label: '情绪分析', icon: Brain, desc: '推文/社交媒体情绪' },
            { key: 'smart-money' as AiTab, label: '聪明钱', icon: Search, desc: '钱包地址智能分析' },
          ].map((tab) => {
            const isActive = aiTab === tab.key;
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setAiTab(tab.key)}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 14px', borderRadius: 10,
                  background: isActive ? 'rgba(99,102,241,0.1)' : 'transparent',
                  border: isActive ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent',
                  color: isActive ? 'var(--accent)' : 'var(--dark-300)',
                  cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left' as const,
                }}
              >
                <Icon size={16} />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500 }}>{tab.label}</p>
                  <p style={{ fontSize: 10, color: 'var(--dark-400)', marginTop: 2 }}>{tab.desc}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* AI Config Status */}
        <div style={{
          padding: '8px 12px', marginBottom: 12, borderRadius: 8,
          background: aiConfig['ai.api_key'] ? 'rgba(16,185,129,0.05)' : 'rgba(245,158,11,0.05)',
          border: `1px solid ${aiConfig['ai.api_key'] ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)'}`,
          fontSize: 11, color: aiConfig['ai.api_key'] ? 'var(--accent-green)' : 'var(--accent-orange)',
        }}>
          {aiConfig['ai.api_key']
            ? `✅ AI 已配置 (${aiConfig['ai.provider'] || 'deepseek'})`
            : '⚠️ 未配置 AI API Key，请在「配置」页面设置'}
        </div>

        {/* Content */}
        <div className="gradient-border" style={{ padding: 16 }}>
          {aiTab === 'sentiment' ? (
            <AiSentimentPanel aiConfig={aiConfig} />
          ) : (
            <SmartMoneyPanel aiConfig={aiConfig} />
          )}
        </div>
      </div>
    </div>
  );
}
