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
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Error icon — inline SVG, no external dependency */}
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
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent-red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
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
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          重试
        </button>

        <a
          href="/"
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
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          返回首页
        </a>
      </div>

      {/* Error details — collapsible */}
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
