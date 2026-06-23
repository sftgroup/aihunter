import { useState, useEffect, useRef } from 'react';
import { Radio, Shield, AlertTriangle, Activity } from 'lucide-react';
import type { Signal } from '../types/api';
import { CHAIN_COLORS } from '../types/api';
import { getWsConnection, type WsStatus } from '../utils/ws';
import { getAuthToken } from '../utils/api';

const cardBase: React.CSSProperties = {
  background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
  backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
};

export default function SignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [connected, setConnected] = useState(false);
  const [wsStatus, setWsStatus] = useState('连接中...');
  const hasToken = !!getAuthToken();
  const connRef = useRef(getWsConnection());

  useEffect(() => {
    if (!hasToken) {
      setWsStatus('⚠ 请先配置 AUTH_TOKEN');
      return;
    }

    const conn = connRef.current;

    const unsubMessage = conn.onMessage((msg: any) => {
      if (msg.type === 'signal' && msg.data) {
        setSignals((prev) => [msg.data, ...prev].slice(0, 100));
      }
    });

    const unsubStatus = conn.onStatus((status: WsStatus) => {
      switch (status) {
        case 'open':
          setConnected(true);
          setWsStatus('● 已连接');
          break;
        case 'closed':
          setConnected(false);
          setWsStatus('● 已断开，重连中...');
          break;
        case 'connecting':
          setWsStatus('连接中...');
          break;
        case 'error':
          setConnected(false);
          setWsStatus('● 连接错误');
          break;
      }
    });

    conn.connect();

    return () => {
      unsubMessage();
      unsubStatus();
      conn.disconnect();
    };
  }, [hasToken]);

  const stats = [
    {
      label: '今日信号', value: signals.length.toString(),
      icon: Radio, color: 'var(--accent)',
    },
    {
      label: '高置信度', value: signals.filter((s) => s.confidence >= 70).length.toString(),
      icon: Shield, color: 'var(--accent-green)',
    },
    {
      label: '有风险', value: signals.filter((s) => s.confidence < 40).length.toString(),
      icon: AlertTriangle, color: 'var(--accent-red)',
    },
    {
      label: '链数量', value: [...new Set(signals.map((s) => s.chain))].length.toString(),
      icon: Activity, color: 'var(--accent-blue)',
    },
  ];

  function getConfLevel(score: number): { label: string; className: string } {
    if (score >= 70) return { label: '高', className: 'conf-high' };
    if (score >= 40) return { label: '中', className: 'conf-mid' };
    return { label: '低', className: 'conf-low' };
  }

  function getFlagLabel(flag: string) {
    if (flag === 'owner_renounced') return { text: '已放弃', className: 'flag-safe' };
    if (flag === 'lp_locked') return { text: 'LP已锁', className: 'flag-safe' };
    if (flag === 'mintable') return { text: '可增发', className: 'flag-warn' };
    if (flag === 'honeypot') return { text: '蜜罐', className: 'flag-danger' };
    if (flag === 'high_tax') return { text: '高税', className: 'flag-warn' };
    return { text: flag, className: 'flag-warn' };
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'white' }}>信号雷达</h1>
          <p style={{ fontSize: 14, color: 'var(--dark-400)', marginTop: 4 }}>
            实时监听新土狗合约，AI 风险评分
          </p>
        </div>
        <span
          style={{
            fontSize: 12, fontWeight: 500,
            color: connected ? 'var(--accent-green)' : 'var(--accent-orange)',
            padding: '4px 12px', borderRadius: 999,
            background: connected ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
            border: `1px solid ${connected ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}`,
          }}
        >
          {wsStatus}
        </span>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} style={{ ...cardBase, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Icon size={16} color={s.color} />
                <p style={{ fontSize: 12, color: 'var(--dark-400)', fontWeight: 500 }}>{s.label}</p>
              </div>
              <p style={{ fontSize: 24, fontWeight: 700, color: 'white' }}>{s.value}</p>
            </div>
          );
        })}
      </div>

      {/* Signal List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {signals.length === 0 ? (
          <div style={{ ...cardBase, padding: 40, textAlign: 'center' }}>
            <Radio size={32} style={{ color: 'var(--dark-500)', marginBottom: 12 }} />
            <p style={{ color: 'var(--dark-400)' }}>正在监听链上新土狗...</p>
            <p style={{ fontSize: 12, color: 'var(--dark-500)', marginTop: 8 }}>
              ETH · BSC · BASE · SOL
            </p>
          </div>
        ) : (
          signals.map((signal) => {
            const conf = getConfLevel(signal.confidence);
            return (
              <div
                key={signal.id}
                style={{
                  animation: 'fadeIn 0.3s ease-out',
                  ...cardBase, padding: 16, display: 'flex', alignItems: 'center', gap: 16,
                  cursor: 'pointer', transition: 'all 0.3s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(99,102,241,0.2)';
                  e.currentTarget.style.boxShadow = '0 0 15px rgba(99,102,241,0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)';
                  e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.3)';
                }}
              >
                {/* Chain Icon */}
                <div
                  style={{
                    width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: `${CHAIN_COLORS[signal.chain] || '#606060'}20`,
                    color: CHAIN_COLORS[signal.chain] || 'var(--dark-400)',
                    fontSize: 12, fontWeight: 700,
                  }}
                >
                  {signal.chain}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>
                      {signal.symbol || 'Unknown'}
                    </h3>
                    <span style={{
                      fontSize: 10, padding: '2px 6px', borderRadius: 6,
                      background: 'rgba(255,255,255,0.05)', color: 'var(--dark-400)',
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>
                      {signal.name?.slice(0, 12) || signal.contract.slice(0, 10)}
                    </span>
                  </div>
                  <p style={{
                    fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                    color: 'var(--dark-400)', marginBottom: 6, wordBreak: 'break-all',
                  }}>
                    {signal.contract}
                  </p>
                  {/* Tags */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span className={`chain-tag chain-${signal.chain.toLowerCase()}`}
                      style={{ padding: '2px 8px', borderRadius: 100, fontSize: 10, fontWeight: 500 }}>
                      {signal.chain}
                    </span>
                    {signal.flags?.map((flag) => {
                      const f = getFlagLabel(flag);
                      return (
                        <span key={flag} style={{
                          padding: '2px 6px', borderRadius: 4, fontSize: 10,
                          fontWeight: 500,
                        }} className={f.className}>
                          {f.text}
                        </span>
                      );
                    })}
                    <span style={{
                      padding: '2px 6px', borderRadius: 4, fontSize: 10,
                      fontWeight: 500, background: 'rgba(99,102,241,0.1)',
                      color: 'var(--accent)',
                    }}>
                      可信度 {conf.label}
                    </span>
                  </div>
                </div>

                {/* Score */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{
                    fontSize: 20, fontWeight: 700,
                    color: signal.confidence >= 70 ? 'var(--accent-green)'
                      : signal.confidence >= 40 ? 'var(--accent-orange)'
                      : 'var(--accent-red)',
                  }}>
                    {signal.confidence}%
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--dark-400)', marginTop: 2 }}>
                    可信度
                  </p>
                  <button style={{
                    marginTop: 6, padding: '4px 10px', fontSize: 10,
                    background: 'rgba(99,102,241,0.1)', color: 'var(--accent)',
                    borderRadius: 6, cursor: 'pointer',
                  }}>
                    详情
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
