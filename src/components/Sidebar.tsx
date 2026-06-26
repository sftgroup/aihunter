import { Link, useLocation } from 'react-router-dom';
import { TrendingUp, PiggyBank, Settings, Monitor, ChevronLeft, ChevronRight, Crosshair, Activity } from 'lucide-react';

const navItems = [
  { label: "DEX 交易", icon: TrendingUp, href: "/trade" },
  { label: "DeFi 套利", icon: PiggyBank, href: "/defi" },
  { label: "实盘交易", icon: Activity, href: "/live" },
  { label: "配置", icon: Settings, href: "/config" },
  { label: "系统", icon: Monitor, href: "/system" },
] as const;

const linkStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12,
  padding: '10px 12px', borderRadius: 12,
  transition: 'all 0.2s', border: '1px solid transparent',
  fontSize: 14, fontWeight: 500,
};

export default function Sidebar({
  collapsed, setCollapsed,
}: {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}) {
  const location = useLocation();

  return (
    <aside
      style={{
        position: 'fixed', left: 0, top: 0, height: '100vh', zIndex: 40,
        display: 'flex', flexDirection: 'column',
        width: collapsed ? 72 : 240,
        background: 'rgba(10,10,10,0.8)',
        backdropFilter: 'blur(24px)',
        borderRight: '1px solid rgba(255,255,255,0.05)',
        transition: 'width 0.3s',
      }}
    >
      {/* Logo */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '0 16px', height: 64,
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}
      >
        <div
          style={{
            width: 32, height: 32, borderRadius: 12,
            background: 'linear-gradient(135deg, var(--accent), var(--accent-purple))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Crosshair size={16} color="white" />
        </div>
        {!collapsed && (
          <span style={{ fontSize: 18, fontWeight: 700, color: 'white' }}>
            AI<span style={{ color: 'var(--accent)' }}>Hunter</span>
          </span>
        )}
      </div>

      {/* Nav Items */}
      <nav
        style={{
          flex: 1, padding: '16px 8px',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}
      >
        {navItems.map((item) => {
          const isActive = location.pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              to={item.href}
              style={{
                ...linkStyle,
                justifyContent: collapsed ? 'center' : 'flex-start',
                background: isActive ? 'rgba(99,102,241,0.1)' : 'transparent',
                color: isActive ? 'var(--accent)' : 'var(--dark-300)',
                borderColor: isActive ? 'rgba(99,102,241,0.2)' : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = 'transparent';
              }}
            >
              <Icon size={20} style={{ flexShrink: 0 }} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Collapse button */}
      <div style={{ padding: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <button
          onClick={() => setCollapsed(!collapsed)}
          style={{
            ...linkStyle, width: '100%', justifyContent: collapsed ? 'center' : 'flex-start',
            color: 'var(--dark-400)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
            e.currentTarget.style.color = 'white';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--dark-400)';
          }}
        >
          {collapsed ? <ChevronRight size={20} /> : (
            <>
              <ChevronLeft size={20} />
              <span style={{ fontSize: 14 }}>折叠</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
