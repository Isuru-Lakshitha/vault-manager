import { useCallback, useSyncExternalStore } from 'react';
import { LANGUAGES, MESSAGES } from './messages.js';

/*
 * Tiny i18n: no library, no network. The chosen language is kept in
 * localStorage (and synced to user prefs by Settings); every component using
 * useT() re-renders when it changes. Missing keys fall back to English.
 */
const KEY = 'vm_lang';
const listeners = new Set();

const valid = (code) => LANGUAGES.some((l) => l.code === code);
let current = (() => {
  try { const v = localStorage.getItem(KEY); return valid(v) ? v : 'en'; } catch { return 'en'; }
})();

function applyHtmlLang(code) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = LANGUAGES.find((l) => l.code === code)?.htmlLang || 'en';
  document.documentElement.dataset.lang = code;
}
applyHtmlLang(current);

export function getLang() { return current; }

export function setLang(code) {
  if (!valid(code) || code === current) return;
  current = code;
  try { localStorage.setItem(KEY, code); } catch { /* private mode */ }
  applyHtmlLang(code);
  listeners.forEach((fn) => fn());
}

/** Translate `key` in `lang`, filling {placeholders} from `vars`. */
export function translate(lang, key, vars) {
  const text = MESSAGES[lang]?.[key] ?? MESSAGES.en[key] ?? key;
  return vars ? text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m)) : text;
}

const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function useLang() {
  return useSyncExternalStore(subscribe, getLang, () => 'en');
}

/** const t = useT(); t('nav.dashboard') */
export function useT() {
  const lang = useLang();
  return useCallback((key, vars) => translate(lang, key, vars), [lang]);
}

export { LANGUAGES };
