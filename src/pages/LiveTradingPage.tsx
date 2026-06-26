import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount } from 'wagmi';
import { Wallet, TrendingUp, Activity, Shield, RefreshCw, Copy, ArrowUp, ArrowDown, ExternalLink, LogOut, Key, Mail, Send, X } from 'lucide-react';
import { liveApiV3, walletApiV2 } from '../utils/api';

const T = {
  accent: '#6366f1', accentGreen: '#10b981', accentRed: '#ef4444',
  accentBlue: '#3b82f6', accentPurple: '#8b5cf6', accentOrange: '#f59e0b', accentCyan: '#06b6d4',
  dark50: '#f0f0f0', dark100: '#e0e0e0', dark200: '#c0c0c0', dark300: '#a0a0a0',
  dark400: '#808080', dark500: '#606060', dark600: '#404040', dark700: '#2a2a2a',
  dark800: '#1a1a1a', dark900: '#111111', dark950: '#0a0a0a',
};

const cardBase: React.CSSProperties = {
  background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
  backdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 16,
  boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
  padding: 20,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: T.dark400, textTransform: 'uppercase',
  letterSpacing: '0.05em', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8,
};

function fmtAddr(addr?: string) {
  if (!addr || addr.length < 10) return addr || '-';
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function fmtPnl(v: number | string | undefined) {
  const n = Number(v ?? 0);
  return (n >= 0 ? '+' : '') + '$' + Math.abs(n).toFixed(2);
}

function fmtTime(ts: string) {
  try { return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }); }
  catch { return ts || ''; }
}

