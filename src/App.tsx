import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { createConfig, http, WagmiProvider } from 'wagmi';
import { mainnet, polygon, optimism, arbitrum, bsc, base } from 'wagmi/chains';
import { injected, metaMask, coinbaseWallet, walletConnect } from 'wagmi/connectors';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import ConnectModal from './components/ConnectModal';
import SignalsPage from './pages/SignalsPage';
import TradesPage from './pages/TradesPage';
import ConfigPage from './pages/ConfigPage';
import SystemPage from './pages/SystemPage';

const queryClient = new QueryClient();

const config = createConfig({
  chains: [mainnet, polygon, optimism, arbitrum, bsc, base],
  connectors: [
    injected(),
    metaMask(),
    coinbaseWallet({ appName: 'AIHunter' }),
    walletConnect({ projectId: 'b405f4f15938582260758473465a651b' }),
  ],
  transports: {
    [mainnet.id]: http(),
    [polygon.id]: http(),
    [optimism.id]: http(),
    [arbitrum.id]: http(),
    [bsc.id]: http(),
    [base.id]: http(),
  },
});

function AppContent() {
  const [collapsed, setCollapsed] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div style={{
        minHeight: '100vh', background: 'var(--dark-950)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: 40, height: 40,
          borderRadius: '50%', border: '2px solid rgba(99,102,241,0.3)',
          borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite',
        }} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--dark-950)' }}>
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      <main style={{
        flex: 1,
        marginLeft: collapsed ? 72 : 240,
        transition: 'margin 0.3s',
      }}>
        <TopBar onConnectClick={() => setShowConnect(true)} />
        <div style={{ padding: 24 }}>
          <Routes>
            <Route path="/" element={<Navigate to="/signals" replace />} />
            <Route path="/signals" element={<SignalsPage />} />
            <Route path="/trades" element={<TradesPage />} />
            <Route path="/config" element={<ConfigPage />} />
            <Route path="/system" element={<SystemPage />} />
          </Routes>
        </div>
      </main>
      <ConnectModal isOpen={showConnect} onClose={() => setShowConnect(false)} />

      {/* Background glow */}
      <div style={{
        position: 'fixed', top: 0, right: 0, width: 600, height: 600,
        background: 'rgba(99,102,241,0.05)', borderRadius: '50%',
        filter: 'blur(150px)', pointerEvents: 'none', zIndex: -1,
      }} />
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', width: 400, height: 400,
        background: 'rgba(139,92,246,0.05)', borderRadius: '50%',
        filter: 'blur(120px)', pointerEvents: 'none', zIndex: -1,
      }} />
    </div>
  );
}

export default function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <AppContent />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
