import { useState, useEffect } from "react";
import { Key, Globe, Cpu, Plus, RotateCw, AlertTriangle } from "lucide-react";
import { aiApi, rpcApi, okxApi, systemApiExt } from "../utils/api";

const cardBase: React.CSSProperties = {
  background:
    "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
  backdropFilter: "blur(24px)",
  border: "1px solid rgba(255,255,255,0.05)",
  borderRadius: 16,
  boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: 8,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "white",
  fontSize: 13,
  fontFamily: "JetBrains Mono, monospace",
};

export default function ConfigPage() {
  const [_aiConfig, _setAiConfig] = useState<Record<string, string>>({});
  const [provider, setProvider] = useState("deepseek");
  const [apiKey, setApiKey] = useState("");
  const [aiSaving, setAiSaving] = useState(false);
  const [aiResult, setAiResult] = useState("");

  const [rpcData, setRpcData] = useState<Record<string, string>>({});
  const [rpcChain, setRpcChain] = useState("ETH");
  const [rpcUrl, setRpcUrl] = useState("");
  const [rpcResult, setRpcResult] = useState("");

  // OKX 配置
  const [okxApiKey, setOkxApiKey] = useState("");
  const [okxSecret, setOkxSecret] = useState("");
  const [okxPassphrase, setOkxPassphrase] = useState("");
  const [okxConfigured, setOkxConfigured] = useState(false);
  const [okxSaving, setOkxSaving] = useState(false);
  const [okxResult, setOkxResult] = useState("");

  // 重启服务
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);
  const [restarting, setRestarting] = useState(false);
  
  const [restartStatus, setRestartStatus] = useState<
    "idle" | "confirming" | "restarting" | "done" | "failed"
  >("idle");
  const [restartMsg, setRestartMsg] = useState("");

  useEffect(() => {
    loadAiConfig();
    loadRpcConfig();
    loadOkxConfig();
  }, []);

  async function loadAiConfig() {
    const res = await aiApi.getConfig();
    if (res.code === 200 && res.data) {
      _setAiConfig(res.data);
      setProvider(res.data["ai.provider"] || "deepseek");
      setApiKey(res.data["ai.api_key"] || "");
    }
  }

  async function loadRpcConfig() {
    const res = await rpcApi.getConfig();
    if (res.code === 200 && res.data) setRpcData(res.data);
  }

  async function loadOkxConfig() {
    const res = await okxApi.getConfig();
    if (res.code === 200) setOkxConfigured(res.data?.configured || false);
  }

  async function saveAi() {
    if (!apiKey) {
      setAiResult("请输入 API Key");
      return;
    }
    setAiSaving(true);
    setAiResult("保存中...");
    const res = await aiApi.saveConfig(provider, apiKey);
    setAiSaving(false);
    setAiResult(res.code === 200 ? "✅ 已保存" : `❌ ${res.error}`);
    if (res.code === 200) loadAiConfig();
  }

  async function addRpc() {
    if (!rpcUrl) {
      setRpcResult("请输入 URL");
      return;
    }
    const res = await rpcApi.addRpc(rpcChain, rpcUrl);
    setRpcResult(res.code === 200 ? "✅ 已添加" : `❌ ${res.error}`);
    if (res.code === 200) {
      loadRpcConfig();
      setRpcUrl("");
    }
  }

  async function saveOkx() {
    if (!okxApiKey || !okxSecret || !okxPassphrase) {
      setOkxResult("请填写所有 OKX 配置项");
      return;
    }
    setOkxSaving(true);
    setOkxResult("保存中...");
    const res = await okxApi.saveConfig(okxApiKey, okxSecret, okxPassphrase);
    setOkxSaving(false);
    if (res.code === 200) {
      setOkxResult("✅ 配置已保存，请重启服务生效");
      setOkxConfigured(true);
      setOkxApiKey("");
      setOkxSecret("");
      setOkxPassphrase("");
    } else {
      setOkxResult(`❌ ${res.error}`);
    }
  }

  async function doRestart() {
    setRestartStatus("restarting");
    setRestarting(true);
    setRestartMsg("正在重启 Worker 服务...");
    const res = await systemApiExt.restart("worker");
    if (res.code === 200 || res.code === 202) {
      const jobId = res.data?.jobId || "";
      
      // 轮询状态
      const poll = setInterval(async () => {
        const sr = await systemApiExt.restartStatus(jobId);
        if (sr.code === 200 && sr.data) {
          if (sr.data.status === "done") {
            clearInterval(poll);
            setRestartStatus("done");
            setRestarting(false);
            setRestartMsg("✅ 服务已重启，新配置已生效");
          } else if (sr.data.status === "failed") {
            clearInterval(poll);
            setRestartStatus("failed");
            setRestarting(false);
            setRestartMsg(`❌ 重启失败: ${sr.data.error || "未知错误"}，请手动 SSH 处理`);
          }
        }
      }, 3000);
      // 30 秒超时
      setTimeout(() => {
        clearInterval(poll);
        if (restarting) {
          setRestartStatus("done");
          setRestarting(false);
          setRestartMsg("⚠️ 重启已触发，请刷新页面确认状态");
        }
      }, 30000);
    } else {
      setRestartStatus("failed");
      setRestarting(false);
      setRestartMsg(`❌ 重启失败: ${res.error}`);
    }
  }

  function SectionTitle(props: {
    icon: React.ReactNode;
    title: string;
  }) {
    return (
      <h3
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--dark-400)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          paddingLeft: 4,
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {props.icon} {props.title}
      </h3>
    );
  }

  function Row(props: {
    icon: React.ReactNode;
    color: string;
    children: React.ReactNode;
  }) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "14px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            background: props.color,
            padding: "1px",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              borderRadius: 11,
              background: "var(--dark-800)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {props.icon}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>{props.children}</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "white" }}>
          配置
        </h1>
        <p style={{ fontSize: 14, color: "var(--dark-400)", marginTop: 4 }}>
          管理 AI 供应商、RPC 节点、OKX API 和服务
        </p>
      </div>

      {/* AI 供应商 */}
      <div>
        <SectionTitle icon={<Cpu size={14} />} title="AI 供应商" />
        <div style={{ ...cardBase, overflow: "hidden" }}>
          <Row
            icon={<Cpu size={16} color="white" />}
            color="linear-gradient(135deg, #6366f1, #8b5cf6)"
          >
            <p
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "white",
                marginBottom: 8,
              }}
            >
              供应商
            </p>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "var(--dark-200)",
                fontSize: 13,
              }}
            >
              <option value="deepseek">DeepSeek</option>
              <option value="openai">OpenAI</option>
              <option value="moonshot">Moonshot</option>
              <option value="claude">Claude</option>
              <option value="groq">Groq</option>
            </select>
          </Row>

          <Row
            icon={<Key size={16} color="white" />}
            color="linear-gradient(135deg, #10b981, #34d399)"
          >
            <p
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "white",
                marginBottom: 8,
              }}
            >
              API Key
            </p>
            <input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              style={inputStyle}
            />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 8,
              }}
            >
              <button
                onClick={saveAi}
                disabled={aiSaving}
                style={{
                  padding: "6px 16px",
                  borderRadius: 8,
                  fontSize: 12,
                  background: "var(--accent)",
                  color: "white",
                  cursor: aiSaving ? "not-allowed" : "pointer",
                  opacity: aiSaving ? 0.5 : 1,
                }}
              >
                保存
              </button>
              {aiResult && (
                <span
                  style={{
                    fontSize: 11,
                    color: aiResult.startsWith("✅")
                      ? "var(--accent-green)"
                      : "var(--accent-red)",
                  }}
                >
                  {aiResult}
                </span>
              )}
            </div>
          </Row>
        </div>
      </div>

      {/* RPC 节点 */}
      <div>
        <SectionTitle icon={<Globe size={14} />} title="RPC 节点" />
        <div style={{ ...cardBase, overflow: "hidden" }}>
          {Object.entries(rpcData).map(([key, val]) => {
            const chain = key.replace("rpc.", "");
            let urls: string[] = [];
            try {
              urls = JSON.parse(val);
            } catch {
              urls = [val];
            }
            return urls.map((url, i) => (
              <div
                key={`${chain}-${i}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 16px",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 500,
                    background:
                      chain === "ETH"
                        ? "rgba(98,126,234,0.15)"
                        : chain === "BSC"
                        ? "rgba(240,185,11,0.15)"
                        : chain === "BASE"
                        ? "rgba(0,82,255,0.15)"
                        : "rgba(153,69,255,0.15)",
                    color:
                      chain === "ETH"
                        ? "#627eea"
                        : chain === "BSC"
                        ? "#f0b90b"
                        : chain === "BASE"
                        ? "#0052ff"
                        : "#9945ff",
                  }}
                >
                  {chain}
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: 11,
                    color: "var(--dark-400)",
                    fontFamily: "JetBrains Mono, monospace",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {url}
                </span>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontSize: 10,
                    background: "rgba(16,185,129,0.1)",
                    color: "var(--accent-green)",
                  }}
                >
                  已配置
                </span>
              </div>
            ));
          })}

          <div style={{ padding: "14px 16px" }}>
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "flex-end",
                flexWrap: "wrap",
              }}
            >
              <div>
                <p style={{ fontSize: 10, color: "var(--dark-400)", marginBottom: 4 }}>
                  链
                </p>
                <select
                  value={rpcChain}
                  onChange={(e) => setRpcChain(e.target.value)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    fontSize: 12,
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "var(--dark-200)",
                  }}
                >
                  <option value="ETH">ETH</option>
                  <option value="BSC">BSC</option>
                  <option value="BASE">BASE</option>
                  <option value="SOL">SOL</option>
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 150 }}>
                <p style={{ fontSize: 10, color: "var(--dark-400)", marginBottom: 4 }}>
                  URL
                </p>
                <input
                  value={rpcUrl}
                  onChange={(e) => setRpcUrl(e.target.value)}
                  placeholder="https://..."
                  style={inputStyle}
                />
              </div>
              <button
                onClick={addRpc}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  fontSize: 12,
                  background: "rgba(99,102,241,0.1)",
                  color: "var(--accent)",
                  cursor: "pointer",
                  border: "1px solid rgba(99,102,241,0.2)",
                }}
              >
                <Plus size={14} /> 添加
              </button>
            </div>
            {rpcResult && (
              <p
                style={{
                  fontSize: 11,
                  marginTop: 8,
                  color: rpcResult.startsWith("✅")
                    ? "var(--accent-green)"
                    : "var(--accent-red)",
                }}
              >
                {rpcResult}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* OKX API 配置 */}
      <div>
        <SectionTitle icon={<Key size={14} />} title="OKX API 配置" />
        <div style={{ ...cardBase, overflow: "hidden" }}>
          <Row
            icon={<Key size={16} color="white" />}
            color="linear-gradient(135deg, #f59e0b, #ef4444)"
          >
            {okxConfigured && (
              <p
                style={{
                  fontSize: 11,
                  color: "var(--accent-green)",
                  marginBottom: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                ✅ OKX 已配置
              </p>
            )}
            <p style={{ fontSize: 13, fontWeight: 500, color: "white", marginBottom: 8 }}>
              API Key
            </p>
            <input
              value={okxApiKey}
              onChange={(e) => setOkxApiKey(e.target.value)}
              placeholder="e8f5e44c-..."
              style={inputStyle}
            />
          </Row>
          <Row
            icon={<Key size={16} color="white" />}
            color="linear-gradient(135deg, #f59e0b, #ef4444)"
          >
            <p style={{ fontSize: 13, fontWeight: 500, color: "white", marginBottom: 8 }}>
              Secret Key
            </p>
            <input
              type="password"
              value={okxSecret}
              onChange={(e) => setOkxSecret(e.target.value)}
              placeholder="••••••••"
              style={inputStyle}
            />
          </Row>
          <Row
            icon={<Key size={16} color="white" />}
            color="linear-gradient(135deg, #f59e0b, #ef4444)"
            >
            <p style={{ fontSize: 13, fontWeight: 500, color: "white", marginBottom: 8 }}>
              Passphrase
            </p>
            <input
              type="password"
              value={okxPassphrase}
              onChange={(e) => setOkxPassphrase(e.target.value)}
              placeholder="••••••••"
              style={inputStyle}
            />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 8,
              }}
            >
              <button
                onClick={saveOkx}
                disabled={okxSaving}
                style={{
                  padding: "6px 16px",
                  borderRadius: 8,
                  fontSize: 12,
                  background: "linear-gradient(135deg, #f59e0b, #ef4444)",
                  color: "white",
                  cursor: okxSaving ? "not-allowed" : "pointer",
                  opacity: okxSaving ? 0.5 : 1,
                }}
              >
                {okxSaving ? "保存中..." : "保存配置"}
              </button>
              {okxResult && (
                <span
                  style={{
                    fontSize: 11,
                    color: okxResult.startsWith("✅")
                      ? "var(--accent-green)"
                      : okxResult.startsWith("❌")
                      ? "var(--accent-red)"
                      : "var(--dark-200)",
                  }}
                >
                  {okxResult}
                </span>
              )}
            </div>
          </Row>
        </div>
      </div>

      {/* 重启服务 */}
      <div>
        <SectionTitle
          icon={<RotateCw size={14} />}
          title="服务控制"
        />
        <div style={{ ...cardBase, overflow: "hidden" }}>
          <div style={{ padding: "16px" }}>
            <p
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "white",
                marginBottom: 4,
              }}
            >
              重启服务
            </p>
            <p style={{ fontSize: 12, color: "var(--dark-400)", marginBottom: 12 }}>
              修改 API 配置后，重启 Worker 服务让新配置生效
            </p>

            {restartStatus === "idle" && (
              <button
                onClick={() => setShowRestartConfirm(true)}
                style={{
                  padding: "10px 20px",
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 600,
                  background:
                    "linear-gradient(135deg, rgba(239,68,68,0.2), rgba(220,38,38,0.1))",
                  color: "#ef4444",
                  border: "1px solid rgba(239,68,68,0.3)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <AlertTriangle size={16} />
                🚀 重启服务
              </button>
            )}

            {showRestartConfirm && restartStatus === "idle" && (
              <div
                style={{
                  marginTop: 8,
                  padding: 12,
                  borderRadius: 8,
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.2)",
                }}
              >
                <p
                  style={{
                    fontSize: 12,
                    color: "#fca5a5",
                    marginBottom: 8,
                  }}
                >
                  确认要重启 Worker 服务？配置将在重启后生效，服务会短暂中断
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => {
                      setShowRestartConfirm(false);
                      doRestart();
                    }}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      background: "#ef4444",
                      color: "white",
                      cursor: "pointer",
                    }}
                  >
                    确认重启
                  </button>
                  <button
                    onClick={() => {
                      setShowRestartConfirm(false);
                    }}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 8,
                      fontSize: 12,
                      background: "rgba(255,255,255,0.05)",
                      color: "var(--dark-200)",
                      cursor: "pointer",
                    }}
                  >
                    取消
                  </button>
                </div>
              </div>
            )}

            {restartStatus === "restarting" && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    border: "2px solid rgba(251,191,36,0.3)",
                    borderTopColor: "#fbbf24",
                    borderRadius: "50%",
                    animation: "spin 1s linear infinite",
                  }}
                />
                <span style={{ fontSize: 13, color: "var(--dark-200)" }}>
                  {restartMsg}
                </span>
              </div>
            )}

            {restartStatus === "done" && (
              <p
                style={{
                  fontSize: 13,
                  color: "var(--accent-green)",
                }}
              >
                {restartMsg}
              </p>
            )}

            {restartStatus === "failed" && (
              <p
                style={{
                  fontSize: 13,
                  color: "#ef4444",
                }}
              >
                {restartMsg}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
