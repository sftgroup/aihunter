import { useState, useEffect, useRef } from 'react';
import { TrendingUp, Activity, Zap, ChevronLeft, ChevronRight, Filter, Copy, Check, Wallet, ExternalLink, BarChart3, Power, RefreshCw } from 'lucide-react';
import { signalsPageApi, api } from "../../utils/api";
import LearningTab from "./LearningTab";
import MomentumLivePage from "../MomentumLivePage";
import { useAccount, useDisconnect, useBalance } from 'wagmi';

const cardBase: React.CSSProperties = {
  background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
  backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
};

const chainColors: Record<string, string> = {
  ETH: '#627eea', BSC: '#f0b90b', BASE: '#0052ff', SOL: '#9945ff',
};
const PAGE_SIZE = 20;

export default function MomentumTab() {
  const [signals, setSignals] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [chainFilter, setChainFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [view, setView] = useState('signals');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (view !== 'signals') return;
    setLoading(true);
    signalsPageApi.getPage(page, PAGE_SIZE, chainFilter || undefined).then((sr) => {
      if (sr?.code === 200 && sr.data) { setSignals((sr as any).data); setTotal((sr as any).total || 0); }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [page, chainFilter, view]);

  const filtered = actionFilter ? signals.filter(s => s.action === actionFilter) : signals;
  const totalPages = Math.ceil((actionFilter ? filtered.length : total) / PAGE_SIZE);

  const navBtn: React.CSSProperties = {
    padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.05)', color: 'white', cursor: 'pointer',
    fontSize: 12, display: 'flex', alignItems: 'center', gap: 4,
  };
  const navBtnDisabled: React.CSSProperties = { ...navBtn, opacity: 0.3, cursor: 'not-allowed' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 导航标签 */}
      <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 3 }}>
        {[{ key: 'signals', label: '扫描中代币', icon: Activity }, { key: 'real', label: '实盘交易', icon: TrendingUp }, { key: 'learn', label: '自动学习', icon: Zap }].map(v => {
          const Icon = v.icon;
          const isActive = view === v.key;
          return (
            <button key={v.key} onClick={() => { setView(v.key); setPage(1); }}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '8px 12px', borderRadius: 6, background: isActive ? 'rgba(99,102,241,0.15)' : 'transparent', border: 'none', color: isActive ? 'var(--accent)' : 'var(--dark-400)', cursor: 'pointer', fontSize: 11, fontWeight: 500 }}>
              <Icon size={13} />{v.label}
            </button>
          );
        })}
      </div>

      {/* 扫描中代币 */}
      {view === 'signals' && (
        <div style={{ ...cardBase, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <Filter size={12} color="var(--dark-400)" />
              {['', 'buy', 'pass'].map(a => (
                <button key={a} onClick={() => { setActionFilter(a); setPage(1); }}
                  style={{
                    padding: '3px 8px', borderRadius: 6, border: 'none', fontSize: 10, fontWeight: 500,
                    cursor: 'pointer',
                    background: actionFilter === a ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.05)',
                    color: actionFilter === a ? 'white' : 'var(--dark-400)',
                  }}>
                  {a === '' ? '全部' : a === 'buy' ? 'BUY' : 'PASS'}
                </button>
              ))}
              <span style={{width:8}}></span>
              {['', 'ETH', 'BSC', 'BASE', 'SOL'].map(c => (
                <button key={c} onClick={() => { setChainFilter(c); setPage(1); }}
                  style={{
                    padding: '3px 8px', borderRadius: 6, border: 'none', fontSize: 10, fontWeight: 500,
                    cursor: 'pointer',
                    background: chainFilter === c ? (chainColors[c] || 'rgba(99,102,241,0.3)') : 'rgba(255,255,255,0.05)',
                    color: chainFilter === c ? 'white' : 'var(--dark-400)',
                  }}>
                  {c || '全部'}
                </button>
              ))}
            </div>
          </div>

          {loading && signals.length === 0 ? <p style={{ textAlign: 'center', color: 'var(--dark-400)', padding: 24, fontSize: 13 }}>加载中...</p>
          : filtered.length === 0 ? <p style={{ textAlign: 'center', color: 'var(--dark-400)', padding: 24, fontSize: 13 }}>暂无匹配的代币</p>
          : <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {filtered.map((sig: any) => {
                const cc = chainColors[sig.chain] || '#808080';
                const sc = sig.score || sig.confidence || 0;
                return (
                  <div key={sig.id} style={{ ...cardBase, padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#2a2a3e,#1a1a2e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                      {(sig.symbol || '?').charAt(0)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>{sig.symbol || sig.contract?.slice(0, 10)}</span>
                        <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 100, background: cc + '20', color: cc, fontWeight: 500 }}>{sig.chain}</span>
                        {sig.action === 'buy' && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 100, background: 'rgba(16,185,129,0.15)', color: '#10b981', fontWeight: 500 }}>BUY</span>}
                        {sig.safety_risk_level && sig.safety_risk_level >= '3' && (
                          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 100, background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontWeight: 500 }}>{'⚠️风险' + sig.safety_risk_level}</span>
                        )}
                        {sig.safety_concentration === 'High' && (
                          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 100, background: 'rgba(245,158,11,0.1)', color: '#f59e0b', fontWeight: 500 }}>集中度高</span>
                        )}
                        {sig.safety_tags?.includes('honeypot') && (
                          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 100, background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 600 }}>蜜罐</span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--dark-400)' }}>
                        {sig.price_usd ? '$' + (sig.price_usd < 0.001 ? sig.price_usd.toFixed(8) : sig.price_usd < 1 ? sig.price_usd.toFixed(6) : sig.price_usd.toFixed(4)) : '-'}
                        {' - '}{sig.liquidity_usd >= 1000000 ? (sig.liquidity_usd / 1000000).toFixed(1) + 'M' : (sig.liquidity_usd / 1000).toFixed(1) + 'K'}
                        {' - 评分 ' + sc}
                        {sig.hourly_bars ? ' - ' + sig.hourly_bars + 'h' : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: sc >= 70 ? '#10b981' : sc >= 50 ? '#f59e0b' : '#ef4444' }}>{sc}%</div>
                      <p style={{ fontSize: 10, color: 'var(--dark-400)', marginTop: 1 }}>可信度</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16 }}>
                <button disabled={page <= 1} style={page <= 1 ? navBtnDisabled : navBtn} onClick={() => setPage(p => Math.max(1, p - 1))}>
                  <ChevronLeft size={14} />上一页
                </button>
                <span style={{ fontSize: 12, color: 'var(--dark-400)' }}>
                  第 {page} / {totalPages} 页
                </span>
                <button disabled={page >= totalPages} style={page >= totalPages ? navBtnDisabled : navBtn} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
                  下一页<ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>}
        </div>
      )}

      {/* 实盘交易 */}
      {view === "real" && <MomentumLivePage />}

      {/* 自动学习 */}
      {view === 'learn' && <LearningTab />}
    </div>
  );
}



