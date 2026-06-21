import { useState } from 'react';
import { Search, ShieldCheck, ShieldAlert, ExternalLink } from 'lucide-react';
import { smartMoneyApi } from '../utils/api';
import type { SmartMoneyResult } from '../types/api';

// cardCss 已统一使用 index.css 的 .card 类

interface Props {
  aiConfig: Record<string, string>;
}

export default function SmartMoneyPanel({ aiConfig }: Props) {
  const [address, setAddress] = useState('');
  const [txInput, setTxInput] = useState('');
  const [result, setResult] = useState<SmartMoneyResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');

  const provider = aiConfig['ai.provider'] || 'deepseek';
  const apiKey = aiConfig['ai.api_key'] || '';

  async function analyze() {
    if (!apiKey) { setError('❌ 请先在「配置」页面设置 AI API Key'); return; }
    if (!address.trim()) { setError('请输入钱包地址'); return; }

    setAnalyzing(true);
    setError('');
    const txs = txInput.split('\n').map(l => l.trim()).filter(Boolean);
    const res = await smartMoneyApi.analyze(provider, apiKey, address.trim(), txs);
    setAnalyzing(false);

    if (res.code === 200 && res.data) {
      setResult(res.data);
    } else {
      setError(res.error || '分析失败');
    }
  }

  function getConfidenceColor(conf: number): string {
    if (conf >= 0.8) return 'var(--accent-green)';
    if (conf >= 0.5) return 'var(--accent-orange)';
    return 'var(--accent-red)';
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: 'white', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Search size={16} color="var(--accent)" /> 聪明钱分析
      </p>

      {/* Input */}
      <div>
        <p style={{ fontSize: 11, color: 'var(--dark-400)', marginBottom: 6 }}>
          输入钱包地址，AI 将分析该地址是否为"聪明钱"（Smart Money）
        </p>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="输入钱包地址 0x..."
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 10,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            color: 'var(--dark-200)', fontSize: 12,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        />
        <div style={{ marginTop: 8 }}>
          <p style={{ fontSize: 11, color: 'var(--dark-400)', marginBottom: 4 }}>
            交易记录（可选，每行一条）
          </p>
          <textarea
            value={txInput}
            onChange={(e) => setTxInput(e.target.value)}
            placeholder={`买入 $SHIBA 1000 USDC\n卖出 $PEPE 500 USDC\n...`}
            rows={3}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 10,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              color: 'var(--dark-200)', fontSize: 11, resize: 'vertical',
              fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5,
            }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button
            onClick={analyze}
            disabled={analyzing}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 8, fontSize: 12,
              background: analyzing ? 'rgba(99,102,241,0.3)' : 'var(--accent)',
              color: 'white', cursor: analyzing ? 'not-allowed' : 'pointer', opacity: analyzing ? 0.5 : 1,
            }}
          >
            <Search size={14} />
            {analyzing ? '分析中...' : '分析地址'}
          </button>
        </div>
      </div>

      {error && (
        <p style={{ fontSize: 11, color: 'var(--accent-red)', padding: 8, background: 'rgba(239,68,68,0.05)', borderRadius: 8 }}>
          {error}
        </p>
      )}

      {/* Results */}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Smart Money Badge */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.3)', padding: 16, textAlign: 'center',
            borderLeft: `3px solid ${result.is_smart_money ? 'var(--accent-green)' : 'var(--accent-red)'}`,
          }}>
            {result.is_smart_money ? (
              <ShieldCheck size={40} color="var(--accent-green)" style={{ marginBottom: 8 }} />
            ) : (
              <ShieldAlert size={40} color="var(--accent-red)" style={{ marginBottom: 8 }} />
            )}
            <p style={{
              fontSize: 18, fontWeight: 700,
              color: result.is_smart_money ? 'var(--accent-green)' : 'var(--accent-red)',
            }}>
              {result.is_smart_money ? '✅ 聪明钱' : '❌ 普通地址'}
            </p>
            <p style={{ fontSize: 11, color: 'var(--dark-400)', marginTop: 4 }}>
              置信度: {(result.confidence * 100).toFixed(0)}%
            </p>
            <div style={{
              marginTop: 8, height: 6, borderRadius: 3,
              background: 'rgba(255,255,255,0.1)', overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', borderRadius: 3,
                background: getConfidenceColor(result.confidence),
                width: `${(result.confidence * 100).toFixed(0)}%`,
                transition: 'width 0.5s',
              }} />
            </div>
          </div>

          {/* Pattern */}
          <div style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.3)', padding: 12 }}>
            <p style={{ fontSize: 11, color: 'var(--dark-400)', marginBottom: 4 }}>交易模式</p>
            <p style={{ fontSize: 13, fontWeight: 500, color: 'white' }}>{result.pattern}</p>
          </div>

          {/* Reason */}
          <div style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.3)', padding: 12 }}>
            <p style={{ fontSize: 11, color: 'var(--dark-400)', marginBottom: 4 }}>分析理由</p>
            <p style={{ fontSize: 12, color: 'var(--dark-200)', lineHeight: 1.6 }}>{result.reason}</p>
          </div>

          {/* Link */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 12px', borderRadius: 8,
            background: 'rgba(255,255,255,0.03)', fontSize: 11, color: 'var(--dark-400)',
          }}>
            <ExternalLink size={12} />
            地址: {address.slice(0, 10)}...{address.slice(-6)}
          </div>
        </div>
      )}

      <p style={{ fontSize: 10, color: 'var(--dark-500)', textAlign: 'center' }}>
        分析结果仅供参考，不构成投资建议
      </p>
    </div>
  );
}