function WalletPanel() {
  const [wallet, setWallet] = useState<any>(null);
  const [wallets, setWallets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loginStep, setLoginStep] = useState<'idle'|'email'|'otp'>('idle');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginOtp, setLoginOtp] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginSending, setLoginSending] = useState(false);
  const [loginVerifying, setLoginVerifying] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTarget, setTransferTarget] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferChain, setTransferChain] = useState('ethereum');
  const [transferContract, setTransferContract] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferMsg, setTransferMsg] = useState('');
  const { address } = useAccount();
  const userId = address || '';

  const loadStatus = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    try {
      const res = await walletApiV2.getStatus(userId);
      if (res && (res as any).code === 200) {
        const data = (res as any).data;
        if (data && data.wallet_address) {
          setWallet(data);
          if (data.wallets?.length) setWallets(data.wallets);
        } else {
          setWallet(null); setWallets([]);
        }
      }
    } catch (_) {}
    setLoading(false);
  }, [userId]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handleSwitchWallet = async (addr: string) => {
    try { await walletApiV2.switch_(userId, addr); loadStatus(); } catch (_) {}
  };

  const handleLoginEmail = async () => {
    if (!loginEmail.trim()) return;
    setLoginError('');
    setLoginSending(true);
    try {
      const res = await walletApiV2.login(userId, loginEmail);
      if (res && (res as any).code === 200) {
        setLoginStep('otp');
      } else {
        setLoginError((res as any)?.message || '发送失败');
      }
    } catch (e: any) { setLoginError(e?.message || '网络错误'); }
    setLoginSending(false);
  };

  const handleVerifyOtp = async () => {
    if (!loginOtp.trim()) return;
    setLoginVerifying(true);
    setLoginError('');
    try {
      const res = await walletApiV2.verify(userId, loginOtp);
      if (res && (res as any).code === 200) {
        setLoginStep('idle');
        setLoginEmail('');
        setLoginOtp('');
        loadStatus();
      } else {
        setLoginError((res as any)?.message || '验证失败');
      }
    } catch (e: any) { setLoginError(e?.message || '网络错误'); }
    setLoginVerifying(false);
  };

  const handleLogout = async () => {
    try { await walletApiV2.logout(userId); } catch (_) {}
    setWallet(null); setWallets([]);
  };

  const handleRevoke = async () => {
    try { await walletApiV2.revoke(userId); } catch (_) {}
    loadStatus();
  };

  const handleTransfer = async () => {
    if (!transferTarget.trim() || !transferAmount.trim()) return;
    setTransferLoading(true);
    setTransferMsg('');
    try {
      const res = await walletApiV2.send(userId, transferTarget.trim(), transferChain, Number(transferAmount), transferContract.trim() || undefined);
      if (res && (res as any).code === 200) {
        setTransferMsg('转账已提交');
        setShowTransfer(false);
        setTransferTarget('');
        setTransferAmount('');
        setTransferContract('');
      } else {
        setTransferMsg((res as any)?.message || '转账失败');
      }
    } catch (e: any) {
      setTransferMsg(e?.message || '网络错误');
    }
    setTransferLoading(false);
  };

  const authorized = wallet?.authorized ?? false;
  const hasWallets = wallets.length > 0;
  const fmtAddr = (a: string) => a ? `${a.slice(0,6)}...${a.slice(-4)}` : '';

  return (
    <div style={cardBase}>
      <h3 style={sectionTitle}><Wallet size={14} color={T.accent} /> Agentic Wallet</h3>
      {!userId ? (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ width: 40, height: 40, borderRadius: 20, background: 'rgba(99,102,241,0.1)', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Wallet size={20} color={T.accent} />
          </div>
          <p style={{ fontSize: 12, color: T.dark300 }}>请先连接 MetaMask 钱包</p>
        </div>
      ) : loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '16px 0' }}>
          <RefreshCw size={14} className="animate-spin" color={T.dark400} />
          <span style={{ fontSize: 12, color: T.dark400 }}>加载钱包状态...</span>
        </div>
      ) : wallet ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>OKX TEE 钱包</div>
              <div style={{ fontSize: 10, color: T.dark400, textTransform: 'uppercase', marginTop: 2 }}>{wallet.chain || 'ETH'}</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={handleRevoke} style={{ padding: '4px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: T.dark300, fontSize: 11, cursor: 'pointer' }}>撤销</button>
              <button onClick={handleLogout} style={{ padding: '4px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: T.dark300, fontSize: 11, cursor: 'pointer' }}>断开</button>
            </div>
          </div>

          {/* Multi-address list */}
          {hasWallets && (
            <div style={{ marginBottom: 12, background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: '6px 8px' }}>
              <div style={{ fontSize: 10, color: T.dark400, marginBottom: 6 }}>钱包地址列表</div>
              {wallets.map((w: any, i: number) => (
                <div
                  key={w.wallet_address || i}
                  onClick={() => w.wallet_address !== wallet.wallet_address && handleSwitchWallet(w.wallet_address)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '4px 8px', borderRadius: 6,
                    cursor: w.wallet_address === wallet.wallet_address ? 'default' : 'pointer',
                    background: w.wallet_address === wallet.wallet_address ? 'rgba(99,102,241,0.1)' : 'transparent',
                    marginBottom: 2,
                  }}
                >
                  <span style={{ fontSize: 10, fontFamily: 'monospace', color: w.wallet_address === wallet.wallet_address ? T.accent : T.dark300 }}>
                    {w.label || fmtAddr(w.wallet_address)}
                  </span>
                  <span style={{ fontSize: 10, fontFamily: 'monospace', color: T.dark300 }}>
                    ${Number(w.totalUsd ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Add new address */}
          <button
            onClick={() => { setLoginEmail(wallet.email || ''); setLoginStep('email'); setLoginError(''); }}
            style={{
              width: '100%', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
              borderRadius: 8, color: T.accent, fontSize: 10, padding: '6px 0', cursor: 'pointer', marginBottom: 12,
            }}
          >+ 添加新地址</button>

          {/* Inline email/OTP flow */}
          {loginStep === 'email' && (
            <div style={{ padding: '4px 8px', marginBottom: 12, background: 'rgba(99,102,241,0.05)', borderRadius: 10 }}>
              <input
                type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLoginEmail()}
                placeholder="输入邮箱创建新地址" autoFocus
                style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 8, color: 'white', fontSize: 13, padding: '8px 12px', outline: 'none' }}
              />
              {loginError && <p style={{ fontSize: 10, color: T.accentRed, marginTop: 4, textAlign: 'center' }}>{loginError}</p>}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button onClick={() => { setLoginStep('idle'); setLoginError(''); }} style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: T.dark300, fontSize: 11, padding: '6px 0', cursor: 'pointer' }}>取消</button>
                <button onClick={handleLoginEmail} disabled={loginSending} style={{ flex: 1, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', borderRadius: 8, color: 'white', fontSize: 11, fontWeight: 600, padding: '6px 0', cursor: loginSending ? 'default' : 'pointer', opacity: loginSending ? 0.6 : 1 }}>{loginSending ? '发送中...' : '发送验证码'}</button>
              </div>
            </div>
          )}
          {loginStep === 'otp' && (
            <div style={{ padding: '4px 8px', marginBottom: 12, background: 'rgba(99,102,241,0.05)', borderRadius: 10 }}>
              <input
                type="text" value={loginOtp} onChange={e => setLoginOtp(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleVerifyOtp()}
                placeholder="输入验证码" autoFocus maxLength={6}
                style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 8, color: 'white', fontSize: 13, fontWeight: 600, padding: '8px 12px', textAlign: 'center', letterSpacing: 3, outline: 'none' }}
              />
              {loginError && <p style={{ fontSize: 10, color: T.accentRed, marginTop: 4, textAlign: 'center' }}>{loginError}</p>}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button onClick={() => { setLoginStep('idle'); setLoginError(''); }} style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: T.dark300, fontSize: 11, padding: '6px 0', cursor: 'pointer' }}>取消</button>
                <button onClick={handleVerifyOtp} disabled={loginVerifying} style={{ flex: 1, background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', borderRadius: 8, color: 'white', fontSize: 11, fontWeight: 600, padding: '6px 0', cursor: loginVerifying ? 'default' : 'pointer', opacity: loginVerifying ? 0.6 : 1 }}>{loginVerifying ? '验证中...' : '验证'}</button>
              </div>
            </div>
          )}

          {/* Address + copy + transfer */}
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: T.dark300 }}>{fmtAddr(wallet.wallet_address)}</span>
            <button onClick={() => navigator.clipboard.writeText(wallet.wallet_address)} style={{ background: 'none', border: 'none', color: T.dark400, cursor: 'pointer', padding: 0 }}>
              <Copy size={13} />
            </button>
            <button onClick={() => setShowTransfer(true)} style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid var(--accent-green)', borderRadius: 8, color: 'var(--accent-green)', fontSize: 11, fontWeight: 600, padding: '4px 10px', cursor: 'pointer', marginLeft: 8 }}>💸 转出</button>
          </div>

          {/* Balance + auth status */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 10, color: T.dark400, textTransform: 'uppercase' }}>余额</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'white', fontFamily: 'monospace' }}>
                ${Number(wallet.totalUsd ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, background: authorized ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: authorized ? T.accentGreen : T.accentRed, animation: authorized ? 'pulseLED 2s infinite' : 'none' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: authorized ? T.accentGreen : T.accentRed }}>{authorized ? '已授权' : '未授权'}</span>
            </div>
          </div>
          {authorized && wallet.expires_at && (
            <div style={{ fontSize: 10, color: T.dark400, marginTop: 8 }}>有效期至 {String(wallet.expires_at).slice(0, 10)}</div>
          )}

          {/* token balances */}
          {wallet.balances && wallet.balances.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {wallet.balances.slice(0, 4).map((b: any, i: number) => (
                <span key={i} style={{ padding: '2px 8px', borderRadius: 6, fontSize: 10, background: 'rgba(255,255,255,0.04)', color: T.dark300, fontFamily: 'monospace' }}>{b.symbol || b.asset}: {Number(b.balance || 0).toFixed(4)}</span>
              ))}
            </div>
          )}
        </>
      ) : (
        <div style={{ textAlign: 'center', paddingTop: 16, paddingBottom: 20 }}>
          {loginStep === 'idle' && (
            <div>
              <div style={{ width: 40, height: 40, borderRadius: 20, background: 'rgba(99,102,241,0.1)', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Wallet size={20} color={T.accent} />
              </div>
              <p style={{ fontSize: 12, color: T.dark300, marginBottom: 4 }}>未连接 Agentic Wallet</p>
              <p style={{ fontSize: 10, color: T.dark500, marginBottom: 16 }}>用你的邮箱创建独立 TEE 安全钱包</p>
              <button
                onClick={() => setLoginStep('email')}
                style={{
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  border: 'none', color: 'white', borderRadius: 10,
                  padding: '10px 28px', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
                }}
              ><Wallet size={14} /> 连接钱包</button>
            </div>
          )}
          {loginStep === 'email' && (
            <div style={{ padding: '0 4px' }}>
              <p style={{ fontSize: 12, color: T.dark300, marginBottom: 12 }}>输入邮箱查找或创建钱包</p>
              <input
                type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLoginEmail()}
                placeholder="your@email.com" autoFocus
                style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 8, color: 'white', fontSize: 13, padding: '8px 12px', outline: 'none', marginBottom: 12 }}
              />
              {loginError && <p style={{ fontSize: 10, color: T.accentRed, marginTop: 4, textAlign: 'center' }}>{loginError}</p>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setLoginStep('idle'); setLoginError(''); }} style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: T.dark300, fontSize: 12, padding: '8px 0', cursor: 'pointer' }}>取消</button>
                <button onClick={handleLoginEmail} disabled={loginSending} style={{ flex: 1, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', borderRadius: 8, color: 'white', fontSize: 12, fontWeight: 600, padding: '8px 0', cursor: loginSending ? 'default' : 'pointer', opacity: loginSending ? 0.6 : 1 }}>{loginSending ? '发送中...' : '登录 / 创建'}</button>
              </div>
            </div>
          )}
          {loginStep === 'otp' && (
            <div style={{ padding: '0 4px' }}>
              <p style={{ fontSize: 12, color: T.dark300, marginBottom: 12 }}>验证码已发送至 {loginEmail}</p>
              <input
                type="text" value={loginOtp} onChange={e => setLoginOtp(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleVerifyOtp()}
                placeholder="输入验证码" autoFocus maxLength={6}
                style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 8, color: 'white', fontSize: 13, fontWeight: 600, padding: '8px 12px', textAlign: 'center', letterSpacing: 3, outline: 'none', marginBottom: 12 }}
              />
              {loginError && <p style={{ fontSize: 10, color: T.accentRed, marginTop: 4, textAlign: 'center' }}>{loginError}</p>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setLoginStep('idle'); setLoginError(''); }} style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: T.dark300, fontSize: 12, padding: '8px 0', cursor: 'pointer' }}>取消</button>
                <button onClick={handleVerifyOtp} disabled={loginVerifying} style={{ flex: 1, background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', borderRadius: 8, color: 'white', fontSize: 12, fontWeight: 600, padding: '8px 0', cursor: loginVerifying ? 'default' : 'pointer', opacity: loginVerifying ? 0.6 : 1 }}>{loginVerifying ? '验证中...' : '验证'}</button>
              </div>
            </div>
          )}
        </div>
      )}
      {showTransfer && (
        <>
          <div onClick={() => { setShowTransfer(false); setTransferMsg(''); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 999 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 1000, width: 400, background: 'linear-gradient(135deg, rgba(17,17,17,0.98) 0%, rgba(26,26,26,0.98) 100%)', backdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: 24, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Send size={18} color={T.accentGreen} /></div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'white' }}>转出资金</div>
                  <div style={{ fontSize: 11, color: T.dark400 }}>从 OKX TEE 钱包转出</div>
                </div>
              </div>
              <button onClick={() => { setShowTransfer(false); setTransferMsg(''); }} style={{ background: 'none', border: 'none', color: T.dark400, cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, color: T.dark400, display: 'block', marginBottom: 6 }}>目标地址</label>
                <input placeholder="0x..." value={transferTarget} onChange={(e) => setTransferTarget(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: 'white', fontSize: 13, outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: T.dark400, display: 'block', marginBottom: 6 }}>金额</label>
                  <input placeholder="0.00" value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: 'white', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: T.dark400, display: 'block', marginBottom: 6 }}>链</label>
                  <select value={transferChain} onChange={(e) => setTransferChain(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: 'white', fontSize: 13, outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}>
                    <option value="ethereum" style={{background:'#1a1a1a'}}>ETH</option>
                    <option value="base" style={{background:'#1a1a1a'}}>BASE</option>
                    <option value="bsc" style={{background:'#1a1a1a'}}>BSC</option>
                    <option value="sol" style={{background:'#1a1a1a'}}>SOL</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, color: T.dark400, display: 'block', marginBottom: 6 }}>代币合约（可选，不填为原生代币）</label>
                <input placeholder="0x... 或留空" value={transferContract} onChange={(e) => setTransferContract(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: 'white', fontSize: 13, outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box' }} />
              </div>
              {transferMsg && (
                <div style={{ padding: '8px 12px', borderRadius: 8, fontSize: 12, background: transferMsg === '转账已提交' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: transferMsg === '转账已提交' ? T.accentGreen : T.accentRed }}>{transferMsg}</div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                <button onClick={() => { setShowTransfer(false); setTransferMsg(''); }}
                  style={{ padding: '8px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: T.dark300, cursor: 'pointer' }}>取消</button>
                <button onClick={handleTransfer} disabled={transferLoading || !transferTarget.trim() || !transferAmount.trim()}
                  style={{ padding: '8px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.2)', color: T.accentGreen, cursor: (transferLoading || !transferTarget.trim() || !transferAmount.trim()) ? 'not-allowed' : 'pointer', opacity: (transferLoading || !transferTarget.trim() || !transferAmount.trim()) ? 0.5 : 1 }}>
                  {transferLoading ? '提交中...' : '确认转出'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}


function StrategyTradingPanel() {
  const { address } = useAccount();
  const userId = address || '';
  const [strategies, setStrategies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await liveApiV3.getStatus(userId);
      if (res && (res as any).code === 200 && (res as any).data) {
        setStrategies(((res as any).data).strategies || []);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (id: string, active: boolean) => {
    setToggling(id);
    try {
      await liveApiV3.toggleStrategy(userId, id, active);
      setStrategies(prev => prev.map((s: any) => (s.strategy_id || s.id) === id ? { ...s, active } : s));
    } catch (e) { console.error(e); }
    setToggling(null);
  };

  return (
    <div style={cardBase}>
      <h3 style={sectionTitle}><Activity size={14} color={T.accentGreen} /> 策略运行状态</h3>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px 0' }}><RefreshCw size={14} className="animate-spin" color={T.dark400} /><p style={{ fontSize: 12, color: T.dark400, marginTop: 8 }}>加载中...</p></div>
      ) : strategies.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px 0' }}><Activity size={24} color={T.dark500} style={{ opacity: 0.3, marginBottom: 8 }} /><p style={{ fontSize: 12, color: T.dark400 }}>暂无策略运行状态</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {strategies.map((s: any) => {
            const isActive = s.active || s.enabled;
            return (
              <div key={s.strategy_id || s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: isActive ? '1px solid rgba(16,185,129,0.15)' : '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: isActive ? 'rgba(16,185,129,0.1)' : 'rgba(128,128,128,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <TrendingUp size={16} color={isActive ? T.accentGreen : T.dark400} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>{s.display_name || s.name || s.strategy_id}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 2 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, padding: '1px 6px', borderRadius: 100, background: isActive ? 'rgba(16,185,129,0.1)' : 'rgba(128,128,128,0.1)', color: isActive ? T.accentGreen : T.dark400 }}>
                        <span style={{ width: 4, height: 4, borderRadius: '50%', background: isActive ? T.accentGreen : T.dark400 }} />
                        {isActive ? '运行中' : '已暂停'}
                      </span>
                      <span style={{ fontSize: 10, color: T.dark400 }}>{s.today_trades || 0} 笔</span>
                      <span style={{ fontSize: 10, color: (s.today_pnl || 0) >= 0 ? T.accentGreen : T.accentRed }}>{fmtPnl(s.today_pnl)}</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => handleToggle(s.strategy_id || s.id, !isActive)}
                    disabled={toggling === (s.strategy_id || s.id)}
                    style={{ padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: isActive ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', border: isActive ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(16,185,129,0.2)', color: isActive ? T.accentRed : T.accentGreen, cursor: toggling === (s.strategy_id || s.id) ? 'not-allowed' : 'pointer' }}
                  >{toggling === (s.strategy_id || s.id) ? '...' : (isActive ? '暂停' : '开启')}</button>
                  <button style={{ padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)', color: T.accent, cursor: 'pointer' }}>配置</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RiskPanel() {
  const { address } = useAccount();
  const userId = address || '';
  const [risk, setRisk] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await liveApiV3.getStatus(userId);
        if (res && (res as any).code === 200 && (res as any).data) {
          setRisk(((res as any).data).risk || null);
        }
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  const todayLoss = risk?.today_loss ?? 0;
  const dailyMaxLoss = risk?.daily_max_loss ?? 1000;
  const lossPct = dailyMaxLoss > 0 ? Math.min(todayLoss / dailyMaxLoss, 1) : 0;
  const currentConcurrency = risk?.current_concurrency ?? 0;
  const maxConcurrency = risk?.max_concurrency ?? 5;
  const gasStrategy = risk?.gas_strategy || 'medium';

  return (
    <div style={cardBase}>
      <h3 style={sectionTitle}><Shield size={14} color={T.accentOrange} /> 全局风控</h3>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px 0' }}><RefreshCw size={14} className="animate-spin" color={T.dark400} /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: T.dark400 }}>日亏损上限</span>
              <span style={{ fontSize: 11, color: lossPct > 0.8 ? T.accentRed : T.dark300 }}>${todayLoss.toFixed(2)} / ${dailyMaxLoss.toFixed(2)}</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 3, background: lossPct > 0.8 ? T.accentRed : (lossPct > 0.5 ? T.accentOrange : T.accentGreen), width: (lossPct * 100) + '%', transition: 'width 0.3s' }} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: T.dark400 }}>当前并发 / 最大并发</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>{currentConcurrency} / {maxConcurrency}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: T.dark400 }}>Gas 策略</span>
            <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: gasStrategy === 'fast' ? 'rgba(239,68,68,0.1)' : gasStrategy === 'slow' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', color: gasStrategy === 'fast' ? T.accentRed : gasStrategy === 'slow' ? T.accentGreen : T.accentOrange }}>
              {gasStrategy === 'fast' ? '快' : gasStrategy === 'slow' ? '慢' : '中'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function TradeRecordStream() {
  const { address } = useAccount();
  const userId = address || '';
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const load = useCallback(async () => {
    try {
      const res = await liveApiV3.getRecords(userId, { size: 20 });
      if (res && (res as any).code === 200 && (res as any).data) {
        const data = (res as any).data;
        setRecords((data.records || data) as any[]);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [load]);

  return (
    <div style={cardBase}>
      <h3 style={{ ...sectionTitle, marginBottom: 12 }}>
        <Activity size={14} color={T.accentCyan} /> 交易记录
        <span style={{ marginLeft: 'auto', fontWeight: 400, fontSize: 11, textTransform: 'none', color: T.dark500 }}>自动刷新 · 5秒</span>
      </h3>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px 0' }}><RefreshCw size={14} className="animate-spin" color={T.dark400} /></div>
      ) : records.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0' }}><Activity size={24} color={T.dark500} style={{ opacity: 0.3, marginBottom: 8 }} /><p style={{ fontSize: 12, color: T.dark400 }}>暂无交易记录</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {records.map((r: any, i: number) => {
            const isBuy = (r.direction || r.side) === 'BUY';
            const isCompleted = r.status === 'success' || r.status === 'completed' || r.status === 'filled';
            const isFailed = r.status === 'failed' || r.status === 'rejected';
            return (
              <div key={r.id || i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', fontSize: 12 }}>
                <span style={{ fontFamily: 'monospace', color: T.dark400, fontSize: 11, flexShrink: 0 }}>{fmtTime(r.created_at || r.createdAt || r.time || '')}</span>
                <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, flexShrink: 0, background: 'rgba(99,102,241,0.12)', color: T.accent }}>{r.strategy || r.strategy_id || '-'}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontWeight: 700, fontSize: 11, flexShrink: 0, color: isBuy ? T.accentGreen : T.accentRed }}>
                  {isBuy ? <ArrowUp size={10} /> : <ArrowDown size={10} />}{r.direction || r.side || ''}
                </span>
                <span style={{ fontFamily: 'monospace', color: 'white', flexShrink: 0 }}>{r.symbol || r.token || '-'}</span>
                <span style={{ fontFamily: 'monospace', color: T.dark300, fontSize: 11, flexShrink: 0 }}>${Number(r.amount_in || r.amount || r.amountInUsdt || 0).toFixed(2)}</span>
                <span style={{ flex: 1 }} />
                {isCompleted && <span style={{ color: T.accentGreen, fontWeight: 600, fontSize: 11 }}>{fmtPnl(r.pnl_usd || r.pnl || r.netProfitUsdt)}</span>}
                {isFailed && <span style={{ color: T.accentRed, fontWeight: 600, fontSize: 11 }}>失败</span>}
                {!isCompleted && !isFailed && <span style={{ color: T.accentOrange, fontSize: 11 }}>等待确认</span>}
                {r.tx_hash && <a href={'https://etherscan.io/tx/' + r.tx_hash} target="_blank" rel="noopener noreferrer" style={{ color: T.accent, fontSize: 10, flexShrink: 0, textDecoration: 'none' }}><ExternalLink size={10} /></a>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function LiveTradingPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'white' }}>实盘交易控制台</h1>
        <p style={{ fontSize: 14, color: T.dark400, marginTop: 4 }}>统一交易启停 · 策略运行监控 · 风控参数</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <StrategyTradingPanel />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <WalletPanel />
          <RiskPanel />
        </div>
      </div>
      <TradeRecordStream />
      <style>{'@keyframes fadeSlideIn { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }'}</style>
    </div>
  );
}
