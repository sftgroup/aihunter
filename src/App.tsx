import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { createConfig, http, WagmiProvider } from 'wagmi';
import { mainnet, polygon, optimism, arbitrum, bsc, base } from 'wagmi/chains';
import { injected, metaMask, coinbaseWallet, walletConnect } from 'wagmi/connectors';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import ConnectModal from './components/ConnectModal';
import ErrorBoundary from './components/ErrorBoundary';
import DexPage from './pages/DexPage';
import DeFiPage from "./pages/DeFiPage";
import MomentumDetailPage from './pages/MomentumDetailPage';
import SpreadArbDetailPage from './pages/SpreadArbDetailPage';
import LiveTradingPage from "./pages/LiveTradingPage";
import ConfigPage from './pages/ConfigPage';
import SystemPage from './pages/SystemPage';

const queryClient = new QueryClient();

const config = createConfig({
  chains: [mainnet, polygon, optimism, arbitrum, bsc, base],
  connectors: [
    injected(),
    metaMask(),
    coinbaseWallet({ appName: 'AIHunter' }),
    walletConnect({ projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'b405f4f15938582260758473465a651b' }),
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
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const handleResize = useCallback(() => {
    setIsMobile(window.innerWidth < 768);
  }, []);

  useEffect(() => {
    setMounted(true);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

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
        marginLeft: isMobile ? 0 : (collapsed ? 72 : 240),
        transition: 'margin 0.3s',
        minWidth: 0, /* 防止 flex 溢出 */
      }}>
        <TopBar onConnectClick={() => setShowConnect(true)} />
        <div style={{ padding: 24 }} className="page-enter">
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Navigate to="/dex" replace />} />
              <Route path="/dex/momentum" element={<MomentumDetailPage />} />
              <Route path="/defi" element={<DeFiPage />} />
              <Route path="/defi/spread-arb" element={<SpreadArbDetailPage />} />
              <Route path="/live" element={<LiveTradingPage />} />
              <Route path="/dex" element={<DexPage />} />
              <Route path="/config" element={<ConfigPage />} />
              <Route path="/system" element={<SystemPage />} />
            </Routes>
          </ErrorBoundary>
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
        <ErrorBoundary>
          <AppContent />
        </ErrorBoundary>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
