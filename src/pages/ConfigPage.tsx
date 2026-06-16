import { useState, useEffect } from 'react';
import { Key, Globe, Cpu, Plus } from 'lucide-react';
import { aiApi, rpcApi } from '../utils/api';

const cardBase: React.CSSProperties = {
  background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
  backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
};

export default function ConfigPage() {
  const [_aiConfig, _setAiConfig] = useState<Record<string, string>>({});
  const [provider, setProvider] = useState('deepseek');
  const [apiKey, setApiKey] = useState('');
  const [aiSaving, setAiSaving] = useState(false);
  const [aiResult, setAiResult] = useState('');

  const [rpcData, setRpcData] = useState<Record<string, string>>({});
  const [rpcChain, setRpcChain] = useState('ETH');
  const [rpcUrl, setRpcUrl] = useState('');
  const [rpcResult, setRpcResult] = useState('');

  useEffect(() => {
    loadAiConfig();
    loadRpcConfig();
  }, []);

  async function loadAiConfig() {
    const res = await aiApi.getConfig();
    if (res.code === 200 && res.data) {
      _setAiConfig(res.data);
      setProvider(res.data['ai.provider'] || 'deepseek');
      setApiKey(res.data['ai.api_key'] || '');
    }
  }

  async function loadRpcConfig() {
    const res = await rpcApi.getConfig();
    if (res.code === 200 && res.data) setRpcData(res.data);
  }

  async function saveAi() {
    if (!apiKey) { setAiResult('请输入 API Key'); return; }
    setAiSaving(true);
    setAiResult('保存中...');
    const res = await aiApi.saveConfig(provider, apiKey);
    setAiSaving(false);
    setAiResult(res.code === 200 ? '✅ 已保存' : `❌ ${res.error}`);
    if (res.code === 200) loadAiConfig();
  }

  async function addRpc() {
    if (!rpcUrl) { setRpcResult('请输入 URL'); return; }
    const res = await rpcApi.addRpc(rpcChain, rpcUrl);
    setRpcResult(res.code === 200 ? '✅ 已添加' : `❌ ${res.error}`);
    if (res.code === 200) { loadRpcConfig(); setRpcUrl(''); }
  }

  /* const settingGroups = [
    {
      title: 'AI 供应商',
      icon: Cpu,
      items: [
        { label: '供应商', desc: '选择 AI 模型供应商', color: 'linear-gradient(135deg, #6366f1, #8b5cf6)', content: 'select' },
        { label: 'API Key', desc: aiConfig['ai.api_key'] ? '已配置' : '未配置', color: 'linear-gradient(135deg, #10b981, #34d399)', content: 'key' },
      ],
    },
    {
      title: 'RPC 节点',
      icon: Globe,
      items: Object.entries(rpcData).length > 0
        ? Object.entries(rpcData).map(([key, val]) => ({
          label: key.replace('rpc.', '').toUpperCase(),
          desc: typeof val === 'string' ? val.slice(0, 40) + '...' : `${(JSON.parse(val) as string[]).length} 个节点`,
          color: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
          content: 'rpc' as const,
        }))
        : [{ label: 'ETH', desc: '默认节点', color: 'linear-gradient(135deg, #3b82f6, #06b6d4)', content: 'rpc' as const }],
    },
  ]; */

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'white' }}>配置</h1>
        <p style={{ fontSize: 14, color: 'var(--dark-400)', marginTop: 4 }}>管理 AI 供应商、RPC 节点和策略参数</p>
      </div>

      {/* AI 供应商 */}
      <div>
        <h3 style={{
          fontSize: 12, fontWeight: 600, color: 'var(--dark-400)',
          textTransform: 'uppercase', letterSpacing: '0.05em',
          paddingLeft: 4, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Cpu size={14} /> AI 供应商
        </h3>
        <div style={{ ...cardBase, overflow: 'hidden' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16,
            padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 12,
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', padding: '1px',
            }}>
              <div style={{
                width: '100%', height: '100%', borderRadius: 11,
                background: 'var(--dark-800)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Cpu size={16} color="white" />
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 500, color: 'white', marginBottom: 8 }}>供应商</p>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  color: 'var(--dark-200)', fontSize: 13,
                }}
              >
                <option value="deepseek">DeepSeek</option>
                <option value="openai">OpenAI</option>
                <option value="moonshot">Moonshot</option>
                <option value="claude">Claude</option>
                <option value="groq">Groq</option>
              </select>
            </div>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 16,
            padding: '14px 16px',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 12,
              background: 'linear-gradient(135deg, #10b981, #34d399)', padding: '1px',
            }}>
              <div style={{
                width: '100%', height: '100%', borderRadius: 11,
                background: 'var(--dark-800)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Key size={16} color="white" />
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 500, color: 'white', marginBottom: 8 }}>API Key</p>
              <input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  color: 'white', fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <button
                  onClick={saveAi}
                  disabled={aiSaving}
                  style={{
                    padding: '6px 16px', borderRadius: 8, fontSize: 12,
                    background: 'var(--accent)', color: 'white',
                    cursor: aiSaving ? 'not-allowed' : 'pointer', opacity: aiSaving ? 0.5 : 1,
                  }}
                >
                  保存
                </button>
                {aiResult && (
                  <span style={{
                    fontSize: 11,
                    color: aiResult.startsWith('✅') ? 'var(--accent-green)' : 'var(--accent-red)',
                  }}>{aiResult}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RPC 节点 */}
      <div>
        <h3 style={{
          fontSize: 12, fontWeight: 600, color: 'var(--dark-400)',
          textTransform: 'uppercase', letterSpacing: '0.05em',
          paddingLeft: 4, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Globe size={14} /> RPC 节点
        </h3>
        <div style={{ ...cardBase, overflow: 'hidden' }}>
          {/* RPC 列表 */}
          {Object.entries(rpcData).map(([key, val]) => {
            const chain = key.replace('rpc.', '');
            let urls: string[] = [];
            try { urls = JSON.parse(val); } catch { urls = [val]; }
            return urls.map((url, i) => (
              <div key={`${chain}-${i}`} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}>
                <span style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 500,
                  background: chain === 'ETH' ? 'rgba(98,126,234,0.15)' : chain === 'BSC' ? 'rgba(240,185,11,0.15)' : chain === 'BASE' ? 'rgba(0,82,255,0.15)' : 'rgba(153,69,255,0.15)',
                  color: chain === 'ETH' ? '#627eea' : chain === 'BSC' ? '#f0b90b' : chain === 'BASE' ? '#0052ff' : '#9945ff',
                }}>{chain}</span>
                <span style={{
                  flex: 1, fontSize: 11, color: 'var(--dark-400)',
                  fontFamily: "'JetBrains Mono', monospace", overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{url}</span>
                <span style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 10,
                  background: 'rgba(16,185,129,0.1)', color: 'var(--accent-green)',
                }}>已配置</span>
              </div>
            ));
          })}

          {/* Add RPC */}
          <div style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <p style={{ fontSize: 10, color: 'var(--dark-400)', marginBottom: 4 }}>链</p>
                <select
                  value={rpcChain}
                  onChange={(e) => setRpcChain(e.target.value)}
                  style={{
                    padding: '6px 10px', borderRadius: 8, fontSize: 12,
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    color: 'var(--dark-200)',
                  }}
                >
                  <option value="ETH">ETH</option>
                  <option value="BSC">BSC</option>
                  <option value="BASE">BASE</option>
                  <option value="SOL">SOL</option>
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 150 }}>
                <p style={{ fontSize: 10, color: 'var(--dark-400)', marginBottom: 4 }}>URL</p>
                <input
                  value={rpcUrl}
                  onChange={(e) => setRpcUrl(e.target.value)}
                  placeholder="https://..."
                  style={{
                    width: '100%', padding: '6px 10px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    color: 'white', fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                  }}
                />
              </div>
              <button onClick={addRpc} style={{
                padding: '6px 12px', borderRadius: 8, fontSize: 12,
                background: 'rgba(99,102,241,0.1)', color: 'var(--accent)',
                cursor: 'pointer', border: '1px solid rgba(99,102,241,0.2)',
              }}>
                <Plus size={14} /> 添加
              </button>
            </div>
            {rpcResult && (
              <p style={{
                fontSize: 11, marginTop: 8,
                color: rpcResult.startsWith('✅') ? 'var(--accent-green)' : 'var(--accent-red)',
              }}>{rpcResult}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
