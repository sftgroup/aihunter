import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, Activity, BrainCircuit } from 'lucide-react';
import type { StrategyInfo } from '../utils/api';

const T = {
  accent: '#6366f1', accentGreen: '#10b981', accentRed: '#ef4444',
  accentBlue: '#3b82f6', accentPurple: '#8b5cf6', accentOrange: '#f59e0b', accentCyan: '#06b6d4',
  dark50: '#f0f0f0', dark100: '#e0e0e0', dark200: '#c0c0c0', dark300: '#a0a0a0',
  dark400: '#808080', dark500: '#606060', dark600: '#404040', dark700: '#2a2a2a',
  dark800: '#1a1a1a', dark900: '#111111', dark950: '#0a0a0a',
};

interface Props {
  strategy: StrategyInfo;
  onViewDetail?: (route: string) => void;
  disabled?: boolean;
}

export default function StrategyCard({ strategy, onViewDetail, disabled }: Props) {
  const navigate = useNavigate();

  const handleSignals = () => {
    if (disabled) return;
    if (onViewDetail) onViewDetail(strategy.route);
    else navigate(strategy.route);
  };

  const handleLearning = () => {
    if (disabled) return;
    navigate(strategy.route + '?tab=learning');
  };

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
        backdropFilter: 'blur(24px)',
        border: strategy.enabled ? '1px solid rgba(99,102,241,0.2)' : '1px solid rgba(255,255,255,0.05)',
        borderRadius: 16,
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        padding: 20,
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.2s',
        cursor: disabled ? 'default' : 'pointer',
      }}
      className={disabled ? '' : 'hover-glow'}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div
          style={{
            width: 40, height: 40, borderRadius: 12,
            background: strategy.enabled ? 'rgba(99,102,241,0.15)' : 'rgba(128,128,128,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <TrendingUp size={20} color={strategy.enabled ? T.accent : T.dark400} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'white', whiteSpace: 'nowrap' }}>
              {strategy.display_name}
            </h3>
            {strategy.auto_trading ? (
              <span
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 10, padding: '2px 8px', borderRadius: 100,
                  background: 'rgba(16,185,129,0.1)', color: '#10b981',
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981' }} />
                已开启
              </span>
            ) : (
              <span
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 10, padding: '2px 8px', borderRadius: 100,
                  background: 'rgba(128,128,128,0.1)', color: '#808080',
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#808080' }} />
                已暂停
              </span>
            )}
          </div>
          <p style={{ fontSize: 12, color: '#808080', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {strategy.description}
          </p>
        </div>
      </div>

      <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', marginBottom: 12 }} />

      {/* Metrics row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#808080', marginBottom: 2 }}>今日信号</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>{strategy.metrics.today_signals}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#808080', marginBottom: 2 }}>今日交易</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>{strategy.metrics.today_trades}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#808080', marginBottom: 2 }}>盈亏</div>
          <div style={{
            fontSize: 16, fontWeight: 700,
            color: strategy.metrics.today_pnl >= 0 ? '#10b981' : '#ef4444',
          }}>
            {strategy.metrics.today_pnl >= 0 ? '+' : ''}${strategy.metrics.today_pnl.toFixed(2)}
          </div>
        </div>
      </div>

      <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', marginBottom: 12 }} />

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleSignals}
          disabled={disabled}
          style={{
            flex: 1,
            padding: '8px 12px', borderRadius: 10,
            background: disabled ? 'rgba(128,128,128,0.05)' : 'rgba(99,102,241,0.12)',
            border: disabled ? '1px solid rgba(128,128,128,0.1)' : '1px solid rgba(99,102,241,0.2)',
            color: disabled ? '#606060' : '#6366f1',
            fontSize: 12, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
          }}
        >
          <Activity size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
          查看信号
        </button>
        <button
          onClick={handleLearning}
          disabled={disabled}
          style={{
            flex: 1,
            padding: '8px 12px', borderRadius: 10,
            background: disabled ? 'rgba(128,128,128,0.05)' : 'rgba(139,92,246,0.12)',
            border: disabled ? '1px solid rgba(128,128,128,0.1)' : '1px solid rgba(139,92,246,0.2)',
            color: disabled ? '#606060' : '#8b5cf6',
            fontSize: 12, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
          }}
        >
          <BrainCircuit size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
          学习报告
        </button>
      </div>

      {disabled && (
        <div style={{ marginTop: 12, textAlign: 'center' }}>
          <span
            style={{
              display: 'inline-block',
              padding: '4px 16px', borderRadius: 100,
              background: 'rgba(99,102,241,0.08)',
              border: '1px solid rgba(99,102,241,0.15)',
              color: '#6366f1', fontSize: 11, fontWeight: 500,
            }}
          >
            参与内测
          </span>
        </div>
      )}
    </div>
  );
}
