import { createRoot } from 'react-dom/client'
import './styles/index.css'
import App from './App.jsx'
import { installGlobalErrorHandlers } from './utils/errorLogger'

installGlobalErrorHandlers();

// Build stamp: changing this automatically flushes stale service worker caches on client devices
const BUILD_STAMP = '20261115_0920';
try {
  if (localStorage.getItem('vm_build_stamp') !== BUILD_STAMP) {
    localStorage.setItem('vm_build_stamp', BUILD_STAMP);
    if ('caches' in window) {
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).catch(() => {});
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        for (const reg of regs) {
          reg.update().catch(() => {});
        }
      }).catch(() => {});
    }
  }
} catch {}

// Global handler for Vite dynamic chunk load errors when new assets are deployed
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  const lastReload = parseInt(sessionStorage.getItem('vm_last_chunk_reload') || '0', 10);
  if (Date.now() - lastReload > 6000) {
    sessionStorage.setItem('vm_last_chunk_reload', String(Date.now()));
    if ('caches' in window) {
      caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
    }
    window.location.reload();
  }
});

// Auto-reload active tabs when a new service worker takes control (after skipWaiting/clientsClaim)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const lastReload = parseInt(sessionStorage.getItem('vm_sw_controller_reload') || '0', 10);
    if (Date.now() - lastReload > 8000) {
      sessionStorage.setItem('vm_sw_controller_reload', String(Date.now()));
      window.location.reload();
    }
  });
}

// Remove the inline preload spinner once React mounts
const root = document.getElementById('root');
root.innerHTML = '';

createRoot(root).render(<App />)
