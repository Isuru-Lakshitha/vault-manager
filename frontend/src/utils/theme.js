export const applyAccent = (hex) => {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return;
  const root = document.documentElement;
  root.style.setProperty('--cyan', hex);
  root.style.setProperty('--accent', hex);
  root.style.setProperty('--cyan-glow', hex + '1a');
  root.style.setProperty('--border-cyan', hex + '40');
  root.style.setProperty('--accent-glow', hex + '40');
};

/* ---------------------------------------------------------------------------
 * Theme preference: 'dark' (default) | 'light' | 'system'.
 * Stored in localStorage `vm_theme` and synced to user prefs. The resolved
 * theme is applied as `body.light-mode` (dark is the base stylesheet) and
 * mirrored to the browser/PWA chrome via <meta name="theme-color">.
 * ------------------------------------------------------------------------- */
export const THEME_KEY = 'vm_theme';
export const THEME_OPTIONS = ['dark', 'light', 'system'];
const THEME_CHROME = { dark: '#0e1013', light: '#f6f7f9' };

const systemQuery = () =>
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: light)')
    : null;

export const getThemePref = () => {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return THEME_OPTIONS.includes(v) ? v : 'dark';
  } catch {
    return 'dark';
  }
};

export const resolveTheme = (pref = getThemePref()) =>
  pref === 'system' ? (systemQuery()?.matches ? 'light' : 'dark') : pref;

let systemListener = null;

export const applyTheme = (pref = getThemePref()) => {
  if (typeof document === 'undefined') return 'dark';
  const resolved = resolveTheme(pref);
  document.body.classList.toggle('light-mode', resolved === 'light');
  document.documentElement.style.colorScheme = resolved;
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', THEME_CHROME[resolved]));

  // Follow OS changes live only while the preference is 'system'.
  const mq = systemQuery();
  if (mq && systemListener) { mq.removeEventListener('change', systemListener); systemListener = null; }
  if (mq && pref === 'system') {
    systemListener = () => applyTheme('system');
    mq.addEventListener('change', systemListener);
  }
  return resolved;
};

export const setThemePref = (pref) => {
  const next = THEME_OPTIONS.includes(pref) ? pref : 'dark';
  try { localStorage.setItem(THEME_KEY, next); } catch {}
  // Briefly cross-fade colours so the switch feels smooth rather than a flash.
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!reduce) {
    document.body.classList.add('theme-switching');
    clearTimeout(setThemePref._t);
    setThemePref._t = setTimeout(() => document.body.classList.remove('theme-switching'), 350);
  }
  applyTheme(next);
  window.dispatchEvent(new CustomEvent('vm:theme-changed', { detail: next }));
  return next;
};
