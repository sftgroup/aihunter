import { useState } from 'react';
import { Crosshair, TrendingUp, PiggyBank } from 'lucide-react';
import NewTokenTab from './trades/NewTokenTab';
import MomentumTab from './trades/MomentumTab';
import DeFiTab from './trades/DeFiTab';

type Tab = 'new-token' | 'momentum' | 'defi';

const tabConfig: { key: Tab; label: string; icon: any; desc: string }[] = [
  { key: 'new-token', label: '新土狗', icon: Crosshair, desc: '新合约监听 + 自动交易 + 自学习' },
  { key: 'momentum', label: '动量突破', icon: TrendingUp, desc: '已上线代币扫描 + 动量策略' },
  { key: 'defi', label: 'DeFi 套利', icon: PiggyBank, desc: 'Aave利率 + 闪电贷套利' },
];

export default function TradesPage() {
  const [activeTab, setActiveTab] = useState<Tab>('new-token');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'white' }}>交易中心</h1>
        <p style={{ fontSize: 14, color: 'var(--dark-400)', marginTop: 4 }}>
          多策略自动交易 · 模拟/实盘双模式 · AI 自学习优化
        </p>
      </div>

      {/* Tab Bar */}
      <div style={{
        display: 'flex', gap: 8, padding: 4,
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 14, border: '1px solid rgba(255,255,255,0.05)',
      }}>
        {tabConfig.map((tab) => {
          const isActive = activeTab === tab.key;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', gap: 8,
                padding: '12px 16px', borderRadius: 10,
                background: isActive ? 'rgba(99,102,241,0.1)' : 'transparent',
                border: isActive ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent',
                color: isActive ? 'var(--accent)' : 'var(--dark-300)',
                cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left' as const,
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = 'transparent';
              }}
            >
              <Icon size={18} />
              <div>
                <p style={{ fontSize: 14, fontWeight: 500 }}>{tab.label}</p>
                <p style={{ fontSize: 10, color: 'var(--dark-400)', marginTop: 2 }}>{tab.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'new-token' && <NewTokenTab />}
      {activeTab === 'momentum' && <MomentumTab />}
      {activeTab === 'defi' && <DeFiTab />}
    </div>
  );
}
