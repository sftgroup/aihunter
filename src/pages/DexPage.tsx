import { useState } from 'react';
import { TrendingUp, Grid3X3 } from 'lucide-react';
import MomentumTab from './trades/MomentumTab';

const C = {
  bg: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
  br: 16,
  bd: '1px solid rgba(255,255,255,0.05)',
};

export default function DexPage() {
  const [activeTab, setActiveTab] = useState('momentum');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'white' }}>DEX 交易</h1>
        <p style={{ fontSize: 14, color: '#808080', marginTop: 4 }}>自动化交易机器人 · 实时信号 · 智能执行</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
        <div
          onClick={() => setActiveTab('momentum')}
          style={{ background: C.bg, backdropFilter: 'blur(24px)', borderRadius: C.br, border: activeTab === 'momentum' ? '1px solid rgba(99,102,241,0.3)' : C.bd, padding: '16px 20px', cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: '#6366f120', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={20} color="#6366f1" />
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: 'white' }}>动量策略</h3>
              <p style={{ fontSize: 11, color: '#808080', marginTop: 2 }}>箱型震荡 + 放量突破检测，智能捕捉趋势启动点</p>
            </div>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '3px 8px', borderRadius: 100, background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981' }} />运行中
            </span>
          </div>
        </div>

        <div style={{ background: C.bg, backdropFilter: 'blur(24px)', borderRadius: C.br, border: C.bd, padding: '16px 20px', opacity: 0.5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: '#80808020', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Grid3X3 size={20} color="#808080" />
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: 'white' }}>网格交易</h3>
              <p style={{ fontSize: 11, color: '#808080', marginTop: 2 }}>自动网格挂单，低买高卖，震荡行情利器</p>
            </div>
            <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 100, background: 'rgba(255,255,255,0.05)', color: '#808080' }}>待开放</span>
          </div>
        </div>
      </div>

      {activeTab === 'momentum' && <MomentumTab />}
    </div>
  );
}
