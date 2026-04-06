export default function MarketingLoading() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--mk-bg)',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontFamily: 'var(--mk-font-h)',
          fontSize: '2rem',
          fontWeight: 800,
          color: 'var(--mk-text)',
          marginBottom: '16px',
        }}>
          OP<span style={{ color: 'var(--mk-teal)' }}>AI</span>
        </div>
        <div style={{
          width: '48px',
          height: '2px',
          background: 'var(--mk-teal)',
          margin: '0 auto',
          animation: 'mkPulse 1.5s ease-in-out infinite',
        }} />
      </div>
    </div>
  )
}
