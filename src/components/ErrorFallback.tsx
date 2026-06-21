import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Link } from 'react-router-dom';

interface ErrorFallbackProps {
  error?: Error;
  resetErrorBoundary?: () => void;
}

export default function ErrorFallback({ error, resetErrorBoundary }: ErrorFallbackProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--dark-950)',
        padding: 24,
      }}
    >
      {/* Error icon */}
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          background: 'rgba(239,68,68,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 24,
          border: '1px solid rgba(239,68,68,0.2)',
        }}
      >
        <AlertTriangle size={40} style={{ color: 'var(--accent-red)' }} />
      </div>

      {/* Title */}
      <h1
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: 'white',
          marginBottom: 8,
          textAlign: 'center',
        }}
      >
        出了点问题
      </h1>

      {/* Description */}
      <p
        style={{
          fontSize: 14,
          color: 'var(--dark-400)',
          textAlign: 'center',
          maxWidth: 400,
          marginBottom: 32,
          lineHeight: 1.6,
        }}
      >
        AIHunter 遇到了一个预期外的错误。请尝试刷新页面或返回首页。
      </p>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
        <button
          onClick={resetErrorBoundary}
          className="btn-primary"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
            borderRadius: 12,
            background: 'var(--accent)',
            color: 'white',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
            border: 'none',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--accent-600)';
            e.currentTarget.style.boxShadow = '0 0 16px rgba(99,102,241,0.3)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--accent)';
            e.currentTarget.style.boxShadow = 'none';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <RefreshCw size={16} />
          重试
        </button>

        <Link
          to="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
            borderRadius: 12,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'var(--dark-200)',
            fontSize: 14,
            fontWeight: 500,
            textDecoration: 'none',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
            e.currentTarget.style.color = 'white';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
            e.currentTarget.style.color = 'var(--dark-200)';
          }}
        >
          <Home size={16} />
          返回首页
        </Link>
      </div>

      {/* Error details - collapsible */}
      {error && (
        <details
          style={{
            maxWidth: 500,
            width: '100%',
            background: 'rgba(239,68,68,0.05)',
            border: '1px solid rgba(239,68,68,0.15)',
            borderRadius: 12,
            padding: 12,
          }}
        >
          <summary
            style={{
              fontSize: 12,
              color: 'var(--dark-400)',
              cursor: 'pointer',
              fontWeight: 500,
              userSelect: 'none',
            }}
          >
            错误详情
          </summary>
          <pre
            style={{
              marginTop: 12,
              padding: 12,
              background: 'rgba(0,0,0,0.3)',
              borderRadius: 8,
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
              color: 'var(--accent-red-soft)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              lineHeight: 1.5,
              maxHeight: 200,
              overflow: 'auto',
            }}
          >
            {error.name}: {error.message}
            {'\n\n'}
            {error.stack}
          </pre>
        </details>
      )}
    </div>
  );
}
