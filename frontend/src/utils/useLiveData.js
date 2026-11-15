import { useEffect, useRef } from 'react';

/**
 * Re-runs `reload` whenever live data changes (any device / any page) or when the
 * app comes back to the foreground. Calls are debounced so bursts of snapshot
 * events cause a single silent re-render — no loading skeleton flashes.
 */
export default function useLiveData(reload, delay = 120) {
  const ref = useRef(reload);
  ref.current = reload;

  useEffect(() => {
    let timer;
    const trigger = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { try { ref.current?.(); } catch {} }, delay);
    };
    const onVisible = () => { if (document.visibilityState === 'visible') trigger(); };

    window.addEventListener('vm:data-changed', trigger);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('vm:data-changed', trigger);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [delay]);
}
