import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { setThemePref, resolveTheme } from '../utils/theme';
import { loadApi } from '../utils/lazyData';
import { auth } from '../utils/firebaseApp';

// Top-bar quick switch between dark and light (Settings also offers "System").
export default function ThemeToggle() {
  const [resolved, setResolved] = useState(() => resolveTheme());
  useEffect(() => {
    const sync = () => setResolved(resolveTheme());
    window.addEventListener('vm:theme-changed', sync);
    const mq = window.matchMedia?.('(prefers-color-scheme: light)');
    mq?.addEventListener('change', sync);
    return () => { window.removeEventListener('vm:theme-changed', sync); mq?.removeEventListener('change', sync); };
  }, []);
  const isDark = resolved === 'dark';
  const toggle = () => {
    const next = isDark ? 'light' : 'dark';
    setThemePref(next);
    const uid = auth.currentUser?.uid;
    if (uid) loadApi().then(({ saveUserPrefs }) => saveUserPrefs(uid, { theme: next })).catch(() => {});
  };
  return (
    <button className="menu-toggle theme-toggle" onClick={toggle} aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'} title={isDark ? 'Light theme' : 'Dark theme'}>
      <span key={resolved} className="theme-toggle-icon">{isDark ? <Moon size={17} /> : <Sun size={17} />}</span>
    </button>
  );
}
