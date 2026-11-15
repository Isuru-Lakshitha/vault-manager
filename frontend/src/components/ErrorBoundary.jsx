import React from 'react';
import { AlertTriangle } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    const msg = error?.message || '';
    if (
      msg.includes('MIME type') ||
      msg.includes('dynamically imported module') ||
      msg.includes('Loading chunk') ||
      msg.includes('Importing a module script failed') ||
      msg.includes('Failed to fetch')
    ) {
      const lastReload = parseInt(sessionStorage.getItem('vm_chunk_err_reload') || '0', 10);
      if (Date.now() - lastReload > 8000) {
        sessionStorage.setItem('vm_chunk_err_reload', String(Date.now()));
        if ('caches' in window) {
          caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
        }
        window.location.reload();
      }
    }
  }

  handleReload = async () => {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
    } catch {}
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '60vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '1.5rem',
          padding: '2rem', textAlign: 'center', fontFamily: 'Inter, sans-serif'
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <AlertTriangle size={28} color="#f87171" />
          </div>
          <div>
            <h2 style={{ margin: '0 0 0.5rem', color: 'var(--text-primary)', fontSize: '1.3rem' }}>Something went wrong</h2>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: 400 }}>
              An update was deployed. Click below to load the latest version.
            </p>
            {this.state.error && (
              <pre style={{ marginTop: '1rem', color: '#f87171', fontSize: '0.72rem', textAlign: 'left', background: 'rgba(248,113,113,0.05)', padding: '0.75rem', borderRadius: 8, maxWidth: 480, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {this.state.error.message}
              </pre>
            )}
          </div>
          <button
            onClick={this.handleReload}
            style={{
              padding: '0.75rem 1.5rem', borderRadius: 12,
              background: 'linear-gradient(135deg, #818cf8, #a78bfa)',
              color: 'white', border: 'none', cursor: 'pointer',
              fontFamily: 'Inter, sans-serif', fontSize: '0.9rem', fontWeight: 600,
              transition: 'transform 0.2s, box-shadow 0.2s'
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(129,140,248,0.3)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
