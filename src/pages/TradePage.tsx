import { useState, useEffect } from 'react';
import { Activity, BrainCircuit } from 'lucide-react';
import { strategyApiV3, type StrategyInfo } from '../utils/api';
import StrategyCard from '../components/StrategyCard';

const fallbackStrategies: StrategyInfo[] = [
  {
    strategy_id: 'momentum', category: 'dex', display_name: '动量突破',
    description: '箱型震荡 + 放量突破检测，智能捕捉趋势启动点',
    icon: 'trending-up', enabled: true, auto_trading: true,
    metrics: { today_signals: 23, today_trades: 5, today_pnl: 142.50 },
    route: '/trade/momentum',
  },
  {
    strategy_id: 'grid', category: 'dex', display_name: '网格交易',
    description: '自动网格挂单，低买高卖，震荡行情利器',
    icon: 'grid', enabled: false, auto_trading: false,
    metrics: { today_signals: 0, today_trades: 0, today_pnl: 0 },
    route: '/trade/grid',
  },
  {
    strategy_id: 'trend-follow', category: 'dex', display_name: '趋势跟随',
    description: 'EMA 均线交叉 + RSI 过滤，中长线趋势跟随',
    icon: 'activity', enabled: false, auto_trading: false,
    metrics: { today_signals: 0, today_trades: 0, today_pnl: 0 },
    route: '/trade/trend-follow',
  },
  {
    strategy_id: 'snekgou', category: 'dex', display_name: '新土狗检测',
    description: '链上新部署代币实时扫描，蜜罐检测 + 安全评分',
    icon: 'zap', enabled: false, auto_trading: false,
    metrics: { today_signals: 0, today_trades: 0, today_pnl: 0 },
    route: '/trade/snekgou',
  },
];

export default function TradePage() {
  const [strategies, setStrategies] = useState<StrategyInfo[]>(fallbackStrategies);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await strategyApiV3.list('dex');
        if (res && (res as any).code === 200 && (res as any).data) {
          setStrategies((res as any).data);
        }
      } catch (e) {
        console.error('Failed to load DEX strategies, using fallback:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleViewDetail = (route: string) => {
    window.location.hash = route;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'white' }}>DEX 交易</h1>
        <p style={{ fontSize: 14, color: '#808080', marginTop: 4 }}>
          自动化交易机器人 · 信号展示 · 自主学习优化
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            border: '2px solid rgba(99,102,241,0.3)', borderTopColor: '#6366f1',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 12px',
          }} />
          <p style={{ fontSize: 13, color: '#808080' }}>加载策略...</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {strategies.map((s) => (
            <StrategyCard
              key={s.strategy_id}
              strategy={s}
              onViewDetail={handleViewDetail}
              disabled={!s.enabled}
            />
          ))}
        </div>
      )}

      <div style={{
        padding: '12px 16px', borderRadius: 10,
        background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.1)',
        fontSize: 12, color: '#808080', textAlign: 'center',
      }}>
        &#x26A1; 策略页面仅展示信号与学习报告，交易启停请在
        <a href="/live" style={{ color: '#6366f1', marginLeft: 4, fontWeight: 600 }}>实盘交易控制台</a>
        操作
      </div>
    </div>
  );
}