function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr || '-';
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

declare const window: Window & typeof globalThis & { ethereum?: any };

function RealTradeTab() {
  const { address, isConnected } = useAccount();
  const { data: balance } = useBalance({ address });
  const { disconnect } = useDisconnect();
  const [copied, setCopied] = useState(false);
  const [autoTrade, setAutoTrade] = useState(false);
  const [recentSignals, setRecentSignals] = useState<any[]>([]);
  const [realTrades, setRealTrades] = useState<any[]>([]);
  const [pendingTx, setPendingTx] = useState<any[]>([]);
  const [activeView, setActiveView] = useState('dashboard');

  useEffect(() => {
    // P0 fix — use authenticated fetch with Bearer token
    const token = localStorage.getItem('aihunter_token');
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    fetch('/api/trade/realtrades?limit=50', { headers })
      .then(r => r.json())
      .then((d: any) => { if (d?.code === 200) setRealTrades(d.data || []); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!autoTrade) return;
    // P0 fix — use authenticated WebSocket with token
    const wsOrigin = window.location.origin.replace(/^http/, 'ws');
    let wsUrl = wsOrigin + '/ws';
    const token = localStorage.getItem('aihunter_token');
    if (token) {
      wsUrl += `?token=${encodeURIComponent(token)}`;
    } else {
      console.warn('[MomentumTab] No auth token found for WebSocket');
    }
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'signal' && msg.data?.action === 'buy') {
          setRecentSignals(prev => [msg.data, ...prev].slice(0, 20));
        }
        if (msg.type === 'REAL_TRADE') {
          setPendingTx(prev => [msg.data, ...prev].slice(0, 10));
        }
        if (msg.type === 'TRADE_CONFIRMED') {
          setPendingTx(prev => prev.filter(t => t.contract !== msg.data.contract));
          api.get('/api/trade/realtrades?limit=50').then((d: any) => { if (d?.code === 200) setRealTrades(d.data || []); }).catch(() => {});
        }
      } catch(e) {}
    };
    return () => ws.close();
  }, [autoTrade]);

  const copyAddr = () => {
    if (address) { navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  if (!isConnected || !address) {
    return (
      <div style={{ ...cardBase, padding: 40, textAlign: 'center' }}>
        <Wallet size={48} style={{ color: 'var(--dark-500)', marginBottom: 16 }} />
        <p style={{ fontSize: 16, fontWeight: 600, color: 'white', marginBottom: 8 }}>未连接钱包</p>
        <p style={{ fontSize: 13, color: 'var(--dark-400)', marginBottom: 20 }}>请连接钱包以查看实盘持仓和交易</p>
        <p style={{ fontSize: 12, color: 'var(--accent)', cursor: 'pointer' }}>点击右上角「连接钱包」按钮</p>
      </div>
    );
  }

  const ethBalance = balance ? parseFloat((balance as any).formatted).toFixed(4) : '0';
  const tabDefs = [
    { key: 'dashboard', label: '概览' },
    { key: 'signals', label: '信号' },
    { key: 'trades', label: '交易记录' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 子导航 */}
      <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 3 }}>
        {tabDefs.map(v => {
          const act = activeView === v.key;
          return (
            <button key={v.key} onClick={() => setActiveView(v.key)}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '8px 12px', borderRadius: 6, background: act ? 'rgba(99,102,241,0.15)' : 'transparent', border: 'none', color: act ? 'var(--accent)' : 'var(--dark-400)', cursor: 'pointer', fontSize: 11, fontWeight: 500 }}>
              {v.label}
            </button>
          );
        })}
      </div>

      {/* 概览 */}
      {activeView === 'dashboard' && (
        <>
          {/* 钱包信息 */}
          <div style={{ ...cardBase, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Wallet size={16} color="white" />
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>钱包信息</p>
                  <p style={{ fontSize: 10, color: '#10b981' }}>已连接</p>
                </div>
              </div>
              <button onClick={() => disconnect()}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 10, cursor: 'pointer' }}>
                断开连接
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: 8, marginBottom: 12 }}>
              <Wallet size={14} color="var(--accent)" />
              <span style={{ fontSize: 12, color: '#ccc', fontFamily: "'JetBrains Mono', monospace", flex: 1 }}>{shortAddr(address)}</span>
              <button onClick={copyAddr} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} color="var(--dark-400)" />}
              </button>
              <a href={`https://etherscan.io/address/${address}`} target="_blank" rel="noreferrer" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                <ExternalLink size={14} color="var(--dark-400)" />
              </a>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
              {['ETH', 'BSC', 'BASE', 'SOL'].map(c => {
                const native = ((balance as any)?.chain?.nativeCurrency?.symbol || '').toUpperCase();
                return (
                  <div key={c} style={{ padding: '10px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: 8, borderLeft: `3px solid ${chainColors[c] || '#808080'}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: chainColors[c] || '#808080' }} />
                      <p style={{ fontSize: 10, color: 'var(--dark-300)', fontWeight: 500 }}>{c}</p>
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>
                      {c === native ? ethBalance : '—'}
                      <span style={{ fontSize: 9, color: 'var(--dark-400)', marginLeft: 4 }}>{c === native ? balance?.symbol : ''}</span>
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 自动交易开关 */}
          <div style={{ ...cardBase, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Power size={14} color={autoTrade ? '#10b981' : 'var(--dark-400)'} />
                <p style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>自动交易</p>
              </div>
              <button onClick={() => setAutoTrade(!autoTrade)}
                style={{ padding: '6px 16px', borderRadius: 20, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: autoTrade ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.05)', color: autoTrade ? '#10b981' : 'var(--dark-400)' }}>
                {autoTrade ? '● 运行中' : '○ 已关闭'}
              </button>
            </div>
            <p style={{ fontSize: 10, color: 'var(--dark-400)', marginBottom: 12 }}>
              {autoTrade ? '实时监听 V2 引擎 BUY 信号，自动推送交易确认' : '开启后自动监听 BUY 信号并推送交易确认'}
            </p>
            {pendingTx.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <p style={{ fontSize: 10, color: 'var(--dark-400)', fontWeight: 500 }}>待确认交易</p>
                {pendingTx.map((tx, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(245,158,11,0.1)', borderRadius: 8, border: '1px solid rgba(245,158,11,0.2)' }}>
                    <RefreshCw size={12} color="#f59e0b" />
                    <span style={{ fontSize: 11, color: '#f59e0b', flex: 1 }}>{tx.tokenSymbol} ({tx.chain})</span>
                    <button onClick={async () => {
                      if (!window.ethereum) return alert("请安装 MetaMask");
                      const chainIdMap: Record<string,string> = {ETH:"0x1",BSC:"0x38",BASE:"0x2105"};
                      const routerAddr: Record<string,string> = {ETH:"0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",BSC:"0x10ED43C718714eb63d5aA57B78B54704E256024E",BASE:"0x2626664c2603336E57B271c5C0b26F421741e481"};
                      const nativeWrap: Record<string,string> = {ETH:"0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",BSC:"0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",BASE:"0x4200000000000000000000000000000000000006"};
                      const cid = chainIdMap[tx.chain];
                      const router = routerAddr[tx.chain];
                      const wrap = nativeWrap[tx.chain];
                      if (!router || !cid) return alert("暂不支持的链");
                      try {
                        await window.ethereum.request({method:"wallet_switchEthereumChain",params:[{chainId:cid}]});
                        const accounts = await window.ethereum.request({method:"eth_requestAccounts"});
                        const amountIn = "0x" + (0.01 * 1e18).toString(16); // 0.01 ETH 测试
                        const amountOutMin = "0x1"; // 最小输出
                        const deadline = "0x" + (Math.floor(Date.now()/1000) + 600).toString(16);
                        const to = accounts[0];
                        const swapData = "0x7ff36ab5" +  // swapExactETHForTokens
                          amountOutMin.slice(2).padStart(64,"0") +
                          deadline.slice(2).padStart(64,"0") +
                          "0000000000000000000000000000000000000000000000000000000000000080" +
                          "0000000000000000000000000000000000000000000000000000000000000002" +
                          "000000000000000000000000" + wrap.slice(2) +
                          "000000000000000000000000" + tx.tokenAddress.slice(2).padStart(64,"0") +
                          "000000000000000000000000" + to.slice(2).padStart(64,"0") +
                          "0000000000000000000000000000000000000000000000000000000000000001";
                        await window.ethereum.request({
                          method:"eth_sendTransaction",
                          params:[{from:accounts[0],to:router,data:swapData,value:amountIn}]
                        });
                        alert("交易已发送: " + tx.slice(0, 10) + "...");
                        // 上报后端
                        api.post("/api/trade/confirm",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chain:tx.chain,contract:tx.tokenAddress,symbol:tx.tokenSymbol,status:"open",amount:0.01,price:tx.price,txHash:tx})});
                      } catch(e:any) { alert("失败: " + (e.message || e)); }
                    }}
                      style={{padding:"4px 10px",borderRadius:6,border:"1px solid rgba(99,102,241,0.3)",background:"rgba(99,102,241,0.1)",color:"var(--accent)",fontSize:10,cursor:"pointer",fontWeight:500}}>
                      一键执行
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 统计卡片 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
            <div style={{ ...cardBase, padding: 14 }}>
              <p style={{ fontSize: 10, color: 'var(--dark-400)', marginBottom: 4 }}>今日信号</p>
              <p style={{ fontSize: 18, fontWeight: 700, color: 'white' }}>{recentSignals.length}</p>
            </div>
            <div style={{ ...cardBase, padding: 14 }}>
              <p style={{ fontSize: 10, color: 'var(--dark-400)', marginBottom: 4 }}>已执行交易</p>
              <p style={{ fontSize: 18, fontWeight: 700, color: 'white' }}>{realTrades.length}</p>
            </div>
            <div style={{ ...cardBase, padding: 14 }}>
              <p style={{ fontSize: 10, color: 'var(--dark-400)', marginBottom: 4 }}>待确认</p>
              <p style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b' }}>{pendingTx.length}</p>
            </div>
            <div style={{ ...cardBase, padding: 14 }}>
              <p style={{ fontSize: 10, color: 'var(--dark-400)', marginBottom: 4 }}>自动交易</p>
              <p style={{ fontSize: 18, fontWeight: 700, color: autoTrade ? '#10b981' : 'var(--dark-400)' }}>{autoTrade ? '开' : '关'}</p>
            </div>
          </div>
        </>
      )}

      {/* 信号列表 */}
      {activeView === 'signals' && (
        <div style={{ ...cardBase, padding: 20 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'white', marginBottom: 12 }}>
            实时信号 <span style={{ fontSize: 11, color: 'var(--dark-400)' }}>{recentSignals.length} 条</span>
          </p>
          {recentSignals.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 24 }}>
              <Activity size={32} style={{ color: 'var(--dark-500)', marginBottom: 12 }} />
              <p style={{ fontSize: 12, color: 'var(--dark-400)' }}>{autoTrade ? '等待 V2 引擎发出 BUY 信号...' : '请先开启自动交易'}</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {recentSignals.map((sig, i) => {
                const sc = sig.score || sig.confidence || 0;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: sc >= 60 ? '#10b981' : '#f59e0b' }} />
                    <span style={{ fontSize: 11, color: chainColors[sig.chain] || '#808080', fontWeight: 500, minWidth: 30 }}>{sig.chain}</span>
                    <span style={{ fontSize: 11, color: 'white', fontWeight: 600, flex: 1 }}>{sig.symbol || sig.contract?.slice(0, 10)}</span>
                    <span style={{ fontSize: 11, color: 'var(--dark-300)' }}>评分 {sc}</span>
                    <span style={{ fontSize: 10, color: 'var(--dark-400)' }}>
                      {sig.price_usd ? '$' + (sig.price_usd < 1 ? sig.price_usd.toFixed(6) : sig.price_usd.toFixed(4)) : '-'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 交易记录 */}
      {activeView === 'trades' && (
        <div style={{ ...cardBase, padding: 20 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'white', marginBottom: 12 }}>
            交易记录 <span style={{ fontSize: 11, color: 'var(--dark-400)' }}>{realTrades.length} 条</span>
          </p>
          {realTrades.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 24 }}>
              <BarChart3 size={32} style={{ color: 'var(--dark-500)', marginBottom: 12 }} />
              <p style={{ fontSize: 12, color: 'var(--dark-400)' }}>暂无交易记录</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '6px 10px', color: '#808080', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>链</th>
                    <th style={{ textAlign: 'left', padding: '6px 10px', color: '#808080', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>合约</th>
                    <th style={{ textAlign: 'right', padding: '6px 10px', color: '#808080', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>方向</th>
                    <th style={{ textAlign: 'right', padding: '6px 10px', color: '#808080', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>金额</th>
                    <th style={{ textAlign: 'right', padding: '6px 10px', color: '#808080', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>入场价</th>
                    <th style={{ textAlign: 'left', padding: '6px 10px', color: '#808080', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>状态</th>
                    <th style={{ textAlign: 'left', padding: '6px 10px', color: '#808080', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>时间</th>
                  </tr>
                </thead>
                <tbody>
                  {realTrades.map((t: any) => (
                    <tr key={t.id}>
                      <td style={{ padding: '6px 10px', color: chainColors[t.chain] || '#808080', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.03)' }}>{t.chain}</td>
                      <td style={{ padding: '6px 10px', color: '#ccc', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: 10 }}>{t.contract?.slice(0, 14) || '-'}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: t.side === 'buy' ? '#10b981' : '#ef4444', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.03)' }}>{t.side?.toUpperCase()}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: '#ccc', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>${parseFloat(t.amount_usd || 0).toFixed(2)}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: '#ccc', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>${parseFloat(t.entry_price || 0).toFixed(6)}</td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: t.status === 'open' ? 'rgba(16,185,129,0.1)' : 'rgba(99,102,241,0.1)', color: t.status === 'open' ? '#10b981' : '#808080' }}>{t.status === 'open' ? '持仓中' : '已完成'}</span>
                      </td>
                      <td style={{ padding: '6px 10px', color: 'var(--dark-400)', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: 10 }}>{(t.created_at || '').slice(11, 19)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// RealPositions removed (unused)
