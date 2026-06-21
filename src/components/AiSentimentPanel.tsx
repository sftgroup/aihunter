import { useState } from 'react';
import { Brain, Send, AlertTriangle, TrendingUp, Sparkles, Info } from 'lucide-react';
import { sentimentApi } from '../utils/api';
import type { AiSentimentResult } from '../types/api';

// cardCss 已统一使用 index.css 的 .card 类

function sentimentColor(score: number): string {
  if (score > 0.3) return 'var(--accent-green)';
  if (score > -0.3) return 'var(--accent-orange)';
  return 'var(--accent-red)';
}

function sentimentLabel(score: number): string {
  if (score > 0.6) return '极度看好 🚀';
  if (score > 0.3) return '看涨 📈';
  if (score > -0.3) return '中性 ➖';
  if (score > -0.6) return '看跌 📉';
  return '极度看跌 🔻';
}

interface Props {
  aiConfig: Record<string, string>;
}

export default function AiSentimentPanel({ aiConfig }: Props) {
  const [tweets, setTweets] = useState('');
  const [result, setResult] = useState<AiSentimentResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');

  const provider = aiConfig['ai.provider'] || 'deepseek';
  const apiKey = aiConfig['ai.api_key'] || '';

  async function analyze() {
    if (!apiKey) { setError('❌ 请先在「配置」页面设置 AI API Key'); return; }
    if (!tweets.trim()) { setError('请输入推文内容'); return; }

    setAnalyzing(true);
    setError('');
    const lines = tweets.split('\n').map(l => l.trim()).filter(Boolean);
    const res = await sentimentApi.analyze(provider, apiKey, lines);
    setAnalyzing(false);

    if (res.code === 200 && res.data) {
      setResult(res.data);
    } else {
      setError(res.error || '分析失败');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: 'white', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Brain size={16} color="var(--accent)" /> AI 情绪分析
      </p>

      {/* Input */}
      <div>
        <p style={{ fontSize: 11, color: 'var(--dark-400)', marginBottom: 6 }}>
          输入关于某个代币的推文（每行一条），AI 将分析市场情绪
        </p>
        <textarea
          value={tweets}
          onChange={(e) => setTweets(e.target.value)}
          placeholder={`@crypto_dev 刚刚说 $MEME 即将发射！\n@trader_ai 分析：代币合约已放弃权限\n@whale_alert 巨鲸地址正在购买...`}
          rows={4}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 10,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            color: 'var(--dark-200)', fontSize: 12, resize: 'vertical',
            fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5,
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--dark-500)' }}>
            已输入 {tweets.split('\n').filter(Boolean).length} 条
          </span>
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
            <Send size={14} />
            {analyzing ? '分析中...' : '开始分析'}
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
          {/* Sentiment Score */}
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <p style={{ fontSize: 36, fontWeight: 800, color: sentimentColor(result.sentiment_score) }}>
              {result.sentiment_score > 0 ? '+' : ''}{(result.sentiment_score * 100).toFixed(0)}
            </p>
            <p style={{ fontSize: 14, fontWeight: 600, color: sentimentColor(result.sentiment_score), marginTop: 4 }}>
              {sentimentLabel(result.sentiment_score)}
            </p>
            <p style={{ fontSize: 11, color: 'var(--dark-400)', marginTop: 4 }}>情绪得分（-100 ~ +100）</p>
          </div>

          {/* FOMO Level */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="card" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={18} color={result.fomo_level === 'high' ? 'var(--accent-red)' : result.fomo_level === 'medium' ? 'var(--accent-orange)' : 'var(--accent-green)'} />
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'white', textTransform: 'capitalize' }}>{result.fomo_level}</p>
                <p style={{ fontSize: 10, color: 'var(--dark-400)' }}>FOMO 程度</p>
              </div>
            </div>
            <div className="card" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={18} color="var(--accent)" />
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>{result.key_themes.length} 个</p>
                <p style={{ fontSize: 10, color: 'var(--dark-400)' }}>关键主题</p>
              </div>
            </div>
          </div>

          {/* Key Themes */}
          {result.key_themes.length > 0 && (
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--dark-200)', marginBottom: 6 }}>关键主题</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {result.key_themes.map((theme, i) => (
                  <span key={i} style={{
                    padding: '4px 10px', borderRadius: 999, fontSize: 11,
                    background: 'rgba(99,102,241,0.1)', color: 'var(--accent)',
                    border: '1px solid rgba(99,102,241,0.15)',
                  }}>
                    {theme}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Rug Signals */}
          {result.rug_signals.length > 0 && (
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-red)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                <AlertTriangle size={14} /> 风险信号
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {result.rug_signals.map((signal, i) => (
                  <div key={i} style={{
                    padding: '8px 12px', borderRadius: 8,
                    background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.1)',
                    display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--accent-red)',
                  }}>
                    <AlertTriangle size={12} />
                    {signal}
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.rug_signals.length === 0 && (
            <div style={{
              padding: '8px 12px', borderRadius: 8,
              background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.1)',
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--accent-green)',
            }}>
              <Info size={12} />
              未检测到明显的 Rug Pull 风险信号
            </div>
          )}
        </div>
      )}

      <p style={{ fontSize: 10, color: 'var(--dark-500)', textAlign: 'center' }}>
        分析结果仅供参考，不构成投资建议
      </p>
    </div>
  );
}
