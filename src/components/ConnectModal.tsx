import { useEffect } from 'react';
import { X, Wallet } from 'lucide-react';
import { useConnect, useAccount } from 'wagmi';

const connectorIcons: Record<string, string> = {
  MetaMask: '🦊',
  'Coinbase Wallet': '🔵',
  WalletConnect: '🔗',
  Injected: '👛',
};

export default function ConnectModal({
  isOpen, onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { connect, connectors, isPending, error } = useConnect();
  const { isConnected } = useAccount();

  useEffect(() => {
    if (isConnected) onClose();
  }, [isConnected, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(8px)', zIndex: 100,
        }}
      />
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 101,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }}
      >
        <div
          style={{
            background: 'var(--dark-800)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 16, width: '100%', maxWidth: 400,
            boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
          }}
        >
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 32, height: 32, borderRadius: 12,
                  background: 'linear-gradient(135deg, var(--accent), var(--accent-purple))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Wallet size={16} color="white" />
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: 'white' }}>连接钱包</h2>
            </div>
            <button
              onClick={onClose}
              style={{ padding: 6, borderRadius: 8, color: 'var(--dark-400)', transition: 'color 0.2s' }}
            >
              <X size={20} />
            </button>
          </div>

          <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ fontSize: 13, color: 'var(--dark-400)', marginBottom: 4 }}>
              连接钱包后可使用实盘交易功能
            </p>
            {connectors.map((connector) => (
              <button
                key={connector.id}
                onClick={() => connect({ connector })}
                disabled={isPending}
                style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '12px 16px', borderRadius: 12,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  opacity: isPending ? 0.5 : 1,
                  cursor: isPending ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  textAlign: 'left' as const,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                }}
              >
                <span style={{ fontSize: 24 }}>{connectorIcons[connector.name] || '👛'}</span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 500, color: 'white' }}>{connector.name}</p>
                  <p style={{ fontSize: 12, color: 'var(--dark-400)' }}>
                    {connector.id === 'injected'
                      ? '浏览器钱包'
                      : `通过 ${connector.name} 连接`}
                  </p>
                </div>
                {isPending && (
                  <div
                    style={{
                      width: 20, height: 20,
                      borderRadius: '50%', border: '2px solid rgba(99,102,241,0.3)',
                      borderTopColor: 'var(--accent)',
                      animation: 'spin 0.8s linear infinite',
                    }}
                  />
                )}
              </button>
            ))}
            {error && (
              <p style={{ fontSize: 12, color: 'var(--accent-red)', marginTop: 8 }}>
                {error.message}
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
